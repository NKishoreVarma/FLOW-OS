/**
 * WorkflowCache — Module 9 (Performance Optimization)
 *
 * Caches workflow definitions, execution snapshots, and checkpoint states.
 * L1 in-process + L2 Redis. Workflow definitions cached until explicit invalidation.
 * Execution snapshots have a short TTL (matches execution timeout window).
 */

import redis from '../config/redis.js';

const L1     = new Map();
const L1_MAX = Number(process.env.WF_CACHE_L1_MAX ?? 2_000);
const DEF_TTL  = Number(process.env.WF_DEF_TTL  ?? 600);   // 10 min — definitions
const SNAP_TTL = Number(process.env.WF_SNAP_TTL ?? 60);    // 60s — snapshots

// ── Workflow Definitions ──────────────────────────────────────────────────────

export async function getWorkflowDef(workflowId) {
  return _get(`wf:def:${workflowId}`, DEF_TTL * 1000);
}

export async function setWorkflowDef(workflowId, def) {
  return _set(`wf:def:${workflowId}`, def, DEF_TTL);
}

export async function invalidateWorkflowDef(workflowId) {
  const key = `wf:def:${workflowId}`;
  L1.delete(key);
  try { await redis.del(key); } catch {}
}

// ── Execution Snapshots ───────────────────────────────────────────────────────

export async function getExecutionSnapshot(executionId) {
  return _get(`wf:snap:${executionId}`, SNAP_TTL * 1000);
}

export async function setExecutionSnapshot(executionId, snapshot) {
  return _set(`wf:snap:${executionId}`, snapshot, SNAP_TTL);
}

export async function invalidateExecutionSnapshot(executionId) {
  const key = `wf:snap:${executionId}`;
  L1.delete(key);
  try { await redis.del(key); } catch {}
}

// ── Bulk helpers ──────────────────────────────────────────────────────────────

export async function getWorkflowDefs(workflowIds) {
  const result = {};
  await Promise.all(workflowIds.map(async id => {
    const d = await getWorkflowDef(id);
    if (d) result[id] = d;
  }));
  return result;
}

export function getWorkflowCacheStats() {
  const defs  = [...L1.keys()].filter(k => k.startsWith('wf:def:')).length;
  const snaps = [...L1.keys()].filter(k => k.startsWith('wf:snap:')).length;
  return { l1Total: L1.size, l1Defs: defs, l1Snaps: snaps, l1Max: L1_MAX };
}

// ── Internal ──────────────────────────────────────────────────────────────────

async function _get(key, l1TtlMs) {
  const l1 = L1.get(key);
  if (l1 && Date.now() < l1.exp) return l1.data;
  L1.delete(key);
  try {
    const raw = await redis.get(key);
    if (raw) {
      const data = JSON.parse(raw);
      _setL1(key, data, l1TtlMs);
      return data;
    }
  } catch {}
  return null;
}

async function _set(key, data, ttlSeconds) {
  _setL1(key, data, ttlSeconds * 1000);
  try { await redis.setex(key, ttlSeconds, JSON.stringify(data)); } catch {}
}

function _setL1(key, data, ttlMs) {
  if (L1.size >= L1_MAX) L1.delete(L1.keys().next().value);
  L1.set(key, { data, exp: Date.now() + ttlMs });
}
