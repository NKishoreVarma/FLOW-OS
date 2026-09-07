/**
 * FLOW OS — Execution Engine
 *
 * Single pipeline for every connector action.
 * The Action Center, Recommendation Engine, and all routes call this.
 * No component calls a provider adapter directly.
 *
 * Pipeline (Sprint 5.3-B):
 *   1. Input validation
 *   2. Connector resolution
 *   3. Governance evaluation (DB-first policy check → default matrix fallback)
 *   4. Action support check
 *   5. Credential check
 *   6. Scope validation
 *   7. Adapter execution
 *   8. Audit → PostgreSQL (workspaceId, approvalId, policyId columns)
 *   9. Timeline (in-memory, real-time WS only)
 *  10. Observability counter
 *  11. Event bus emit
 *  12. WebSocket broadcast
 */

import { getConnector }                    from './registry.js';
import { validateScopes, hasCredentials }  from './authManager.js';
import { createTimelineEvent }             from './normalizedTypes.js';
import { broadcastToWorkspace }            from '../services/socketService.js';
import { AppError, ValidationError, AuthorizationError } from '../core/errors/index.js';
import { liveMetrics }                     from '../services/observabilityService.js';
import { evaluateWithPolicies, Effect }    from '../core/governance/index.js';
import { persistConnectorAudit }           from '../core/governance/auditPersistence.js';
import { createPendingApproval, markExecuted } from '../core/governance/approvalStore.js';
import { eventBus }                        from '../core/events/eventBus.js';

// In-memory timeline ring buffer (ephemeral — real-time WS delivery only).
const timeline     = new Map();
const TIMELINE_LIMIT = 200;

function appendTimeline(workspaceId, event) {
  const arr = timeline.get(workspaceId) ?? [];
  arr.unshift(event);
  if (arr.length > TIMELINE_LIMIT) arr.length = TIMELINE_LIMIT;
  timeline.set(workspaceId, arr);
}

// Is this connector authenticated for the workspace? Checks the in-memory
// credential store first, then durable OAuth (GitHub PAT/OAuth, Google tokens),
// so OAuth-connected connectors aren't wrongly blocked from write actions.
async function _isAuthenticated(workspaceId, connectorId) {
  // The governed sandbox needs no external credentials. It is "authenticated" only
  // when sandbox execution is allowed for this workspace (certification, fail-closed)
  // — so sandbox writes can complete there, and nowhere else.
  if (connectorId === 'sandbox') {
    const { sandboxExecutionAllowed } = await import('../config/flowEnv.js');
    return sandboxExecutionAllowed(workspaceId);
  }
  if (hasCredentials(workspaceId, connectorId)) return true;
  try {
    if (connectorId === 'github') {
      const { getAccessToken } = await import('../services/integrations/GitHubOAuthService.js');
      return !!(await getAccessToken(workspaceId));
    }
    if (connectorId === 'gmail' || connectorId === 'google-calendar') {
      const { hasTokens } = await import('../services/google/GoogleTokenManager.js');
      return await hasTokens(workspaceId);
    }
  } catch { /* not connected */ }
  return false;
}

/**
 * Execute a connector action through the full governance-aware pipeline.
 *
 * @param {object} params
 * @param {string} params.workspaceId
 * @param {string} params.connectorId
 * @param {string} params.actionType
 * @param {object} [params.payload]
 * @param {string} [params.approvedBy]   — required for roles/actions needing approval
 * @param {string} [params.approvalId]   — set when re-executing an APPROVED PendingApproval
 * @param {object} [params.actor]        — req.user from JWT
 * @param {string} [params.orgPlan]      — from req.govContext.orgPlan
 * @returns {Promise<{ result: object, timelineEvent: object }>}
 */
export async function executeAction({
  workspaceId,
  connectorId,
  actionType,
  payload    = {},
  approvedBy,
  approvalId,
  actor      = {},
  orgPlan    = 'free',
}) {
  const startMs = Date.now();

  // ── 1. Input validation ──────────────────────────────────────────────────────
  if (!workspaceId) throw new ValidationError('workspaceId is required');
  if (!connectorId) throw new ValidationError('connectorId is required');
  if (!actionType)  throw new ValidationError('actionType is required');

  // ── 2. Connector resolution ──────────────────────────────────────────────────
  const adapter = getConnector(connectorId);

  // ── 3. Governance evaluation (DB-first) ───────────────────────────────────────
  const { effect, reason, policyId } = await evaluateWithPolicies({
    orgId:       actor.orgId,
    workspaceId,
    userId:      actor.id,
    role:        actor.role    ?? 'VIEWER',
    actionType,
    capability:  adapter.capability,
    connectorId,
    orgPlan,
    approvedBy,
  });

  if (effect === Effect.DENY) {
    await persistConnectorAudit({
      orgId:         actor.orgId,
      userId:        actor.id,
      workspaceId,
      connectorId,
      capability:    adapter.capability,
      actionType,
      approvedBy,
      latencyMs:     Date.now() - startMs,
      outcome:       'denied',
      failureReason: reason,
      policyId,
    });
    eventBus.emit('CONNECTOR_ACTION_DENIED', {
      workspaceId, connectorId, actionType, role: actor.role, reason, policyId,
    });
    throw new AuthorizationError(reason);
  }

  if (effect === Effect.REQUIRE_APPROVAL) {
    // Create a persistent approval record that an ADMIN/OWNER can action.
    let pendingApproval = null;
    try {
      pendingApproval = await createPendingApproval({
        orgId:       actor.orgId,
        workspaceId,
        requesterId: actor.id,
        connectorId,
        capability:  adapter.capability,
        actionType,
        payload,
        policyId,
      });
    } catch (err) {
      console.error('[ExecutionEngine] Failed to create pending approval:', err.message);
    }

    const pendingId = pendingApproval?.id ?? null;

    await persistConnectorAudit({
      orgId:         actor.orgId,
      userId:        actor.id,
      workspaceId,
      connectorId,
      capability:    adapter.capability,
      actionType,
      latencyMs:     Date.now() - startMs,
      outcome:       'approval_required',
      failureReason: reason,
      approvalId:    pendingId,
      policyId,
    });
    eventBus.emit('CONNECTOR_APPROVAL_REQUIRED', {
      workspaceId, connectorId, actionType, role: actor.role, reason, policyId,
      approvalId: pendingId,
    });

    // 403 with APPROVAL_REQUIRED code + approvalId so clients can route to approval UI.
    throw new AppError(reason, 403, 'APPROVAL_REQUIRED', { approvalId: pendingId });
  }

  // effect === Effect.ALLOW — proceed

  // ── 4. Action support check ───────────────────────────────────────────────────
  if (!adapter.supports(actionType)) {
    throw new AppError(
      `Connector "${connectorId}" does not support action "${actionType}"`,
      501,
      'CAPABILITY_NOT_SUPPORTED'
    );
  }

  const SIDE_EFFECTFUL = ['send', 'create', 'update', 'delete', 'execute', 'approve', 'reject'];

  // ── 4b. Simulated-connector guard (TRUST INVARIANT) ───────────────────────────
  // Preview adapters (Jira / Notion / HubSpot / Workday) operate on in-memory data
  // and would otherwise return a FABRICATED success (a made-up issue key / page id)
  // for a write that never reached a real system. FLOW is an OS — it must never claim
  // something happened when it did not. Refuse the write honestly instead.
  if (SIDE_EFFECTFUL.includes(actionType) && adapter.simulated) {
    throw new AppError(
      `The ${connectorId} connector is in preview — real ${actionType} isn't wired to a live ${connectorId} account yet, so FLOW won't report a success that didn't happen. Connect a live ${connectorId} integration to enable this action.`,
      501,
      'CONNECTOR_SIMULATED',
    );
  }

  // ── 5. Credential check ───────────────────────────────────────────────────────
  // Recognizes both the in-memory credential store AND durable OAuth connections
  // (GitHub / Google) — otherwise OAuth-connected connectors are wrongly treated
  // as unauthenticated for writes even though reads work.
  if (SIDE_EFFECTFUL.includes(actionType) && !(await _isAuthenticated(workspaceId, connectorId))) {
    throw new AuthorizationError(
      `Connector "${connectorId}" is not authenticated for workspace "${workspaceId}". ` +
      'Complete OAuth or provide an API key before executing write actions.'
    );
  }

  // ── 6. Scope validation ───────────────────────────────────────────────────────
  // Only meaningful for connectors whose scopes live in the in-memory authManager
  // (API-key connectors). OAuth-backed connectors (gmail / google-calendar / github)
  // keep their granted scopes in the durable OAuth store — validating them against the
  // in-memory store wrongly reports "missing scopes" for a fully-authorized account.
  const OAUTH_BACKED = new Set(['gmail', 'google-calendar', 'github']);
  if (adapter.scopes?.length && !OAUTH_BACKED.has(connectorId) && hasCredentials(workspaceId, connectorId)) {
    const { valid, missing } = validateScopes(workspaceId, connectorId, adapter.scopes);
    if (!valid) {
      throw new AuthorizationError(
        `Connector "${connectorId}" is missing required OAuth scopes: ${missing.join(', ')}`
      );
    }
  }

  // ── 7. Execute via adapter ────────────────────────────────────────────────────
  let result;
  try {
    const raw = await adapter.execute(workspaceId, actionType, payload, approvedBy);
    // Phase 9: a REAL provider execution is wrapped in the standardized LIVE receipt
    // envelope (external:true, verified:false until read-back). SANDBOX results already
    // carry their own honest labels and are returned unchanged — the two can never be
    // confused. `verified` NEVER becomes true here (only post-execution verification sets it).
    const SIDE_EFFECT = ['send', 'create', 'update', 'delete', 'execute', 'approve', 'reject'];
    if (SIDE_EFFECT.includes(actionType) && !(raw && raw.executionMode === 'SANDBOX')) {
      const { buildLiveReceipt } = await import('../execution/writeSafety.js');
      result = buildLiveReceipt({ connectorId, actionType, rawResult: raw, workspaceId, approvalId });
    } else {
      result = raw;
    }
  } catch (err) {
    const latencyMs = Date.now() - startMs;
    await persistConnectorAudit({
      orgId:         actor.orgId,
      userId:        actor.id,
      workspaceId,
      connectorId,
      capability:    adapter.capability,
      actionType,
      approvedBy,
      latencyMs,
      outcome:       'failure',
      failureReason: err.message,
      approvalId,
      policyId,
    });
    if (err.isOperational) throw err;
    // Auth failures (expired/revoked OAuth, invalid_grant, 401/403) are NOT server
    // errors — surface them as a clean "reconnect" 401 so the UI shows an honest
    // "reconnect X" message instead of "something went wrong on our end".
    if (/invalid_grant|invalid_token|token has been expired|token has been revoked|unauthorized|401|403|reconnect|CONNECTOR_AUTH/i.test(err.message || '')) {
      throw new AppError(
        `${connectorId} needs to be reconnected — its access has expired.`,
        401,
        'CONNECTOR_AUTH_EXPIRED',
      );
    }
    throw new AppError(`Connector "${connectorId}" execution failed: ${err.message}`, 500);
  }

  const latencyMs = Date.now() - startMs;

  // ── 8. Audit → PostgreSQL ─────────────────────────────────────────────────────
  const auditLogId = await persistConnectorAudit({
    orgId:      actor.orgId,
    userId:     actor.id,
    workspaceId,
    connectorId,
    capability: adapter.capability,
    actionType,
    approvedBy,
    latencyMs,
    outcome:    'success',
    approvalId,
    policyId,
  });

  // If this was an approval-gated execution, mark the PendingApproval as EXECUTED.
  if (approvalId && auditLogId) {
    markExecuted(approvalId, auditLogId).catch(err =>
      console.error('[ExecutionEngine] Failed to mark approval as EXECUTED:', err.message)
    );
  }

  // ── 9. Timeline (in-memory, real-time WS only) ────────────────────────────────
  const timelineEvent = createTimelineEvent({
    workspaceId,
    connectorId,
    capability:  adapter.capability,
    actionType,
    actor:       approvedBy || actor?.email || 'system',
    target:      payload?.id || payload?.to || payload?.threadId || null,
    summary:     buildSummary(connectorId, actionType, payload, result),
    metadata: {
      latencyMs,
      approvedBy: approvedBy || null,
      actorId:    actor?.id  || null,
      approvalId: approvalId || null,
      policyId:   policyId   || null,
      orgPlan,
    },
  });

  appendTimeline(workspaceId, timelineEvent);

  // ── 10. Observability ─────────────────────────────────────────────────────────
  liveMetrics.totalIngestions = (liveMetrics.totalIngestions || 0) + 1;

  // ── 11. Event bus ─────────────────────────────────────────────────────────────
  eventBus.emit('CONNECTOR_ACTION_EXECUTED', {
    workspaceId,
    connectorId,
    capability:  adapter.capability,
    actionType,
    actor:       approvedBy || actor?.email || 'system',
    latencyMs,
    policyId,
    approvalId:  approvalId || null,
  });

  // ── 12. WebSocket broadcast ───────────────────────────────────────────────────
  broadcastToWorkspace(workspaceId, 'ACTION_EXECUTED', {
    connectorId,
    capability:  adapter.capability,
    actionType,
    actor:       approvedBy || actor?.email || 'system',
    summary:     timelineEvent.summary,
    timestamp:   timelineEvent.timestamp,
    latencyMs,
  });

  return { result, timelineEvent };
}

/**
 * In-memory timeline for a workspace (real-time WS; ephemeral).
 */
export function getTimeline(workspaceId, { limit = 50 } = {}) {
  return (timeline.get(workspaceId) ?? []).slice(0, limit);
}

/**
 * Durable audit log from PostgreSQL.
 * Uses the dedicated workspaceId column added in Sprint 5.3-B.
 */
export async function getAuditLog(workspaceId, {
  limit       = 50,
  connectorId,
  actionType,
  orgId,
} = {}) {
  const { prisma } = await import('../core/config/prisma.js');

  const where = {};
  if (orgId)        where.orgId       = orgId;
  if (workspaceId)  where.workspaceId = workspaceId;
  if (connectorId)  where.resource    = `connector:${connectorId}`;
  if (actionType)   where.action      = `connector.${actionType}`;

  return prisma.auditLog.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take:    Math.min(limit, 500),
    select: {
      id:          true,
      orgId:       true,
      userId:      true,
      workspaceId: true,
      approvalId:  true,
      policyId:    true,
      action:      true,
      resource:    true,
      metadata:    true,
      ip:          true,
      createdAt:   true,
    },
  });
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildSummary(connectorId, actionType, payload, result) {
  const name = connectorId.charAt(0).toUpperCase() + connectorId.slice(1);
  switch (actionType) {
    case 'send':    return `${name}: message sent to ${payload?.to || 'recipient'}`;
    case 'create':  return `${name}: created "${payload?.title || 'item'}"`;
    case 'update':  return `${name}: updated "${payload?.title || payload?.id || 'item'}"`;
    case 'delete':  return `${name}: deleted item ${payload?.id || ''}`;
    case 'approve': return `${name}: approved "${payload?.title || payload?.id || 'item'}"`;
    case 'reject':  return `${name}: rejected "${payload?.title || payload?.id || 'item'}"`;
    case 'execute': return `${name}: executed ${payload?.action || 'action'}`;
    case 'sync':    return `${name}: synced ${result?.synced ?? '?'} items`;
    default:        return `${name}: ${actionType}`;
  }
}
