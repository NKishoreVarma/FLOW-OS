/**
 * evidence.js — the canonical FLOW evidence contract (Phase 1).
 *
 * Defines the shapes every retrieval must produce so that a factual answer can be
 * grounded and a negative answer can be SCOPED. This file is pure definition +
 * validation — NO I/O, NO retrieval, NO coverage derivation logic.
 *
 * Invariants enforced here (do not regress):
 *  - Coverage is NEVER manually assigned. createEvidencePacket refuses a caller-
 *    supplied `coverage` and only accepts a value produced by an injected deriver
 *    (the canonical deriver lands in Phase 3: src/ai/reasoning/coverage.js).
 *  - evidenceCount is SEPARATE from coverage (COMPLETE + 0 evidence is valid).
 *  - workspaceId is FLOW-controlled: every query in a packet must match the packet's
 *    workspaceId; cross-workspace ids are rejected, never silently merged.
 *  - The seven QueryOutcome states are distinct and never conflated.
 *  - No credential/token/authorization material may live in a contract object.
 */

// ── Enums ─────────────────────────────────────────────────────────────────────
export const QueryOutcome = Object.freeze({
  OK:                    'OK',                    // executed, returned ≥1 record
  EMPTY:                 'EMPTY',                 // executed successfully, zero records
  FAILED:                'FAILED',                // attempted, execution errored
  TIMEOUT:               'TIMEOUT',               // attempted, exceeded time boundary
  SKIPPED_NOT_CONNECTED: 'SKIPPED_NOT_CONNECTED', // source exists but is not connected
  SKIPPED_NO_PERMISSION: 'SKIPPED_NO_PERMISSION', // excluded by permission policy
  SKIPPED_BY_PLAN:       'SKIPPED_BY_PLAN',       // intentionally not queried by the plan
});

export const Freshness = Object.freeze({
  CURRENT: 'CURRENT', RECENT: 'RECENT', STALE: 'STALE', UNKNOWN: 'UNKNOWN',
});

export const Coverage = Object.freeze({ COMPLETE: 'COMPLETE', PARTIAL: 'PARTIAL', NONE: 'NONE' });

export const isQueryOutcome = (v) => Object.values(QueryOutcome).includes(v);
export const isFreshness    = (v) => Object.values(Freshness).includes(v);
export const isCoverage     = (v) => Object.values(Coverage).includes(v);

// ── Security guard ────────────────────────────────────────────────────────────
// A contract object must never carry secrets. This scans keys + string values.
const SECRET_KEY_RE = /(token|secret|password|authorization|api[_-]?key|bearer|cookie|refresh|access_token|client_secret)/i;
const SECRET_VAL_RE = /(ya29\.|gh[pousr]_|xox[baprs]-|eyJ[A-Za-z0-9_-]{10,}|Bearer\s+[A-Za-z0-9._-]{12,})/;
function assertNoSecrets(obj, where) {
  for (const [k, v] of Object.entries(obj || {})) {
    if (SECRET_KEY_RE.test(k)) throw new EvidenceContractError(`${where}: forbidden credential-like field "${k}"`);
    if (typeof v === 'string' && SECRET_VAL_RE.test(v)) throw new EvidenceContractError(`${where}: value looks like a secret`);
  }
}

export class EvidenceContractError extends Error {
  constructor(msg) { super(msg); this.name = 'EvidenceContractError'; }
}

// ── EvidenceQuery ─────────────────────────────────────────────────────────────
/**
 * One planned capability's result. EVERY planned capability produces exactly one
 * of these (Phase 2), including the ones that were skipped — nothing is silently omitted.
 * @returns {Readonly<object>}
 */
export function createEvidenceQuery(input = {}) {
  // Fail-closed: reject the whole payload if it carries any credential-like material,
  // rather than silently dropping it (security invariant — no secrets in contracts).
  assertNoSecrets(input, 'EvidenceQuery input');
  const {
    capabilityId, source, outcome,
    freshness = Freshness.UNKNOWN,
    timeScope = null, executedAt = new Date().toISOString(),
    lastSyncAt = null, resultIds = [], workspaceId, error = null,
  } = input;
  if (!capabilityId || typeof capabilityId !== 'string') throw new EvidenceContractError('EvidenceQuery: capabilityId required');
  if (!source || typeof source !== 'string')             throw new EvidenceContractError('EvidenceQuery: source required');
  if (!workspaceId || typeof workspaceId !== 'string')   throw new EvidenceContractError('EvidenceQuery: workspaceId required (FLOW-controlled)');
  if (!isQueryOutcome(outcome))                          throw new EvidenceContractError(`EvidenceQuery: invalid outcome "${outcome}"`);
  if (!isFreshness(freshness))                           throw new EvidenceContractError(`EvidenceQuery: invalid freshness "${freshness}"`);
  if (!Array.isArray(resultIds) || !resultIds.every(id => typeof id === 'string')) throw new EvidenceContractError('EvidenceQuery: resultIds must be string[]');
  if (timeScope !== null && !(typeof timeScope === 'object' && 'from' in timeScope && 'to' in timeScope)) throw new EvidenceContractError('EvidenceQuery: timeScope must be null or {from,to}');
  // Only OK may carry result ids; a non-OK query claiming results is malformed.
  if (outcome !== QueryOutcome.OK && resultIds.length > 0) throw new EvidenceContractError(`EvidenceQuery: outcome ${outcome} cannot carry resultIds`);

  const q = { capabilityId, source, outcome, freshness, timeScope, executedAt, lastSyncAt, resultIds: [...resultIds], workspaceId, error };
  assertNoSecrets(q, 'EvidenceQuery');
  return Object.freeze(q);
}

// ── Claim ─────────────────────────────────────────────────────────────────────
export function createClaim({ id, text, evidenceIds = [] } = {}) {
  if (!id || typeof id !== 'string')     throw new EvidenceContractError('Claim: id required');
  if (typeof text !== 'string' || !text) throw new EvidenceContractError('Claim: text required');
  if (!Array.isArray(evidenceIds) || !evidenceIds.every(e => typeof e === 'string')) throw new EvidenceContractError('Claim: evidenceIds must be string[]');
  return Object.freeze({ id, text, evidenceIds: [...evidenceIds] });
}

// ── EvidencePacket ────────────────────────────────────────────────────────────
/**
 * @param {object} input { question, intent, queries, claims, workspaceId }
 * @param {object} opts  { deriveCoverage?: (queries)=>Coverage }
 *   deriveCoverage is INJECTED (the canonical deriver is Phase 3). If absent, coverage
 *   is null (unset) — it is NEVER accepted from the caller.
 * @returns {Readonly<object>}
 */
export function createEvidencePacket(input = {}, opts = {}) {
  assertNoSecrets(input, 'EvidencePacket input');   // fail-closed on credentials
  // Coverage may never be supplied by hand — it is a pure function of the queries.
  if ('coverage' in input) throw new EvidenceContractError('EvidencePacket: coverage is derived, never assigned');

  const { question, intent, queries = [], claims = [], workspaceId } = input;
  const { deriveCoverage = null } = opts;

  if (!workspaceId || typeof workspaceId !== 'string') throw new EvidenceContractError('EvidencePacket: workspaceId required (FLOW-controlled)');
  if (typeof question !== 'string')  throw new EvidenceContractError('EvidencePacket: question required');
  if (!Array.isArray(queries))       throw new EvidenceContractError('EvidencePacket: queries must be an array');
  if (!Array.isArray(claims))        throw new EvidenceContractError('EvidencePacket: claims must be an array');

  // Every query must be a valid EvidenceQuery AND belong to THIS workspace.
  for (const q of queries) {
    if (!q || typeof q !== 'object' || !isQueryOutcome(q.outcome) || !q.capabilityId || !q.source || !q.workspaceId) {
      throw new EvidenceContractError('EvidencePacket: malformed query in packet');
    }
    if (q.workspaceId !== workspaceId) {
      throw new EvidenceContractError(`EvidencePacket: cross-workspace query (${q.workspaceId} ≠ ${workspaceId}) rejected`);
    }
  }

  // Every claim's evidenceIds must reference result ids that exist in THIS packet's
  // queries — no phantom evidence at construction time.
  const known = new Set(queries.flatMap(q => q.resultIds || []));
  for (const c of claims) {
    for (const eid of c.evidenceIds || []) {
      if (!known.has(eid)) throw new EvidenceContractError(`EvidencePacket: claim references unknown evidence id "${eid}"`);
    }
  }

  const coverage = deriveCoverage ? deriveCoverage(queries) : null; // Phase 3 injects the real deriver
  if (coverage !== null && !isCoverage(coverage)) throw new EvidenceContractError(`EvidencePacket: deriver returned invalid coverage "${coverage}"`);

  const packet = { question, intent: intent ?? null, queries: [...queries], coverage, claims: [...claims], workspaceId, assembledAt: new Date().toISOString() };
  assertNoSecrets({ question, intent }, 'EvidencePacket');
  return Object.freeze(packet);
}

/** evidenceCount is SEPARATE from coverage. Sum of OK-query result ids. */
export function evidenceCount(packet) {
  return (packet?.queries || []).reduce((n, q) => n + ((q.resultIds && q.resultIds.length) || 0), 0);
}
