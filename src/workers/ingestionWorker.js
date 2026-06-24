import { Worker } from 'bullmq';
import Redis from 'ioredis';
import { broadcastToWorkspace } from '../services/socketService.js';
import { processIncomingIntel } from '../services/cognitiveBrainService.js';
import { evaluateScores } from '../services/operationalScoringService.js';
import { detectIncidents } from '../services/incidentEngine.js';
import { extractDecisions } from '../services/decisionMemoryService.js';
import dotenv from 'dotenv';
dotenv.config();

const connection = new Redis(process.env.REDIS_URL || 'redis://127.0.0.1:6379', {
  maxRetriesPerRequest: null,
});

export const ingestionWorker = new Worker('ingestion-queue', async (job) => {
  try {
    const { workspaceId, sender, channel: ch, channelId, text } = job.data;
    const channel = ch || channelId || 'general';
    
    // 1. Operational Scoring Layer
    const scores = evaluateScores(sender, channel, text);
    
    // 2. Cognitive Privacy Shield Enforcement
    if (scores.privacy_score > 0.85) {
      console.log(`🚨 [Privacy Brain] PII detected (score: ${scores.privacy_score.toFixed(2)}). Job discarded.`);
      broadcastToWorkspace(String(workspaceId), 'PRIVACY_SHIELD_TRIGGERED', {
        workspaceId,
        channelName: channel,
        sender,
        status: 'BLOCKED',
        reason: 'Privacy threshold exceeded'
      });
      return { status: 'DISCARDED', reason: 'PRIVACY_SHIELD_TRIGGERED' };
    }
    
    // 3. Operational Intelligence Engines (Parallel processing)
    detectIncidents(workspaceId, text, job.data.metadata);
    extractDecisions(workspaceId, text, job.data.metadata, sender);
    
    // 4. Memory Brain Scoring Pass & Retention Policy
    let retention_policy = '24_HOURS';
    if (scores.importance_score > 0.8 && scores.authority_score > 0.8) {
      retention_policy = 'PERMANENT';
    } else if (scores.importance_score > 0.5 || scores.authority_score > 0.5) {
      retention_policy = '30_DAYS';
    }

    const memoryMetadata = {
      ...scores,
      retention_policy
    };

    // Append to job data metadata before processing
    job.data.metadata = { ...(job.data.metadata || {}), ...memoryMetadata };

    console.log(`🧠 [Memory Brain] Scored chunk. Retention: ${retention_policy}`);
    
    // Broadcast Memory event to dashboard
    broadcastToWorkspace(String(workspaceId), 'MEMORY_RETENTION_ASSIGNED', {
      workspaceId,
      channelName: channel,
      importance_score: scores.importance_score,
      authority_score: scores.authority_score,
      urgency_score: scores.urgency_score,
      retention_policy
    });

    // 5. The Intent Classification Pass (Vectorization & Storage)
    console.log(`🧠 [Intent Classification] Chunk is safe. Routing to Brain Service.`);
    const result = await processIncomingIntel(workspaceId, channel, `[${sender}] ${text}`, job.data.metadata);
    
    broadcastToWorkspace(String(workspaceId), 'INGESTION_COMPLETE', {
      workspaceId,
      sourcesProcessed: ['slack'], // simplified for simulation
      status: result.status,
      scope: result.scope
    });
    
    return result;
  } catch (error) {
    console.error("Memory Brain Processing Error:", error);
    throw error;
  }
}, { connection });

ingestionWorker.on('completed', (job) => {
  console.log(`✅ [Ingestion Worker] Job ${job.id} completed successfully.`);
});

ingestionWorker.on('failed', (job, err) => {
  console.error(`❌ [Ingestion Worker] Job ${job.id} failed:`, err.message);
});
