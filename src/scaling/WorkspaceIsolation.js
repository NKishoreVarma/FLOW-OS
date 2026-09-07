/**
 * WorkspaceIsolation — Module 10 (Scalability)
 *
 * Per-workspace rate limiting and resource isolation.
 * Prevents a single busy workspace from monopolising shared resources:
 *   - API rate limiting (requests/min per workspace)
 *   - Execution concurrency cap (simultaneous workflow executions)
 *   - Event ingestion rate cap (events/sec per workspace)
 *
 * Uses an in-process sliding-window counter backed by Redis for
 * cross-replica consistency. Gracefully degrades to local-only if Redis is down.
 */

import redis from '../config/redis.js';

const API_LIMIT       = Number(process.env.WS_API_LIMIT_RPM      ?? 600);   // per workspace per minute
const EXEC_LIMIT      = Number(process.env.WS_EXEC_CONCURRENCY   ?? 20);    // concurrent executions
const EVENT_LIMIT     = Number(process.env.WS_EVENT_LIMIT_RPS    ?? 50);    // events per second
const WINDOW_MS       = 60_000;
const EXEC_KEY_PREFIX = 'iso:exec:';
const RATE_KEY_PREFIX = 'iso:rate:';
const EVENT_KEY_PREFIX = 'iso:ev:';

// Local counters for graceful degradation
const _localCounts = new Map();

// ── API Rate Limiting ─────────────────────────────────────────────────────────

/**
 * Check + increment API call count for a workspace.
 * Returns { allowed, remaining, resetMs }.
 */
export async function checkApiRate(workspaceId) {
  const key    = `${RATE_KEY_PREFIX}${workspaceId}`;
  const window = Math.floor(Date.now() / WINDOW_MS);
  const wKey   = `${key}:${window}`;
  try {
    const count = await redis.incr(wKey);
    if (count === 1) await redis.expire(wKey, 120); // 2 windows for safety
    const allowed   = count <= API_LIMIT;
    const remaining = Math.max(0, API_LIMIT - count);
    const resetMs   = (window + 1) * WINDOW_MS - Date.now();
    return { allowed, remaining, resetMs };
  } catch {
    // Redis down — local fallback
    return _localRateCheck(wKey, API_LIMIT);
  }
}

/**
 * Express middleware that enforces per-workspace API rate limit.
 */
export function workspaceRateLimitMiddleware(req, res, next) {
  const workspaceId = req.headers['workspace-id'];
  if (!workspaceId) return next();
  checkApiRate(workspaceId).then(({ allowed, remaining, resetMs }) => {
    res.setHeader('X-RateLimit-Limit',     API_LIMIT);
    res.setHeader('X-RateLimit-Remaining', remaining);
    res.setHeader('X-RateLimit-Reset',     Math.ceil((Date.now() + resetMs) / 1000));
    if (!allowed) return res.status(429).json({ error: 'Workspace rate limit exceeded', retryAfterMs: resetMs });
    next();
  }).catch(() => next());
}

// ── Execution Concurrency ─────────────────────────────────────────────────────

/**
 * Acquire an execution slot. Returns false if workspace is at concurrency cap.
 */
export async function acquireExecutionSlot(workspaceId) {
  const key = `${EXEC_KEY_PREFIX}${workspaceId}`;
  try {
    const count = await redis.incr(key);
    if (count === 1) await redis.expire(key, 3600); // auto-expire stale keys
    if (count > EXEC_LIMIT) {
      await redis.decr(key);
      return false;
    }
    return true;
  } catch {
    return true; // allow on Redis failure
  }
}

/**
 * Release an execution slot.
 */
export async function releaseExecutionSlot(workspaceId) {
  const key = `${EXEC_KEY_PREFIX}${workspaceId}`;
  try {
    const val = await redis.decr(key);
    if (val < 0) await redis.set(key, 0);
  } catch {}
}

export async function getExecutionConcurrency(workspaceId) {
  try {
    const val = await redis.get(`${EXEC_KEY_PREFIX}${workspaceId}`);
    return Number(val ?? 0);
  } catch { return 0; }
}

// ── Event Rate ────────────────────────────────────────────────────────────────

export async function checkEventRate(workspaceId) {
  const second = Math.floor(Date.now() / 1000);
  const key    = `${EVENT_KEY_PREFIX}${workspaceId}:${second}`;
  try {
    const count = await redis.incr(key);
    if (count === 1) await redis.expire(key, 10);
    return { allowed: count <= EVENT_LIMIT, count };
  } catch {
    return { allowed: true, count: 0 };
  }
}

// ── Stats ─────────────────────────────────────────────────────────────────────

export async function getIsolationStats(workspaceId) {
  const [concurrency, rateCheck] = await Promise.all([
    getExecutionConcurrency(workspaceId),
    checkApiRate(workspaceId).then(r => r.remaining),
  ]);
  return {
    workspaceId,
    executionConcurrency: { current: concurrency, limit: EXEC_LIMIT },
    apiRateLimit:         { remaining: rateCheck,  limit: API_LIMIT, windowSeconds: WINDOW_MS / 1000 },
    eventRateLimit:       { limit: EVENT_LIMIT, windowSeconds: 1 },
  };
}

// ── Internal ──────────────────────────────────────────────────────────────────

function _localRateCheck(key, limit) {
  const now = Date.now();
  let entry = _localCounts.get(key);
  if (!entry || now > entry.resetAt) {
    entry = { count: 0, resetAt: now + WINDOW_MS };
    _localCounts.set(key, entry);
  }
  entry.count++;
  return { allowed: entry.count <= limit, remaining: Math.max(0, limit - entry.count), resetMs: entry.resetAt - now };
}
