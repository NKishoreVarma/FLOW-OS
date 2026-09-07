import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  QueryOutcome, Freshness, Coverage,
  isQueryOutcome, isFreshness, isCoverage,
  createEvidenceQuery, createClaim, createEvidencePacket, evidenceCount,
  EvidenceContractError,
} from '../../src/contracts/evidence.js';

const WS = 'workspace_test';
const okQuery = (over = {}) => createEvidenceQuery({ capabilityId: 'engineering', source: 'github', outcome: QueryOutcome.OK, resultIds: ['PR-247'], workspaceId: WS, ...over });

describe('evidence contract — enums', () => {
  it('has the 7 distinct QueryOutcome states', () => {
    const vals = Object.values(QueryOutcome);
    assert.equal(vals.length, 7);
    assert.equal(new Set(vals).size, 7);
    for (const s of ['OK','EMPTY','FAILED','TIMEOUT','SKIPPED_NOT_CONNECTED','SKIPPED_NO_PERMISSION','SKIPPED_BY_PLAN']) assert.ok(isQueryOutcome(s));
  });
  it('Freshness + Coverage guards', () => {
    for (const f of ['CURRENT','RECENT','STALE','UNKNOWN']) assert.ok(isFreshness(f));
    for (const c of ['COMPLETE','PARTIAL','NONE']) assert.ok(isCoverage(c));
    assert.equal(isQueryOutcome('MAYBE'), false);
  });
});

describe('EvidenceQuery — required fields + validation', () => {
  it('requires capabilityId, source, workspaceId, outcome', () => {
    assert.throws(() => createEvidenceQuery({ source: 'github', outcome: 'OK', workspaceId: WS }), EvidenceContractError);       // no capabilityId
    assert.throws(() => createEvidenceQuery({ capabilityId: 'engineering', outcome: 'OK', workspaceId: WS }), EvidenceContractError); // no source
    assert.throws(() => createEvidenceQuery({ capabilityId: 'engineering', source: 'github', outcome: 'OK' }), EvidenceContractError); // no workspaceId
    assert.throws(() => createEvidenceQuery({ capabilityId: 'engineering', source: 'github', outcome: 'NOPE', workspaceId: WS }), EvidenceContractError); // bad outcome
  });
  it('all 7 outcomes construct', () => {
    for (const o of Object.values(QueryOutcome)) {
      const q = createEvidenceQuery({ capabilityId: 'c', source: 's', outcome: o, workspaceId: WS });
      assert.equal(q.outcome, o);
    }
  });
  it('resultIds associate only with OK; non-OK carrying results is rejected', () => {
    assert.equal(okQuery().resultIds[0], 'PR-247');
    assert.throws(() => createEvidenceQuery({ capabilityId: 'c', source: 's', outcome: QueryOutcome.EMPTY, resultIds: ['x'], workspaceId: WS }), EvidenceContractError);
  });
  it('is immutable', () => {
    const q = okQuery();
    assert.throws(() => { q.outcome = 'EMPTY'; }, TypeError);
  });
});

describe('EvidencePacket — coverage is derived, never assigned', () => {
  it('rejects a hand-supplied coverage', () => {
    assert.throws(() => createEvidencePacket({ question: 'q', queries: [], workspaceId: WS, coverage: 'COMPLETE' }), /derived, never assigned/);
  });
  it('coverage is null without an injected deriver, derived when injected', () => {
    const p1 = createEvidencePacket({ question: 'q', queries: [okQuery()], workspaceId: WS });
    assert.equal(p1.coverage, null);
    const deriver = (qs) => qs.length ? Coverage.COMPLETE : Coverage.NONE;
    const p2 = createEvidencePacket({ question: 'q', queries: [okQuery()], workspaceId: WS }, { deriveCoverage: deriver });
    assert.equal(p2.coverage, Coverage.COMPLETE);
  });
  it('rejects a deriver that returns a non-Coverage value', () => {
    assert.throws(() => createEvidencePacket({ question: 'q', queries: [okQuery()], workspaceId: WS }, { deriveCoverage: () => 'MOSTLY' }), EvidenceContractError);
  });
  it('COMPLETE coverage with zero evidence is valid (checked everything, found nothing)', () => {
    const empty = createEvidenceQuery({ capabilityId: 'engineering', source: 'github', outcome: QueryOutcome.EMPTY, workspaceId: WS });
    const deriver = () => Coverage.COMPLETE;
    const p = createEvidencePacket({ question: 'q', queries: [empty], workspaceId: WS }, { deriveCoverage: deriver });
    assert.equal(p.coverage, Coverage.COMPLETE);
    assert.equal(evidenceCount(p), 0);          // evidenceCount is SEPARATE from coverage
  });
});

describe('EvidencePacket — workspace integrity (tenant safety)', () => {
  it('rejects a cross-workspace query (never silently merged)', () => {
    const foreign = createEvidenceQuery({ capabilityId: 'engineering', source: 'github', outcome: QueryOutcome.OK, resultIds: ['X'], workspaceId: 'workspace_OTHER' });
    assert.throws(() => createEvidencePacket({ question: 'q', queries: [foreign], workspaceId: WS }), /cross-workspace/);
  });
  it('rejects a malformed query object', () => {
    assert.throws(() => createEvidencePacket({ question: 'q', queries: [{ foo: 'bar' }], workspaceId: WS }), /malformed/);
  });
  it('requires FLOW-controlled workspaceId', () => {
    assert.throws(() => createEvidencePacket({ question: 'q', queries: [] }), /workspaceId required/);
  });
});

describe('EvidencePacket — claims reference real evidence (no phantom ids)', () => {
  it('accepts a claim whose evidenceIds exist in the packet', () => {
    const p = createEvidencePacket({ question: 'q', queries: [okQuery()], claims: [createClaim({ id: 'c1', text: 'PR authored', evidenceIds: ['PR-247'] })], workspaceId: WS });
    assert.equal(p.claims[0].evidenceIds[0], 'PR-247');
  });
  it('rejects a claim referencing a phantom evidence id', () => {
    assert.throws(() => createEvidencePacket({ question: 'q', queries: [okQuery()], claims: [createClaim({ id: 'c1', text: 'x', evidenceIds: ['GHOST-1'] })], workspaceId: WS }), /unknown evidence id/);
  });
});

describe('evidence contract — security (no secrets/credentials)', () => {
  it('rejects a query carrying a credential-like field', () => {
    assert.throws(() => createEvidenceQuery({ capabilityId: 'c', source: 's', outcome: 'OK', workspaceId: WS, access_token: 'ya29.abc' }), EvidenceContractError);
  });
  it('rejects a token-shaped value smuggled into a string field', () => {
    assert.throws(() => createEvidenceQuery({ capabilityId: 'c', source: 'ghp_realsecrettoken1234567890', outcome: 'OK', workspaceId: WS }), EvidenceContractError);
  });
  it('does not accept workspaceId from a non-string (LLM payload cannot override)', () => {
    assert.throws(() => createEvidencePacket({ question: 'q', queries: [], workspaceId: { $override: true } }), /workspaceId required/);
  });
});
