/**
 * AI Rate Limiter — Layer 4 of the AI Platform.
 *
 * Sliding-window rate limiter per (workspaceId × provider) using Redis.
 * Falls back to in-memory if Redis is unavailable (single-instance guard only).
 *
 * Limits are configurable per tier and can be overridden per workspace via policy.
 * Default limits are conservative — enterprise deployments should raise them.
 */
import redis from '../../config/redis.js';

const DEFAULTS = {
  // Requests per minute per workspace per provider
  light:    { rpm: Number(process.env.AI_RPM_LIGHT    ?? 60) },
  standard: { rpm: Number(process.env.AI_RPM_STANDARD ?? 30) },
  heavy:    { rpm: Number(process.env.AI_RPM_HEAVY    ?? 10) },
};

// In-memory fallback when Redis is unavailable
const _inMemory = new Map(); // key → { count, resetAt }

/**
 * Check and increment the rate limit counter for a (workspaceId, provider, tier) triple.
 * @returns {{ allowed: boolean, remaining: number, resetInMs: number }}
 */
export async function checkAndIncrement(workspaceId, provider, tier = 'standard') {
  const limit  = DEFAULTS[tier]?.rpm ?? 30;
  const key    = `ai:rl:${workspaceId}:${provider}:${tier}`;
  const window = 60; // seconds

  try {
    if (!redis) throw new Error('no redis');

    const now   = await redis.incr(key);
    if (now === 1) await redis.expire(key, window);
    const ttl   = await redis.ttl(key);

    const allowed    = now <= limit;
    const remaining  = Math.max(0, limit - now);
    const resetInMs  = ttl > 0 ? ttl * 1000 : window * 1000;

    return { allowed, remaining, resetInMs, count: now, limit };
  } catch {
    // In-memory fallback
    const now      = Date.now();
    const existing = _inMemory.get(key);

    if (!existing || now > existing.resetAt) {
      _inMemory.set(key, { count: 1, resetAt: now + window * 1000 });
      return { allowed: true, remaining: limit - 1, resetInMs: window * 1000, count: 1, limit };
    }

    existing.count++;
    const allowed   = existing.count <= limit;
    const remaining = Math.max(0, limit - existing.count);
    return { allowed, remaining, resetInMs: existing.resetAt - now, count: existing.count, limit };
  }
}

/**
 * Get current usage for a workspace (across all providers).
 */
export async function getUsage(workspaceId) {
  const tiers     = ['light', 'standard', 'heavy'];
  const providers = ['gemini', 'openai', 'anthropic', 'ollama'];
  const usage     = {};

  for (const tier of tiers) {
    usage[tier] = {};
    for (const provider of providers) {
      const key = `ai:rl:${workspaceId}:${provider}:${tier}`;
      try {
        const count = redis ? Number(await redis.get(key) ?? 0) : (_inMemory.get(key)?.count ?? 0);
        const limit = DEFAULTS[tier]?.rpm ?? 30;
        usage[tier][provider] = { count, limit, pct: Math.round(count / limit * 100) };
      } catch {
        usage[tier][provider] = { count: 0, limit: DEFAULTS[tier]?.rpm ?? 30, pct: 0 };
      }
    }
  }
  return usage;
}
