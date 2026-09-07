import { Worker } from 'bullmq';
import Redis from 'ioredis';
import { broadcastToWorkspace } from '../services/socketService.js';
import { processIncomingIntel } from '../services/cognitiveBrainService.js';
import { evaluateScores } from '../services/operationalScoringService.js';
import { detectIncidents } from '../services/incidentEngine.js';
import { extractDecisions } from '../services/decisionMemoryService.js';
import { normalizeFormatting, extractTaskAndDeadline } from '../services/parserService.js';
import dotenv from 'dotenv';
import { logger } from '../utils/logger.js';
dotenv.config();

const connection = new Redis(process.env.REDIS_URL || 'redis://127.0.0.1:6379', {
  maxRetriesPerRequest: null,
});

import {
  generateTraceId,
  startIngestionTrace,
  updateIngestionTrace,
  liveMetrics
} from '../services/observabilityService.js';
import { traceStage as safeTrace, STAGES as ST } from '../observability/ingestionTrace.js';

export const ingestionWorker = new Worker('ingestion-queue', async (job) => {
  const traceId = job.data.traceId || generateTraceId();
  const { workspaceId, sender, channel: ch, channelId, text, platform } = job.data;
  const channel = ch || channelId || 'general';
  const plat = platform || 'slack';

  // Safe per-item observability context (metadata only, no content). Populated by
  // SyncEngine when the item came through the real connector sync path.
  const _md = job.data.metadata || {};
  const _st = _md._traceEventId
    ? { workspaceId, eventId: _md._traceEventId, provider: _md._traceProvider, providerObjectId: _md._traceProviderObjectId, eventType: _md._traceResourceType }
    : null;
  const emitSafe = (stage, extra = {}) => { if (_st) safeTrace(stage, { ..._st, ...extra }); };

  // Initialize pipeline trace
  startIngestionTrace(traceId, {
    workspaceId,
    platform: plat,
    sender,
    channel,
    text
  });

  try {
    // 1. Parser Stage
    updateIngestionTrace(traceId, 'Parser', 'START', { input: text });
    const parsedText = normalizeFormatting(text);
    
    if (parsedText.includes('[STRIPPED INJECTION]')) {
      logger.security(`Prompt injection detected. Job aborted.`);
      updateIngestionTrace(traceId, 'Parser', 'FAILED', {
        input: text,
        error: 'Prompt Injection detected and stripped'
      });
      updateIngestionTrace(traceId, 'Complete', 'FAILED', {
        error: 'Prompt Injection blocked'
      });
      return { status: 'DISCARDED', reason: 'PROMPT_INJECTION_BLOCKED' };
    }

    const taskExtraction = extractTaskAndDeadline(parsedText);
    job.data.metadata = {
      ...(job.data.metadata || {}),
      task: taskExtraction.task,
      deadline: taskExtraction.deadline
    };

    updateIngestionTrace(traceId, 'Parser', 'SUCCESS', {
      input: text,
      output: parsedText,
      metadata: taskExtraction
    });
    emitSafe(ST.NORMALIZED, { status: 'ok' });

    // 2. Operational Scoring / Importance Stage
    updateIngestionTrace(traceId, 'Importance', 'START', { input: parsedText });
    const scores = evaluateScores(sender, channel, parsedText);
    updateIngestionTrace(traceId, 'Importance', 'SUCCESS', {
      input: parsedText,
      output: scores,
      metadata: { 
        importance_score: scores.importance_score, 
        authority_score: scores.authority_score,
        urgency_score: scores.urgency_score
      }
    });

    // 3. Privacy Gate Stage
    updateIngestionTrace(traceId, 'Privacy Gate', 'START', { input: parsedText });
    if (scores.privacy_score > 0.85) {
      logger.security(`PII detected (score: ${scores.privacy_score.toFixed(2)}). Job discarded.`);
      
      updateIngestionTrace(traceId, 'Privacy Gate', 'FAILED', {
        input: parsedText,
        error: 'Privacy threshold exceeded (PII Blocked)',
        metadata: { privacy_score: scores.privacy_score }
      });
      updateIngestionTrace(traceId, 'Complete', 'FAILED', {
        error: 'PII block'
      });

      broadcastToWorkspace(String(workspaceId), 'PRIVACY_SHIELD_TRIGGERED', {
        workspaceId,
        channelName: channel,
        sender,
        status: 'BLOCKED',
        reason: 'Privacy threshold exceeded'
      });
      return { status: 'DISCARDED', reason: 'PRIVACY_SHIELD_TRIGGERED' };
    }
    
    updateIngestionTrace(traceId, 'Privacy Gate', 'SUCCESS', {
      input: parsedText,
      output: 'CLEARED',
      metadata: { privacy_score: scores.privacy_score }
    });

    // 4. Incident Engine Stage
    updateIngestionTrace(traceId, 'Incident Engine', 'START', { input: parsedText });
    const incident = detectIncidents(workspaceId, parsedText, job.data.metadata);
    if (incident) liveMetrics.totalIncidents++;
    updateIngestionTrace(traceId, 'Incident Engine', 'SUCCESS', {
      input: parsedText,
      output: incident ? incident : 'No incident detected',
      metadata: { detected: !!incident }
    });

    // 5. Decision Engine Stage
    updateIngestionTrace(traceId, 'Decision Engine', 'START', { input: parsedText });
    const decision = extractDecisions(workspaceId, parsedText, job.data.metadata, sender);
    if (decision) liveMetrics.totalDecisions++;
    updateIngestionTrace(traceId, 'Decision Engine', 'SUCCESS', {
      input: parsedText,
      output: decision ? decision : 'No decision detected',
      metadata: { detected: !!decision }
    });

    // 6. Memory Stage
    updateIngestionTrace(traceId, 'Memory', 'START', { input: scores });
    let retention_policy = '24_HOURS';
    if (scores.importance_score > 0.8 && scores.authority_score > 0.8) {
      retention_policy = 'PERMANENT';
    } else if (scores.importance_score > 0.5 || scores.authority_score > 0.5) {
      retention_policy = '30_DAYS';
    }
    const memoryMetadata = { ...scores, retention_policy };
    job.data.metadata = { ...(job.data.metadata || {}), ...memoryMetadata, traceId };
    
    updateIngestionTrace(traceId, 'Memory', 'SUCCESS', {
      input: scores,
      output: retention_policy,
      metadata: { retention_policy }
    });

    // 7. Entity Extractor
    updateIngestionTrace(traceId, 'Entity Extractor', 'START', { input: parsedText });
    let entities = [];
    try {
      const { extractEntitiesFromText } = await import('../services/knowledgeGraphService.js');
      entities = extractEntitiesFromText(parsedText);
    } catch (e) {
      console.warn('Entity extraction failed:', e.message);
    }
    updateIngestionTrace(traceId, 'Entity Extractor', 'SUCCESS', {
      input: parsedText,
      output: entities
    });
    emitSafe(ST.ENTITY_EXTRACTED, { status: 'ok', count: entities.length });

    // 8. Knowledge Graph Node Sync
    updateIngestionTrace(traceId, 'Knowledge Graph', 'START', { input: entities });
    try {
      const { registerEntity } = await import('../services/knowledgeGraphService.js');
      for (const ent of entities) {
        registerEntity(ent, 'CONCEPT', ent);
        liveMetrics.totalNodes++;
      }
    } catch (e) {
      console.warn('Knowledge graph update failed:', e.message);
    }
    updateIngestionTrace(traceId, 'Knowledge Graph', 'SUCCESS', {
      input: entities,
      output: `Sync completed. Integrated ${entities.length} concepts.`
    });

    // 9. Process and Vectorize
    logger.memory(`Intent Classification: Chunk is safe. Routing to Brain Service.`);
    const result = await processIncomingIntel(workspaceId, channel, `[${sender}] ${parsedText}`, job.data.metadata);

    updateIngestionTrace(traceId, 'Complete', 'SUCCESS', {
      output: result
    });

    // Safe trace: only OPERATIONAL_INTEL is embedded + indexed into the vector
    // store and thereby made retrievable. Other routes (social/private/discard)
    // are terminal and honestly recorded as not-indexed.
    const _indexed = result?.scope === 'OPERATIONAL_INTEL' || result?.status === 'STORED' || result?.status === 'PROCESSED';
    if (result?.status !== 'DISCARDED' && _indexed) {
      emitSafe(ST.EMBEDDED,  { status: 'ok' });
      emitSafe(ST.INDEXED,   { status: 'ok' });
      emitSafe(ST.AVAILABLE_FOR_RETRIEVAL, { status: 'ok' });
    } else {
      emitSafe(ST.EMBEDDED, { status: 'skipped', errorCode: result?.scope || result?.status || 'NOT_OPERATIONAL' });
    }

    // 10. Publish to the unified Event Platform (non-blocking side-effect).
    // origin:'ingestion' prevents the brain subscriber from re-enqueuing this
    // event back into ingestion (loop-prevention invariant).
    if (result?.status !== 'DISCARDED') {
      import('../events/index.js')
        .then(({ publish }) => {
          const { workspaceId, platform, sender, channel, text } = job.data;
          const isIncident = /incident|outage|down|sev[0-2]|p[01]/i.test(text || '');
          return publish(platform || 'ingestion_worker', isIncident ? 'incident' : 'message', {
            text, sender, channel, platform,
            traceId: job.data.metadata?.traceId, ...job.data.metadata,
          }, { workspaceId, metadata: { origin: 'ingestion', _traceEventId: job.data.metadata?._traceEventId } });
        })
        .catch(() => {});
    }

    broadcastToWorkspace(String(workspaceId), 'INGESTION_COMPLETE', {
      workspaceId,
      sourcesProcessed: [plat],
      status: result.status,
      scope: result.scope
    });

    return result;
  } catch (error) {
    updateIngestionTrace(traceId, 'Complete', 'FAILED', {
      error: error.message
    });
    console.error("Memory Brain Processing Error:", error);
    throw error;
  }
}, { connection });

ingestionWorker.on('completed', (job) => {
  logger.queue(`Job ${job.id} completed successfully.`);
});

ingestionWorker.on('failed', (job, err) => {
  logger.error(`Job ${job.id} failed: ${err.message}`);
});
