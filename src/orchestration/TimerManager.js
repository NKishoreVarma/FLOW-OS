/**
 * TimerManager — BullMQ-backed durable timer queue for long-running workflows.
 *
 * Queue: "workflow-timers"
 * Delayed jobs: fire exactly once at the scheduled time (BullMQ delay).
 * Recurring timers: BullMQ repeatable jobs (cron expression).
 *
 * On job fire: the worker calls WaitCoordinator.handleTimerFired().
 * On server restart: timer jobs survive in Redis (BullMQ durability).
 * On crash during fire: BullMQ retries with backoff.
 *
 * Timer types in PostgreSQL audit log:
 *   RESUME     — workflow resume after wait_duration / wait_until_date
 *   TIMEOUT    — abort a workflow that has exceeded its SLA
 *   REMINDER   — notification without resuming (escalation signal)
 *   ESCALATION — create approval + notify on overdue approval waits
 *   RECURRING  — repeatable heartbeat (weekly review, SLA check)
 */

import { Queue, Worker } from 'bullmq';
import redisConnection   from '../config/redis.js';
import { pool }          from '../config/db.js';
import { logger }        from '../utils/logger.js';

const QUEUE_NAME = 'workflow-timers';

const _queue = new Queue(QUEUE_NAME, { connection: redisConnection });
let   _worker = null;

// ── Schedule ──────────────────────────────────────────────────────────────────

/**
 * Schedule a timer that will fire at `fireAt` (Date or ISO string).
 * Returns the BullMQ job ID. Also records in workflow_timers table.
 *
 * @param {object} opts
 * @param {string} opts.executionId
 * @param {string} opts.workspaceId
 * @param {string} opts.waitStateId — ID from workflow_wait_states
 * @param {string} opts.timerType  — RESUME | TIMEOUT | REMINDER | ESCALATION | RECURRING
 * @param {Date|string} opts.fireAt
 * @param {string} [opts.recurrenceCron] — for RECURRING timers (cron expression)
 * @param {number} [opts.maxRecurrences]
 */
export async function scheduleTimer({
  executionId,
  workspaceId,
  waitStateId = null,
  timerType   = 'RESUME',
  fireAt,
  recurrenceCron = null,
  maxRecurrences = null,
}) {
  const fireDate  = fireAt instanceof Date ? fireAt : new Date(fireAt);
  const delayMs   = Math.max(0, fireDate.getTime() - Date.now());

  // Insert audit record first
  const { rows } = await pool.query(
    `INSERT INTO workflow_timers
       (execution_id, workspace_id, wait_state_id, timer_type, fire_at, recurrence_cron, max_recurrences)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     RETURNING id`,
    [executionId, workspaceId, waitStateId, timerType, fireDate, recurrenceCron, maxRecurrences]
  );
  const timerId = rows[0].id;

  // Enqueue in BullMQ
  const jobData    = { timerId, executionId, workspaceId, waitStateId, timerType };
  const jobOptions = recurrenceCron
    ? { repeat: { pattern: recurrenceCron, limit: maxRecurrences ?? undefined } }
    : { delay: delayMs, attempts: 3, backoff: { type: 'exponential', delay: 5000 } };

  const job = await _queue.add(`timer:${timerType}:${executionId}`, jobData, jobOptions);

  // Persist BullMQ job ID back to audit row
  await pool.query(
    `UPDATE workflow_timers SET bull_job_id = $2 WHERE id = $1`,
    [timerId, job.id]
  );

  logger.info(`[TimerManager] Scheduled ${timerType} timer ${timerId} for ${executionId} at ${fireDate.toISOString()}`);
  return { timerId, jobId: job.id };
}

/**
 * Cancel a pending timer for an execution (e.g., execution was cancelled).
 */
export async function cancelTimer(executionId, waitStateId = null) {
  const q = waitStateId
    ? 'SELECT bull_job_id FROM workflow_timers WHERE execution_id = $1 AND wait_state_id = $2 AND status = $3'
    : 'SELECT bull_job_id FROM workflow_timers WHERE execution_id = $1 AND status = $2';
  const params = waitStateId
    ? [executionId, waitStateId, 'PENDING']
    : [executionId, 'PENDING'];

  const { rows } = await pool.query(q, params);

  for (const row of rows) {
    if (row.bull_job_id) {
      try { await _queue.remove(row.bull_job_id); } catch { /* already fired */ }
    }
  }

  if (waitStateId) {
    await pool.query(
      `UPDATE workflow_timers SET status = 'CANCELLED'
       WHERE execution_id = $1 AND wait_state_id = $2 AND status = 'PENDING'`,
      [executionId, waitStateId]
    );
  } else {
    await pool.query(
      `UPDATE workflow_timers SET status = 'CANCELLED'
       WHERE execution_id = $1 AND status = 'PENDING'`,
      [executionId]
    );
  }
}

// ── Worker ────────────────────────────────────────────────────────────────────

export async function startTimerWorker() {
  if (_worker) return;

  _worker = new Worker(
    QUEUE_NAME,
    async (job) => {
      const { timerId, executionId, workspaceId, waitStateId, timerType } = job.data;

      logger.info(`[TimerManager] Timer fired: ${timerType} for execution ${executionId}`);

      // Mark timer as fired in PostgreSQL
      await pool.query(
        `UPDATE workflow_timers
         SET status = 'FIRED', fired_at = NOW(), fire_count = fire_count + 1
         WHERE id = $1`,
        [timerId]
      );

      // Dispatch to WaitCoordinator (lazy import avoids circular dep at module load time)
      const { handleTimerFired } = await import('./WaitCoordinator.js');
      await handleTimerFired({ executionId, workspaceId, waitStateId, timerType });
    },
    {
      connection: redisConnection,
      concurrency: 5,
    }
  );

  _worker.on('failed', (job, err) => {
    logger.error(`[TimerManager] Timer job failed for ${job?.data?.executionId}: ${err.message}`);
  });

  logger.info('[TimerManager] Worker started on queue: ' + QUEUE_NAME);
}

export async function stopTimerWorker() {
  if (_worker) { await _worker.close(); _worker = null; }
}

// ── Read API ──────────────────────────────────────────────────────────────────

export async function getTimersForExecution(executionId) {
  const { rows } = await pool.query(
    `SELECT * FROM workflow_timers WHERE execution_id = $1 ORDER BY fire_at ASC`,
    [executionId]
  );
  return rows;
}

export async function getPendingTimers(workspaceId) {
  const { rows } = await pool.query(
    `SELECT * FROM workflow_timers
     WHERE workspace_id = $1 AND status = 'PENDING'
     ORDER BY fire_at ASC`,
    [workspaceId]
  );
  return rows;
}
