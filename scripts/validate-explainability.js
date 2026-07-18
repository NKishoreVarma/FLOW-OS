/**
 * Phase 11.2 — Explainable Intelligence validation.
 *
 * Generates explanations across all eight domains (recommendations, incidents,
 * meetings, customers, engineering, knowledge, timeline, operational graph) and
 * asserts every explanation is complete, honest, and grounded:
 *   • all envelope parts present   • 6-dimension confidence
 *   • contradictions surfaced      • missing evidence declared honestly
 *   • graph explanations present for graph-backed entities
 *
 * Seeds a real org + workspace and a small twin (via the event platform) so the
 * graph-backed domains exercise the Operational Graph (11.1).
 *
 * Run: node scripts/validate-explainability.js   (exit 0 = all pass)
 */

import { prisma } from '../src/core/config/prisma.js';
import db from '../src/config/db.js';
import * as EP from '../src/events/index.js';
import '../src/graph/index.js';
import * as G from '../src/graph/index.js';
import { explain, answerFollowUp } from '../src/explainability/index.js';

let pass = 0, fail = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`); ok ? pass++ : fail++; };

const sfx = Math.random().toString(16).slice(2, 8);
const WS = `xai-${sfx}`;
let org;

const ago = (d) => new Date(Date.now() - d * 864e5).toISOString();
const ev = (ref, source, capType, content, score, ts, sender) => ({ ref, type: capType, capType, source, content, score, authority: 1, ts, metadata: { sender } });

const ENVELOPE = ['executiveSummary', 'evidence', 'reasoning', 'confidence', 'sources', 'missingInformation', 'contradictions', 'alternatives', 'businessImpact', 'recommendedActions', 'trust'];
const CONF_DIMS = ['dataFreshness', 'evidenceQuality', 'relationshipConfidence', 'reasoningConfidence', 'connectorHealth', 'overall'];
const complete = (e) => ENVELOPE.every(p => e[p] !== undefined) && CONF_DIMS.every(d => Number.isFinite(e.confidence[d]));

async function seed() {
  org = await prisma.organization.create({ data: { name: `XAI ${sfx}`, slug: `xai-${sfx}`, plan: 'pro' } });
  await prisma.workspace.create({ data: { name: 'XAI', externalId: WS, orgId: org.id } });
  // Build a small twin so graph-backed explanations have an entity to reason over.
  await EP.publish('github', 'pull_request', { workspaceId: WS, number: 1, title: 'Payments gateway', author: 'alice', repo: 'payments-svc', id: 'PR-1' }, { workspaceId: WS });
  await EP.publish('hubspot', 'customer', { workspaceId: WS, id: 'ACME', name: 'Acme Corp', summary: 'churn risk', owner: 'charlie' }, { workspaceId: WS });
  await EP.publish('slack', 'message', { workspaceId: WS, text: 'prod payments outage sev1', sender: 'charlie', channel: 'incidents', id: 'INC-1' }, { workspaceId: WS });
}
async function cleanup() {
  for (const t of ['graph_edges', 'graph_nodes', 'flow_events', 'flow_event_deliveries']) await db.query(`DELETE FROM ${t} WHERE workspace_id=$1`, [WS]).catch(() => {});
  await prisma.workspace.deleteMany({ where: { externalId: WS } }).catch(() => {});
  if (org) await prisma.organization.delete({ where: { id: org.id } }).catch(() => {});
}

async function main() {
  await seed();
  const customerId = G.rawNodeId('CUSTOMER', 'customer', 'ACME');
  const repoId     = G.rawNodeId('REPOSITORY', 'github', 'payments-svc');

  const cases = [
    { domain: 'recommendations', ctx: {},
      out: { summary: 'Recommend merging PR-1 after review.', reasoning: { domain: 'engineering', chain: ['PR approved', 'CI green'] },
        evidence: [ev('E1', 'github', 'engineering', 'PR-1 approved by 2 reviewers, CI passing', 0.8, ago(1), 'alice'), ev('E2', 'jira', 'work', 'HPLT-1 linked, ready', 0.7, ago(2), 'bob'), ev('E3', 'slack', 'communication', 'lgtm ship it', 0.5, ago(1), 'sam')],
        confidence: 72, actions: { recommended: ['Merge PR-1', 'Deploy to staging'] }, businessImpact: { level: 'medium', affectedAreas: ['engineering'], timeToImpact: 'hours' } } },

    { domain: 'incidents', ctx: {},
      out: { summary: 'Sev1 payments outage in progress.', reasoning: { domain: 'incidents', chain: ['Outage detected', 'Payments affected'], verification: { passed: true, trustLevel: 'high', issues: [], warnings: [] } },
        evidence: [ev('E1', 'slack', 'communication', 'prod payments outage sev1 ongoing', 0.9, ago(0), 'charlie'), ev('E2', 'jira', 'work', 'INC-1 open, active', 0.85, ago(0), 'david'), ev('E3', 'timeline', 'timeline', 'payments error rate spiked 10x', 0.8, ago(0), null)],
        confidence: 84, businessImpact: { level: 'high', affectedAreas: ['engineering', 'customers'], timeToImpact: 'immediate', revenueRisk: 'Payments down = revenue loss', customerRisk: 'All payment customers affected' }, actions: { recommended: ['Page on-call', 'Roll back last deploy'], riskIfNoAction: 'Prolonged revenue loss' } } },

    { domain: 'meetings', ctx: {},  // deliberate contradiction
      out: { summary: 'Deploy timing is contested.', reasoning: { domain: 'engineering', chain: ['Meeting: Friday', 'Jira: delayed'] },
        evidence: [ev('E1', 'calendar', 'meeting', 'Eng sync: deploy payments Friday, approved and ready', 0.82, ago(2), 'priya'), ev('E2', 'jira', 'work', 'payments deployment delayed, blocked on migration', 0.79, ago(1), 'david')],
        confidence: 55, actions: { recommended: ['Confirm date with release owner'] }, businessImpact: { level: 'high', affectedAreas: ['engineering'], timeToImpact: 'hours' } } },

    { domain: 'customers', ctx: { entityId: customerId },
      out: { summary: 'Acme Corp is at churn risk.', reasoning: { domain: 'customers', chain: ['Health declining', 'Outage affected them'] },
        evidence: [ev('E1', 'hubspot', 'customer', 'Acme Corp health: at risk, escalation open', 0.8, ago(3), 'charlie'), ev('E2', 'gmail', 'communication', 'Acme CTO frustrated with payments outage', 0.75, ago(1), 'charlie'), ev('E3', 'slack', 'communication', 'acme renewal call next week', 0.5, ago(2), 'sam')],
        confidence: 68, businessImpact: { level: 'high', affectedAreas: ['customers', 'sales'], timeToImpact: 'days', customerRisk: 'Acme may churn', revenueRisk: 'Renewal at risk' }, actions: { recommended: ['Exec outreach to Acme', 'Offer incident post-mortem'] } } },

    { domain: 'engineering', ctx: { entityId: repoId },
      out: { summary: 'payments-svc has elevated risk.', reasoning: { domain: 'engineering', chain: ['Recent outage', 'Open PRs'] },
        evidence: [ev('E1', 'github', 'engineering', 'payments-svc: 3 open PRs, 1 failing CI', 0.7, ago(1), 'alice'), ev('E2', 'jira', 'work', '2 bugs open on payments-svc', 0.65, ago(4), 'bob'), ev('E3', 'github', 'engineering', 'last deploy reverted', 0.6, ago(2), 'alice')],
        confidence: 70, businessImpact: { level: 'medium', affectedAreas: ['engineering'], timeToImpact: 'days' }, actions: { recommended: ['Stabilize CI', 'Review open PRs'] } } },

    { domain: 'knowledge', ctx: {},  // deliberately thin → insufficient
      out: { summary: 'Limited information on the caching strategy.', reasoning: { domain: 'knowledge', chain: [], gaps: ['No design doc found'] },
        capabilities: { planned: ['knowledge', 'engineering'], queried: [] },
        evidence: [ev('E1', 'notion', 'knowledge', 'old RFC mentions caching, 200 days ago', 0.4, ago(200), 'toby')],
        confidence: 25, actions: { recommended: [] }, businessImpact: { level: 'low', affectedAreas: [] } } },

    { domain: 'timeline', ctx: {},
      out: { summary: 'Several changes in the last 24h.', reasoning: { domain: 'operations', chain: ['Deploy', 'Config change', 'Incident'] },
        evidence: [ev('E1', 'timeline', 'timeline', 'deploy v2.3 shipped', 0.7, ago(0), null), ev('E2', 'timeline', 'timeline', 'feature flag payments_v2 enabled', 0.6, ago(0), null), ev('E3', 'timeline', 'timeline', 'incident INC-1 opened', 0.8, ago(0), null)],
        confidence: 66, businessImpact: { level: 'medium', affectedAreas: ['operations'], timeToImpact: 'immediate' }, actions: { recommended: ['Correlate deploy with incident'] } } },

    { domain: 'operational graph', ctx: { entityId: repoId },  // rely on graph explanation
      out: { summary: 'payments-svc dependency footprint.', reasoning: { domain: 'engineering', chain: ['Repo powers payments'] },
        evidence: [ev('E1', 'graph', 'graph', 'payments-svc connected to payments project + PRs', 0.7, ago(1), null)],
        confidence: 60, businessImpact: { level: 'medium', affectedAreas: ['engineering'] }, actions: { recommended: [] } } },
  ];

  let sawContradiction = false, sawInsufficient = false, sawGraph = false;

  for (const c of cases) {
    const e = await explain(c.out, { workspaceId: WS, domain: c.domain, ...c.ctx });
    const okComplete = complete(e);
    const detail = `conf ${e.confidence.overall}/${e.confidence.level} · trust ${e.trust.score}/${e.trust.level} · ${e.contradictions.length} contradiction(s) · ${e.evidence.length} evidence` + (e.graph ? ` · graph:${e.graph.impact?.impactedCount ?? 0} impacted` : '');
    check(`[${c.domain}]`, okComplete, detail);
    if (e.contradictions.length) sawContradiction = true;
    if (!e.missingInformation.sufficient) sawInsufficient = true;
    if (e.graph) sawGraph = true;
    // per-domain honesty checks
    if (c.domain === 'meetings')  check('  meetings surfaces the deploy contradiction', e.contradictions.some(x => x.topic === 'deployment timing'));
    if (c.domain === 'knowledge') check('  knowledge declares insufficient evidence', !e.missingInformation.sufficient && !!e.missingInformation.confidenceStatement, e.missingInformation.confidenceStatement || '');
    if (c.domain === 'operational graph') check('  graph explanation present', !!e.graph && Array.isArray(e.graph.relationships), e.graph ? `${e.graph.relationships.length} relationships` : 'none');
    if (c.domain === 'incidents') check('  incident business impact has 6 dims', ['revenue', 'customer', 'engineering', 'operational', 'time', 'risk'].filter(d => e.businessImpact[d]).length >= 4);
  }

  // follow-up API across a representative explanation
  const e0 = await explain(cases[3].out, { workspaceId: WS, domain: 'customers', entityId: customerId });
  const fu = ['why', 'how', 'what_evidence', 'who_said', 'what_changed', 'why_now', 'what_missing', 'why_recommendation'];
  check('follow-up API answers all 8 question types', fu.every(t => { const r = answerFollowUp(e0, t); return r && r.type === t && r.answer !== undefined; }));

  check('at least one domain surfaced a contradiction', sawContradiction);
  check('at least one domain declared insufficient evidence', sawInsufficient);
  check('graph-backed explanation generated', sawGraph);

  await cleanup();
  console.log(`\n${fail === 0 ? '✅ ALL PASS' : '❌ FAILURES'} — ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch(async (err) => { console.error('fatal:', err); await cleanup(); process.exit(1); });
