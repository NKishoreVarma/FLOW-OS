/**
 * FLOW OS — Approval Store
 *
 * CRUD for PendingApproval records.
 *
 * Lifecycle transitions (strict — no backward moves):
 *   PENDING → APPROVED → EXECUTED
 *   PENDING → REJECTED
 *   PENDING → EXPIRED  (via expireStaleApprovals cron)
 *
 * Future: multi-stage approval chains, delegated approvals,
 *         notification webhooks per status transition.
 */

import { prisma }              from '../config/prisma.js';
import { NotFoundError, AuthorizationError, ValidationError } from '../errors/index.js';

// Payload fields that must never be stored in payloadRef (security invariant).
const SECRET_PATTERN = /api.?key|token|secret|password|credential|bearer|auth/i;

/**
 * Strip credential-like keys and large text blobs from a payload
 * before persisting it in the approvals table.
 */
function sanitizePayload(payload) {
  if (!payload || typeof payload !== 'object') return {};
  const safe = {};
  for (const [k, v] of Object.entries(payload)) {
    if (SECRET_PATTERN.test(k)) continue;
    if (typeof v === 'string' && v.length > 1000) continue;
    safe[k] = v;
  }
  return safe;
}

// ── Create ────────────────────────────────────────────────────────────────────

/**
 * Persist a new pending approval when the governance engine returns REQUIRE_APPROVAL.
 *
 * @param {object} params
 * @returns {Promise<PendingApproval>}
 */
export async function createPendingApproval({
  orgId,
  workspaceId,
  requesterId,
  connectorId,
  capability,
  actionType,
  payload,
  policyId,
  ttlHours = 48,
}) {
  if (!orgId || !workspaceId || !requesterId || !connectorId || !actionType) {
    throw new ValidationError('orgId, workspaceId, requesterId, connectorId, and actionType are required');
  }

  const expiresAt = ttlHours
    ? new Date(Date.now() + ttlHours * 60 * 60 * 1000)
    : null;

  return prisma.pendingApproval.create({
    data: {
      orgId,
      workspaceId,
      requesterId,
      connectorId,
      capability,
      actionType,
      payloadRef:  sanitizePayload(payload),
      policyId:    policyId ?? null,
      status:      'PENDING',
      expiresAt,
    },
  });
}

/**
 * Phase 14 — create a risk-tiered approval. `requiredApprovals` = 2 for CRITICAL
 * (two-person rule), 1 otherwise. Distinct-approver enforcement happens at vote time.
 */
export async function createTieredApproval({
  orgId,
  workspaceId,
  requesterId,
  connectorId,
  capability,
  actionType,
  payload,
  policyId,
  riskLevel,
  requiredApprovals = 1,
  ttlHours = 48,
}) {
  if (!orgId || !workspaceId || !requesterId || !connectorId || !actionType) {
    throw new ValidationError('orgId, workspaceId, requesterId, connectorId, and actionType are required');
  }
  const expiresAt = ttlHours ? new Date(Date.now() + ttlHours * 60 * 60 * 1000) : null;

  return prisma.pendingApproval.create({
    data: {
      orgId,
      workspaceId,
      requesterId,
      connectorId,
      capability,
      actionType,
      payloadRef:  sanitizePayload(payload),
      policyId:    policyId ?? null,
      status:      'PENDING',
      riskLevel:   riskLevel ?? null,
      requiredApprovals: Math.max(1, requiredApprovals),
      approvalVotes: [],
      expiresAt,
    },
  });
}

/**
 * Phase 14 — cast one approval vote. Enforces:
 *   - only PENDING, non-expired approvals
 *   - the requester can never approve their own request
 *   - each approver counts once (distinct-approver / two-person rule)
 * When the number of distinct votes reaches requiredApprovals the record flips to
 * APPROVED. Returns { approval, satisfied }.
 */
export async function castApprovalVote(id, orgId, approverId) {
  const approval = await getApproval(id, orgId);

  if (approval.status !== 'PENDING') {
    throw new ValidationError(`Cannot approve an approval in status "${approval.status}"`);
  }
  if (isExpired(approval)) {
    await expireOne(id);
    throw new ValidationError('This approval has expired');
  }
  if (approval.requesterId === approverId) {
    throw new AuthorizationError('Self-approval is not permitted');
  }

  const votes = Array.isArray(approval.approvalVotes) ? [...approval.approvalVotes] : [];
  if (votes.some((v) => v.approverId === approverId)) {
    throw new ValidationError('You have already approved this request');
  }
  votes.push({ approverId, at: new Date().toISOString() });

  const required  = approval.requiredApprovals ?? 1;
  const satisfied = votes.length >= required;

  const updated = await prisma.pendingApproval.update({
    where: { id },
    data: {
      approvalVotes: votes,
      status:     satisfied ? 'APPROVED' : 'PENDING',
      approverId: satisfied ? approverId : approval.approverId,
      approvedAt: satisfied ? new Date() : approval.approvedAt,
      updatedAt:  new Date(),
    },
  });
  return { approval: updated, satisfied };
}

// ── Read ──────────────────────────────────────────────────────────────────────

/**
 * Get a single approval, scoped to orgId for tenant isolation.
 */
export async function getApproval(id, orgId) {
  const approval = await prisma.pendingApproval.findFirst({
    where: { id, orgId },
    include: {
      requester: { select: { id: true, email: true, fullName: true } },
      approver:  { select: { id: true, email: true, fullName: true } },
    },
  });
  if (!approval) throw new NotFoundError(`Approval "${id}"`);
  return approval;
}

/**
 * List approvals for a workspace, filterable by status.
 */
export async function listApprovals(orgId, workspaceId, {
  status,
  limit  = 50,
  offset = 0,
} = {}) {
  const where = { orgId, workspaceId };
  if (status) where.status = status;

  const [items, total] = await Promise.all([
    prisma.pendingApproval.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take:    Math.min(limit, 200),
      skip:    offset,
      include: {
        requester: { select: { id: true, email: true, fullName: true } },
        approver:  { select: { id: true, email: true, fullName: true } },
      },
    }),
    prisma.pendingApproval.count({ where }),
  ]);

  return { items, total };
}

// ── Transitions ───────────────────────────────────────────────────────────────

/**
 * Mark an approval as APPROVED. Only PENDING approvals can be approved.
 * The approver must not be the same as the requester (self-approval guard).
 *
 * Returns the updated record. The caller is responsible for executing the action.
 */
export async function approveRequest(id, orgId, approverId) {
  const approval = await getApproval(id, orgId);

  if (approval.status !== 'PENDING') {
    throw new ValidationError(`Cannot approve an approval in status "${approval.status}"`);
  }
  if (isExpired(approval)) {
    await expireOne(id);
    throw new ValidationError('This approval has expired');
  }
  if (approval.requesterId === approverId) {
    throw new AuthorizationError('Self-approval is not permitted');
  }

  return prisma.pendingApproval.update({
    where: { id },
    data: {
      status:     'APPROVED',
      approverId,
      approvedAt: new Date(),
      updatedAt:  new Date(),
    },
  });
}

/**
 * Mark an approval as REJECTED.
 * Approver must not be the requester.
 */
export async function rejectRequest(id, orgId, approverId, rejectionNote) {
  const approval = await getApproval(id, orgId);

  if (approval.status !== 'PENDING') {
    throw new ValidationError(`Cannot reject an approval in status "${approval.status}"`);
  }
  if (approval.requesterId === approverId) {
    throw new AuthorizationError('Self-rejection is not permitted');
  }

  return prisma.pendingApproval.update({
    where: { id },
    data: {
      status:        'REJECTED',
      approverId,
      rejectedAt:    new Date(),
      rejectionNote: rejectionNote ?? null,
      updatedAt:     new Date(),
    },
  });
}

/**
 * Mark an APPROVED approval as EXECUTED once the connector action succeeded.
 * Optionally records the auditLogId that was created for the execution.
 */
export async function markExecuted(id, auditLogId) {
  return prisma.pendingApproval.update({
    where: { id },
    data: {
      status:     'EXECUTED',
      auditLogId: auditLogId ?? null,
      updatedAt:  new Date(),
    },
  });
}

/**
 * Expire all PENDING approvals whose expiresAt is in the past.
 * Called by a periodic job — does not throw on individual failures.
 */
export async function expireStaleApprovals() {
  const result = await prisma.pendingApproval.updateMany({
    where: {
      status:    'PENDING',
      expiresAt: { lt: new Date() },
    },
    data: { status: 'EXPIRED', updatedAt: new Date() },
  });
  return result.count;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function isExpired(approval) {
  return approval.expiresAt && approval.expiresAt < new Date();
}

async function expireOne(id) {
  await prisma.pendingApproval.update({
    where: { id },
    data:  { status: 'EXPIRED', updatedAt: new Date() },
  });
}
