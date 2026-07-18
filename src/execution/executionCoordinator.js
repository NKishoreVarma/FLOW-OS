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
import { publish } from '../events/index.js';

function capabilityOf(connector) {
  try { return getConnector(connector).capability; } catch { return 'unknown'; }
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
export async function executeApproved(approvalId, actor, { orgPlan = 'free' } = {}) {
  const approval = await getApproval(approvalId, actor.orgId);
  if (approval.status !== 'APPROVED') {
    const err = new Error(`Approval is not APPROVED (status: ${approval.status})`);
    err.statusCode = 409;
    throw err;
  }
  const step = {
    connector: approval.connectorId,
    actionType: approval.actionType,
    payload: approval.payloadRef || {},
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
  const record = await createExecutionRecord({
    orgId: actor.orgId, workspaceId, planId, requestedById: actor.id,
    connector: step.connector, actionType: step.actionType, riskLevel,
    status: approvalId ? 'APPROVED' : 'PENDING', approvalId, summary: step.title,
  });

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
    await publish('execution', 'EXECUTION_COMPLETED', {
      workspaceId, connector: step.connector, actionType: step.actionType, riskLevel,
      executionId: record.id, executedBy: actor.id, durationMs, title: step.title,
    }, { workspaceId, organizationId: actor.orgId });

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
