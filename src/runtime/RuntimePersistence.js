/**
 * Runtime checkpoint persistence.
 *
 * After each step the RuntimeEngine writes the full RuntimeContext as JSONB
 * to workflow_runtime_checkpoints. On server restart, recoverStaleExecutions()
 * loads checkpoints for any execution that was RUNNING or PLANNING when the
 * process died, reconstructs runtimeCtx, and re-queues the workflow from where
 * it stopped. Already-completed steps are detected from workflow_step_executions
 * (status = 'COMPLETED' or 'SKIPPED') and skipped on resume.
 *
 * Table: workflow_runtime_checkpoints — created in migrate-workflow-runtime-v6.sql
 */

import { pool } from '../config/db.js';
import { deserializeContext, serializeContext } from './RuntimeContext.js';

// ── Checkpoint read/write ─────────────────────────────────────────────────────

export async function saveCheckpoint(executionId, runtimeCtx) {
  const serialized = serializeContext(runtimeCtx);
  await pool.query(
    `INSERT INTO workflow_runtime_checkpoints (execution_id, context, saved_at)
     VALUES ($1, $2::jsonb, NOW())
     ON CONFLICT (execution_id)
     DO UPDATE SET context = $2::jsonb, saved_at = NOW()`,
    [executionId, JSON.stringify(serialized)]
  );

  // Append to immutable checkpoint history (Phase 9 — non-fatal)
  try {
    const { append } = await import('../orchestration/CheckpointHistory.js');
    await append(executionId, runtimeCtx.workspaceId, runtimeCtx);
  } catch { /* never interrupt the main execution */ }
}

export async function loadCheckpoint(executionId) {
  const { rows } = await pool.query(
    `SELECT context FROM workflow_runtime_checkpoints WHERE execution_id = $1`,
    [executionId]
  );
  if (rows.length === 0) return null;
  return deserializeContext(rows[0].context);
}

export async function deleteCheckpoint(executionId) {
  await pool.query(
    `DELETE FROM workflow_runtime_checkpoints WHERE execution_id = $1`,
    [executionId]
  );
}

// ── Recovery ──────────────────────────────────────────────────────────────────

/**
 * Find all workflow executions that were RUNNING or PLANNING at the time the
 * server last stopped. Called once at boot by startWorkflowRuntime().
 *
 * Only returns executions that started more than 60 seconds ago
 * (avoids racing with any other instance that may have just launched them).
 */
export async function findStaleExecutions() {
  const { rows } = await pool.query(
    `SELECT
       e.id,
       e.workspace_id,
       e.org_id,
       e.workflow_id,
       e.workflow_name,
       e.plan,
       e.started_by,
       e.approval_id,
       array_agg(s.step_id) FILTER (WHERE s.status IN ('COMPLETED','SKIPPED')) AS completed_step_ids
     FROM workflow_executions e
     LEFT JOIN workflow_step_executions s ON s.workflow_id = e.id
     WHERE e.status IN ('RUNNING','PLANNING')
       AND e.started_at < NOW() - INTERVAL '60 seconds'
     GROUP BY e.id`
  );
  return rows;
}

/**
 * Set a stale execution to FAILED with a recovery-related error message.
 * Used when a checkpoint is missing or the plan cannot be parsed.
 */
export async function failStaleExecution(executionId, reason) {
  await pool.query(
    `UPDATE workflow_executions
     SET status = 'FAILED', error = $2, completed_at = NOW()
     WHERE id = $1`,
    [executionId, reason]
  );
}
