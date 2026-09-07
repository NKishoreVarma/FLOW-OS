/**
 * RateLimiter — per-trigger Redis sliding-window counter.
 *
 * Key: automation:ratelimit:{triggerId}:{windowKey}
 * Window sizes supported: hourly, daily.
 * Uses atomic INCR + EXPIREAT to avoid race conditions.
 */

import redis from '../../config/redis.js';

const DEFAULT_MAX_PER_HOUR = Number(process.env.TRIGGER_MAX_PER_HOUR ?? 1_000);
const DEFAULT_MAX_PER_DAY  = Number(process.env.TRIGGER_MAX_PER_DAY  ?? 10_000);

/**
 * @returns {{ allowed: boolean, reason?: string }}
 */
export async function checkRateLimit(trigger) {
  const { id: triggerId, rateLimit = {} } = trigger;
  const maxHour = rateLimit.maxPerHour ?? DEFAULT_MAX_PER_HOUR;
  const maxDay  = rateLimit.maxPerDay  ?? DEFAULT_MAX_PER_DAY;

  const now        = new Date();
  const hourKey    = `automation:rl:${triggerId}:h${now.getUTCFullYear()}${now.getUTCMonth()}${now.getUTCDate()}${now.getUTCHours()}`;
  const dayKey     = `automation:rl:${triggerId}:d${now.getUTCFullYear()}${now.getUTCMonth()}${now.getUTCDate()}`;

  const [hourCount, dayCount] = await Promise.all([
    _increment(hourKey, 3_600),
    _increment(dayKey,  86_400),
  ]);

  if (hourCount > maxHour) return { allowed: false, reason: `Rate limit exceeded: ${hourCount}/${maxHour} per hour` };
  if (dayCount  > maxDay)  return { allowed: false, reason: `Rate limit exceeded: ${dayCount}/${maxDay}  per day`  };

  return { allowed: true };
}

async function _increment(key, ttlSec) {
  const count = await redis.incr(key);
  if (count === 1) await redis.expire(key, ttlSec);  // set TTL only on first write
  return count;
}

export async function getRateLimitStats(triggerId) {
  const now     = new Date();
  const hourKey = `automation:rl:${triggerId}:h${now.getUTCFullYear()}${now.getUTCMonth()}${now.getUTCDate()}${now.getUTCHours()}`;
  const dayKey  = `automation:rl:${triggerId}:d${now.getUTCFullYear()}${now.getUTCMonth()}${now.getUTCDate()}`;
  const [hour, day] = await Promise.all([redis.get(hourKey), redis.get(dayKey)]);
  return { hourCount: Number(hour ?? 0), dayCount: Number(day ?? 0) };
}
