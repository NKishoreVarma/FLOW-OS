/**
 * evidencePacket.js — Phase 5 canonical EvidencePacket builder.
 *
 * Pipeline position:
 *   dispatchWithEvidence → EvidenceQuery[]
 *                              ↓
 *                        buildEvidencePacket
 *                              ↓
 *                        EvidencePacket (items + queries + coverage)
 *                              ↓
 *                        formatEvidenceForPrompt → LLM synthesis
 *                              ↓
 *                        evidenceVerifier (ID grounding)
 *                              ↓
 *                        humanize (strip markers)
 *                              ↓
 *                        FINAL ANSWER
 *
 * Evidence IDs (e1, e2, …) are packet-local references to EvidenceItems,
 * deterministic by rank position. They are DISTINCT from Phase 1 resultIds
 * (database record identifiers). The item's provenance.resultId links back.
 */

import { createEvidencePacket, EvidenceContractError } from '../../contracts/evidence.js';
import { deriveCoverage } from './coverage.js';
import { sanitizeForLLM } from './ContextBuilder.js';

// Credential patterns that must never appear in evidence content.
const _SECRET_VAL_RE = /(ya29\.|gh[pousr]_|xox[baprs]-|eyJ[A-Za-z0-9_-]{10,}|Bearer\s+[A-Za-z0-9._-]{12,})/;

function _safeContent(raw) {
  const text = String(raw || '').slice(0, 600);
  if (_SECRET_VAL_RE.test(text)) return '[content redacted — credential detected]';
  // Apply jargon sanitization so internal system terms don't reach the LLM.
  return sanitizeForLLM(text);
}

// Best-effort source label from a ranked evidence item.
function _sourceLabel(e) {
  return e.source || e.capType || e.type || 'workspace';
}

// Best-effort stable record identifier from item metadata.
function _sourceId(e) {
  if (e.metadata?.id   && typeof e.metadata.id === 'string')   return e.metadata.id;
  if (e.metadata?.nodeId && typeof e.metadata.nodeId === 'string') return e.metadata.nodeId;
  if (e.metadata?.resultId && typeof e.metadata.resultId === 'string') return e.metadata.resultId;
  if (e.metadata?.sha && typeof e.metadata.sha === 'string')   return e.metadata.sha;
  if (typeof e.id === 'string' && e.id && e.id !== 'undefined') return e.id;
  return null;
}

// Human-facing type label (no internal jargon).
const _TYPE_MAP = {
  PR: 'pull_request', COMMIT: 'commit', ISSUE: 'issue', REPOSITORY: 'repository',
  INCIDENT: 'incident', DECISION: 'decision', CUSTOMER: 'customer',
  USER: 'person', EMPLOYEE: 'person', MEETING: 'meeting', EVENT: 'meeting',
  DOCUMENT: 'document', TRANSCRIPT: 'transcript', EMAIL: 'email',
  rag: 'knowledge', memory: 'org_record', entity: 'graph_entity',
  timeline: 'timeline_event', capability: 'workspace_record',
};
function _typeLabel(e) {
  const raw = e.capType || e.type || 'record';
  return _TYPE_MAP[raw] || String(raw).toLowerCase().replace(/[^a-z_]/g, '_');
}

// Match a ranked item's source to an EvidenceQuery to derive freshness + provenance.
function _queryFor(source, queries) {
  // Prefer an OK query for this source (carries real resultIds).
  const ok = (queries || []).find(q => q.source === source && q.outcome === 'OK');
  if (ok) return ok;
  // Fall back to any query for this source.
  return (queries || []).find(q => q.source === source) || null;
}

/**
 * Build one EvidenceItem from a ranked evidence object.
 * id is deterministic: "e${index + 1}" based on rank position.
 * The packet-level workspaceId is the authoritative tenant identifier.
 */
export function buildEvidenceItem(rankedItem, index, queries) {
  if (!rankedItem || typeof rankedItem !== 'object') {
    throw new EvidenceContractError('buildEvidenceItem: rankedItem must be a non-null object');
  }

  const source = _sourceLabel(rankedItem);
  const sourceId = _sourceId(rankedItem);
  const content = _safeContent(rankedItem.content || '');
  const q = _queryFor(source, queries);

  return Object.freeze({
    id: `e${index + 1}`,
    source,
    sourceId,
    type: _typeLabel(rankedItem),
    content,
    timestamp: rankedItem.ts ? new Date(rankedItem.ts).toISOString() : null,
    freshness: q?.freshness || 'UNKNOWN',
    // workspaceId is best-effort here; packet.workspaceId is authoritative.
    workspaceId: rankedItem.workspaceId || null,
    provenance: Object.freeze({
      capabilityId:  q?.capabilityId || rankedItem.capType || null,
      queryOutcome:  q?.outcome      || null,
      resultId:      sourceId,
    }),
  });
}

/**
 * buildEvidencePacket — assembles the canonical Phase 5 packet.
 *
 * Extends the Phase 1 createEvidencePacket (query contract + derived coverage)
 * with items: EvidenceItem[] — ranked evidence with deterministic e1..eN IDs.
 *
 * Same rankedPrimary order → same IDs. Order is determined by EvidenceRanker
 * (score DESC, stable within equal scores). Never depends on timestamps, UUIDs,
 * or LLM output.
 *
 * @param {string}   workspaceId
 * @param {string}   question
 * @param {object}   intent          IntentResult from IntentAnalyzer
 * @param {object[]} queries         EvidenceQuery[] from dispatchWithEvidence
 * @param {object[]} rankedPrimary   ranked.primary from EvidenceRanker
 * @returns {Readonly<object>}       EvidencePacket extended with items[]
 */
export function buildEvidencePacket(workspaceId, question, intent, queries, rankedPrimary) {
  const ws = String(workspaceId || '');
  if (!ws) throw new EvidenceContractError('buildEvidencePacket: workspaceId required');

  // Build items deterministically from the ranked order (e1 = highest ranked).
  const items = (rankedPrimary || [])
    .filter(e => String(e?.content || '').trim().length > 10)
    .slice(0, 8)   // cap at 8 items to keep the prompt tractable
    .map((e, i) => buildEvidenceItem(e, i, queries));

  // Phase 1 createEvidencePacket validates query shapes + cross-workspace rejection
  // + derives coverage via Phase 3 deriveCoverage. Claims start empty (populated
  // post-synthesis by the verifier, not by the LLM).
  const base = createEvidencePacket(
    { question, intent, queries: queries || [], claims: [], workspaceId: ws },
    { deriveCoverage },
  );

  return Object.freeze({ ...base, items });
}

// ── Prompt section builder ────────────────────────────────────────────────────

/**
 * Format the EvidencePacket as a structured prompt section.
 *
 * Produced section structure:
 *   EVIDENCE
 *   [e1] source/sourceId
 *   type: ...
 *   timestamp: YYYY-MM-DD
 *   freshness: CURRENT|RECENT|STALE|UNKNOWN
 *   <content excerpt>
 *
 *   RETRIEVAL
 *   queries:
 *   - source → outcome
 *   coverage: COMPLETE|PARTIAL|NONE
 *
 *   RULES
 *   1-8 citation rules
 */
export function formatEvidenceForPrompt(packet) {
  if (!packet?.items) return '';
  const lines = [];

  if (packet.items.length > 0) {
    lines.push('EVIDENCE');
    for (const item of packet.items) {
      lines.push('');
      lines.push(`[${item.id}] ${item.source}/${item.sourceId || 'record'}`);
      lines.push(`type: ${item.type}`);
      if (item.timestamp) lines.push(`timestamp: ${item.timestamp.slice(0, 10)}`);
      lines.push(`freshness: ${item.freshness}`);
      lines.push(item.content.slice(0, 400));
    }
    lines.push('');
  }

  // Show only non-SKIPPED_BY_PLAN queries in the RETRIEVAL section.
  const visibleQueries = (packet.queries || []).filter(q => q.outcome !== 'SKIPPED_BY_PLAN');
  if (visibleQueries.length > 0) {
    lines.push('RETRIEVAL');
    lines.push('');
    lines.push('queries:');
    for (const q of visibleQueries) {
      lines.push(`- ${q.source} → ${q.outcome}`);
    }
    lines.push('');
    lines.push(`coverage: ${packet.coverage || 'UNKNOWN'}`);
    lines.push('');
  }

  lines.push('RULES');
  lines.push('1. Every factual claim MUST cite one or more evidence IDs using [e1] notation.');
  lines.push('2. Never invent an evidence ID. Only use IDs listed in the EVIDENCE section above.');
  lines.push('3. Never cite an evidence ID that is not listed in EVIDENCE above.');
  lines.push('4. Never assert a fact not supported by the cited evidence.');
  lines.push('5. If evidence is insufficient, say so honestly — "nothing on that yet."');
  lines.push('6. NEVER say a source has no data if it was SKIPPED_NOT_CONNECTED — you never checked it.');
  lines.push('7. NEVER say data is current if its freshness is STALE.');
  lines.push('8. Include [eN] markers in your draft so FLOW can verify internally — the markers will be removed before the user sees the answer.');

  return lines.join('\n');
}
