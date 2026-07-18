/**
 * WorkspaceTimelineEngine — maintains a chronological operational timeline.
 *
 * Stored in Redis as a sorted set scored by timestamp.
 * Entries are CompanyEvents serialized to JSON.
 *
 * Key: flow:workspace:{wsId}:timeline
 * Score: Unix timestamp in milliseconds
 * Member: JSON.stringify(CompanyEvent)
 *
 * Max 500 events per workspace, TTL 7 days.
 */

import Redis from 'ioredis';
import { logger } from '../../utils/logger.js';

const redis = new Redis(process.env.REDIS_URL || 'redis://127.0.0.1:6379', {
  maxRetriesPerRequest: null,
  lazyConnect: true,
});
redis.connect().catch(() => {});

const TIMELINE_KEY  = wsId => `flow:workspace:${wsId}:timeline`;
const TIMELINE_MAX  = 500;
const TIMELINE_TTL  = 7 * 86_400; // 7 days

/**
 * Append a CompanyEvent to the workspace timeline.
 *
 * @param {import('./EventNormalizer.js').CompanyEvent} event
 */
export async function appendToTimeline(event) {
  const wsId = String(event.workspaceId);
  const key  = TIMELINE_KEY(wsId);
  const score = new Date(event.ts).getTime() || Date.now();

  try {
    const pipe = redis.pipeline();
    pipe.zadd(key, score, JSON.stringify(event));
    // Keep only the latest TIMELINE_MAX entries
    pipe.zremrangebyrank(key, 0, -(TIMELINE_MAX + 1));
    pipe.expire(key, TIMELINE_TTL);
    await pipe.exec();
  } catch (err) {
    logger.rag(`[Timeline] Append error: ${err.message}`);
  }
}

/**
 * Get recent timeline events (most recent first).
 *
 * @param {string} workspaceId
 * @param {Object} opts
 * @param {number} [opts.limit=50] - Max entries
 * @param {number} [opts.hoursBack=24] - Look back window
 * @param {string} [opts.type] - Filter by EventType
 * @param {string} [opts.priority] - Filter by priority
 * @returns {Promise<CompanyEvent[]>}
 */
export async function getTimeline(workspaceId, { limit = 50, hoursBack = 24, type, priority } = {}) {
  const key   = TIMELINE_KEY(String(workspaceId));
  const since = Date.now() - hoursBack * 3_600_000;

  try {
    const raw = await redis.zrevrangebyscore(key, '+inf', since, 'LIMIT', 0, limit * 2);
    const events = raw
      .map(r => { try { return JSON.parse(r); } catch { return null; } })
      .filter(Boolean);

    const filtered = events.filter(e => {
      if (type && e.type !== type) return false;
      if (priority && e.priority !== priority) return false;
      return true;
    });

    return filtered.slice(0, limit);
  } catch (err) {
    logger.rag(`[Timeline] Query error: ${err.message}`);
    return [];
  }
}

/**
 * Get timeline events for a specific correlation group.
 *
 * @param {string} workspaceId
 * @param {string} groupId
 * @returns {Promise<CompanyEvent[]>}
 */
export async function getGroupTimeline(workspaceId, groupId) {
  const all = await getTimeline(workspaceId, { limit: 100, hoursBack: 4 });
  return all.filter(e => e.correlationGroupId === groupId);
}

/**
 * Get timeline stats for a workspace.
 *
 * @param {string} workspaceId
 * @returns {Promise<TimelineStats>}
 */
export async function getTimelineStats(workspaceId) {
  const key = TIMELINE_KEY(String(workspaceId));
  try {
    const total   = await redis.zcard(key);
    const recent  = await getTimeline(workspaceId, { limit: 100, hoursBack: 1 });
    const byType  = {};
    const byPriority = {};
    for (const e of recent) {
      byType[e.type]         = (byType[e.type] || 0) + 1;
      byPriority[e.priority] = (byPriority[e.priority] || 0) + 1;
    }
    return { total, recentCount: recent.length, byType, byPriority };
  } catch {
    return { total: 0, recentCount: 0, byType: {}, byPriority: {} };
  }
}

/**
 * Mark a timeline event as resolved.
 * Updates the stored JSON record.
 *
 * @param {string} workspaceId
 * @param {string} eventId
 */
export async function resolveTimelineEvent(workspaceId, eventId) {
  const key    = TIMELINE_KEY(String(workspaceId));
  const raw    = await redis.zrevrangebyscore(key, '+inf', '-inf', 'LIMIT', 0, 200);
  for (const member of raw) {
    try {
      const event = JSON.parse(member);
      if (event.id === eventId) {
        event.resolvedAt = new Date().toISOString();
        const score      = new Date(event.ts).getTime();
        // Remove old entry and re-add updated one
        const pipe = redis.pipeline();
        pipe.zrem(key, member);
        pipe.zadd(key, score, JSON.stringify(event));
        await pipe.exec();
        return event;
      }
    } catch {}
  }
  return null;
}
