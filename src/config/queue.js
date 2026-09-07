import { Queue } from 'bullmq';
import Redis from 'ioredis';
import dotenv from 'dotenv';
dotenv.config();

const connection = new Redis(process.env.REDIS_URL || 'redis://127.0.0.1:6379', {
  maxRetriesPerRequest: null,
});

export const ingestionQueue = new Queue('ingestion-queue', {
  connection,
  defaultJobOptions: {
    attempts:         3,
    backoff:          { type: 'exponential', delay: 2_000 },
    removeOnComplete: { count: 1_000, age: 86_400 },    // keep 1k completed for 24h
    removeOnFail:     { count: 500,   age: 604_800 },   // keep 500 failed for 7d
  },
});

console.log('🚀 BullMQ Ingestion Queue system online (retry: 3x exponential backoff).');
