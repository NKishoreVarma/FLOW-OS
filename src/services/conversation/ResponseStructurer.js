/**
 * ResponseStructurer — enforces FLOW's 5-part response architecture.
 *
 * Every FLOW response must contain:
 *   1. Direct answer     — what the user asked, answered directly
 *   2. Explanation       — context that makes the answer meaningful
 *   3. Why it matters    — why this is relevant to their work
 *   4. Next best action  — one concrete thing they can do
 *   5. Follow-up question — continues the conversation naturally
 *
 * This module does not rewrite the AI's answer. It detects which parts
 * are present and generates the missing pieces — ensuring every response
 * is complete without feeling formulaic.
 */

import { detectDomain } from './PersonalityLayer.js';

// ── "Why it matters" — domain context lines ───────────────────────────────────

const WHY_MATTERS = {
  engineering: "Engineering momentum depends on keeping the queue clean.",
  incidents:   "Fast resolution keeps customer impact minimal and team confidence high.",
  meetings:    "Preparation is what separates a productive meeting from a wasted hour.",
  customers:   "Early signals on customer health are far easier to act on than late ones.",
  email:       "Staying on top of communication keeps decisions from getting stuck.",
  tasks:       "Closed items create space for the work that actually moves things forward.",
  knowledge:   "Clear documentation means less time re-learning and more time building.",
  people:      "Team health directly impacts delivery speed and quality.",
  health:      "Workspace health is your early warning system for problems that haven't surfaced yet.",
  briefing:    "Starting the day with full context means better decisions from the first meeting.",
  general:     "Staying informed keeps you ahead of what the workspace needs.",
};

// ── Next best actions — domain-specific ───────────────────────────────────────

const NEXT_ACTIONS = {
  engineering: [
    "Want me to pull up the current PR queue?",
    "Should I check which deployments are pending today?",
    "Want me to look at the latest commit activity?",
    "Should I pull the merge readiness scores for open PRs?",
  ],
  incidents: [
    "Want me to open the full incident timeline?",
    "Should I check which services are currently affected?",
    "Want me to see who's on call right now?",
  ],
  meetings: [
    "Want me to prepare the brief for your next meeting?",
    "Should I check who's attending and what the agenda looks like?",
    "Want me to pull the latest context for today's calls?",
  ],
  customers: [
    "Want me to check the full account history?",
    "Should I pull up recent customer communications?",
    "Want me to look at churn risk across all accounts?",
  ],
  email: [
    "Should I draft a reply to that thread?",
    "Want me to check for anything urgent in the inbox?",
    "Should I flag the messages that need a response today?",
  ],
  tasks: [
    "Want me to show the current sprint status?",
    "Should I check which items are blocked right now?",
    "Want me to pull up the backlog by priority?",
  ],
  knowledge: [
    "Should I search for related documents?",
    "Want me to check who last updated this?",
    "Should I pull up the full document context?",
  ],
  people: [
    "Want me to check recent activity for this person?",
    "Should I look at their current workload?",
    "Want me to see their recent commits and PRs?",
  ],
  health: [
    "Should I pull the detailed health breakdown?",
    "Want me to look at what's driving the score?",
    "Should I check which areas have the most risk signals?",
  ],
  general: [
    "What would you like to look at next?",
    "Is there a specific area you'd like me to dig into?",
    "Want me to check something specific?",
  ],
};

function pickAction(domain) {
  const pool = NEXT_ACTIONS[domain] || NEXT_ACTIONS.general;
  return pool[Math.floor(Math.random() * pool.length)];
}

function getWhyItMatters(domain) {
  return WHY_MATTERS[domain] || WHY_MATTERS.general;
}

// ── Structure detection ────────────────────────────────────────────────────────

function endsWithQuestion(text) {
  return /\?\s*$/.test((text || '').trim());
}

function isSubstantive(text) {
  const lines = (text || '').split('\n').filter(l => l.trim());
  return lines.length >= 3 || text.length > 180;
}

function hasExplanation(text) {
  // A response with 2+ non-empty paragraphs likely has explanation
  const paras = (text || '').split(/\n\n+/).filter(p => p.trim());
  return paras.length >= 2;
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Shape a cleaned response into the 5-part FLOW format.
 *
 * @param {string} cleanedAnswer    — after PersonalityLayer has run
 * @param {object} opts
 * @param {string} opts.question
 * @param {string} opts.domain
 * @param {string} opts.tone        from EmotionalContextDetector
 * @param {string} [opts.tonePrefix] from getTonePrefix()
 * @param {boolean} opts.isEmpty    — this was an empty-state upgrade
 * @returns {{ text: string, followUpQuestion: string }}
 */
export function structureResponse(cleanedAnswer, {
  question    = '',
  domain      = 'general',
  tone        = 'normal',
  tonePrefix  = null,
  isEmpty     = false,
} = {}) {
  const parts = [];

  // 1. Tone prefix (e.g., "Happy Friday." / "Inbox zero.")
  if (tonePrefix) {
    parts.push(tonePrefix);
  }

  // 2. Main answer body
  parts.push(cleanedAnswer);

  // 3. "Why it matters" — only if response is short or an empty state
  if (isEmpty || !isSubstantive(cleanedAnswer)) {
    parts.push(getWhyItMatters(domain));
  }

  // 4. + 5. Next best action / follow-up question
  const followUpQuestion = pickAction(domain);

  // Only append if the answer doesn't already end with a question
  if (!endsWithQuestion(cleanedAnswer)) {
    parts.push(followUpQuestion);
  }

  return {
    text:            parts.filter(Boolean).join('\n\n'),
    followUpQuestion,
  };
}

/**
 * Extract the structural breakdown from a formatted response text.
 * Best-effort — used for rich UI rendering.
 *
 * @returns {{ directAnswer: string|null, explanation: string|null, followUp: string|null }}
 */
export function extractStructure(text) {
  const paragraphs = (text || '').split(/\n\n+/).filter(p => p.trim());

  const followUp = paragraphs.find(p => /\?\s*$/.test(p.trim())) || null;
  const nonQuestion = paragraphs.filter(p => !/\?\s*$/.test(p.trim()));

  return {
    directAnswer: nonQuestion[0]?.trim() || null,
    explanation:  nonQuestion.length > 1 ? nonQuestion.slice(1).join('\n\n').trim() : null,
    followUp:     followUp?.trim() || null,
  };
}
