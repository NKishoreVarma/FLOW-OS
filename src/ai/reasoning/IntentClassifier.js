/**
 * IntentClassifier — the gate that runs BEFORE any retrieval.
 *
 * The bug this fixes: FLOW used to retrieve GitHub, Memory, Health, PRs, Calendar
 * AND Email for every question, then let the LLM blend them into one answer. Ask
 * about Gmail, get GitHub. That destroys trust.
 *
 * This classifier decides, deterministically, exactly which capabilities a request
 * is about — usually ONE. A focused request ("summarize my unread email") resolves
 * to a single capability and everything else is explicitly forbidden. Only genuinely
 * broad requests ("what should I focus on today?") fan out, and even then only to a
 * curated set — never the whole system.
 *
 * Output feeds the CapabilityPlanner, which turns the classification into an
 * execution plan (allowed/forbidden connectors, retrieval priority, evidence budget).
 *
 * No LLM. No network. Pure, testable, and impossible to contaminate.
 */

// Canonical capability values. Defined locally (not imported from CapabilityPlanner)
// so this classifier stays a pure, dependency-free, load-order-safe module — the
// planner imports the classifier, never the reverse. Values MUST match
// CapabilityPlanner.Capability exactly (they are compared as plain strings).
const Capability = Object.freeze({
  ENGINEERING:      'engineering',
  MEETINGS:         'meetings',
  CUSTOMERS:        'customers',
  INCIDENTS:        'incidents',
  KNOWLEDGE:        'knowledge',
  COMMUNICATIONS:   'communications',
  TIMELINE:         'timeline',
  MEMORY:           'memory',
  RECOMMENDATIONS:  'recommendations',
  HEALTH:           'health',
  PEOPLE:           'people',
  TRANSCRIPTS:      'transcripts',
  GRAPH:            'graph',
});

/**
 * Which live connectors each capability is allowed to touch. A capability that is
 * NOT in the classified set has ALL of its connectors forbidden. This is what stops
 * a Gmail question from ever executing a GitHub read.
 */
export const CAPABILITY_CONNECTORS = Object.freeze({
  [Capability.ENGINEERING]:    ['github', 'jira'],
  [Capability.MEETINGS]:       ['google-calendar'],
  [Capability.COMMUNICATIONS]: ['gmail', 'slack'],
  [Capability.CUSTOMERS]:      ['hubspot', 'salesforce'],
  [Capability.KNOWLEDGE]:      ['notion', 'confluence', 'jira', 'google-drive'],
  [Capability.PEOPLE]:         ['workday', 'bamboohr'],
  // Internal capabilities — no live connector, derived from FLOW's own records.
  [Capability.INCIDENTS]:      [],
  [Capability.TIMELINE]:       [],
  [Capability.MEMORY]:         [],
  [Capability.RECOMMENDATIONS]:[],
  [Capability.HEALTH]:         [],
  [Capability.TRANSCRIPTS]:    [],
  [Capability.GRAPH]:          [],
});

const ALL_CONNECTORS = [...new Set(Object.values(CAPABILITY_CONNECTORS).flat())];

/**
 * Follow-up suggestions are generated ONLY from the active capability. Email
 * follow-ups never appear on a GitHub answer and vice-versa (requirement 6).
 */
export const CAPABILITY_FOLLOWUPS = Object.freeze({
  [Capability.COMMUNICATIONS]: ['Reply', 'Archive', 'Mark Read'],
  [Capability.ENGINEERING]:    ['Review PR', 'Merge', 'Open Issue'],
  [Capability.MEETINGS]:       ['Reschedule', 'Invite', 'Cancel'],
  [Capability.CUSTOMERS]:      ['Open account', 'Log a note', 'Flag at-risk'],
  [Capability.INCIDENTS]:      ['Assign owner', 'Post an update', 'Start a postmortem'],
  [Capability.KNOWLEDGE]:      ['Open the doc', 'Summarize it', 'Share it'],
  [Capability.PEOPLE]:         ["Who's overloaded?", 'Show the org chart', "What's the team's capacity?"],
});

/**
 * Strong signal terms per capability. A "strong" hit (weight 3) is a term that
 * essentially names the domain; a "weak" hit (weight 1) is suggestive but shared.
 * The classifier picks the capability with the dominant score.
 */
const SIGNALS = {
  [Capability.COMMUNICATIONS]: {
    strong: ['email', 'emails', 'inbox', 'unread', 'gmail', 'reply', 'reply-all', 'forward', 'draft an email', 'compose', 'mailbox', 'e-mail'],
    weak:   ['message', 'thread', 'sent', 'received', 'mail', 'slack', 'dm', 'ping'],
  },
  [Capability.ENGINEERING]: {
    strong: ['pr', 'prs', 'pull request', 'pull requests', 'repository', 'repositories', 'repo', 'repos', 'commit', 'commits', 'merge', 'branch', 'deploy', 'deployment', 'ci', 'pipeline', 'code review', 'codebase'],
    weak:   ['code', 'build', 'review', 'diff', 'issue', 'ticket', 'bug', 'jira', 'sprint', 'release', 'engineer', 'engineering', 'push', 'pushed'],
  },
  [Capability.MEETINGS]: {
    strong: ['meeting', 'meetings', 'calendar', 'schedule a', 'reschedule', 'standup', 'stand-up', 'invite', 'agenda', 'my next meeting', 'book a', 'appointment'],
    weak:   ['sync', 'call', 'attendee', 'conference', 'zoom', 'google meet', 'upcoming', 'tomorrow', 'availability', 'free slot'],
  },
  [Capability.CUSTOMERS]: {
    strong: ['customer', 'customers', 'client', 'clients', 'account', 'accounts', 'churn', 'arr', 'mrr', 'renewal', 'deal', 'deals', 'crm'],
    weak:   ['revenue', 'sales', 'pipeline', 'prospect', 'contract', 'nps', 'upsell', 'at risk'],
  },
  [Capability.INCIDENTS]: {
    strong: ['incident', 'incidents', 'outage', 'sev1', 'sev2', 'sev 1', 'p0', 'p1', 'postmortem', 'post-mortem', 'production down', 'downtime'],
    weak:   ['down', 'alert', 'paged', 'broke', 'broken', 'breach', 'vulnerability', 'firefight'],
  },
  [Capability.KNOWLEDGE]: {
    strong: ['document', 'documents', 'doc', 'docs', 'wiki', 'notion', 'confluence', 'policy', 'runbook', 'knowledge base'],
    weak:   ['page', 'guide', 'procedure', 'spec', 'documentation', 'notes'],
  },
  [Capability.PEOPLE]: {
    strong: ['team', 'employee', 'employees', 'headcount', 'org chart', 'direct report', 'direct reports', 'who reports to', 'burnout', 'workload', 'capacity', 'pto'],
    weak:   ['people', 'manager', 'hire', 'hiring', 'onboard', 'offboard', 'staff'],
  },
  [Capability.TRANSCRIPTS]: {
    strong: ['transcript', 'transcripts', 'what was said', 'action items from', 'notes from the'],
    weak:   ['said', 'discussed', 'talked about', 'agreed'],
  },
};

/**
 * Phrases that make a request genuinely BROAD — the user wants a cross-cutting
 * prioritization, not one system. These are the only requests that fan out.
 */
const BROAD_PATTERNS = [
  /what should i (focus on|work on|do|prioriti[sz]e|tackle)/,
  /what('s| is) (my|the) (top |biggest )?(priorit|focus|risk)/,
  /morning (brief|briefing|update)/,
  /catch me up/,
  /what('s| is| has) (going on|happening|new|changed)( today| this week)?\??$/,
  /(give me|show me) (an? )?(overview|summary|rundown|digest|briefing)/,
  /how are we (doing|tracking|performing)/,
  /where do (things|we) stand/,
  /what needs my attention/,
  /brief me/,
  /status of (everything|the company|the business)/,
];

/** The curated fan-out for broad requests. Never the whole system. */
const BROAD_SET = [
  Capability.RECOMMENDATIONS,
  Capability.ENGINEERING,
  Capability.MEETINGS,
  Capability.COMMUNICATIONS,
  Capability.INCIDENTS,
];

/**
 * @typedef {Object} Classification
 * @property {string[]} capabilities  Ordered active capabilities (usually one)
 * @property {boolean}  focused       True when exactly one capability owns the request
 * @property {boolean}  broad         True when the request is a cross-cutting prioritization
 * @property {string}   primary       The dominant capability
 * @property {string[]} allowedConnectors
 * @property {string[]} forbiddenConnectors
 * @property {string}   reason
 */

/**
 * Classify a question into the minimal capability set that can answer it.
 * @param {string} question
 * @param {import('./IntentAnalyzer.js').IntentResult} [intent]
 * @returns {Classification}
 */
export function classifyIntent(question, intent = {}) {
  const q = ` ${String(question || '').toLowerCase().trim()} `;

  // 1. Broad prioritization → curated fan-out.
  if (BROAD_PATTERNS.some(re => re.test(q))) {
    return _finalize(BROAD_SET, { focused: false, broad: true, reason: 'broad prioritization request' }, q);
  }

  // 2. Score every capability.
  const scores = {};
  for (const [cap, sig] of Object.entries(SIGNALS)) {
    let s = 0;
    for (const term of sig.strong) if (_has(q, term)) s += 3;
    for (const term of sig.weak)   if (_has(q, term)) s += 1;
    if (s > 0) scores[cap] = s;
  }

  // 3. Intent domain gives a small nudge to the matching capability (tie-breaker only).
  const domainCap = _domainToCapability(intent.domain);
  if (domainCap && scores[domainCap] != null) scores[domainCap] += 1;

  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);

  // 4. Nothing matched → a general question ("who am I?", "show me the X situation",
  //    "what's going on with TechCorp"). Fan out across the work capabilities and let
  //    the LLM synthesize from whatever real context exists (plus the user's identity).
  //    NOT focused — so it never short-circuits to an empty "nothing urgent" reply.
  if (!ranked.length) {
    return _finalize(BROAD_SET, { focused: false, broad: true, reason: 'no domain signal — general/entity question' }, q);
  }

  const [topCap, topScore] = ranked[0];
  const [, secondScore]    = ranked[1] || [null, 0];

  // 5. One clear winner → FOCUSED. This is the critical isolation path: a single
  //    capability, every other connector explicitly forbidden. A dominant lead
  //    (>= 2x the runner-up, or the runner-up is only a weak single hit) locks it.
  if (ranked.length === 1 || topScore >= secondScore * 2 || secondScore <= 1) {
    return _finalize([topCap], { focused: true, broad: false, reason: `focused on ${topCap} (score ${topScore})` }, q);
  }

  // 6. Two capabilities with genuine, comparable signal (e.g. "emails about the
  //    outage") → allow just those two. Still isolated from everything else.
  const active = ranked.filter(([, s]) => s >= secondScore).map(([c]) => c).slice(0, 2);
  return _finalize(active, { focused: false, broad: false, reason: `multi: ${active.join(' + ')}` }, q);
}

// ── Connector-scoped follow-ups (requirement 6) ────────────────────────────────

/**
 * Suggest next actions drawn ONLY from the active capability. Never mixes domains.
 * @param {string} primaryCapability
 * @returns {string[]}
 */
export function followUpsForCapability(primaryCapability) {
  return CAPABILITY_FOLLOWUPS[primaryCapability] ? [...CAPABILITY_FOLLOWUPS[primaryCapability]] : [];
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function _finalize(caps, meta, q = '') {
  const capabilities = [...new Set(caps)];
  const allowed = [...new Set(capabilities.flatMap(c => _scopeConnectors(c, q)))];
  const forbidden = ALL_CONNECTORS.filter(c => !allowed.includes(c));
  return {
    capabilities,
    focused: meta.focused,
    broad: meta.broad,
    primary: capabilities[0],
    allowedConnectors: allowed,
    forbiddenConnectors: forbidden,
    reason: meta.reason,
  };
}

/**
 * Within a capability that has multiple providers, honor an EXPLICIT provider in the
 * request so "summarize my unread email" is Gmail-only (not Gmail+Slack) and a Jira
 * ticket question doesn't drag in GitHub. When the request names no specific provider,
 * all of the capability's connectors are allowed.
 */
function _scopeConnectors(cap, q) {
  const all = CAPABILITY_CONNECTORS[cap] || [];
  if (all.length <= 1) return all;

  if (cap === Capability.COMMUNICATIONS) {
    // Only UNAMBIGUOUS provider words scope the fetch. "unread"/"message" are shared
    // by both, so they don't force a provider — an explicit "slack"/"email" does.
    const email = /\b(e-?mails?|inbox|mailbox|gmail)\b/.test(q);
    const slack = /\b(slack|dm|dms|channel|channels)\b/.test(q);
    if (email && !slack) return ['gmail'];
    if (slack && !email) return ['slack'];
    return all;
  }
  if (cap === Capability.ENGINEERING) {
    const git  = /\b(github|pull request|prs?|commit|commits|repo|repos|repositor|branch|merge|deploy|deployment|ci|pipeline|codebase)\b/.test(q);
    const jira = /\b(jira|ticket|tickets|sprint|backlog|epic|epics)\b/.test(q);
    if (jira && !git) return ['jira'];
    if (git && !jira) return ['github'];
    return all;
  }
  return all;
}

// Word-boundary aware contains: avoids "pr" matching "approve" or "compress".
function _has(paddedQ, term) {
  if (term.includes(' ')) return paddedQ.includes(term);
  return new RegExp(`(^|[^a-z0-9])${_escape(term)}([^a-z0-9]|$)`).test(paddedQ);
}

function _escape(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

function _domainToCapability(domain) {
  const map = {
    engineering: Capability.ENGINEERING,
    customers:   Capability.CUSTOMERS,
    incidents:   Capability.INCIDENTS,
    meetings:    Capability.MEETINGS,
    knowledge:   Capability.KNOWLEDGE,
    people:      Capability.PEOPLE,
    security:    Capability.INCIDENTS,
  };
  return map[domain] || null;
}
