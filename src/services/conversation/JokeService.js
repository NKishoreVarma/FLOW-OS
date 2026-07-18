/**
 * JokeService — optional wit for healthy, calm workspace moments.
 *
 * Rules (non-negotiable):
 *   - Safe mode ON. Programming + Misc categories only.
 *   - Dark jokes: never.
 *   - Max 1 joke per workspace per 4 hours.
 *   - Never during: incidents, outages, security events, customer escalations,
 *     compliance workflows, executive briefings, or critical alerts.
 *   - Only fire when: workspace healthy, inbox zero, no incidents, task complete,
 *     Friday afternoon, or user explicitly asks.
 *
 * Storage: jokes are pre-cached in Redis (fetch batch of 5).
 * The fetch respects JokeAPI rate limits (100 req/day per IP, we batch).
 */

import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL || 'redis://127.0.0.1:6379', {
  maxRetriesPerRequest: 1,
  lazyConnect: true,
});

const JOKE_API_URL  = 'https://v2.jokeapi.dev/joke/Programming,Misc?safe-mode&type=single&amount=5';
const CACHE_KEY     = 'flow:jokes:pool';
const LAST_KEY      = (wsId) => `flow:joke:last:${wsId}`;
const RATE_LIMIT_MS = 4 * 60 * 60 * 1000; // 4 hours
const POOL_TTL_S    = 12 * 60 * 60;         // 12 hours pool TTL

// Conditions that block jokes — checked against context
const BLOCKED_KEYWORDS = /incident|outage|down|sev[0-3]|security|breach|compliance|audit|critical|escalat|alert/i;

// ── Fetch helpers ─────────────────────────────────────────────────────────────

async function _replenishPool() {
  try {
    const res  = await fetch(JOKE_API_URL, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return;
    const data = await res.json();
    const jokes = (data.jokes || []).map(j => j.joke).filter(Boolean);
    if (!jokes.length) return;
    const pipeline = redis.pipeline();
    jokes.forEach(j => pipeline.rpush(CACHE_KEY, j));
    pipeline.expire(CACHE_KEY, POOL_TTL_S);
    await pipeline.exec();
  } catch { /* non-fatal — jokes are optional */ }
}

async function _pickJoke() {
  try {
    const len = await redis.llen(CACHE_KEY);
    if (len === 0) {
      await _replenishPool();
    }
    const joke = await redis.lpop(CACHE_KEY);
    return joke || null;
  } catch {
    return null;
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Return a joke if conditions are right. Returns null otherwise.
 *
 * @param {string} workspaceId
 * @param {object} context
 * @param {number}   [context.healthScore]     — workspace health (0-100)
 * @param {boolean}  [context.hasIncidents]    — true if any open incidents
 * @param {boolean}  [context.isInboxZero]     — true if inbox empty
 * @param {boolean}  [context.taskJustDone]    — true if a task was just completed
 * @param {boolean}  [context.userExplicitAsk] — true if user said "tell me a joke"
 * @param {string}   [context.answerText]      — text of the current answer
 * @returns {Promise<string|null>}
 */
export async function maybeGetJoke(workspaceId, context = {}) {
  const {
    healthScore     = 100,
    hasIncidents    = false,
    isInboxZero     = false,
    taskJustDone    = false,
    userExplicitAsk = false,
    answerText      = '',
  } = context;

  // Hard blocks — never show a joke in these contexts
  if (hasIncidents) return null;
  if (BLOCKED_KEYWORDS.test(answerText)) return null;

  // Check Friday afternoon (server time)
  const now       = new Date();
  const isFriday  = now.getDay() === 5;
  const isAfternoon = now.getHours() >= 13 && now.getHours() < 18;

  // Eligibility: user asked, OR workspace is calm and healthy
  const eligible = userExplicitAsk
    || (healthScore >= 80 && isInboxZero)
    || taskJustDone
    || (isFriday && isAfternoon && healthScore >= 65)
    || (healthScore >= 88); // Healthy workspace — light mood

  if (!eligible) return null;

  // Explicit user ask bypasses rate limit
  if (userExplicitAsk) {
    const joke = await _pickJoke();
    return joke || null;
  }

  // Per-workspace rate limit: max 1 ambient joke per 2 hours
  try {
    const lastKey  = LAST_KEY(workspaceId);
    const lastTime = await redis.get(lastKey);
    if (lastTime && Date.now() - Number(lastTime) < RATE_LIMIT_MS) {
      return null;
    }
    const joke = await _pickJoke();
    if (!joke) return null;

    await redis.set(lastKey, Date.now(), 'EX', Math.ceil(RATE_LIMIT_MS / 1000));
    return joke;
  } catch {
    return null;
  }
}

/**
 * Force-fetch and return a joke regardless of rate limit (for explicit user requests).
 * Still blocked during incidents/critical contexts.
 */
export async function getJoke(workspaceId, context = {}) {
  if (context.hasIncidents || BLOCKED_KEYWORDS.test(context.answerText || '')) {
    return null;
  }
  const joke = await _pickJoke();
  if (!joke) return null;
  try {
    await redis.set(LAST_KEY(workspaceId), Date.now(), 'EX', Math.ceil(RATE_LIMIT_MS / 1000));
  } catch {}
  return joke;
}
