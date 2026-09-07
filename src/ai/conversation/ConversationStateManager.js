/**
 * ConversationStateManager — per-workspace conversation state in Redis.
 *
 * Tracks the live conversation: current topic, entities, last response,
 * and message count. Enables pronoun resolution ("that", "it", "the same one").
 */

import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL || 'redis://127.0.0.1:6379', {
  maxRetriesPerRequest: 1,
  lazyConnect:         true,
});

const KEY = (wsId) => `flow:cm:state:${wsId}`;
const TTL = 4 * 60 * 60; // 4 hours

const defaults = () => ({
  currentTopic:        null,
  previousTopic:       null,
  currentIntent:       null,
  previousIntent:      null,
  entities: {
    customer:    null,
    project:     null,
    meeting:     null,
    employee:    null,
    pr:          null,
    incident:    null,
    deployment:  null,
  },
  lastResponse:        null,   // first 300 chars of last response
  lastRecommendation:  null,
  lastQuery:           null,
  messageCount:        0,
  sessionStartedAt:    Date.now(),
  updatedAt:           Date.now(),
});

export async function getState(workspaceId) {
  try {
    const raw = await redis.get(KEY(workspaceId));
    return raw ? { ...defaults(), ...JSON.parse(raw) } : defaults();
  } catch {
    return defaults();
  }
}

export async function updateState(workspaceId, patch) {
  try {
    const current = await getState(workspaceId);
    const next    = { ...current, ...patch, updatedAt: Date.now() };
    await redis.set(KEY(workspaceId), JSON.stringify(next), 'EX', TTL);
    return next;
  } catch {
    return { ...defaults(), ...patch };
  }
}

export async function pushTopic(workspaceId, topic) {
  if (!topic) return;
  const state = await getState(workspaceId);
  return updateState(workspaceId, {
    previousTopic: state.currentTopic,
    currentTopic:  topic,
    messageCount:  (state.messageCount || 0) + 1,
  });
}

export async function pushEntity(workspaceId, type, value) {
  if (!type || !value) return;
  const state = await getState(workspaceId);
  return updateState(workspaceId, {
    entities: { ...state.entities, [type]: value },
  });
}

export async function clearState(workspaceId) {
  try {
    await redis.del(KEY(workspaceId));
  } catch {}
}
