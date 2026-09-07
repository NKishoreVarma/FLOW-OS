/**
 * evidencePacket.test.js — Phase 5 unit tests.
 *
 * Tests A-T (spec-required) + adversarial tests 1-10 (LLM-output verification).
 *
 * Does NOT make network calls, DB calls, or LLM calls.
 * Uses the same `node:test` + `node:assert/strict` pattern as Phase 1-3 suites.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildEvidenceItem,
  buildEvidencePacket,
  formatEvidenceForPrompt,
} from '../../src/ai/reasoning/evidencePacket.js';

import {
  extractEvidenceMarkers,
  verifyEvidenceIds,
  verifyClaimFreshness,
  verifyNegativeScope,
  verifyOverbreadNegation,
  verifyUncitedClaims,
  humanize,
  verifyAfterHumanize,
  runPhase5Verification,
} from '../../src/ai/reasoning/evidenceVerifier.js';

import {
  createEvidenceQuery,
  QueryOutcome,
  Freshness,
  Coverage,
  EvidenceContractError,
} from '../../src/contracts/evidence.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const WS = 'test_workspace_001';
const Q  = 'Who authored PR-247?';

function mkQuery(overrides = {}) {
  return createEvidenceQuery({
    capabilityId: 'engineering',
    source: 'github',
    outcome: QueryOutcome.OK,
    freshness: Freshness.CURRENT,
    workspaceId: WS,
    resultIds: ['PR-247'],
    ...overrides,
  });
}

function mkItem(overrides = {}) {
  return {
    content: 'PR-247 authored by Jordan Lee, status OPEN, repo helios-backend',
    source: 'github',
    capType: 'PR',
    type: 'PR',
    ts: new Date('2026-08-14').toISOString(),
    score: 0.95,
    authority: 1.2,
    metadata: { id: 'PR-247', author: 'Jordan Lee' },
    ...overrides,
  };
}

function mkPacket(queryOverrides = {}, itemOverrides = {}, extraItems = []) {
  const queries = [mkQuery(queryOverrides)];
  const items   = [mkItem(itemOverrides), ...extraItems];
  return buildEvidencePacket(WS, Q, { domain: 'engineering' }, queries, items);
}

// ── A: Evidence IDs deterministic ────────────────────────────────────────────

describe('A: evidence IDs are deterministic', () => {
  it('same input produces same IDs across two calls', () => {
    const queries = [mkQuery()];
    const items   = [mkItem()];
    const p1 = buildEvidencePacket(WS, Q, {}, queries, items);
    const p2 = buildEvidencePacket(WS, Q, {}, queries, items);
    assert.deepEqual(p1.items.map(i => i.id), p2.items.map(i => i.id));
    assert.equal(p1.items[0].id, 'e1');
  });
});

// ── B: IDs unique within packet ───────────────────────────────────────────────

describe('B: evidence IDs unique within packet', () => {
  it('multi-item packet has no duplicate IDs', () => {
    const queries = [mkQuery(), mkQuery({ capabilityId: 'incidents', source: 'incidents', resultIds: ['INC-001'] })];
    const items   = [mkItem(), mkItem({ content: 'INC-001 opened, severity P1', source: 'incidents', metadata: { id: 'INC-001' } })];
    const packet  = buildEvidencePacket(WS, Q, {}, queries, items);
    const ids = packet.items.map(i => i.id);
    assert.equal(new Set(ids).size, ids.length);
  });
});

// ── C: Evidence ID maps to source/result ─────────────────────────────────────

describe('C: evidence ID maps to source and result', () => {
  it('e1 has a source and provenance.resultId', () => {
    const p = mkPacket();
    assert.equal(p.items[0].id, 'e1');
    assert.ok(p.items[0].source, 'source must be present');
    assert.ok(p.items[0].provenance, 'provenance must be present');
    assert.equal(p.items[0].provenance.resultId, 'PR-247');
  });
});

// ── D: Packet contains correct workspaceId ───────────────────────────────────

describe('D: packet workspaceId is the FLOW-controlled arg', () => {
  it('packet.workspaceId equals the passed workspaceId', () => {
    const p = mkPacket();
    assert.equal(p.workspaceId, WS);
  });
});

// ── E: Packet rejects mismatched workspace evidence ──────────────────────────

describe('E: cross-workspace evidence rejected', () => {
  it('throws EvidenceContractError when a query belongs to a different workspace', () => {
    const badQuery = createEvidenceQuery({
      capabilityId: 'engineering', source: 'github', outcome: QueryOutcome.EMPTY,
      freshness: Freshness.UNKNOWN, workspaceId: 'workspace_EVIL', resultIds: [],
    });
    assert.throws(
      () => buildEvidencePacket(WS, Q, {}, [badQuery], []),
      EvidenceContractError,
    );
  });
});

// ── F: Packet preserves query outcomes ───────────────────────────────────────

describe('F: query outcomes preserved in packet', () => {
  it('EMPTY outcome is retained on the packet query', () => {
    const q = mkQuery({ outcome: QueryOutcome.EMPTY, resultIds: [] });
    const p = buildEvidencePacket(WS, Q, {}, [q], []);
    assert.equal(p.queries[0].outcome, QueryOutcome.EMPTY);
  });

  it('FAILED outcome is retained', () => {
    const q = mkQuery({ outcome: QueryOutcome.FAILED, resultIds: [], error: 'timeout' });
    const p = buildEvidencePacket(WS, Q, {}, [q], []);
    assert.equal(p.queries[0].outcome, QueryOutcome.FAILED);
  });
});

// ── G: Packet preserves coverage ─────────────────────────────────────────────

describe('G: coverage derived from queries and preserved', () => {
  it('OK query → COMPLETE coverage', () => {
    const p = mkPacket();
    assert.equal(p.coverage, Coverage.COMPLETE);
  });

  it('SKIPPED_NOT_CONNECTED query → PARTIAL coverage', () => {
    const q = mkQuery({ outcome: QueryOutcome.SKIPPED_NOT_CONNECTED, resultIds: [] });
    const p = buildEvidencePacket(WS, Q, {}, [q], []);
    assert.equal(p.coverage, Coverage.PARTIAL);
  });

  it('empty queries → NONE coverage', () => {
    const p = buildEvidencePacket(WS, Q, {}, [], []);
    assert.equal(p.coverage, Coverage.NONE);
  });
});

// ── H: Packet preserves freshness ────────────────────────────────────────────

describe('H: freshness preserved on queries and items', () => {
  it('STALE query freshness is retained on the query', () => {
    const q = mkQuery({ freshness: Freshness.STALE });
    const p = buildEvidencePacket(WS, Q, {}, [q], [mkItem()]);
    assert.equal(p.queries[0].freshness, Freshness.STALE);
  });

  it('STALE freshness propagates to the matched item', () => {
    const q = mkQuery({ freshness: Freshness.STALE });
    const p = buildEvidencePacket(WS, Q, {}, [q], [mkItem()]);
    assert.equal(p.items[0].freshness, Freshness.STALE);
  });
});

// ── I: Packet contains no credentials ────────────────────────────────────────

describe('I: no credentials in evidence content', () => {
  it('OAuth bearer token in content is redacted', () => {
    const item = mkItem({ content: 'PR comment: Bearer ya29.A0ARrdaM auth header present' });
    const q = mkQuery();
    const p = buildEvidencePacket(WS, Q, {}, [q], [item]);
    const content = (p.items[0] || {}).content || '';
    assert.ok(!content.includes('ya29.'), 'bearer token must be redacted');
    assert.ok(!content.includes('Bearer ya29'), 'full bearer header must be redacted');
  });

  it('GitHub PAT in content is redacted', () => {
    const item = mkItem({ content: 'Auth token: ghp_abc1234567890abcdef is the PAT' });
    const q = mkQuery();
    const p = buildEvidencePacket(WS, Q, {}, [q], [item]);
    const content = (p.items[0] || {}).content || '';
    assert.ok(!content.includes('ghp_abc'), 'GitHub PAT must be redacted');
  });
});

// ── J: Packet contains no authorization headers ───────────────────────────────

describe('J: authorization header values are rejected from EvidenceQuery', () => {
  it('query input with an authorization key is rejected by createEvidenceQuery', () => {
    assert.throws(
      () => createEvidenceQuery({
        capabilityId: 'engineering', source: 'github', outcome: QueryOutcome.EMPTY,
        freshness: Freshness.UNKNOWN, workspaceId: WS, resultIds: [],
        authorization: 'Bearer ghp_secret',
      }),
      EvidenceContractError,
    );
  });
});

// ── K: Prompt contains only supplied evidence IDs ────────────────────────────

describe('K: formatEvidenceForPrompt contains only packet item IDs', () => {
  it('every marker in the formatted section is a real packet item ID', () => {
    const p = mkPacket();
    const section = formatEvidenceForPrompt(p);
    const markers = extractEvidenceMarkers(section);
    const known   = new Set(p.items.map(i => i.id));
    for (const m of markers) assert.ok(known.has(m), `${m} not in packet items`);
  });

  it('section does not invent extra IDs beyond the item count', () => {
    const p = mkPacket();
    const section = formatEvidenceForPrompt(p);
    const markers = extractEvidenceMarkers(section);
    assert.ok(markers.length <= p.items.length, 'marker count must not exceed item count');
  });
});

// ── L: Phantom evidence IDs are rejected ─────────────────────────────────────

describe('L: phantom evidence IDs are detected and rejected', () => {
  it('citing [e99] when only e1 exists → PHANTOM_IDS', () => {
    const p = mkPacket();
    const result = verifyEvidenceIds('Jordan authored PR-247. [e99]', p);
    assert.equal(result.status, 'PHANTOM_IDS');
    assert.ok(result.phantom.includes('e99'));
    assert.equal(result.valid.length, 0);
  });

  it('mixing valid and phantom → valid contains e1, phantom contains e9', () => {
    const p = mkPacket();
    const result = verifyEvidenceIds('Jordan authored PR-247. [e1] Also see [e9].', p);
    assert.equal(result.status, 'PHANTOM_IDS');
    assert.ok(result.valid.includes('e1'));
    assert.ok(result.phantom.includes('e9'));
  });
});

// ── M: Claim without evidence ID is rejected ─────────────────────────────────

describe('M: factual attribution claim without evidence ID is rejected', () => {
  it('attribution claim with no marker → UNCITED_CLAIM', () => {
    const p = mkPacket();
    const result = verifyUncitedClaims('Jordan Lee authored PR-247.', p);
    assert.equal(result.status, 'UNCITED_CLAIM');
    assert.ok(result.violations.length > 0);
  });

  it('attribution claim WITH a marker → PASS', () => {
    const p = mkPacket();
    // Marker must be within the sentence (before the period) — the citation convention.
    const result = verifyUncitedClaims('Jordan Lee authored PR-247 [e1].', p);
    assert.equal(result.status, 'PASS');
  });
});

// ── N: Valid claim with valid evidence ID passes ──────────────────────────────

describe('N: valid claim with valid evidence ID passes', () => {
  it('[e1] on a packet with e1 → PASS', () => {
    const p = mkPacket();
    const result = verifyEvidenceIds('Jordan authored PR-247. [e1]', p);
    assert.equal(result.status, 'PASS');
    assert.ok(result.valid.includes('e1'));
    assert.equal(result.phantom.length, 0);
  });
});

// ── O: Multiple evidence IDs work ────────────────────────────────────────────

describe('O: multiple valid evidence IDs work', () => {
  it('two valid IDs cited → PASS with both in valid[]', () => {
    const queries = [
      mkQuery({ resultIds: ['PR-247'] }),
      mkQuery({ capabilityId: 'incidents', source: 'incidents', resultIds: ['INC-001'] }),
    ];
    const items = [
      mkItem(),
      mkItem({ content: 'INC-001 P1 severity', source: 'incidents', metadata: { id: 'INC-001' } }),
    ];
    const p = buildEvidencePacket(WS, Q, {}, queries, items);
    const result = verifyEvidenceIds('Jordan authored PR-247 [e1] and incident INC-001 is critical [e2].', p);
    assert.equal(result.status, 'PASS');
    assert.ok(result.valid.includes('e1'));
    assert.ok(result.valid.includes('e2'));
  });
});

// ── P: Duplicate evidence IDs handled deterministically ──────────────────────

describe('P: duplicate markers collapse to unique set', () => {
  it('[e1] appearing twice is treated as one valid citation', () => {
    const p = mkPacket();
    const result = verifyEvidenceIds('Jordan [e1] authored PR-247 [e1].', p);
    assert.equal(result.status, 'PASS');
    assert.equal(result.valid.length, 1);
    assert.equal(result.valid[0], 'e1');
  });
});

// ── Q: Same evidence ordering produces same IDs ───────────────────────────────

describe('Q: ordering stability — same order = same IDs', () => {
  it('building the same packet twice returns the same item order', () => {
    const queries = [mkQuery()];
    const items   = [mkItem({ metadata: { id: 'PR-247' } })];
    const p1 = buildEvidencePacket(WS, Q, {}, queries, items);
    const p2 = buildEvidencePacket(WS, Q, {}, queries, items);
    assert.deepEqual(p1.items.map(i => i.id), p2.items.map(i => i.id));
    assert.deepEqual(p1.items.map(i => i.sourceId), p2.items.map(i => i.sourceId));
  });
});

// ── R: Reordered evidence changes IDs according to rank ──────────────────────

describe('R: reordered evidence changes which item gets e1', () => {
  it('swapping items swaps which content gets e1', () => {
    const i1 = mkItem({ content: 'PR-247 open', metadata: { id: 'PR-247' } });
    const i2 = mkItem({ content: 'INC-001 critical', source: 'incidents', metadata: { id: 'INC-001' } });
    const q  = [mkQuery()];
    const pA = buildEvidencePacket(WS, Q, {}, q, [i1, i2]);
    const pB = buildEvidencePacket(WS, Q, {}, q, [i2, i1]);
    assert.equal(pA.items[0].content, pB.items[1].content);
    assert.equal(pA.items[1].content, pB.items[0].content);
  });
});

// ── S: Evidence-less packet remains valid ─────────────────────────────────────

describe('S: evidence-less packet is valid (zero-evidence state)', () => {
  it('empty items + SKIPPED_BY_PLAN queries → valid packet with NONE coverage', () => {
    const q = createEvidenceQuery({
      capabilityId: 'engineering', source: 'github',
      outcome: QueryOutcome.SKIPPED_BY_PLAN, freshness: Freshness.UNKNOWN,
      workspaceId: WS, resultIds: [],
    });
    const p = buildEvidencePacket(WS, Q, {}, [q], []);
    assert.equal(p.items.length, 0);
    assert.equal(p.coverage, Coverage.NONE);
    assert.equal(p.workspaceId, WS);
  });

  it('verifyEvidenceIds on empty-item packet with no citations → PASS', () => {
    const p = buildEvidencePacket(WS, Q, {}, [], []);
    const result = verifyEvidenceIds('I checked but found nothing.', p);
    assert.equal(result.status, 'PASS');
  });
});

// ── T: Existing AnswerVerifier behavior intact ────────────────────────────────

describe('T: existing AnswerVerifier behavior unchanged', () => {
  it('WHO_AUTHORED with correct person → PASS', async () => {
    const { verifyAnswer } = await import('../../src/ai/reasoning/AnswerVerifier.js');
    const relationships = [{
      subject: 'PR-247', subjectId: 'PR-247', relation: 'AUTHORED_BY', direction: 'OUT',
      object: 'Jordan Lee', objectType: 'USER',
    }];
    const result = verifyAnswer({
      relIntent: 'WHO_AUTHORED', targets: ['PR-247'],
      relationships, hasNoRecord: false,
      answer: 'PR-247 was authored by Jordan Lee.',
    });
    assert.equal(result.status, 'PASS');
  });

  it('WHO_AUTHORED with wrong person → REPAIR', async () => {
    const { verifyAnswer } = await import('../../src/ai/reasoning/AnswerVerifier.js');
    const relationships = [{
      subject: 'PR-247', relation: 'AUTHORED_BY', direction: 'OUT',
      object: 'Jordan Lee', objectType: 'USER',
    }];
    const result = verifyAnswer({
      relIntent: 'WHO_AUTHORED', targets: ['PR-247'],
      relationships, hasNoRecord: false,
      answer: 'PR-247 was authored by Rahul Kumar.',
    });
    assert.equal(result.status, 'REPAIR');
    assert.ok((result.violations || []).length > 0);
  });
});

// ── Adversarial tests 1-10 ────────────────────────────────────────────────────

describe('Adversarial 1: valid citation passes', () => {
  it('[e1] on a packet with e1 → ID check PASS', () => {
    const p = mkPacket();
    const r = verifyEvidenceIds('Jordan authored PR-247. [e1]', p);
    assert.equal(r.status, 'PASS');
  });
});

describe('Adversarial 2: phantom citation rejected', () => {
  it('[e9] not in packet → PHANTOM_IDS', () => {
    const p = mkPacket();
    const r = verifyEvidenceIds('Jordan authored PR-247. [e9]', p);
    assert.equal(r.status, 'PHANTOM_IDS');
    assert.ok(r.phantom.includes('e9'));
  });
});

describe('Adversarial 3: attribution without citation rejected', () => {
  it('factual claim "Jordan authored PR-247." with no marker → UNCITED_CLAIM', () => {
    const p = mkPacket();
    const r = verifyUncitedClaims('Jordan Lee authored PR-247.', p);
    assert.equal(r.status, 'UNCITED_CLAIM');
  });
});

describe('Adversarial 4: semantic mismatch — ID layer passes, ClaimVerifier catches', () => {
  it('[e1] exists so ID check passes; wrong person is caught by ClaimVerifier separately', async () => {
    const p = mkPacket();
    // Phase 5 ID check: e1 exists → PASS
    const idResult = verifyEvidenceIds('PR-247 was authored by Rahul Kumar. [e1]', p);
    assert.equal(idResult.status, 'PASS', 'ID layer: e1 is valid, passes here');

    // ClaimVerifier catches WRONG_ATTRIBUTION (this is the existing layer)
    const { verifySynthesisClaims } = await import('../../src/ai/reasoning/ClaimVerifier.js');
    const people = new Set(['jordan lee']);
    const relationships = [{ subject: 'PR-247', relation: 'AUTHORED_BY', direction: 'OUT', object: 'Jordan Lee', objectType: 'USER' }];
    const cv = verifySynthesisClaims('PR-247 was authored by Rahul Kumar.', { people, relationships });
    assert.equal(cv.status, 'REPAIR', 'ClaimVerifier catches wrong attribution');
  });
});

describe('Adversarial 5: overbroad numeric claim — ID exists but content does not support the number', () => {
  it('e1 is cited and valid; numeric fabrication documented as ClaimVerifier scope', () => {
    // The ID system confirms [e1] exists. Numeric content verification is a semantic
    // check outside the deterministic ID-grounding layer. This test documents the
    // boundary: Phase 5 catches phantom IDs, not semantic mismatches.
    const p = mkPacket();
    const r = verifyEvidenceIds('Five projects are healthy. [e1]', p);
    assert.equal(r.status, 'PASS', 'ID layer: e1 valid → passes; numeric check is semantic layer');
  });
});

describe('Adversarial 6: wrong role claim — ID layer passes, semantic layer needed', () => {
  it('[e1] cited and valid; "Jordan is CEO" is a semantic mismatch the ID layer cannot catch alone', () => {
    const p = mkPacket();
    const r = verifyEvidenceIds('Jordan is CEO. [e1]', p);
    assert.equal(r.status, 'PASS', 'ID layer: e1 valid → passes; role assertion is semantic layer');
  });
});

describe('Adversarial 7: universal negation under PARTIAL coverage rejected', () => {
  it('"Nothing exists anywhere." when Slack was SKIPPED_NOT_CONNECTED → OVERBROAD_NEGATION', () => {
    const skippedQ = mkQuery({ capabilityId: 'communications', source: 'slack', outcome: QueryOutcome.SKIPPED_NOT_CONNECTED, resultIds: [] });
    const p = buildEvidencePacket(WS, Q, {}, [skippedQ], []);
    const r = verifyOverbreadNegation('Nothing exists anywhere. [e1]', p);
    assert.equal(r.status, 'OVERBROAD_NEGATION');
  });

  it('"Nothing exists anywhere." under COMPLETE coverage → PASS', () => {
    const p = mkPacket(); // COMPLETE
    const r = verifyOverbreadNegation('Nothing exists anywhere. [e1]', p);
    assert.equal(r.status, 'PASS');
  });
});

describe('Adversarial 8: absence assertion for SKIPPED_NOT_CONNECTED source', () => {
  it('"Slack has no matching messages." when Slack was SKIPPED_NOT_CONNECTED → OVERBROAD_SCOPE', () => {
    const skippedQ = mkQuery({ capabilityId: 'communications', source: 'slack', outcome: QueryOutcome.SKIPPED_NOT_CONNECTED, resultIds: [] });
    const p = buildEvidencePacket(WS, Q, {}, [skippedQ], []);
    const r = verifyNegativeScope('Slack has no matching messages.', p);
    assert.equal(r.status, 'OVERBROAD_SCOPE');
    assert.ok(r.violations.some(v => v.includes('slack')));
  });
});

describe('Adversarial 9: absence assertion for SKIPPED_BY_PLAN source', () => {
  it('"Calendar has no matching events." when Calendar was SKIPPED_BY_PLAN → OVERBROAD_SCOPE', () => {
    const skippedQ = createEvidenceQuery({
      capabilityId: 'meetings', source: 'google-calendar',
      outcome: QueryOutcome.SKIPPED_BY_PLAN, freshness: Freshness.UNKNOWN,
      workspaceId: WS, resultIds: [],
    });
    const p = buildEvidencePacket(WS, Q, {}, [skippedQ], []);
    const r = verifyNegativeScope('Calendar has no matching events.', p);
    assert.equal(r.status, 'OVERBROAD_SCOPE');
  });
});

describe('Adversarial 10: "current" assertion on STALE data', () => {
  it('"Data is current. [e1]" when e1 is STALE → STALE_ASSERTION', () => {
    const q = mkQuery({ freshness: Freshness.STALE });
    const p = buildEvidencePacket(WS, Q, {}, [q], [mkItem()]);
    const r = verifyClaimFreshness('Data is current. [e1]', p);
    assert.equal(r.status, 'STALE_ASSERTION');
    assert.ok(r.violations.includes('e1'));
  });

  it('"The latest PR was authored by Jordan. [e1]" on STALE → STALE_ASSERTION', () => {
    const q = mkQuery({ freshness: Freshness.STALE });
    const p = buildEvidencePacket(WS, Q, {}, [q], [mkItem()]);
    const r = verifyClaimFreshness('The latest PR was authored by Jordan. [e1]', p);
    assert.equal(r.status, 'STALE_ASSERTION');
  });

  it('"Data is current. [e1]" on CURRENT data → PASS', () => {
    const p = mkPacket({ freshness: Freshness.CURRENT });
    const r = verifyClaimFreshness('Data is current. [e1]', p);
    assert.equal(r.status, 'PASS');
  });
});

// ── Humanization ──────────────────────────────────────────────────────────────

describe('humanize: strip markers and build provenance', () => {
  it('strips [e1] from text', () => {
    const p = mkPacket();
    const { text } = humanize('Jordan authored PR-247. [e1]', p);
    assert.ok(!text.includes('[e1]'), 'marker must be stripped');
    assert.ok(text.includes('Jordan authored PR-247'), 'content must be preserved');
  });

  it('provenance maps sentence to evidence IDs', () => {
    const p = mkPacket();
    // Marker within sentence (before period) so it and its sentence are kept together.
    const { provenance } = humanize('Jordan authored PR-247 [e1].', p);
    assert.ok(provenance.size > 0, 'provenance must be non-empty');
    const entries = [...provenance.entries()];
    assert.ok(entries.some(([, ids]) => ids.includes('e1')));
  });

  it('verifyAfterHumanize on clean text → PASS', () => {
    const p = mkPacket();
    const { text } = humanize('Jordan authored PR-247. [e1]', p);
    const r = verifyAfterHumanize(text, p);
    assert.equal(r.status, 'PASS');
  });

  it('verifyAfterHumanize catches surviving markers', () => {
    const p = mkPacket();
    const r = verifyAfterHumanize('Jordan authored PR-247. [e1]', p);
    assert.equal(r.status, 'MARKERS_SURVIVED');
    assert.ok(r.violations.includes('e1'));
  });
});

// ── runPhase5Verification composite ──────────────────────────────────────────

describe('runPhase5Verification: composite gate', () => {
  it('clean answer → no violations, humanized text returned', () => {
    const p = mkPacket();
    const { answer, violations } = runPhase5Verification('Jordan authored PR-247. [e1]', p);
    assert.equal(violations.filter(v => v.check !== 'UNCITED_CLAIM').length, 0);
    assert.ok(!answer.includes('[e1]'), 'markers stripped from final answer');
    assert.ok(answer.includes('Jordan'), 'content preserved');
  });

  it('phantom ID is stripped from answer', () => {
    const p = mkPacket();
    const { answer, violations } = runPhase5Verification('Jordan authored PR-247. [e99]', p);
    assert.ok(violations.some(v => v.check === 'PHANTOM_IDS'), 'phantom violation logged');
    assert.ok(!answer.includes('[e99]'), 'phantom marker stripped');
  });

  it('STALE assertion logged in violations', () => {
    const q = mkQuery({ freshness: Freshness.STALE });
    const p = buildEvidencePacket(WS, Q, {}, [q], [mkItem()]);
    const { violations } = runPhase5Verification('The data is currently up to date. [e1]', p);
    assert.ok(violations.some(v => v.check === 'STALE_ASSERTION'), 'stale violation logged');
  });
});

// ── extractEvidenceMarkers edge cases ────────────────────────────────────────

describe('extractEvidenceMarkers: edge cases', () => {
  it('no markers → empty array', () => {
    assert.deepEqual(extractEvidenceMarkers('No markers here.'), []);
  });

  it('case-insensitive: [E1] and [e1] both extracted', () => {
    const markers = extractEvidenceMarkers('[E1] and [e2]');
    assert.ok(markers.includes('e1'));
    assert.ok(markers.includes('e2'));
  });

  it('markers are sorted numerically', () => {
    const markers = extractEvidenceMarkers('[e3] [e1] [e2]');
    assert.deepEqual(markers, ['e1', 'e2', 'e3']);
  });

  it('duplicate markers collapsed to unique set', () => {
    const markers = extractEvidenceMarkers('[e1] [e1] [e2]');
    assert.equal(markers.filter(m => m === 'e1').length, 1);
  });
});
