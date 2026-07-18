/**
 * ConversationIntentEngine — LLM-based intent classification.
 *
 * Every message is classified before any other processing happens.
 * This single gate determines whether the Operational Brain is invoked at all.
 *
 * Flow:
 *   1. Fast path  — obvious social phrases (<5 words) avoid any LLM call
 *   2. LLM path   — structured classification with conversation history
 *   3. Heuristic  — fallback if LLM is unavailable
 */

import { ask }      from '../BrainRouter.js';
import { TaskType } from '../types.js';

export const INTENTS = Object.freeze({
  GREETING:        'greeting',
  SMALL_TALK:      'small_talk',
  WORKSPACE_QUERY: 'workspace_query',
  TASK_REQUEST:    'task_request',
  CLARIFICATION:   'clarification',
  FOLLOW_UP:       'follow_up',
  CONTINUATION:    'continuation',
  CORRECTION:      'correction',
  FEEDBACK:        'feedback',
  CELEBRATION:     'celebration',
  THANKS:          'thanks',
  FAREWELL:        'farewell',
  JOKE:            'joke',
  HELP:            'help',
  SUGGESTION:      'suggestion',
  UNKNOWN:         'unknown',
});

const SOCIAL_INTENTS = new Set([
  INTENTS.GREETING, INTENTS.SMALL_TALK, INTENTS.THANKS,
  INTENTS.FAREWELL, INTENTS.CELEBRATION, INTENTS.FEEDBACK,
  INTENTS.JOKE,
]);

const DIRECT_REPLY_INTENTS = new Set([
  ...SOCIAL_INTENTS, INTENTS.HELP,
]);

// Fast-path table: patterns that are unambiguous without LLM
const FAST_MAP = [
  [/^(hi|hey|hello|helo|hlo|hii|sup|yo|howdy|hiya|heya|wassup|what'?s up|yoo)[\s!?.]*$/i,                       INTENTS.GREETING],
  [/^good (morning|afternoon|evening|night|day)[\s!?.]*$/i,                                                        INTENTS.GREETING],
  [/^(thanks?|thx|ty|cheers|thank you|thank u|thankyou)[\s!?.]*$/i,                                               INTENTS.THANKS],
  [/^(bye|goodbye|cya|see ya|see you|goodnight|good night|ttyl|later|gotta go)[\s!?.]*$/i,                        INTENTS.FAREWELL],
  [/^(lol|lmao|haha|hehe|😂|😄|😆|rofl|lmaoo|hahaha)[\s!?.]*$/i,                                               INTENTS.SMALL_TALK],
  [/^(cool|nice|awesome|great|wow|ok|okay|sure|yep|yup|yeah|k|👍|got it|sounds good|perfect|noted)[\s!?.]*$/i,  INTENTS.SMALL_TALK],
  [/^(continue|go on|carry on|what else|keep going|next|more)[\s!?.]*$/i,                                         INTENTS.CONTINUATION],
  [/^(tell me more|explain|elaborate|expand|go deeper|more details?)[\s!?.]*$/i,                                   INTENTS.CLARIFICATION],
  [/^tell me (a )?joke|give me (something )?funny|make me laugh|joke please[\s!?.]*$/i,                            INTENTS.JOKE],
  [/^(help|help me|\?|what can you do|what do you do|capabilities)[\s!?.]*$/i,                                     INTENTS.HELP],
  [/^we (did it|shipped it|launched|deployed|fixed it|completed|finished)[\s!?.]*$/i,                              INTENTS.CELEBRATION],
];

function fastClassify(message) {
  const t = message.trim();
  for (const [pattern, intent] of FAST_MAP) {
    if (pattern.test(t)) return intent;
  }
  return null;
}

const INTENT_LIST = Object.values(INTENTS).join(', ');

function classifyPrompt(message, history) {
  const historyBlock = history.length
    ? `Recent conversation:\n${history.slice(-3).map(h => `${h.role}: ${h.content?.slice(0, 80)}`).join('\n')}\n\n`
    : '';

  return `Classify the user's message into exactly one intent.

Intents: ${INTENT_LIST}

Definitions:
greeting — hi, hello, hey, good morning, yo, sup, bro, first message
small_talk — casual chat, lol, haha, cool, nice, awesome, bro, that's funny, random chatter
workspace_query — questions about data, projects, meetings, PRs, team, incidents, customers, health
task_request — "show me", "list", "find", "create", "summarize", "analyze", explicit action
clarification — tell me more, explain, elaborate, expand on previous answer
follow_up — "what about X?", "and the other one?", references something previously said
continuation — "continue", "go on", "what else", resume previous topic
correction — "that's wrong", "no I meant", "actually", correcting a previous response
feedback — rating the response: "good", "not helpful", "that worked", "wrong"
celebration — "we shipped it", "launch day", "we fixed it", explicitly celebrating
thanks — thank you, thanks, thx, cheers, appreciate it
farewell — bye, goodbye, see you, goodnight, signing off
joke — explicitly asking for a joke or to be made to laugh
help — asking what FLOW can do, how it works, capabilities
suggestion — "you should", "maybe try", "what if you", offering an idea
unknown — none of the above

${historyBlock}Message: "${message}"

Reply with ONLY the intent name. Nothing else.`;
}

/**
 * Classify the intent of a user message.
 *
 * @param {string} message
 * @param {{ history?: Array<{role:string,content:string}> }} opts
 * @returns {Promise<{ intent: string, confidence: number, source: string }>}
 */
export async function detectIntent(message, { history = [] } = {}) {
  // 1. Fast path — no LLM needed for obvious social messages
  const fast = fastClassify(message);
  if (fast) return { intent: fast, confidence: 0.97, source: 'fast' };

  // 2. LLM classification
  try {
    const response = await ask({
      taskType:    TaskType.CLASSIFY,
      messages:    [{ role: 'user', content: classifyPrompt(message, history) }],
      maxTokens:   10,
      temperature: 0,
    });

    const text    = (response?.text || response || '').toString().trim().toLowerCase();
    const matched = Object.values(INTENTS).find(i => text.startsWith(i) || text === i);
    if (matched) return { intent: matched, confidence: 0.88, source: 'llm' };
  } catch { /* fall through to heuristic */ }

  // 3. Heuristic fallback (only if LLM unavailable)
  const lower = message.toLowerCase();
  if (/\b(show|list|find|get|what|how|who|when|where|why|analyze|summarize|check|review)\b/.test(lower)) {
    return { intent: INTENTS.WORKSPACE_QUERY, confidence: 0.60, source: 'heuristic' };
  }

  return { intent: INTENTS.UNKNOWN, confidence: 0.30, source: 'heuristic' };
}

/** True if this intent never requires a workspace query. */
export function isSocialIntent(intent)         { return SOCIAL_INTENTS.has(intent); }

/** True if this intent requires a direct NaturalReplyGenerator response. */
export function isDirectReplyIntent(intent)    { return DIRECT_REPLY_INTENTS.has(intent); }

/** True if this intent must query the Operational Brain. */
export function requiresWorkspaceBrain(intent) {
  return [INTENTS.WORKSPACE_QUERY, INTENTS.TASK_REQUEST].includes(intent);
}

/** True if this intent should try to expand the previous brain answer. */
export function isExpansionIntent(intent) {
  return [INTENTS.CLARIFICATION, INTENTS.FOLLOW_UP, INTENTS.CONTINUATION, INTENTS.CORRECTION].includes(intent);
}
