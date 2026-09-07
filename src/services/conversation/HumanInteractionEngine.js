/**
 * HumanInteractionEngine (HIE) — Phase 9.7
 *
 * The outermost conversational layer of FLOW.
 *
 * FLOW is not a chatbot. FLOW is the smartest employee in the company.
 * Every response must feel like it came from a Chief of Staff who:
 *   - Knows the workspace deeply
 *   - Never leaves the user at a dead end
 *   - Is calm, confident, professional, and warm
 *   - Is curious and always moves the conversation forward
 *
 * Pipeline:
 *   1. CasualLanguageHandler  — intercept non-operational inputs immediately
 *   2. ConversationMemory     — resolve "continue" from last session context
 *   3. EmotionalContextDetector — establish tone (serious/celebratory/relaxed/etc.)
 *   4. PersonalityLayer       — remove all robotic phrases
 *   5. EmptyStateEngine       — upgrade "nothing found" to premium empty states
 *   6. ResponseStructurer     — enforce 5-part architecture
 *   7. FollowUpEngine         — generate 2-3 contextual action chips
 *   8. MicroDelightEngine     — occasional witty workspace observation
 *   9. JokeService            — optional wit (strict conditions)
 *   10. ConversationMemory    — persist this interaction
 *
 * Output shape:
 * {
 *   answer:          string,    full formatted response
 *   followUps:       string[],  2-3 clickable action chips
 *   followUpQuestion: string,   the embedded closing question
 *   joke:            string|null,
 *   microDelight:    string|null,
 *   isEmpty:         boolean,
 *   isCasual:        boolean,
 *   domain:          string,
 *   tone:            string,
 *   occasion:        string|null,
 *   structure: { directAnswer, explanation, followUp }
 * }
 */

import { isCasualInput, getCasualType, handleCasual } from './CasualLanguageHandler.js';
import { applyPersonality, isEmptyStateResponse, detectDomain } from './PersonalityLayer.js';
import { generateEmptyState, shouldUpgrade }            from './EmptyStateEngine.js';
import { generateFollowUps }                            from './FollowUpEngine.js';
import { detectEmotionalContext, getTonePrefix, TONES } from './EmotionalContextDetector.js';
import { structureResponse, extractStructure }          from './ResponseStructurer.js';
import { getMicroDelight }                              from './MicroDelightEngine.js';
import { maybeGetJoke }                                 from './JokeService.js';
import { trackTopic, getRecentTopics, getLastContext }  from './ConversationMemory.js';

const JOKE_REQUEST = /tell (?:me )?a joke|give me (?:something )?funny|make me laugh|surprise me/i;

// ── Main pipeline ──────────────────────────────────────────────────────────────

/**
 * Process a raw AI response through the full HIE pipeline.
 *
 * @param {object} opts
 * @param {string}   opts.rawAnswer
 * @param {string}   opts.question
 * @param {string}   opts.workspaceId
 * @param {string}   [opts.pageContext]
 * @param {number}   [opts.healthScore]       0–100
 * @param {boolean}  [opts.hasIncidents]
 * @param {boolean}  [opts.isInboxZero]
 * @param {boolean}  [opts.taskJustDone]
 * @param {boolean}  [opts.deploymentSuccess]
 * @param {boolean}  [opts.sprintCompleted]
 * @param {string}   [opts.userName]
 * @param {string[]} [opts.sources]
 */
export async function process({
  rawAnswer         = '',
  question          = '',
  workspaceId,
  pageContext        = '',
  healthScore        = 80,
  hasIncidents       = false,
  isInboxZero        = false,
  taskJustDone       = false,
  deploymentSuccess  = false,
  sprintCompleted    = false,
  userName           = null,
  sources            = [],
} = {}) {

  // ── Stage 1: Casual language intercept ──────────────────────────────────────
  if (isCasualInput(question)) {
    const casualType = getCasualType(question);

    if (casualType === 'continue') {
      const lastCtx = workspaceId ? await getLastContext(workspaceId).catch(() => null) : null;

      if (lastCtx) {
        const continueAnswer = `Picking up where we left off.\n\n${lastCtx.summary}\n\nWant me to go deeper on this?`;
        return {
          answer:           continueAnswer,
          followUps:        lastCtx.followUps || [],
          followUpQuestion: 'Want me to go deeper on this?',
          joke:             null,
          microDelight:     null,
          isEmpty:          false,
          isCasual:         true,
          domain:           lastCtx.domain || 'general',
          tone:             TONES.NORMAL,
          occasion:         null,
          structure:        extractStructure(continueAnswer),
        };
      }
      // No memory — fall through with a revised question
    } else {
      const result = handleCasual(question, { userName });
      return {
        ...result,
        followUpQuestion: null,
        microDelight:     null,
        tone:             TONES.NORMAL,
        occasion:         null,
        structure:        extractStructure(result.answer || ''),
      };
    }
  }

  console.log(`[HIE] ✓ Pipeline started — "${question.slice(0, 60)}" wsId:${workspaceId || 'null'}`);

  // ── Stage 2: Emotional context ───────────────────────────────────────────────
  const { tone, occasion } = detectEmotionalContext({
    hasIncidents, healthScore, isInboxZero,
    taskJustDone, deploymentSuccess, sprintCompleted,
  });
  const tonePrefix = getTonePrefix(tone, occasion);
  console.log(`[HIE] ✓ Emotional context — tone:${tone} occasion:${occasion || 'none'}`);

  // ── Stage 3: Domain detection ────────────────────────────────────────────────
  const domain = detectDomain(question, rawAnswer);
  console.log(`[HIE] ✓ Domain detected — ${domain}`);

  // ── Stage 4: Personality cleanup ────────────────────────────────────────────
  let answer = rawAnswer;
  try {
    answer = applyPersonality(rawAnswer);
    console.log('[HIE] ✓ Personality layer executed');
  } catch { /* keep original */ }

  // ── Stage 5: Empty state upgrade ────────────────────────────────────────────
  let isEmpty = false;
  if (shouldUpgrade(answer)) {
    isEmpty = true;
    try {
      answer = generateEmptyState({ question, answer, domain });
    } catch { /* keep cleaned */ }
  }
  console.log(`[HIE] ✓ EmptyStateEngine executed — isEmpty:${isEmpty}`);

  // ── Stage 6: 5-part response structure ──────────────────────────────────────
  let followUpQuestion = '';
  try {
    const structured = structureResponse(answer, { question, domain, tone, tonePrefix, isEmpty });
    answer           = structured.text;
    followUpQuestion = structured.followUpQuestion;
    console.log('[HIE] ✓ ResponseStructurer executed');
  } catch { /* keep current answer */ }

  // ── Stage 7: Follow-up chips ─────────────────────────────────────────────────
  let followUps = [];
  try {
    const recentTopics = workspaceId ? await getRecentTopics(workspaceId).catch(() => []) : [];
    followUps = generateFollowUps({ question, answer, domain, recentTopics, isEmpty });
    console.log(`[HIE] ✓ FollowUpEngine executed — ${followUps.length} chips`);
  } catch { /* no follow-ups is fine */ }

  // ── Stage 8: Micro-delight ───────────────────────────────────────────────────
  let microDelight = null;
  if (workspaceId) {
    try {
      microDelight = await getMicroDelight(workspaceId, { tone, domain, healthScore });
      if (microDelight) console.log('[HIE] ✓ MicroDelight fired');
    } catch { /* non-fatal */ }
  }

  // ── Stage 9: Joke ────────────────────────────────────────────────────────────
  let joke = null;
  if (workspaceId) {
    try {
      joke = await maybeGetJoke(workspaceId, {
        healthScore,
        hasIncidents,
        isInboxZero,
        taskJustDone,
        userExplicitAsk: JOKE_REQUEST.test(question),
        answerText:      answer,
      });
      if (joke) console.log('[HIE] ✓ Joke fetched');
    } catch { /* non-fatal */ }
  }

  console.log(`[HIE] ✓ Final response ready — domain:${domain} tone:${tone} followUps:${followUps.length} joke:${!!joke} delight:${!!microDelight}`);

  // ── Stage 10: Persist to memory ──────────────────────────────────────────────
  if (workspaceId) {
    trackTopic(workspaceId, question, answer, { followUps }).catch(() => {});
  }

  return {
    answer,
    followUps,
    followUpQuestion,
    joke,
    microDelight,
    isEmpty,
    isCasual:  false,
    domain,
    tone,
    occasion,
    structure: extractStructure(answer),
  };
}

/**
 * Lightweight sync path — no Redis, no follow-ups, no joke.
 * Use for briefings, summaries, and system-generated content.
 */
export function quickClean(rawText, question = '') {
  try {
    let text = applyPersonality(rawText || '');
    if (shouldUpgrade(text)) {
      const domain = detectDomain(question, text);
      text = generateEmptyState({ question, answer: text, domain });
    }
    return text;
  } catch {
    return rawText || '';
  }
}
