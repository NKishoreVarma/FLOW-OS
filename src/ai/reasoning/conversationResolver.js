/**
 * ConversationResolver (Stage 5F) — resolves pronoun / follow-up references against
 * prior turns, deterministically and workspace-scoped (reads ONLY this conversation's
 * history). Never invents context: if a reference cannot be resolved confidently it
 * signals a clarification instead of guessing.
 *
 * This is the reusable home for the logic OperationalBrain has carried inline; the
 * intent model + agent path consume it. It changes no existing behavior.
 */

// Bare follow-up pronouns only. "that/this" are handled by ENTITY_REF_RE (e.g. "that PR");
// left out of the generic set so temporal phrases ("this month", "the last review") do
// not false-trigger a pronoun-clarification. "the first/last/other one" requires "one".
const PRONOUN_RE        = /\b(it|those|them|the (?:first|last|other) one)\b/i;
const PERSON_PRONOUN_RE = /\b(he|him|his|she|her|hers|they|them|their|that person|this person)\b/i;
const ENTITY_REF_RE = {
  pr:       /\b(that|this|the)\s+(pr|pull request)\b/i,
  incident: /\b(that|this|the)\s+incident\b/i,
  issue:    /\b(that|this|the)\s+(ticket|issue)\b/i,
  project:  /\b(that|this|the)\s+project\b/i,
  meeting:  /\b(that|this|the)\s+meeting\b/i,
};
// Pure conversational turns — no data intent (greeting / acknowledgement / continue).
const CONVERSATIONAL_RE = /^\s*(hi|hello|hey|thanks|thank you|thx|ok|okay|cool|great|got it|continue|go on|more|nice|yes|no)\b[\s!.]*$/i;

/** Pull entity IDs + person names from a text, most-recent (last-mentioned) first. */
export function entitiesInText(text = '') {
  const ids   = [...String(text).matchAll(/\b([A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+)\b/g)].map(m => m[1]);
  const names = [...String(text).matchAll(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\b/g)].map(m => m[1]);
  return { ids: ids.reverse(), names: names.reverse() };
}

/**
 * @param {string} question
 * @param {{role:string, content:string}[]} history
 * @returns {{
 *   effectiveQuestion:string, isConversational:boolean, hasPronoun:boolean,
 *   resolved:boolean, needsClarification:boolean, carried:?{kind:string,value:string}, pronoun:?string
 * }}
 */
export function resolveConversation(question, history = []) {
  const base = {
    effectiveQuestion: question, isConversational: false, hasPronoun: false,
    resolved: false, needsClarification: false, carried: null, pronoun: null,
  };

  if (CONVERSATIONAL_RE.test(question)) return { ...base, isConversational: true };

  const entityRefHit = Object.entries(ENTITY_REF_RE).find(([, re]) => re.test(question));
  const personHit    = PERSON_PRONOUN_RE.test(question);
  const genericHit   = PRONOUN_RE.test(question);
  const hasPronoun   = !!entityRefHit || personHit || genericHit;
  if (!hasPronoun) return base;

  if (!Array.isArray(history) || history.length === 0) {
    // A pronoun with no prior context → cannot resolve → clarify (never invent).
    return { ...base, hasPronoun: true, needsClarification: true, pronoun: _firstPronoun(question) };
  }

  const lastAssistant = [...history].reverse().find(m => m.role === 'assistant');
  const lastUser      = [...history].reverse().find(m => m.role === 'user');
  const priorText     = `${lastAssistant?.content || ''}\n${lastUser?.content || ''}`;

  // "that PR / that incident / that ticket / that project / that meeting" → last matching ID.
  if (entityRefHit) {
    const [kind, re] = entityRefHit;
    const { ids } = entitiesInText(priorText);
    const prefix = { pr: /^PR-/i, incident: /^(INCIDENT|INC)-/i, issue: /(HELIOS|ISSUE|HPLT|HANA|HCON|HGRD)-/i, project: /^PROJECT-/i, meeting: /^CAL-EVENT-/i }[kind];
    const hit = ids.find(id => prefix.test(id));
    if (hit) return { ...base, hasPronoun: true, resolved: true, carried: { kind, value: hit }, effectiveQuestion: question.replace(re, hit) };
    return { ...base, hasPronoun: true, needsClarification: true, pronoun: kind };
  }

  // Person pronoun (he/she/they/that person) → the last-named person in the last answer.
  if (personHit && lastAssistant?.content) {
    const { names } = entitiesInText(lastAssistant.content);
    if (names.length) {
      return { ...base, hasPronoun: true, resolved: true, carried: { kind: 'person', value: names[0] },
        effectiveQuestion: question.replace(PERSON_PRONOUN_RE, names[0]) };
    }
  }

  // Generic pronoun with a resolvable last entity (id or name).
  if (genericHit || personHit) {
    const { ids, names } = entitiesInText(priorText);
    const carriedVal = ids[0] || names[0] || null;
    if (carriedVal) {
      return { ...base, hasPronoun: true, resolved: true, carried: { kind: ids[0] ? 'id' : 'person', value: carriedVal },
        effectiveQuestion: `${question} (referring to: ${carriedVal})` };
    }
    return { ...base, hasPronoun: true, needsClarification: true, pronoun: _firstPronoun(question) };
  }

  return { ...base, hasPronoun: true };
}

function _firstPronoun(q) {
  const m = String(q).match(PERSON_PRONOUN_RE) || String(q).match(PRONOUN_RE);
  return m ? m[0] : 'it';
}

export default { resolveConversation, entitiesInText };
