/**
 * FLOW OS — Governance Audit Persistence
 *
 * Writes connector execution records to the PostgreSQL AuditLog table.
 * Sprint 5.3-B additions: workspaceId (indexed column), approvalId, policyId.
 *
 * Security invariants:
 *   - Raw payload content is never written
 *   - Only structural metadata is stored (IDs, types, latency, outcome)
 *   - Audit rows are INSERT-only; no UPDATE or DELETE is performed here
 */

import { prisma } from '../config/prisma.js';

/**
 * Persist a connector action audit record to PostgreSQL.
 *
 * @param {object} params
 * @param {string}  params.orgId
 * @param {string}  [params.userId]
 * @param {string}  params.workspaceId
 * @param {string}  params.connectorId
 * @param {string}  params.capability
 * @param {string}  params.actionType
 * @param {string}  [params.approvedBy]
 * @param {number}  params.latencyMs
 * @param {'success'|'failure'|'denied'|'approval_required'} params.outcome
 * @param {string}  [params.ip]
 * @param {string}  [params.failureReason]
 * @param {string}  [params.approvalId]    — PendingApproval.id when applicable
 * @param {string}  [params.policyId]      — Policy.id that drove the decision
 * @returns {Promise<string|null>}  The created AuditLog id, or null on failure
 */
export async function persistConnectorAudit({
  orgId,
  userId,
  workspaceId,
  connectorId,
  capability,
  actionType,
  approvedBy,
  latencyMs,
  outcome,
  ip,
  failureReason,
  approvalId,
  policyId,
}) {
  try {
    const record = await prisma.auditLog.create({
      data: {
        orgId,
        userId:      userId      ?? null,
        workspaceId: workspaceId ?? null,
        approvalId:  approvalId  ?? null,
        policyId:    policyId    ?? null,
        action:      `connector.${actionType}`,
        resource:    `connector:${connectorId}`,
        ip:          ip          ?? null,
        metadata: {
          connectorId,
          capability,
          actionType,
          approvedBy:    approvedBy    ?? null,
          latencyMs,
          outcome,
          ...(failureReason ? { failureReason } : {}),
        },
      },
      select: { id: true },
    });
    return record.id;
  } catch (err) {
    // Audit failures must never break the execution path.
    console.error('[GovernanceAudit] Failed to persist audit record:', err.message);
    return null;
  }
}
