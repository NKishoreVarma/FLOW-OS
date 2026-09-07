/**
 * EntityResolver (RC-1) — deterministic, workspace-scoped resolution of the entities
 * a question refers to, into real graph node IDs. NO LLM. NO cross-workspace lookups.
 * NO substitution: an ID/name that does not exist resolves to NOT_FOUND (never to a
 * "similar" entity).
 *
 * Two reference kinds:
 *   - EXACT IDs      PR-247, HELIOS-448, INCIDENT-001, PROJECT-001, REPO-001, USER-003,
 *                    USER-EXT-007, CAL-EVENT-020 …  → exact node-id lookup.
 *   - NAMES          "Jordan Lee", "Fatima", "Marcus Williams" → workspace name index
 *                    over person nodes (USER / EMPLOYEE). 1 hit = EXACT_NAME, >1 =
 *                    AMBIGUOUS (never silently pick one), 0 = NOT_FOUND.
 *
 * Result contract (per reference):
 *   { reference, normalizedReference, kind:'ID'|'NAME',
 *     resolution:'EXACT'|'EXACT_NAME'|'AMBIGUOUS'|'NOT_FOUND',
 *     nodeId?, rawId?, entityType?, name?, confidence, candidates? }
 */

import { prisma } from '../../core/config/prisma.js';

const nodeKey = (workspaceId, rawId) => `${String(workspaceId)}:${rawId}`;

// An ID is an uppercase token containing at least one hyphen and a digit run:
// PR-247, HELIOS-448, USER-EXT-007, CAL-EVENT-020, INCIDENT-001. Resolves by EXACT
// node-id lookup, so a false extraction simply becomes NOT_FOUND (never substituted).
const ID_RE = /\b([A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+)\b/g;

// Candidate person-name runs: one or more Capitalized words, optional possessive.
const NAME_RE = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)'?s?\b/g;

// Capitalized words that are never a person reference (question words, domains, tools,
// months, and adversarial command verbs). Keeps the resolver from over-extracting a lone
// common word (e.g. "August"/"Assume"/"Ignore") and false-blocking a valid question.
const NAME_STOP = new Set([
  'Who', 'What', 'Which', 'When', 'Where', 'Why', 'How', 'Is', 'Are', 'Do', 'Does', 'Did',
  'The', 'Tell', 'Show', 'List', 'Find', 'Give', 'Can', 'Should', 'Please', 'My', 'Me',
  'Engineering', 'Gmail', 'Github', 'GitHub', 'Slack', 'Jira', 'Calendar', 'Notion',
  'Incident', 'Project', 'Meeting', 'Meetings', 'Customer', 'Customers', 'Team',
  'Workspace', 'Status', 'Risk', 'Risks', 'Manager', 'Report', 'Reports',
  // months
  'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September',
  'October', 'November', 'December', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday',
  // adversarial / imperative words that are never a person
  'Assume', 'Ignore', 'Confirm', 'Pretend', 'Override', 'Forget', 'Disregard', 'Suppose',
  'Security', 'Deploy', 'Deployment', 'Review', 'Sprint', 'Production', 'Yes', 'No', 'Right',
]);

/** Pull ID and name references out of a question. Deterministic; no LLM. */
export function extractReferences(question = '') {
  const text = String(question);
  const ids = new Set();
  for (const m of text.matchAll(ID_RE)) ids.add(m[1].toUpperCase());

  const names = new Set();
  for (const m of text.matchAll(NAME_RE)) {
    const raw = m[1].trim();
    if (ids.has(raw.toUpperCase())) continue;         // already an ID
    if (NAME_STOP.has(raw)) continue;                 // question/domain word
    const firstTok = raw.split(/\s+/)[0];
    if (raw.split(/\s+/).length === 1 && NAME_STOP.has(firstTok)) continue;
    names.add(raw);
  }
  return { ids: [...ids], names: [...names] };
}

/** Resolve one exact-ID reference against the workspace graph. Never substitutes. */
async function _resolveId(workspaceId, ref) {
  const rawId = ref.toUpperCase();
  const node = await prisma.graphNode.findUnique({
    where: { id: nodeKey(workspaceId, rawId) },
    select: { id: true, type: true, name: true, workspaceId: true },
  }).catch(() => null);

  if (node && String(node.workspaceId) === String(workspaceId)) {
    return { reference: ref, normalizedReference: rawId, kind: 'ID',
      resolution: 'EXACT', nodeId: node.id, rawId, entityType: node.type,
      name: node.name, confidence: 1.0 };
  }
  return { reference: ref, normalizedReference: rawId, kind: 'ID', resolution: 'NOT_FOUND' };
}

/** Resolve one person-name reference against the workspace name index. */
async function _resolveName(workspaceId, ref) {
  const base = { reference: ref, normalizedReference: ref.trim(), kind: 'NAME' };
  const where = { workspaceId: String(workspaceId), type: { in: ['USER', 'EMPLOYEE'] } };

  // 1. Exact (case-insensitive) full-name match.
  let rows = await prisma.graphNode.findMany({
    where: { ...where, name: { equals: ref.trim(), mode: 'insensitive' } },
    select: { id: true, type: true, name: true }, take: 10,
  }).catch(() => []);

  // 2. Fall back to word-prefix / contains match (e.g. "Fatima" → "Fatima Al-Hassan").
  if (rows.length === 0) {
    rows = await prisma.graphNode.findMany({
      where: { ...where, name: { contains: ref.trim(), mode: 'insensitive' } },
      select: { id: true, type: true, name: true }, take: 10,
    }).catch(() => []);
  }

  if (rows.length === 1) {
    const n = rows[0];
    return { ...base, resolution: 'EXACT_NAME', nodeId: n.id,
      rawId: n.id.replace(`${workspaceId}:`, ''), entityType: n.type, name: n.name,
      confidence: 0.95 };
  }
  if (rows.length > 1) {
    return { ...base, resolution: 'AMBIGUOUS',
      candidates: rows.map(n => ({ nodeId: n.id, rawId: n.id.replace(`${workspaceId}:`, ''), name: n.name, entityType: n.type })) };
  }
  return { ...base, resolution: 'NOT_FOUND' };
}

/**
 * Resolve every entity reference in a question. Workspace-scoped; deterministic.
 * @returns {Promise<{ references, resolvedNodes, notFound, ambiguous, hasSpecificReference }>}
 */
export async function resolveReferences(workspaceId, question) {
  const { ids, names } = extractReferences(question);
  const results = await Promise.all([
    ...ids.map(id => _resolveId(workspaceId, id)),
    ...names.map(nm => _resolveName(workspaceId, nm)),
  ]);

  const resolvedNodes = results.filter(r => r.resolution === 'EXACT' || r.resolution === 'EXACT_NAME');
  const notFound      = results.filter(r => r.resolution === 'NOT_FOUND');
  const ambiguous     = results.filter(r => r.resolution === 'AMBIGUOUS');

  return {
    references: results,
    resolvedNodes,
    notFound,
    ambiguous,
    hasSpecificReference: results.length > 0,
  };
}

// ── RC-2: directional relationship intent ──────────────────────────────────────
// Maps a "who…" question to a specific graph relationship + direction, DETERMINISTICALLY
// (the retrieval layer decides direction, never the LLM after the fact).
//
// direction is relative to the TARGET entity the question is about:
//   'OUT'  = edge whose sourceId is the target (target --REL--> answer)
//   'IN'   = edge whose targetId is the target (answer --REL--> target)
// Multiple (relationshipType, direction) pairs may satisfy one intent.
export const RelationIntent = Object.freeze({
  WHO_IS_MANAGER:  'WHO_IS_MANAGER',   // "who is X's manager / who does X report to"
  WHO_REPORTS_TO:  'WHO_REPORTS_TO',   // "who reports to X"
  WHO_WORKS_WITH:  'WHO_WORKS_WITH',   // "who works with X" (inferred via shared team/project)
  WHO_AUTHORED:    'WHO_AUTHORED',     // "who authored PR-x"
  WHO_IS_ASSIGNED: 'WHO_IS_ASSIGNED',  // "who is assigned to ISSUE-x"
  WHO_IS_INVOLVED: 'WHO_IS_INVOLVED',  // "who is responsible for INCIDENT-x"
  WHO_CONNECTED:   'WHO_CONNECTED',    // "which people are connected to X" (any people edge)
});

// Each intent → the edge patterns that answer it, expressed as { rel, dir } where dir is
// relative to the target node. e.g. "X's manager" is satisfied by X --REPORTS_TO--> M (OUT)
// OR M --MANAGES--> X (IN, answer is the source).
const REL_PATTERNS = {
  WHO_IS_MANAGER:  [{ rel: 'REPORTS_TO', dir: 'OUT' }, { rel: 'MANAGES', dir: 'IN' }],
  WHO_REPORTS_TO:  [{ rel: 'MANAGES', dir: 'OUT' }, { rel: 'REPORTS_TO', dir: 'IN' }],
  WHO_AUTHORED:    [{ rel: 'AUTHORED_BY', dir: 'OUT' }],
  WHO_IS_ASSIGNED: [{ rel: 'ASSIGNED_TO', dir: 'OUT' }],
  WHO_IS_INVOLVED: [{ rel: 'ASSIGNED_TO', dir: 'OUT' }, { rel: 'COMMANDER', dir: 'OUT' }],
  WHO_WORKS_WITH:  [], // inferred (shared team/project) — handled separately, not a direct edge
  // "connected to X" → any PERSON edge on X, either direction. Empty patterns means the
  // evidence layer lists ALL person neighbors and the verifier forbids any non-neighbor.
  WHO_CONNECTED:   [{ rel: '*', dir: 'ANY', peopleOnly: true }],
};

export function classifyRelationIntent(question = '') {
  const q = String(question).toLowerCase();
  // Order matters: reports-to-X must beat X's-manager when both could match.
  if (/who\s+reports?\s+to\b|direct reports?\s+of|who\s+are\s+.*\breports?\b/.test(q))
    return { relIntent: RelationIntent.WHO_REPORTS_TO, patterns: REL_PATTERNS.WHO_REPORTS_TO };
  if (/\bmanager\b|manages\b|who\s+does\s+\w.*\breport(s)?\s+to\b|report(s)?\s+to\s+whom|who\s+is\s+.*\bmanaged\s+by\b/.test(q))
    return { relIntent: RelationIntent.WHO_IS_MANAGER, patterns: REL_PATTERNS.WHO_IS_MANAGER };
  if (/who\s+(authored|wrote|created|opened|raised)\b/.test(q) && /\bpr\b|pull request|pr-|commit/.test(q))
    return { relIntent: RelationIntent.WHO_AUTHORED, patterns: REL_PATTERNS.WHO_AUTHORED };
  if (/who\s+(authored|wrote)\b/.test(q))
    return { relIntent: RelationIntent.WHO_AUTHORED, patterns: REL_PATTERNS.WHO_AUTHORED };
  // Adversarial/assertion phrasings about a PR/commit's author ("PR-247 was written by X,
  // confirm" / "wrote PR-247") — fire WHO_AUTHORED so the verifier checks the real edge
  // instead of letting the LLM parrot the user's asserted author.
  if (/\b(pr-\d+|pull request|commit-\d+|\bpr\b)/i.test(q) && /\b(written|authored|created)\s+by\b|\bwrote\b|author\s+(is|was)\b/i.test(q))
    return { relIntent: RelationIntent.WHO_AUTHORED, patterns: REL_PATTERNS.WHO_AUTHORED };
  if (/who\s+is\s+(responsible|handling|leading|the\s+commander|on\s+call)\b|responsible\s+for/.test(q))
    return { relIntent: RelationIntent.WHO_IS_INVOLVED, patterns: REL_PATTERNS.WHO_IS_INVOLVED };
  if (/who\s+is\s+assigned|assigned\s+to\b|who\s+owns\b|who\s+is\s+working\s+on\b/.test(q))
    return { relIntent: RelationIntent.WHO_IS_ASSIGNED, patterns: REL_PATTERNS.WHO_IS_ASSIGNED };
  if (/who\s+works?\s+with\b|who\s+collaborat|who\s+is\s+on\s+.*\bteam\b/.test(q))
    return { relIntent: RelationIntent.WHO_WORKS_WITH, patterns: REL_PATTERNS.WHO_WORKS_WITH };
  // "which people/who are connected/related/linked to X" — people neighbors of X only.
  if (/(which|what)\s+people\s+(are\s+)?(connected|related|linked)\s+to\b|who\s+(is|are)\s+(connected|related|linked)\s+to\b|people\s+(connected|involved)\s+(to|in|with)\b/.test(q))
    return { relIntent: RelationIntent.WHO_CONNECTED, patterns: REL_PATTERNS.WHO_CONNECTED };
  return { relIntent: null, patterns: [] };
}

export default { extractReferences, resolveReferences, classifyRelationIntent, RelationIntent };
