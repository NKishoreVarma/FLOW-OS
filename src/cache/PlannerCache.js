/**
 * PlannerCache — Module 9 (Performance Optimization)
 *
 * Caches planner context, plan outputs, and agent assessments.
 * Short TTL (plans are time-sensitive): 2 minutes default.
 */

import redis from '../config/redis.js';

const L1        = new Map();
const L1_MAX    = Number(process.env.PLANNER_CACHE_L1_MAX ?? 1_000);
const PLAN_TTL  = Number(process.env.PLANNER_CACHE_TTL ?? 120);  // 2 min
const CTX_TTL   = Number(process.env.PLANNER_CTX_TTL  ?? 30);   // 30s

// ── Plan output ───────────────────────────────────────────────────────────────

export async function getCachedPlan(workspaceId, queryHash) {
  return _get(`planner:plan:${workspaceId}:${queryHash}`, PLAN_TTL * 1000);
}

export async function cachePlan(workspaceId, queryHash, plan) {
  return _set(`planner:plan:${workspaceId}:${queryHash}`, plan, PLAN_TTL);
}

// ── Planner context (org state, prediction snapshot, goal list) ───────────────

export async function getCachedContext(workspaceId) {
  return _get(`planner:ctx:${workspaceId}`, CTX_TTL * 1000);
}

export async function cacheContext(workspaceId, ctx) {
  return _set(`planner:ctx:${workspaceId}`, ctx, CTX_TTL);
}

// ── Agent assessment ──────────────────────────────────────────────────────────

export async function getCachedAssessment(workspaceId, agentId) {
  return _get(`planner:agent:${workspaceId}:${agentId}`, PLAN_TTL * 1000);
}

export async function cacheAssessment(workspaceId, agentId, assessment) {
  return _set(`planner:agent:${workspaceId}:${agentId}`, assessment, PLAN_TTL);
}

export async function invalidatePlannerCache(workspaceId) {
  const pattern = `planner:*:${workspaceId}*`;
  for (const k of L1.keys()) {
    if (k.includes(`:${workspaceId}`)) L1.delete(k);
  }
  try {
    let cursor = '0';
    do {
      const [next, keys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
      cursor = next;
      if (keys.length) await redis.del(...keys);
    } while (cursor !== '0');
  } catch {}
}

export function getPlannerCacheStats() {
  return { l1Size: L1.size, planTtlSeconds: PLAN_TTL, ctxTtlSeconds: CTX_TTL };
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
