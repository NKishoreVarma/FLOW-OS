/**
 * CompensationManager — Saga-style compensation for long-running workflows.
 *
 * Every step that executes a reversible connector action should register its
 * compensation action here immediately after success. On failure, the runtime
 * calls runCompensation() which executes registered compensations in reverse
 * sequence order (LIFO — last registered, first compensated).
 *
 * Compensation is best-effort:
 *   - A failed compensation is logged and skipped; other compensations continue.
 *   - The overall workflow is already in a FAILED state when compensation runs.
 *
 * Usage in a workflow planner step:
 *   step.compensation = {
 *     connectorId: 'jira',
 *     actionType:  'delete',
 *     payload:     ctx => ({ issueId: ctx.variables._jiraIssue.id })
 *   };
 *
 * The StepExecutor (new 'compensate_on_complete' step type) calls
 * CompensationManager.register() after each successful action step.
 */

import { pool }        from '../config/db.js';
import { executeAction } from '../connectors/executionEngine.js';
import { logger }      from '../utils/logger.js';

// ── Registration ──────────────────────────────────────────────────────────────

/**
 * Register a compensation action for a completed step.
 * Called after every reversible step succeeds.
 *
 * @param {object} opts
 * @param {string} opts.executionId
 * @param {string} opts.workspaceId
 * @param {string} opts.stepId
 * @param {string} opts.stepName
 * @param {string} opts.connectorId
 * @param {string} opts.actionType
 * @param {object} [opts.payload]
 * @param {number} [opts.sequenceNum] — defaults to auto-increment
 */
export async function register({
  executionId,
  workspaceId,
  stepId,
  stepName,
  connectorId,
  actionType,
  payload       = null,
  sequenceNum   = null,
}) {
  if (!sequenceNum) {
    const { rows } = await pool.query(
      `SELECT COALESCE(MAX(sequence_num), 0) + 1 AS next
       FROM workflow_compensation_log WHERE execution_id = $1`,
      [executionId]
    );
    sequenceNum = rows[0].next;
  }

  const { rows } = await pool.query(
    `INSERT INTO workflow_compensation_log
       (execution_id, workspace_id, step_id, step_name, connector_id, action_type, payload, sequence_num)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     RETURNING id`,
    [executionId, workspaceId, stepId, stepName, connectorId, actionType,
     payload ? JSON.stringify(payload) : null, sequenceNum]
  );

  logger.info(`[CompensationManager] Registered compensation for step ${stepId} (seq ${sequenceNum})`);
  return rows[0].id;
}

// ── Execution ─────────────────────────────────────────────────────────────────

/**
 * Run all registered compensations for an execution in reverse order.
 * Called by RuntimeEngine when a critical step fails.
 *
 * @param {string} executionId
 * @param {string} workspaceId
 * @param {object} engineCtx — { actor, orgPlan }
 */
export async function runCompensation(executionId, workspaceId, engineCtx) {
  const { rows } = await pool.query(
    `SELECT * FROM workflow_compensation_log
     WHERE execution_id = $1 AND status = 'REGISTERED'
     ORDER BY sequence_num DESC`,
    [executionId]
  );

  if (rows.length === 0) return;

  logger.info(`[CompensationManager] Running ${rows.length} compensation(s) for ${executionId}`);

  for (const comp of rows) {
    await pool.query(
      `UPDATE workflow_compensation_log SET status = 'EXECUTING', executed_at = NOW() WHERE id = $1`,
      [comp.id]
    );

    try {
      await executeAction({
        workspaceId,
        connectorId: comp.connector_id,
        actionType:  comp.action_type,
        payload:     comp.payload ?? {},
        actor:       engineCtx.actor,
        orgPlan:     engineCtx.orgPlan ?? 'free',
      });

      await pool.query(
        `UPDATE workflow_compensation_log SET status = 'COMPLETED' WHERE id = $1`,
        [comp.id]
      );
      logger.info(`[CompensationManager] Compensated step ${comp.step_id} (seq ${comp.sequence_num})`);
    } catch (err) {
      await pool.query(
        `UPDATE workflow_compensation_log SET status = 'FAILED', error = $2 WHERE id = $1`,
        [comp.id, err.message]
      );
      logger.error(`[CompensationManager] Compensation failed for step ${comp.step_id}: ${err.message}`);
      // Continue with remaining compensations (best-effort)
    }
  }
}

// ── Read ──────────────────────────────────────────────────────────────────────

export async function getCompensationLog(executionId, workspaceId) {
  const { rows } = await pool.query(
    `SELECT * FROM workflow_compensation_log
     WHERE execution_id = $1 AND workspace_id = $2
     ORDER BY sequence_num DESC`,
    [executionId, workspaceId]
  );
  return rows;
}

export async function countPendingCompensations(executionId) {
  const { rows } = await pool.query(
    `SELECT COUNT(*) AS n FROM workflow_compensation_log
     WHERE execution_id = $1 AND status = 'REGISTERED'`,
    [executionId]
  );
  return parseInt(rows[0].n, 10);
}
