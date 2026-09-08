/**
 * GraphCache — Module 9 (Performance Optimization)
 *
 * Two-tier cache for Operational Graph queries:
 *   L1 — in-process Map (sub-millisecond, per-process)
 *   L2 — Redis (shared across replicas, TTL-backed)
 *
 * Cache keys are workspace-scoped. Invalidation is node-type-scoped
 * (a new PERSON node invalidates all PERSON neighbor queries for the workspace).
 */

import redis from '../config/redis.js';

const L1     = new Map();
const L1_MAX = Number(process.env.GRAPH_CACHE_L1_MAX ?? 5_000);
const L1_TTL = Number(process.env.GRAPH_CACHE_L1_TTL ?? 30_000);   // 30s
const L2_TTL = Number(process.env.GRAPH_CACHE_L2_TTL ?? 300);      // 5 min

// ── Public API ────────────────────────────────────────────────────────────────

export async function getGraphNeighbors(workspaceId, nodeId, { hops = 2, types = [] } = {}) {
  const key = _key(workspaceId, 'neighbors', nodeId, { hops, types: types.sort().join(',') });
  return _get(key);
}

export async function setGraphNeighbors(workspaceId, nodeId, data, opts = {}) {
  const key = _key(workspaceId, 'neighbors', nodeId, { hops: opts.hops ?? 2, types: (opts.types ?? []).sort().join(',') });
  return _set(key, data);
}

export async function getGraphImpact(workspaceId, nodeId) {
  return _get(_key(workspaceId, 'impact', nodeId));
}

export async function setGraphImpact(workspaceId, nodeId, data) {
  return _set(_key(workspaceId, 'impact', nodeId), data);
}

export async function getGraphPath(workspaceId, fromId, toId) {
  return _get(_key(workspaceId, 'path', `${fromId}:${toId}`));
}

export async function setGraphPath(workspaceId, fromId, toId, data) {
  return _set(_key(workspaceId, 'path', `${fromId}:${toId}`), data);
}

/**
 * Invalidate all graph cache entries for a workspace (or specific node).
 */
export async function invalidateGraph(workspaceId, nodeId = null) {
  const pattern = nodeId
    ? `gc:${workspaceId}:*:${nodeId}*`
    : `gc:${workspaceId}:*`;

  // L1 invalidation
  for (const k of L1.keys()) {
    if (nodeId ? k.includes(nodeId) : k.startsWith(`gc:${workspaceId}:`)) {
      L1.delete(k);
    }
  }
  // L2 invalidation via SCAN
  try {
    let cursor = '0';
    do {
      const [next, keys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
      cursor = next;
      if (keys.length) await redis.del(...keys);
    } while (cursor !== '0');
  } catch {}
}

export function getGraphCacheStats() {
  return { l1Size: L1.size, l1Max: L1_MAX, l1TtlMs: L1_TTL, l2TtlSeconds: L2_TTL };
}

// ── Internal ──────────────────────────────────────────────────────────────────

function _key(workspaceId, op, id, params = {}) {
  const suffix = Object.keys(params).sort().map(k => `${k}=${params[k]}`).join(':');
  return `gc:${workspaceId}:${op}:${id}${suffix ? ':' + suffix : ''}`;
}

async function _get(key) {
  // L1
  const l1 = L1.get(key);
  if (l1 && Date.now() < l1.exp) return l1.data;
  L1.delete(key);

  // L2
  try {
    const raw = await redis.get(key);
    if (raw) {
      const data = JSON.parse(raw);
      _setL1(key, data);
      return data;
    }
  } catch {}
  return null;
}

async function _set(key, data) {
  _setL1(key, data);
  try {
    await redis.setex(key, L2_TTL, JSON.stringify(data));
  } catch {}
}

function _setL1(key, data) {
  if (L1.size >= L1_MAX) {
    // Evict oldest entry
    L1.delete(L1.keys().next().value);
  }
  L1.set(key, { data, exp: Date.now() + L1_TTL });
}
