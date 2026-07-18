/**
 * FLOW OS — Approval Engine (Phase 14)
 *
 * Maps a risk level to an approval gate and manages the tiered approval lifecycle
 * ON TOP of the existing governance layer. It never replaces governance — the
 * Execution Engine still runs `evaluateWithPolicies()` and a governance DENY always
 * wins. This engine only decides *how many / whose* human approvals a
 * permitted-but-risky action needs before it may execute.
 *
 *   LOW      → AUTO      (execute immediately)
 *   MEDIUM   → CONFIRM   (the requesting user confirms in FLOW)
 *   HIGH     → APPROVAL  (1 × ADMIN/OWNER)
 *   CRITICAL → APPROVAL  (2 × distinct ADMIN/OWNER — two-person rule)
 */

import { RiskLevel } from './riskClassifier.js';
import {
  createTieredApproval,
  castApprovalVote,
  getApproval,
  rejectRequest,
} from '../core/governance/approvalStore.js';

export const Gate = Object.freeze({
  AUTO:     'AUTO',
  CONFIRM:  'CONFIRM',
  APPROVAL: 'APPROVAL',
});

/** Approvers must hold one of these workspace roles. */
export const APPROVER_ROLES = Object.freeze(['ADMIN', 'OWNER']);

export function requiredApprovalsFor(level) {
  return level === RiskLevel.CRITICAL ? 2 : 1;
}

/**
 * Decide the gate for a risk level.
 * @returns {{ gate: string, requiredApprovals: number, reason: string }}
 */
export function decideGate(level) {
  switch (level) {
    case RiskLevel.LOW:
      return { gate: Gate.AUTO, requiredApprovals: 0, reason: 'Low risk — executes automatically.' };
    case RiskLevel.MEDIUM:
      return { gate: Gate.CONFIRM, requiredApprovals: 0, reason: 'Medium risk — the requester confirms in FLOW.' };
    case RiskLevel.HIGH:
      return { gate: Gate.APPROVAL, requiredApprovals: 1, reason: 'High risk — one ADMIN/OWNER must approve.' };
    case RiskLevel.CRITICAL:
      return { gate: Gate.APPROVAL, requiredApprovals: 2, reason: 'Critical risk — two distinct ADMIN/OWNER must approve.' };
    default:
      return { gate: Gate.CONFIRM, requiredApprovals: 0, reason: 'Unclassified — the requester confirms in FLOW.' };
  }
}

export function isApprover(role) {
  return APPROVER_ROLES.includes(String(role || '').toUpperCase());
}

/**
 * Open a tiered approval request for a risky action.
 * @returns the created PendingApproval
 */
export async function openApproval({ actor, workspaceId, connectorId, capability, actionType, payload, riskLevel, policyId }) {
  return createTieredApproval({
    orgId:       actor.orgId,
    workspaceId,
    requesterId: actor.id,
    connectorId,
    capability,
    actionType,
    payload,
    policyId,
    riskLevel,
    requiredApprovals: requiredApprovalsFor(riskLevel),
  });
}

/**
 * Record one approver's vote. Enforces approver role, distinct approvers, and the
 * self-approval guard (in the store). Returns { approval, satisfied }.
 */
export async function vote(approvalId, orgId, approver) {
  if (!isApprover(approver.role)) {
    const err = new Error('Only ADMIN or OWNER can approve operational actions');
    err.statusCode = 403;
    throw err;
  }
  return castApprovalVote(approvalId, orgId, approver.id);
}

export async function reject(approvalId, orgId, approver, note) {
  if (!isApprover(approver.role)) {
    const err = new Error('Only ADMIN or OWNER can reject operational actions');
    err.statusCode = 403;
    throw err;
  }
  return rejectRequest(approvalId, orgId, approver.id, note);
}

/** How many more distinct approvals are still needed. */
export function remainingApprovals(approval) {
  const votes = Array.isArray(approval.approvalVotes) ? approval.approvalVotes.length : 0;
  return Math.max(0, (approval.requiredApprovals ?? 1) - votes);
}

export { getApproval };
export default { Gate, decideGate, requiredApprovalsFor, isApprover, openApproval, vote, reject, remainingApprovals };
