/**
 * Validation harness — Phase 15 Multi-Agent Executive Council.
 *   node scripts/validate-executive-council.js
 *
 * Deterministic: routing, debate (disagreement + minority preservation), synthesis,
 * confidence aggregation, dashboard status, and a NO-DUPLICATION structural assertion
 * (agents delegate to the existing Brain; they don't reimplement reasoning). The full
 * parallel agent path is exercised live via POST /api/council/ask (see report).
 */

import { readFileSync } from 'node:fs';
import { route } from '../src/council/router.js';
import { detectDebate } from '../src/council/debateEngine.js';
import { buildDeterministicBrief } from '../src/council/councilSynthesizer.js';
import { aggregateConfidence } from '../src/council/confidenceAggregate.js';
import { AGENT_IDS } from '../src/council/agents/registry.js';

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log(`  ✅ ${n}`); } else { fail++; console.log(`  ❌ ${n}`); } };

async function main() {
  console.log('\n🏛️  Phase 15 — Executive Council validation\n');

  // ── 1. Routing ──────────────────────────────────────────────────────────────
  console.log('1. Cross-agent routing');
  const r1 = await route('Is the payments deployment a security risk and what is the cost?');
  ok('routes deployment+security+cost → engineering', r1.selected.includes('engineering'));
  ok('  → security', r1.selected.includes('security'));
  ok('  → finance', r1.selected.includes('finance'));
  ok('excludes unrelated (sales) from that question', !r1.selected.includes('sales'));

  const r2 = await route('How is our sales pipeline and customer churn?');
  ok('routes sales question → sales', r2.selected.includes('sales'));

  const r3 = await route('xyzzy plugh nothing meaningful here');
  ok('ambiguous question consults full council', r3.ambiguous && r3.selected.length === AGENT_IDS.length);

  // ── 2. Debate ───────────────────────────────────────────────────────────────
  console.log('2. Executive debate');
  const findings = [
    { agent: 'engineering', title: 'Engineering COO', stance: 'ready to ship, proceed with merge', summary: 'The release is ready to ship and on track.', confidence: 82, evidenceCount: 6, recommendedActions: [{ title: 'Merge and deploy' }], contradictions: [] },
    { agent: 'security', title: 'Security COO', stance: 'do not proceed — security risk', summary: 'There is an unresolved vulnerability; unsafe to launch.', confidence: 54, evidenceCount: 4, recommendedActions: [{ title: 'Hold release, patch first' }], contradictions: ['auth bypass risk'] },
    { agent: 'finance', title: 'Finance COO', stance: 'cost is acceptable', summary: 'Budget impact is within plan.', confidence: 70, evidenceCount: 3, recommendedActions: [], contradictions: [] },
  ];
  const debate = detectDebate(findings);
  ok('detects disagreement (proceed vs hold)', debate.hasDisagreement === true);
  ok('surfaces a conflict with tradeoffs', debate.conflicts.some((c) => c.tradeoffs));
  ok('preserves security minority opinion', debate.minorityOpinions.some((m) => m.agent === 'security'));
  ok('recommendation defers to security concern', /security/i.test(debate.recommendation || ''));

  const agree = detectDebate([
    { agent: 'engineering', title: 'Engineering COO', stance: 'proceed', summary: 'ready to ship', confidence: 80, evidenceCount: 4, recommendedActions: [], contradictions: [] },
    { agent: 'operations', title: 'Operations COO', stance: 'proceed', summary: 'on track', confidence: 78, evidenceCount: 3, recommendedActions: [], contradictions: [] },
  ]);
  ok('no false disagreement when aligned', agree.hasDisagreement === false);

  // ── 3. Synthesis ────────────────────────────────────────────────────────────
  console.log('3. Executive synthesis');
  const conf = aggregateConfidence(findings);
  ok('confidence aggregated (mean of 82,54,70 ≈ 69)', conf === 69);
  const brief = buildDeterministicBrief('Should we launch payments?', findings, debate, conf);
  ok('one synthesized answer produced', typeof brief === 'string' && brief.length > 0);
  ok('answer names all three executives', /Engineering COO/.test(brief) && /Security COO/.test(brief) && /Finance COO/.test(brief));
  ok('answer surfaces the disagreement', /disagree/i.test(brief));
  ok('answer includes aggregate confidence', /69%/.test(brief));

  // ── 4. Confidence aggregation edge cases ────────────────────────────────────
  console.log('4. Confidence aggregation');
  ok('null when no numeric confidence', aggregateConfidence([{ confidence: null }]) === null);
  ok('single value passthrough', aggregateConfidence([{ confidence: 91 }]) === 91);

  // ── 5. No-duplication (structural) ──────────────────────────────────────────
  console.log('5. No duplicated logic — agents orchestrate, not reimplement');
  const agentSrc = readFileSync(new URL('../src/council/agents/ExecutiveAgent.js', import.meta.url), 'utf8');
  ok('agent delegates to the Operational Brain (runReasoning)', /runReasoning/.test(agentSrc));
  ok('agent does NOT reimplement embeddings/vector search', !/generateEmbedding|pgvector|upsertVector/.test(agentSrc));
  const routerSrc = readFileSync(new URL('../src/council/router.js', import.meta.url), 'utf8');
  ok('router reuses CapabilityPlanner', /planCapabilities/.test(routerSrc));
  const orchSrc = readFileSync(new URL('../src/council/executiveOrchestrator.js', import.meta.url), 'utf8');
  ok('orchestrator runs agents in parallel (Promise.allSettled)', /Promise\.allSettled/.test(orchSrc));
  ok('orchestrator is fault-isolated (filters errors)', /!f\.error|f && !f\.error/.test(orchSrc));

  console.log(`\n${fail === 0 ? '✅' : '❌'} ${pass} passed, ${fail} failed\n`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((err) => { console.error('Harness error:', err); process.exit(1); });
