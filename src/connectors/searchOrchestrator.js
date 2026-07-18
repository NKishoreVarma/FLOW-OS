/**
 * FLOW OS — Universal Search Orchestrator
 *
 * Fans out a search query to all registered connectors that support
 * the 'search' action type, normalizes results, merges them, and
 * returns a ranked unified result list.
 *
 * Also queries the existing pgvector + vault pipeline (retrievalService)
 * so every search automatically includes company memory.
 *
 * Callers interact with capabilities, not providers.
 */

import { listConnectedAdapters, getByCapability } from './registry.js';
import { hasCredentials } from './authManager.js';
import { ActionType } from './capabilities.js';
import { createSearchResult } from './normalizedTypes.js';

/**
 * Search across all connected connectors + internal memory.
 *
 * @param {string} workspaceId
 * @param {string} query
 * @param {object} opts
 * @param {string[]} [opts.capabilities]  — filter to specific capabilities (default: all)
 * @param {number}  [opts.limit=20]       — max results per connector
 * @param {number}  [opts.total=60]       — max total results returned
 * @returns {Promise<{ results: object[], sources: string[], durationMs: number }>}
 */
export async function universalSearch(workspaceId, query, {
  capabilities = [],
  limit        = 20,
  total        = 60,
} = {}) {
  if (!query?.trim()) return { results: [], sources: [], durationMs: 0 };

  const startMs = Date.now();

  // ── 1. Determine which adapters to query ──────────────────────────────────
  let candidates = capabilities.length
    ? capabilities.flatMap(cap => getByCapability(cap))
    : listConnectedAdapters(workspaceId);

  // Deduplicate (an adapter could satisfy multiple capabilities)
  candidates = [...new Map(candidates.map(a => [a.id, a])).values()];

  // Only adapters that support search
  const searchable = candidates.filter(a => a.supports(ActionType.SEARCH));

  // ── 2. Fan out in parallel ────────────────────────────────────────────────
  const [adapterResults, memoryResults] = await Promise.all([
    fanOutAdapterSearch(workspaceId, query, searchable, limit),
    queryInternalMemory(workspaceId, query, limit),
  ]);

  // ── 3. Merge + rank ───────────────────────────────────────────────────────
  const allResults = [...adapterResults, ...memoryResults];

  // Sort by score descending; break ties by timestamp (newer first)
  allResults.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return (b.timestamp || '') > (a.timestamp || '') ? 1 : -1;
  });

  const deduped  = deduplicateResults(allResults);
  const trimmed  = deduped.slice(0, total);
  const sources  = [...new Set(trimmed.map(r => r.connector).filter(Boolean))];

  return {
    results:    trimmed,
    sources,
    durationMs: Date.now() - startMs,
  };
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

async function fanOutAdapterSearch(workspaceId, query, adapters, limit) {
  if (!adapters.length) return [];

  const settled = await Promise.allSettled(
    adapters.map(adapter =>
      hasCredentials(workspaceId, adapter.id)
        ? adapter.search(workspaceId, query, { limit })
        : Promise.resolve([])
    )
  );

  return settled.flatMap((result, i) => {
    if (result.status === 'rejected') {
      console.warn(`[SearchOrchestrator] ${adapters[i].id} search failed: ${result.reason?.message}`);
      return [];
    }
    return (result.value ?? []).map(item =>
      createSearchResult({
        id:         item.id,
        connector:  adapters[i].id,
        capability: adapters[i].capability,
        type:       item.type || adapters[i].capability,
        title:      item.title || item.subject || '',
        excerpt:    item.excerpt || item.body?.slice(0, 200) || item.summary || '',
        score:      item.score ?? 0.7,
        timestamp:  item.timestamp,
        url:        item.url || null,
        metadata:   item.metadata || {},
      })
    );
  });
}

async function queryInternalMemory(workspaceId, query, limit) {
  // Import lazily to avoid circular deps with retrievalService
  try {
    const { retrieveContext } = await import('../services/retrievalService.js');
    const chunks = await retrieveContext(workspaceId, query, `search-${Date.now()}`);

    return (chunks || []).slice(0, limit).map(chunk =>
      createSearchResult({
        connector:  chunk.source || 'vault',
        capability: 'knowledge',
        type:       'knowledge_document',
        title:      chunk.title || chunk.topicId || 'Memory Record',
        excerpt:    (chunk.text || '').slice(0, 300),
        score:      Math.min((chunk.score || 0) * (chunk.authorityCoeff || 1), 1),
        timestamp:  chunk.timestamp || null,
        metadata:   { origin: chunk.origin, authorityCoeff: chunk.authorityCoeff },
      })
    );
  } catch {
    return [];
  }
}

function deduplicateResults(results) {
  const seen = new Set();
  return results.filter(r => {
    const key = r.connector + ':' + (r.title + r.excerpt).slice(0, 80).toLowerCase().trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
