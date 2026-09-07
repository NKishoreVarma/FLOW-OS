/**
 * Universal Workflow Runtime — REST API
 *
 * GET  /api/workflow-definitions              — list all registered definitions
 * GET  /api/workflow-definitions/:id          — single definition
 * POST /api/workflow-executions               — generic workflow launch
 * GET  /api/workflow-executions               — list executions for workspace
 * GET  /api/workflow-executions/:id           — single execution with steps
 * POST /api/workflow-executions/:id/pause     — pause a running execution
 * POST /api/workflow-executions/:id/resume    — resume a paused execution
 * POST /api/workflow-executions/:id/cancel    — cancel a running execution
 * GET  /api/workflow-executions/:id/stream    — SSE stream of live events
 *
 * All routes require JWT + workspace-id header (enforced upstream by server.js middleware).
 * The POST /api/workflow-executions endpoint accepts { workflowId, params } and delegates
 * to the registered planner + RuntimeEngine — no workflow-specific logic here.
 *
 * Example:
 *   POST /api/workflow-executions
 *   { "workflowId": "pr-review", "params": { "owner": "acme", "repo": "backend", "slackChannelId": "C04X" } }
 */

import { Router }          from 'express';
import { ValidationError } from '../core/errors/index.js';
import {
  startExecution          as _startExecution,
  pauseExecution          as _pauseExecution,
  resumeExecution         as _resumeExecution,
  cancelExecution         as _cancelExecution,
  getWorkflowExecution    as _getExecution,
  listWorkflowExecutions  as _listExecutions,
  registerSSEPush         as _registerSSE,
  buildExecutionPlan,
} from '../runtime/index.js';
import { listDefinitions, loadDefinition } from '../runtime/WorkflowLoader.js';

const router = Router();

// Register SSE push with the RuntimeEngine (breaks circular dep; done once at module load)
_registerSSE(pushSSEEvent);

// ── Workspace guard ───────────────────────────────────────────────────────────
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

// ── Definitions ───────────────────────────────────────────────────────────────

router.get('/definitions', (req, res) => {
  res.json({ definitions: listDefinitions() });
});

router.get('/definitions/:id', (req, res) => {
  try {
    res.json({ definition: loadDefinition(req.params.id) });
  } catch (err) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: err.message } });
  }
});

// ── Launch ────────────────────────────────────────────────────────────────────

/**
 * POST /api/workflow-executions
 *
 * Body: { workflowId: string, params: object, dryRun?: boolean }
 *
 * dryRun=true  → build the plan and return it without executing (200)
 * dryRun=false → launch async, return 202 with executionId
 */
router.post('/', async (req, res, next) => {
  try {
    const { workflowId, params = {}, dryRun = false } = req.body;

    if (!workflowId) throw new ValidationError('workflowId is required');

    const definition = loadDefinition(workflowId); // throws if not found

    const ctx = {
      workspaceId: req.workspaceId,
      orgId:       req.user?.orgId,
      actor:       req.user,
      orgPlan:     req.govContext?.orgPlan ?? 'free',
    };

    if (dryRun) {
      const plan = await buildExecutionPlan(workflowId, params, ctx);
      return res.json({
        dryRun: true,
        workflowId,
        definition: { id: definition.id, name: definition.name, version: definition.version },
        plan: {
          summary: plan.summary,
          steps:   plan.steps.map(s => ({
            id:          s.id,
            name:        s.name,
            type:        s.type,
            connectorId: s.connectorId ?? null,
            actionType:  s.actionType  ?? null,
            critical:    s.critical    ?? true,
            reasons:     s.reasons     ?? undefined,
          })),
        },
      });
    }

    const { executionId, status } = await _startExecution(workflowId, params, ctx);

    return res.status(202).json({
      executionId,
      status,
      workflowId,
      _links: {
        self:   `/api/workflow-executions/${executionId}`,
        stream: `/api/workflow-executions/${executionId}/stream`,
        pause:  `/api/workflow-executions/${executionId}/pause`,
        cancel: `/api/workflow-executions/${executionId}/cancel`,
      },
    });
  } catch (err) {
    next(err);
  }
});

// ── List executions ───────────────────────────────────────────────────────────

router.get('/', async (req, res, next) => {
  try {
    const limit  = Math.min(Number(req.query.limit)  || 20, 100);
    const offset = Number(req.query.offset) || 0;
    const executions = await _listExecutions(req.workspaceId, { limit, offset });
    res.json({ executions, total: executions.length, limit, offset });
  } catch (err) {
    next(err);
  }
});

// ── Single execution ──────────────────────────────────────────────────────────

router.get('/:id', async (req, res, next) => {
  try {
    const execution = await _getExecution(req.params.id, req.workspaceId);
    if (!execution) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Workflow execution not found' } });
    }
    res.json({ execution });
  } catch (err) {
    next(err);
  }
});

// ── Control ───────────────────────────────────────────────────────────────────

router.post('/:id/pause', async (req, res, next) => {
  try {
    await _pauseExecution(req.params.id, req.workspaceId);
    res.json({ executionId: req.params.id, status: 'PAUSED' });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/resume', async (req, res, next) => {
  try {
    const ctx = {
      workspaceId: req.workspaceId,
      orgId:       req.user?.orgId,
      actor:       req.user,
      orgPlan:     req.govContext?.orgPlan ?? 'free',
    };
    await _resumeExecution(req.params.id, req.workspaceId, ctx);
    res.json({ executionId: req.params.id, status: 'RUNNING' });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/cancel', async (req, res, next) => {
  try {
    await _cancelExecution(req.params.id, req.workspaceId);
    res.json({ executionId: req.params.id, status: 'CANCELLED' });
  } catch (err) {
    next(err);
  }
});

// ── SSE stream ────────────────────────────────────────────────────────────────

const STREAM_TIMEOUT_MS = 10 * 60 * 1000; // 10 min
const _sseClients       = new Map();       // executionId → Set<sendFn>

router.get('/:id/stream', async (req, res, next) => {
  try {
    const { id } = req.params;
    const execution = await _getExecution(id, req.workspaceId);
    if (!execution) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Execution not found' } });
    }

    // Already terminal — return immediately as JSON
    if (['COMPLETED','FAILED','CANCELLED'].includes(execution.status)) {
      res.setHeader('Content-Type', 'application/json');
      return res.json({ execution });
    }

    res.setHeader('Content-Type',      'text/event-stream');
    res.setHeader('Cache-Control',     'no-cache');
    res.setHeader('Connection',        'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

    if (!_sseClients.has(id)) _sseClients.set(id, new Set());
    _sseClients.get(id).add(send);

    send('connected', { executionId: id, status: execution.status });

    const cleanup = () => {
      clearTimeout(timer);
      _sseClients.get(id)?.delete(send);
      if (_sseClients.get(id)?.size === 0) _sseClients.delete(id);
    };

    const timer = setTimeout(() => {
      send('timeout', { executionId: id });
      res.end();
      cleanup();
    }, STREAM_TIMEOUT_MS);

    req.on('close', cleanup);
  } catch (err) {
    next(err);
  }
});

/**
 * Called by RuntimeEngine to push events to SSE clients.
 * Registered via _registerSSE above.
 */
export function pushSSEEvent(executionId, event, data) {
  const clients = _sseClients.get(executionId);
  if (!clients?.size) return;
  for (const send of clients) {
    try { send(event, data); } catch { /* client gone */ }
  }
  if (event === 'WORKFLOW_COMPLETED' || event === 'WORKFLOW_FAILED' || event === 'WORKFLOW_CANCELLED') {
    for (const send of clients) {
      try { send('close', { executionId }); } catch { /* already gone */ }
    }
    _sseClients.delete(executionId);
  }
}

export default router;
