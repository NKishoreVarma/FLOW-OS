/**
 * webhookWorker — BullMQ consumer for the 'webhook-processing' queue.
 *
 * For each job: publish the webhook event into the single unified Event Platform
 * (which stores it durably and fans out to every subscriber), then mark the
 * event processed in the DB. After exhausting all retries, the event row is
 * marked 'failed' for manual inspection.
 *
 * Consolidation (Phase 11.0): replaced the webhook-only EventBroadcaster with
 * the canonical bus. Raw provider parsing is reused via publishWebhook — there
 * is now one pipeline, not a separate webhook fan-out.
 *
 * Concurrency: 10 — webhooks are I/O-bound fan-outs, not CPU-heavy.
 * Attempts: 5 with exponential backoff (2s base, max 60s).
 */

import { Worker } from 'bullmq';
import Redis      from 'ioredis';
import { logger } from '../utils/logger.js';
import { publishWebhook } from '../events/index.js';
import { markProcessed, markFailed } from '../services/webhooks/WebhookProcessor.js';

const MAX_ATTEMPTS = 5;

const connection = new Redis(process.env.REDIS_URL || 'redis://127.0.0.1:6379', {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

export const webhookWorker = new Worker(
  'webhook-processing',
  async (job) => {
    const { event } = job.data;
    const { workspaceId, connectorId, deliveryId } = event;

    logger.queue(
      `webhookWorker: [${job.id}] ${connectorId}/${event.eventType} for ${workspaceId} (attempt ${job.attemptsMade + 1}/${MAX_ATTEMPTS})`,
    );

    // Publish through the single bus — durable store + fan-out to all subscribers.
    const result = await publishWebhook(event);

    const failed = (result.delivery || []).filter(r => r.status === 'failed');
    if (failed.length > 0) {
      logger.warn(`webhookWorker: ${failed.length} subscriber(s) failed for ${connectorId}/${event.eventType}`);
    }

    // Mark DB row as processed
    await markProcessed(workspaceId, connectorId, deliveryId);

    return { connectorId, eventType: event.eventType, subscribersFailed: failed.length };
  },
  {
    connection,
    concurrency: 10,
    limiter: { max: 50, duration: 1000 },
    defaultJobOptions: {
      attempts: MAX_ATTEMPTS,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: { count: 200 },
      removeOnFail: { count: 500 },
    },
  },
);

webhookWorker.on('failed', async (job, err) => {
  const isFinal = (job?.attemptsMade ?? 0) >= MAX_ATTEMPTS;
  logger.warn(
    `webhookWorker: job ${job?.id} failed (attempt ${job?.attemptsMade}/${MAX_ATTEMPTS}): ${err.message}`,
  );

  if (isFinal && job?.data?.event) {
    const { workspaceId, connectorId, deliveryId } = job.data.event;
    await markFailed(workspaceId, connectorId, deliveryId, err.message).catch(() => {});
  }
});

webhookWorker.on('completed', job =>
  logger.queue(`webhookWorker: job ${job.id} completed`),
);

webhookWorker.on('error', err =>
  logger.error(`webhookWorker: worker error — ${err.message}`),
);
