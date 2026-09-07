/**
 * CasualLanguageHandler — intercepts non-operational inputs before the AI pipeline.
 *
 * When a user types "thanks", "yo", "haha", or "continue", running the full
 * capability-routing + LLM stack is wasteful and produces stilted responses.
 * This handler returns warm, immediate replies for every casual input type.
 *
 * "continue" is special — it returns type:'continue' with a null answer so the
 * caller can resolve the last conversation context from ConversationMemory.
 */

// ── Pattern registry ───────────────────────────────────────────────────────────
// Each entry: { pattern, type }
// Ordered most-specific first. First match wins.

const PATTERNS = [
  // Continuation
  { pattern: /^(?:continue|keep going|go on|and(?:\s+then)?\??|next|more|proceed)[.?]?\s*$/i, type: 'continue' },

  // Morning greetings
  { pattern: /^(?:good\s+morning|morning|gm|rise\s+and\s+shine)[.!]?\s*$/i, type: 'morning' },

  // Evening / departure
  { pattern: /^(?:good\s+night|goodnight|gn|good\s+evening|bye|goodbye|see\s+(?:you|ya)|ttyl|gtg|cya|later)[.!]?\s*$/i, type: 'goodbye' },

  // Gratitude
  { pattern: /^(?:thanks?(?:\s+a\s+lot)?|thank\s+you(?:\s+so\s+much)?|ty|thx|thxs|cheers|appreciate(?:d|s)?|much\s+appreciated)[.!]?\s*$/i, type: 'gratitude' },

  // Casual greeting
  { pattern: /^(?:hey+|yo+|sup|heyya?|what'?s\s+up|wassup|whats\s+good|howdy)[.!?]?\s*$/i, type: 'greeting_casual' },

  // Positive reactions
  { pattern: /^(?:nice|awesome|great|perfect|sweet|cool|love\s+it|amazing|brilliant|excellent|fantastic|wonderful|solid|nailed\s+it|good\s+work|well\s+done|beautiful|stellar|superb|boom|yesss?|lit)[.!]?\s*$/i, type: 'positive_reaction' },

  // Laughter / humor acknowledgment
  { pattern: /^(?:haha+|hehe+|lol+|lmao+|😂|😄|funny|ha|that'?s\s+(?:funny|good|hilarious))[.!]?\s*$/i, type: 'laughter' },

  // Simple acknowledgment
  { pattern: /^(?:ok(?:ay)?|got\s+it|makes?\s+sense|noted|roger|sure|yep|yup|yeah|yes|sounds?\s+good|sounds?\s+right|understood|copy(?:\s+that)?|right|i\s+see)[.!]?\s*$/i, type: 'acknowledgment' },

  // Thinking / pondering
  { pattern: /^(?:🤔|hmm+|hm+|interesting|i\s+see|curious|ah|ahh|oh)[.!]?\s*$/i, type: 'thinking' },

  // Help request
  { pattern: /^(?:help(?:\s+me)?|what\s+can\s+(?:you|u)\s+do\??|what\s+do\s+you\s+know\??|show\s+me\s+what\s+you\s+can\s+do)[.!?]?\s*$/i, type: 'help' },
];

// ── Response banks ─────────────────────────────────────────────────────────────

const GRATITUDE = [
  "Always happy to help.\n\nI'll keep watching the workspace. If anything important comes up, you'll be the first to know.",
  "Of course.\n\nI'm here whenever you need me — just ask.",
  "Anytime.\n\nI'll stay on top of things and surface anything that needs your attention.",
];

const MORNING = (name) => [
  `Good morning${name ? `, ${name}` : ''}.\n\nI've already reviewed the overnight activity. Ready when you are.`,
  `Morning${name ? ` ${name}` : ''}.\n\nI've been watching the workspace since you were last here. Want a quick rundown of what happened?`,
  `Good morning${name ? `, ${name}` : ''}. 👋\n\nI've checked everything while you were away. What would you like to start with?`,
];

const GOODBYE = (name) => [
  `Take care${name ? `, ${name}` : ''}.\n\nI'll keep an eye on things and make sure nothing slips through while you're out.`,
  `Have a good one.\n\nI'll be here if anything important comes up.`,
  `See you later${name ? `, ${name}` : ''}.\n\nI'll keep monitoring the workspace. Rest easy.`,
];

const CASUAL_GREETING = (name) => [
  `Hey${name ? ` ${name}` : ''}! 👋\n\nWhat are we working on today?`,
  `What's up${name ? ` ${name}` : ''}?\n\nReady when you are — workspace is loaded.`,
  `Hey! Good to have you back.\n\nWhat would you like to look at first?`,
];

const POSITIVE_REACTION = [
  "Glad that worked out.\n\nWhat's next?",
  "Nice. Let's keep the momentum going — what else can I help with?",
  "That's the way.\n\nAnything else on your plate today?",
  "Good progress.\n\nWhat would you like to tackle next?",
];

const LAUGHTER = [
  "Ha — glad I could lighten the mood.\n\nBack to business — what can I help with?",
  "😄 Fair enough.\n\nWhat else is on your mind?",
  "Always good to keep it light.\n\nWhat would you like to look at?",
];

const ACKNOWLEDGMENT = [
  "Perfect.\n\nLet me know when you're ready to continue.",
  "Got it.\n\nAnything else I can help you with?",
  "Understood.\n\nI'm here if you need anything else.",
  "Good.\n\nWhat would you like to do next?",
];

const THINKING = [
  "Take your time — I'm not going anywhere.\n\nWhat's on your mind?",
  "Thinking it over makes sense.\n\nAsk me anything when you're ready.",
  "Happy to wait.\n\nWhat would you like to explore?",
];

const HELP = [
  `I can help you navigate the whole workspace.\n\nAsk me about:\n\n• **Engineering** — PRs, deployments, code reviews, commit history\n• **Meetings** — prep, summaries, action items, scheduling\n• **Customers** — account health, churn risk, recent activity\n• **Incidents** — alerts, timelines, affected services, post-mortems\n• **Email** — inbox triage, drafts, threads, replies\n• **Projects** — sprint status, blockers, velocity, priorities\n• **Your team** — workload, recent activity, performance signals\n• **Company health** — workspace health score, risk signals, trends\n\nWhat would you like to start with?`,
];

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Returns true if the input is a casual, non-operational message.
 */
export function isCasualInput(text) {
  const t = (text || '').trim();
  if (!t || t.length > 120) return false;
  return PATTERNS.some(({ pattern }) => pattern.test(t));
}

/**
 * Returns the matched casual type, or null if not casual.
 */
export function getCasualType(text) {
  const t = (text || '').trim();
  const match = PATTERNS.find(({ pattern }) => pattern.test(t));
  return match?.type || null;
}

/**
 * Returns a full HIE-compatible response object for a casual input.
 * For type:'continue', returns { isCasual: true, type: 'continue', answer: null }
 * — the caller must resolve context from ConversationMemory.
 */
export function handleCasual(text, { userName = null } = {}) {
  const type = getCasualType(text);

  if (type === 'continue') {
    return { isCasual: true, type: 'continue', answer: null };
  }

  let answer;
  switch (type) {
    case 'gratitude':         answer = pick(GRATITUDE);              break;
    case 'morning':           answer = pick(MORNING(userName));      break;
    case 'goodbye':           answer = pick(GOODBYE(userName));      break;
    case 'greeting_casual':   answer = pick(CASUAL_GREETING(userName)); break;
    case 'positive_reaction': answer = pick(POSITIVE_REACTION);     break;
    case 'laughter':          answer = pick(LAUGHTER);               break;
    case 'acknowledgment':    answer = pick(ACKNOWLEDGMENT);         break;
    case 'thinking':          answer = pick(THINKING);               break;
    case 'help':              answer = pick(HELP);                   break;
    default:                  answer = "I'm here. What do you need?";
  }

  return {
    isCasual:        true,
    type,
    answer,
    followUps:       [],
    followUpQuestion: null,
    joke:            null,
    microDelight:    null,
    isEmpty:         false,
    domain:          'general',
  };
}
