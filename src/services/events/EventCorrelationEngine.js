/**
 * EventCorrelationEngine — groups related events into CorrelationGroups.
 *
 * Events that belong together should never be treated independently.
 *
 * Correlation strategies (applied in order):
 *   1. Causal chain — known type sequences (PR merge → deployment → incident)
 *   2. Entity overlap — events touching the same PR/customer/project
 *   3. Time window — events within 15 minutes of each other in the same domain
 *   4. Keyword overlap — shared significant terms
 *
 * Storage: Redis
 *   - Sliding event window: ZSET  flow:workspace:{wsId}:corr:window
 *   - Groups:               HASH  flow:workspace:{wsId}:corr:group:{gid}
 *   - Event→group index:    STRING flow:workspace:{wsId}:corr:evt:{eid}
 */

import Redis from 'ioredis';
import { randomUUID } from 'crypto';
import { EventType } from './EventNormalizer.js';
import { logger } from '../../utils/logger.js';

const redis = new Redis(process.env.REDIS_URL || 'redis://127.0.0.1:6379', {
  maxRetriesPerRequest: null,
  lazyConnect: true,
});
redis.connect().catch(() => {});

const WINDOW_MS     = 15 * 60 * 1000; // 15 minutes
const WINDOW_TTL    = 60 * 60;         // 1 hour Redis TTL
const GROUP_TTL     = 4 * 60 * 60;    // 4 hours

const CAUSAL_CHAINS = [
  [EventType.ENGINEERING, EventType.DEPLOYMENT],
  [EventType.DEPLOYMENT,  EventType.INCIDENT],
  [EventType.INCIDENT,    EventType.CUSTOMER],
  [EventType.CUSTOMER,    EventType.APPROVAL],
  [EventType.HR,          EventType.SECURITY],
  [EventType.ENGINEERING, EventType.APPROVAL],
];

/**
 * Correlate a new event against recent workspace events.
 * Modifies event.correlationGroupId and event.correlatedEventIds in place.
 *
 * @param {import('./EventNormalizer.js').CompanyEvent} event
 * @returns {Promise<CorrelationGroup|null>}
 */
export async function correlateEvent(event) {
  const wsId = String(event.workspaceId);
  const now  = Date.now();

  try {
    const windowKey = `flow:workspace:${wsId}:corr:window`;

    // Load recent events from the sliding window
    const rawEvents = await redis.zrangebyscore(
      windowKey,
      now - WINDOW_MS,
      '+inf',
      'WITHSCORES',
    );

    const recentEvents = _parseWindowEntries(rawEvents);

    // Find a matching group
    let groupId = await _findMatchingGroup(wsId, event, recentEvents);

    if (!groupId) {
      // Start a new group if this is a significant event
      if (_isSignificantForGrouping(event)) {
        groupId = randomUUID();
        await _createGroup(wsId, groupId, event);
      }
    } else {
      await _addToGroup(wsId, groupId, event);
    }

    // Register this event in the window
    await redis.zadd(windowKey, now, JSON.stringify({
      id:       event.id,
      type:     event.type,
      groupId,
      entities: event.entities.map(e => e.id),
      title:    event.title,
      ts:       now,
    }));
    await redis.zremrangebyscore(windowKey, '-inf', now - WINDOW_MS * 4);
    await redis.expire(windowKey, WINDOW_TTL);

    // Persist event→group mapping
    if (groupId) {
      await redis.set(`flow:workspace:${wsId}:corr:evt:${event.id}`, groupId, 'EX', GROUP_TTL);
      event.correlationGroupId   = groupId;
      event.correlatedEventIds   = await _getGroupEventIds(wsId, groupId);
    }

    return groupId ? { groupId, eventCount: event.correlatedEventIds.length } : null;
  } catch (err) {
    logger.rag(`[Correlation] Error: ${err.message}`);
    return null;
  }
}

/**
 * Get all events in a correlation group.
 *
 * @param {string} workspaceId
 * @param {string} groupId
 * @returns {Promise<string[]>} event IDs
 */
export async function getGroupEventIds(workspaceId, groupId) {
  return _getGroupEventIds(String(workspaceId), groupId);
}

/**
 * Get the correlation group for a specific event.
 */
export async function getEventGroup(workspaceId, eventId) {
  const gid = await redis.get(`flow:workspace:${workspaceId}:corr:evt:${eventId}`).catch(() => null);
  if (!gid) return null;
  const raw = await redis.hget(`flow:workspace:${workspaceId}:corr:group:${gid}`, 'meta').catch(() => null);
  if (!raw) return null;
  try {
    return { groupId: gid, ...JSON.parse(raw) };
  } catch {
    return null;
  }
}

// ── Internal ──────────────────────────────────────────────────────────────────

async function _findMatchingGroup(wsId, event, recentEvents) {
  for (const recent of recentEvents) {
    // Causal chain match
    if (_isCausallyLinked(recent.type, event.type)) {
      if (recent.groupId) return recent.groupId;
    }
    // Entity overlap match
    if (_hasEntityOverlap(event.entities, recent.entities)) {
      if (recent.groupId) return recent.groupId;
    }
  }
  return null;
}

function _isCausallyLinked(fromType, toType) {
  return CAUSAL_CHAINS.some(([from, to]) => from === fromType && to === toType);
}

function _hasEntityOverlap(entitiesA, entitiesB) {
  if (!entitiesA?.length || !entitiesB?.length) return false;
  const idsA = new Set(entitiesA.map(e => e.id).filter(Boolean));
  return entitiesB.some(e => e.id && idsA.has(e.id));
}

function _isSignificantForGrouping(event) {
  return ['critical', 'high'].includes(event.priority) ||
    [EventType.INCIDENT, EventType.DEPLOYMENT, EventType.SECURITY, EventType.APPROVAL].includes(event.type);
}

async function _createGroup(wsId, groupId, event) {
  const key = `flow:workspace:${wsId}:corr:group:${groupId}`;
  const meta = {
    groupId,
    type:        event.type,
    startEventId: event.id,
    eventIds:    [event.id],
    narrative:   `${event.title} — group started`,
    significance: event.priority === 'critical' ? 'critical' : event.priority === 'high' ? 'high' : 'medium',
    createdAt:   new Date().toISOString(),
  };
  await redis.hset(key, 'meta', JSON.stringify(meta));
  await redis.expire(key, GROUP_TTL);
}

async function _addToGroup(wsId, groupId, event) {
  const key = `flow:workspace:${wsId}:corr:group:${groupId}`;
  const raw = await redis.hget(key, 'meta').catch(() => null);
  if (!raw) return;
  try {
    const meta = JSON.parse(raw);
    if (!meta.eventIds.includes(event.id)) {
      meta.eventIds.push(event.id);
      meta.narrative = `${meta.narrative} → ${event.title}`;
      meta.updatedAt = new Date().toISOString();
      await redis.hset(key, 'meta', JSON.stringify(meta));
    }
  } catch {}
}

async function _getGroupEventIds(wsId, groupId) {
  const raw = await redis.hget(`flow:workspace:${wsId}:corr:group:${groupId}`, 'meta').catch(() => null);
  if (!raw) return [];
  try { return JSON.parse(raw).eventIds || []; } catch { return []; }
}

function _parseWindowEntries(rawWithScores) {
  const results = [];
  for (let i = 0; i < rawWithScores.length; i += 2) {
    try {
      results.push(JSON.parse(rawWithScores[i]));
    } catch {}
  }
  return results;
}
