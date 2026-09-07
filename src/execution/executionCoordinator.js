/**
 * FLOW OS — Execution Coordinator (Phase 14)
 *
 * The orchestration heart. For each step it: classifies risk → resolves the
 * approval gate → (auto | confirm | approval) → runs the action through the
 * existing governed `executeAction()` pipeline → records durable execution history.
 *
 * Invariants (do not regress):
 *   - Every side-effect still flows through `executeAction()` — governance runs and a
 *     governance DENY always wins. We NEVER pass approvedBy to bypass a role rule; the
 *     risk tier layers on top of governance, it does not replace it.
 *   - Two-person (CRITICAL) approval is enforced by the Approval Engine (distinct votes).
 *   - Steps are fault-isolated; a failed required step halts the remaining plan.
 */

import { executeAction } from '../connectors/executionEngine.js';
import { getConnector }   from '../connectors/registry.js';
import { classifyAction } from './riskClassifier.js';
import { decideGate, Gate, openApproval, requiredApprovalsFor } from './approvalEngine.js';
import { createExecutionRecord, updateExecutionRecord, markRecordExecuted, markRecordFailed } from './executionHistory.js';
import { getApproval } from '../core/governance/approvalStore.js';
import { markExecuted as markApprovalExecuted } from '../core/governance/approvalStore.js';
import { publish, publishFields } from '../events/index.js';
import { prisma } from '../core/config/prisma.js';
import { idempotencyKey, verifyApprovalBinding, payloadHash } from './writeSafety.js';

// A completed action's importance for memory equals its governed risk tier. This is
// what lets HIGH/CRITICAL completions (incl. governed SANDBOX executions) propagate
// to durable memory through the existing priority-gated memory subscriber, while
// routine LOW/MEDIUM actions stay out of long-term memory. Uniform for all providers.
const RISK_TO_PRIORITY = { LOW: 'low', MEDIUM: 'medium', HIGH: 'high', CRITICAL: 'critical' };

function capabilityOf(connector) {
  try { return getConnector(connector).capability; } catch { return 'unknown'; }
}

// Fill in context the risk classifier needs but the caller may not have provided.
// For a GitHub PR merge, fetch the PR's target branch so merging into a protected
// or default branch (main/master) escalates to CRITICAL (two-person) — not HIGH.
async function _enrichStepContext(workspaceId, step) {
  const p = step?.payload || {};
  const isMerge = String(step?.connector).toLowerCase() === 'github'
    && (p.mergeMethod || p.merge_method)
    && p.number && p.owner && p.repo && !p.base;
  if (!isMerge) return;
  try {
    const gh = getConnector('github');
    const prs = await gh.read(workspaceId, { resourceType: 'pulls', owner: p.owner, repo: p.repo, number: p.number });
    const pr = Array.isArray(prs) ? prs[0] : prs;
    const baseBranch = pr?.metadata?.baseBranch || pr?.base?.ref || null;
    if (baseBranch) { p.base = baseBranch; step.payload = p; }
  } catch { /* best-effort — classifier falls back to HIGH for merges */ }
}

/**
 * Execute one step under its risk gate.
 * @returns one of:
 *   { status:'EXECUTED', record, result }
 *   { status:'FAILED', record, error }
 *   { status:'CONFIRM_REQUIRED', risk, reason }
 *   { status:'APPROVAL_REQUIRED', approvalId, requiredApprovals, risk, record }
 *   { status:'DENIED', error }
 */
export async function runStep(workspaceId, step, actor, { confirmed = false, orgPlan = 'free', planId = null } = {}) {
  // Enrich the step with context needed to classify risk correctly (e.g. a PR
  // merge needs its target branch so a merge into main/master escalates to CRITICAL).
  await _enrichStepContext(workspaceId, step);
  const { level, reasons } = classifyAction(step);
  const gate = decideGate(level);

  // MEDIUM: the requesting user must confirm in FLOW first.
  if (gate.gate === Gate.CONFIRM && !confirmed) {
    return { status: 'CONFIRM_REQUIRED', risk: level, reason: gate.reason, riskReasons: reasons, step };
  }

  // HIGH / CRITICAL: open a tiered approval and stop here.
  if (gate.gate === Gate.APPROVAL) {
    const approval = await openApproval({
      actor, workspaceId, connectorId: step.connector, capability: capabilityOf(step.connector),
      actionType: step.actionType, payload: step.payload, riskLevel: level,
    });
    const record = await createExecutionRecord({
      orgId: actor.orgId, workspaceId, planId, requestedById: actor.id,
      connector: step.connector, actionType: step.actionType, riskLevel: level,
      status: 'PENDING', approvalId: approval.id, summary: step.title,
    });
    await publish('execution', 'EXECUTION_APPROVAL_REQUIRED', {
      workspaceId, approvalId: approval.id, connector: step.connector, actionType: step.actionType,
      riskLevel: level, requiredApprovals: requiredApprovalsFor(level), requestedBy: actor.id, title: step.title,
    }, { workspaceId, organizationId: actor.orgId });

    return { status: 'APPROVAL_REQUIRED', approvalId: approval.id, requiredApprovals: requiredApprovalsFor(level), risk: level, record };
  }

  // LOW (auto) or MEDIUM (confirmed): execute now through the governed pipeline.
  return _execute(workspaceId, step, actor, { orgPlan, riskLevel: level, planId });
}

/** Run all steps of a plan, fault-isolated; halt on the first failed/blocked step. */
export async function executePlan(workspaceId, plan, actor, opts = {}) {
  const results = [];
  for (const step of plan.steps || []) {
    const r = await runStep(workspaceId, step, actor, { ...opts, planId: plan.id });
    results.push({ step, ...r });
    if (r.status !== 'EXECUTED') break; // stop on confirm/approval/failure — human must act
  }
  return { planId: plan.id, results, completed: results.every((r) => r.status === 'EXECUTED') };
}

/**
 * Execute an action whose approval has been satisfied. Verifies the approval is
 * APPROVED (all required distinct votes cast) before running it with approvedBy set.
 */
export async function executeApproved(approvalId, actor, { orgPlan = 'free', overridePayload = undefined } = {}) {
  const approval = await getApproval(approvalId, actor.orgId);
  if (approval.status !== 'APPROVED') {
    const err = new Error(`Approval is not APPROVED (status: ${approval.status})`);
    err.statusCode = 409;
    throw err;
  }
  // Phase 9 — APPROVAL PAYLOAD BINDING (hard invariant). The action executes with the EXACT
  // payload the approver approved (approval.payloadRef). If a caller supplies a different
  // payload (bound field changed), the approval is INVALIDATED — a new approval is required.
  const approvedPayload = approval.payloadRef || {};
  if (overridePayload !== undefined) {
    const bind = verifyApprovalBinding(approvedPayload, overridePayload);
    if (!bind.ok) {
      const err = new Error(`Approval invalidated — the ${bind.changed.join(', ')} changed after approval. A new approval is required.`);
      err.statusCode = 409; err.code = 'APPROVAL_PAYLOAD_MISMATCH';
      throw err;
    }
  }
  const step = {
    connector: approval.connectorId,
    actionType: approval.actionType,
    payload: approvedPayload,                 // always the approved payload — never a caller override
    title: `${approval.connectorId}: ${approval.actionType}`,
  };
  const approverIds = (approval.approvalVotes || []).map((v) => v.approverId);
  const res = await _execute(actor.workspaceId || approval.workspaceId, step, actor, {
    orgPlan, riskLevel: approval.riskLevel || 'HIGH', approvedBy: approval.approverId || approverIds[0],
    approvalId, approverIds,
  });
  if (res.status === 'EXECUTED') {
    await markApprovalExecuted(approvalId, res.result?.auditLogId ?? null);
  }
  return res;
}

// ── Internal: run through the governed executeAction pipeline + record history ──
async function _execute(workspaceId, step, actor, { orgPlan, riskLevel, approvedBy, approvalId, approverIds = [], planId = null }) {
  const startMs = Date.now();

  // Phase 9 — IDEMPOTENCY: the same approved step must produce at most ONE external side
  // effect. Key = identity (workspace,connector,action,approval) + payload content (not a
  // timestamp). If a prior EXECUTED record with this key exists, return it — no re-execute.
  const idemKey = idempotencyKey({ workspaceId, connectorId: step.connector, actionType: step.actionType, approvalId, payload: step.payload });
  const prior = await prisma.executionRecord.findFirst({
    where: { workspaceId, idempotencyKey: idemKey, status: 'EXECUTED' },
    orderBy: { createdAt: 'desc' },
  }).catch(() => null);
  if (prior) {
    return { status: 'EXECUTED', record: prior, result: prior.result, idempotent: true };
  }

  const record = await createExecutionRecord({
    orgId: actor.orgId, workspaceId, planId, requestedById: actor.id,
    connector: step.connector, actionType: step.actionType, riskLevel,
    status: approvalId ? 'APPROVED' : 'PENDING', approvalId, summary: step.title,
  });
  // Persist the idempotency key on the record so a concurrent/retry attempt dedupes.
  await prisma.executionRecord.update({ where: { id: record.id }, data: { idempotencyKey: idemKey } }).catch(() => {});

  try {
    const result = await executeAction({
      workspaceId,
      connectorId: step.connector,
      actionType: step.actionType,
      payload: step.payload,
      approvedBy,
      approvalId,
      actor: { id: actor.id, role: actor.role, orgId: actor.orgId },
      orgPlan,
    });

    const durationMs = Date.now() - startMs;
    const updated = await markRecordExecuted(record.id, {
      executedById: actor.id, approverIds, result: safeResult(result),
      durationMs, auditLogId: result?.auditLogId ?? null,
    });

    // The adapter receipt (executeAction returns { result, timelineEvent }). Carry its
    // provenance onto the completion event so the event — and the memory derived from
    // it — honestly records HOW it was executed (LIVE provider vs governed SANDBOX).
    const receipt = result?.result || {};
    const isSandbox = receipt.executionMode === 'SANDBOX';

    // Publish the completion through the existing event platform. Priority is the
    // action's risk tier, preserved via publishFields (which bypasses type-based
    // re-scoring) so the priority-gated memory subscriber persists HIGH/CRITICAL
    // completions. sourceEventId = the execution record id → memory→execution link.
    await publishFields({
      workspaceId,
      organizationId: actor.orgId,
      source:   'execution',
      type:     'automation',
      priority: RISK_TO_PRIORITY[riskLevel] || 'medium',
      title:    step.title || `${step.connector}: ${step.actionType} executed`,
      summary:  `${isSandbox ? '[SANDBOX] ' : ''}${receipt.summary || `${step.actionType} completed via ${step.connector}`}`,
      actors:   [{ type: 'SYSTEM', id: 'flow', name: 'FLOW' }],
      entities: [],
      severity: riskLevel === 'CRITICAL' ? 0.9 : riskLevel === 'HIGH' ? 0.7 : 0.4,
      businessImpact: 0.5,
      sourceEventId: record.id,
      metadata: {
        rawType:       'EXECUTION_COMPLETED',
        executionId:   record.id,
        connector:     step.connector,
        actionType:    step.actionType,
        riskLevel,
        executedBy:    actor.id,
        durationMs,
        // provenance — where this event/memory originated
        executionMode: receipt.executionMode || 'LIVE',
        provider:      receipt.provider || step.connector,
        receiptType:   receipt.receiptType || 'PROVIDER',
        receiptId:     receipt.receiptId || null,
        external:      receipt.external ?? true,
        origin:        'execution-engine',
      },
    });

    return { status: 'EXECUTED', record: updated, result };
  } catch (err) {
    const durationMs = Date.now() - startMs;

    // Governance independently required approval → surface it, don't mark failed.
    if (err.code === 'APPROVAL_REQUIRED') {
      await updateExecutionRecord(record.id, { status: 'PENDING', approvalId: err.details?.approvalId ?? null });
      return { status: 'APPROVAL_REQUIRED', approvalId: err.details?.approvalId ?? null, risk: riskLevel, record, governance: true };
    }
    if (err.name === 'AuthorizationError' || err.statusCode === 403) {
      await updateExecutionRecord(record.id, { status: 'DENIED', result: { error: err.message } });
      return { status: 'DENIED', record, error: err.message };
    }

    await markRecordFailed(record.id, { result: { error: err.message }, durationMs });
    return { status: 'FAILED', record, error: err.message };
  }
}

function safeResult(result) {
  try { return JSON.parse(JSON.stringify(result ?? {})); } catch { return {}; }
}

export default { runStep, executePlan, executeApproved };
