import { Worker, Queue } from 'bullmq';
import Redis from 'ioredis';
import { generateRollingSummary } from '../services/summaryService.js';
import dotenv from 'dotenv';
dotenv.config();

const connection = new Redis(process.env.REDIS_URL || 'redis://127.0.0.1:6379', {
  maxRetriesPerRequest: null,
});

export const summaryQueue = new Queue('summary-queue', { connection });

export const summaryWorker = new Worker('summary-queue', async (job) => {
  try {
    const { workspaceId, hours } = job.data;
    console.log(`⏱️ [Summary Worker] Compiling rolling summary for Workspace ${workspaceId}`);
    const result = await generateRollingSummary(workspaceId, hours || 24);
    return result;
  } catch (error) {
    console.error("Summary Worker Processing Error:", error);
    throw error;
  }
}, { connection });

// Schedule repeatable daily rollup job for default workspace (workspace_corp_alpha)
summaryQueue.add('daily-rollup', { workspaceId: 'workspace_corp_alpha', hours: 24 }, {
  repeat: {
    pattern: '0 0 * * *' // Every day at midnight
  }
}).then(() => {
  console.log('⏰ [Summary Worker] Repeatable daily summary rollup scheduled successfully.');
}).catch(err => {
  console.warn('⚠️ [Summary Worker] Failed to schedule repeatable rollup:', err.message);
});
