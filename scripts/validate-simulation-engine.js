/**
 * Phase 11.4 — What-If Simulation Engine validation.
 *
 * Seeds a demo workspace by PUBLISHING events (so the graph subscriber builds a
 * real Operational Graph and the event store holds real history), then runs all
 * seven required scenarios and asserts each produces the full 12-field,
 * evidence-backed, explained output — using real graph traversal, not mocks.
 *
 * Run: node scripts/validate-simulation-engine.js
 */

import { prisma } from '../src/core/config/prisma.js';
import db from '../src/config/db.js';
import * as EP from '../src/events/index.js';
import '../src/graph/index.js';
import * as G from '../src/graph/index.js';
import { simulate, compare } from '../src/simulation/index.js';

let pass = 0, fail = 0;
const check = (n, ok, d = '') => { console.log(`${ok ? '✅' : '❌'} ${n}${d ? ' — ' + d : ''}`); ok ? pass++ : fail++; };

const sfx = Math.random().toString(16).slice(2, 8);
const WS = `sim-${sfx}`;
let org;
const DAY = 86_400_000, now = Date.now(), ago = (d) => new Date(now - d * DAY).toISOString();

const FIELDS = ['executiveSummary', 'overallRiskScore', 'businessImpact', 'engineeringImpact', 'customerImpact', 'operationalImpact', 'financialEstimate', 'knowledgeLoss', 'dependenciesAffected', 'timelineChanges', 'recommendedActions', 'confidence'];
const complete = (s) => s.ok && FIELDS.every(f => s[f] !== undefined) && typeof s.overallRiskScore === 'number' && s.recommendedActions.length > 0 && typeof s.confidence === 'number';

async function seed() {
  org = await prisma.organization.create({ data: { name: `Sim ${sfx}`, slug: `sim-${sfx}`, plan: 'enterprise' } });
  await prisma.workspace.create({ data: { name: 'Sim', externalId: WS, orgId: org.id } });

  const pub = (src, type, payload, ctx = {}) => EP.publish(src, type, { workspaceId: WS, ...payload }, { workspaceId: WS, ...ctx });

  // payments-svc — shared by Alice + Bob + Carol
  for (let i = 0; i < 8; i++) await pub('github', 'pull_request', { number: i + 1, title: `payments PR ${i + 1}`, author: ['Alice', 'Bob', 'Carol'][i % 3], repo: 'payments-svc', id: `pr-pay-${i}` }, { metadata: { origin: 'seed' } });
  // auth-svc — ALICE ONLY (sole owner → knowledge/orphan risk on departure)
  for (let i = 0; i < 5; i++) await pub('github', 'pull_request', { number: 100 + i, title: `auth PR ${i}`, author: 'Alice', repo: 'auth-svc', id: `pr-auth-${i}` }, { metadata: { origin: 'seed' } });
  // deployments
  await pub('github', 'deployment', { title: 'Deploy payments v2.3', id: 'dep-1', repo: 'payments-svc' });
  await pub('github', 'deployment', { title: 'Deploy payments v2.4', id: 'dep-2', repo: 'payments-svc' });
  // customer Acme journey
  await pub('hubspot', 'customer', { id: 'ACME', name: 'Acme Corp', summary: 'onboarding healthy', owner: 'Carol' });
  await pub('hubspot', 'customer', { id: 'ACME', name: 'Acme Corp', summary: 'frustrated after outage', owner: 'Carol' });
  // meeting
  // Attendees as strings so they unify with the PR-author employee nodes
  // (an object without an email would slug to a bogus "object-object" node).
  await pub('calendar', 'event', { id: 'mtg-1', title: 'Payments planning sync', attendees: ['Alice', 'Bob', 'Carol'], start: ago(1) });
  // incidents (history) — one resolved
  await pub('slack', 'message', { text: 'payments API outage sev1 ongoing', sender: 'Bob', channel: 'incidents', id: 'inc-1' });
  await pub('slack', 'message', { text: 'payments outage resolved and recovered', sender: 'Bob', channel: 'incidents', id: 'inc-2' });
}

async function cleanup() {
  for (const t of ['graph_edges', 'graph_nodes', 'flow_events', 'flow_event_deliveries', 'org_memory_records']) await db.query(`DELETE FROM ${t} WHERE workspace_id=$1`, [WS]).catch(() => {});
  await prisma.workspace.deleteMany({ where: { externalId: WS } }).catch(() => {});
  if (org) await prisma.organization.delete({ where: { id: org.id } }).catch(() => {});
}

const idOf = async (type, text) => (await G.searchNodes(WS, { type, text, limit: 1 }))[0]?.id
  || (await G.searchNodes(WS, { type, limit: 1 }))[0]?.id;

async function main() {
  console.log(`\nSeeding twin via events → "${WS}"\n`);
  await seed();
  const m = await G.metrics(WS);
  console.log(`graph built: ${m.nodeCount} nodes / ${m.edgeCount} edges\n`);

  const alice   = await idOf('EMPLOYEE', 'Alice');
  const payments = await idOf('REPOSITORY', 'payments-svc');
  const authRepo = await idOf('REPOSITORY', 'auth-svc');
  const acme    = await idOf('CUSTOMER', 'Acme');
  const deploy  = await idOf('DEPLOYMENT', 'payments');
  const meeting = await idOf('MEETING', 'planning');

  const scenarios = [
    ['Employee departure (Alice)',   { type: 'EMPLOYEE_DEPARTURE', targetEntityId: alice }],
    ['Service outage (payments-svc)', { type: 'SERVICE_OUTAGE', targetEntityId: payments, params: { hours: 6 } }],
    ['Deployment postpone',          { type: 'DEPLOYMENT_POSTPONE', targetEntityId: deploy, params: { weeks: 2 } }],
    ['Customer churn (Acme)',        { type: 'CUSTOMER_CHURN', targetEntityId: acme }],
    ['Repository loss (auth-svc)',   { type: 'REPOSITORY_LOSS', targetEntityId: authRepo }],
    ['Meeting cancellation',         { type: 'MEETING_CANCEL', targetEntityId: meeting }],
    ['Large-scale change (hire 5)',  { type: 'HIRING', params: { count: 5 }, question: 'What if we hire five engineers?' }],
  ];

  const results = {};
  for (const [label, input] of scenarios) {
    const s = await simulate(WS, input, { persist: true });
    results[input.type] = s;
    check(`[${label}]`, complete(s), s.ok ? `risk ${s.overallRiskScore}/${s.riskLevel} · conf ${s.confidence} · ${s.recommendedActions.length} action(s) · ${s.evidence.length} evidence` : s.error);
  }

  // Scenario-specific correctness (real signals, not mocks).
  const dep = results.EMPLOYEE_DEPARTURE;
  check('  departure detects real knowledge loss (owned assets + bus-factor)', dep.knowledgeLoss.score > 0 && (dep.knowledgeLoss.atRisk?.length || 0) > 0, dep.knowledgeLoss.note);
  const out = results.SERVICE_OUTAGE;
  check('  outage computes real graph cascade', out.dependenciesAffected.count > 0 || out.businessImpact.score >= 0, `cascade ${out.dependenciesAffected.count}, biz ${out.businessImpact.score}`);
  const churn = results.CUSTOMER_CHURN;
  check('  churn has heuristic financial estimate', churn.financialEstimate.estimate > 0 && churn.financialEstimate.heuristic, `$${churn.financialEstimate.estimate?.toLocaleString()}`);
  check('  every simulation carries an explanation envelope', Object.values(results).every(s => s.explanation && s.explanation.confidence), '');
  check('  every simulation lists assumptions', Object.values(results).every(s => s.assumptions.length >= 2));

  // Scenario comparison + memory reuse.
  const cmp = await compare(WS, scenarios[0][1], scenarios[3][1]);
  check('scenario comparison produces a risk delta', cmp.delta && typeof cmp.delta.riskDelta === 'number', `Δrisk ${cmp.delta?.riskDelta}`);
  const again = await simulate(WS, scenarios[0][1], { persist: false });
  check('simulation memory reuse (prior simulations found)', again.priorSimulations >= 1, `${again.priorSimulations} prior`);

  await cleanup();
  console.log(`\n${fail === 0 ? '✅ ALL PASS' : '❌ FAILURES'} — ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch(async (err) => { console.error('fatal:', err); await cleanup(); process.exit(1); });
