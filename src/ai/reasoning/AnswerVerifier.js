/**
 * AnswerVerifier (Phase 4) — the post-synthesis verification gate.
 *
 * The graph/retrieval layer is the source of truth; the LLM only expresses it. This
 * verifier compares the LLM's prose against the DETERMINISTIC relationships FLOW already
 * retrieved (entityGraph.relationships) and rejects/repairs answers that contradict them.
 *
 * It NEVER reads the dataset JSON — it verifies against the evidence already in hand.
 * It NEVER hardcodes question→answer; the "expected" answer is computed from the graph
 * edges + the directional intent, then expressed in natural language on REPAIR.
 *
 * Output: { status:'PASS'|'REPAIR'|'REJECT', violations, verifiedRelationships,
 *           expected:{ target, entities }, reason, repairText? }
 */

// direction is relative to the TARGET: OUT = target --rel--> object ; IN = object --rel--> target.
const PATTERNS = {
  WHO_IS_MANAGER:  [{ rel: 'REPORTS_TO', dir: 'OUT' }, { rel: 'MANAGES', dir: 'IN' }],
  WHO_REPORTS_TO:  [{ rel: 'MANAGES', dir: 'OUT' }, { rel: 'REPORTS_TO', dir: 'IN' }],
  WHO_MANAGES:     [{ rel: 'MANAGES', dir: 'OUT' }, { rel: 'REPORTS_TO', dir: 'IN' }],
  WHO_AUTHORED:    [{ rel: 'AUTHORED_BY', dir: 'OUT' }],
  WHO_IS_ASSIGNED: [{ rel: 'ASSIGNED_TO', dir: 'OUT' }],
  WHO_IS_INVOLVED: [{ rel: 'ASSIGNED_TO', dir: 'OUT' }, { rel: 'COMMANDER', dir: 'OUT' }],
};

const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const has = (text, name) => new RegExp(`\\b${esc(name)}`, 'i').test(text);

// Expected answer entities for the intent, computed from the retrieved relationships.
function _expected(relIntent, target, relationships) {
  const pats = PATTERNS[relIntent] || [];
  const out = [];
  for (const p of pats) {
    for (const r of relationships) {
      if (r.subject === target && r.relation === p.rel && r.direction === p.dir) out.push(r.object);
    }
  }
  return [...new Set(out)];
}

// Natural, evidence-expressed sentence (REPAIR). Parameterized by the resolved entities —
// this is expression of a retrieved fact, not a stored answer.
function _repairText(relIntent, target, entities) {
  const list = entities.join(' and ');
  switch (relIntent) {
    case 'WHO_IS_MANAGER':  return entities.length ? `${list} is ${target}'s manager.` : null;
    case 'WHO_REPORTS_TO':  return entities.length ? `${list} report${entities.length === 1 ? 's' : ''} to ${target}.` : null;
    case 'WHO_MANAGES':     return entities.length ? `${target} is managed by ${list}.` : null;
    case 'WHO_AUTHORED':    return entities.length ? `${target} was authored by ${list}.` : null;
    case 'WHO_IS_ASSIGNED': return entities.length ? `${list} ${entities.length === 1 ? 'is' : 'are'} assigned to ${target}.` : null;
    case 'WHO_IS_INVOLVED': return entities.length ? `${target} is handled by ${list}.` : null;
    default:                return null;
  }
}

// Inversion patterns: does the prose assert the relationship BACKWARDS?
function _inversionViolation(relIntent, target, entities, answer) {
  const T = esc(target);
  for (const e of entities) {
    const E = esc(e);
    if (relIntent === 'WHO_IS_MANAGER') {
      // correct: E is T's manager / T reports to E. inverted: T is E's manager / E reports to T.
      if (new RegExp(`${T}\\b[^.]{0,60}\\b(manages|is\\s+the\\s+manager\\s+of|is\\s+${E}'s\\s+manager)\\b`, 'i').test(answer)) return 'DIRECTION_INVERSION';
      if (new RegExp(`${T}'s\\s+manager\\s+is[^.]{0,40}${T}`, 'i').test(answer)) return 'DIRECTION_INVERSION';
      if (new RegExp(`${E}\\b[^.]{0,40}\\breports?\\s+to\\b[^.]{0,40}${T}`, 'i').test(answer)) return 'DIRECTION_INVERSION';
    }
    if (relIntent === 'WHO_REPORTS_TO' || relIntent === 'WHO_MANAGES') {
      // correct: E reports to T. inverted: T reports to E.
      if (new RegExp(`${T}\\b[^.]{0,40}\\breports?\\s+to\\b[^.]{0,40}${E}`, 'i').test(answer)) return 'DIRECTION_INVERSION';
    }
  }
  return null;
}

/**
 * @param {object} p
 * @param {string} p.relIntent           directional intent (or null → not verified here)
 * @param {string[]} p.targets           resolved target entity names (subjects)
 * @param {Array}  p.relationships       entityGraph.relationships [{subject,relation,direction,object}]
 * @param {boolean} p.hasNoRecord        the directional relationship had NO recorded edge
 * @param {string} p.answer              the LLM's generated prose
 * @returns verification result
 */
export function verifyAnswer({ relIntent, targets = [], relationships = [], hasNoRecord = false, answer = '' }) {
  const violations = [];
  const verifiedRelationships = [];

  // WHO_CONNECTED: the answer may name ONLY actual person-neighbors of the target.
  if (relIntent === 'WHO_CONNECTED') {
    const target = targets[0] || relationships[0]?.subject || null;
    const neighborPeople = new Set(relationships
      .filter(r => r.subject === target && /^(USER|EMPLOYEE)$/i.test(r.objectType || ''))
      .map(r => r.object));
    const named = [...answer.matchAll(/\b[A-Z][a-z]+\s+[A-Z][a-z]+\b/g)].map(m => m[0])
      .filter(n => n !== target && !/^(No |Want |Let |If |For )/.test(n));
    const invented = named.filter(n => ![...neighborPeople].some(p => p.toLowerCase() === n.toLowerCase()));
    if (invented.length) {
      violations.push('UNSUPPORTED_CLAIM');
      const repairText = neighborPeople.size
        ? `The people directly connected to ${target} are ${[...neighborPeople].join(', ')}.`
        : `I don't see any people directly connected to ${target} in this workspace's data.`;
      return { status: 'REPAIR', violations, verifiedRelationships, expected: { target, entities: [...neighborPeople] },
        reason: `answer named non-neighbors: ${invented.join(', ')}`, repairText };
    }
    return { status: 'PASS', violations, verifiedRelationships, expected: { target, entities: [...neighborPeople] }, reason: 'connected-people verified' };
  }

  // Only directional relationship intents are gated deterministically here.
  if (!relIntent || !PATTERNS[relIntent]) {
    return { status: 'PASS', violations, verifiedRelationships, expected: null, reason: 'no directional contract to verify' };
  }

  const target = targets[0] || (relationships[0]?.subject) || null;
  const expected = target ? _expected(relIntent, target, relationships) : [];

  // Case A: evidence records NO such relationship, but the answer named a person → unsupported.
  if (hasNoRecord || expected.length === 0) {
    const namedPeople = [...answer.matchAll(/\b[A-Z][a-z]+\s+[A-Z][a-z]+\b/g)].map(m => m[0])
      .filter(n => n !== target && !/^(No |Want |Let |If )/.test(n));
    const admitsUnknown = /don'?t have|couldn'?t find|no (manager|assignee|record|one|author)|not recorded|no recorded/i.test(answer);
    if (namedPeople.length && !admitsUnknown) {
      violations.push('UNSUPPORTED_CLAIM');
      return { status: 'REPAIR', violations, verifiedRelationships, expected: { target, entities: [] },
        reason: `answer named ${namedPeople.join(', ')} but no ${relIntent} relationship is recorded for ${target}`,
        repairText: `I don't have a recorded ${_nounFor(relIntent)} for ${target} in this workspace's data.` };
    }
    return { status: 'PASS', violations, verifiedRelationships, expected: { target, entities: [] }, reason: 'honest no-record answer' };
  }

  // Case B: evidence supports an answer — check presence + inversion.
  verifiedRelationships.push({ relIntent, target, entities: expected });
  const inv = _inversionViolation(relIntent, target, expected, answer);
  const present = expected.filter(e => has(answer, e));

  if (inv) {
    violations.push(inv);
    return { status: 'REPAIR', violations, verifiedRelationships, expected: { target, entities: expected },
      reason: `${inv}: evidence says ${_repairText(relIntent, target, expected)}`,
      repairText: _repairText(relIntent, target, expected) };
  }
  if (present.length === 0) {
    // The correct entity isn't even named → the answer is off. Repair from evidence.
    violations.push('WRONG_SOURCE');
    return { status: 'REPAIR', violations, verifiedRelationships, expected: { target, entities: expected },
      reason: `answer does not cite the verified ${_nounFor(relIntent)} (${expected.join(', ')})`,
      repairText: _repairText(relIntent, target, expected) };
  }
  // Answer cites the correct entity in the correct direction.
  return { status: 'PASS', violations, verifiedRelationships, expected: { target, entities: expected },
    reason: `verified ${expected.join(', ')} via ${relIntent}` };
}

function _nounFor(relIntent) {
  return { WHO_IS_MANAGER: 'manager', WHO_REPORTS_TO: 'direct reports', WHO_MANAGES: 'manager',
    WHO_AUTHORED: 'author', WHO_IS_ASSIGNED: 'assignee', WHO_IS_INVOLVED: 'responsible owner' }[relIntent] || 'relationship';
}

export default { verifyAnswer };
