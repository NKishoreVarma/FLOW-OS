/**
 * EmotionalContextDetector — maps workspace state + time context to a conversation tone.
 *
 * The tone shapes every FLOW response: serious during incidents, celebratory after wins,
 * relaxed on Friday afternoons. It also gates MicroDelight and Joke eligibility.
 *
 * Tones (in priority order):
 *   serious      — any open incident (always wins)
 *   celebratory  — inbox zero, sprint done, deployment success, task done
 *   energetic    — Monday morning
 *   calm         — late night (10 PM – 5 AM)
 *   relaxed      — Friday afternoon, healthy low-activity workspace
 *   normal       — default
 */

export const TONES = {
  SERIOUS:     'serious',
  CELEBRATORY: 'celebratory',
  ENERGETIC:   'energetic',
  CALM:        'calm',
  RELAXED:     'relaxed',
  NORMAL:      'normal',
};

/**
 * @param {object} ctx
 * @param {boolean} [ctx.hasIncidents]        any open incident
 * @param {number}  [ctx.healthScore]         workspace health 0–100
 * @param {boolean} [ctx.isInboxZero]
 * @param {boolean} [ctx.taskJustDone]
 * @param {boolean} [ctx.deploymentSuccess]
 * @param {boolean} [ctx.sprintCompleted]
 * @param {Date}    [ctx.now]                 override for tests
 * @returns {{ tone: string, occasion: string|null }}
 */
export function detectEmotionalContext({
  hasIncidents      = false,
  healthScore       = 80,
  isInboxZero       = false,
  taskJustDone      = false,
  deploymentSuccess = false,
  sprintCompleted   = false,
  now               = new Date(),
} = {}) {
  // Incidents always override — never celebrate during an active incident.
  if (hasIncidents) {
    return { tone: TONES.SERIOUS, occasion: 'incident' };
  }

  // Celebration signals (explicit events)
  if (deploymentSuccess) return { tone: TONES.CELEBRATORY, occasion: 'deployment_success' };
  if (sprintCompleted)   return { tone: TONES.CELEBRATORY, occasion: 'sprint_completed' };
  if (isInboxZero)       return { tone: TONES.CELEBRATORY, occasion: 'inbox_zero' };
  if (taskJustDone)      return { tone: TONES.CELEBRATORY, occasion: 'task_done' };

  const hour = now.getHours();
  const day  = now.getDay(); // 0=Sun, 1=Mon, 5=Fri, 6=Sat

  // Late night (10 PM – 5 AM) → calm and brief
  if (hour >= 22 || hour < 5) {
    return { tone: TONES.CALM, occasion: 'late_night' };
  }

  // Friday afternoon (1 PM – 8 PM) → relaxed
  if (day === 5 && hour >= 13 && hour < 20) {
    return { tone: TONES.RELAXED, occasion: 'friday_afternoon' };
  }

  // Monday morning (7 AM – 11 AM) → energetic
  if (day === 1 && hour >= 7 && hour < 11) {
    return { tone: TONES.ENERGETIC, occasion: 'monday_morning' };
  }

  // Healthy workspace → slightly relaxed
  if (healthScore >= 85) {
    return { tone: TONES.RELAXED, occasion: 'healthy_workspace' };
  }

  return { tone: TONES.NORMAL, occasion: null };
}

/**
 * Returns a short tone-appropriate prefix line (or null if none applies).
 * Used by ResponseStructurer to open the response with context.
 */
export function getTonePrefix(tone, occasion) {
  switch (occasion) {
    case 'deployment_success': return 'Deployment landed cleanly.';
    case 'sprint_completed':   return 'Sprint wrapped up.';
    case 'inbox_zero':         return 'Inbox zero.';
    case 'task_done':          return 'Done.';
    case 'friday_afternoon':   return 'Happy Friday.';
    case 'monday_morning':     return 'Welcome to the week.';
    case 'healthy_workspace':  return 'Everything looks healthy.';
    case 'late_night':         return null;
    case 'incident':           return null;
    default:                   return null;
  }
}

/**
 * Returns true if this tone permits humor (jokes, micro-delights).
 */
export function tonePermitsHumor(tone) {
  return tone !== TONES.SERIOUS;
}

/**
 * Returns true if this tone warrants a celebration acknowledgment.
 */
export function isCelebratory(tone) {
  return tone === TONES.CELEBRATORY;
}
