import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mapResultOutcome, outcomeFromError, classifyFreshness } from '../../src/ai/reasoning/dispatchOutcomes.js';
import { QueryOutcome, Freshness, createEvidenceQuery, EvidenceContractError } from '../../src/contracts/evidence.js';

describe('Phase 2 — outcome mapping (pure)', () => {
  it('A. records → OK with resultIds', () => {
    const r = mapResultOutcome({ count: 2, records: [{ id: 'PR-247' }, { id: 'PR-248' }] });
    assert.equal(r.outcome, QueryOutcome.OK);
    assert.deepEqual(r.resultIds, ['PR-247', 'PR-248']);
  });
  it('B. zero records → EMPTY (distinct from skipped)', () => {
    const r = mapResultOutcome({ count: 0, records: [] });
    assert.equal(r.outcome, QueryOutcome.EMPTY);
    assert.deepEqual(r.resultIds, []);
  });
  it('C. not-connected signal → SKIPPED_NOT_CONNECTED', () => {
    assert.equal(mapResultOutcome({ __skipped: 'not_connected' }).outcome, QueryOutcome.SKIPPED_NOT_CONNECTED);
  });
  it('D. permission signal → SKIPPED_NO_PERMISSION', () => {
    assert.equal(mapResultOutcome({ __skipped: 'no_permission' }).outcome, QueryOutcome.SKIPPED_NO_PERMISSION);
  });
  it('E. thrown error → FAILED', () => {
    assert.equal(outcomeFromError(new Error('db down')), QueryOutcome.FAILED);
  });
  it('F. timeout error → TIMEOUT (distinct from FAILED/EMPTY)', () => {
    const e = new Error('capability timeout'); e.__timeout = true;
    assert.equal(outcomeFromError(e), QueryOutcome.TIMEOUT);
  });
  it('L. resultIds populate ONLY for OK; never for EMPTY/skipped', () => {
    assert.deepEqual(mapResultOutcome({ count: 0, records: [] }).resultIds, []);
    assert.deepEqual(mapResultOutcome({ __skipped: 'not_connected' }).resultIds, []);
    assert.deepEqual(mapResultOutcome({ count: 1, records: [{ id: 'X' }] }).resultIds, ['X']);
    // records with no id contribute count but not fabricated ids
    assert.deepEqual(mapResultOutcome({ count: 1, records: [{ name: 'no-id' }] }).resultIds, []);
  });
});

describe('Phase 2 — freshness (pure, from real sync state)', () => {
  const now = Date.parse('2026-08-31T12:00:00Z');
  it('H. <15 min → CURRENT', () => assert.equal(classifyFreshness('2026-08-31T11:50:00Z', now), Freshness.CURRENT));
  it('I. <24h → RECENT',    () => assert.equal(classifyFreshness('2026-08-31T02:00:00Z', now), Freshness.RECENT));
  it('J. ≥24h → STALE',     () => assert.equal(classifyFreshness('2026-08-28T12:00:00Z', now), Freshness.STALE));
  it('K. no sync record → UNKNOWN (never silently CURRENT)', () => {
    assert.equal(classifyFreshness(null, now), Freshness.UNKNOWN);
    assert.equal(classifyFreshness(undefined, now), Freshness.UNKNOWN);
    assert.equal(classifyFreshness('not-a-date', now), Freshness.UNKNOWN);
  });
});

describe('Phase 2 — security (no secret can enter an EvidenceQuery error)', () => {
  it('O. a token-shaped error is rejected by the contract', () => {
    assert.throws(() => createEvidenceQuery({ capabilityId: 'c', source: 's', outcome: QueryOutcome.FAILED, workspaceId: 'w', error: 'Bearer ya29.supersecrettoken1234567890' }), EvidenceContractError);
  });
  it('safe error category is accepted', () => {
    const q = createEvidenceQuery({ capabilityId: 'c', source: 's', outcome: QueryOutcome.FAILED, workspaceId: 'w', error: 'capability_error' });
    assert.equal(q.error, 'capability_error');
  });
});
