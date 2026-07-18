/**
 * MissingEvidenceDetector — enforces intellectual honesty. Rather than
 * hallucinating, it detects when evidence is insufficient and explains exactly
 * what is missing (empty capabilities, stale sources, thin coverage, reasoning
 * gaps, expected-but-absent source types for the domain).
 */

import { summarizeFreshness } from './EvidenceFormatter.js';

// Source types you'd expect to see for a well-grounded answer in each domain.
const EXPECTED_SOURCES = {
  incidents:   ['SLACK', 'JIRA', 'TIMELINE'],
  engineering: ['GITHUB', 'JIRA'],
  meetings:    ['MEETING', 'DOCUMENT'],
  customers:   ['CRM', 'EMAIL'],
  knowledge:   ['DOCUMENT', 'MEMORY'],
  people:      ['GRAPH', 'MEETING'],
};

const INSUFFICIENT_STATEMENT = "There isn't enough evidence to answer this confidently.";

export function detectMissingEvidence({ formatted = [], capabilities = {}, reasoning = {}, domain, sourceAttribution } = {}) {
  const missing = [];

  // 1. Planned capabilities that returned nothing.
  const planned = capabilities.planned || [];
  const queried = capabilities.queried || [];
  const emptyCaps = planned.filter(c => !queried.includes(c));
  for (const c of emptyCaps) missing.push({ kind: 'empty_capability', detail: `No data returned from "${c}".` });

  // 2. Thin coverage.
  if (formatted.length < 3) missing.push({ kind: 'thin_coverage', detail: `Only ${formatted.length} piece(s) of evidence found (3+ preferred).` });

  // 3. Staleness.
  const fresh = summarizeFreshness(formatted);
  if (fresh.known && fresh.avgDays > 45) missing.push({ kind: 'stale', detail: `Evidence averages ${fresh.avgDays} days old — may not reflect current state.` });

  // 4. Expected source types absent.
  const present = new Set((sourceAttribution?.byType || []).map(t => t.sourceType));
  for (const exp of (EXPECTED_SOURCES[domain] || [])) {
    if (!present.has(exp)) missing.push({ kind: 'absent_source', detail: `No ${exp} evidence, which is usually relevant for ${domain}.` });
  }

  // 5. Reasoning gaps carried from the pipeline.
  for (const g of (reasoning.gaps || []).slice(0, 5)) missing.push({ kind: 'reasoning_gap', detail: typeof g === 'string' ? g : (g.detail || JSON.stringify(g)) });

  const critical = formatted.length < 2 || emptyCaps.length >= (planned.length || 1);
  const sufficient = !critical && formatted.length >= 3;

  return {
    sufficient,
    confidenceStatement: sufficient ? null : INSUFFICIENT_STATEMENT,
    missing,
    missingCount: missing.length,
  };
}
