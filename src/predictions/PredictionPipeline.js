/**
 * PredictionPipeline — assembles the shared prediction context ONCE (so every
 * model reasons over the same real signals) and runs the selected models. All
 * inputs come from the existing platform: the event store, the Operational Graph,
 * workspace health, memory, and the Simulation Engine.
 */

import { buildStream } from '../replay/ReplayBuilder.js';
import * as G from '../graph/index.js';
import db from '../config/db.js';
import { queryAllMemory } from '../services/orgMemoryService.js';
import { calculateWorkspaceHealth } from '../services/healthScoreService.js';
import { simulate } from '../simulation/index.js';
import { detectPatterns } from './PatternDetector.js';
import { dailySeries } from './TrendAnalyzer.js';
import { MODELS } from './PredictionModels.js';
import { logger } from '../utils/logger.js';

const WINDOW_DAYS = 60;
const safe = async (fn, fb) => { try { return await fn(); } catch (err) { logger.rag(`[predict] ${err.message}`); return fb; } };

export async function buildContext(workspaceId) {
  const since = new Date(Date.now() - WINDOW_DAYS * 86_400_000).toISOString();
  const until = new Date().toISOString();

  const [{ events }, graphMetrics, orphanRepos, memory, healthRaw, meetingRows] = await Promise.all([
    safe(() => buildStream(workspaceId, { since, until, limit: 8000 }), { events: [] }),
    safe(() => G.metrics(workspaceId), { byNodeType: [], byEdgeType: [], nodeCount: 0, edgeCount: 0 }),
    safe(() => G.findOrphans(workspaceId, 'REPOSITORY'), []),
    safe(() => queryAllMemory(workspaceId, { hours: 24 * 90, limit: 100 }), []),
    safe(() => calculateWorkspaceHealth(workspaceId), null),
    safe(() => db.query(
      `SELECT n.name, count(*)::int c FROM graph_edges e JOIN graph_nodes n ON n.id = e.source_id
        WHERE e.workspace_id = $1 AND e.relationship_type = 'ATTENDED' GROUP BY n.name ORDER BY c DESC`, [workspaceId]), { rows: [] }),
  ]);

  const byType = {}, byActor = {}, byConnector = {};
  for (const e of events) {
    byType[e.eventType] = (byType[e.eventType] || 0) + 1;
    byConnector[e.connector] = (byConnector[e.connector] || 0) + 1;
    const a = e.actor?.name || e.actor?.id;
    if (a) byActor[a] = (byActor[a] || 0) + 1;
  }
  const meetingsByActor = Object.fromEntries((meetingRows.rows || []).map(r => [r.name, r.c]));
  const health = healthRaw?.score ?? healthRaw?.overallScore ?? (typeof healthRaw === 'number' ? healthRaw : 70);

  return {
    workspaceId,
    events,
    byType, byActor, byConnector, meetingsByActor,
    incidents: events.filter(e => e.eventType === 'incident'),
    deployments: events.filter(e => e.eventType === 'deployment'),
    meetings: events.filter(e => e.eventType === 'meeting'),
    customerEvents: events.filter(e => e.eventType === 'customer'),
    velocitySeries: dailySeries(events, WINDOW_DAYS),
    patterns: detectPatterns(events),
    graph: { metrics: graphMetrics, orphanRepos },
    health, memory,
    windowDays: WINDOW_DAYS,
    resolveEmployee: (name) => safe(async () => (await G.searchNodes(workspaceId, { type: 'EMPLOYEE', text: name, limit: 1 }))[0], null),
    resolveCustomer: (name) => safe(async () => (await G.searchNodes(workspaceId, { type: 'CUSTOMER', text: name, limit: 1 }))[0] || (await G.searchNodes(workspaceId, { text: name, limit: 1 }))[0], null),
    simulate: (input) => simulate(workspaceId, input, { persist: false }),
  };
}

/** Run the given model types over a prepared context. */
export async function runModels(ctx, types) {
  const out = [];
  for (const type of types) {
    const model = MODELS[type];
    if (!model) continue;
    const raw = await safe(() => model.run(ctx), { probability: 0, insufficient: true, evidence: ['model error'], drivers: [] });
    out.push({ type, domain: model.domain, label: model.label, ...raw });
  }
  return out;
}
