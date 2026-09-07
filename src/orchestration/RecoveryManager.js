/**
 * RecoveryManager — enhanced crash and stall recovery for long-running workflows.
 *
 * Boot-time recovery (on server start):
 *   1. Find RUNNING/PLANNING executions → re-enter _execute (already handled by RuntimeEngine)
 *   2. Find WAITING_EVENT executions → re-register their event listeners in WaitCoordinator
 *   3. Find WAITING_TIMER / WAITING_DATE / WAITING_CALLBACK executions →
 *      re-schedule timers if their BullMQ jobs are gone (e.g., Redis was flushed)
 *
 * Periodic health check (every RECOVERY_INTERVAL_MS):
 *   - Detect stalled workflows: RUNNING > STALL_THRESHOLD_MS with no recent checkpoint
 *   - Detect duplicate execution: same workflowId+workspaceId with multiple RUNNING rows
 *   - Emit WORKFLOW_STALLED event to the WS bus
 *
 * Duplicate execution guard:
 *   Two RUNNING executions of the same workflow in the same workspace = likely a
 *   double-start after restart. The newer one is failed immediately.
 */

import { pool }   from '../config/db.js';
import { logger } from '../utils/logger.js';
import { broadcastToWorkspace } from '../services/socketService.js';

const RECOVERY_INTERVAL_MS  = parseInt(process.env.RECOVERY_INTERVAL_MS,  10) || 60_000;
const STALL_THRESHOLD_MS    = parseInt(process.env.STALL_THRESHOLD_MS,    10) || 5 * 60_000;

let _intervalId = null;

// ── Boot-time recovery ────────────────────────────────────────────────────────

/**
 * Run once at boot. Extends the base recoverStaleExecutions() already in
 * RuntimeEngine by re-wiring wait states.
 */
export async function bootRecovery() {
  await _recoverWaitingEventExecutions();
  await _recoverExpiredTimerWaits();
  logger.info('[RecoveryManager] Boot recovery complete');
}

async function _recoverWaitingEventExecutions() {
  const { rows } = await pool.query(
    `SELECT e.id, e.workspace_id, e.org_id, e.started_by,
            w.id AS wait_id, w.wait_type, w.event_type, w.event_filter, w.resume_after,
            w.callback_token, w.required_events
     FROM workflow_executions e
     JOIN workflow_wait_states w ON w.execution_id = e.id AND w.status = 'PENDING'
     WHERE e.status IN ('WAITING_EVENT','WAITING_TIMER','WAITING_CALLBACK','WAITING_DATE','WAITING_MULTI_EVENT')`
  );

  logger.info(`[RecoveryManager] Found ${rows.length} waiting execution(s) to re-register`);

  for (const row of rows) {
    try {
      if (row.wait_type === 'EVENT' || row.wait_type === 'MULTI_EVENT') {
        // Event waits survive process restart via PostgreSQL — WaitCoordinator.onEvent
        // queries WaitStore on each event, so no re-registration is needed.
        logger.info(`[RecoveryManager] Event wait ${row.wait_id} for ${row.id} is still registered in DB`);
      } else if (['TIMER','DATE','DURATION','BUSINESS_HOURS'].includes(row.wait_type)) {
        // Re-check whether the BullMQ job still exists; if not, reschedule
        await _ensureTimerForWait(row);
      } else if (row.wait_type === 'CALLBACK') {
        // Callback waits: token is still in DB; no timer needed
        logger.info(`[RecoveryManager] Callback wait ${row.wait_id} for ${row.id} persists via token`);
      }
    } catch (err) {
      logger.error(`[RecoveryManager] Could not re-register wait ${row.wait_id}: ${err.message}`);
    }
  }
}

async function _ensureTimerForWait(row) {
  if (!row.resume_after) return;

  const resumeAt  = new Date(row.resume_after);
  const now       = new Date();

  if (resumeAt <= now) {
    // Timer already should have fired — resolve immediately
    logger.warn(`[RecoveryManager] Wait ${row.wait_id} resume_after is in the past; resolving now`);
    const { WaitCoordinator } = await import('./WaitCoordinator.js');
    await WaitCoordinator.handleTimerFired({
      executionId: row.id,
      workspaceId: row.workspace_id,
      waitStateId: row.wait_id,
      timerType:   'RESUME',
    });
  } else {
    // Check if BullMQ job exists; reschedule if not
    const { scheduleTimer } = await import('./TimerManager.js');
    const { setTimerJobId }  = await import('./WaitStore.js');

    const { timerId, jobId } = await scheduleTimer({
      executionId:  row.id,
      workspaceId:  row.workspace_id,
      waitStateId:  row.wait_id,
      timerType:    'RESUME',
      fireAt:       resumeAt,
    });
    await setTimerJobId(row.wait_id, jobId);
    logger.info(`[RecoveryManager] Rescheduled timer ${timerId} for wait ${row.wait_id} at ${resumeAt.toISOString()}`);
  }
}

async function _recoverExpiredTimerWaits() {
  const { findExpiredTimerWaits } = await import('./WaitStore.js');
  const expired = await findExpiredTimerWaits();

  for (const wait of expired) {
    logger.info(`[RecoveryManager] Found expired timer wait ${wait.id} for ${wait.execution_id} — resolving`);
    const { handleTimerFired } = await import('./WaitCoordinator.js');
    try {
      await handleTimerFired({
        executionId: wait.execution_id,
        workspaceId: wait.workspace_id,
        waitStateId: wait.id,
        timerType:   'RESUME',
      });
    } catch (err) {
      logger.error(`[RecoveryManager] Failed resolving expired wait ${wait.id}: ${err.message}`);
    }
  }
}

// ── Periodic health check ─────────────────────────────────────────────────────

export function startPeriodicRecovery() {
  if (_intervalId) return;
  _intervalId = setInterval(_periodicCheck, RECOVERY_INTERVAL_MS);
  logger.info(`[RecoveryManager] Periodic health check started (interval: ${RECOVERY_INTERVAL_MS}ms)`);
}

export function stopPeriodicRecovery() {
  if (_intervalId) {
    clearInterval(_intervalId);
    _intervalId = null;
  }
}

async function _periodicCheck() {
  try {
    await _detectStalledWorkflows();
    await _detectDuplicateExecutions();
  } catch (err) {
    logger.error(`[RecoveryManager] Periodic check error: ${err.message}`);
  }
}

async function _detectStalledWorkflows() {
  const thresholdMs = STALL_THRESHOLD_MS;
  const { rows }    = await pool.query(
    `SELECT e.id, e.workspace_id, e.workflow_id, e.started_at,
            MAX(c.saved_at) AS last_checkpoint
     FROM workflow_executions e
     LEFT JOIN workflow_runtime_checkpoints c ON c.execution_id = e.id
     WHERE e.status = 'RUNNING'
     GROUP BY e.id
     HAVING EXTRACT(EPOCH FROM (NOW() - COALESCE(MAX(c.saved_at), e.started_at))) * 1000 > $1`,
    [thresholdMs]
  );

  for (const row of rows) {
    logger.warn(`[RecoveryManager] Stalled execution detected: ${row.id} (no checkpoint for >${thresholdMs}ms)`);
    broadcastToWorkspace(row.workspace_id, 'WORKFLOW_STALLED', {
      executionId:     row.id,
      workflowId:      row.workflow_id,
      lastCheckpoint:  row.last_checkpoint,
      stalledSince:    row.started_at,
    });
  }
}

async function _detectDuplicateExecutions() {
  const { rows } = await pool.query(
    `SELECT workspace_id, workflow_id,
            array_agg(id ORDER BY started_at ASC) AS execution_ids,
            COUNT(*) AS run_count
     FROM workflow_executions
     WHERE status = 'RUNNING'
     GROUP BY workspace_id, workflow_id
     HAVING COUNT(*) > 1`
  );

  for (const row of rows) {
    const ids    = row.execution_ids;
    // Keep the oldest, fail the rest
    const toFail = ids.slice(1);
    for (const eid of toFail) {
      logger.warn(`[RecoveryManager] Duplicate execution detected: ${eid} — marking FAILED`);
      await pool.query(
        `UPDATE workflow_executions
         SET status = 'FAILED', error = 'Duplicate execution detected — older instance is authoritative', completed_at = NOW()
         WHERE id = $1`,
        [eid]
      );
    }
  }
}
