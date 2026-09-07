/**
 * CheckpointHistory — append-only history of every checkpoint saved
 * during a workflow execution.
 *
 * workflow_runtime_checkpoints stores only the LATEST checkpoint (upsert).
 * This table records every checkpoint, enabling:
 *   - Execution timeline reconstruction in WorkflowInspector
 *   - Debugging: inspect exact context at any step
 *   - Rollback: restore context to any prior checkpoint
 *
 * append() is called from RuntimePersistence.saveCheckpoint() (additive extension).
 */

import { pool } from '../config/db.js';

// ── Write ─────────────────────────────────────────────────────────────────────

/**
 * Append a checkpoint snapshot to the history table.
 * Non-fatal — if the write fails, the main checkpoint (latest) is unaffected.
 */
export async function append(executionId, workspaceId, context, stepId = null) {
  try {
    const { rows } = await pool.query(
      `SELECT COALESCE(MAX(sequence_num), 0) + 1 AS next
       FROM workflow_checkpoint_history WHERE execution_id = $1`,
      [executionId]
    );
    const seq = rows[0].next;

    await pool.query(
      `INSERT INTO workflow_checkpoint_history
         (execution_id, workspace_id, sequence_num, step_id, context)
       VALUES ($1,$2,$3,$4,$5)`,
      [executionId, workspaceId, seq, stepId ?? null, JSON.stringify(context)]
    );
  } catch (err) {
    // Non-fatal: don't interrupt the main execution
    console.error(`[CheckpointHistory] Failed to append for ${executionId}: ${err.message}`);
  }
}

// ── Read ──────────────────────────────────────────────────────────────────────

export async function getHistory(executionId, workspaceId, { limit = 100 } = {}) {
  const { rows } = await pool.query(
    `SELECT id, sequence_num, step_id, saved_at,
            context - 'variables' AS context_meta
     FROM workflow_checkpoint_history
     WHERE execution_id = $1 AND workspace_id = $2
     ORDER BY sequence_num ASC
     LIMIT $3`,
    [executionId, workspaceId, Math.min(limit, 500)]
  );
  return rows;
}

export async function getCheckpointAt(executionId, workspaceId, sequenceNum) {
  const { rows } = await pool.query(
    `SELECT * FROM workflow_checkpoint_history
     WHERE execution_id = $1 AND workspace_id = $2 AND sequence_num = $3`,
    [executionId, workspaceId, sequenceNum]
  );
  return rows[0] ?? null;
}

export async function getLatestCheckpoint(executionId, workspaceId) {
  const { rows } = await pool.query(
    `SELECT * FROM workflow_checkpoint_history
     WHERE execution_id = $1 AND workspace_id = $2
     ORDER BY sequence_num DESC LIMIT 1`,
    [executionId, workspaceId]
  );
  return rows[0] ?? null;
}

export async function countCheckpoints(executionId) {
  const { rows } = await pool.query(
    `SELECT COUNT(*) AS n FROM workflow_checkpoint_history WHERE execution_id = $1`,
    [executionId]
  );
  return parseInt(rows[0].n, 10);
}
