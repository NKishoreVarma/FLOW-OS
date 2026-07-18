/**
 * queueMetrics — a read-only snapshot of every BullMQ queue's job counts
 * (waiting / active / completed / failed / delayed) for health and monitoring.
 * Reuses the shared Redis connection; creates lightweight Queue handles once.
 */

import { Queue } from 'bullmq';
import redis from '../../config/redis.js';

const QUEUE_NAMES = [
  'ingestion-queue',
  'summary-queue',
  'connector-sync',
  'webhook-processing',
  'event-retention-queue',
  'prediction-queue',
];

let handles = null;
function queues() {
  if (!handles) handles = QUEUE_NAMES.map((name) => new Queue(name, { connection: redis }));
  return handles;
}

export async function getQueueMetrics() {
  const out = {};
  await Promise.all(queues().map(async (q) => {
    out[q.name] = await q.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed').catch(() => ({ error: 'unavailable' }));
  }));
  return out;
}

/** Total failed jobs across all queues (a quick health signal). */
export async function totalFailedJobs() {
  const m = await getQueueMetrics();
  return Object.values(m).reduce((s, c) => s + (c.failed || 0), 0);
}
