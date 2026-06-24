import { Queue } from 'bullmq';
import Redis from 'ioredis';
import dotenv from 'dotenv';
dotenv.config();

const connection = new Redis(process.env.REDIS_URL || 'redis://127.0.0.1:6379', {
  maxRetriesPerRequest: null,
});

export const ingestionQueue = new Queue('ingestion-queue', { connection });

console.log('🚀 BullMQ Ingestion Queue system online (Centralized config).');
