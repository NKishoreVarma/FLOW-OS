/**
 * Phase 3 — deterministic coverage derivation test suite.
 * Tests: numbered cases 1-20 + property invariants A-G + raw examples + security.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { deriveCoverage, deriveCoverageResult } from '../../src/ai/reasoning/coverage.js';
import {
  QueryOutcome, Coverage, isCoverage,
  createEvidenceQuery, createEvidencePacket,
  evidenceCount,
  EvidenceContractError,
} from '../../src/contracts/evidence.js';

// ── Helpers ───────────────────────────────────────────────────────────────────
const WS = 'workspace_p3_test';

// Minimal plain-object query — deriveCoverage only reads .outcome and .resultIds.
const q = (outcome) => ({
  outcome,
  resultIds: outcome === QueryOutcome.OK ? ['id-1'] : [],
});

// Full contract query (validates the injectable path).
const cq = (outcome, over = {}) => createEvidenceQuery({
  capabilityId: 'engineering', source: 'github',
  outcome,
  resultIds: outcome === QueryOutcome.OK ? ['PR-100'] : [],
  workspaceId: WS,
  ...over,
});

// All seven QueryOutcome values.
const ALL_OUTCOMES = Object.values(QueryOutcome);

// ── Numbered cases ────────────────────────────────────────────────────────────

describe('Phase 3 — deriveCoverage: numbered cases', () => {

  it('1. [] → NONE (no queries at all)', () => {
    assert.equal(deriveCoverage([]), Coverage.NONE);
  });

  it('2. [OK] → COMPLETE', () => {
    assert.equal(deriveCoverage([q(QueryOutcome.OK)]), Coverage.COMPLETE);
  });

  it('3. [EMPTY] → COMPLETE (searched, found nothing — not a gap)', () => {
    assert.equal(deriveCoverage([q(QueryOutcome.EMPTY)]), Coverage.COMPLETE);
  });

  it('4. [SKIPPED_NO_PERMISSION] → COMPLETE (no enumeration side-channel)', () => {
    assert.equal(deriveCoverage([q(QueryOutcome.SKIPPED_NO_PERMISSION)]), Coverage.COMPLETE);
  });

  it('5. [SKIPPED_BY_PLAN only] → NONE (no attempted queries)', () => {
    assert.equal(deriveCoverage([q(QueryOutcome.SKIPPED_BY_PLAN)]), Coverage.NONE);
  });

  it('6. [OK, EMPTY] → COMPLETE', () => {
    assert.equal(deriveCoverage([q(QueryOutcome.OK), q(QueryOutcome.EMPTY)]), Coverage.COMPLETE);
  });

  it('7. [OK, SKIPPED_NO_PERMISSION] → COMPLETE', () => {
    assert.equal(deriveCoverage([q(QueryOutcome.OK), q(QueryOutcome.SKIPPED_NO_PERMISSION)]), Coverage.COMPLETE);
  });

  it('8. [OK, FAILED] → PARTIAL', () => {
    assert.equal(deriveCoverage([q(QueryOutcome.OK), q(QueryOutcome.FAILED)]), Coverage.PARTIAL);
  });

  it('9. [OK, TIMEOUT] → PARTIAL', () => {
    assert.equal(deriveCoverage([q(QueryOutcome.OK), q(QueryOutcome.TIMEOUT)]), Coverage.PARTIAL);
  });

  it('10. [OK, SKIPPED_NOT_CONNECTED] → PARTIAL', () => {
    assert.equal(deriveCoverage([q(QueryOutcome.OK), q(QueryOutcome.SKIPPED_NOT_CONNECTED)]), Coverage.PARTIAL);
  });

  it('11. [FAILED, TIMEOUT] → PARTIAL (both are gaps, none successful)', () => {
    assert.equal(deriveCoverage([q(QueryOutcome.FAILED), q(QueryOutcome.TIMEOUT)]), Coverage.PARTIAL);
  });

  it('12. [EMPTY, SKIPPED_NOT_CONNECTED] → PARTIAL', () => {
    assert.equal(deriveCoverage([q(QueryOutcome.EMPTY), q(QueryOutcome.SKIPPED_NOT_CONNECTED)]), Coverage.PARTIAL);
  });

  it('13. [SKIPPED_BY_PLAN, OK] → COMPLETE (planned skip does not count against coverage)', () => {
    assert.equal(deriveCoverage([q(QueryOutcome.SKIPPED_BY_PLAN), q(QueryOutcome.OK)]), Coverage.COMPLETE);
  });

  it('14. [SKIPPED_BY_PLAN, EMPTY] → COMPLETE', () => {
    assert.equal(deriveCoverage([q(QueryOutcome.SKIPPED_BY_PLAN), q(QueryOutcome.EMPTY)]), Coverage.COMPLETE);
  });

  it('15. all planned capabilities SKIPPED_BY_PLAN → NONE', () => {
    const all = ALL_OUTCOMES.map(() => q(QueryOutcome.SKIPPED_BY_PLAN));
    assert.equal(deriveCoverage(all), Coverage.NONE);
  });

  it('16. COMPLETE with evidenceCount = 0 is valid', () => {
    const qs = [q(QueryOutcome.EMPTY), q(QueryOutcome.SKIPPED_NO_PERMISSION)];
    assert.equal(deriveCoverage(qs), Coverage.COMPLETE);
    // evidenceCount via deriveCoverageResult
    const r = deriveCoverageResult(qs);
    assert.equal(r.coverage, Coverage.COMPLETE);
    assert.equal(r.evidenceCount, 0);
  });

  it('17. COMPLETE with many evidence records is valid', () => {
    const ok1 = { outcome: QueryOutcome.OK, resultIds: ['a', 'b', 'c'] };
    const ok2 = { outcome: QueryOutcome.OK, resultIds: ['d', 'e'] };
    const qs = [ok1, ok2, q(QueryOutcome.EMPTY)];
    assert.equal(deriveCoverage(qs), Coverage.COMPLETE);
    const r = deriveCoverageResult(qs);
    assert.equal(r.evidenceCount, 5);
  });

  it('18. determinism: repeated runs on identical input produce identical results', () => {
    const qs = [q(QueryOutcome.OK), q(QueryOutcome.EMPTY), q(QueryOutcome.SKIPPED_BY_PLAN), q(QueryOutcome.FAILED)];
    const results = Array.from({ length: 10 }, () => deriveCoverage(qs));
    assert.ok(results.every(r => r === Coverage.PARTIAL), 'all runs must agree');
  });

  it('19. input immutability: deriveCoverage must not mutate EvidenceQuery[]', () => {
    const arr = [q(QueryOutcome.OK), q(QueryOutcome.EMPTY)];
    const originalLength = arr.length;
    const outcomes = arr.map(x => x.outcome);
    deriveCoverage(arr);
    assert.equal(arr.length, originalLength, 'array length must not change');
    for (let i = 0; i < arr.length; i++) {
      assert.equal(arr[i].outcome, outcomes[i], `element ${i} outcome must not change`);
    }
  });

  it('19b. input immutability with frozen EvidenceQuery objects (real contract)', () => {
    const arr = [cq(QueryOutcome.OK), cq(QueryOutcome.EMPTY)];
    const outcomes = arr.map(x => x.outcome);
    deriveCoverage(arr);
    assert.deepEqual(arr.map(x => x.outcome), outcomes);
  });

  it('20. malformed query outcome (not in QueryOutcome enum) → fail closed, throw', () => {
    assert.throws(() => deriveCoverage([{ outcome: 'MAYBE', resultIds: [] }]), /unknown outcome/);
    assert.throws(() => deriveCoverage([{ outcome: null, resultIds: [] }]), /unknown outcome/);
    assert.throws(() => deriveCoverage([{ outcome: undefined, resultIds: [] }]), /unknown outcome/);
    assert.throws(() => deriveCoverage([{ outcome: '', resultIds: [] }]), /unknown outcome/);
    assert.throws(() => deriveCoverage([{ outcome: 'COMPLETE', resultIds: [] }]), /unknown outcome/);
  });

  it('20b. null/non-object element → fail closed, throw', () => {
    assert.throws(() => deriveCoverage([null]), TypeError);
    assert.throws(() => deriveCoverage(['OK']), TypeError);
    assert.throws(() => deriveCoverage([42]), TypeError);
  });

  it('20c. non-array input → fail closed, throw', () => {
    assert.throws(() => deriveCoverage(null), TypeError);
    assert.throws(() => deriveCoverage(undefined), TypeError);
    assert.throws(() => deriveCoverage('OK'), TypeError);
    assert.throws(() => deriveCoverage({ outcome: 'OK' }), TypeError);
  });

});

// ── Property invariants ───────────────────────────────────────────────────────

describe('Phase 3 — deriveCoverage: property invariants', () => {

  it('A. adding SKIPPED_BY_PLAN never reduces coverage', () => {
    const bases = [
      [q(QueryOutcome.OK)],
      [q(QueryOutcome.EMPTY)],
      [q(QueryOutcome.OK), q(QueryOutcome.FAILED)],
    ];
    for (const base of bases) {
      const without = deriveCoverage(base);
      const with_skip = deriveCoverage([...base, q(QueryOutcome.SKIPPED_BY_PLAN)]);
      assert.equal(with_skip, without, `adding SKIPPED_BY_PLAN to ${JSON.stringify(base.map(x => x.outcome))} changed coverage`);
    }
  });

  it('B. adding EMPTY to a COMPLETE attempted set must not reduce coverage', () => {
    const base = [q(QueryOutcome.OK), q(QueryOutcome.SKIPPED_NO_PERMISSION)];
    assert.equal(deriveCoverage(base), Coverage.COMPLETE);
    assert.equal(deriveCoverage([...base, q(QueryOutcome.EMPTY)]), Coverage.COMPLETE);
  });

  it('C. adding FAILED to COMPLETE must produce PARTIAL', () => {
    const base = [q(QueryOutcome.OK), q(QueryOutcome.EMPTY)];
    assert.equal(deriveCoverage(base), Coverage.COMPLETE);
    assert.equal(deriveCoverage([...base, q(QueryOutcome.FAILED)]), Coverage.PARTIAL);
  });

  it('D. adding TIMEOUT to COMPLETE must produce PARTIAL', () => {
    const base = [q(QueryOutcome.OK)];
    assert.equal(deriveCoverage(base), Coverage.COMPLETE);
    assert.equal(deriveCoverage([...base, q(QueryOutcome.TIMEOUT)]), Coverage.PARTIAL);
  });

  it('E. removing all attempted queries must produce NONE', () => {
    // Retain only SKIPPED_BY_PLAN entries.
    const qs = [q(QueryOutcome.OK), q(QueryOutcome.SKIPPED_BY_PLAN)];
    assert.equal(deriveCoverage(qs), Coverage.COMPLETE);
    assert.equal(deriveCoverage([q(QueryOutcome.SKIPPED_BY_PLAN)]), Coverage.NONE);
    assert.equal(deriveCoverage([]), Coverage.NONE);
  });

  it('F. reordering queries must never change coverage', () => {
    const original = [
      q(QueryOutcome.OK),
      q(QueryOutcome.EMPTY),
      q(QueryOutcome.SKIPPED_BY_PLAN),
      q(QueryOutcome.FAILED),
    ];
    const expected = deriveCoverage(original);
    const permutations = [
      [original[2], original[0], original[3], original[1]],
      [original[3], original[2], original[1], original[0]],
      [original[1], original[3], original[0], original[2]],
    ];
    for (const perm of permutations) {
      assert.equal(deriveCoverage(perm), expected, 'reordering changed coverage');
    }
  });

  it('G. duplicate queries must not cause nondeterministic results', () => {
    const qs = [q(QueryOutcome.OK), q(QueryOutcome.OK), q(QueryOutcome.EMPTY)];
    const r1 = deriveCoverage(qs);
    const r2 = deriveCoverage([...qs, ...qs]);  // doubled
    assert.equal(r1, Coverage.COMPLETE);
    assert.equal(r2, Coverage.COMPLETE);
    // Duplicating a gap stays PARTIAL.
    const gapped = [q(QueryOutcome.OK), q(QueryOutcome.FAILED)];
    assert.equal(deriveCoverage([...gapped, ...gapped]), Coverage.PARTIAL);
  });

});

// ── Raw examples ──────────────────────────────────────────────────────────────

describe('Phase 3 — raw proof examples', () => {

  it('EXAMPLE 1: GitHub OK + Calendar EMPTY + Slack SKIPPED_BY_PLAN → COMPLETE', () => {
    const qs = [
      { outcome: QueryOutcome.OK,           resultIds: ['PR-1'] },
      { outcome: QueryOutcome.EMPTY,         resultIds: [] },
      { outcome: QueryOutcome.SKIPPED_BY_PLAN, resultIds: [] },
    ];
    assert.equal(deriveCoverage(qs), Coverage.COMPLETE);
    const r = deriveCoverageResult(qs);
    assert.equal(r.coverage, Coverage.COMPLETE);
    assert.equal(r.attemptedCount, 2);   // Slack excluded
    assert.equal(r.gapCount, 0);
    assert.equal(r.evidenceCount, 1);
  });

  it('EXAMPLE 2: GitHub OK + Slack SKIPPED_NOT_CONNECTED → PARTIAL', () => {
    const qs = [
      { outcome: QueryOutcome.OK,                  resultIds: ['PR-2'] },
      { outcome: QueryOutcome.SKIPPED_NOT_CONNECTED, resultIds: [] },
    ];
    assert.equal(deriveCoverage(qs), Coverage.PARTIAL);
    const r = deriveCoverageResult(qs);
    assert.equal(r.coverage, Coverage.PARTIAL);
    assert.equal(r.attemptedCount, 2);
    assert.equal(r.gapCount, 1);
  });

  it('EXAMPLE 3: GitHub EMPTY + Calendar EMPTY → COMPLETE, evidenceCount=0', () => {
    const qs = [
      { outcome: QueryOutcome.EMPTY, resultIds: [] },
      { outcome: QueryOutcome.EMPTY, resultIds: [] },
    ];
    assert.equal(deriveCoverage(qs), Coverage.COMPLETE);
    const r = deriveCoverageResult(qs);
    assert.equal(r.coverage, Coverage.COMPLETE);
    assert.equal(r.evidenceCount, 0);
    assert.equal(r.gapCount, 0);
  });

  it('EXAMPLE 4: all capabilities SKIPPED_BY_PLAN → NONE', () => {
    const qs = ALL_OUTCOMES.map(() => ({ outcome: QueryOutcome.SKIPPED_BY_PLAN, resultIds: [] }));
    assert.equal(deriveCoverage(qs), Coverage.NONE);
    const r = deriveCoverageResult(qs);
    assert.equal(r.coverage, Coverage.NONE);
    assert.equal(r.attemptedCount, 0);
  });

});

// ── Integration with evidence contract ───────────────────────────────────────

describe('Phase 3 — injectable into createEvidencePacket', () => {

  it('deriveCoverage is a valid deriver for createEvidencePacket', () => {
    const qs = [cq(QueryOutcome.OK), cq(QueryOutcome.EMPTY)];
    const packet = createEvidencePacket(
      { question: 'What PRs are open?', queries: qs, workspaceId: WS },
      { deriveCoverage },
    );
    assert.ok(isCoverage(packet.coverage), 'coverage must be a valid Coverage value');
    assert.equal(packet.coverage, Coverage.COMPLETE);
  });

  it('PARTIAL coverage wired through the packet contract', () => {
    const qs = [cq(QueryOutcome.OK), cq(QueryOutcome.FAILED)];
    const packet = createEvidencePacket(
      { question: 'q', queries: qs, workspaceId: WS },
      { deriveCoverage },
    );
    assert.equal(packet.coverage, Coverage.PARTIAL);
  });

  it('NONE coverage when only SKIPPED_BY_PLAN queries', () => {
    const qs = [cq(QueryOutcome.SKIPPED_BY_PLAN)];
    const packet = createEvidencePacket(
      { question: 'q', queries: qs, workspaceId: WS },
      { deriveCoverage },
    );
    assert.equal(packet.coverage, Coverage.NONE);
  });

  it('COMPLETE + zero evidence round-trips through the packet', () => {
    const qs = [cq(QueryOutcome.EMPTY)];
    const packet = createEvidencePacket(
      { question: 'q', queries: qs, workspaceId: WS },
      { deriveCoverage },
    );
    assert.equal(packet.coverage, Coverage.COMPLETE);
    // evidenceCount is SEPARATE from coverage — must be 0.
    assert.equal(evidenceCount(packet), 0);
  });

});

// ── Security: no user-visible side-channel for SKIPPED_NO_PERMISSION ─────────

describe('Phase 3 — SKIPPED_NO_PERMISSION: no enumeration side-channel', () => {

  it('SKIPPED_NO_PERMISSION does not produce a coverage gap (same coverage as EMPTY)', () => {
    const withEmpty = deriveCoverage([q(QueryOutcome.OK), q(QueryOutcome.EMPTY)]);
    const withPerm  = deriveCoverage([q(QueryOutcome.OK), q(QueryOutcome.SKIPPED_NO_PERMISSION)]);
    assert.equal(withEmpty, Coverage.COMPLETE);
    assert.equal(withPerm,  Coverage.COMPLETE);
    assert.equal(withEmpty, withPerm, 'SKIPPED_NO_PERMISSION and EMPTY produce identical coverage');
  });

  it('SKIPPED_NO_PERMISSION outcome is preserved in the queries array for provenance', () => {
    const qs = [cq(QueryOutcome.SKIPPED_NO_PERMISSION)];
    const r = deriveCoverageResult(qs);
    assert.equal(r.queries[0].outcome, QueryOutcome.SKIPPED_NO_PERMISSION, 'raw outcome retained');
    assert.equal(r.coverage, Coverage.COMPLETE, 'external coverage hides the distinction');
  });

  it('all-SKIPPED_NO_PERMISSION is COMPLETE, not NONE (were attempted — knew the answer: denied)', () => {
    assert.equal(deriveCoverage([q(QueryOutcome.SKIPPED_NO_PERMISSION), q(QueryOutcome.SKIPPED_NO_PERMISSION)]), Coverage.COMPLETE);
  });

});

// ── deriveCoverageResult ──────────────────────────────────────────────────────

describe('Phase 3 — deriveCoverageResult shape and invariants', () => {

  it('coverage field is always derived, never caller-supplied', () => {
    const r = deriveCoverageResult([q(QueryOutcome.EMPTY)]);
    assert.ok(isCoverage(r.coverage));
    // Result is frozen — callers cannot assign coverage.
    assert.throws(() => { r.coverage = 'NONE'; }, TypeError);
  });

  it('attemptedCount excludes SKIPPED_BY_PLAN', () => {
    const qs = [
      q(QueryOutcome.OK),
      q(QueryOutcome.SKIPPED_BY_PLAN),
      q(QueryOutcome.EMPTY),
      q(QueryOutcome.SKIPPED_BY_PLAN),
    ];
    const r = deriveCoverageResult(qs);
    assert.equal(r.attemptedCount, 2);
  });

  it('gapCount counts only FAILED + TIMEOUT + SKIPPED_NOT_CONNECTED', () => {
    const qs = [
      q(QueryOutcome.OK),
      q(QueryOutcome.FAILED),
      q(QueryOutcome.TIMEOUT),
      q(QueryOutcome.SKIPPED_NOT_CONNECTED),
      q(QueryOutcome.SKIPPED_BY_PLAN),
    ];
    const r = deriveCoverageResult(qs);
    assert.equal(r.gapCount, 3);
    assert.equal(r.coverage, Coverage.PARTIAL);
  });

  it('evidenceCount counts resultIds across all queries (only OK carries them)', () => {
    const qs = [
      { outcome: QueryOutcome.OK,    resultIds: ['a', 'b'] },
      { outcome: QueryOutcome.OK,    resultIds: ['c'] },
      { outcome: QueryOutcome.EMPTY, resultIds: [] },
    ];
    const r = deriveCoverageResult(qs);
    assert.equal(r.evidenceCount, 3);
  });

  it('queries reference is preserved (not re-copied; the original array items are reachable)', () => {
    const qs = [cq(QueryOutcome.OK)];
    const r = deriveCoverageResult(qs);
    assert.equal(r.queries, qs, 'queries reference must be the same array');
  });

});
