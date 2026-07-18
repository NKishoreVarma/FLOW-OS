/**
 * GreetingEngine — personalized workspace greetings.
 *
 * Greetings are aware of:
 *   - Time of day (morning / afternoon / evening)
 *   - Workspace health
 *   - Pending items (meetings soon, unread messages, open incidents)
 *   - Day of week
 *
 * FLOW greets the user once per session, not on every message.
 * The session key is set in Redis with a 6-hour TTL.
 */

import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL || 'redis://127.0.0.1:6379', {
  maxRetriesPerRequest: 1,
  lazyConnect: true,
});

const SESSION_KEY = (wsId, userId) => `flow:greeting:session:${wsId}:${userId || 'anon'}`;
const SESSION_TTL = 6 * 60 * 60; // 6 hours

// ── Time helpers ──────────────────────────────────────────────────────────────

function getTimeOfDay() {
  const h = new Date().getHours();
  if (h < 12) return 'morning';
  if (h < 17) return 'afternoon';
  return 'evening';
}

function getDayContext() {
  const day = new Date().getDay();
  if (day === 1) return 'monday';   // Monday — new week
  if (day === 5) return 'friday';   // Friday — end of week
  return 'midweek';
}

// ── Greeting templates ────────────────────────────────────────────────────────

const GREETINGS = {
  morning: [
    "Good morning{name}.\n\nI've already reviewed everything since you were last here.",
    "Morning{name}.\n\nYour workspace is ready.",
    "Good morning{name}.\n\nI've been through the overnight activity — let me know where to start.",
  ],
  afternoon: [
    "Welcome back{name}.\n\nI've kept track of everything while you were away.",
    "Good afternoon{name}.\n\nHere's where things stand.",
    "Welcome back{name}.\n\nEverything's been running smoothly.",
  ],
  evening: [
    "Good evening{name}.\n\nI'm here whenever you need me.",
    "Evening{name}.\n\nThe workspace is quiet. Let me know what you need.",
    "Good evening{name}.\n\nStill a few things worth knowing about today.",
  ],
  monday: [
    "Welcome to the week{name}.\n\nI've reviewed the weekend activity and I'm ready to brief you.",
    "Good morning{name} — new week.\n\nI've prepared a summary of what happened over the weekend.",
  ],
  friday: [
    "Good morning{name} — it's Friday.\n\nLet me help you close the week cleanly.",
    "Happy Friday{name}.\n\nI've got everything you need to finish the week strong.",
  ],
};

// ── Contextual additions ──────────────────────────────────────────────────────

function buildContextLine({ healthScore, pendingItems }) {
  if (!healthScore && !pendingItems) return null;

  const lines = [];

  if (healthScore !== undefined) {
    if (healthScore >= 85) {
      lines.push("Your workspace health is strong.");
    } else if (healthScore >= 65) {
      lines.push(`Workspace health is at ${healthScore} — a few things to watch.`);
    } else {
      lines.push(`Workspace health has dropped to ${healthScore}. Let's address that.`);
    }
  }

  if (pendingItems) {
    const parts = [];
    if (pendingItems.meetings > 0)  parts.push(`${pendingItems.meetings} meeting${pendingItems.meetings > 1 ? 's' : ''} today`);
    if (pendingItems.incidents > 0) parts.push(`${pendingItems.incidents} open incident${pendingItems.incidents > 1 ? 's' : ''}`);
    if (pendingItems.unread > 0)    parts.push(`${pendingItems.unread} unread message${pendingItems.unread > 1 ? 's' : ''}`);
    if (parts.length > 0) lines.push(`You have ${parts.join(', ')}.`);
  }

  return lines.length > 0 ? lines.join(' ') : null;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Generate a personalized greeting for a user's session.
 * Returns null if this session already has a greeting (deduplicated per 6h).
 *
 * @param {object} opts
 * @param {string} opts.workspaceId
 * @param {string} [opts.userId]
 * @param {string} [opts.userName]         — first name for personalization
 * @param {number} [opts.healthScore]      — 0-100 workspace health
 * @param {object} [opts.pendingItems]     — { meetings, incidents, unread }
 * @param {boolean} [opts.forceGenerate]   — skip session dedup (for explicit greeting requests)
 * @returns {Promise<string|null>}
 */
export async function getGreeting({
  workspaceId,
  userId,
  userName,
  healthScore,
  pendingItems,
  forceGenerate = false,
} = {}) {
  // Session deduplication — only greet once per 6 hours
  if (!forceGenerate) {
    try {
      const sessionKey = SESSION_KEY(workspaceId, userId);
      const seen = await redis.get(sessionKey);
      if (seen) return null;
      await redis.set(sessionKey, '1', 'EX', SESSION_TTL);
    } catch { /* non-fatal */ }
  }

  // Pick template based on time + day
  const timeOfDay = getTimeOfDay();
  const dayCtx    = getDayContext();

  const pool = GREETINGS[dayCtx] || GREETINGS[timeOfDay] || GREETINGS.morning;
  const template = pool[Math.floor(Math.random() * pool.length)];

  // Personalize name
  const nameStr = userName ? `, ${userName.split(' ')[0]}` : '';
  let greeting  = template.replace(/{name}/g, nameStr);

  // Append context line
  const contextLine = buildContextLine({ healthScore, pendingItems });
  if (contextLine) {
    greeting += `\n\n${contextLine}`;
  }

  return greeting;
}

/**
 * Clear the session greeting state so the user gets a greeting next visit.
 * Call this on logout or explicit session reset.
 */
export async function clearGreetingSession(workspaceId, userId) {
  try {
    await redis.del(SESSION_KEY(workspaceId, userId));
  } catch {}
}
