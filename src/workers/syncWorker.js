/**
 * syncWorker — BullMQ background connector sync worker (Phase 10.2).
 *
 * Processes jobs from the 'connector-sync' queue.
 * Each job syncs one workspace+connector+resourceType combination.
 *
 * Job payload: { workspaceId, connectorId, resourceType, trigger, webhookPayload? }
 *
 * Pipeline per job:
 *   1. Dispatch to SyncEngine.runSync()  — dedup, delta, ingest, checkpoint
 *   2. On BullMQ failure (all retries exhausted) → move to dead-letter table
 *   3. All progress broadcast over WebSocket via ProgressReporter
 *
 * Retry: 5 attempts with exponential backoff (10s, 20s, 40s, 80s, 160s).
 * Concurrency: 6 simultaneous jobs (2 per connector category).
 * Rate limit: 20 jobs/second max to avoid provider rate limits.
 */

import { Worker }          from 'bullmq';
import Redis               from 'ioredis';
import { logger }          from '../utils/logger.js';
import { runSync }         from '../services/sync/SyncEngine.js';
import { moveToDLQ }       from '../services/sync/DeadLetterService.js';
import { reportDLQ }       from '../services/sync/ProgressReporter.js';
import { restoreSchedulesOnBoot } from '../services/sync/SyncScheduler.js';

const MAX_ATTEMPTS = 5;

const connection = new Redis(process.env.REDIS_URL || 'redis://127.0.0.1:6379', {
  maxRetriesPerRequest: null,
});

export const syncWorker = new Worker(
  'connector-sync',
  async (job) => {
    const {
      workspaceId,
      connectorId,
      resourceType   = 'default',
      trigger        = 'scheduled',
      webhookPayload = null,
    } = job.data;

    logger.queue(
      `syncWorker: [${job.id}] ${connectorId}/${resourceType} for ${workspaceId} (${trigger}, attempt ${job.attemptsMade + 1}/${MAX_ATTEMPTS})`
    );

    const result = await runSync(workspaceId, connectorId, resourceType, {
      trigger,
      webhookPayload,
      attempt:     job.attemptsMade + 1,
      maxAttempts: MAX_ATTEMPTS,
    });

    logger.queue(
      `syncWorker: [${job.id}] done — ${result.itemsNew} new, ${result.itemsSkipped} skipped, ${result.itemsFailed} failed`
    );

    return result;
  },
  {
    connection,
    concurrency: 6,
    limiter:     { max: 20, duration: 1000 },
    defaultJobOptions: {
      attempts: MAX_ATTEMPTS,
      backoff:  { type: 'exponential', delay: 10_000 },
    },
  },
);

// ── Dead-letter handling ──────────────────────────────────────────────────────
// BullMQ emits 'failed' once per failed attempt, but only with isFinalAttempt
// after all retries are exhausted. Move to DLQ at that point.

syncWorker.on('failed', async (job, err) => {
  const isFinal = job && job.attemptsMade >= (job.opts?.attempts ?? MAX_ATTEMPTS);

  logger.error(
    `syncWorker: job ${job?.id} failed (attempt ${job?.attemptsMade}/${job?.opts?.attempts ?? MAX_ATTEMPTS}): ${err.message}`
  );

  if (isFinal && job) {
    try {
      const dlqId = await moveToDLQ(job, err);
      reportDLQ(
        job.data.workspaceId,
        job.data.connectorId,
        job.data.resourceType,
        err,
        dlqId,
      );
      logger.warn(`syncWorker: job ${job.id} moved to DLQ`);
    } catch (dlqErr) {
      logger.error(`syncWorker: failed to move job ${job.id} to DLQ: ${dlqErr.message}`);
    }
  }
});

syncWorker.on('completed', job =>
  logger.queue(`syncWorker: job ${job.id} completed`)
);

syncWorker.on('error', err =>
  logger.error(`syncWorker: worker error — ${err.message}`)
);

// ── Restore scheduled jobs on boot ────────────────────────────────────────────
// Runs asynchronously — boot continues even if this fails.
restoreSchedulesOnBoot().catch(err =>
  logger.warn(`syncWorker: schedule restore failed — ${err.message}`)
);
