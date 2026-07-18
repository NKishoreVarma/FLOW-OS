/**
 * FLOW OS — Parser & Text Processing Service
 * 
 * Centralized service for clean text chunking, social data filtering,
 * and formatting configurations, as defined in FLOW Core Integration rules.
 */

const SOCIAL_KEYWORDS = [
  'lunch', 'dinner', 'badminton', 'rackets', 'smash practice', 'drinks', 'coffee',
  'joke', 'meetup', 'party', 'brunch', 'weekend', 'movie', 'game night',
  'casual chatter', 'hangout', 'pizza', 'beer', 'happy hour'
];

const GREETING_PATTERNS = [
  /^(hey|hi|hello|morning|afternoon|evening)\b/i,
  /\b(how are you|hope you are doing well|good morning|good afternoon|good evening)\b/i
];

/**
 * Normalizes and cleans formatting/whitespace artifacts from raw text.
 * @param {string} text
 * @returns {string} Cleaned and normalized text
 */
export function normalizeFormatting(text) {
  if (!text) return '';
  let cleaned = text
    .replace(/\r\n/g, '\n') // Normalize newlines
    .replace(/\n{3,}/g, '\n\n') // Collapse excessive newlines
    .replace(/[ \t]+/g, ' ') // Collapse multiple spaces/tabs
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"') // Normalize smart double quotes
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'"); // Normalize smart single quotes
  
  // Strip prompt injection
  const injectionPatterns = [
    /ignore\s+previous\s+instructions/i,
    /reveal\s+hr\s+database/i,
    /system\s+instructions/i,
    /bypass\s+shield/i
  ];
  for (const pat of injectionPatterns) {
    if (pat.test(cleaned)) {
      cleaned = cleaned.replace(pat, '[STRIPPED INJECTION]');
    }
  }
  return cleaned.trim();
}

/**
 * Analyzes text to determine if it is primarily social coordination or noise chatter.
 * @param {string} text
 * @returns {boolean} True if the text represents social coordination/casual chatter
 */
export function isSocialChatter(text) {
  if (!text) return false;
  const lowerText = text.toLowerCase().trim();
  
  // 1. Check for greeting-only messages
  const isGreetingOnly = GREETING_PATTERNS.some(pattern => pattern.test(lowerText)) && lowerText.split(/\s+/).length <= 4;
  if (isGreetingOnly) return true;
  
  // 2. Check for social keyword density
  let hitCount = 0;
  for (const kw of SOCIAL_KEYWORDS) {
    if (lowerText.includes(kw)) hitCount++;
  }
  
  // High density of social coordinates indicates social coordination chatter
  return hitCount >= 2 || (hitCount === 1 && lowerText.split(/\s+/).length < 15);
}

/**
 * Slices cleaned/normalized text into overlapping chunks of a specified maximum length.
 * 
 * @param {string} text       - Input text content to slice
 * @param {number} maxLength  - Max characters per block
 * @param {number} overlap    - Overlapping character count
 * @returns {string[]} Array of text chunks
 */
export function chunkText(text, maxLength = 500, overlap = 100) {
  const normalized = normalizeFormatting(text);
  if (!normalized) return [];
  if (normalized.length <= maxLength) return [normalized];

  const chunks = [];
  let start = 0;

  while (start < normalized.length) {
    chunks.push(normalized.slice(start, start + maxLength));
    start += (maxLength - overlap);
  }

  return chunks;
}

/**
 * Parses out potential tasks and deadlines from a query or update text string.
 *
 * @param {string} text
 * @returns {{ task: string|null, deadline: string|null }}
 */
export function extractTaskAndDeadline(text) {
  if (!text) return { task: null, deadline: null };
  const lower = text.toLowerCase();
  let task = null;
  let deadline = null;

  if (lower.includes('finish') || lower.includes('report') || lower.includes('todo') || lower.includes('complete') || lower.includes('task')) {
    task = text.trim();
    // Look for phrases like "by Friday", "by tomorrow", "by 2026-06-30"
    const deadlineMatch = text.match(/by\s+([a-zA-Z0-9_\-]+)/i);
    if (deadlineMatch) {
      deadline = deadlineMatch[1];
    }
  }

  return { task, deadline };
}
