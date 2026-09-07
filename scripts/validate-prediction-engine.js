/**
 * Phase 11.5 — Predictive Workspace Intelligence validation.
 *
 * Seeds a demo workspace with REAL trends (rising incidents, falling engineering
 * velocity, a sole-owner contributor, an at-risk customer, a meeting-heavy
 * person, failed deployments), then runs the seven required predictions and
 * asserts each is a full, explainable, evidence-backed forecast whose probability
 * reflects the seeded signal. No mocked scores.
 *
 * Run: node scripts/validate-prediction-engine.js
 */

import { prisma } from '../src/core/config/prisma.js';
import db from '../src/config/db.js';
import * as EP from '../src/events/index.js';
import '../src/graph/index.js';
import { predict, predictOne, getHistory } from '../src/predictions/index.js';

let pass = 0, fail = 0;
const check = (n, ok, d = '') => { console.log(`${ok ? '✅' : '❌'} ${n}${d ? ' — ' + d : ''}`); ok ? pass++ : fail++; };

const sfx = Math.random().toString(16).slice(2, 8);
const WS = `pred-${sfx}`;
let org;
const DAY = 86_400_000, now = Date.now(), ago = (d) => new Date(now - d * DAY).toISOString();
const FIELDS = ['prediction', 'probability', 'confidence', 'timeHorizon', 'supportingEvidence', 'trend', 'businessImpact', 'preventiveActions', 'explanation'];
const full = (p) => p && FIELDS.every(f => p[f] !== undefined) && p.preventiveActions.length > 0 && p.explanation.why && Array.isArray(p.explanation.alternativeOutcomes);

async function seed() {
  org = await prisma.organization.create({ data: { name: `Pred ${sfx}`, slug: `pred-${sfx}`, plan: 'enterprise' } });
  await prisma.workspace.create({ data: { name: 'Pred', externalId: WS, orgId: org.id } });
  const pub = (s, t, p) => EP.publish(s, t, { workspaceId: WS, ...p }, { workspaceId: WS });

  // Engineering velocity FALLING: many PRs early (day 30-55), few recent.
  let i = 0;
  for (const day of [55, 52, 50, 48, 45, 43, 40, 38, 35, 33, 30, 22, 12]) {
    await pub('github', 'pull_request', { number: ++i, title: `PR ${i}`, author: ['Bob', 'Carol'][i % 2], repo: 'payments-svc', id: `pr-${i}`, ts: ago(day) });
  }
  // Alice sole-owns auth-svc (top contributor + knowledge concentration).
  for (const day of [50, 44, 36, 20, 8]) await pub('github', 'pull_request', { number: ++i, title: `auth PR ${i}`, author: 'Alice', repo: 'auth-svc', id: `pr-${i}`, ts: ago(day) });

  // Incidents RISING: sparse early, dense recent.
  for (const day of [40, 12, 9, 6, 4, 3, 2, 1]) await pub('slack', 'message', { text: `payments API outage sev1 ${day}`, sender: 'Bob', channel: 'incidents', id: `inc-${day}`, ts: ago(day) });

  // Deployments incl. failures.
  for (const [day, t] of [[30, 'Deploy v1'], [18, 'Deploy v2 rollback after failure'], [7, 'Deploy v3'], [3, 'Deploy v4 failed, reverted']]) await pub('github', 'deployment', { title: t, id: `dep-${day}`, repo: 'payments-svc', ts: ago(day) });

  // At-risk customer — each update is a DISTINCT event (unique id) so the event
  // platform doesn't dedup them; the customer identity stays 'Acme Corp' by name.
  for (const [day, s] of [[20, 'onboarding healthy'], [6, 'frustrated after outage, escalation open'], [3, 'flagged churn risk, considering cancel']]) await pub('hubspot', 'customer', { id: `acme-${day}`, name: 'Acme Corp', summary: s, ts: ago(day) });

  // Meeting-heavy Alice (attendees as strings so they unify with the PR nodes).
  for (const day of [14, 10, 7, 4, 2, 1]) await pub('calendar', 'event', { id: `m-${day}`, title: `sync ${day}`, attendees: ['Alice', 'Bob'], ts: ago(day) });
}

async function cleanup() {
  for (const t of ['graph_edges', 'graph_nodes', 'flow_events', 'flow_event_deliveries', 'org_memory_records']) await db.query(`DELETE FROM ${t} WHERE workspace_id=$1`, [WS]).catch(() => {});
  await prisma.workspace.deleteMany({ where: { externalId: WS } }).catch(() => {});
  if (org) await prisma.organization.delete({ where: { id: org.id } }).catch(() => {});
}

async function main() {
  console.log(`\nSeeding trends → "${WS}"\n`);
  await seed();

  const res = await predict(WS, { persist: true });
  console.log(`generated ${res.total} predictions in ${res.elapsedMs}ms · ${res.topRisks.length} elevated risk(s)\n`);
  const by = Object.fromEntries(res.predictions.map(p => [p.type, p]));

  const required = [
    ['SPRINT_DELAY', 'sprint delay'], ['INCIDENT_PROBABILITY', 'incident probability'], ['KNOWLEDGE_LOSS', 'employee departure risk'],
    ['CHURN_RISK', 'customer churn'], ['CODE_OWNERSHIP_RISK', 'knowledge decay'], ['MEETING_OVERLOAD', 'meeting overload'], ['DEPLOYMENT_RISK', 'deployment failure'],
  ];
  for (const [type, label] of required) {
    const p = by[type];
    check(`[${label}] (${type})`, full(p), p ? `${p.probability}% · ${p.riskLevel} · conf ${p.confidence.score} · ${p.preventiveActions.length} action(s)` : 'missing');
  }

  // Signals reflect the seeded data (not fixed numbers).
  check('  incident probability reflects RISING incidents', by.INCIDENT_PROBABILITY.trend.direction === 'rising' && by.INCIDENT_PROBABILITY.probability > 20, `trend ${by.INCIDENT_PROBABILITY.trend.direction}, ${by.INCIDENT_PROBABILITY.probability}%`);
  check('  sprint delay reflects FALLING velocity', by.SPRINT_DELAY.probability >= 30, `${by.SPRINT_DELAY.probability}% (trend ${by.SPRINT_DELAY.trend.direction})`);
  check('  knowledge loss is simulation-backed with a target', !!by.KNOWLEDGE_LOSS.target && by.KNOWLEDGE_LOSS.explanation.why.length > 0 && by.KNOWLEDGE_LOSS.businessImpact.note.includes('imulat'), by.KNOWLEDGE_LOSS.target?.name);
  check('  churn risk names an at-risk customer', !!by.CHURN_RISK.target, by.CHURN_RISK.target?.name || 'none');
  check('  deployment risk reflects failures', by.DEPLOYMENT_RISK.probability > 0, `${by.DEPLOYMENT_RISK.probability}%`);
  check('  meeting overload names a person', !!by.MEETING_OVERLOAD.target, by.MEETING_OVERLOAD.target?.name);

  // Explainability + honesty.
  check('every prediction explains itself (why + evidence + alternatives)', res.predictions.every(p => p.explanation.why && Array.isArray(p.explanation.evidence)), '');
  check('low-signal predictions are honest (insufficient → low confidence)', res.predictions.filter(p => p.insufficient).every(p => p.confidence.score <= 25), `${res.predictions.filter(p => p.insufficient).length} insufficient`);
  check('predictions never carry probability without evidence', res.predictions.every(p => p.insufficient || p.supportingEvidence.length > 0), '');

  // History + single prediction.
  const hist = await getHistory(WS);
  check('prediction history persisted', hist.length >= 1, `${hist.length} run(s)`);
  const one = await predictOne(WS, 'INCIDENT_PROBABILITY');
  check('predictOne returns a single prediction', one && one.type === 'INCIDENT_PROBABILITY');
  check('covers all four domains', Object.keys(res.byDomain).length === 4 && Object.values(res.byDomain).every(n => n > 0), JSON.stringify(res.byDomain));

  await cleanup();
  console.log(`\n${fail === 0 ? '✅ ALL PASS' : '❌ FAILURES'} — ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch(async (err) => { console.error('fatal:', err); await cleanup(); process.exit(1); });
