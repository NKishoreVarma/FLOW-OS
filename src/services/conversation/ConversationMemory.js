/**
 * ConversationMemory — conversation continuity and context tracking.
 *
 * Tracks the last 5 interactions per workspace session (4h TTL).
 * Each entry stores: domain, question, answer summary, follow-ups, and timestamp.
 *
 * Used by:
 *   - FollowUpEngine     — avoid re-suggesting recent topics
 *   - GreetingEngine     — know what's been discussed this session
 *   - HumanInteractionEngine — resolve "continue" command
 */

import Redis from 'ioredis';
import { detectDomain } from './PersonalityLayer.js';

const redis = new Redis(process.env.REDIS_URL || 'redis://127.0.0.1:6379', {
  maxRetriesPerRequest: 1,
  lazyConnect:          true,
});

const TOPICS_KEY  = (wsId) => `flow:convo:topics:${wsId}`;
const MAX_TOPICS  = 5;
const TTL_SECONDS = 4 * 60 * 60; // 4 hours

// ── Core topic tracking ────────────────────────────────────────────────────────

/**
 * Record one interaction in the session memory.
 *
 * @param {string}   workspaceId
 * @param {string}   question
 * @param {string}   answer
 * @param {object}   [opts]
 * @param {string[]} [opts.followUps]   action chips from this response
 */
export async function trackTopic(workspaceId, question, answer, { followUps = [] } = {}) {
  try {
    const domain = detectDomain(question, answer);
    const key    = TOPICS_KEY(workspaceId);

    // Store a summary: first 200 chars of the answer, stripped of markdown
    const summary = answer
      .replace(/\*\*/g, '')
      .replace(/^#+\s+/gm, '')
      .trim()
      .slice(0, 200);

    const entry = JSON.stringify({
      domain,
      question: question.slice(0, 80),
      summary,
      followUps: followUps.slice(0, 3),
      ts: Date.now(),
    });

    await redis.lpush(key, entry);
    await redis.ltrim(key, 0, MAX_TOPICS - 1);
    await redis.expire(key, TTL_SECONDS);
  } catch { /* non-fatal */ }
}

/**
 * Get all recent topics for this workspace session.
 *
 * @returns {Promise<Array<{ domain, question, summary, followUps, ts }>>}
 */
export async function getRecentTopics(workspaceId) {
  try {
    const raw = await redis.lrange(TOPICS_KEY(workspaceId), 0, MAX_TOPICS - 1);
    return raw.map(r => {
      try { return JSON.parse(r); } catch { return null; }
    }).filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Get the most recent interaction context for "continue" resolution.
 *
 * @returns {Promise<{ domain, question, summary, followUps } | null>}
 */
export async function getLastContext(workspaceId) {
  try {
    const raw = await redis.lindex(TOPICS_KEY(workspaceId), 0);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Clear all conversation memory for a workspace.
 */
export async function clearMemory(workspaceId) {
  try {
    await redis.del(TOPICS_KEY(workspaceId));
  } catch {}
}
