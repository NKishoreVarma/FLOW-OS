/**
 * Workflow State Manager
 *
 * Persists workflow_executions and workflow_step_executions to PostgreSQL.
 * Also maintains an in-memory snapshot for real-time WS reads without DB round-trips.
 *
 * State machine:
 *   PLANNING → RUNNING → COMPLETED
 *                      → FAILED
 *                      → WAITING_APPROVAL  (paused at a step needing approval)
 */

import { pool } from '../config/db.js';

// In-memory snapshot: executionId → state object (supplements DB for real-time reads)
const _snapshots = new Map();

// ── Create ────────────────────────────────────────────────────────────────────

export async function createExecution({ workspaceId, orgId, workflowId, workflowName, plan, startedBy }) {
  const { rows } = await pool.query(
    `INSERT INTO workflow_executions
       (workspace_id, org_id, workflow_id, workflow_name, status, plan, started_by)
     VALUES ($1, $2, $3, $4, 'PLANNING', $5, $6)
     RETURNING id, started_at`,
    [workspaceId, orgId ?? null, workflowId, workflowName, JSON.stringify(plan), startedBy ?? null]
  );

  const execution = {
    id:           rows[0].id,
    workspaceId,
    workflowId,
    workflowName,
    status:       'PLANNING',
    plan,
    startedBy,
    startedAt:    rows[0].started_at,
    steps:        [],
    results:      null,
    error:        null,
  };

  _snapshots.set(execution.id, execution);
  return execution;
}

// ── Status transitions ────────────────────────────────────────────────────────

export async function markRunning(executionId) {
  await pool.query(
    `UPDATE workflow_executions SET status = 'RUNNING' WHERE id = $1`,
    [executionId]
  );
  const snap = _snapshots.get(executionId);
  if (snap) snap.status = 'RUNNING';
}

export async function markCompleted(executionId, results) {
  await pool.query(
    `UPDATE workflow_executions
     SET status = 'COMPLETED', results = $2, completed_at = NOW()
     WHERE id = $1`,
    [executionId, JSON.stringify(results)]
  );
  const snap = _snapshots.get(executionId);
  if (snap) { snap.status = 'COMPLETED'; snap.results = results; }
}

export async function markFailed(executionId, error) {
  const msg = error instanceof Error ? error.message : String(error);
  await pool.query(
    `UPDATE workflow_executions
     SET status = 'FAILED', error = $2, completed_at = NOW()
     WHERE id = $1`,
    [executionId, msg]
  );
  const snap = _snapshots.get(executionId);
  if (snap) { snap.status = 'FAILED'; snap.error = msg; }
}

export async function markWaitingApproval(executionId, approvalId) {
  await pool.query(
    `UPDATE workflow_executions
     SET status = 'WAITING_APPROVAL', approval_id = $2
     WHERE id = $1`,
    [executionId, approvalId]
  );
  const snap = _snapshots.get(executionId);
  if (snap) { snap.status = 'WAITING_APPROVAL'; snap.approvalId = approvalId; }
}

export async function markCancelled(executionId) {
  await pool.query(
    `UPDATE workflow_executions
     SET status = 'CANCELLED', completed_at = NOW()
     WHERE id = $1`,
    [executionId]
  );
  const snap = _snapshots.get(executionId);
  if (snap) snap.status = 'CANCELLED';
}

export async function markPaused(executionId) {
  await pool.query(
    `UPDATE workflow_executions SET status = 'PAUSED' WHERE id = $1`,
    [executionId]
  );
  const snap = _snapshots.get(executionId);
  if (snap) snap.status = 'PAUSED';
}

export async function markRunningFromPaused(executionId) {
  await pool.query(
    `UPDATE workflow_executions SET status = 'RUNNING' WHERE id = $1`,
    [executionId]
  );
  const snap = _snapshots.get(executionId);
  if (snap) snap.status = 'RUNNING';
}

// These three are all forms of "workflow paused waiting for an external signal".
// The specific reason is recorded in the runtime checkpoint, not in the status column.
export const markWaitingEvent    = (id) => markPaused(id);
export const markWaitingTimer    = (id) => markPaused(id);
export const markWaitingCallback = (id) => markPaused(id);

// ── Step tracking ─────────────────────────────────────────────────────────────

export async function recordStepStart(executionId, stepId, stepName, input) {
  const { rows } = await pool.query(
    `INSERT INTO workflow_step_executions
       (workflow_id, step_id, step_name, status, input, started_at)
     VALUES ($1, $2, $3, 'RUNNING', $4, NOW())
     RETURNING id`,
    [executionId, stepId, stepName, JSON.stringify(input)]
  );
  const recordId = rows[0].id;

  const snap = _snapshots.get(executionId);
  if (snap) {
    snap.steps.push({ recordId, stepId, stepName, status: 'RUNNING', startedAt: new Date() });
  }

  return recordId;
}

export async function recordStepComplete(recordId, executionId, stepId, output, durationMs) {
  await pool.query(
    `UPDATE workflow_step_executions
     SET status = 'COMPLETED', output = $2, duration_ms = $3, completed_at = NOW()
     WHERE id = $1`,
    [recordId, JSON.stringify(output), durationMs]
  );
  const snap = _snapshots.get(executionId);
  if (snap) {
    const step = snap.steps.find(s => s.recordId === recordId);
    if (step) { step.status = 'COMPLETED'; step.output = output; step.durationMs = durationMs; }
  }
}

export async function recordStepFailed(recordId, executionId, error, durationMs) {
  const msg = error instanceof Error ? error.message : String(error);
  await pool.query(
    `UPDATE workflow_step_executions
     SET status = 'FAILED', error = $2, duration_ms = $3, completed_at = NOW()
     WHERE id = $1`,
    [recordId, msg, durationMs]
  );
  const snap = _snapshots.get(executionId);
  if (snap) {
    const step = snap.steps.find(s => s.recordId === recordId);
    if (step) { step.status = 'FAILED'; step.error = msg; }
  }
}

export async function recordStepSkipped(executionId, stepId, stepName, reason) {
  await pool.query(
    `INSERT INTO workflow_step_executions
       (workflow_id, step_id, step_name, status, input, completed_at, duration_ms)
     VALUES ($1, $2, $3, 'SKIPPED', $4, NOW(), 0)`,
    [executionId, stepId, stepName, JSON.stringify({ reason })]
  );
  const snap = _snapshots.get(executionId);
  if (snap) {
    snap.steps.push({ stepId, stepName, status: 'SKIPPED', reason });
  }
}

// ── Read ──────────────────────────────────────────────────────────────────────

export function getSnapshot(executionId) {
  return _snapshots.get(executionId) ?? null;
}

export async function getExecution(executionId, workspaceId) {
  const { rows } = await pool.query(
    `SELECT e.*, json_agg(s ORDER BY s.started_at ASC NULLS LAST) AS steps
     FROM workflow_executions e
     LEFT JOIN workflow_step_executions s ON s.workflow_id = e.id
     WHERE e.id = $1 AND e.workspace_id = $2
     GROUP BY e.id`,
    [executionId, workspaceId]
  );
  return rows[0] ?? null;
}

export async function listExecutions(workspaceId, { limit = 20, offset = 0 } = {}) {
  const { rows } = await pool.query(
    `SELECT id, workflow_id, workflow_name, status, started_by, started_at, completed_at, error
     FROM workflow_executions
     WHERE workspace_id = $1
     ORDER BY started_at DESC
     LIMIT $2 OFFSET $3`,
    [workspaceId, Math.min(limit, 100), offset]
  );
  return rows;
}
