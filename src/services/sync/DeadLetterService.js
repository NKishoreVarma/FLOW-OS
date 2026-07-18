/**
 * DeadLetterService — manages jobs that failed all BullMQ retry attempts.
 *
 * The syncWorker calls moveToDLQ() in its 'failed' event handler when
 * job.attemptsMade >= job.opts.attempts. Operators can retry or dismiss
 * DLQ entries via the sync management API.
 */

import db          from '../../config/db.js';
import { syncQueue, enqueueSyncJob } from '../../config/syncQueue.js';

/**
 * Move a failed job to the dead-letter table.
 * Called by syncWorker after all retries are exhausted.
 */
export async function moveToDLQ(job, error) {
  const { workspaceId, connectorId, resourceType = 'default', trigger = 'scheduled' } = job.data;
  await db.query(
    `INSERT INTO dead_letter_queue
       (workspace_id, connector_id, resource_type, trigger, error_message, job_data, attempts, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending')`,
    [
      workspaceId,
      connectorId,
      resourceType,
      trigger,
      error?.message ?? String(error),
      JSON.stringify(job.data),
      job.attemptsMade,
    ],
  );
}

/**
 * List DLQ entries for a workspace, newest first.
 */
export async function listDeadLetters(workspaceId, { limit = 50, connectorId = null } = {}) {
  const params = [workspaceId, limit];
  const filter = connectorId ? `AND connector_id = $3` : '';
  if (connectorId) params.push(connectorId);

  const { rows } = await db.query(
    `SELECT id, connector_id, resource_type, trigger, error_message,
            attempts, status, created_at, retried_at, resolved_at
       FROM dead_letter_queue
      WHERE workspace_id = $1 AND status != 'dismissed' ${filter}
      ORDER BY created_at DESC
      LIMIT $2`,
    params,
  );
  return rows;
}

/**
 * Re-enqueue a DLQ entry for immediate retry.
 * Sets status to 'retrying'.
 */
export async function retryDeadLetter(workspaceId, dlqId) {
  const { rows } = await db.query(
    `SELECT * FROM dead_letter_queue WHERE id = $1 AND workspace_id = $2`,
    [dlqId, workspaceId],
  );
  if (!rows.length) throw new Error(`DLQ entry ${dlqId} not found`);

  const entry = rows[0];
  const jobData = typeof entry.job_data === 'string'
    ? JSON.parse(entry.job_data)
    : entry.job_data;

  await db.query(
    `UPDATE dead_letter_queue SET status = 'retrying', retried_at = NOW() WHERE id = $1`,
    [dlqId],
  );

  await enqueueSyncJob(
    entry.workspace_id,
    entry.connector_id,
    entry.resource_type,
    { trigger: 'dlq_retry', delayMs: 0, ...jobData },
  );

  return { queued: true, connectorId: entry.connector_id, resourceType: entry.resource_type };
}

/**
 * Mark a DLQ entry as resolved (manually fixed) or dismissed (ignored).
 */
export async function resolveDeadLetter(workspaceId, dlqId, resolution = 'resolved') {
  const allowed = new Set(['resolved', 'dismissed']);
  if (!allowed.has(resolution)) throw new Error('resolution must be resolved or dismissed');

  await db.query(
    `UPDATE dead_letter_queue SET status = $1, resolved_at = NOW()
      WHERE id = $2 AND workspace_id = $3`,
    [resolution, dlqId, workspaceId],
  );
  return { ok: true };
}

/**
 * Count of pending DLQ entries per connector.
 */
export async function getDLQSummary(workspaceId) {
  const { rows } = await db.query(
    `SELECT connector_id,
            COUNT(*) FILTER (WHERE status = 'pending')  AS pending,
            COUNT(*) FILTER (WHERE status = 'retrying') AS retrying
       FROM dead_letter_queue
      WHERE workspace_id = $1 AND status NOT IN ('resolved', 'dismissed')
      GROUP BY connector_id`,
    [workspaceId],
  );
  return rows;
}
