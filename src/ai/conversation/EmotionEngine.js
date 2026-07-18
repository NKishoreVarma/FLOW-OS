/**
 * EmotionEngine — detects user emotional state from their message.
 *
 * Used to adjust: tone, response length, empathy level, and phrasing.
 * Does NOT override AdaptiveToneEngine — it augments it.
 */

import { ask }      from '../BrainRouter.js';
import { TaskType } from '../types.js';

export const EMOTIONS = Object.freeze({
  FRUSTRATED:  'frustrated',
  CONFUSED:    'confused',
  HAPPY:       'happy',
  CURIOUS:     'curious',
  URGENT:      'urgent',
  CELEBRATING: 'celebrating',
  NEUTRAL:     'neutral',
});

// Fast-path patterns — avoid LLM call for obvious signals
const FAST_EMOTIONS = [
  [/\b(wtf|this is broken|not working|ugh|frustrated|annoyed|terrible|awful|useless|broken again)\b/i, EMOTIONS.FRUSTRATED],
  [/\b(urgent|asap|right now|immediately|critical|fire|emergency|hurry|quickly|sev[0-2])\b/i,          EMOTIONS.URGENT],
  [/\b(we (did it|shipped|deployed|fixed|completed|finished)|launch day|released|shipped it)\b/i,      EMOTIONS.CELEBRATING],
  [/\b(lol|haha|😄|awesome|great|love|amazing|nice|cool|perfect|brilliant)\b/i,                       EMOTIONS.HAPPY],
  [/\b(confused|don'?t understand|what does|explain|what is|how does|not sure)\b/i,                    EMOTIONS.CONFUSED],
  [/\b(wonder|curious|interesting|could you|what if|tell me about|how come)\b/i,                      EMOTIONS.CURIOUS],
];

/**
 * Detect the emotional state of a user message.
 *
 * @param {string} message
 * @param {{ history?: Array }} opts
 * @returns {Promise<{ emotion: string, confidence: number, source: string }>}
 */
export async function detectEmotion(message, { history = [] } = {}) {
  // Fast path
  for (const [pattern, emotion] of FAST_EMOTIONS) {
    if (pattern.test(message)) return { emotion, confidence: 0.87, source: 'fast' };
  }

  // Very short messages default to neutral without LLM call
  if (message.trim().split(/\s+/).length <= 3) {
    return { emotion: EMOTIONS.NEUTRAL, confidence: 0.70, source: 'default' };
  }

  // LLM classification for ambiguous longer messages
  try {
    const prompt = `Classify the user's emotional state from this single message.
Options: ${Object.values(EMOTIONS).join(', ')}
Message: "${message}"
Reply with ONLY the emotion word.`;

    const response = await ask({
      taskType:    TaskType.CLASSIFY,
      messages:    [{ role: 'user', content: prompt }],
      maxTokens:   5,
      temperature: 0,
    });

    const text    = (response?.text || response || '').toString().trim().toLowerCase();
    const matched = Object.values(EMOTIONS).find(e => text === e || text.startsWith(e));
    if (matched) return { emotion: matched, confidence: 0.82, source: 'llm' };
  } catch { /* fall through */ }

  return { emotion: EMOTIONS.NEUTRAL, confidence: 0.50, source: 'default' };
}

/**
 * Return adjustments to response composition based on detected emotion.
 */
export function emotionToAdjustment(emotion) {
  const map = {
    [EMOTIONS.FRUSTRATED]:  { empathy: 'high',   responseLength: 'shorter',  prioritizeDirectness: true },
    [EMOTIONS.CONFUSED]:    { empathy: 'medium', responseLength: 'detailed', prioritizeDirectness: true },
    [EMOTIONS.HAPPY]:       { empathy: 'low',    responseLength: 'normal',   prioritizeDirectness: false },
    [EMOTIONS.CURIOUS]:     { empathy: 'low',    responseLength: 'detailed', prioritizeDirectness: false },
    [EMOTIONS.URGENT]:      { empathy: 'medium', responseLength: 'shorter',  prioritizeDirectness: true },
    [EMOTIONS.CELEBRATING]: { empathy: 'high',   responseLength: 'shorter',  prioritizeDirectness: false },
    [EMOTIONS.NEUTRAL]:     { empathy: 'low',    responseLength: 'normal',   prioritizeDirectness: false },
  };
  return map[emotion] || map[EMOTIONS.NEUTRAL];
}
