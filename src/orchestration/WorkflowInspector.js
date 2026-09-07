/**
 * WorkflowInspector — rich visibility into long-running workflow executions.
 *
 * Aggregates data from:
 *   workflow_executions        — execution status, plan, error
 *   workflow_step_executions   — per-step status, timing, output
 *   workflow_wait_states       — current wait state (if any)
 *   workflow_timers            — scheduled timers + remaining countdown
 *   workflow_compensation_log  — Saga compensation history
 *   workflow_checkpoint_history — checkpoint timeline
 *   workflow_runtime_checkpoints — current live context (variables etc.)
 *
 * The Inspector is read-only. All mutations go through RuntimeEngine.
 */

import { pool }            from '../config/db.js';
import { getHistory }      from './CheckpointHistory.js';
import { getCompensationLog } from './CompensationManager.js';
import { getTimersForExecution } from './TimerManager.js';
import { listWaits }       from './WaitStore.js';

// ── Full detail ───────────────────────────────────────────────────────────────

/**
 * Return a complete snapshot of a workflow execution including all sub-tables.
 */
export async function getExecutionDetail(executionId, workspaceId) {
  const { rows } = await pool.query(
    `SELECT e.*,
            json_agg(s ORDER BY s.started_at ASC NULLS LAST) FILTER (WHERE s.id IS NOT NULL) AS steps
     FROM workflow_executions e
     LEFT JOIN workflow_step_executions s ON s.workflow_id = e.id
     WHERE e.id = $1 AND e.workspace_id = $2
     GROUP BY e.id`,
    [executionId, workspaceId]
  );

  if (!rows[0]) return null;

  const execution = rows[0];

  // Parallel fetch of all sub-tables
  const [waits, timers, compensation, checkpointMeta, liveContext] = await Promise.all([
    listWaits(workspaceId, { executionId }),
    getTimersForExecution(executionId),
    getCompensationLog(executionId, workspaceId),
    _getCheckpointMeta(executionId, workspaceId),
    _getLiveContext(executionId),
  ]);

  // Enrich timers with remaining countdown
  const enrichedTimers = timers.map(t => ({
    ...t,
    remainingMs: t.status === 'PENDING' ? Math.max(0, new Date(t.fire_at) - Date.now()) : null,
  }));

  return {
    ...execution,
    waitState:           waits.find(w => w.status === 'PENDING') ?? null,
    allWaits:            waits,
    timers:              enrichedTimers,
    pendingTimerCount:   enrichedTimers.filter(t => t.status === 'PENDING').length,
    compensation,
    checkpointCount:     checkpointMeta.count,
    lastCheckpointAt:    checkpointMeta.lastSavedAt,
    currentVariables:    liveContext?.variables ?? null,
  };
}

// ── List ──────────────────────────────────────────────────────────────────────

export async function listInstances(workspaceId, {
  status,
  workflowId,
  limit  = 20,
  offset = 0,
} = {}) {
  const conditions = ['e.workspace_id = $1'];
  const params     = [workspaceId];
  let   idx        = 2;

  if (status)     { conditions.push(`e.status = $${idx++}`);      params.push(status); }
  if (workflowId) { conditions.push(`e.workflow_id = $${idx++}`); params.push(workflowId); }

  params.push(Math.min(limit, 100));
  params.push(offset);

  const { rows } = await pool.query(
    `SELECT e.id, e.workspace_id, e.workflow_id, e.workflow_name, e.status,
            e.started_by, e.started_at, e.completed_at, e.error,
            w.wait_type AS current_wait_type,
            w.event_type AS current_wait_event,
            w.resume_after AS wait_resume_after
     FROM workflow_executions e
     LEFT JOIN workflow_wait_states w
       ON w.execution_id = e.id AND w.status = 'PENDING'
     WHERE ${conditions.join(' AND ')}
     ORDER BY e.started_at DESC
     LIMIT $${idx} OFFSET $${idx + 1}`,
    params
  );

  return rows;
}

// ── Checkpoint history ────────────────────────────────────────────────────────

export async function getCheckpointHistory(executionId, workspaceId, opts = {}) {
  return getHistory(executionId, workspaceId, opts);
}

// ── Execution graph ───────────────────────────────────────────────────────────

/**
 * Returns the execution as a DAG of steps with status, timing, and connections.
 * Clients can render this as a flow diagram.
 */
export async function getExecutionGraph(executionId, workspaceId) {
  const { rows: execRows } = await pool.query(
    `SELECT id, workflow_id, plan, status FROM workflow_executions
     WHERE id = $1 AND workspace_id = $2`,
    [executionId, workspaceId]
  );
  if (!execRows[0]) return null;

  const plan  = execRows[0].plan ?? {};
  const steps = plan.steps ?? [];

  const { rows: stepRows } = await pool.query(
    `SELECT step_id, step_name, status, started_at, completed_at, duration_ms, error
     FROM workflow_step_executions WHERE workflow_id = $1 ORDER BY started_at ASC NULLS LAST`,
    [executionId]
  );

  const stepStatusMap = Object.fromEntries(stepRows.map(s => [s.step_id, s]));

  const nodes = steps.map((step, i) => ({
    id:         step.id,
    name:       step.name ?? step.id,
    type:       step.type,
    status:     stepStatusMap[step.id]?.status ?? 'PENDING',
    startedAt:  stepStatusMap[step.id]?.started_at ?? null,
    durationMs: stepStatusMap[step.id]?.duration_ms ?? null,
    error:      stepStatusMap[step.id]?.error ?? null,
    index:      i,
  }));

  const edges = steps.slice(1).map((step, i) => ({
    from: steps[i].id,
    to:   step.id,
  }));

  return { executionId, workflowId: execRows[0].workflow_id, nodes, edges };
}

// ── Wait visibility ───────────────────────────────────────────────────────────

export async function getActiveWaits(workspaceId) {
  return listWaits(workspaceId, { status: 'PENDING' });
}

export async function getWaitReason(executionId, workspaceId) {
  const { rows } = await pool.query(
    `SELECT w.*, e.status AS execution_status
     FROM workflow_wait_states w
     JOIN workflow_executions e ON e.id = w.execution_id
     WHERE w.execution_id = $1 AND e.workspace_id = $2 AND w.status = 'PENDING'
     ORDER BY w.created_at DESC LIMIT 1`,
    [executionId, workspaceId]
  );

  if (!rows[0]) return null;
  const w = rows[0];

  const reason = {
    waitType:    w.wait_type,
    waitId:      w.id,
    stepId:      w.step_id,
    since:       w.created_at,
  };

  if (w.wait_type === 'EVENT' || w.wait_type === 'MULTI_EVENT') {
    reason.waitingFor = w.event_type ?? 'one of multiple events';
    reason.receivedEvents = w.received_events;
    reason.requiredEvents = w.required_events;
  } else if (w.resume_after) {
    reason.resumeAfter   = w.resume_after;
    reason.remainingMs   = Math.max(0, new Date(w.resume_after) - Date.now());
  } else if (w.wait_type === 'CALLBACK') {
    reason.callbackToken = w.callback_token;
    reason.callbackUrl   = `/webhook/workflow-callback/${w.callback_token}`;
  }

  if (w.timeout_at) {
    reason.timeoutAt    = w.timeout_at;
    reason.timeoutInMs  = Math.max(0, new Date(w.timeout_at) - Date.now());
  }

  return reason;
}

// ── Internal helpers ──────────────────────────────────────────────────────────

async function _getCheckpointMeta(executionId, workspaceId) {
  const { rows } = await pool.query(
    `SELECT COUNT(*) AS n, MAX(saved_at) AS last_saved_at
     FROM workflow_checkpoint_history
     WHERE execution_id = $1 AND workspace_id = $2`,
    [executionId, workspaceId]
  );
  return { count: parseInt(rows[0].n, 10), lastSavedAt: rows[0].last_saved_at };
}

async function _getLiveContext(executionId) {
  const { rows } = await pool.query(
    `SELECT context FROM workflow_runtime_checkpoints WHERE execution_id = $1`,
    [executionId]
  );
  return rows[0]?.context ?? null;
}
