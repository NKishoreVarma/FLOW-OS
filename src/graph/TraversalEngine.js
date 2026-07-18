/**
 * TraversalEngine — bounded iterative BFS over the Operational Graph.
 *
 * On dense graphs (e.g. a WORKS_WITH collaboration mesh) an unbounded recursive
 * CTE explodes combinatorially. Instead each hop is a single indexed, capped
 * query over graph_edges, with the frontier limited per level and a global node
 * cap. Latency stays predictable (tens of ms) regardless of hub degree, at the
 * cost of exploring the highest-weight relationships first when a node is huge.
 *
 * Supports neighbors, k-hop, shortest path, dependency chains, impact
 * propagation, and temporal filtering (edges observed since a cutoff).
 */

import db from '../config/db.js';
import { nodeKey, DEPENDENCY_EDGES, EdgeType } from './nodeTypes.js';

const MAX_DEPTH   = 3;
const HOP_LIMIT   = 4000;   // max edges scanned per hop
const FRONTIER_CAP = 400;   // nodes carried into the next hop (highest-weight first)
const NODE_CAP    = 1000;   // total distinct nodes returned

function fullId(workspaceId, id) {
  return id.startsWith(`${workspaceId}:`) ? id : nodeKey(workspaceId, id);
}

async function resolveNodes(workspaceId, ids) {
  if (!ids.length) return new Map();
  const { rows } = await db.query(
    `SELECT id, type, name FROM graph_nodes WHERE workspace_id = $1 AND id = ANY($2)`,
    [String(workspaceId), ids],
  );
  return new Map(rows.map(r => [r.id, r]));
}

/** Direct 1-hop neighbors with relation + direction (single indexed query). */
export async function neighbors(workspaceId, nodeId) {
  const id = fullId(workspaceId, nodeId);
  const { rows } = await db.query(
    `SELECT e.relationship_type, e.weight, e.observation_count, e.last_observed_at,
            CASE WHEN e.source_id = $2 THEN 'OUT' ELSE 'IN' END AS direction,
            n.id, n.type, n.name
       FROM graph_edges e
       JOIN graph_nodes n ON n.id = CASE WHEN e.source_id = $2 THEN e.target_id ELSE e.source_id END
      WHERE e.workspace_id = $1 AND (e.source_id = $2 OR e.target_id = $2)
      ORDER BY e.weight DESC, e.observation_count DESC
      LIMIT 200`,
    [String(workspaceId), id],
  );
  return rows.map(r => ({
    node: { id: r.id, type: r.type, name: r.name },
    relation: r.relationship_type, direction: r.direction,
    weight: r.weight, observations: r.observation_count,
    observedAt: r.last_observed_at instanceof Date ? r.last_observed_at.toISOString() : r.last_observed_at,
  }));
}

/** One undirected hop from a frontier, returning {nid, parent, weight}. */
async function hopUndirected(workspaceId, frontier, { edgeTypes = null, since = null } = {}) {
  const params = [String(workspaceId), frontier];
  let i = 3, typeClause = '', sinceClause = '';
  if (edgeTypes) { typeClause = `AND relationship_type = ANY($${i++})`; params.push(edgeTypes); }
  if (since)     { sinceClause = `AND last_observed_at >= $${i++}`; params.push(since); }
  params.push(HOP_LIMIT);
  const { rows } = await db.query(
    `SELECT CASE WHEN source_id = ANY($2) THEN target_id ELSE source_id END AS nid,
            CASE WHEN source_id = ANY($2) THEN source_id ELSE target_id END AS parent,
            weight
       FROM graph_edges
      WHERE workspace_id = $1 AND (source_id = ANY($2) OR target_id = ANY($2)) ${typeClause} ${sinceClause}
      ORDER BY weight DESC
      LIMIT $${i}`,
    params,
  );
  return rows;
}

/** One directed hop: OUT along outTypes, IN along inTypes. */
async function hopDirected(workspaceId, frontier, outTypes, inTypes) {
  const { rows } = await db.query(
    `SELECT nid, parent, weight FROM (
       SELECT target_id AS nid, source_id AS parent, weight FROM graph_edges
        WHERE workspace_id = $1 AND source_id = ANY($2) AND relationship_type = ANY($3)
       UNION ALL
       SELECT source_id AS nid, target_id AS parent, weight FROM graph_edges
        WHERE workspace_id = $1 AND target_id = ANY($2) AND relationship_type = ANY($4)
     ) z ORDER BY weight DESC LIMIT ${HOP_LIMIT}`,
    // Empty inTypes → ANY('{}') matches nothing (correct: no inbound expansion).
    [String(workspaceId), frontier, outTypes, inTypes],
  );
  return rows;
}

/** k-hop neighborhood (undirected). Options: { hops, edgeTypes, since }. */
export async function traverse(workspaceId, startId, { hops = 2, edgeTypes = null, since = null } = {}) {
  const start = fullId(workspaceId, startId);
  const depth = Math.min(hops, MAX_DEPTH);
  const visited = new Set([start]);
  const out = [];
  let frontier = [start];

  for (let d = 1; d <= depth && frontier.length; d++) {
    const rows = await hopUndirected(workspaceId, frontier, { edgeTypes, since });
    const next = [];
    for (const r of rows) {
      if (visited.has(r.nid)) continue;
      visited.add(r.nid);
      out.push({ id: r.nid, depth: d });
      next.push(r.nid);
      if (out.length >= NODE_CAP) break;
    }
    if (out.length >= NODE_CAP) break;
    frontier = next.slice(0, FRONTIER_CAP);
  }

  const map = await resolveNodes(workspaceId, out.map(o => o.id));
  return out.filter(o => map.has(o.id)).map(o => ({ ...map.get(o.id), depth: o.depth }));
}

/** Directed traversal used by dependency + impact. */
async function directed(workspaceId, startId, outTypes, inTypes, maxDepth) {
  const start = fullId(workspaceId, startId);
  const depth = Math.min(maxDepth, MAX_DEPTH);
  const visited = new Set([start]);
  const out = [];
  let frontier = [start];

  for (let d = 1; d <= depth && frontier.length; d++) {
    const rows = await hopDirected(workspaceId, frontier, outTypes, inTypes);
    const next = [];
    for (const r of rows) {
      if (visited.has(r.nid)) continue;
      visited.add(r.nid);
      out.push({ id: r.nid, depth: d });
      next.push(r.nid);
      if (out.length >= NODE_CAP) break;
    }
    if (out.length >= NODE_CAP) break;
    frontier = next.slice(0, FRONTIER_CAP);
  }

  const map = await resolveNodes(workspaceId, out.map(o => o.id));
  return out.filter(o => map.has(o.id)).map(o => ({ ...map.get(o.id), depth: o.depth }));
}

/** Shortest path (undirected) as an ordered node list, via bounded BFS. */
export async function shortestPath(workspaceId, fromId, toId, maxDepth = 4) {
  const from = fullId(workspaceId, fromId);
  const to   = fullId(workspaceId, toId);
  if (from === to) { const m = await resolveNodes(workspaceId, [from]); return [m.get(from) || { id: from }]; }

  const depth = Math.min(maxDepth, 5);
  const parent = new Map([[from, null]]);
  let frontier = [from];
  let found = false;

  for (let d = 1; d <= depth && frontier.length && !found; d++) {
    const rows = await hopUndirected(workspaceId, frontier);
    const next = [];
    for (const r of rows) {
      if (parent.has(r.nid)) continue;
      parent.set(r.nid, r.parent);
      if (r.nid === to) { found = true; break; }
      next.push(r.nid);
    }
    frontier = next.slice(0, FRONTIER_CAP);
  }

  if (!found) return null;
  const chain = [];
  for (let cur = to; cur != null; cur = parent.get(cur)) chain.unshift(cur);
  const map = await resolveNodes(workspaceId, chain);
  return chain.map(id => map.get(id) || { id, type: '?', name: id });
}

/** What this node depends on (dependency edges, outward). */
export function dependencyChain(workspaceId, nodeId, maxDepth = 3) {
  return directed(workspaceId, nodeId, [...DEPENDENCY_EDGES], [], maxDepth);
}

/** What is impacted if this node fails (impact propagation). */
export function impactPath(workspaceId, nodeId, maxDepth = 3) {
  const outTypes = [EdgeType.AFFECTED, EdgeType.CAUSED, EdgeType.CONNECTED_TO];
  const inTypes  = [EdgeType.DEPENDS_ON, EdgeType.BELONGS_TO, EdgeType.CONNECTED_TO];
  return directed(workspaceId, nodeId, outTypes, inTypes, maxDepth);
}
