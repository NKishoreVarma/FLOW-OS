/**
 * DependencyAnalyzer — maps upstream/downstream dependencies for any node.
 *
 * Answers:
 *   "What systems does Payments depend on?"     → upstream
 *   "What depends on the Auth service?"         → downstream
 *   "Find orphaned services"                    → orphans
 *   "Find stale dependencies"                   → stale
 */

import { dependencyChain, traverse } from './TraversalEngine.js';

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Get the full dependency tree for a node.
 *
 * @param {string} workspaceId
 * @param {string} nodeId
 * @param {{ maxDepth?, includeStale?, minConfidence? }} [opts]
 * @returns {Promise<{
 *   nodeId: string,
 *   upstream: DependencyResult[],
 *   downstream: DependencyResult[],
 *   criticalPath: DependencyResult[],
 *   orphanRisk: boolean,
 * }>}
 */
export async function analyzeDependencies(workspaceId, nodeId, opts = {}) {
  const { maxDepth = 5, minConfidence = 0 } = opts;

  const [upstream, downstream] = await Promise.all([
    // Upstream: what does this node depend on?
    dependencyChain(workspaceId, nodeId, { maxDepth, minEdgeConfidence: minConfidence }),
    // Downstream: what depends on this node?
    traverse(workspaceId, [nodeId], {
      direction:         'inbound',
      relationshipTypes: ['depends_on'],
      maxDepth,
      minEdgeConfidence: minConfidence,
    }),
  ]);

  const upstreamResults   = upstream.map(r => _toDependencyResult(r, 'upstream'));
  const downstreamResults = downstream.map(r => _toDependencyResult(r, 'downstream'));

  const criticalPath = _findCriticalPath(upstreamResults, downstreamResults);
  const orphanRisk   = upstreamResults.length === 0 && downstreamResults.length === 0;

  return {
    nodeId,
    upstream:     upstreamResults,
    downstream:   downstreamResults,
    criticalPath,
    orphanRisk,
  };
}

/**
 * Find nodes that have no inbound depends_on edges — they are "leaf" dependencies
 * that nothing else depends on. Useful for finding orphaned services.
 *
 * @param {string} workspaceId
 * @param {{ entityTypes? }} [opts]
 */
export async function findOrphans(workspaceId, opts = {}) {
  const { pool } = await import('../../config/db.js');
  const { entityTypes } = opts;

  const etCond  = entityTypes?.length
    ? `AND n.entity_type = ANY($2)`
    : '';
  const params  = [workspaceId];
  if (entityTypes?.length) params.push(entityTypes);

  const { rows } = await pool.query(
    `SELECT n.* FROM kg_nodes n
     WHERE n.workspace_id = $1 ${etCond}
       AND NOT EXISTS (
         SELECT 1 FROM kg_edges e
         WHERE e.workspace_id = $1
           AND e.relationship_type = 'depends_on'
           AND (e.source_id = n.id OR e.target_id = n.id)
       )
     ORDER BY n.confidence DESC LIMIT 100`,
    params
  );
  return rows;
}

/**
 * Find dependency edges whose last_observed_at is older than `staleDays` days.
 *
 * @param {string} workspaceId
 * @param {number} [staleDays=90]
 */
export async function findStaleDependencies(workspaceId, staleDays = 90) {
  const { pool } = await import('../../config/db.js');
  const { rows } = await pool.query(
    `SELECT e.*,
            s.name AS source_name, s.entity_type AS source_type,
            t.name AS target_name, t.entity_type AS target_type
     FROM kg_edges e
     JOIN kg_nodes s ON s.id = e.source_id
     JOIN kg_nodes t ON t.id = e.target_id
     WHERE e.workspace_id = $1
       AND e.relationship_type = 'depends_on'
       AND e.last_observed_at < NOW() - INTERVAL '1 day' * $2
     ORDER BY e.last_observed_at ASC LIMIT 200`,
    [workspaceId, staleDays]
  );
  return rows;
}

/**
 * Service dependency map — return all depends_on edges for SERVICE nodes.
 * Used for ServiceDependencyMapper visual.
 *
 * @param {string} workspaceId
 */
export async function buildServiceDependencyMap(workspaceId) {
  const { pool } = await import('../../config/db.js');
  const { rows } = await pool.query(
    `SELECT
       s.id AS source_id, s.name AS source_name, s.properties AS source_props,
       t.id AS target_id, t.name AS target_name, t.properties AS target_props,
       e.confidence, e.observation_count, e.last_observed_at
     FROM kg_edges e
     JOIN kg_nodes s ON s.id = e.source_id AND s.entity_type IN ('SERVICE','REPOSITORY','ENVIRONMENT')
     JOIN kg_nodes t ON t.id = e.target_id AND t.entity_type IN ('SERVICE','REPOSITORY','ENVIRONMENT')
     WHERE e.workspace_id = $1
       AND e.relationship_type = 'depends_on'
     ORDER BY e.confidence DESC`,
    [workspaceId]
  );

  // Build adjacency list
  const nodes = new Map();
  const edges = [];

  for (const r of rows) {
    if (!nodes.has(r.source_id)) nodes.set(r.source_id, { id: r.source_id, name: r.source_name, properties: r.source_props });
    if (!nodes.has(r.target_id)) nodes.set(r.target_id, { id: r.target_id, name: r.target_name, properties: r.target_props });
    edges.push({
      from:           r.source_id,
      to:             r.target_id,
      confidence:     r.confidence,
      observations:   r.observation_count,
      lastObserved:   r.last_observed_at,
    });
  }

  return { nodes: [...nodes.values()], edges };
}

// ── Internal ──────────────────────────────────────────────────────────────────

function _toDependencyResult(traversalResult, direction) {
  return {
    node:       traversalResult.node,
    direction,
    depth:      traversalResult.depth,
    isCritical: traversalResult.pathConfidence >= 0.8 && traversalResult.depth <= 2,
    edgeType:   traversalResult.edgeType,
    pathConfidence: traversalResult.pathConfidence,
  };
}

function _findCriticalPath(upstream, downstream) {
  // Critical = high confidence + shallow depth in both directions
  const critical = [...upstream, ...downstream].filter(d =>
    d.isCritical && d.pathConfidence >= 0.75
  );
  return critical.sort((a, b) => b.pathConfidence - a.pathConfidence).slice(0, 10);
}
