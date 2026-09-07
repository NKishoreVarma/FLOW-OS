/**
 * DependencyAnalyzer — "what does this depend on?", plus orphan and staleness
 * detection ("repositories owned by nobody", "documents that are stale").
 */

import db from '../config/db.js';
import { dependencyChain } from './TraversalEngine.js';

export async function analyzeDependencies(workspaceId, nodeId, maxDepth = 3) {
  const chain = await dependencyChain(workspaceId, nodeId, maxDepth);
  const byType = {};
  for (const n of chain) byType[n.type] = (byType[n.type] || 0) + 1;
  return { nodeId, dependencyCount: chain.length, byType, dependencies: chain.slice(0, 100) };
}

/**
 * Nodes of a given type with no incoming ownership/authorship edge —
 * e.g. repositories owned by nobody, projects with no lead.
 */
export async function findOrphans(workspaceId, type, { ownershipEdges = ['OWNS', 'CREATED', 'ASSIGNED_TO', 'REPORTS_TO'] } = {}) {
  const { rows } = await db.query(
    `SELECT n.id, n.name, n.type, n.last_observed_at
       FROM graph_nodes n
      WHERE n.workspace_id = $1 AND n.type = $2
        AND NOT EXISTS (
          SELECT 1 FROM graph_edges e
           WHERE e.workspace_id = $1 AND e.target_id = n.id
             AND e.relationship_type = ANY($3)
        )
      ORDER BY n.last_observed_at ASC
      LIMIT 200`,
    [String(workspaceId), type, ownershipEdges],
  );
  return rows;
}

/** Nodes not observed since `days` ago — stale documents, dormant projects, etc. */
export async function findStale(workspaceId, { type = null, days = 90, limit = 100 } = {}) {
  const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();
  const params = [String(workspaceId), cutoff];
  let typeClause = '';
  if (type) { params.push(type); typeClause = `AND type = $3`; }
  params.push(limit);
  const { rows } = await db.query(
    `SELECT id, name, type, last_observed_at
       FROM graph_nodes
      WHERE workspace_id = $1 AND last_observed_at < $2 ${typeClause}
      ORDER BY last_observed_at ASC
      LIMIT $${params.length}`,
    params,
  );
  return rows;
}
