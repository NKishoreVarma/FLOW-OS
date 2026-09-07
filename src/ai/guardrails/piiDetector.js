/**
 * PII Detector — identifies personally identifiable information in text.
 * Uses regex patterns. Never sends text to an LLM for classification.
 * Returns findings without logging the matched values.
 */

const PATTERNS = [
  { type: 'email',       regex: /\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b/g },
  { type: 'phone',       regex: /(\+?1[\s\-.]?)?\(?\d{3}\)?[\s\-.]?\d{3}[\s\-.]?\d{4}\b/g },
  { type: 'ssn',         regex: /\b\d{3}[-\s]?\d{2}[-\s]?\d{4}\b/g },
  { type: 'credit_card', regex: /\b(?:\d[ \-]?){13,16}\b/g },
  { type: 'ip_address',  regex: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g },
  { type: 'passport',    regex: /\b[A-Z]{1,2}\d{6,9}\b/g },
  { type: 'dob',         regex: /\b(?:0?[1-9]|1[0-2])[\/\-](?:0?[1-9]|[12]\d|3[01])[\/\-](?:19|20)\d{2}\b/g },
  // Workplace PII
  { type: 'salary',      regex: /\$\s*\d{2,3},\d{3}(?:\.\d{2})?\s*(?:\/yr|per year|annual|salary)?/gi },
  { type: 'national_id', regex: /\b(?:national id|national insurance|nino|nin)[:\s]+[A-Z]{2}\s?\d{6}\s?[A-Z]\b/gi },
];

// High-severity: block. Medium: warn. Low: flag.
const SEVERITY = {
  ssn:         'high',
  credit_card: 'high',
  passport:    'high',
  national_id: 'high',
  email:       'medium',
  phone:       'medium',
  salary:      'medium',
  dob:         'medium',
  ip_address:  'low',
};

/**
 * Scan text for PII.
 * @returns {{ clean: boolean, findings: Array<{type, severity, count}>, highRisk: boolean }}
 */
export function scan(text) {
  if (!text || typeof text !== 'string') return { clean: true, findings: [], highRisk: false };

  const findings = [];
  for (const { type, regex } of PATTERNS) {
    const matches = text.match(new RegExp(regex.source, regex.flags)) ?? [];
    if (matches.length > 0) {
      findings.push({ type, severity: SEVERITY[type] ?? 'low', count: matches.length });
    }
  }

  const highRisk = findings.some(f => f.severity === 'high');
  return { clean: findings.length === 0, findings, highRisk };
}

/**
 * Redact PII from text, replacing with type placeholders.
 * Use only for logging — never store redacted text as a substitute for the original.
 */
export function redact(text) {
  if (!text) return text;
  let out = text;
  for (const { type, regex } of PATTERNS) {
    out = out.replace(new RegExp(regex.source, regex.flags), `[${type.toUpperCase()}_REDACTED]`);
  }
  return out;
}
