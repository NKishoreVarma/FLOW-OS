/**
 * FLOW OS — Executive Dashboard (Phase 15)
 *
 * Runs the six agents' lighter healthReport() passes in parallel (fault-isolated) and
 * assembles one dashboard: a health card per domain (status · top risks · top
 * opportunities · recommended actions). Cached ~10 minutes per workspace so the
 * landing view is fast; the full debate reasoning stays on /ask.
 */

import { AGENT_IDS } from './agents/registry.js';
import { makeAgent } from './agents/ExecutiveAgent.js';

const CACHE_TTL_MS = 10 * 60 * 1000;
const cache = new Map(); // workspaceId → { at, data }

const STATUS_SCORE = { healthy: 3, watch: 2, at_risk: 1, unknown: 0 };

export async function getDashboard(workspaceId, { force = false } = {}) {
  const hit = cache.get(workspaceId);
  if (!force && hit && Date.now() - hit.at < CACHE_TTL_MS) {
    return { ...hit.data, cached: true };
  }

  const agents = AGENT_IDS.map(makeAgent).filter(Boolean);
  const settled = await Promise.allSettled(agents.map((a) => a.healthReport(workspaceId)));
  const cards = settled.map((s, i) =>
    s.status === 'fulfilled'
      ? s.value
      : { agent: AGENT_IDS[i], title: AGENT_IDS[i], status: 'unknown', score: null, topRisks: [], topOpportunities: [], recommendedActions: [] }
  );

  const overall = overallStatus(cards);
  const data = {
    workspaceId,
    generatedAt: new Date().toISOString(),
    overall,
    cards,
    cached: false,
  };
  cache.set(workspaceId, { at: Date.now(), data });
  return data;
}

function overallStatus(cards) {
  const known = cards.filter((c) => c.status && c.status !== 'unknown');
  if (!known.length) return 'unknown';
  if (known.some((c) => c.status === 'at_risk')) return 'at_risk';
  if (known.some((c) => c.status === 'watch')) return 'watch';
  return 'healthy';
}

export function statusRank(status) { return STATUS_SCORE[status] ?? 0; }

export function clearDashboardCache(workspaceId) {
  if (workspaceId) cache.delete(workspaceId); else cache.clear();
}

export default { getDashboard, clearDashboardCache, statusRank };
