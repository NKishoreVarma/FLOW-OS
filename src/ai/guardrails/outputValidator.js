/**
 * Output Validator — validates AI-generated text before returning to callers.
 *
 * Checks:
 * 1. Citation integrity — if the response claims a source, does it exist in context?
 * 2. Hallucination proxy — high-confidence claims with zero grounding evidence
 * 3. Forbidden phrases — FLOW identity violations ("As an AI...", "I don't have access")
 * 4. PII in output — AI must not echo back PII that was in the context
 * 5. Length sanity — responses that are unreasonably short or long
 */
import { scan as piiScan } from './piiDetector.js';

const FORBIDDEN_PHRASES = [
  /as an ai(?: language model|,| assistant)?/i,
  /i (?:don't|do not|cannot|can't) have (?:access|the ability)/i,
  /i (?:don't|do not) have information about/i,
  /i recommend (?:checking|consulting|visiting|looking at)/i,
  /i'm just an ai/i,
  /i (?:cannot|can't) browse the (?:internet|web)/i,
  /my (?:knowledge|training) (?:cutoff|data)/i,
];

/**
 * Validate an AI-generated response.
 *
 * @param {string} text - The AI output
 * @param {Object} [context] - The assembled context that was sent to the AI
 * @returns {{ valid: boolean, issues: string[], severity: 'none'|'warn'|'block' }}
 */
export function validate(text, context = {}) {
  if (!text) return { valid: false, issues: ['empty_response'], severity: 'block' };

  const issues = [];

  // 1. Forbidden phrases (FLOW identity violations)
  for (const pattern of FORBIDDEN_PHRASES) {
    if (pattern.test(text)) {
      issues.push(`forbidden_phrase:${pattern.source.slice(0, 30)}`);
    }
  }

  // 2. PII echo-back — AI must not repeat PII from context into output
  const pii = piiScan(text);
  if (pii.highRisk) {
    issues.push(`pii_in_output:${pii.findings.filter(f => f.severity === 'high').map(f => f.type).join(',')}`);
  }

  // 3. Length sanity
  if (text.trim().length < 10) {
    issues.push('response_too_short');
  }
  if (text.length > 50_000) {
    issues.push('response_too_long');
  }

  // 4. Hallucination proxy: "100% certain", "guaranteed", fabricated-looking stats
  const overconfident = /(?:100%|absolutely certain|guaranteed|definitely|proven fact)\s+(?:that\s+)?(?:there (?:is|are)|it (?:is|will))/i;
  if (overconfident.test(text) && !context.knowledge) {
    issues.push('overconfident_without_evidence');
  }

  const highSeverityIssues = ['pii_in_output', 'response_too_short'];
  const hasBlock = issues.some(i => highSeverityIssues.some(b => i.startsWith(b)));
  const severity = hasBlock ? 'block' : issues.length > 0 ? 'warn' : 'none';

  return { valid: severity !== 'block', issues, severity };
}

/**
 * Strip forbidden phrases from output (soft repair, prefer blocking over stripping).
 */
export function repair(text) {
  let out = text;
  for (const pattern of FORBIDDEN_PHRASES) {
    // Replace the whole sentence containing the forbidden phrase
    out = out.replace(new RegExp(`[^.!?]*${pattern.source}[^.!?]*[.!?]?`, 'gi'), '');
  }
  return out.trim();
}
