/**
 * ConversationMemory — remembers recent conversation turns per workspace.
 *
 * Enables: "continue", "go back", "tell me more", "what about that",
 * "the customer we were discussing", "yesterday's incident".
 *
 * Stores the last 10 turns per workspace in Redis as a list.
 */

import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL || 'redis://127.0.0.1:6379', {
  maxRetriesPerRequest: 1,
  lazyConnect:         true,
});

const HISTORY_KEY  = (wsId) => `flow:cm:history:${wsId}`;
const MAX_ENTRIES  = 10;
const TTL          = 8 * 60 * 60; // 8 hours

/**
 * Persist a conversation turn.
 */
export async function remember(workspaceId, {
  query,
  answer,
  intent,
  topic,
  entities  = {},
  followUps = [],
}) {
  try {
    const entry = JSON.stringify({
      query,
      answer:    (answer || '').slice(0, 500),
      intent,
      topic:     topic || null,
      entities,
      followUps: followUps.slice(0, 3),
      ts:        Date.now(),
    });
    const key = HISTORY_KEY(workspaceId);
    await redis.rpush(key, entry);
    await redis.ltrim(key, -MAX_ENTRIES, -1);
    await redis.expire(key, TTL);
  } catch { /* non-fatal */ }
}

/**
 * Return the last N conversation turns, most recent first.
 */
export async function recall(workspaceId, count = 5) {
  try {
    const items = await redis.lrange(HISTORY_KEY(workspaceId), -count, -1);
    return items.map(i => JSON.parse(i)).reverse();
  } catch {
    return [];
  }
}

/**
 * Get the single most recent turn.
 */
export async function getLastEntry(workspaceId) {
  const entries = await recall(workspaceId, 1);
  return entries[0] || null;
}

/**
 * Find the most recent turn that mentions a keyword.
 */
export async function findEntryAbout(workspaceId, keyword) {
  const entries = await recall(workspaceId, MAX_ENTRIES);
  const lower   = keyword.toLowerCase();
  return entries.find(e =>
    e.query?.toLowerCase().includes(lower) ||
    e.topic?.toLowerCase().includes(lower) ||
    e.answer?.toLowerCase().includes(lower)
  ) || null;
}

/**
 * Get the most recently mentioned entity of a given type.
 */
export async function getLastEntity(workspaceId, type) {
  const entries = await recall(workspaceId, MAX_ENTRIES);
  for (const e of entries) {
    if (e.entities?.[type]) return e.entities[type];
  }
  return null;
}

/**
 * Return a flat list of recent topic strings (for follow-up chip context).
 */
export async function getRecentTopics(workspaceId, count = 5) {
  const entries = await recall(workspaceId, count);
  return entries.map(e => e.topic || e.query).filter(Boolean);
}

/**
 * Clear all conversation history for this workspace.
 */
export async function clearMemory(workspaceId) {
  try {
    await redis.del(HISTORY_KEY(workspaceId));
  } catch {}
}
