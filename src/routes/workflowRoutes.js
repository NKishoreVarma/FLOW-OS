/**
 * FLOW OS — Workflow Routes
 *
 * REST API surface for the Workflow Engine.
 *
 * POST /api/workflows/pr-review            — Plan + launch a PR review workflow
 * GET  /api/workflows                      — List workflow executions for workspace
 * GET  /api/workflows/:id                  — Get single execution (status + steps)
 * GET  /api/workflows/:id/stream           — SSE stream of live execution events
 *
 * All routes require JWT + workspace-id header (enforced upstream in server.js).
 *
 * The planning step (listing PRs, evaluating safety) runs synchronously before
 * returning 202. Execution runs in the background; clients track progress via
 * WebSocket (WORKFLOW_STARTED, WORKFLOW_STEP_*, WORKFLOW_COMPLETED) or the SSE
 * endpoint for environments where WS is unavailable.
 */

import { Router }                from 'express';
import { buildPRReviewPlan }     from '../workflows/planner/PRReviewPlanner.js';
import {
  launchWorkflow,
  getWorkflowExecution,
  listWorkflowExecutions,
  registerSSEPush,
}                                from '../workflows/WorkflowEngine.js';
import { ValidationError }       from '../core/errors/index.js';

const router = Router();

// Register SSE push function with the engine (breaks circular dependency at module load)
registerSSEPush(pushSSEEvent);

// ── Workspace-id guard ────────────────────────────────────────────────────────
router.use((req, res, next) => {
  const workspaceId = req.headers['workspace-id'] || req.tenantId;
  if (!workspaceId) {
    return res.status(400).json({
      error: { code: 'MISSING_WORKSPACE', message: 'workspace-id header is required' },
    });
  }
  req.workspaceId = workspaceId;
  next();
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/workflows/pr-review
//
// Body:
//   owner                  — GitHub org or user  (required)
//   repo                   — Repository name     (required)
//   slackChannelId         — Slack channel ID    (required)
//   mergeMethod            — squash|merge|rebase (default: squash)
//   minMergeReadinessScore — 0-100               (default: 70)
//   dryRun                 — boolean             (default: false) — plan only, no execution
//
// Response 202:
//   { executionId, status: 'PLANNING', plan: { summary, steps } }
// ─────────────────────────────────────────────────────────────────────────────
router.post('/pr-review', async (req, res, next) => {
  try {
    const {
      owner,
      repo,
      slackChannelId,
      mergeMethod = 'squash',
      minMergeReadinessScore = 70,
      dryRun = false,
    } = req.body;

    if (!owner)          throw new ValidationError('owner is required');
    if (!repo)           throw new ValidationError('repo is required');
    if (!slackChannelId) throw new ValidationError('slackChannelId is required');

    // Build the execution plan (lists PRs, evaluates safety — no side effects)
    const plan = await buildPRReviewPlan({
      workspaceId:            req.workspaceId,
      owner,
      repo,
      slackChannelId,
      mergeMethod,
      minMergeReadinessScore: Number(minMergeReadinessScore),
    });

    if (dryRun) {
      return res.json({
        dryRun:  true,
        plan: {
          summary: plan.summary,
          steps:   plan.steps.map(s => ({ id: s.id, name: s.name, type: s.type, pr: s.pr ?? null })),
        },
      });
    }

    // Launch execution (async — returns immediately)
    const { executionId, status } = await launchWorkflow(plan, {
      workspaceId: req.workspaceId,
      orgId:       req.user?.orgId,
      actor:       req.user,
      orgPlan:     req.govContext?.orgPlan ?? 'free',
    });

    return res.status(202).json({
      executionId,
      status,
      plan: {
        summary: plan.summary,
        steps:   plan.steps.map(s => ({ id: s.id, name: s.name, type: s.type, pr: s.pr ?? null })),
      },
      _links: {
        self:   `/api/workflows/${executionId}`,
        stream: `/api/workflows/${executionId}/stream`,
      },
    });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/workflows — list executions for workspace
// ─────────────────────────────────────────────────────────────────────────────
router.get('/', async (req, res, next) => {
  try {
    const limit  = Math.min(Number(req.query.limit)  || 20, 100);
    const offset = Number(req.query.offset) || 0;
    const executions = await listWorkflowExecutions(req.workspaceId, { limit, offset });
    res.json({ executions, total: executions.length, limit, offset });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/workflows/:id — single execution with steps
// ─────────────────────────────────────────────────────────────────────────────
router.get('/:id', async (req, res, next) => {
  try {
    const execution = await getWorkflowExecution(req.params.id, req.workspaceId);
    if (!execution) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Workflow execution not found' } });
    }
    res.json({ execution });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/workflows/:id/stream — SSE stream for environments without WebSocket
//
// Events match the WebSocket event names:
//   WORKFLOW_STARTED, WORKFLOW_STEP_STARTED, WORKFLOW_STEP_COMPLETED,
//   WORKFLOW_STEP_FAILED, WORKFLOW_STEP_SKIPPED, WORKFLOW_STEP_RETRYING,
//   WORKFLOW_APPROVAL_REQUIRED, WORKFLOW_COMPLETED, WORKFLOW_FAILED
//
// Closes automatically when the workflow reaches a terminal state
// (COMPLETED, FAILED) or after STREAM_TIMEOUT_MS.
// ─────────────────────────────────────────────────────────────────────────────
const STREAM_TIMEOUT_MS  = 10 * 60 * 1000; // 10 minutes
const _sseClients        = new Map();       // executionId → Set<res>

router.get('/:id/stream', async (req, res, next) => {
  try {
    const { id } = req.params;

    // Verify the execution belongs to this workspace before opening the stream
    const execution = await getWorkflowExecution(id, req.workspaceId);
    if (!execution) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Workflow execution not found' } });
    }

    // If already in a terminal state, return the result immediately
    const terminalStatuses = ['COMPLETED', 'FAILED'];
    if (terminalStatuses.includes(execution.status)) {
      res.setHeader('Content-Type', 'application/json');
      return res.json({ execution });
    }

    // SSE handshake
    res.setHeader('Content-Type',  'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection',    'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Nginx: disable buffering
    res.flushHeaders();

    const _send = (event, data) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    // Register client
    if (!_sseClients.has(id)) _sseClients.set(id, new Set());
    _sseClients.get(id).add(_send);

    // Send a heartbeat immediately so the browser knows the connection is live
    _send('connected', { executionId: id, status: execution.status });

    const cleanup = () => {
      _sseClients.get(id)?.delete(_send);
      if (_sseClients.get(id)?.size === 0) _sseClients.delete(id);
      clearTimeout(timer);
    };

    const timer = setTimeout(() => {
      _send('timeout', { executionId: id });
      res.end();
      cleanup();
    }, STREAM_TIMEOUT_MS);

    req.on('close', cleanup);
  } catch (err) {
    next(err);
  }
});

/**
 * Called by WorkflowEngine to push SSE events to connected clients.
 * Imported by WorkflowEngine to decouple the SSE state from the engine.
 */
export function pushSSEEvent(executionId, event, data) {
  const clients = _sseClients.get(executionId);
  if (!clients || clients.size === 0) return;
  for (const send of clients) {
    try { send(event, data); } catch { /* client disconnected */ }
  }
  // Close SSE streams on terminal events
  if (event === 'WORKFLOW_COMPLETED' || event === 'WORKFLOW_FAILED') {
    for (const send of clients) {
      try { send('close', { executionId }); } catch { /* already gone */ }
    }
    _sseClients.delete(executionId);
  }
}

export default router;
