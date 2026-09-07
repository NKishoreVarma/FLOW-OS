/**
 * Injection Detector — identifies prompt injection and jailbreak attempts.
 * Pattern-based, no LLM involved. Runs on every user-supplied input.
 */

// Exact phrase patterns (case-insensitive)
const INJECTION_PATTERNS = [
  /ignore\s+(?:all\s+)?(?:previous|prior|above|earlier)\s+instructions?/i,
  /disregard\s+(?:all\s+)?(?:previous|prior|above|your|the)\s+instructions?/i,
  /forget\s+(?:everything|all|your\s+instructions?|the\s+above)/i,
  /you\s+are\s+now\s+(?:a|an|my|the)\s+\w+/i,
  /act\s+as\s+(?:if\s+)?(?:a|an|my)?\s+(?:human|person|admin|root|developer)/i,
  /pretend\s+(?:to\s+be|you\s+are|you're)\s+/i,
  /simulate\s+(?:a|an)\s+(?:human|ai|chatbot|assistant)\s+(?:that|who|which)/i,
  /jailbreak/i,
  /DAN\s+mode/i,
  /developer\s+mode\s+enabled/i,
  /\[system\]/i,
  /<\/?system>/i,
  /\/\*.*\*\//s,               // SQL-style comment injection
  /--\s*(?:end|stop|system)/i, // SQL comment as instruction boundary
  /\|\|\s*(?:ignore|forget)/i,
  /\n{3,}(?:ignore|forget|act\s+as)/i, // newline-padded injection
  // Data exfiltration patterns
  /(?:print|output|show|reveal|expose|dump)\s+(?:all\s+)?(?:system\s+)?(?:prompt|instructions?|context)/i,
  /(?:what|tell\s+me)\s+(?:are|is)\s+(?:your|the)\s+(?:system\s+)?(?:prompt|instructions?)/i,
];

// Structural injection: text that looks like it embeds a new system prompt
const STRUCTURAL_PATTERNS = [
  /^\s*###?\s*(?:system|instruction|role):/im,
  /^\s*\[(?:system|instruction)\]/im,
  /\bASSISTANT:\s*(?:Of course|Certainly|Sure)/im, // role-play injection
];

/**
 * Check text for prompt injection patterns.
 * @returns {{ safe: boolean, matches: string[], risk: 'none'|'low'|'medium'|'high' }}
 */
export function detect(text) {
  if (!text || typeof text !== 'string') return { safe: true, matches: [], risk: 'none' };

  const matches = [];

  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(text)) matches.push(pattern.source.slice(0, 40));
  }

  const structural = STRUCTURAL_PATTERNS.some(p => p.test(text));
  if (structural) matches.push('structural_injection');

  const risk = matches.length === 0 ? 'none'
    : matches.length <= 1 ? 'medium'
    : 'high';

  return { safe: matches.length === 0, matches, risk };
}
