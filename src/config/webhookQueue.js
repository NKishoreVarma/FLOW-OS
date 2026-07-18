import { Queue } from 'bullmq';
import Redis from 'ioredis';

const connection = new Redis(process.env.REDIS_URL || 'redis://127.0.0.1:6379', {
  maxRetriesPerRequest: null,
});

export const webhookQueue = new Queue('webhook-processing', {
  connection,
  defaultJobOptions: {
    attempts:         5,
    backoff:          { type: 'exponential', delay: 2_000 },
    removeOnComplete: { count: 500 },
    removeOnFail:     { count: 200 },
  },
});

export async function enqueueWebhookEvent(eventRecord, rawPayload) {
  const jobId = `${eventRecord.workspaceId}:${eventRecord.connectorId}:${eventRecord.deliveryId}`;
  return webhookQueue.add(
    'process',
    { eventRecord, rawPayload },
    { jobId },
  );
}
