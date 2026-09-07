/**
 * evidenceVerifier.js — Phase 5 ID-based verification layer.
 *
 * Operates over an EvidencePacket (built by evidencePacket.js) to deterministically
 * verify that:
 *   - every cited evidence ID ([eN]) exists in the packet
 *   - no "current/latest" claim cites a STALE evidence item
 *   - no absence assertion covers a source that was never queried
 *   - every factual attribution claim cites at least one evidence ID
 *   - no universal negation is made under PARTIAL/NONE coverage
 *
 * This is the first deterministic grounding layer. It does NOT replace the existing
 * ClaimVerifier (invented-person check) or AnswerVerifier (directional relationship
 * check) — it runs alongside them.
 *
 * Humanization removes [eN] markers from the final answer while preserving an internal
 * provenance map (sentence → evidenceIds[]).
 */

import { QueryOutcome, Freshness } from '../../contracts/evidence.js';

// ── Marker extraction ─────────────────────────────────────────────────────────

/**
 * Extract all distinct evidence markers from text.
 * Returns normalized IDs: ["e1", "e2", …] (lowercase, unique, sorted).
 */
export function extractEvidenceMarkers(text) {
  const found = new Set();
  for (const m of String(text || '').matchAll(/\[e(\d+)\]/gi)) {
    found.add(`e${m[1]}`);
  }
  return [...found].sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));
}

// ── Phantom ID detection ──────────────────────────────────────────────────────

/**
 * Verify that every cited [eN] exists in packet.items.
 *
 * @returns {{ valid: string[], phantom: string[], status: 'PASS'|'PHANTOM_IDS' }}
 */
export function verifyEvidenceIds(answer, packet) {
  const cited   = extractEvidenceMarkers(answer);
  const known   = new Set((packet?.items || []).map(i => i.id));
  const valid   = cited.filter(id => known.has(id));
  const phantom = cited.filter(id => !known.has(id));
  return {
    valid,
    phantom,
    status: phantom.length > 0 ? 'PHANTOM_IDS' : 'PASS',
  };
}

// ── Freshness assertion check ─────────────────────────────────────────────────

// Phrases that assert currency — incompatible with a STALE data source.
const _CURRENT_RE = /\b((?:is|are|was)\s+current(?:ly)?|up[\s-]to[\s-]date|(?:the\s+)?latest(?:\s+data)?|(?:just\s+)?now|as\s+of\s+today|fresh(?:ly)?|real[\s-]?time)\b/i;

/**
 * Verify that answers citing STALE items don't assert the data is current.
 *
 * @returns {{ status: 'PASS'|'STALE_ASSERTION', violations: string[] }}
 */
export function verifyClaimFreshness(answer, packet) {
  const staleIds = new Set(
    (packet?.items || [])
      .filter(i => i.freshness === Freshness.STALE)
      .map(i => i.id),
  );
  if (!staleIds.size) return { status: 'PASS', violations: [] };

  const cited      = extractEvidenceMarkers(answer);
  const citedStale = cited.filter(id => staleIds.has(id));
  if (!citedStale.length) return { status: 'PASS', violations: [] };

  if (_CURRENT_RE.test(answer)) {
    return { status: 'STALE_ASSERTION', violations: citedStale };
  }
  return { status: 'PASS', violations: [] };
}

// ── Negative scope validation ─────────────────────────────────────────────────

// Phrases that assert ABSENCE of data from a specific source.
const _ABSENCE_RE = /\b(no\s+(?:matching\s+)?(?:messages?|records?|events?|results?|data|emails?|updates?)|nothing\s+(?:found|available|in|there)|none\s+(?:found|available|in|returned))\b/i;

// Map connector/source names to the words that appear in user-visible answers.
const _SOURCE_ALIASES = {
  gmail:             ['gmail', 'email', 'inbox', 'emails', 'message'],
  slack:             ['slack', 'channel', 'channels'],
  github:            ['github', 'repo', 'repository', 'pull request', 'commit'],
  'google-calendar': ['calendar', 'meeting', 'event', 'schedule'],
  notion:            ['notion', 'page', 'pages'],
  jira:              ['jira', 'ticket', 'issue', 'sprint'],
  hubspot:           ['hubspot', 'crm', 'deal'],
  pagerduty:         ['pagerduty', 'incident', 'alert'],
  confluence:        ['confluence'],
  calendar:          ['calendar', 'meeting', 'event'],
  documents:         ['document', 'docs', 'knowledge'],
};

/**
 * Verify that absence assertions don't cover sources that were SKIPPED
 * (SKIPPED_NOT_CONNECTED or SKIPPED_BY_PLAN — both mean "never queried").
 *
 * @returns {{ status: 'PASS'|'OVERBROAD_SCOPE', violations: string[] }}
 */
export function verifyNegativeScope(answer, packet) {
  const skipped = (packet?.queries || []).filter(q =>
    q.outcome === QueryOutcome.SKIPPED_NOT_CONNECTED ||
    q.outcome === QueryOutcome.SKIPPED_BY_PLAN,
  );
  if (!skipped.length) return { status: 'PASS', violations: [] };
  if (!_ABSENCE_RE.test(answer))  return { status: 'PASS', violations: [] };

  const ans        = answer.toLowerCase();
  const violations = [];
  for (const q of skipped) {
    const aliases = _SOURCE_ALIASES[q.source] || [q.source.toLowerCase()];
    for (const alias of aliases) {
      if (ans.includes(alias)) {
        violations.push(`${q.source}:${q.outcome}`);
        break;
      }
    }
  }
  return violations.length > 0
    ? { status: 'OVERBROAD_SCOPE', violations }
    : { status: 'PASS', violations: [] };
}

// ── Universal negation under partial coverage ─────────────────────────────────

const _UNIVERSAL_NEG_RE = /\b(nothing\s+(?:exists?|(?:is|was)\s+found|anywhere)|no\s+(?:data|records?|information)\s+(?:exists?|(?:is|was)\s+(?:found|available)))\b/i;

/**
 * Reject universal negations ("nothing exists anywhere") when coverage is PARTIAL or NONE.
 *
 * @returns {{ status: 'PASS'|'OVERBROAD_NEGATION', violations: string[] }}
 */
export function verifyOverbreadNegation(answer, packet) {
  if (!_UNIVERSAL_NEG_RE.test(answer)) return { status: 'PASS', violations: [] };
  const cov = packet?.coverage;
  if (cov !== 'COMPLETE') {
    return { status: 'OVERBROAD_NEGATION', violations: [`coverage:${cov}`] };
  }
  return { status: 'PASS', violations: [] };
}

// ── Uncited factual attribution claims ────────────────────────────────────────

// Sentences that assert attribution (person ↔ entity) are factual claims that
// MUST cite evidence. Pattern covers:
//   "Jordan authored PR-247"
//   "PR-247 was authored by Jordan"
//   "Alice is assigned to INCIDENT-003"
const _ATTRIBUTION_RE = /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?\b[^.!?]{0,100}\b(?:PR|INCIDENT|COMMIT|ISSUE|EPIC|HPLT|HANA|HELIOS)-\d+\b|\b(?:PR|INCIDENT|COMMIT|ISSUE|EPIC|HPLT|HANA|HELIOS)-\d+\b[^.!?]{0,100}\b(?:authored?|wrote|created|assigned|owns?|handled)\b/i;

function _isFactualAttribution(sentence) {
  return _ATTRIBUTION_RE.test(sentence);
}

/**
 * Identify factual attribution claims that cite no evidence ID.
 * Only fires when the packet has at least one item (otherwise there are no valid IDs
 * to require, and zero evidence is legitimately handled by coverage).
 *
 * @returns {{ status: 'PASS'|'UNCITED_CLAIM', violations: string[] }}
 */
export function verifyUncitedClaims(answer, packet) {
  if (!packet?.items?.length) return { status: 'PASS', violations: [] };

  const violations = [];
  const sentences  = String(answer || '').split(/(?<=[.!?])\s+/);
  for (const sentence of sentences) {
    if (!_isFactualAttribution(sentence)) continue;
    const markers = extractEvidenceMarkers(sentence);
    if (!markers.length) violations.push(sentence.trim().slice(0, 100));
  }
  return violations.length > 0
    ? { status: 'UNCITED_CLAIM', violations }
    : { status: 'PASS', violations: [] };
}

// ── Humanization ──────────────────────────────────────────────────────────────

/**
 * Strip [eN] markers from the answer and build a provenance map.
 * Provenance: Map<sentenceText → evidenceId[]>
 *
 * The internal map allows FLOW to trace which evidence supported which sentence
 * without exposing markers to the user.
 */
export function humanize(answer, packet) {
  const known    = new Set((packet?.items || []).map(i => i.id));
  const text     = String(answer || '');
  const provenance = new Map();

  // Split on sentence boundaries (after .!?) then collect markers per sentence.
  const sentences = text.split(/(?<=[.!?])\s+/);
  for (const sentence of sentences) {
    const markers = extractEvidenceMarkers(sentence).filter(id => known.has(id));
    if (markers.length) {
      const clean = sentence.replace(/\s*\[e\d+\]/gi, '').trim();
      if (clean) provenance.set(clean, markers);
    }
  }

  // Strip all markers (including any outside sentence boundaries).
  const stripped = text.replace(/\s*\[e\d+\]/gi, '').replace(/\s{2,}/g, ' ').trim();
  return { text: stripped, provenance };
}

/**
 * Post-humanization safety check: no [eN] markers should survive stripping.
 *
 * @returns {{ status: 'PASS'|'MARKERS_SURVIVED', violations: string[] }}
 */
export function verifyAfterHumanize(text, packet) {
  const remaining = extractEvidenceMarkers(text);
  if (remaining.length > 0) {
    return { status: 'MARKERS_SURVIVED', violations: remaining };
  }
  return { status: 'PASS', violations: [] };
}

// ── Composite gate ────────────────────────────────────────────────────────────

/**
 * Run all Phase 5 ID verifications in order, repair where possible, then humanize.
 *
 * Does NOT replace ClaimVerifier (INVENTED_PERSON) or AnswerVerifier (directional).
 * Returns { answer, provenance, violations } where answer is the humanized final text.
 *
 * @param {string}         rawAnswer   LLM output (may contain [eN] markers)
 * @param {object}         packet      EvidencePacket from buildEvidencePacket
 * @param {function}       [log]       optional trace function (traceId, check, detail)
 * @returns {{ answer: string, provenance: Map, violations: object[] }}
 */
export function runPhase5Verification(rawAnswer, packet, log = null) {
  const violations = [];
  let answer = String(rawAnswer || '');

  // 1. Phantom ID check — strip phantom markers from the draft.
  const idCheck = verifyEvidenceIds(answer, packet);
  if (idCheck.phantom.length > 0) {
    // Strip phantom markers so humanization doesn't surface them to the user.
    for (const phantom of idCheck.phantom) {
      answer = answer.replace(new RegExp(`\\[${phantom}\\]`, 'gi'), '');
    }
    violations.push({ check: 'PHANTOM_IDS', detail: idCheck.phantom });
    log?.('PHANTOM_IDS', idCheck.phantom);
  }

  // 2. Freshness check — log but don't mutate (the LLM prompt already forbids it;
  //    this is a safety net for tracing, not a correction path).
  const freshnessCheck = verifyClaimFreshness(answer, packet);
  if (freshnessCheck.status !== 'PASS') {
    violations.push({ check: 'STALE_ASSERTION', detail: freshnessCheck.violations });
    log?.('STALE_ASSERTION', freshnessCheck.violations);
  }

  // 3. Negative scope check — log only (same reasoning as freshness).
  const scopeCheck = verifyNegativeScope(answer, packet);
  if (scopeCheck.status !== 'PASS') {
    violations.push({ check: 'OVERBROAD_SCOPE', detail: scopeCheck.violations });
    log?.('OVERBROAD_SCOPE', scopeCheck.violations);
  }

  // 4. Universal negation under partial coverage — log only.
  const negCheck = verifyOverbreadNegation(answer, packet);
  if (negCheck.status !== 'PASS') {
    violations.push({ check: 'OVERBROAD_NEGATION', detail: negCheck.violations });
    log?.('OVERBROAD_NEGATION', negCheck.violations);
  }

  // 5. Humanize — strip markers, build provenance.
  const { text: humanized, provenance } = humanize(answer, packet);

  // 6. Post-humanize safety: no markers should survive.
  const afterCheck = verifyAfterHumanize(humanized, packet);
  if (afterCheck.status !== 'PASS') {
    violations.push({ check: 'MARKERS_SURVIVED', detail: afterCheck.violations });
    log?.('MARKERS_SURVIVED', afterCheck.violations);
  }

  return { answer: humanized, provenance, violations };
}
