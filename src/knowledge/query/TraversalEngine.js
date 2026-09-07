/**
 * TraversalEngine — iterative BFS graph traversal for the Enterprise Knowledge Graph.
 *
 * Design constraints:
 *   - Iterative BFS (NOT recursive CTE) — avoids query explosion on dense graphs
 *   - Per-hop indexed queries with frontier cap to prevent runaway traversals
 *   - All queries are workspace-scoped
 *   - Returns results sorted by pathConfidence × (1 / depth) — most relevant first
 *
 * Max defaults (all overridable):
 *   MAX_DEPTH   = 5   hops
 *   FRONTIER    = 400 nodes per hop
 *   NODE_CAP    = 1000 total nodes across all hops
 */

import { getNeighborsBatch, getNode } from '../storage/GraphStore.js';
import { computePathConfidence }       from '../storage/ConfidenceScorer.js';

const DEFAULT_MAX_DEPTH  = 5;
const DEFAULT_FRONTIER   = 400;
const DEFAULT_NODE_CAP   = 1000;

// ── Main traversal ────────────────────────────────────────────────────────────

/**
 * BFS traversal from a set of start nodes.
 *
 * @param {string}   workspaceId
 * @param {string[]} startIds       — starting node IDs
 * @param {object}   opts
 * @param {number}   [opts.maxDepth=5]
 * @param {string}   [opts.direction='both']           — 'outbound'|'inbound'|'both'
 * @param {string[]} [opts.relationshipTypes]          — filter by edge type
 * @param {string[]} [opts.entityTypes]                — filter target node types
 * @param {number}   [opts.minEdgeConfidence=0]
 * @param {number}   [opts.frontierCap=400]
 * @param {number}   [opts.nodeCap=1000]
 * @param {boolean}  [opts.includeStartNodes=false]
 * @returns {Promise<import('../types.js').TraversalResult[]>}
 */
export async function traverse(workspaceId, startIds, opts = {}) {
  const {
    maxDepth          = DEFAULT_MAX_DEPTH,
    direction         = 'both',
    relationshipTypes = null,
    entityTypes       = null,
    minEdgeConfidence = 0,
    frontierCap       = DEFAULT_FRONTIER,
    nodeCap           = DEFAULT_NODE_CAP,
    includeStartNodes = false,
  } = opts;

  const visited  = new Map();  // nodeId → TraversalResult (first-seen wins for depth)
  const results  = [];

  // Seed the frontier
  const frontier = startIds.map(id => ({
    id,
    depth:          0,
    via:            null,
    edgeType:       null,
    pathEdgeConfs:  [],
  }));

  // Track start nodes
  for (const item of frontier) {
    visited.set(item.id, true);
    if (includeStartNodes) {
      const node = await getNode(workspaceId, item.id);
      if (node) {
        results.push({ node, depth: 0, via: null, edgeType: null, pathConfidence: 1.0 });
      }
    }
  }

  for (let depth = 1; depth <= maxDepth && frontier.length > 0 && results.length < nodeCap; depth++) {
    // Batch query: get all neighbors for all current frontier nodes
    const frontierIds = frontier.slice(0, frontierCap).map(f => f.id);
    frontier.length = 0;  // clear frontier for next hop

    const batchParent = Object.fromEntries(
      frontierIds.map(id => [id, results.find(r => r.node.id === id) ?? { pathEdgeConfs: [] }])
    );

    const neighbors = await getNeighborsBatch(workspaceId, frontierIds, {
      direction,
      relationshipTypes,
      entityTypes,
      minConfidence: minEdgeConfidence,
    });

    for (const neighbor of neighbors) {
      if (visited.has(neighbor.id)) continue;
      if (results.length >= nodeCap) break;

      visited.set(neighbor.id, true);

      // Compute path confidence: parent path × this edge
      const parentItem  = batchParent[neighbor.frontier_node_id] ?? {};
      const parentConfs = parentItem.pathEdgeConfs ?? [];
      const edgeConfs   = [...parentConfs, neighbor.edge_confidence ?? 1.0];
      const pathConf    = computePathConfidence(edgeConfs);

      const result = {
        node:           neighbor,
        depth,
        via:            neighbor.frontier_node_id,
        edgeType:       neighbor.edge_type,
        pathConfidence: pathConf,
        pathEdgeConfs:  edgeConfs,
      };

      results.push(result);
      frontier.push({ id: neighbor.id, depth, via: neighbor.frontier_node_id, edgeType: neighbor.edge_type, pathEdgeConfs: edgeConfs });
    }
  }

  // Sort: highest relevance first (confidence × depth-decay)
  results.sort((a, b) => {
    const scoreA = a.pathConfidence / a.depth;
    const scoreB = b.pathConfidence / b.depth;
    return scoreB - scoreA;
  });

  // Remove internal pathEdgeConfs from output
  return results.map(({ pathEdgeConfs: _, ...r }) => r);
}

// ── k-hop query ───────────────────────────────────────────────────────────────

/**
 * Return nodes exactly k hops from startId.
 * @param {string} workspaceId
 * @param {string} startId
 * @param {number} k
 * @param {object} [opts]
 */
export async function kHop(workspaceId, startId, k, opts = {}) {
  const all = await traverse(workspaceId, [startId], { ...opts, maxDepth: k });
  return all.filter(r => r.depth === k);
}

// ── Shortest path ─────────────────────────────────────────────────────────────

/**
 * Find the shortest path (fewest hops) between two nodes.
 * Returns the sequence of nodes along the path, or null if none found.
 *
 * @param {string} workspaceId
 * @param {string} fromId
 * @param {string} toId
 * @param {{ maxDepth?, direction?, relationshipTypes? }} [opts]
 * @returns {Promise<import('../types.js').TraversalResult[]|null>}
 */
export async function shortestPath(workspaceId, fromId, toId, opts = {}) {
  const { maxDepth = 6 } = opts;

  const visited  = new Map();  // nodeId → { via, edgeType, depth }
  const frontier = [fromId];
  visited.set(fromId, { via: null, edgeType: null, depth: 0 });

  for (let d = 1; d <= maxDepth && frontier.length > 0; d++) {
    const neighbors = await getNeighborsBatch(workspaceId, frontier, {
      direction:         opts.direction ?? 'both',
      relationshipTypes: opts.relationshipTypes ?? null,
    });
    frontier.length = 0;

    for (const n of neighbors) {
      if (visited.has(n.id)) continue;
      visited.set(n.id, { via: n.frontier_node_id, edgeType: n.edge_type, depth: d, node: n });
      if (n.id === toId) {
        // Reconstruct path
        return _reconstructPath(visited, fromId, toId);
      }
      frontier.push(n.id);
    }
  }
  return null;
}

function _reconstructPath(visited, fromId, toId) {
  const path = [];
  let   cur  = toId;
  while (cur && cur !== fromId) {
    const entry = visited.get(cur);
    if (!entry) break;
    path.unshift({ node: entry.node ?? { id: cur }, depth: entry.depth, via: entry.via, edgeType: entry.edgeType, pathConfidence: 1.0 });
    cur = entry.via;
  }
  return path;
}

// ── Dependency chain ──────────────────────────────────────────────────────────

/**
 * Return all nodes that the given node depends on, transitively.
 * Follows 'depends_on' edges outbound.
 *
 * @param {string} workspaceId
 * @param {string} nodeId
 * @param {{ maxDepth? }} [opts]
 */
export async function dependencyChain(workspaceId, nodeId, opts = {}) {
  return traverse(workspaceId, [nodeId], {
    ...opts,
    direction:         'outbound',
    relationshipTypes: ['depends_on'],
    maxDepth:          opts.maxDepth ?? DEFAULT_MAX_DEPTH,
  });
}

// ── Impact path ───────────────────────────────────────────────────────────────

/**
 * Return nodes that WOULD BE AFFECTED if the given node changes or fails.
 * Follows 'affects', 'blocks', 'supports', 'serves' edges outbound
 * AND 'depends_on' edges inbound (things that depend on this node).
 *
 * @param {string} workspaceId
 * @param {string} nodeId
 * @param {{ maxDepth? }} [opts]
 */
export async function impactPath(workspaceId, nodeId, opts = {}) {
  // Forward impact: node affects other nodes
  const forward = await traverse(workspaceId, [nodeId], {
    ...opts,
    direction:         'outbound',
    relationshipTypes: ['affects', 'blocks', 'supports', 'serves'],
    maxDepth:          opts.maxDepth ?? 4,
  });

  // Reverse impact: things that depend on this node
  const reverse = await traverse(workspaceId, [nodeId], {
    ...opts,
    direction:         'inbound',
    relationshipTypes: ['depends_on'],
    maxDepth:          opts.maxDepth ?? 4,
  });

  // Merge, deduplicate by node ID, keep highest pathConfidence
  const seen = new Map();
  for (const r of [...forward, ...reverse]) {
    const existing = seen.get(r.node.id);
    if (!existing || r.pathConfidence > existing.pathConfidence) {
      seen.set(r.node.id, r);
    }
  }
  return [...seen.values()].sort((a, b) => b.pathConfidence - a.pathConfidence);
}
