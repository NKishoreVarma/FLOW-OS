import { Queue } from 'bullmq';
import Redis from 'ioredis';

const connection = new Redis(process.env.REDIS_URL || 'redis://127.0.0.1:6379', {
  maxRetriesPerRequest: null,
});

export const syncQueue = new Queue('connector-sync', {
  connection,
  defaultJobOptions: {
    attempts:    3,
    backoff:     { type: 'exponential', delay: 10_000 },
    removeOnComplete: { count: 200 },
    removeOnFail:     { count: 100 },
  },
});

/**
 * Schedule a background sync job for a workspace+connector.
 */
export async function enqueueSyncJob(workspaceId, connectorId, resourceType = 'default', opts = {}) {
  const jobId = `${workspaceId}:${connectorId}:${resourceType}`;
  return syncQueue.add(
    'sync',
    { workspaceId, connectorId, resourceType, trigger: opts.trigger || 'scheduled', ...opts },
    {
      jobId,           // deduplicates: only one pending job per workspace+connector+resource
      delay: opts.delayMs || 0,
    },
  );
}
