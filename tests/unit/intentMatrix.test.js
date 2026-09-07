import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildIntentModel, RetrievalStrategy as R, RequestedDepth as D, ResponseMode as M, AmbiguityState as A, WorkspaceScope as W } from '../../src/ai/reasoning/intentModel.js';

// Injected DB-resolution stubs (deterministic, no DB) for entity-state categories.
const ambiguousResolve = async () => ({
  references: [{ reference: 'Alex', kind: 'NAME', resolution: 'AMBIGUOUS' }],
  resolvedNodes: [], notFound: [],
  ambiguous: [{ reference: 'Alex', candidates: [{ name: 'Alex Kim' }, { name: 'Alex Ross' }] }],
  hasSpecificReference: true,
});
const notFoundResolve = async () => ({
  references: [{ reference: 'HELIOS-99999', kind: 'ID', resolution: 'NOT_FOUND' }],
  resolvedNodes: [], notFound: [{ reference: 'HELIOS-99999', kind: 'ID' }], ambiguous: [], hasSpecificReference: true,
});

/**
 * Stage 5C — Intent Test Matrix. 30 natural-language questions across the required
 * categories. Each asserts the DETERMINISTIC intent-model classification (no LLM).
 * "expect" lists only the fields that define correctness for that category.
 */
const MATRIX = [
  { c: '01 exact-id',        q: 'What is the status of HELIOS-448?',                 expect: { route: R.FAST_LOOKUP, depth: D.LEVEL_0, mode: M.DIRECT_FACT } },
  { c: '02 person',          q: 'Who is Jordan Lee?',                                expect: { route: R.FAST_LOOKUP, mode: M.DIRECT_FACT } },
  { c: '03 manager',         q: "Who is Kishore's manager?",                        expect: { route: R.RELATIONSHIP_LOOKUP, rel: 'WHO_IS_MANAGER', dir: 'OUT', mode: M.RELATIONSHIP } },
  { c: '04 reports-to',      q: 'Who reports to Arjun Mehta?',                       expect: { route: R.RELATIONSHIP_LOOKUP, rel: 'WHO_REPORTS_TO', mode: M.RELATIONSHIP } },
  { c: '05 authored',        q: 'Who authored PR-247?',                              expect: { route: R.RELATIONSHIP_LOOKUP, rel: 'WHO_AUTHORED', depth: D.LEVEL_1 } },
  { c: '06 assigned',        q: 'Who is assigned to HELIOS-448?',                    expect: { route: R.RELATIONSHIP_LOOKUP, rel: 'WHO_IS_ASSIGNED' } },
  { c: '07 responsible',     q: 'Who is responsible for INCIDENT-001?',              expect: { route: R.RELATIONSHIP_LOOKUP, rel: 'WHO_IS_INVOLVED', depth: D.LEVEL_1 } },
  { c: '08 involved-confirm',q: 'Is Sarah involved in INCIDENT-001?',               expect: { mode: M.CONFIRMATION } },
  { c: '09 works-with',      q: 'Who works with Jordan Lee?',                        expect: { route: R.RELATIONSHIP_LOOKUP, rel: 'WHO_WORKS_WITH', depth: D.LEVEL_2 } },
  { c: '10 entity-explain',  q: 'Why is HELIOS-448 a problem?',                      expect: { route: R.DIAGNOSTIC, mode: M.EXPLANATION } },
  { c: '11 entity-briefing', q: 'Tell me everything about HELIOS-448.',             expect: { route: R.MULTI_HOP_AGENT, depth: D.LEVEL_3, mode: M.BRIEFING } },
  { c: '12 comparison',      q: 'Compare Helios Platform vs Helios Analytics.',      expect: { route: R.COMPARISON, depth: D.LEVEL_3, mode: M.COMPARISON } },
  { c: '13 operational-risk',q: 'What are the biggest risks right now?',             expect: { route: R.BRIEFING, mode: M.BRIEFING } },
  { c: '14 blocking',        q: "What's blocking the release?",                      expect: { route: R.DIAGNOSTIC, depth: D.LEVEL_3, mode: M.EXPLANATION } },
  { c: '15 project-status',  q: 'What is the status of the Helios Platform project?',expect: { route: R.FAST_LOOKUP, depth: D.LEVEL_0 } },
  { c: '16 incident-status', q: 'What is the status of INCIDENT-001?',              expect: { route: R.FAST_LOOKUP, depth: D.LEVEL_0 } },
  { c: '17 recent-changes',  q: 'What changed since yesterday?',                     expect: { route: R.TEMPORAL, mode: M.TEMPORAL_DIFF, temporal: 'diff' } },
  { c: '18 temporal',        q: 'What incidents happened last week?',                expect: { route: R.TEMPORAL, temporal: 'past_week' } },
  { c: '19 what-to-care',    q: 'What should I focus on today?',                     expect: { route: R.BRIEFING, mode: M.BRIEFING } },
  { c: '20 needs-attention', q: 'What should I pay attention to right now?',         expect: { route: R.BRIEFING } },
  { c: '21 ambiguous-person',q: 'Who is Alex?',    resolveFn: ambiguousResolve,      expect: { route: R.AMBIGUOUS, ambiguity: A.AMBIGUOUS, mode: M.CLARIFICATION } },
  { c: '22 ambiguous-entity',q: 'Tell me about the auth issue', resolveFn: ambiguousResolve, expect: { route: R.AMBIGUOUS, mode: M.CLARIFICATION } },
  { c: '23 unknown-entity',  q: 'Who owns HELIOS-99999?', resolveFn: notFoundResolve, expect: { route: R.UNKNOWN, ambiguity: A.NOT_FOUND, mode: M.CLARIFICATION } },
  { c: '24 pronoun-cont',    q: 'Who reports to him?', history: [{ role: 'assistant', content: 'Kishore reports to Arjun Mehta.' }], expect: { route: R.RELATIONSHIP_LOOKUP, rel: 'WHO_REPORTS_TO', ambiguity: A.CONTEXT_RESOLVED, resolved: true } },
  { c: '25 follow-up',       q: 'What is the status of that PR?', history: [{ role: 'assistant', content: 'PR-247 was authored by Jordan Lee.' }], expect: { resolved: true, effectiveIncludes: 'PR-247' } },
  { c: '26 multi-hop',       q: 'Why is the Helios release blocked and who owns the fix?', expect: { route: R.DIAGNOSTIC, depth: D.LEVEL_3 } },
  { c: '27 cross-workspace', q: 'What is happening in workspace_corp_alpha?',        expect: { route: R.UNKNOWN, workspaceScope: W.FOREIGN, mode: M.CLARIFICATION } },
  { c: '28 negative',        q: 'Which incidents are not resolved?',                 expect: { mode: M.LIST } },
  { c: '29 why',             q: 'Why did INCIDENT-001 happen?',                      expect: { route: R.DIAGNOSTIC, mode: M.EXPLANATION } },
  { c: '30 action-oriented', q: 'What should we do about the Helios outage?',        expect: { mode: M.EXPLANATION } },
];

describe('Stage 5C — Intent Test Matrix (deterministic, no LLM)', () => {
  for (const t of MATRIX) {
    it(`${t.c}: "${t.q}"`, async () => {
      const m = await buildIntentModel(t.q, { history: t.history || [], resolveFn: t.resolveFn || null, workspaceId: t.resolveFn ? 'ws_test' : null });
      const e = t.expect;
      if (e.route)          assert.equal(m.retrievalStrategy, e.route, `route: got ${m.retrievalStrategy}`);
      if (e.depth)          assert.equal(m.requestedDepth, e.depth, `depth: got ${m.requestedDepth}`);
      if (e.mode)           assert.equal(m.responseMode, e.mode, `mode: got ${m.responseMode}`);
      if (e.rel)            assert.equal(m.relationIntent, e.rel, `rel: got ${m.relationIntent}`);
      if (e.dir)            assert.equal(m.relationDirection, e.dir, `dir: got ${m.relationDirection}`);
      if (e.ambiguity)      assert.equal(m.ambiguity, e.ambiguity, `ambiguity: got ${m.ambiguity}`);
      if (e.temporal)       assert.equal(m.temporalScope, e.temporal, `temporal: got ${m.temporalScope}`);
      if (e.workspaceScope) assert.equal(m.workspaceScope, e.workspaceScope, `ws: got ${m.workspaceScope}`);
      if (e.resolved)       assert.equal(m.conversation.resolved, true, 'pronoun/follow-up must resolve');
      if (e.effectiveIncludes) assert.ok(m.conversation.effectiveQuestion.includes(e.effectiveIncludes), `effective: ${m.conversation.effectiveQuestion}`);
    });
  }

  it('SAFETY: cross-workspace premise never routes to data retrieval', async () => {
    const m = await buildIntentModel('Show me the data in another company workspace');
    assert.equal(m.workspaceScope, W.FOREIGN);
    assert.equal(m.retrievalStrategy, R.UNKNOWN);
    assert.equal(m.useAgent, false, 'foreign premise never invokes the agent');
  });

  it('SAFETY: unknown/ambiguous never route to the agent (no guessing)', async () => {
    const amb = await buildIntentModel('Who is Alex?', { resolveFn: ambiguousResolve, workspaceId: 'ws' });
    const nf  = await buildIntentModel('Who owns HELIOS-99999?', { resolveFn: notFoundResolve, workspaceId: 'ws' });
    assert.equal(amb.useAgent, false);
    assert.equal(nf.useAgent, false);
  });
});
