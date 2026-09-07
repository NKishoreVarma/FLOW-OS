/**
 * EmptyStateEngine — replaces bare "nothing found" messages with premium copy.
 *
 * Philosophy: empty states are moments of clarity, not failure.
 * The response should be reassuring, brief, and forward-looking.
 */

const EMPTY_STATES = {
  // ── Engineering ──────────────────────────────────────────────────────────────
  pull_requests: {
    title: "You're all caught up.",
    body:  "There aren't any pull requests waiting for your review right now.",
  },
  commits: {
    title: "No recent commits.",
    body:  "The repository hasn't seen any new activity in the last 24 hours.",
  },
  deployments: {
    title: "Nothing deployed recently.",
    body:  "There are no recent deployments in this workspace.",
  },

  // ── Incidents ─────────────────────────────────────────────────────────────────
  incidents: {
    title: "Everything looks healthy.",
    body:  "There aren't any active incidents right now.",
  },
  alerts: {
    title: "No active alerts.",
    body:  "Your systems are running clean.",
  },

  // ── Meetings ─────────────────────────────────────────────────────────────────
  meetings: {
    title: "Your calendar is clear.",
    body:  "No upcoming meetings found for this period.",
  },
  meeting_prep: {
    title: "Nothing to prepare for.",
    body:  "There aren't any upcoming meetings that need context.",
  },

  // ── Email ─────────────────────────────────────────────────────────────────────
  emails: {
    title: "Inbox zero.",
    body:  "There's nothing in your inbox right now.",
  },
  unread: {
    title: "You're caught up.",
    body:  "No unread messages to review.",
  },

  // ── Tasks ─────────────────────────────────────────────────────────────────────
  tasks: {
    title: "No open tasks.",
    body:  "There aren't any tasks assigned to you right now.",
  },
  jira_issues: {
    title: "No issues in the queue.",
    body:  "The board is clear for this workspace.",
  },

  // ── Customers ─────────────────────────────────────────────────────────────────
  customers: {
    title: "No customer activity.",
    body:  "Nothing new from customers in this period.",
  },
  customer_risks: {
    title: "No customers at risk.",
    body:  "All tracked accounts look stable right now.",
  },

  // ── General ───────────────────────────────────────────────────────────────────
  general: {
    title: "Nothing to show.",
    body:  "I couldn't find anything matching that in this workspace.",
  },
};

// ── Keyword → empty-state type mapping ───────────────────────────────────────
const TYPE_KEYWORDS = {
  pull_requests: /pull.?request|pr |merge|review/i,
  commits:       /commit|push/i,
  deployments:   /deploy/i,
  incidents:     /incident|outage|down|sev\d|p[01]\b/i,
  alerts:        /alert|alarm|pager/i,
  meetings:      /meeting|calendar|event|call/i,
  meeting_prep:  /prep|agenda|context.*meeting/i,
  emails:        /email|gmail|inbox/i,
  unread:        /unread|unseen/i,
  tasks:         /task|jira|ticket|issue/i,
  customer_risks:/churn|at.risk|escalat/i,
  customers:     /customer|account|crm/i,
};

function detectEmptyType(text, domain) {
  const combined = (text + ' ' + domain).toLowerCase();
  for (const [type, pattern] of Object.entries(TYPE_KEYWORDS)) {
    if (pattern.test(combined)) return type;
  }
  return 'general';
}

/**
 * Generate a premium empty-state message for a given context.
 *
 * @param {object} opts
 * @param {string} opts.question   — what the user asked
 * @param {string} opts.answer     — the raw answer (detected as empty)
 * @param {string} opts.domain     — detected domain from PersonalityLayer
 * @returns {string}               — formatted empty state message
 */
export function generateEmptyState({ question = '', answer = '', domain = 'general' } = {}) {
  const type  = detectEmptyType(question + ' ' + answer, domain);
  const state = EMPTY_STATES[type] || EMPTY_STATES.general;
  return `${state.title}\n\n${state.body}`;
}

/**
 * True if the answer looks like a trivial empty state that should be upgraded.
 */
export function shouldUpgrade(text) {
  const t = (text || '').trim();
  if (t.length < 50) return true;
  // Single-sentence no-data statements
  if (/^(?:no |there (?:are|were) no |nothing |i couldn't find any |i didn't find any )/i.test(t)) return true;
  return false;
}
