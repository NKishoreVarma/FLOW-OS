/**
 * GraphIndex — structural statistics: node degree and the most-connected ("hub")
 * nodes. Reads the durable graph; the DB indexes from the v11.1 migration keep
 * these queries cheap.
 */

import db from '../config/db.js';
import { nodeKey } from './nodeTypes.js';

/** Degree (edge count) of a node, split by direction. */
export async function degree(workspaceId, nodeId) {
  const id = nodeId.startsWith(`${workspaceId}:`) ? nodeId : nodeKey(workspaceId, nodeId);
  const { rows } = await db.query(
    `SELECT
        COUNT(*) FILTER (WHERE source_id = $2)::int AS out_degree,
        COUNT(*) FILTER (WHERE target_id = $2)::int AS in_degree,
        COUNT(*)::int AS total
       FROM graph_edges WHERE workspace_id = $1 AND (source_id = $2 OR target_id = $2)`,
    [String(workspaceId), id],
  );
  return rows[0];
}

/** Most-connected nodes (hubs) — highest total degree. */
export async function topConnected(workspaceId, limit = 20) {
  const { rows } = await db.query(
    `SELECT n.id, n.type, n.name, d.deg
       FROM (
         SELECT node_id, COUNT(*)::int AS deg FROM (
           SELECT source_id AS node_id FROM graph_edges WHERE workspace_id = $1
           UNION ALL
           SELECT target_id AS node_id FROM graph_edges WHERE workspace_id = $1
         ) z GROUP BY node_id
       ) d
       JOIN graph_nodes n ON n.id = d.node_id
      ORDER BY d.deg DESC LIMIT $2`,
    [String(workspaceId), limit],
  );
  return rows;
}
