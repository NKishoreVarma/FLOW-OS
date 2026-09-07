/**
 * dispatchOutcomes — PURE outcome/freshness mappers for the dispatcher (Phase 2).
 * No I/O, no DB, no service imports — safe to unit-test in isolation. The dispatcher
 * re-exports these and applies them to real dispatch results.
 */
import { QueryOutcome, Freshness } from '../../contracts/evidence.js';

/** Map a successful dispatch RESULT → { outcome, resultIds }. */
export function mapResultOutcome(result) {
  if (result?.__skipped === 'not_connected') return { outcome: QueryOutcome.SKIPPED_NOT_CONNECTED, resultIds: [] };
  if (result?.__skipped === 'no_permission') return { outcome: QueryOutcome.SKIPPED_NO_PERMISSION, resultIds: [] };
  const count = Number.isFinite(result?.count) ? result.count : (result?.records?.length || 0);
  if (count > 0) return { outcome: QueryOutcome.OK, resultIds: (result.records || []).map(r => r?.id).filter(id => typeof id === 'string') };
  return { outcome: QueryOutcome.EMPTY, resultIds: [] };
}

/** Map a thrown error → outcome (timeout is distinct from failure). */
export function outcomeFromError(e) {
  return e && e.__timeout ? QueryOutcome.TIMEOUT : QueryOutcome.FAILED;
}

/** Freshness classifier. CURRENT <15m, RECENT <24h, STALE ≥24h, UNKNOWN if no sync. */
export function classifyFreshness(lastSyncAt, now = Date.now()) {
  if (!lastSyncAt) return Freshness.UNKNOWN;
  const t = Date.parse(lastSyncAt);
  if (Number.isNaN(t)) return Freshness.UNKNOWN;
  const age = now - t;
  if (age < 15 * 60_000)   return Freshness.CURRENT;
  if (age < 24 * 3600_000) return Freshness.RECENT;
  return Freshness.STALE;
}

/** Safe error category ONLY — never a raw message (may echo query text). No secrets. */
export const safeErrorCategory = (outcome) => (outcome === QueryOutcome.TIMEOUT ? 'capability_timeout' : 'capability_error');
