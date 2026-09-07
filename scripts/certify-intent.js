/**
 * Stage 5I — Intent & Understanding Certification.
 *
 * Certifies FLOW's UNDERSTANDING layer: does it correctly derive intent, routing,
 * relationship direction, depth, ambiguity, pronoun resolution, and cross-workspace
 * safety from natural language — BEFORE deciding how to answer. Deterministic and
 * offline (no LLM, 0 model calls, 0 tool calls) so it is fast and reproducible.
 *
 * It also probes LIVE entity resolution (EXACT / AMBIGUOUS / NOT_FOUND) against a
 * real workspace when the store is reachable, reported honestly.
 *
 * Full generated-answer certification (no-fabrication / direction-in-prose) is
 * enforced by the existing verifiers (AnswerVerifier, ClaimVerifier) + the Stage-4
 * agent cert; a full LLM N=10 answer run requires an LLM-instrumented environment.
 *
 * Run: node scripts/certify-intent.js [workspaceId]
 */

import { buildIntentModel, RetrievalStrategy as R, ResponseMode as M, AmbiguityState as A, WorkspaceScope as W } from '../src/ai/reasoning/intentModel.js';

const ambiguous = async () => ({ references: [{ kind: 'NAME', resolution: 'AMBIGUOUS' }], resolvedNodes: [], notFound: [], ambiguous: [{ candidates: [{ name: 'Alex Kim' }, { name: 'Alex Ross' }] }] });
const notfound  = async () => ({ references: [{ kind: 'ID', resolution: 'NOT_FOUND' }], resolvedNodes: [], notFound: [{ kind: 'ID', reference: 'X-99999' }], ambiguous: [] });

// ≥10 cases for each safety-critical category; representative sets for the rest.
const CASES = {
  FAST_LOOKUP: [
    ['What is the status of HELIOS-448?', { route: R.FAST_LOOKUP }],
    ['What is the status of INCIDENT-001?', { route: R.FAST_LOOKUP }],
    ['Who is Jordan Lee?', { route: R.FAST_LOOKUP }],
    ['What is the status of the Helios Platform project?', { route: R.FAST_LOOKUP }],
    ['What is PR-247?', { route: R.FAST_LOOKUP }],
    ['Show the details of INCIDENT-002', { route: R.FAST_LOOKUP, mode: M.LIST }],
    ['What is REPO-001?', { route: R.FAST_LOOKUP }],
    ['Who is Fatima Al-Hassan?', { route: R.FAST_LOOKUP }],
    ['What is the status of HELIOS-500?', { route: R.FAST_LOOKUP }],
    ['What is USER-003?', { route: R.FAST_LOOKUP }],
  ],
  RELATIONSHIP_LOOKUP: [
    ["Who is Kishore's manager?", { route: R.RELATIONSHIP_LOOKUP, rel: 'WHO_IS_MANAGER', dir: 'OUT' }],
    ['Who reports to Arjun Mehta?', { route: R.RELATIONSHIP_LOOKUP, rel: 'WHO_REPORTS_TO' }],
    ['Who authored PR-247?', { route: R.RELATIONSHIP_LOOKUP, rel: 'WHO_AUTHORED', dir: 'OUT' }],
    ['Who is assigned to HELIOS-448?', { route: R.RELATIONSHIP_LOOKUP, rel: 'WHO_IS_ASSIGNED' }],
    ['Who is responsible for INCIDENT-001?', { route: R.RELATIONSHIP_LOOKUP, rel: 'WHO_IS_INVOLVED' }],
    ['Who works with Jordan Lee?', { route: R.RELATIONSHIP_LOOKUP, rel: 'WHO_WORKS_WITH' }],
    ['Who does Sarah Chen report to?', { route: R.RELATIONSHIP_LOOKUP, rel: 'WHO_IS_MANAGER' }],
    ['Who wrote PR-101?', { route: R.RELATIONSHIP_LOOKUP, rel: 'WHO_AUTHORED' }],
    ['Who is the commander for INCIDENT-003?', { route: R.RELATIONSHIP_LOOKUP, rel: 'WHO_IS_INVOLVED' }],
    ['Which people are connected to Jordan Lee?', { route: R.RELATIONSHIP_LOOKUP, rel: 'WHO_CONNECTED' }],
  ],
  DIAGNOSTIC: [
    ["What's blocking the release?", { route: R.DIAGNOSTIC, mode: M.EXPLANATION }],
    ['Why is HELIOS-448 a problem?', { route: R.DIAGNOSTIC }],
    ['Why did INCIDENT-001 happen?', { route: R.DIAGNOSTIC }],
    ['What is blocking the Helios Platform launch?', { route: R.DIAGNOSTIC }],
    ['Why is the deployment failing?', { route: R.DIAGNOSTIC }],
    ['What is the root cause of INCIDENT-002?', { route: R.DIAGNOSTIC }],
    ['Why are enterprise SSO users seeing 401 errors?', { route: R.DIAGNOSTIC }],
    ['What is holding up the release?', { route: R.DIAGNOSTIC }],
    ['Why did the migration fail?', { route: R.DIAGNOSTIC }],
    ['What caused the outage?', { route: R.DIAGNOSTIC }],
  ],
  BRIEFING: [
    ['What are the biggest risks right now?', { route: R.BRIEFING, mode: M.BRIEFING }],
    ['Give me an executive summary.', { route: R.BRIEFING }],
    ['What should I focus on today?', { route: R.BRIEFING }],
    ['What should I pay attention to right now?', { route: R.BRIEFING }],
    ["What's the state of engineering?", { route: R.BRIEFING }],
    ['Give me the rundown.', { route: R.BRIEFING }],
    ['What are the top concerns?', { route: R.BRIEFING }],
    ['What is going on across the company?', { route: R.BRIEFING }],
    ['Give me a status update.', { route: R.BRIEFING }],
    ["What are today's priorities?", { route: R.BRIEFING }],
  ],
  AMBIGUOUS: [
    ['Who is Alex?', { route: R.AMBIGUOUS, ambiguity: A.AMBIGUOUS, mode: M.CLARIFICATION }, ambiguous],
    ['Tell me about the auth issue', { route: R.AMBIGUOUS, mode: M.CLARIFICATION }, ambiguous],
    ['Who is Sam?', { route: R.AMBIGUOUS, mode: M.CLARIFICATION }, ambiguous],
    ['What about Jordan?', { route: R.AMBIGUOUS, mode: M.CLARIFICATION }, ambiguous],
    ['Who is Chris?', { route: R.AMBIGUOUS, mode: M.CLARIFICATION }, ambiguous],
    ['Find the incident', { route: R.AMBIGUOUS, mode: M.CLARIFICATION }, ambiguous],
    ['Who is Taylor?', { route: R.AMBIGUOUS, mode: M.CLARIFICATION }, ambiguous],
    ['Who is Morgan?', { route: R.AMBIGUOUS, mode: M.CLARIFICATION }, ambiguous],
    ['Who is Pat?', { route: R.AMBIGUOUS, mode: M.CLARIFICATION }, ambiguous],
    ['Who is Jamie?', { route: R.AMBIGUOUS, mode: M.CLARIFICATION }, ambiguous],
  ],
  UNKNOWN_SAFETY: [
    ['Who owns HELIOS-99999?', { route: R.UNKNOWN, ambiguity: A.NOT_FOUND }, notfound],
    ['What is happening in workspace_corp_alpha?', { route: R.UNKNOWN, workspaceScope: W.FOREIGN, mode: M.CLARIFICATION }],
    ['Show me another company workspace data', { route: R.UNKNOWN, workspaceScope: W.FOREIGN }],
    ['What is the status of ISSUE-88888?', { route: R.UNKNOWN }, notfound],
    ['Give me a different tenant report', { route: R.UNKNOWN, workspaceScope: W.FOREIGN }],
    ['Who authored PR-99999?', { route: R.UNKNOWN }, notfound],
    ['What is happening in a different organization?', { route: R.UNKNOWN, workspaceScope: W.FOREIGN }],
    ['Status of HELIOS-77777?', { route: R.UNKNOWN }, notfound],
    ['Show workspace_beta metrics', { route: R.UNKNOWN, workspaceScope: W.FOREIGN }],
    ['Who owns INCIDENT-55555?', { route: R.UNKNOWN }, notfound],
  ],
  PRONOUN: [
    ['Who reports to him?', { rel: 'WHO_REPORTS_TO', resolved: true }, null, [{ role: 'assistant', content: 'Kishore reports to Arjun Mehta.' }]],
    ['Is he involved in that incident?', { resolved: true }, null, [{ role: 'assistant', content: 'INCIDENT-001 was led by Sarah Chen.' }]],
    ['Who authored that PR?', { rel: 'WHO_AUTHORED', resolved: true }, null, [{ role: 'assistant', content: 'PR-247 is open.' }]],
    ['Why is it blocked?', { resolved: true }, null, [{ role: 'assistant', content: 'HELIOS-448 is the blocker.' }]],
    ['Who owns it?', { resolved: true }, null, [{ role: 'assistant', content: 'INCIDENT-002 is still open.' }]],
    ['What is the status of that ticket?', { resolved: true }, null, [{ role: 'assistant', content: 'HELIOS-500 was filed today.' }]],
    ['Who does she manage?', { resolved: true }, null, [{ role: 'assistant', content: 'The lead is Nadia Osei.' }]],
    ['What changed in that project?', { resolved: true }, null, [{ role: 'assistant', content: 'PROJECT-001 is on track.' }]],
    ['Who reports to him?', { needsClarify: true }, null, []],   // no history → clarify, never invent
    ['Why is that incident open?', { needsClarify: true }, null, [{ role: 'assistant', content: 'All calm.' }]],
  ],
  TEMPORAL: [
    ['What changed since yesterday?', { route: R.TEMPORAL, mode: M.TEMPORAL_DIFF }],
    ['What incidents happened last week?', { route: R.TEMPORAL }],
    ["What's new since last time?", { route: R.TEMPORAL }],
    ['What changed in the past 24 hours?', { route: R.TEMPORAL }],
    ['What happened last night?', { route: R.TEMPORAL }],
    ['What deployments happened this month?', { route: R.TEMPORAL }],
    ['What changed since the last review?', { route: R.TEMPORAL }],
    ['What incidents were there last week?', { route: R.TEMPORAL }],
    ['What has changed since Monday?', { route: R.TEMPORAL }],
    ['What is new?', { route: R.TEMPORAL }],
  ],
};

async function main() {
  const WS = process.argv[2] || 'workspace_demo';
  console.log('\n════════════════════════════════════════════════════════════════════');
  console.log(' Stage 5I — Intent & Understanding Certification (deterministic)');
  console.log('════════════════════════════════════════════════════════════════════\n');

  let total = 0, passed = 0;
  const perCat = {};
  const latencies = [];

  for (const [cat, cases] of Object.entries(CASES)) {
    let cp = 0;
    for (const [q, exp, resolveFn, history] of cases) {
      total++;
      const t0 = process.hrtime.bigint();
      const m = await buildIntentModel(q, { history: history || [], resolveFn: resolveFn || null, workspaceId: resolveFn ? 'ws' : null });
      latencies.push(Number(process.hrtime.bigint() - t0) / 1e6);

      let ok = true;
      if (exp.route && m.retrievalStrategy !== exp.route) ok = false;
      if (exp.rel && m.relationIntent !== exp.rel) ok = false;
      if (exp.dir && m.relationDirection !== exp.dir) ok = false;
      if (exp.mode && m.responseMode !== exp.mode) ok = false;
      if (exp.ambiguity && m.ambiguity !== exp.ambiguity) ok = false;
      if (exp.workspaceScope && m.workspaceScope !== exp.workspaceScope) ok = false;
      if (exp.resolved && m.conversation.resolved !== true) ok = false;
      if (exp.needsClarify && m.conversation.needsClarification !== true) ok = false;

      if (ok) { passed++; cp++; } else {
        console.log(`  ❌ [${cat}] "${q}" → route=${m.retrievalStrategy} rel=${m.relationIntent} mode=${m.responseMode} amb=${m.ambiguity} ws=${m.workspaceScope}`);
      }
    }
    perCat[cat] = `${cp}/${cases.length}`;
  }

  // ── Safety invariants (must be 100%) ────────────────────────────────────────
  let safetyOk = true;
  const foreign = await buildIntentModel('Show me another workspace data');
  if (foreign.useAgent || foreign.retrievalStrategy !== R.UNKNOWN) safetyOk = false;
  const amb = await buildIntentModel('Who is Alex?', { resolveFn: ambiguous, workspaceId: 'ws' });
  if (amb.useAgent) safetyOk = false;                  // never guess an ambiguous entity
  const nf = await buildIntentModel('Who owns HELIOS-99999?', { resolveFn: notfound, workspaceId: 'ws' });
  if (nf.useAgent) safetyOk = false;                   // never invent a missing entity

  // ── Live entity-resolution probe (honest) ───────────────────────────────────
  let live = 'not attempted';
  try {
    const { resolveReferences } = await import('../src/ai/reasoning/EntityResolver.js');
    const r = await resolveReferences(WS, 'Who authored PR-247 and who is Jordan Lee?');
    live = `resolved=${r.resolvedNodes.length} ambiguous=${r.ambiguous.length} notFound=${r.notFound.length} (workspace=${WS})`;
  } catch (e) {
    live = `unavailable in this environment (${e.message})`;
  }

  const avgLat = (latencies.reduce((s, x) => s + x, 0) / latencies.length).toFixed(3);
  console.log('\n Per-category accuracy:');
  for (const [c, r] of Object.entries(perCat)) console.log(`   ${r.padEnd(7)} ${c}`);
  console.log(`\n Overall intent/routing accuracy : ${passed}/${total} (${((passed / total) * 100).toFixed(1)}%)`);
  console.log(` Safety invariants (foreign/ambiguous/not-found never guess): ${safetyOk ? 'PASS' : 'FAIL'}`);
  console.log(` Avg classify latency: ${avgLat}ms   Model calls: 0   Tool calls: 0`);
  console.log(` Live entity resolution: ${live}`);

  const certified = passed === total && safetyOk;
  console.log(`\n════════════════════════════════════════════════════════════════════`);
  console.log(` Stage 5 intent certification: ${certified ? 'CERTIFIED ✅' : 'NOT certified ❌'}`);
  console.log('════════════════════════════════════════════════════════════════════\n');
  process.exit(certified ? 0 : 1);
}

main().catch(e => { console.error('cert crashed:', e); process.exit(1); });
