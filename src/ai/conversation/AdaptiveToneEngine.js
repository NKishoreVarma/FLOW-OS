/**
 * AdaptiveToneEngine — determines conversational tone from workspace + time context.
 *
 * Tone drives HOW FLOW speaks, not WHAT it says.
 * It informs the NaturalReplyGenerator and ResponseComposer.
 *
 * Priority (highest first):
 *   incidents → celebration → first message → time of day → default
 */

export const TONES = Object.freeze({
  SERIOUS:      'serious',       // incident or outage in progress
  CELEBRATORY:  'celebratory',  // deployment success, sprint complete, inbox zero
  ENERGETIC:    'energetic',    // Monday morning kick-off
  FOCUSED:      'focused',      // standard afternoon work session
  CALM:         'calm',         // late night or weekend
  RELAXED:      'relaxed',      // Friday afternoon
  PROFESSIONAL: 'professional', // executive briefing context
  WARM:         'warm',         // greeting or first message of session
  NORMAL:       'normal',       // default work mode
});

export const OCCASIONS = Object.freeze({
  INCIDENT:       'incident',
  INBOX_ZERO:     'inbox_zero',
  DEPLOYMENT:     'deployment_success',
  SPRINT_DONE:    'sprint_complete',
  TASK_DONE:      'task_done',
  FRIDAY_PM:      'friday_afternoon',
  MONDAY_AM:      'monday_morning',
  LATE_NIGHT:     'late_night',
  FIRST_MESSAGE:  'first_message',
  NONE:           null,
});

/**
 * Determine the right tone and occasion from context.
 *
 * @param {object} ctx  — from buildConversationContext
 * @returns {{ tone: string, occasion: string|null }}
 */
export function determineTone(ctx) {
  const {
    hasIncidents, deploymentSuccess, sprintCompleted,
    taskJustDone, isInboxZero, isFriday, isMonday,
    hour, isFirstMessage, healthScore,
  } = ctx;

  if (hasIncidents)                                   return { tone: TONES.SERIOUS,      occasion: OCCASIONS.INCIDENT };
  if (deploymentSuccess)                              return { tone: TONES.CELEBRATORY,  occasion: OCCASIONS.DEPLOYMENT };
  if (sprintCompleted)                                return { tone: TONES.CELEBRATORY,  occasion: OCCASIONS.SPRINT_DONE };
  if (taskJustDone)                                   return { tone: TONES.WARM,         occasion: OCCASIONS.TASK_DONE };
  if (isInboxZero && (healthScore || 80) >= 85)       return { tone: TONES.CELEBRATORY,  occasion: OCCASIONS.INBOX_ZERO };
  if (isFirstMessage)                                 return { tone: TONES.WARM,         occasion: OCCASIONS.FIRST_MESSAGE };
  if (hour >= 22 || hour < 6)                         return { tone: TONES.CALM,         occasion: OCCASIONS.LATE_NIGHT };
  if (isFriday && hour >= 14)                         return { tone: TONES.RELAXED,      occasion: OCCASIONS.FRIDAY_PM };
  if (isMonday && hour >= 8 && hour < 11)             return { tone: TONES.ENERGETIC,    occasion: OCCASIONS.MONDAY_AM };
  if (hour >= 9 && hour < 17)                         return { tone: TONES.FOCUSED,      occasion: null };

  return { tone: TONES.NORMAL, occasion: OCCASIONS.NONE };
}

/**
 * Human-readable tone descriptor for use in LLM prompts.
 */
export function toneToDescription(tone) {
  const map = {
    [TONES.SERIOUS]:      'serious and direct — no humor, no small talk, focus on resolution',
    [TONES.CELEBRATORY]:  'celebratory and warm — acknowledge what just happened, then keep moving',
    [TONES.ENERGETIC]:    'energetic and motivating — start of the week, let us build something great',
    [TONES.FOCUSED]:      'focused and efficient — the user is deep in work mode',
    [TONES.CALM]:         'calm and concise — it is late, keep it short and clear',
    [TONES.RELAXED]:      'relaxed and slightly playful — Friday afternoon, work is winding down',
    [TONES.PROFESSIONAL]: 'professional and precise — executive audience, every word counts',
    [TONES.WARM]:         'warm and welcoming — make the user feel genuinely seen',
    [TONES.NORMAL]:       'clear, direct, and professional — trusted senior colleague',
  };
  return map[tone] || map[TONES.NORMAL];
}

export function tonePermitsHumor(tone) {
  return [TONES.RELAXED, TONES.CELEBRATORY, TONES.WARM, TONES.NORMAL].includes(tone);
}

export function toneRequiresShortResponse(tone) {
  return [TONES.CALM, TONES.SERIOUS].includes(tone);
}
