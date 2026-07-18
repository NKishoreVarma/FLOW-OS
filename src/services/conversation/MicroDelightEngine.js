/**
 * MicroDelightEngine — brief, observational workspace moments.
 *
 * Micro-delights are not jokes. They are warm, slightly witty observations
 * about the workspace state that make FLOW feel like it's genuinely paying
 * attention — not just answering questions.
 *
 * Rules:
 *   - Never when tone === 'serious' (active incidents)
 *   - ~18% probability when eligible (subtle, not every response)
 *   - Max 1 per workspace per 90 minutes
 *   - Never in executive briefings or critical alert contexts
 */

import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL || 'redis://127.0.0.1:6379', {
  maxRetriesPerRequest: 1,
  lazyConnect:          true,
});

const RATE_KEY     = (wsId) => `flow:delight:last:${wsId}`;
const RATE_LIMIT_S = 90 * 60; // 90 minutes
const FIRE_CHANCE  = 0.18;

const POOL = {
  engineering: [
    "Engineering seems unusually quiet today. I'm suspicious.",
    "No new incidents. Either the code is perfect, or no one's deployed yet.",
    "Clean CI across the board. Whoever's on call tonight is having a good day.",
    "The review queue is empty. Either everyone's been productive, or everyone's on vacation.",
  ],
  meetings: [
    "Three back-to-back meetings. I'll make sure the briefs are ready between each one.",
    "Your calendar is packed today. I'll keep the context warm between calls.",
    "Lots of meetings on the books. At least the agendas look prepared.",
  ],
  customers: [
    "No churn flags this week. Either retention is working, or everyone's on vacation.",
    "Quiet on the customer front. Sometimes that's the best kind of update.",
    "Customer health looks stable. Nothing that needs attention right now.",
  ],
  email: [
    "Nothing urgent in the inbox. Enjoy the quiet while it lasts.",
    "Inbox looks manageable today. That's either very organized or very lucky.",
  ],
  health: [
    "Workspace health is strong. Someone's been doing their job.",
    "Everything looks operational. Nothing hiding in the corners.",
    "Good news — nothing caught fire while you were away.",
  ],
  tasks: [
    "Sprint board is clean. Either the work is done, or it's still in review.",
    "No blocked items. That's either great process or great luck.",
  ],
  general: [
    "Good news. Nothing caught fire while you were away.",
    "Coffee first... or should we tackle that backlog?",
    "Everything looks clear. Either it's going well, or it's the quiet before the storm.",
    "Quiet workspace. I'll keep watching.",
  ],
};

function pick(domain) {
  const pool = POOL[domain] || POOL.general;
  return pool[Math.floor(Math.random() * pool.length)];
}

/**
 * Returns a micro-delight string, or null if conditions don't allow it.
 *
 * @param {string} workspaceId
 * @param {object} opts
 * @param {string} [opts.tone]          from EmotionalContextDetector
 * @param {string} [opts.domain]        detected domain
 * @param {number} [opts.healthScore]
 * @returns {Promise<string|null>}
 */
export async function getMicroDelight(workspaceId, { tone = 'normal', domain = 'general', healthScore = 80 } = {}) {
  if (tone === 'serious') return null;
  if (Math.random() > FIRE_CHANCE) return null;

  try {
    const last = await redis.get(RATE_KEY(workspaceId));
    if (last) return null;

    const delight = pick(domain);
    await redis.set(RATE_KEY(workspaceId), '1', 'EX', RATE_LIMIT_S);
    return delight;
  } catch {
    return null;
  }
}
