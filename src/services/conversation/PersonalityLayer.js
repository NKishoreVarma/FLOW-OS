/**
 * PersonalityLayer — transforms robotic AI output into premium FLOW communication.
 *
 * FLOW speaks like an experienced Chief of Staff:
 *   Calm. Confident. Professional. Warm. Slightly witty. Never robotic.
 *
 * This layer runs rule-based cleanup on every response. No additional LLM call —
 * the cleanup is fast, deterministic, and covers 95% of robotic patterns.
 */

// ── Replacement rules ──────────────────────────────────────────────────────────
// Order matters: more specific patterns first.

const PHRASE_RULES = [
  // ── Remove AI self-identification sentences ────────────────────────────────
  // Matches with or without trailing comma/space: "As an AI, I..." or "as an AI I..."
  [/As an? AI(?: assistant| language model| system)?[,]?\s*/gi, ''],
  [/As your AI(?: assistant)?[,]?\s*/gi, ''],
  [/I(?:'m| am) an? AI(?: assistant| language model)?[,.]?\s*/gi, ''],

  // ── Remove access disclaimer sentences entirely ────────────────────────────
  [/I don'?t have (?:direct )?access to[^.!?]*[.!?]\s*/gi, ''],
  [/I(?:'m| am) not able to access[^.!?]*[.!?]\s*/gi, ''],
  [/I (?:can'?t|cannot) access[^.!?]*[.!?]\s*/gi, ''],
  [/I don'?t have (?:the ability|permission) to\b/gi, "That's not available"],

  // ── Remove "I can't / I don't know" patterns ──────────────────────────────
  [/I don'?t (?:have|possess) (?:that )?information[^.!?]*[.!?]\s*/gi, "I couldn't find that in this workspace. "],
  [/I (?:don'?t|cannot|can'?t) (?:provide|give you) (?:specific )?(?:information|details) on\b/gi, "I didn't find data on"],
  [/\bI'?m not sure\b/gi, "It looks like"],
  [/\bI'?m not certain\b/gi, "I believe"],
  [/\bI don'?t know\b/gi, "I couldn't find that"],

  // ── Remove hedging at sentence start ─────────────────────────────────────
  [/\bMaybe you\b/gi, "You"],
  [/\bMaybe I\b/gi, "I"],
  [/\bthere are maybe\b/gi, "there are"],
  [/\bthere were maybe\b/gi, "there were"],
  [/\bmaybe \d/gi, (m) => m.replace(/maybe /i, '')],
  [/\bPerhaps you\b/gi, "You"],
  [/\bPerhaps I\b/gi, "I"],
  [/\bIt might be worth\b/gi, "It's worth"],
  [/\bIt could be\b/gi, "It's"],
  [/\bIt seems like\b/gi, "It looks like"],
  [/\bI think that /gi, ""],
  [/\bI think I\b/gi, "I"],
  [/\bI think the\b/gi, "The"],
  [/\bI think there\b/gi, "There"],
  [/\bI believe that /gi, ""],
  [/\bI feel that /gi, ""],
  [/\bIn my opinion,?\s*/gi, ""],

  // ── Remove boilerplate openers ─────────────────────────────────────────────
  [/^(?:Certainly|Absolutely|Of course|Sure|Happy to help|Great question)[!,]?\s+/i, ''],
  [/^(?:Hello|Hi),?\s+(?:there)?[!,]?\s*/i, ''],

  // ── Remove boilerplate closers (handle . and !) ────────────────────────────
  [/\bI hope (?:this|that) (?:helps|answers)[^.!?]*[.!]\s*$/gi, ''],
  [/\bPlease (?:let|feel free to let) me know if [^.!?]*[.!]\s*$/gi, ''],
  [/\bDon'?t hesitate to (?:ask|reach out)[^.!?]*[.!]\s*$/gi, ''],
  [/\bLet me know if (?:you need|you have)[^.!?]*[.!]\s*$/gi, ''],
  [/\bFeel free to ask[^.!?]*[.!]\s*$/gi, ''],
  [/\bIs there anything (?:else|more)[^?]*\?\s*$/gi, ''],

  // ── Remove "Based on..." preambles ────────────────────────────────────────
  [/Based on (?:the )?(?:information|data|context) (?:provided|available|you (?:shared|provided)),?\s*/gi, ''],
  [/Based on (?:my )?(?:analysis|review) of[^,]*,?\s*/gi, ''],
  [/According to (?:the )?(?:available )?(?:information|data)[^,]*,?\s*/gi, ''],

  // ── Remove "recommend checking" patterns ──────────────────────────────────
  [/You (?:should|may want to) check\b/gi, "I can check"],
  [/You might want to\b/gi, "I can"],

  // ── FLOW identity cleanup ─────────────────────────────────────────────────
  [/\bI, as an? (?:AI|assistant),?\b/gi, 'I'],
];

// ── Empty state detection patterns ────────────────────────────────────────────
// If the response is just "no X found", upgrade it via EmptyStateEngine.

const EMPTY_PATTERNS = [
  /^(?:there are|there were)? ?no\s+\w+\s+(?:found|available|in|for)[^.]*\.?$/i,
  /^no\s+\w+\s+(?:were|are)?\s*(?:found|available)[^.]*\.?$/i,
  /^(?:i couldn't find|i didn't find) any\s+\w+[^.]*\.?$/i,
];

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Apply all personality rules to a response string.
 * Returns the cleaned, humanized version.
 */
export function applyPersonality(text) {
  if (!text) return text;

  let result = text;

  for (const [pattern, replacement] of PHRASE_RULES) {
    result = result.replace(pattern, replacement);
  }

  // Collapse multiple blank lines
  result = result.replace(/\n{3,}/g, '\n\n');

  // Trim leading/trailing whitespace and orphaned punctuation
  result = result.replace(/^[\s,.;]+/, '').replace(/[\s,.;]+$/, '').trim();

  // Capitalize first letter if it got lowercased by replacements
  if (result.length > 0) {
    result = result[0].toUpperCase() + result.slice(1);
  }

  return result;
}

/**
 * True if the response is just a "nothing found" message that
 * EmptyStateEngine should upgrade.
 */
export function isEmptyStateResponse(text) {
  const trimmed = (text || '').trim();
  return EMPTY_PATTERNS.some(p => p.test(trimmed)) || trimmed.length < 60;
}

/**
 * Detect the primary domain from the question + response text.
 * Used by FollowUpEngine and EmptyStateEngine to pick relevant suggestions.
 */
export function detectDomain(question = '', answer = '') {
  const combined = (question + ' ' + answer).toLowerCase();
  if (/pull.?request|pr |merge|branch|commit|deploy|github/i.test(combined)) return 'engineering';
  if (/incident|outage|down|alert|sev\d|p\d\b|pager/i.test(combined)) return 'incidents';
  if (/meeting|calendar|event|call|standup|agenda|attendee/i.test(combined)) return 'meetings';
  if (/customer|churn|account|deal|crm|hubspot|salesforce/i.test(combined)) return 'customers';
  if (/email|gmail|inbox|message|thread/i.test(combined)) return 'email';
  if (/task|jira|ticket|sprint|backlog|issue/i.test(combined)) return 'tasks';
  if (/document|notion|confluence|drive|wiki/i.test(combined)) return 'knowledge';
  if (/employee|team|hr|workday|bamboo|person|hire/i.test(combined)) return 'people';
  if (/health|score|risk|status|metric|kpi/i.test(combined)) return 'health';
  if (/brief|summary|morning|overview|update/i.test(combined)) return 'briefing';
  return 'general';
}
