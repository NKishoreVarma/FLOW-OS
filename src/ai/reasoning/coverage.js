/**
 * coverage.js — deterministic coverage derivation (Phase 3).
 *
 * Pure function: no I/O, no DB, no LLM, no connector calls.
 * Injectable into createEvidencePacket via opts.deriveCoverage.
 *
 * Outcome classification:
 *   SUCCESSFUL/KNOWN : OK, EMPTY, SKIPPED_NO_PERMISSION
 *   GAPS             : FAILED, TIMEOUT, SKIPPED_NOT_CONNECTED
 *   NOT-ATTEMPTED    : SKIPPED_BY_PLAN (excluded from "attempted" set)
 *
 * Coverage rules:
 *   attempted = every query whose outcome is NOT SKIPPED_BY_PLAN
 *   No attempted queries               → NONE
 *   All attempted are SUCCESSFUL/KNOWN → COMPLETE
 *   Any attempted is a GAP             → PARTIAL
 *
 * Security invariant — SKIPPED_NO_PERMISSION:
 *   Classified as SUCCESSFUL so it does not create a coverage gap; the raw
 *   outcome is preserved in provenance (the queries array). The final answer
 *   layer must never expose the distinction to the user — doing so would
 *   confirm the existence of records the user cannot access (enumeration
 *   side-channel). Treat it like EMPTY in any user-visible text.
 */

import { QueryOutcome, Coverage, isQueryOutcome } from '../../contracts/evidence.js';

// ── Outcome sets ──────────────────────────────────────────────────────────────

const _SUCCESSFUL = new Set([
  QueryOutcome.OK,
  QueryOutcome.EMPTY,
  QueryOutcome.SKIPPED_NO_PERMISSION,  // see security invariant above
]);

const _GAPS = new Set([
  QueryOutcome.FAILED,
  QueryOutcome.TIMEOUT,
  QueryOutcome.SKIPPED_NOT_CONNECTED,
]);

// ── Internal classifier ───────────────────────────────────────────────────────

/**
 * @param {string} outcome
 * @returns {'skipped' | 'gap' | 'ok'}
 * @throws {TypeError} on unrecognised outcome — fail closed
 */
function _classify(outcome) {
  if (!isQueryOutcome(outcome)) throw new TypeError(`coverage: unknown outcome "${outcome}" — fail closed`);
  if (outcome === QueryOutcome.SKIPPED_BY_PLAN) return 'skipped';
  if (_GAPS.has(outcome)) return 'gap';
  // Only SUCCESSFUL values remain (_SUCCESSFUL set); isQueryOutcome already
  // confirmed the string is valid — no else-branch can be an unknown value.
  return 'ok';
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * deriveCoverage — the injectable deriver for createEvidencePacket.
 *
 * Must be a pure function of EvidenceQuery[]; never mutates the input.
 * Returns the single authoritative Coverage value — callers must never
 * manually assign or override it.
 *
 * @param   {ReadonlyArray<{outcome: string, resultIds?: string[]}>} queries
 * @returns {'COMPLETE' | 'PARTIAL' | 'NONE'}
 * @throws  {TypeError} if queries is not an array, any element is malformed,
 *                      or any outcome is unrecognised
 */
export function deriveCoverage(queries) {
  if (!Array.isArray(queries)) throw new TypeError('coverage: queries must be an array');

  let attempted = 0;
  let gaps = 0;

  for (const q of queries) {
    if (q === null || typeof q !== 'object') throw new TypeError('coverage: each query must be a non-null object');
    const cls = _classify(q.outcome);  // throws on unrecognised outcome
    if (cls === 'skipped') continue;
    attempted++;
    if (cls === 'gap') gaps++;
  }

  if (attempted === 0) return Coverage.NONE;
  if (gaps > 0)        return Coverage.PARTIAL;
  return Coverage.COMPLETE;
}

/**
 * deriveCoverageResult — richer result for callers that need provenance detail.
 *
 * The `coverage` field is always the output of deriveCoverage — never assigned
 * by the caller. All other fields are derived from the same input.
 *
 * @param   {ReadonlyArray} queries
 * @returns {Readonly<{coverage: string, attemptedCount: number, gapCount: number, evidenceCount: number, queries: ReadonlyArray}>}
 */
export function deriveCoverageResult(queries) {
  const coverage = deriveCoverage(queries);  // authoritative — derived, not assigned

  const attemptedCount = queries.filter(q => q?.outcome !== QueryOutcome.SKIPPED_BY_PLAN).length;
  const gapCount       = queries.filter(q => _GAPS.has(q?.outcome)).length;
  // evidenceCount counts resultIds only (populated exclusively by OK queries per the contract).
  const evidenceCount  = queries.reduce((n, q) => n + (Array.isArray(q?.resultIds) ? q.resultIds.length : 0), 0);

  return Object.freeze({ coverage, attemptedCount, gapCount, evidenceCount, queries });
}
