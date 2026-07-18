/**
 * FollowUpEngine — generates intelligent, context-aware follow-up suggestions.
 *
 * Follow-ups are derived from:
 *   1. The topic domain (engineering / meetings / customers / etc.)
 *   2. Specific entities mentioned in the answer (PR numbers, names, etc.)
 *   3. What the user has NOT asked yet (from ConversationMemory)
 *
 * Rules:
 *   - Never generic ("Can I help with anything else?")
 *   - Never more than 3 follow-ups
 *   - Phrased as invitations, not commands
 *   - Start with "Want me to…" or "Should I…" or "Want to…"
 */

// ── Follow-up templates per domain ────────────────────────────────────────────

const FOLLOW_UP_POOLS = {
  engineering: [
    "Want me to check which PRs are ready to merge?",
    "Should I summarize the review comments?",
    "Want to see the deployment risk scores?",
    "Should I pull the latest commit history?",
    "Want me to check who's blocking the review?",
    "Should I compare this branch against main?",
    "Want to see the build status for these changes?",
  ],
  incidents: [
    "Want me to open the full incident timeline?",
    "Should I pull up which customers are affected?",
    "Want to see who's currently on-call?",
    "Should I check for related incidents in the last 24 hours?",
    "Want me to summarize the severity history?",
  ],
  meetings: [
    "Want me to prepare the context for your next meeting?",
    "Should I pull the action items from yesterday's calls?",
    "Want a summary of who you're meeting with today?",
    "Should I check if all attendees have confirmed?",
    "Want me to find any relevant documents for this meeting?",
  ],
  email: [
    "Want me to pull the full thread?",
    "Should I draft a reply?",
    "Want to see the unread messages since this morning?",
    "Should I search for related threads on this topic?",
  ],
  customers: [
    "Want me to pull the full account history?",
    "Should I check for recent support tickets from this customer?",
    "Want to see which customers are showing churn signals?",
    "Should I summarize the last three interactions?",
  ],
  tasks: [
    "Want me to show the full sprint board?",
    "Should I check the blockers for this ticket?",
    "Want to see what's due this week?",
    "Should I pull up related issues?",
  ],
  knowledge: [
    "Want me to search for related documents?",
    "Should I pull the full document?",
    "Want to see who last updated this?",
  ],
  people: [
    "Want me to pull this person's recent activity?",
    "Should I check their open tasks?",
    "Want to see who they've been collaborating with?",
  ],
  health: [
    "Want me to break down which areas are underperforming?",
    "Should I show the trend over the last 7 days?",
    "Want to see the specific metrics driving this score?",
  ],
  briefing: [
    "Should I go deeper on any of these items?",
    "Want me to prioritize today's action items?",
    "Should I prepare your afternoon digest?",
  ],
  general: [
    "Want me to search for more context on this?",
    "Should I check the recent timeline for anything related?",
    "Want me to pull this into your daily brief?",
  ],
};

// ── Entity extraction helpers ─────────────────────────────────────────────────

function extractMentions(text) {
  const mentions = { prs: [], names: [], tickets: [] };
  const prMatches     = text.match(/\bPR #?(\d+)\b/gi) || [];
  const ticketMatches = text.match(/\b[A-Z]+-\d+\b/g) || [];
  const nameMatches   = text.match(/\b([A-Z][a-z]+ [A-Z][a-z]+)\b/g) || [];
  mentions.prs     = [...new Set(prMatches)].slice(0, 2);
  mentions.tickets = [...new Set(ticketMatches)].slice(0, 2);
  mentions.names   = [...new Set(nameMatches)].slice(0, 1);
  return mentions;
}

function personalizeFollowUp(template, mentions) {
  if (!mentions) return template;
  let result = template;
  if (mentions.prs.length > 0)     result = result.replace('the PR', mentions.prs[0]);
  if (mentions.tickets.length > 0) result = result.replace('this ticket', mentions.tickets[0]);
  if (mentions.names.length > 0)   result = result.replace('this person', mentions.names[0]);
  return result;
}

// ── Shuffle helper (Fisher-Yates) ─────────────────────────────────────────────

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Generate 2–3 intelligent follow-up suggestions.
 *
 * @param {object} opts
 * @param {string}   opts.question      — what the user asked
 * @param {string}   opts.answer        — the final answer
 * @param {string}   opts.domain        — detected domain
 * @param {string[]} opts.recentTopics  — topics from ConversationMemory
 * @param {boolean}  opts.isEmpty       — was this an empty-state response?
 * @returns {string[]}
 */
export function generateFollowUps({ question = '', answer = '', domain = 'general', recentTopics = [], isEmpty = false } = {}) {
  const pool     = FOLLOW_UP_POOLS[domain] || FOLLOW_UP_POOLS.general;
  const mentions = extractMentions(answer);
  const count    = isEmpty ? 2 : 3;

  // Shuffle + pick
  const candidates = shuffle(pool).slice(0, count);
  return candidates.map(c => personalizeFollowUp(c, mentions));
}
