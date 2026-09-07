/**
 * AgentContextBuilder — assembles a rich, structured context object for agent reasoning.
 *
 * Runs once per reasoning session. All 19 agents share this context; each agent
 * then filters it to domain-relevant items via BaseAgent.filterContext().
 *
 * Output shape (AgentContext):
 * {
 *   workspaceId,  orgId,  intent,
 *   vectors:      RAG chunks from pgvector,
 *   memory:       org memory records (decisions / incidents / events),
 *   graphNodes:   KG nodes matching intent entities,
 *   graphNeighbors: Map<nodeId, neighbor[]>,
 *   recentEvents: recent flow_events from event platform,
 *   workflows:    recent workflow executions,
 *   policies:     active governance policies,
 *   health:       workspace health snapshot,
 *   buildDurationMs,
 * }
 */

import { gatherAll, queryGraphNodes, queryGraphNeighbors } from '../memory/AgentMemoryInterface.js';

/**
 * Build context for all agents participating in a reasoning session.
 *
 * @param {string} workspaceId
 * @param {string} orgId
 * @param {import('../../ai/reasoning/IntentAnalyzer.js').IntentResult} intent
 * @returns {Promise<AgentContext>}
 */
export async function buildAgentContext(workspaceId, orgId, intent) {
  const t0    = Date.now();
  const query = _buildQuery(intent);

  // Phase 1 — gather all memory sources in parallel
  const bundle = await gatherAll(workspaceId, orgId, query, {
    vectorLimit:   12,
    memoryHours:   intent.timeframe === 'past_24h' ? 24 : 168,
    workflowLimit: 15,
  });

  // Phase 2 — KG lookup for named entities from intent (best-effort)
  const graphNodes = await _resolveEntities(workspaceId, intent);

  // Phase 3 — fetch immediate neighbors for found nodes (top 5 only to bound latency)
  const graphNeighbors = await _fetchNeighbors(workspaceId, graphNodes.slice(0, 5));

  return {
    workspaceId,
    orgId,
    intent,
    vectors:         bundle.vectors || [],
    memory:          bundle.memory  || [],
    graphNodes,
    graphNeighbors,
    recentEvents:    bundle.events     || [],
    workflows:       bundle.workflows  || [],
    policies:        bundle.policies   || [],
    health:          bundle.health,
    buildDurationMs: Date.now() - t0,
  };
}

// ── Internals ─────────────────────────────────────────────────────────────────

function _buildQuery(intent) {
  const parts = [intent.question];
  if (intent.searchTerms?.length) parts.push(intent.searchTerms.join(' '));
  if (intent.entities?.length)    parts.push(intent.entities.map(e => e.name).join(' '));
  return parts.join(' ').slice(0, 500);
}

async function _resolveEntities(workspaceId, intent) {
  if (!intent.entities?.length) return [];

  const results = await Promise.allSettled(
    intent.entities.slice(0, 5).map(e =>
      queryGraphNodes(workspaceId, e.name, null)
    )
  );

  const found = [];
  const seen  = new Set();
  for (const r of results) {
    if (r.status !== 'fulfilled') continue;
    for (const node of (r.value || [])) {
      if (!seen.has(node.id)) { seen.add(node.id); found.push(node); }
    }
  }
  return found.slice(0, 20);
}

async function _fetchNeighbors(workspaceId, nodes) {
  if (!nodes.length) return {};
  const neighborMap = {};
  const settled = await Promise.allSettled(
    nodes.map(n => queryGraphNeighbors(workspaceId, n.id).then(ns => [n.id, ns]))
  );
  for (const r of settled) {
    if (r.status === 'fulfilled') {
      const [id, ns] = r.value;
      neighborMap[id] = ns || [];
    }
  }
  return neighborMap;
}
