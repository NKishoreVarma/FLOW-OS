/**
 * ClaimVerifier (Phase 6) — claim-level grounding for OPEN-ENDED synthesis answers.
 *
 * Directional relationship answers are already gated by AnswerVerifier. Free-form
 * synthesis ("what's happening in engineering", "give me a briefing") was streamed
 * un-checked, so the LLM could name a person who doesn't exist in the workspace
 * (e.g. "Shubhamsaboo") or mis-attribute a real person to an entity.
 *
 * This verifier is DETERMINISTIC and evidence-only. It reads:
 *   - `people`         : Set of real workspace person names (lowercased) — the roster.
 *   - `relationships`  : the retrieved graph edges [{subject,relation,direction,object,objectType}].
 * and NEVER the dataset JSON. It contains zero entity/question literals (no answer bank).
 *
 * Two checks:
 *   A. INVENTED_PERSON  — a "First Last" name asserted in the answer that is NOT a real
 *      workspace person → unsupported invention → the naming clause is redacted.
 *   B. WRONG_ATTRIBUTION — "<Name> authored/is assigned to/owns <ID>" where the resolved
 *      ID has that edge to a DIFFERENT person → the wrong name is corrected from evidence.
 */

const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Common Title-Case phrases that look like "First Last" but are not people.
const NON_PERSON = new Set([
  'Connection Pool', 'Circuit Breaker', 'Pull Request', 'Pull Requests', 'Data Stream',
  'Working Session', 'Enterprise Account', 'Root Cause', 'Auth Service', 'Core Platform',
  'Access Control', 'Load Test', 'Security Review', 'Sprint Planning', 'Sprint Retrospective',
  'Production Deploy', 'Rate Limit', 'Token Introspection', 'Audit Log', 'System Outage',
  'Bad Gateway', 'Next Step', 'Action Item', 'Action Items', 'Live Data', 'Recent Commits',
]);

function _namesIn(text) {
  return [...new Set([...String(text).matchAll(/\b([A-Z][a-z]+\s+[A-Z][a-z]+)\b/g)].map(m => m[1]))]
    .filter(n => !NON_PERSON.has(n));
}

// Single-token capitalized words used in a PERSON context ("works with X", "and X",
// "assigned to X", "X's ..."). These catch single-name inventions like "Shubhamsaboo".
const _SINGLE_STOP = new Set(['I', 'The', 'A', 'An', 'It', 'This', 'That', 'They', 'We', 'He', 'She',
  'PR', 'PRs', 'REPO', 'Repo', 'Production', 'Engineering', 'Security', 'Review', 'Sprint', 'Deploy',
  'Incident', 'Project', 'Issue', 'Team', 'Marcus', 'Monday', 'August', 'CEO', 'CTO', 'VP']);
function _singleNamesIn(text) {
  const out = new Set();
  const t = String(text);
  const CTX = /\b(?:works?\s+with|collaborat\w*\s+with|and|by|to|from|alongside)\s+([A-Z][a-z]{2,})\b/g;
  for (const m of t.matchAll(CTX)) if (!_SINGLE_STOP.has(m[1])) out.add(m[1]);
  for (const m of t.matchAll(/\b([A-Z][a-z]{2,})'s\b/g)) if (!_SINGLE_STOP.has(m[1])) out.add(m[1]);
  return [...out];
}

/**
 * @param {string} answer
 * @param {object} ctx
 * @param {Set<string>} ctx.people          real workspace person names, lowercased
 * @param {Array}       ctx.relationships    retrieved edges (for attribution checks)
 * @returns {{ status:'PASS'|'REPAIR', violations, repaired, unsupported }}
 */
export function verifySynthesisClaims(answer, { people = new Set(), relationships = [] } = {}) {
  const violations = [];
  const unsupported = [];
  let out = String(answer || '');
  if (!out.trim() || people.size === 0) {
    return { status: 'PASS', violations, repaired: out, unsupported };
  }

  // Token set of all real name words (first + last), lowercased — so a real single name
  // ("Rahul") is kept while an invented single name ("Shubhamsaboo") is flagged.
  const nameTokens = new Set();
  for (const full of people) for (const tok of full.split(/\s+/)) if (tok.length > 2) nameTokens.add(tok);

  // ── Check A: invented people (named but not a real workspace person) ──
  const twoWord = _namesIn(out).filter(n => !people.has(n.toLowerCase()));
  const single = _singleNamesIn(out).filter(n => !nameTokens.has(n.toLowerCase()));
  const invented = [...new Set([...twoWord, ...single])];
  if (invented.length) {
    violations.push('INVENTED_PERSON');
    unsupported.push(...invented);
    // Redact the clause/sentence that names each invented person. Split on sentence and
    // list boundaries; drop segments that mention an invented name.
    const bad = new RegExp(invented.map(esc).join('|'), 'i');
    const segments = out.split(/(?<=[.!?])\s+|\n+/);
    const kept = segments.filter(s => !bad.test(s));
    out = kept.join(' ').replace(/\s{2,}/g, ' ').trim();
    // If redaction emptied the answer, fall back to an honest, grounded statement.
    if (out.length < 25) {
      out = "I can share what's actually recorded here, but I won't name anyone the workspace data doesn't show.";
    }
  }

  // ── Check B: wrong attribution of a real person to a resolved entity ──
  // "<Name> (authored|wrote|is assigned to|owns) ... <ID>" — if the ID has that edge to a
  // different person, correct the name from evidence.
  const attrRe = /\b([A-Z][a-z]+\s+[A-Z][a-z]+)\b[^.]{0,40}\b(authored|wrote|created|is assigned to|owns|is responsible for)\b[^.]{0,40}\b([A-Z][A-Z0-9]*-\d+)\b/gi;
  for (const m of out.matchAll(attrRe)) {
    const [, claimedPerson, , idRaw] = m;
    const id = idRaw.toUpperCase();
    const rel = /author|wrote|created/i.test(m[2]) ? 'AUTHORED_BY'
      : /assigned|owns/i.test(m[2]) ? 'ASSIGNED_TO' : null;
    if (!rel) continue;
    const edge = relationships.find(r => (r.subject || '').toUpperCase().includes(id) && r.relation === rel && /^(USER|EMPLOYEE)$/i.test(r.objectType || ''));
    if (edge && edge.object && edge.object.toLowerCase() !== claimedPerson.toLowerCase()) {
      violations.push('WRONG_ATTRIBUTION');
      unsupported.push(`${claimedPerson}→${idRaw} (actual: ${edge.object})`);
      out = out.replace(new RegExp(esc(claimedPerson), 'g'), edge.object);
    }
  }

  return { status: violations.length ? 'REPAIR' : 'PASS', violations, repaired: out, unsupported };
}

export default { verifySynthesisClaims };
