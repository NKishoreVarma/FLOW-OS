/**
 * ConversationSimulator — runs conversation scenarios without external dependencies.
 *
 * Designed for CI:
 *   - No LLM calls (fast-path intent detection only)
 *   - No Redis (in-memory memory mock)
 *   - Imports only pure-function modules from the production codebase
 *   - Deterministic results for the same input
 *
 * Tests the real: tone engine, conversation planner, policy enforcement.
 * Mocks: LLM inference, Redis state, brain query.
 */

import { determineTone, TONES }            from '../../ai/conversation/AdaptiveToneEngine.js';
import { plan as makePlan }                from '../../ai/conversation/ConversationPlanner.js';
import { applyPolicies }                   from '../../ai/conversation/ConversationPolicy.js';

// ── Inline fast-path intent detection (zero external deps) ────────────────────
// Mirrors FAST_MAP from ConversationIntentEngine without importing BrainRouter.

// String constants (avoids importing INTENTS to sidestep BrainRouter dep)
const INTENTS_GREETING      = 'greeting';
const INTENTS_THANKS        = 'thanks';
const INTENTS_FAREWELL      = 'farewell';
const INTENTS_SMALL_TALK    = 'small_talk';
const INTENTS_CONTINUATION  = 'continuation';
const INTENTS_CLARIFICATION = 'clarification';
const INTENTS_JOKE          = 'joke';
const INTENTS_HELP          = 'help';
const INTENTS_CELEBRATION   = 'celebration';
const INTENTS_WQ            = 'workspace_query';
const INTENTS_TASK          = 'task_request';
const INTENTS_UNKNOWN       = 'unknown';

const FAST_MAP = [
  [/^(hi|hey|hello|helo|hlo|hii|sup|yo|howdy|hiya|heya|wassup|yoo|hey there)[\s!?.]*$/i,      INTENTS_GREETING],
  [/^good (morning|afternoon|evening|night|day)[\s!?.]*$/i,                                     INTENTS_GREETING],
  [/^(thanks?|thx|ty|cheers|thank you|thank u|thankyou|thanks everyone)[\s!?.]*$/i,            INTENTS_THANKS],
  [/^(bye|goodbye|cya|see ya|see you|goodnight|good night|ttyl|later|gotta go|bye,? see you tomorrow)[\s!?.]*$/i, INTENTS_FAREWELL],
  [/^(lol|lmao|haha|hehe|😂|😄|rofl|hahaha)[\s!?.]*$/i,                                       INTENTS_SMALL_TALK],
  [/^(cool|nice|awesome|great|wow|ok|okay|sure|yep|yup|yeah|k|👍|got it|perfect|noted|ok noted|bro|dude|got it!|great meeting!?)[\s!?.]*$/i, INTENTS_SMALL_TALK],
  [/^(continue|go on|carry on|what else|keep going|next|more|continue from before)[\s!?.]*$/i, INTENTS_CONTINUATION],
  [/^(tell me more|explain|elaborate|expand|go deeper|more details?)[\s!?.]*$/i,                INTENTS_CLARIFICATION],
  [/^(tell me (a )?joke|give me (something )?funny|make me laugh)[\s!?.]*$/i,                  INTENTS_JOKE],
  [/^(help|help me|what can you do|what do you do|capabilities|how does this work\??)[\s!?.]*$/i, INTENTS_HELP],
  [/^we (did it|shipped it|launched|deployed|fixed it|completed|finished|finished the sprint|shipped the feature)[\s!?.]*$/i, INTENTS_CELEBRATION],
  [/^(incident resolved|issue resolved|outage resolved|problem resolved)[\s!?.]*$/i,            INTENTS_CELEBRATION],
];

const SOCIAL_INTENTS = new Set([
  INTENTS_GREETING, INTENTS_THANKS, INTENTS_FAREWELL,
  INTENTS_SMALL_TALK, INTENTS_CELEBRATION, INTENTS_JOKE, INTENTS_HELP,
]);

function classifyIntent(message) {
  const t = message.trim();
  for (const [pattern, intent] of FAST_MAP) {
    if (pattern.test(t)) return intent;
  }

  // Heuristic for longer messages
  const lower = message.toLowerCase();

  if (/\b(continue|tell me more|explain|elaborate|what about|what else)\b/.test(lower) && message.length < 40) {
    return lower.includes('continue') ? INTENTS_CONTINUATION : INTENTS_CLARIFICATION;
  }
  if (/\b(joke|funny|make me laugh)\b/.test(lower)) return INTENTS_JOKE;
  if (/\b(thanks?|thank you)\b/.test(lower) && message.length < 30) return INTENTS_THANKS;
  if (/\b(bye|goodbye|see you)\b/.test(lower) && message.length < 30) return INTENTS_FAREWELL;

  if (/\b(show|list|find|get|what|how|who|when|where|why|analyze|summarize|check|review|tell me about)\b/.test(lower)) {
    return INTENTS_WQ;
  }

  return INTENTS_UNKNOWN;
}

// ── Social response stubs (no LLM) ────────────────────────────────────────────

const SOCIAL_RESPONSES = {
  [INTENTS_GREETING]:     'Hey there. Workspace is running smoothly. What should we focus on?',
  [INTENTS_THANKS]:       'Always here. I will keep watching the workspace and surface anything important.',
  [INTENTS_FAREWELL]:     'Take care. I will keep an eye on things.',
  [INTENTS_SMALL_TALK]:   'Good one. Anything we should tackle today?',
  [INTENTS_CELEBRATION]:  'Well done! That is great progress. What is next on the agenda?',
  [INTENTS_JOKE]:         'Why do programmers prefer dark mode? Because light attracts bugs. Back to work?',
  [INTENTS_HELP]:         'I can help you review PRs, check meetings, analyze incidents, monitor customers, and more. What would you like to start with?',
  [INTENTS_CONTINUATION]: 'Picking up from before. Want me to go deeper?',
  [INTENTS_CLARIFICATION]: 'Let me expand on that for you.',
};

// ── Follow-up builder (pure function, no LLM) ─────────────────────────────────

function buildFollowUps(intent, ctx) {
  const isSocial = SOCIAL_INTENTS.has(intent);

  if (intent === INTENTS_GREETING || intent === INTENTS_FAREWELL) {
    return ctx.hasIncidents
      ? ['Active incident', "What's urgent?", 'Workspace health']
      : ["What's urgent today?", 'My meetings', 'Workspace health'];
  }
  if (intent === INTENTS_THANKS)       return ["What's next?", 'Workspace status'];
  if (intent === INTENTS_HELP)         return ['Review open PRs', 'Upcoming meetings', 'Workspace health'];
  if (intent === INTENTS_JOKE)         return ["What's urgent?", 'Back to work'];
  if (intent === INTENTS_CONTINUATION) return ['Go deeper', 'Show full details', 'Related topics'];
  if (intent === INTENTS_CLARIFICATION) return ['More context', 'Full details', 'Related items'];

  // Workspace query: context-based
  const query = (ctx.query || '').toLowerCase();
  if (/\b(pr|pull request|commit|branch)\b/.test(query))  return ['Show open PRs',       'Blockers?',          'Who reviews?'];
  if (/\b(meeting|calendar|agenda)\b/.test(query))         return ['Show agenda',         'Who is attending?',  'Prep me'];
  if (/\b(incident|outage|alert)\b/.test(query))          return ['Incident log',        'Who is on-call?',    'Impact?'];
  if (/\b(customer|client|account)\b/.test(query))         return ['Customer health',     'Open issues?',       'Last contact?'];

  return ["What's urgent?", 'Workspace health', 'Show timeline'];
}

// ── Tone context builder ───────────────────────────────────────────────────────

function buildToneCtx(context) {
  const now = new Date();
  return {
    healthScore:      context.healthScore       ?? 80,
    hasIncidents:     context.hasIncidents       ?? false,
    isInboxZero:      context.isInboxZero        ?? false,
    taskJustDone:     context.taskJustDone       ?? false,
    deploymentSuccess: context.deploymentSuccess ?? false,
    sprintCompleted:  context.sprintCompleted    ?? false,
    hour:             context.hour               ?? now.getHours(),
    isFriday:         context.isFriday           ?? now.getDay() === 5,
    isMonday:         context.isMonday           ?? now.getDay() === 1,
    isWeekend:        now.getDay() === 0 || now.getDay() === 6,
    isFirstMessage:   context.isFirstMessage ?? false,
  };
}

// ── Planner context builder ────────────────────────────────────────────────────

function buildPlanCtx(intent, context, lastEntry, tone) {
  return {
    query:         context.query   || '',
    intent,
    tone,
    hasIncidents:  context.hasIncidents ?? false,
    lastEntry:     lastEntry || null,
    entities:      {},
    currentTopic:  null,
    messageCount:  0,
    isFirstMessage: true,
  };
}

// ── Main simulate function ─────────────────────────────────────────────────────

/**
 * Run a single scenario through the conversation pipeline (no LLM, no Redis).
 *
 * @param {object} scenario  — from ScenarioGenerator
 * @returns {SimulatorResult}
 */
export function simulate(scenario) {
  const { input, context = {}, mockBrain, memoryState = null } = scenario;

  // 1. Intent classification (fast-path only)
  const intent = classifyIntent(input);

  // 2. Memory (use seeded state if provided, otherwise empty)
  const lastEntry = memoryState?.lastEntry || null;

  // 3. Tone detection (real AdaptiveToneEngine)
  const toneCtx             = buildToneCtx({ ...context, query: input });
  const { tone, occasion }  = determineTone(toneCtx);

  // 4. Conversation planning (real ConversationPlanner)
  const planCtx            = buildPlanCtx(intent, { ...context, query: input }, lastEntry, tone);
  const conversationPlan   = makePlan(intent, planCtx);

  // 5. Execute plan
  const isSocial   = SOCIAL_INTENTS.has(intent);
  let brainCalled  = false;
  let rawAnswer;

  if (conversationPlan.requiresBrain && !isSocial) {
    brainCalled = true;
    rawAnswer   = mockBrain || 'Workspace data retrieved.';
  } else {
    rawAnswer = SOCIAL_RESPONSES[intent] || 'I am here. What would you like to look at?';
  }

  // Handle null mockBrain (simulates backend failure)
  if (brainCalled && mockBrain === null) {
    rawAnswer = 'Did not find a clear match — want to try a different search?';
    brainCalled = true;
  }

  // 6. Build follow-ups
  const followUps = buildFollowUps(intent, { ...context, query: input });

  // 7. Apply policy (real ConversationPolicy)
  const prePolicy = { answer: rawAnswer, followUps, followUpQuestion: null, responseShape: conversationPlan.shape };
  const final     = applyPolicies(prePolicy, conversationPlan, {
    ...planCtx,
    timeLabel: (toneCtx.hour || 10) >= 22 || (toneCtx.hour || 10) < 6 ? 'late_night' : 'morning',
    messageCount: 0,
  });

  return {
    intent,
    tone,
    occasion,
    brainCalled,
    answer:           final.answer       || '',
    followUps:        final.followUps    || [],
    followUpQuestion: final.followUpQuestion || null,
    responseShape:    conversationPlan.shape || 'narrative',
    isSocial,
    planAction:       conversationPlan.action,
  };
}
