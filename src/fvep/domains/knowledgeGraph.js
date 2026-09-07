import { query } from '../../config/db.js';

export const DOMAIN = 'knowledgeGraph';

export async function evaluate(workspaceId) {
  const metrics = {};
  const findings = [];

  // ── Node inventory & freshness ────────────────────────────────────────────
  try {
    const r = await query(
      `SELECT COUNT(*)::int AS total_nodes,
              COUNT(*) FILTER (WHERE last_observed_at > NOW() - INTERVAL '7 days')::int  AS fresh_7d,
              COUNT(*) FILTER (WHERE last_observed_at > NOW() - INTERVAL '30 days')::int AS fresh_30d,
              COUNT(DISTINCT type)::int AS distinct_types
       FROM graph_nodes
       WHERE workspace_id = $1`,
      [workspaceId]
    );
    const row = r.rows[0] ?? {};
    metrics.totalNodes    = row.total_nodes    ?? 0;
    metrics.freshNodes7d  = row.fresh_7d       ?? 0;
    metrics.freshNodes30d = row.fresh_30d      ?? 0;
    metrics.distinctTypes = row.distinct_types ?? 0;
    metrics.freshness30d  = metrics.totalNodes > 0
      ? Math.round((metrics.freshNodes30d / metrics.totalNodes) * 100)
      : null;

    if (metrics.totalNodes < 10)
      findings.push(`Only ${metrics.totalNodes} graph nodes — workspace twin is sparse.`);
    if (metrics.freshness30d !== null && metrics.freshness30d < 50)
      findings.push(`${100 - metrics.freshness30d}% of nodes have not been observed in 30 days — graph is stale.`);
  } catch {
    return { domain: DOMAIN, score: null, status: 'insufficient_data', metrics, findings: ['graph_nodes table not accessible.'] };
  }

  // ── Edge inventory & connectivity ─────────────────────────────────────────
  try {
    const r = await query(
      `SELECT COUNT(*)::int AS total_edges,
              COUNT(DISTINCT type)::int AS distinct_edge_types,
              COUNT(DISTINCT source_id)::int AS connected_sources
       FROM graph_edges
       WHERE workspace_id = $1`,
      [workspaceId]
    );
    const row = r.rows[0] ?? {};
    metrics.totalEdges       = row.total_edges       ?? 0;
    metrics.distinctEdgeTypes = row.distinct_edge_types ?? 0;
    metrics.connectedSources  = row.connected_sources   ?? 0;
    metrics.avgEdgesPerNode   = metrics.totalNodes > 0
      ? parseFloat((metrics.totalEdges / metrics.totalNodes).toFixed(2))
      : 0;

    if (metrics.avgEdgesPerNode < 1)
      findings.push(`Average connectivity is ${metrics.avgEdgesPerNode} edges/node — graph is weakly connected.`);
    if (metrics.distinctEdgeTypes < 3)
      findings.push(`Only ${metrics.distinctEdgeTypes} relationship types present — relationship richness is low.`);
  } catch {
    metrics.totalEdges = 0;
  }

  // ── Orphan nodes (no edges) ───────────────────────────────────────────────
  try {
    const r = await query(
      `SELECT COUNT(*)::int AS orphans
       FROM graph_nodes gn
       WHERE gn.workspace_id = $1
         AND NOT EXISTS (
           SELECT 1 FROM graph_edges ge
           WHERE ge.workspace_id = $1
             AND (ge.source_id = gn.id OR ge.target_id = gn.id)
         )`,
      [workspaceId]
    );
    metrics.orphanNodes = r.rows[0]?.orphans ?? 0;
    const orphanRate = metrics.totalNodes > 0
      ? Math.round((metrics.orphanNodes / metrics.totalNodes) * 100)
      : 0;
    metrics.orphanRate = orphanRate;
    if (orphanRate > 30)
      findings.push(`${orphanRate}% orphan nodes — entity sync may be incomplete.`);
  } catch {
    metrics.orphanNodes = 0;
  }

  if (metrics.totalNodes === 0) {
    return { domain: DOMAIN, score: null, status: 'insufficient_data', metrics, findings };
  }

  // ── Score ─────────────────────────────────────────────────────────────────
  const nodeScore      = Math.min(100, metrics.totalNodes * 2);
  const freshnessScore = metrics.freshness30d ?? 40;
  const connectScore   = Math.min(100, metrics.avgEdgesPerNode * 20);
  const typeScore      = Math.min(100, metrics.distinctTypes * 10);
  const noOrphanScore  = Math.max(0, 100 - metrics.orphanRate);

  const score = Math.round(
    nodeScore      * 0.20 +
    freshnessScore * 0.30 +
    connectScore   * 0.25 +
    typeScore      * 0.10 +
    noOrphanScore  * 0.15
  );

  return { domain: DOMAIN, score, metrics, findings };
}
