/**
 * eventRetentionWorker — scheduled pruning of the durable event store.
 *
 * Runs EventRetention.prune() on a daily cron so flow_events stays bounded by the
 * per-type retention windows (see EventRetention.RETENTION_DAYS). Batched deletes
 * avoid long locks. Mirrors the summaryWorker cron pattern.
 *
 * Override the schedule with EVENT_RETENTION_CRON (default: 03:00 daily).
 */

import { Worker, Queue } from 'bullmq';
import Redis from 'ioredis';
import { prune } from '../events/EventRetention.js';
import { logger } from '../utils/logger.js';
import dotenv from 'dotenv';
dotenv.config();

const connection = new Redis(process.env.REDIS_URL || 'redis://127.0.0.1:6379', {
  maxRetriesPerRequest: null,
});

export const eventRetentionQueue = new Queue('event-retention-queue', { connection });

export const eventRetentionWorker = new Worker('event-retention-queue', async () => {
  logger.rag('[EventRetention] scheduled prune starting');
  const result = await prune({ batchSize: 5000 });
  logger.rag(`[EventRetention] scheduled prune complete — ${result.totalDeleted} events removed`);
  return result;
}, { connection });

eventRetentionWorker.on('failed', (job, err) =>
  logger.rag(`[EventRetention] prune job failed: ${err.message}`),
);

// Repeatable daily prune. jobId keeps the schedule idempotent across restarts.
eventRetentionQueue.add('daily-prune', {}, {
  repeat: { pattern: process.env.EVENT_RETENTION_CRON || '0 3 * * *' },
  jobId:  'event-retention-daily',
  removeOnComplete: { count: 30 },
  removeOnFail:     { count: 30 },
}).then(() => {
  console.log('⏰ [EventRetention] Repeatable daily event-store prune scheduled.');
}).catch((err) => {
  console.warn('⚠️ [EventRetention] Failed to schedule prune:', err.message);
});
