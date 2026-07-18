/**
 * ContextAssembler — gathers workspace intelligence into a structured context
 * object that PromptBuilder can inject into any prompt.
 *
 * This is the memory retrieval + knowledge graph expansion step that happens
 * BEFORE the LLM is called. The assembled context is the FLOW "brain" output
 * — the LLM only provides the final synthesis.
 */

import { retrieveContext } from '../services/retrievalService.js';
import { getRelatedContext } from '../services/operationalGraphService.js';
import { queryAllMemory } from '../services/orgMemoryService.js';
import { calculateWorkspaceHealth } from '../services/healthScoreService.js';

/**
 * Assemble full workspace context for a copilot query.
 *
 * @param {Object} opts
 * @param {string}   opts.workspaceId
 * @param {string}   opts.query         - Used for RAG retrieval
 * @param {string}   [opts.entityId]    - Expand KG from this entity
 * @param {boolean}  [opts.includeHealth] - Include health score section
 * @param {boolean}  [opts.includeMemory] - Include recent memory
 * @param {number}   [opts.maxChunks]
 * @returns {Promise<Object>}           - Context object for PromptBuilder
 */
export async function assembleContext({
  workspaceId,
  query,
  entityId,
  includeHealth = true,
  includeMemory = true,
  maxChunks     = 8,
}) {
  const wsId = String(workspaceId);
  const traceId = `ctx-${Date.now()}`;
  const ctx = {};

  // 1. RAG retrieval — semantic + keyword search over workspace intel
  if (query) {
    try {
      const chunks = await retrieveContext(wsId, query, traceId);
      const top    = Array.isArray(chunks) ? chunks.slice(0, maxChunks) : [];
      ctx.knowledge = top
        .map(c => _extractText(c))
        .filter(Boolean)
        .join('\n---\n');
      ctx.rawChunks = top;
    } catch {
      ctx.knowledge = null;
      ctx.rawChunks = [];
    }
  }

  // 2. Knowledge graph expansion (2-hop neighbours)
  if (entityId) {
    try {
      const graphCtx = await getRelatedContext(wsId, entityId, 2);
      if (graphCtx?.length) {
        ctx.graphContext = graphCtx.join('\n');
      }
    } catch { /* non-fatal */ }
  }

  // 3. Workspace health score
  if (includeHealth) {
    try {
      const health   = await calculateWorkspaceHealth(wsId);
      ctx.health     = `Health ${health.company_health}/100 | Engineering ${health.sectors?.engineering ?? '?'} | Delivery ${health.sectors?.delivery ?? '?'} | Customer ${health.sectors?.customer ?? '?'}`;
      ctx.healthData = health;
    } catch { /* non-fatal */ }
  }

  // 4. Recent memory (last 48 hours, up to 5 records)
  if (includeMemory) {
    try {
      const records = await queryAllMemory(wsId, { hours: 48, limit: 5 });
      if (records?.length) {
        ctx.memory = records
          .map(r => `[${r.type}] ${r.title}`)
          .join('\n');
      }
    } catch { /* non-fatal */ }
  }

  return ctx;
}

/**
 * Lightweight context for time-sensitive paths (briefing, health checks).
 * Skips RAG retrieval to save latency.
 */
export async function assembleHealthContext(workspaceId) {
  const wsId = String(workspaceId);
  const ctx  = {};
  try {
    ctx.healthData = await calculateWorkspaceHealth(wsId);
    ctx.health     = `Health ${ctx.healthData.company_health}/100`;
  } catch { /* non-fatal */ }
  try {
    const records = await queryAllMemory(wsId, { hours: 24, limit: 3 });
    if (records?.length) ctx.memory = records.map(r => r.title).join('; ');
  } catch { /* non-fatal */ }
  return ctx;
}

// ── Evidence builder for response formatting ─────────────────────────────────

/**
 * Build evidence array from raw RAG chunks for API response metadata.
 */
export function buildEvidence(chunks = [], maxItems = 5) {
  return chunks.slice(0, maxItems).map(c => ({
    text:   _extractText(c).substring(0, 120),
    source: c.source || c.metadata?.source || c.channel || 'workspace',
    score:  c.finalScore || c.score || 0,
  }));
}

function _extractText(chunk) {
  const raw = chunk.text || chunk.content || chunk.markdown || '';
  return raw
    .replace(/^##\s+\[?\d+\]?[^\n]*\n/gm, '')
    .replace(/^>\s+\*\*[^*]+\*\*[^\n]*\n/gm, '')
    .trim();
}
