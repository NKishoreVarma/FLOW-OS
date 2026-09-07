/**
 * LiveFeedEngine — drives the real-time workspace feed.
 *
 * Feels like a Bloomberg Terminal for the company.
 * Events are formatted into feed items with icon, text, detail, and actions.
 * Never shows raw logs — always summarizes.
 *
 * Storage:
 *   Key: flow:workspace:{wsId}:feed
 *   Type: Redis list (ring buffer, max 100 entries, 24h TTL)
 *
 * Feed item structure:
 *   { id, icon, text, detail, type, priority, ts, actions: [], correlationGroupId }
 */

import Redis from 'ioredis';
import { EventType } from './EventNormalizer.js';
import { logger } from '../../utils/logger.js';
import { broadcastToWorkspace } from '../socketService.js';

const redis = new Redis(process.env.REDIS_URL || 'redis://127.0.0.1:6379', {
  maxRetriesPerRequest: null,
  lazyConnect: true,
});
redis.connect().catch(() => {});

const FEED_KEY     = wsId => `flow:workspace:${wsId}:feed`;
const FEED_MAX     = 100;
const FEED_TTL_SEC = 86_400; // 24h

// Priority → border colour (CSS token name, consumed by frontend)
const PRIORITY_COLOR = {
  critical: 'var(--color-critical)',
  high:     'var(--color-high)',
  medium:   'var(--color-medium)',
  low:      'var(--color-low)',
};

/**
 * Push a CompanyEvent into the live feed.
 * Formats it into a feed item, saves to Redis, and broadcasts via WebSocket.
 *
 * @param {import('./EventNormalizer.js').CompanyEvent} event
 */
export async function pushToFeed(event) {
  const wsId = String(event.workspaceId);
  const item = _formatFeedItem(event);

  const key = FEED_KEY(wsId);
  try {
    const pipe = redis.pipeline();
    pipe.lpush(key, JSON.stringify(item));
    pipe.ltrim(key, 0, FEED_MAX - 1);
    pipe.expire(key, FEED_TTL_SEC);
    await pipe.exec();
  } catch (err) {
    logger.rag(`[Feed] Push error: ${err.message}`);
  }

  // Broadcast in real-time
  broadcastToWorkspace(wsId, 'NEW_EVENT', item);
}

/**
 * Get the live feed for a workspace.
 *
 * @param {string} workspaceId
 * @param {number} [limit=50]
 * @returns {Promise<FeedItem[]>}
 */
export async function getFeed(workspaceId, limit = 50) {
  const key = FEED_KEY(String(workspaceId));
  try {
    const raw  = await redis.lrange(key, 0, limit - 1);
    return raw.map(r => { try { return JSON.parse(r); } catch { return null; } }).filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Append a system-generated feed entry (e.g. "FLOW generated recommendation").
 *
 * @param {string} workspaceId
 * @param {Object} item - { icon, text, detail, type, priority }
 */
export async function appendSystemEntry(workspaceId, item) {
  const wsId     = String(workspaceId);
  const feedItem = {
    id:       `sys_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
    icon:     item.icon || '⚙️',
    text:     item.text,
    detail:   item.detail || '',
    type:     item.type || 'automation',
    priority: item.priority || 'low',
    ts:       new Date().toISOString(),
    actions:  item.actions || [],
    color:    PRIORITY_COLOR[item.priority || 'low'],
    isSystem: true,
  };

  const key = FEED_KEY(wsId);
  try {
    await redis.lpush(key, JSON.stringify(feedItem));
    await redis.ltrim(key, 0, FEED_MAX - 1);
    await redis.expire(key, FEED_TTL_SEC);
  } catch {}

  broadcastToWorkspace(wsId, 'NEW_EVENT', feedItem);
}

// ── Feed item formatter ───────────────────────────────────────────────────────

function _formatFeedItem(event) {
  const { type, priority, title, summary, actors, entities, ts } = event;
  const actor  = actors?.[0]?.name || 'System';
  const entity = entities?.[0]?.name || '';
  const now    = new Date().toISOString();

  return {
    id:                 event.id,
    icon:               event.icon,
    text:               _formatText(event, actor, entity),
    detail:             summary?.slice(0, 120) || '',
    type,
    priority,
    ts:                 ts || now,
    actions:            _buildActions(event),
    color:              PRIORITY_COLOR[priority] || PRIORITY_COLOR.low,
    correlationGroupId: event.correlationGroupId || null,
    source:             event.source,
    metadata:           _safeMetadata(event.metadata),
  };
}

function _formatText(event, actor, entity) {
  const { type, title } = event;

  switch (type) {
    case EventType.ENGINEERING:
      if (/merged/i.test(title))   return `${actor} merged PR${entity ? ': ' + entity : ''}`;
      if (/opened/i.test(title))   return `${actor} opened a pull request${entity ? ': ' + entity : ''}`;
      if (/commit|push/i.test(title)) return `${actor} pushed commits`;
      return `${actor}: ${title.slice(0, 80)}`;

    case EventType.DEPLOYMENT:
      if (/fail|error/i.test(title)) return `Deployment failed${entity ? ': ' + entity : ''}`;
      if (/start/i.test(title))      return `Deployment started${entity ? ': ' + entity : ''}`;
      return `Deployment completed${entity ? ': ' + entity : ''}`;

    case EventType.INCIDENT:
      return `Incident: ${title.slice(0, 80)}`;

    case EventType.MEETING:
      return `Meeting: ${title.slice(0, 80)}`;

    case EventType.CUSTOMER:
      return `Customer update: ${title.slice(0, 80)}`;

    case EventType.APPROVAL:
      return `Approval required: ${title.slice(0, 80)}`;

    case EventType.AUTOMATION:
      return `FLOW completed automation: ${title.slice(0, 60)}`;

    case EventType.COMMUNICATION:
      return `${actor}: ${title.slice(0, 80)}`;

    case EventType.KNOWLEDGE:
      return `Document updated: ${title.slice(0, 80)}`;

    case EventType.HR:
      return `HR update: ${title.slice(0, 80)}`;

    case EventType.SECURITY:
      return `Security alert: ${title.slice(0, 80)}`;

    default:
      return title.slice(0, 100) || 'Event';
  }
}

function _buildActions(event) {
  const base = [
    { label: 'View Details', type: 'view',    eventId: event.id },
    { label: 'Ask FLOW',     type: 'copilot', eventId: event.id, context: event.title },
  ];

  if (['critical', 'high'].includes(event.priority)) {
    base.push({ label: 'Take Action', type: 'action', eventId: event.id });
  }

  if (event.type === EventType.APPROVAL) {
    base.push({ label: 'Approve', type: 'approve', eventId: event.id });
  }

  if (event.type === EventType.INCIDENT) {
    base.push({ label: 'Assign', type: 'assign', eventId: event.id });
  }

  return base;
}

function _safeMetadata(metadata) {
  if (!metadata) return {};
  // Strip large text fields to keep feed items lean
  const safe = { ...metadata };
  for (const key of ['body', 'bodyHtml', 'text', 'description', 'patch']) {
    if (safe[key]) safe[key] = String(safe[key]).slice(0, 100) + '…';
  }
  return safe;
}
