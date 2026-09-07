/**
 * RelationshipScorer — quantifies relationship strength from edge weight,
 * observation frequency, and recency. Answers "who knows X?", "who collaborates
 * most?", and "how strongly are A and B related?".
 *
 * strength = weight × ln(1 + observation_count) × exp(-age_days / HALF_LIFE)
 */

import db from '../config/db.js';
import { nodeKey } from './nodeTypes.js';
import { shortestPath } from './TraversalEngine.js';

const HALF_LIFE_DAYS = 30;
const STRENGTH_SQL =
  `e.weight * ln(1 + e.observation_count) * exp(-EXTRACT(EPOCH FROM (NOW() - e.last_observed_at)) / (86400.0 * ${HALF_LIFE_DAYS}))`;

function fullId(ws, id) { return id.startsWith(`${ws}:`) ? id : nodeKey(ws, id); }

/** Direct relationship strength between two nodes (falls back to path proximity). */
export async function strength(workspaceId, aId, bId) {
  const a = fullId(workspaceId, aId), b = fullId(workspaceId, bId);
  const { rows } = await db.query(
    `SELECT relationship_type, ${STRENGTH_SQL} AS s, observation_count
       FROM graph_edges e
      WHERE workspace_id = $1
        AND ((source_id = $2 AND target_id = $3) OR (source_id = $3 AND target_id = $2))`,
    [String(workspaceId), a, b],
  );
  if (rows.length) {
    return {
      strength: +rows.reduce((t, r) => t + Number(r.s), 0).toFixed(4),
      direct: true,
      via: rows.map(r => ({ relation: r.relationship_type, observations: r.observation_count })),
    };
  }
  const path = await shortestPath(workspaceId, aId, bId, 4);
  if (!path) return { strength: 0, direct: false, distance: null };
  return { strength: +(1 / (path.length - 1)).toFixed(4), direct: false, distance: path.length - 1, path };
}

/** Neighbors of a node ranked by relationship strength. */
export async function rankNeighbors(workspaceId, nodeId, limit = 25) {
  const id = fullId(workspaceId, nodeId);
  const { rows } = await db.query(
    `SELECT n.id, n.type, n.name, e.relationship_type,
            CASE WHEN e.source_id = $2 THEN 'OUT' ELSE 'IN' END AS direction,
            ${STRENGTH_SQL} AS strength
       FROM graph_edges e
       JOIN graph_nodes n ON n.id = CASE WHEN e.source_id = $2 THEN e.target_id ELSE e.source_id END
      WHERE e.workspace_id = $1 AND (e.source_id = $2 OR e.target_id = $2)
      ORDER BY strength DESC
      LIMIT $3`,
    [String(workspaceId), id, limit],
  );
  return rows.map(r => ({
    node: { id: r.id, type: r.type, name: r.name },
    relation: r.relationship_type, direction: r.direction, strength: +Number(r.strength).toFixed(4),
  }));
}

/** Which employees collaborate most (ranked WORKS_WITH relationships). */
export async function topCollaborators(workspaceId, limit = 20) {
  const { rows } = await db.query(
    `SELECT ns.name AS a, nt.name AS b, e.observation_count,
            ${STRENGTH_SQL} AS strength
       FROM graph_edges e
       JOIN graph_nodes ns ON ns.id = e.source_id
       JOIN graph_nodes nt ON nt.id = e.target_id
      WHERE e.workspace_id = $1 AND e.relationship_type = 'WORKS_WITH'
      ORDER BY strength DESC
      LIMIT $2`,
    [String(workspaceId), limit],
  );
  return rows.map(r => ({ a: r.a, b: r.b, collaborations: r.observation_count, strength: +Number(r.strength).toFixed(4) }));
}

/** Who knows a topic — employees most strongly connected to matching nodes. */
export async function whoKnows(workspaceId, topic, limit = 15) {
  const { rows } = await db.query(
    `SELECT emp.id, emp.name, COUNT(*) AS links, SUM(x.s) AS total
       FROM (
         SELECT CASE WHEN e.source_id = t.id THEN e.target_id ELSE e.source_id END AS emp_id,
                ${STRENGTH_SQL} AS s
           FROM graph_nodes t
           JOIN graph_edges e ON (e.source_id = t.id OR e.target_id = t.id) AND e.workspace_id = $1
          WHERE t.workspace_id = $1 AND t.name ILIKE $2
       ) x
       JOIN graph_nodes emp ON emp.id = x.emp_id AND emp.type = 'EMPLOYEE'
      GROUP BY emp.id, emp.name
      ORDER BY total DESC
      LIMIT $3`,
    [String(workspaceId), `%${topic}%`, limit],
  );
  return rows.map(r => ({ id: r.id, name: r.name, links: Number(r.links), score: +Number(r.total).toFixed(4) }));
}
