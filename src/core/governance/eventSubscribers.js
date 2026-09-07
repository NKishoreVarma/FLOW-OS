/**
 * FLOW OS — Governance Event Subscribers
 *
 * Subscribes to internal eventBus events emitted by the Execution Engine
 * and Approval Store. Each subscriber is independent — one failing does
 * not affect others.
 *
 * Sprint 5.3-B subscribers: in-memory analytics counters + structured logging.
 *
 * Extension points (Sprint 5.3-C and beyond):
 *   - CONNECTOR_ACTION_EXECUTED → memory consolidation (update workspace knowledge graph)
 *   - CONNECTOR_APPROVAL_REQUIRED → email/Slack notification to ADMIN/OWNER
 *   - APPROVAL_RESOLVED → notify requester of decision
 *   - CONNECTOR_ACTION_DENIED → security alerting / audit dashboard push
 *
 * Design rule: subscribers MUST NOT call executeAction() or any write path.
 *              They are read-side observers only.
 */

import { eventBus }           from '../events/eventBus.js';

// ── In-memory analytics (ephemeral, process-scoped) ───────────────────────────
// Sprint 5.3-C will persist these to PostgreSQL for dashboards.
const connectorMetrics = new Map(); // workspaceId → { executed, denied, approvalRequired }

function getMetrics(workspaceId) {
  if (!connectorMetrics.has(workspaceId)) {
    connectorMetrics.set(workspaceId, { executed: 0, denied: 0, approvalRequired: 0 });
  }
  return connectorMetrics.get(workspaceId);
}

export function getConnectorMetrics(workspaceId) {
  return getMetrics(workspaceId);
}

export function getAllConnectorMetrics() {
  return Object.fromEntries(connectorMetrics);
}

// ── Subscribers ───────────────────────────────────────────────────────────────

function handleActionExecuted(payload) {
  const { workspaceId, connectorId, actionType } = payload;
  getMetrics(workspaceId).executed++;
  if (!workspaceId) return;
  // Publish to the unified Event Platform (non-blocking).
  import('../../events/index.js')
    .then(({ publish }) => publish('connector_action', actionType || 'action_executed', {
      actionType, connectorId, userId: payload.userId, auditId: payload.auditId,
      title:   `${actionType || 'Action'} via ${connectorId || 'connector'}`,
      summary: payload.result?.message || '',
      ...payload,
    }, { workspaceId, metadata: { origin: 'connector' } }))
    .catch(() => {});
}

function handleActionDenied({ workspaceId, connectorId, actionType, role, reason }) {
  getMetrics(workspaceId).denied++;
  // Sprint 5.3-C: security alert pipeline, dashboard anomaly detection
}

function handleApprovalRequired({ workspaceId, connectorId, actionType, role, reason }) {
  getMetrics(workspaceId).approvalRequired++;
  // Sprint 5.3-C: email/Slack notification → ADMIN/OWNER of the workspace
  // Template: "Action required: {role} requested {actionType} on {connectorId} in {workspaceId}"
}

function handleApprovalResolved({ workspaceId, approvalId, status, approverId, requesterId }) {
  // Sprint 5.3-C: notify requester, update workspace activity feed
  // For APPROVED: trigger re-execution notification
  // For REJECTED: send rejection note to requester
}

// ── Init ──────────────────────────────────────────────────────────────────────

let initialized = false;

/**
 * Wire all governance subscribers to the event bus.
 * Idempotent — safe to call multiple times (only registers once).
 */
export function initGovernanceSubscribers() {
  if (initialized) return;
  initialized = true;

  eventBus.on('CONNECTOR_ACTION_EXECUTED',   handleActionExecuted);
  eventBus.on('CONNECTOR_ACTION_DENIED',     handleActionDenied);
  eventBus.on('CONNECTOR_APPROVAL_REQUIRED', handleApprovalRequired);
  eventBus.on('APPROVAL_RESOLVED',           handleApprovalResolved);

  console.log('🔐 [Governance] Event subscribers initialized');
}
