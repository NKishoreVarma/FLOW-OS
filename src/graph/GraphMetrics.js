/**
 * GraphMetrics — twin-wide health: counts, type breakdowns, density, orphans.
 */

import db from '../config/db.js';

export async function metrics(workspaceId) {
  const ws = String(workspaceId);
  const [nodes, edges, byNode, byEdge, orphans] = await Promise.all([
    db.query(`SELECT count(*)::int c FROM graph_nodes WHERE workspace_id = $1`, [ws]),
    db.query(`SELECT count(*)::int c FROM graph_edges WHERE workspace_id = $1`, [ws]),
    db.query(`SELECT type, count(*)::int c FROM graph_nodes WHERE workspace_id = $1 GROUP BY type ORDER BY c DESC`, [ws]),
    db.query(`SELECT relationship_type AS type, count(*)::int c FROM graph_edges WHERE workspace_id = $1 GROUP BY relationship_type ORDER BY c DESC`, [ws]),
    db.query(
      `SELECT count(*)::int c FROM graph_nodes n
        WHERE n.workspace_id = $1
          AND NOT EXISTS (SELECT 1 FROM graph_edges e WHERE e.workspace_id = $1 AND (e.source_id = n.id OR e.target_id = n.id))`,
      [ws]),
  ]);

  const nodeCount = nodes.rows[0].c;
  const edgeCount = edges.rows[0].c;
  // Directed graph density = edges / (nodes * (nodes-1)).
  const density = nodeCount > 1 ? +(edgeCount / (nodeCount * (nodeCount - 1))).toFixed(6) : 0;

  return {
    workspaceId: ws,
    nodeCount,
    edgeCount,
    avgDegree: nodeCount ? +(2 * edgeCount / nodeCount).toFixed(2) : 0,
    density,
    orphanNodes: orphans.rows[0].c,
    byNodeType: byNode.rows,
    byEdgeType: byEdge.rows,
  };
}
