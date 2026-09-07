/**
 * ConversationManager — the top-level entry point for every conversation turn.
 *
 * PREVIOUS architecture (wrong):
 *   User → Operational Brain → Response Rewriter → Frontend
 *
 * NEW architecture:
 *   User
 *   → Intent Detection           (what kind of message is this?)
 *   → Emotion Detection          (how is the user feeling?)
 *   → Conversation Context       (what do we know about this session?)
 *   → Adaptive Tone              (how should FLOW be speaking right now?)
 *   → Conversation Planning      (what should FLOW actually do?)
 *   → [Operational Brain]        (ONLY if the plan requires workspace data)
 *   → Response Composition       (how should the answer be structured?)
 *   → Policy Enforcement         (are all quality rules met?)
 *   → Memory Persistence         (remember this for next turn)
 *   → Frontend
 *
 * Key property: The Operational Brain is NOT called for greetings, small talk,
 * thanks, jokes, farewells, or other social intents. This eliminates the
 * "hlo → Nothing found" class of bugs completely.
 */

import { detectIntent, INTENTS }         from './ConversationIntentEngine.js';
import { buildConversationContext }       from './ConversationContext.js';
import { determineTone }                 from './AdaptiveToneEngine.js';
import { detectEmotion, emotionToAdjustment } from './EmotionEngine.js';
import { plan as makePlan }              from './ConversationPlanner.js';
import { generateNaturalReply }          from './NaturalReplyGenerator.js';
import { compose }                       from './ResponseComposer.js';
import { applyPolicies, validatePlan }   from './ConversationPolicy.js';
import { pushTopic, updateState }        from './ConversationStateManager.js';
import { remember, recall, getLastEntry } from './ConversationMemory.js';
import { maybeGetJoke }                  from '../../services/conversation/JokeService.js';

/**
 * Process a single conversation turn.
 *
 * @param {object} opts
 * @param {string}    opts.workspaceId
 * @param {string}    opts.query             — the user's raw message
 * @param {Function}  [opts.brainQuery]      — async (queryText) → { answer, sources, cards, actions }
 *                                             Called ONLY when the plan requires it.
 * @param {string}    [opts.pageContext]
 * @param {string}    [opts.userName]
 * @param {number}    [opts.healthScore]
 * @param {boolean}   [opts.hasIncidents]
 * @param {boolean}   [opts.isInboxZero]
 * @param {boolean}   [opts.taskJustDone]
 * @param {boolean}   [opts.deploymentSuccess]
 * @param {boolean}   [opts.sprintCompleted]
 *
 * @returns {Promise<ConversationResponse>}
 */
export async function processConversationTurn({
  workspaceId,
  query,
  brainQuery         = null,
  pageContext         = '',
  userName            = null,
  healthScore         = 80,
  hasIncidents        = false,
  isInboxZero         = false,
  taskJustDone        = false,
  deploymentSuccess   = false,
  sprintCompleted     = false,
}) {
  const trimmedQuery = query?.trim() || '';
  console.log(`[CM] ▶  "${trimmedQuery.slice(0, 70)}" — wsId:${workspaceId}`);

  // ── Stage 1: Parallel: history + intent + emotion ────────────────────────
  const [{ intent, confidence, source }, { emotion }, lastEntry] = await Promise.all([
    detectIntent(trimmedQuery, { history: await recall(workspaceId, 3) }),
    detectEmotion(trimmedQuery),
    getLastEntry(workspaceId),
  ]);

  const emotionAdj = emotionToAdjustment(emotion);
  console.log(`[CM] ✓ Intent:${intent}(${source}) Emotion:${emotion}`);

  // ── Stage 2: Build full context ──────────────────────────────────────────
  const baseCtx = await buildConversationContext(workspaceId, {
    query: trimmedQuery,
    intent,
    userName,
    pageContext,
    healthScore,
    hasIncidents,
    isInboxZero,
    taskJustDone,
    deploymentSuccess,
    sprintCompleted,
  });

  // ── Stage 3: Determine tone ──────────────────────────────────────────────
  const { tone, occasion } = determineTone(baseCtx);
  const ctx = { ...baseCtx, tone, occasion, emotion, emotionAdj, lastEntry };
  console.log(`[CM] ✓ Tone:${tone}${occasion ? `(${occasion})` : ''}`);

  // ── Stage 4: Plan ────────────────────────────────────────────────────────
  const rawPlan          = makePlan(intent, ctx);
  const conversationPlan = validatePlan(rawPlan, ctx);
  console.log(`[CM] ✓ Plan:${conversationPlan.action} brain:${conversationPlan.requiresBrain}`);

  // ── Stage 5: Execute plan ────────────────────────────────────────────────
  let brainOutput  = null;
  let socialAnswer = null;

  if (conversationPlan.requiresBrain && brainQuery) {
    const queryText = conversationPlan.queryText || trimmedQuery;
    console.log(`[CM] ✓ Calling brain — "${queryText.slice(0, 60)}"`);
    try {
      brainOutput = await brainQuery(queryText);
      console.log(`[CM] ✓ Brain done — ${brainOutput?.answer?.length || 0} chars`);
    } catch (err) {
      console.warn(`[CM] Brain failed — ${err.message}`);
      brainOutput = { answer: null, cards: [], actions: [] };
    }
  } else {
    // Social / direct reply path — no brain query
    console.log(`[CM] ✓ Natural reply (brain skipped)`);
    socialAnswer = await generateNaturalReply(intent, ctx);
  }

  // ── Stage 6: Compose response ────────────────────────────────────────────
  let composed;
  if (socialAnswer !== null) {
    composed = {
      answer:           socialAnswer,
      followUps:        _socialFollowUps(intent, ctx),
      followUpQuestion: intent === INTENTS.FAREWELL ? null : _socialFollowUpQ(intent, ctx),
      responseShape:    'narrative',
    };
  } else {
    composed = await compose(conversationPlan, brainOutput, ctx);
  }
  console.log(`[CM] ✓ Composed — ${composed.answer?.length || 0} chars`);

  // ── Stage 7: Apply policies ──────────────────────────────────────────────
  const final = applyPolicies(composed, conversationPlan, ctx);

  // ── Stage 8: Optional joke ───────────────────────────────────────────────
  let joke = null;
  if (!hasIncidents) {
    joke = await maybeGetJoke(workspaceId, {
      healthScore,
      hasIncidents,
      isInboxZero,
      taskJustDone,
      userExplicitAsk: intent === INTENTS.JOKE || conversationPlan.forceJoke,
      answerText:      final.answer,
    }).catch(() => null);
  }

  // ── Stage 9: Persist state + memory (fire and forget) ───────────────────
  const topic = _extractTopic(trimmedQuery, intent, brainOutput);
  Promise.all([
    pushTopic(workspaceId, topic),
    updateState(workspaceId, {
      currentIntent: intent,
      lastResponse:  final.answer?.slice(0, 300),
      lastQuery:     trimmedQuery,
    }),
    remember(workspaceId, {
      query:     trimmedQuery,
      answer:    final.answer,
      intent,
      topic,
      entities:  ctx.entities,
      followUps: final.followUps,
    }),
  ]).catch(() => {});

  console.log(`[CM] ✓ Done — intent:${intent} tone:${tone} followUps:${final.followUps?.length} joke:${!!joke}`);

  return {
    answer:           final.answer   || '',
    followUps:        final.followUps || [],
    followUpQuestion: final.followUpQuestion || null,
    joke,
    microDelight:     null,
    tone,
    occasion,
    intent,
    emotion,
    isCasual:         _isSocialIntent(intent),
    responseShape:    final.responseShape || 'narrative',
    cards:            brainOutput?.cards    || [],
    actions:          brainOutput?.actions  || [],
    sources:          brainOutput?.sources  || [],
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const SOCIAL_INTENTS_SET = new Set([
  INTENTS.GREETING, INTENTS.SMALL_TALK, INTENTS.THANKS,
  INTENTS.FAREWELL, INTENTS.CELEBRATION, INTENTS.FEEDBACK,
  INTENTS.JOKE, INTENTS.HELP,
]);

function _isSocialIntent(intent) { return SOCIAL_INTENTS_SET.has(intent); }

function _socialFollowUps(intent, ctx) {
  if (intent === INTENTS.GREETING || intent === INTENTS.FAREWELL) {
    const chips = ["What's urgent today?", 'My meetings', 'Workspace health'];
    if (ctx.hasIncidents) chips.unshift('Active incident');
    return chips.slice(0, 3);
  }
  if (intent === INTENTS.THANKS)    return ["What's next?", 'Workspace status', 'Any open PRs?'];
  if (intent === INTENTS.HELP)      return ['Review open PRs', 'Upcoming meetings', 'Workspace health'];
  if (intent === INTENTS.JOKE)      return ["What's urgent?", 'Back to work', 'Team status'];
  return ["What's urgent today?", 'Show workspace health'];
}

function _socialFollowUpQ(intent, ctx) {
  if (intent === INTENTS.GREETING)    return 'What should we focus on first?';
  if (intent === INTENTS.THANKS)      return 'Anything else you need?';
  if (intent === INTENTS.HELP)        return 'Which of these would you like to start with?';
  if (intent === INTENTS.SMALL_TALK)  return 'Anything we should look at?';
  if (intent === INTENTS.CELEBRATION) return 'What is next on the agenda?';
  return null;
}

function _extractTopic(query, intent, brainOutput) {
  // For social intents, use the intent as the topic label
  if (SOCIAL_INTENTS_SET.has(intent)) return intent;

  // Try to extract a subject from the query
  const match = query.match(/\b(meeting|pr|pull request|incident|deployment|customer|project|team|health|budget|roadmap|sprint|ticket|jira)\b/i);
  if (match) return match[0].toLowerCase();

  return query.slice(0, 60);
}
