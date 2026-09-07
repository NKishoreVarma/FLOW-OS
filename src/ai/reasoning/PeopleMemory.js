/**
 * PeopleMemory (Phase 7) — the People & Organization confirmation layer for the brain.
 *
 * Handles first-person organizational questions/confirmations about the CURRENT USER:
 *   - "Arjun is my manager" / "I report to Arjun"   → store USER_CONFIRMED (explicit only)
 *   - "yes" / "no" / "not sure" to a pending confirm → store only on an explicit yes
 *   - "who is my manager?" / "is Arjun my manager?"  → answer with priority
 *        USER_CONFIRMED > DATASET_FACT > INFERRED > UNKNOWN, surfacing any conflict.
 *
 * It NEVER writes to memory from an LLM inference — only an explicit user statement/answer.
 * Reuses EntityResolver for canonical ids and is workspace + user scoped throughout.
 */

import { resolveReferences } from './EntityResolver.js';
import { getNeighbors } from '../../services/operationalGraphService.js';
import { prisma } from '../../core/config/prisma.js';
import { createConfirmedFact, getConfirmedFor } from './OrgMemoryFacts.js';

// first-person relationship phrasings → { relationship, dir } where dir tells us who the
// object is relative to "me".
const REL_WORDS = [
  { re: /\bmy\s+manager\b|\bi\s+report\s+to\b|\bmanages\s+me\b/i, rel: 'REPORTS_TO' },
  { re: /\bmy\s+(direct\s+)?reports?\b|\bwho\s+reports?\s+to\s+me\b|\bi\s+manage\b/i, rel: 'MANAGES' },
  { re: /\bmy\s+team\s+lead\b|\bmy\s+lead\b/i, rel: 'TEAM_LEAD' },
  { re: /\bmy\s+team\b|\bon\s+my\s+team\b/i, rel: 'TEAM_MEMBER' },
  { re: /\bi\s+work\s+with\b|\bwho\s+i\s+work\s+with\b/i, rel: 'WORKS_WITH' },
];
const NOUN = { REPORTS_TO: 'manager', MANAGES: 'direct reports', TEAM_LEAD: 'team lead', TEAM_MEMBER: 'team', WORKS_WITH: 'people you work with' };

function _relOf(q) { for (const w of REL_WORDS) if (w.re.test(q)) return w.rel; return null; }

// Detect the intent shape for a first-person people question. Non-first-person → null.
export function detectPeopleIntent(question = '') {
  const q = String(question);
  if (!/\bmy\b|\bme\b|\bi\s/i.test(q) && !/^(yes|yep|yeah|correct|no|nope|not sure|maybe|don'?t know)\b/i.test(q.trim())) return null;
  const rel = _relOf(q);

  // Confirmation answer to a pending question ("yes"/"no"/"not sure").
  if (/^(yes|yep|yeah|correct|right|no|nope|not\s*sure|maybe|don'?t\s*know|unsure)\b/i.test(q.trim())) {
    const yes = /^(yes|yep|yeah|correct|right)\b/i.test(q.trim());
    const no = /^(no|nope)\b/i.test(q.trim());
    return { kind: 'ANSWER', yes, no };
  }
  // Statement: "Arjun is my manager" / "my manager is Arjun" / "I report to Arjun".
  if (rel && /\bis\s+my\b|\bmy\s+\w+\s+is\b|\breport\s+to\b|\bi\s+manage\b/i.test(q) && !/\bwho\b|\?\s*$/.test(q.replace(/[^?]*$/, ''))) {
    if (/\bis\s+my\s+(manager|lead|team\s+lead)\b|\bmy\s+(manager|lead)\s+is\b|\bi\s+report\s+to\b/i.test(q)) {
      return { kind: 'STATEMENT', rel };
    }
  }
  // "Is X my manager?" — a candidate confirmation question from the user.
  const t = q.trim();
  if (rel && /^is\s+/i.test(t) && /[A-Z][a-z]{2,}/.test(t) && /\?\s*$/.test(t)) return { kind: 'ASK_IS', rel };
  // "Who is my manager?" / "Who reports to me?" / "Who is on my team?"
  if (rel && /\bwho\b/i.test(q)) return { kind: 'ASK_WHO', rel };
  return null;
}

// Resolve the current user to their canonical person node (by name) — best effort.
async function _selfNode(workspaceId, userName) {
  if (!userName) return null;
  const r = await resolveReferences(workspaceId, `about ${userName}`).catch(() => ({ resolvedNodes: [] }));
  return r.resolvedNodes.find(n => n.entityType === 'USER') || null;
}

// The candidate the object of a first-person statement/question refers to (a real person).
async function _resolveObject(workspaceId, question) {
  const r = await resolveReferences(workspaceId, question).catch(() => ({ resolvedNodes: [] }));
  return r.resolvedNodes.find(n => n.entityType === 'USER') || null;
}

// Dataset relationship for the self node (graph edge), used for conflict detection.
async function _datasetRel(workspaceId, selfNode, rel) {
  if (!selfNode) return null;
  const neighbors = await getNeighbors(workspaceId, selfNode.rawId || selfNode.nodeId).catch(() => []);
  // REPORTS_TO(self→X) OUT, or MANAGES(X→self) IN both mean "my manager is X".
  if (rel === 'REPORTS_TO') {
    const e = neighbors.find(n => n.relation === 'REPORTS_TO' && n.direction === 'OUT') || neighbors.find(n => n.relation === 'MANAGES' && n.direction === 'IN');
    return e?.node?.name || null;
  }
  if (rel === 'MANAGES') {
    return neighbors.filter(n => n.relation === 'MANAGES' && n.direction === 'OUT').map(n => n.node?.name).filter(Boolean);
  }
  return null;
}

/**
 * Handle a first-person people question/confirmation. Returns { handled, answer } or
 * { handled:false }. Requires workspaceId + userId (from the JWT) — user scoped.
 */
export async function handlePeopleMemory({ workspaceId, userId, userName, question, history = [] }) {
  if (!userId) return { handled: false };
  const intent = detectPeopleIntent(question);
  if (!intent) return { handled: false };
  const self = userName || 'you';

  // ── Confirmation answer (yes/no/not sure) to a pending "Is X your <rel>?" ──
  if (intent.kind === 'ANSWER') {
    const lastAssistant = [...history].reverse().find(m => m.role === 'assistant');
    const pend = lastAssistant && /is\s+(.+?)\s+your\s+(manager|team lead|lead)\b/i.exec(lastAssistant.content || '');
    if (!pend) return { handled: false };            // no pending confirmation → let normal flow handle
    const objName = pend[1].trim();
    const rel = /lead/i.test(pend[2]) ? 'TEAM_LEAD' : 'REPORTS_TO';
    if (intent.no) return { handled: true, answer: `Okay. I won't treat ${objName} as your ${NOUN[rel]}.`, source: null };
    if (!intent.yes) return { handled: true, answer: `No problem. I won't record it as a confirmed relationship.`, source: null };
    const obj = await _resolveObject(workspaceId, `about ${objName}`);
    await createConfirmedFact({ workspaceId, userId, subjectName: self, relationship: rel, objectName: objName, objectId: obj?.nodeId || null });
    return { handled: true, answer: `Got it — I'll remember ${objName} as your ${NOUN[rel]}.`, source: 'USER_CONFIRMED' };
  }

  // ── Explicit statement: "Arjun is my manager" / "I report to Arjun" ──
  if (intent.kind === 'STATEMENT') {
    const obj = await _resolveObject(workspaceId, question);
    if (!obj) return { handled: true, answer: `I couldn't find that person in this workspace, so I won't record an unverified name as your ${NOUN[intent.rel]}.`, source: null };
    await createConfirmedFact({ workspaceId, userId, subjectName: self, relationship: intent.rel, objectName: obj.name, objectId: obj.nodeId });
    return { handled: true, answer: `Got it — I'll remember ${obj.name} as your ${NOUN[intent.rel]}.`, source: 'USER_CONFIRMED' };
  }

  // ── "Is X my manager?" — treat as a candidate confirmation the user is asserting ──
  if (intent.kind === 'ASK_IS') {
    const obj = await _resolveObject(workspaceId, question);
    if (!obj) return { handled: true, answer: `I couldn't find that person in this workspace.`, source: null };
    const confirmed = await getConfirmedFor(workspaceId, userId, self, intent.rel);
    if (confirmed) {
      const same = confirmed.objectName.toLowerCase() === obj.name.toLowerCase();
      return { handled: true, answer: same
        ? `Yes — you confirmed ${obj.name} as your ${NOUN[intent.rel]}.`
        : `Not according to what you confirmed — you told me ${confirmed.objectName} is your ${NOUN[intent.rel]}. Want me to update it to ${obj.name}?`, source: 'USER_CONFIRMED' };
    }
    return { handled: true, answer: `I don't have that confirmed yet. If ${obj.name} is your ${NOUN[intent.rel]}, tell me "${obj.name} is my ${NOUN[intent.rel]}" and I'll remember it.`, source: null };
  }

  // ── "Who is my manager / reports to me / is on my team?" ──
  if (intent.kind === 'ASK_WHO') {
    const confirmed = await getConfirmedFor(workspaceId, userId, self, intent.rel);
    const selfNode = await _selfNode(workspaceId, userName);
    const dataset = await _datasetRel(workspaceId, selfNode, intent.rel);
    const dsName = Array.isArray(dataset) ? (dataset.length ? dataset.join(', ') : null) : dataset;

    // Priority 1: USER_CONFIRMED (with conflict surfacing vs dataset).
    if (confirmed) {
      if (dsName && !Array.isArray(dataset) && dsName.toLowerCase() !== confirmed.objectName.toLowerCase()) {
        return { handled: true, source: 'CONFLICT', answer:
          `I have conflicting information. The workspace data shows ${dsName}, but you previously confirmed ${confirmed.objectName} as your ${NOUN[intent.rel]}. Which should I treat as current?` };
      }
      return { handled: true, source: 'USER_CONFIRMED', answer: `You previously confirmed that ${confirmed.objectName} is your ${NOUN[intent.rel]}.` };
    }
    // Priority 2: DATASET_FACT.
    if (dsName) return { handled: true, source: 'DATASET_FACT', answer: `Per the workspace data, your ${NOUN[intent.rel]} ${Array.isArray(dataset) ? 'are' : 'is'} ${dsName}.` };
    // Priority 4: UNKNOWN — optionally ask, but only with a real evidence-backed candidate.
    let candidate = null;
    if (intent.rel === 'REPORTS_TO' && selfNode) {
      const nb = await getNeighbors(workspaceId, selfNode.rawId || selfNode.nodeId).catch(() => []);
      candidate = (nb.find(n => n.relation === 'REPORTS_TO' && n.direction === 'OUT') || nb.find(n => n.relation === 'MANAGES' && n.direction === 'IN'))?.node?.name || null;
    }
    return { handled: true, source: 'UNKNOWN', answer: candidate
      ? `I don't have a confirmed ${NOUN[intent.rel]} for you yet. Is ${candidate} your ${NOUN[intent.rel]}?`
      : `I don't have a confirmed ${NOUN[intent.rel]} for you yet, and the workspace data doesn't establish one.` };
  }

  return { handled: false };
}

export default { detectPeopleIntent, handlePeopleMemory };
