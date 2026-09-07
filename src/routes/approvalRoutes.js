/**
 * FLOW OS — Approval Lifecycle Routes
 *
 * REST API for the human-in-the-loop approval workflow.
 * All routes require JWT auth + workspace-id header.
 *
 * Route map:
 *   GET  /api/approvals              — list approvals for workspace (ADMIN+)
 *   GET  /api/approvals/history      — past approvals (ADMIN+, all statuses)
 *   GET  /api/approvals/:id          — single approval detail (requester or ADMIN+)
 *   POST /api/approvals/:id/approve  — approve a pending request (ADMIN+ only, not self)
 *   POST /api/approvals/:id/reject   — reject a pending request (ADMIN+ only, not self)
 */

import express from 'express';
import { authorize }          from '../core/middleware/index.js';
import {
  getApproval,
  listApprovals,
  approveRequest,
  rejectRequest,
} from '../core/governance/approvalStore.js';
import { executeAction }      from '../connectors/executionEngine.js';
import { eventBus }           from '../core/events/eventBus.js';
import { ValidationError, NotFoundError } from '../core/errors/index.js';

const router = express.Router();

// Require workspace-id on all routes in this file.
router.use((req, res, next) => {
  if (!req.tenantId) {
    return res.status(400).json({
      error: { code: 'MISSING_WORKSPACE', message: 'workspace-id header is required' },
    });
  }
  next();
});

// ── GET /api/approvals ─────────────────────────────────────────────────────────
router.get('/', authorize('OWNER', 'ADMIN'), async (req, res, next) => {
  try {
    const limit  = Math.min(Number(req.query.limit)  || 50, 200);
    const offset = Math.max(Number(req.query.offset) ||  0, 0);
    const status = req.query.status || 'PENDING';

    const VALID_STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'EXPIRED', 'EXECUTED'];
    if (!VALID_STATUSES.includes(status)) {
      throw new ValidationError(`status must be one of: ${VALID_STATUSES.join(', ')}`);
    }

    const { items, total } = await listApprovals(
      req.user.orgId,
      req.tenantId,
      { status, limit, offset }
    );

    res.json({ approvals: items, total, status, limit, offset });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/approvals/history ─────────────────────────────────────────────────
router.get('/history', authorize('OWNER', 'ADMIN'), async (req, res, next) => {
  try {
    const limit  = Math.min(Number(req.query.limit)  || 50, 200);
    const offset = Math.max(Number(req.query.offset) ||  0, 0);

    const { items, total } = await listApprovals(
      req.user.orgId,
      req.tenantId,
      { limit, offset } // no status filter → all statuses
    );

    res.json({ approvals: items, total, limit, offset });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/approvals/:id ─────────────────────────────────────────────────────
// Accessible by the requester OR any ADMIN/OWNER.
router.get('/:id', async (req, res, next) => {
  try {
    const approval = await getApproval(req.params.id, req.user.orgId);

    const isRequester = approval.requesterId === req.user.id;
    const isAdmin     = ['OWNER', 'ADMIN'].includes(req.user.role);

    if (!isRequester && !isAdmin) {
      return res.status(403).json({
        error: { code: 'FORBIDDEN', message: 'Only the requester or an admin may view this approval' },
      });
    }

    res.json(approval);
  } catch (err) {
    next(err);
  }
});

// ── POST /api/approvals/:id/approve ───────────────────────────────────────────
router.post('/:id/approve', authorize('OWNER', 'ADMIN'), async (req, res, next) => {
  try {
    // 1. Mark as APPROVED in the DB (validates PENDING status + self-approval guard).
    const approval = await approveRequest(req.params.id, req.user.orgId, req.user.id);

    // 2. Re-execute the original action with approvedBy = approver identity.
    //    Payload is re-used from payloadRef (sanitized, no secrets).
    let executionResult = null;
    let executionError  = null;

    try {
      executionResult = await executeAction({
        workspaceId: approval.workspaceId,
        connectorId: approval.connectorId,
        actionType:  approval.actionType,
        payload:     approval.payloadRef ?? {},
        approvedBy:  req.user.email,
        approvalId:  approval.id,
        actor:       req.user,
        orgPlan:     req.govContext?.orgPlan ?? 'free',
      });
    } catch (err) {
      executionError = err.message;
    }

    // 3. Emit resolution event (subscribers notify requester in Sprint 5.3-C).
    eventBus.emit('APPROVAL_RESOLVED', {
      approvalId:  approval.id,
      workspaceId: approval.workspaceId,
      status:      'APPROVED',
      approverId:  req.user.id,
      requesterId: approval.requesterId,
      connectorId: approval.connectorId,
      actionType:  approval.actionType,
    });

    res.json({
      approval,
      execution: executionResult
        ? { success: true,  timelineEvent: executionResult.timelineEvent }
        : { success: false, error: executionError },
    });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/approvals/:id/reject ────────────────────────────────────────────
router.post('/:id/reject', authorize('OWNER', 'ADMIN'), async (req, res, next) => {
  try {
    const { note } = req.body;

    const approval = await rejectRequest(
      req.params.id,
      req.user.orgId,
      req.user.id,
      note
    );

    eventBus.emit('APPROVAL_RESOLVED', {
      approvalId:  approval.id,
      workspaceId: approval.workspaceId,
      status:      'REJECTED',
      approverId:  req.user.id,
      requesterId: approval.requesterId,
      connectorId: approval.connectorId,
      actionType:  approval.actionType,
      note,
    });

    res.json({ approval });
  } catch (err) {
    next(err);
  }
});

export default router;
