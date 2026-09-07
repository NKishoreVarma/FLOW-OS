/**
 * FLOW OS — Operational Execution Engine Routes (Phase 14)
 *
 * REST surface for planning and safely executing operational actions. All routes
 * require JWT auth + workspace-id header. Every side-effect flows through the
 * Execution Coordinator → governed `executeAction()`; governance is never bypassed.
 *
 *   POST /api/execution/plan                      dry-run preview (risk + gate, no execution)
 *   POST /api/execution/execute                   run a plan under its risk gates
 *   GET  /api/execution/history                   list execution records
 *   GET  /api/execution/record/:id                one execution record
 *   POST /api/execution/approvals/:id/vote        cast a distinct approval vote (ADMIN/OWNER)
 *   POST /api/execution/approvals/:id/reject      reject a pending approval (ADMIN/OWNER)
 */

import express from 'express';
import { buildPlan }        from '../execution/actionPlanner.js';
import { dryRun }           from '../execution/executionPlanner.js';
import { executePlan, executeApproved } from '../execution/executionCoordinator.js';
import { vote, reject, remainingApprovals } from '../execution/approvalEngine.js';
import { listExecutionRecords, getExecutionRecord } from '../execution/executionHistory.js';
import { getApproval } from '../core/governance/approvalStore.js';
import { ValidationError } from '../core/errors/index.js';

const router = express.Router();

router.use((req, res, next) => {
  if (!req.tenantId) {
    return res.status(400).json({ error: { code: 'MISSING_WORKSPACE', message: 'workspace-id header is required' } });
  }
  next();
});

function actorOf(req) {
  return {
    id:          req.user?.id,
    role:        req.workspaceRole || req.govContext?.role || req.user?.role || 'VIEWER',
    orgId:       req.user?.orgId,
    workspaceId: req.tenantId,
  };
}
const planOf = (req) => req.govContext?.plan || req.workspace?.org?.plan || 'free';

// ── POST /api/execution/plan — preview only, never executes ────────────────────
router.post('/plan', (req, res, next) => {
  try {
    const plan = buildPlan(req.body.recommendation || req.body);
    if (!plan.steps.length) throw new ValidationError('No executable steps found in the recommendation');
    res.json({ plan, preview: dryRun(req.tenantId, plan) });
  } catch (err) { next(err); }
});

// ── POST /api/execution/execute — run under risk gates ─────────────────────────
router.post('/execute', async (req, res, next) => {
  try {
    const plan = buildPlan(req.body.recommendation || req.body.plan || req.body);
    if (!plan.steps.length) throw new ValidationError('No executable steps found');
    const outcome = await executePlan(req.tenantId, plan, actorOf(req), {
      confirmed: req.body.confirmed === true,
      orgPlan:   planOf(req),
    });
    res.json(outcome);
  } catch (err) { next(err); }
});

// ── GET /api/execution/history ─────────────────────────────────────────────────
router.get('/history', async (req, res, next) => {
  try {
    const limit  = Math.min(Number(req.query.limit) || 50, 200);
    const records = await listExecutionRecords(req.tenantId, { limit, status: req.query.status });
    res.json({ records, total: records.length });
  } catch (err) { next(err); }
});

// ── GET /api/execution/record/:id ──────────────────────────────────────────────
router.get('/record/:id', async (req, res, next) => {
  try {
    const record = await getExecutionRecord(req.params.id, req.tenantId);
    if (!record) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Execution record not found' } });
    res.json({ record });
  } catch (err) { next(err); }
});

// ── POST /api/execution/approvals/:id/vote ─────────────────────────────────────
router.post('/approvals/:id/vote', async (req, res, next) => {
  try {
    const actor = actorOf(req);
    const { approval, satisfied } = await vote(req.params.id, actor.orgId, actor);

    if (!satisfied) {
      return res.json({
        status: 'PENDING',
        approvalId: approval.id,
        remaining: remainingApprovals(approval),
        message: `Vote recorded. ${remainingApprovals(approval)} more approval(s) required.`,
      });
    }
    // All required distinct votes cast → execute the approved action now.
    const result = await executeApproved(approval.id, actor, { orgPlan: planOf(req) });
    res.json({ status: 'APPROVED_AND_EXECUTED', approvalId: approval.id, execution: result });
  } catch (err) {
    if (err.statusCode) return res.status(err.statusCode).json({ error: { code: 'APPROVAL_ERROR', message: err.message } });
    next(err);
  }
});

// ── POST /api/execution/approvals/:id/reject ───────────────────────────────────
router.post('/approvals/:id/reject', async (req, res, next) => {
  try {
    const actor = actorOf(req);
    const approval = await reject(req.params.id, actor.orgId, actor, req.body.note);
    res.json({ status: 'REJECTED', approval });
  } catch (err) {
    if (err.statusCode) return res.status(err.statusCode).json({ error: { code: 'APPROVAL_ERROR', message: err.message } });
    next(err);
  }
});

// ── GET /api/execution/approvals/:id — detail (tier + votes) ───────────────────
router.get('/approvals/:id', async (req, res, next) => {
  try {
    const approval = await getApproval(req.params.id, req.user.orgId);
    res.json({ approval, remaining: remainingApprovals(approval) });
  } catch (err) { next(err); }
});

export default router;
