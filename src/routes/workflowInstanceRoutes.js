/**
 * Workflow Instance Routes — Phase 9 Long-Running Workflow Orchestration.
 *
 * All routes require JWT authentication + workspace-id header (enforced by
 * the global authenticate + tenantIsolation middleware in server.js).
 *
 * Mounted at: /api/workflow-instances
 *
 * External callback endpoint (no auth — secured by callback token):
 *   POST /webhook/workflow-callback/:token
 */

import { Router }       from 'express';
import { AppError }     from '../core/errors/index.js';
import {
  getExecutionDetail,
  listInstances,
  getCheckpointHistory,
  getExecutionGraph,
  getWaitReason,
} from '../orchestration/WorkflowInspector.js';
import {
  handleCallback,
  cancelAllWaits,
} from '../orchestration/WaitCoordinator.js';
import {
  cancelExecution,
  resumeAfterApproval,
} from '../runtime/RuntimeEngine.js';
import {
  startExecution,
  listWorkflowExecutions,
} from '../runtime/index.js';

const router = Router();

// ── List instances ─────────────────────────────────────────────────────────────

/**
 * GET /api/workflow-instances
 * Query params: status, workflowId, limit, offset
 */
router.get('/', async (req, res, next) => {
  try {
    const workspaceId = req.headers['workspace-id'];
    if (!workspaceId) throw new AppError('workspace-id header required', 400, 'MISSING_WORKSPACE');

    const { status, workflowId, limit = '20', offset = '0' } = req.query;
    const instances = await listInstances(workspaceId, {
      status,
      workflowId,
      limit:  parseInt(limit,  10),
      offset: parseInt(offset, 10),
    });

    res.json({ instances, count: instances.length });
  } catch (err) { next(err); }
});

// ── Get single instance ────────────────────────────────────────────────────────

/**
 * GET /api/workflow-instances/:id
 */
router.get('/:id', async (req, res, next) => {
  try {
    const workspaceId = req.headers['workspace-id'];
    if (!workspaceId) throw new AppError('workspace-id header required', 400, 'MISSING_WORKSPACE');

    const detail = await getExecutionDetail(req.params.id, workspaceId);
    if (!detail) throw new AppError('Execution not found', 404, 'NOT_FOUND');

    res.json(detail);
  } catch (err) { next(err); }
});

// ── Resume a waiting/paused execution ─────────────────────────────────────────

/**
 * POST /api/workflow-instances/:id/resume
 * Body: { resolvedWith? } — optional data to inject into the execution context
 */
router.post('/:id/resume', async (req, res, next) => {
  try {
    const workspaceId = req.headers['workspace-id'];
    if (!workspaceId) throw new AppError('workspace-id header required', 400, 'MISSING_WORKSPACE');

    const { resolvedWith } = req.body ?? {};

    if (resolvedWith !== undefined) {
      // Phase 9 resume from wait
      const { resumeFromWait } = await import('../runtime/RuntimeEngine.js');
      await resumeFromWait(req.params.id, workspaceId, resolvedWith ?? {});
    } else {
      // Legacy resume after approval (backward compatible)
      const engineCtx = {
        workspaceId,
        orgId:   req.tenantId ?? null,
        actor:   { id: req.user?.id, email: req.user?.email },
        orgPlan: req.workspace?.org?.plan ?? 'free',
      };
      await resumeAfterApproval(req.params.id, workspaceId, engineCtx);
    }

    res.json({ status: 'resumed', executionId: req.params.id });
  } catch (err) { next(err); }
});

// ── Cancel an execution ────────────────────────────────────────────────────────

/**
 * POST /api/workflow-instances/:id/cancel
 * Cancels the execution and runs saga compensation if any registered steps.
 */
router.post('/:id/cancel', async (req, res, next) => {
  try {
    const workspaceId = req.headers['workspace-id'];
    if (!workspaceId) throw new AppError('workspace-id header required', 400, 'MISSING_WORKSPACE');

    // Cancel all pending waits first
    try { await cancelAllWaits(req.params.id); } catch { /* best effort */ }

    // Run saga compensation
    try {
      const { runCompensation } = await import('../orchestration/CompensationManager.js');
      const engineCtx = {
        workspaceId,
        orgId:   req.tenantId ?? null,
        actor:   { id: req.user?.id, email: req.user?.email },
        orgPlan: req.workspace?.org?.plan ?? 'free',
      };
      await runCompensation(req.params.id, workspaceId, engineCtx);
    } catch { /* best effort */ }

    await cancelExecution(req.params.id, workspaceId);
    res.json({ status: 'cancelled', executionId: req.params.id });
  } catch (err) { next(err); }
});

// ── Retry a failed execution ───────────────────────────────────────────────────

/**
 * POST /api/workflow-instances/:id/retry
 * Loads the original plan and params from the DB and starts a new execution.
 */
router.post('/:id/retry', async (req, res, next) => {
  try {
    const workspaceId = req.headers['workspace-id'];
    if (!workspaceId) throw new AppError('workspace-id header required', 400, 'MISSING_WORKSPACE');

    const { pool } = await import('../config/db.js');
    const { rows } = await pool.query(
      `SELECT workflow_id, plan, started_by FROM workflow_executions
       WHERE id = $1 AND workspace_id = $2`,
      [req.params.id, workspaceId]
    );
    if (!rows[0]) throw new AppError('Execution not found', 404, 'NOT_FOUND');

    const { workflow_id, plan, started_by } = rows[0];
    const engineCtx = {
      workspaceId,
      orgId:   req.tenantId ?? null,
      actor:   { id: req.user?.id ?? started_by, email: req.user?.email ?? started_by },
      orgPlan: req.workspace?.org?.plan ?? 'free',
    };

    const { startExecutionWithPlan } = await import('../runtime/RuntimeEngine.js');
    const result = await startExecutionWithPlan(plan, engineCtx);

    res.json({ status: 'retried', ...result, originalExecutionId: req.params.id });
  } catch (err) { next(err); }
});

// ── Checkpoint history ─────────────────────────────────────────────────────────

/**
 * GET /api/workflow-instances/:id/checkpoints
 * Query params: limit
 */
router.get('/:id/checkpoints', async (req, res, next) => {
  try {
    const workspaceId = req.headers['workspace-id'];
    if (!workspaceId) throw new AppError('workspace-id header required', 400, 'MISSING_WORKSPACE');

    const limit = parseInt(req.query.limit ?? '100', 10);
    const history = await getCheckpointHistory(req.params.id, workspaceId, { limit });
    res.json({ checkpoints: history, count: history.length });
  } catch (err) { next(err); }
});

// ── Execution graph ────────────────────────────────────────────────────────────

/**
 * GET /api/workflow-instances/:id/graph
 */
router.get('/:id/graph', async (req, res, next) => {
  try {
    const workspaceId = req.headers['workspace-id'];
    if (!workspaceId) throw new AppError('workspace-id header required', 400, 'MISSING_WORKSPACE');

    const graph = await getExecutionGraph(req.params.id, workspaceId);
    if (!graph) throw new AppError('Execution not found', 404, 'NOT_FOUND');

    res.json(graph);
  } catch (err) { next(err); }
});

// ── Wait reason ────────────────────────────────────────────────────────────────

/**
 * GET /api/workflow-instances/:id/wait-reason
 * Returns why the execution is currently paused (event type, timer, callback URL, etc.)
 */
router.get('/:id/wait-reason', async (req, res, next) => {
  try {
    const workspaceId = req.headers['workspace-id'];
    if (!workspaceId) throw new AppError('workspace-id header required', 400, 'MISSING_WORKSPACE');

    const reason = await getWaitReason(req.params.id, workspaceId);
    res.json({ waitReason: reason });
  } catch (err) { next(err); }
});

export { router as workflowInstanceRouter };

// ── External callback (public — secured by token) ─────────────────────────────

export const callbackRouter = Router();

/**
 * POST /webhook/workflow-callback/:token
 * No JWT required — the token IS the authentication.
 */
callbackRouter.post('/:token', async (req, res, next) => {
  try {
    const result = await handleCallback(req.params.token, req.body ?? {});
    res.json({ status: 'accepted', ...result });
  } catch (err) {
    if (err.status === 404) {
      res.status(404).json({ error: 'No pending workflow callback for this token' });
    } else {
      next(err);
    }
  }
});
