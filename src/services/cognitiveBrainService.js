import { ask } from '../ai/BrainRouter.js';
import { buildClassifyPrompt } from '../ai/PromptBuilder.js';
import { formatClassification } from '../ai/ResponseFormatter.js';
import { TaskType } from '../ai/types.js';
import redisConnection from '../config/redis.js';
import { saveToVault } from './vaultService.js';
import vectorService from './vectorService.js';
import { broadcastToWorkspace } from './socketService.js';
import * as vectorStoreService from './vectorStoreService.js';
import { evaluateChunk } from './memoryBrain.js';
import { isSocialChatter } from './parserService.js';
import { updateIngestionTrace } from './observabilityService.js';

// ── Per-workspace ingestion cycle counter (module-scoped, lives for process lifetime) ─
// Incremented on every successful processStream run. Gives the dashboard
// a real cumulative count rather than a hardcoded static value.
const ingestionCycleCounters = new Map();


/**
 * Structural Classifier & Multi-Tenant Routing Engine (Cognitive Privacy Gate)
 * Classifies input into OPERATIONAL_INTEL, SOCIAL_COORDINATION, or PRIVATE_PERSONAL
 * and routes or drops the payload accordingly.
 * 
 * @param {string|number} workspaceId - Corporate tenant key
 * @param {string} channelName - Incoming channel name
 * @param {string} rawInputText - Payload content to filter
 * @returns {Promise<Object>} Processed result metadata
 */
export async function processIncomingIntel(workspaceId, channelName, rawInputText, metadata = {}) {
  if (!workspaceId || !rawInputText) {
    throw new Error('Missing mandatory parameters workspaceId or rawInputText.');
  }

  let classification = 'SOCIAL_COORDINATION'; // Safe default scope

  // ── Heuristic keyword parser ────────────────────────────────────
  // Applied immediately when GEMINI_API_KEY is absent (local dev / CI),
  // or as a catch-all fallback if the remote call fails at runtime.
  function applyHeuristicParser(text) {
    const t = String(text).toLowerCase();

    // PRIVATE_PERSONAL signals: PII, financial data, credentials, account numbers
    const privateSignals = [
      'password', 'ssn', 'salary', 'secret', 'private', 'confidential',
      'account number', 'routing', 'payroll', 'clearance', 'credit card',
      'social security', 'dob', 'date of birth', 'passport', 'pin code',
      'security code', 'bank account', 'api key', 'access token'
    ];
    if (privateSignals.some(kw => t.includes(kw))) return 'PRIVATE_PERSONAL';

    // Check for social chatter patterns
    if (isSocialChatter(text)) return 'SOCIAL_COORDINATION';

    // OPERATIONAL_INTEL signals: engineering, security, project, product, and business operations
    const intelSignals = [
      // Engineering / code
      'git', 'schema', 'database', 'function', 'code', 'migrate', 'migration',
      'deploy', 'backend', 'grpc', 'rest', 'api', 'endpoint', 'transport layer',
      'authentication', 'pgvector', 'index', 'configuration', 'update',
      'critical update', 'infrastructure', 'commit', 'pull request', 'pr #',
      'release', 'build', 'pipeline', 'ci/cd', 'test failure', 'regression',
      'bug', 'hotfix', 'patch', 'rollback', 'rollout', 'feature flag',
      // Security / incidents
      'security alert', 'security warning', 'detected', 'unusual', 'login attempt',
      'unauthorized', 'breach', 'vulnerability', 'cve', 'exploit', 'malware',
      'incident', 'outage', 'downtime', 'degraded', 'sla breach', 'p0', 'p1',
      'critical alert', 'alert', 'pagerduty', 'on-call',
      // Project / sprint / delivery
      'sprint', 'velocity', 'story points', 'backlog', 'shipped', 'launched',
      'blocked', 'blocker', 'deadline', 'milestone', 'roadmap', 'okr', 'kpi',
      'review', 'retrospective', 'standup', 'status update', 'progress update',
      'on track', 'at risk', 'delayed', 'completed', 'signed off',
      // Business operations
      'revenue', 'churn', 'renewal', 'customer', 'contract', 'deal', 'pipeline',
      'quota', 'forecast', 'escalation', 'stakeholder', 'executive',
      // People / workforce
      'hired', 'joining', 'resignation', 'team expansion', 'headcount',
    ];
    if (intelSignals.some(kw => t.includes(kw))) return 'OPERATIONAL_INTEL';

    // Default: treat as informal social coordination
    return 'SOCIAL_COORDINATION';
  }

  // ── Classification gate — routes through AI Provider Layer ──────
  try {
    const { messages } = buildClassifyPrompt({ text: rawInputText });
    const result = await ask({ taskType: TaskType.CLASSIFY, messages, maxTokens: 80, temperature: 0.1 });
    const parsed  = formatClassification(result, 'SOCIAL_COORDINATION');
    const VALID   = ['OPERATIONAL_INTEL', 'SOCIAL_COORDINATION', 'PRIVATE_PERSONAL'];
    if (VALID.includes(parsed.category)) {
      classification = parsed.category;
    } else {
      classification = applyHeuristicParser(rawInputText);
    }
  } catch (error) {
    console.warn('⚠️ [Cognitive Brain] AI classification failed — using heuristic:', error.message);
    classification = applyHeuristicParser(rawInputText);
  }
// --- Routing Infrastructure ---
  switch (classification) {
    case 'OPERATIONAL_INTEL': {
      console.log(`🧠 [Cognitive Brain] [OPERATIONAL_INTEL] routing path triggered for Workspace ${workspaceId}`);
      const traceId = metadata.traceId;

      // 1. Save Markdown file directly to Desktop vaults
      if (traceId) {
        updateIngestionTrace(traceId, 'Summary', 'START', { input: rawInputText });
      }
      const filePath = await saveToVault(workspaceId, channelName, rawInputText, metadata);
      if (traceId) {
        updateIngestionTrace(traceId, 'Summary', 'SUCCESS', {
          input: rawInputText,
          output: filePath,
          metadata: { filePath }
        });
      }

      // 2. Pass chunk payload straight to pgvector relational index
      if (vectorService && typeof vectorService.upsertVector === 'function') {
        if (traceId) {
          updateIngestionTrace(traceId, 'Vector Store', 'START', { input: rawInputText });
        }
        await vectorService.upsertVector(workspaceId, rawInputText, channelName, metadata);
      }

      // 3. Broadcast live INTEL_STORED event to all connected workspace dashboard clients
      broadcastToWorkspace(String(workspaceId), 'INTEL_STORED', {
        channelName,
        filePath,
        authorityCoeff: 1.5
      });

      return { status: 'PROCESSED', scope: 'OPERATIONAL_INTEL' };
    }

    case 'SOCIAL_COORDINATION': {
      console.log(`🧠 [Cognitive Brain] [SOCIAL_COORDINATION] routing path triggered for Workspace ${workspaceId}`);
      const traceId = metadata.traceId;
      if (traceId) {
        updateIngestionTrace(traceId, 'Summary', 'START', { input: rawInputText });
      }
      // Temporarily store strictly inside Redis cache expiration block (3600 seconds)
      const redisKey = `social_cache:workspace_${workspaceId}:${channelName}:${Date.now()}`;
      await redisConnection.set(redisKey, rawInputText, 'EX', 3600);
      if (traceId) {
        updateIngestionTrace(traceId, 'Summary', 'SUCCESS', {
          input: rawInputText,
          output: `Cached in Redis with key: ${redisKey}`,
          metadata: { redisKey, ttl: 3600 }
        });
      }
      return { status: 'CACHED', scope: 'SOCIAL_COORDINATION' };
    }

    case 'PRIVATE_PERSONAL':
      // Broadcast shield event BEFORE the drop — payload contains NO raw text
      broadcastToWorkspace(String(workspaceId), 'PRIVACY_SHIELD_TRIGGERED', {
        workspaceId: String(workspaceId),
        channelName
      });
      // Hard programmatic data drop immediately. No logging, tracking, or persisting any bytes.
      rawInputText = null; // Clear from memory reference
      return { status: 'DROPPED', scope: 'PRIVATE_PERSONAL' };

    default:
      return { status: 'DROPPED', scope: 'UNKNOWN' };
  }
}

/**
 * Cognitive Ingestion Stream — Privacy Shield + Vector Knowledge Store.
 *
 * Classifies the incoming text through the privacy gate first.
 * If the message clears the shield as OPERATIONAL_INTEL or SOCIAL_COORDINATION,
 * it is chunked and indexed into the in-memory vector store, then a live
 * INGESTION_CYCLE event is broadcast to all connected dashboard clients.
 *
 * PRIVATE_PERSONAL payloads are hard-dropped with no persistence.
 *
 * @param {string|number} workspaceId - Corporate tenant key
 * @param {string}        rawText     - Full incoming text payload
 * @param {string}        source      - Origin context (e.g. 'slack', 'gmail', 'vault')
 * @returns {Promise<{status: string, indexResult?: Object[]}>}
 */
export async function processStream(workspaceId, rawText, source) {
  if (!workspaceId || !rawText) {
    throw new Error('[Cognitive Brain] processStream: workspaceId and rawText are both required.');
  }

  // ── Step 1: Run the text through the Privacy Shield classifier ──────────────
  const privacyResult = await processIncomingIntel(workspaceId, source, rawText);

  // Hard-drop: PRIVATE_PERSONAL data must never be stored or broadcast
  if (privacyResult.scope === 'PRIVATE_PERSONAL' || privacyResult.status === 'DROPPED') {
    console.log(`🛡️ [Cognitive Brain] processStream: PRIVATE_PERSONAL payload hard-dropped for Workspace ${workspaceId}.`);
    return { status: 'DROPPED', scope: privacyResult.scope };
  }

  // ── Step 2: Memory Brain evaluation — score and decide retention policy ──────
  const memoryEval = evaluateChunk(rawText, {
    workspaceId,
    source,
    sender:  'system',
    channel: source
  });

  // DISCARD policy: drop the chunk before it consumes vector storage
  if (memoryEval.retention_policy === 'DISCARD') {
    console.log(`🗑️ [Cognitive Brain] processStream: Memory Brain DISCARDED chunk for Workspace ${workspaceId} (composite: ${memoryEval.composite_score}).`);
    return {
      status:           'DISCARDED',
      retention_policy: memoryEval.retention_policy,
      scores:           memoryEval
    };
  }

  // ── Step 3: Index cleared content into the in-memory vector knowledge store ─
  console.log(`🧠 [Cognitive Brain] processStream: Privacy shield + Memory Brain cleared — indexing into vector store for Workspace ${workspaceId} (policy: ${memoryEval.retention_policy}).`);

  const indexResult = await vectorStoreService.storeKnowledge(
    workspaceId,
    rawText,
    source
  );

  // ── Step 4: Increment the per-workspace cycle counter ────────────────────────
  const wsKey          = String(workspaceId);
  const ingestionCycles = (ingestionCycleCounters.get(wsKey) || 0) + 1;
  ingestionCycleCounters.set(wsKey, ingestionCycles);

  // ── Step 5: Broadcast the live INTEL_STORED event frame to the dashboard ─────
  broadcastToWorkspace(wsKey, 'INTEL_STORED', {
    type:             'INTEL_STORED',
    status:           'SUCCESS',
    chunksIndexed:    indexResult.chunksIndexed || 1,
    totalNodes:       indexResult.totalNodes    || 1,
    ingestionCycles,
    source:           source,
    retention_policy: memoryEval.retention_policy,
    composite_score:  memoryEval.composite_score,
    textSample:       rawText.substring(0, 120)
  });

  console.log(`✅ [Cognitive Brain] processStream: ${indexResult.chunksIndexed || 1} chunk(s) indexed | Policy: ${memoryEval.retention_policy} | Total nodes: ${indexResult.totalNodes || 1} | Workspace ingestion cycles: ${ingestionCycles}.`);

  return {
    status:           'STORED',
    retention_policy: memoryEval.retention_policy,
    scores:           memoryEval,
    indexResult
  };
}
