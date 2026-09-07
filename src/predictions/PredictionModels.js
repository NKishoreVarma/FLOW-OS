/**
 * PredictionModels — the deterministic model registry. Each model reads REAL
 * signals from the shared context (graph structure, event/replay trends,
 * patterns, health, and — for scenario-shaped risks — the Simulation Engine) and
 * returns a probability with drivers and evidence. No ML, no invented numbers:
 * every probability is a bounded function of measured inputs.
 *
 * A model returns: { probability (0-1), trend?, drivers[], evidence[], target?,
 *                    insufficient? }
 */

import { trend, dailySeries } from './TrendAnalyzer.js';
import { toProbability } from './ForecastEngine.js';
import { deviation } from './AnomalyPredictor.js';

const clamp01 = (n) => Math.max(0, Math.min(1, n));
const NEG_CUSTOMER = /frustrat|churn|at.risk|escalat|unhappy|cancel|angry|complaint|downgrade/i;
const POS_CUSTOMER = /expansion|upsell|renew|happy|success|growth|upgrade/i;
const FAIL_DEPLOY = /fail|rollback|revert|error|broke|degrade/i;
const insufficient = (label) => ({ probability: 0.05, drivers: [], evidence: [`Insufficient signal: ${label}.`], insufficient: true });

export const MODELS = {
  // ── Engineering ─────────────────────────────────────────────────────────────
  INCIDENT_PROBABILITY: { domain: 'engineering', label: 'Incident probability', async run(ctx) {
    if (!ctx.incidents.length && !ctx.deployments.length) return insufficient('no incident or deployment history');
    const t = trend(dailySeries(ctx.incidents, 30));
    const base = Math.min(1, ctx.incidents.length / 15) * 0.5 + ctx.patterns.deployIncidentRate * 0.4;
    const probability = clamp01(toProbability(base, t, 0.2));
    return { probability, trend: t, target: null,
      drivers: [`${ctx.incidents.length} incidents/60d`, `deploy→incident rate ${ctx.patterns.deployIncidentRate}`, `${ctx.patterns.recurringIncidentResources} recurring resource(s)`],
      evidence: [`Incident trend ${t.direction} (${t.changePct >= 0 ? '+' : ''}${t.changePct}%).`, `${ctx.patterns.deployIncidentLinks}/${ctx.patterns.deploymentCount} deployments were followed by an incident within 48h.`] };
  } },

  DEPLOYMENT_RISK: { domain: 'engineering', label: 'Deployment failure risk', async run(ctx) {
    if (!ctx.deployments.length) return insufficient('no deployments in window');
    const fails = ctx.deployments.filter(d => FAIL_DEPLOY.test(`${d.title} ${d.summary || ''}`)).length;
    const failRate = fails / ctx.deployments.length;
    const t = trend(dailySeries(ctx.deployments, 30));
    const probability = clamp01(failRate * 0.6 + ctx.patterns.deployIncidentRate * 0.35 + (t.direction === 'rising' ? 0.1 : 0));
    return { probability, trend: t,
      drivers: [`${fails}/${ctx.deployments.length} recent deploys showed failure signals`, `deploy→incident rate ${ctx.patterns.deployIncidentRate}`],
      evidence: [`${(failRate * 100).toFixed(0)}% of recent deployments had failure/rollback signals.`, `Deployment cadence is ${t.direction}.`] };
  } },

  SPRINT_DELAY: { domain: 'engineering', label: 'Sprint delay risk', async run(ctx) {
    const eng = ctx.events.filter(e => e.eventType === 'engineering');
    if (eng.length < 3) return insufficient('too little engineering activity');
    const t = trend(dailySeries(eng, 30));
    const falling = t.direction === 'falling';
    const probability = clamp01((falling ? 0.45 + Math.min(0.4, -t.changePct / 100) : t.direction === 'rising' ? 0.2 : 0.35));
    return { probability, trend: t,
      drivers: [`engineering velocity ${t.direction} (${t.changePct}%)`, `${eng.length} eng events/60d`],
      evidence: [`Delivery velocity is ${t.direction} (${t.changePct >= 0 ? '+' : ''}${t.changePct}%) — ${falling ? 'a leading indicator of slippage' : 'stable/improving'}.`] };
  } },

  PR_BOTTLENECK: { domain: 'engineering', label: 'PR bottleneck', async run(ctx) {
    const prs = ctx.events.filter(e => /pr |pull request|\bpr\b/i.test(e.title) || e.entity?.type === 'PR');
    if (prs.length < 3) return insufficient('too few PRs');
    const merged = prs.filter(p => /merg/i.test(`${p.title} ${p.summary || ''}`)).length;
    const openRatio = 1 - merged / prs.length;
    const probability = clamp01(openRatio * 0.8);
    return { probability, drivers: [`${merged}/${prs.length} PRs show merge signals`],
      evidence: [`${Math.round(openRatio * 100)}% of PR activity shows no merge signal — potential queue buildup.`] };
  } },

  REVIEW_DELAY: { domain: 'engineering', label: 'Review delays', async run(ctx) {
    const prs = ctx.events.filter(e => /pr |pull request/i.test(e.title) || e.entity?.type === 'PR');
    const reviews = ctx.events.filter(e => /review/i.test(`${e.title} ${e.metadata?.action || ''}`));
    if (prs.length < 3) return insufficient('too few PRs to assess review latency');
    const ratio = reviews.length / prs.length;
    const probability = clamp01(1 - Math.min(1, ratio));
    return { probability, drivers: [`${reviews.length} reviews vs ${prs.length} PRs`],
      evidence: [`Review-to-PR ratio is ${ratio.toFixed(2)} — ${ratio < 0.5 ? 'reviews are lagging PR creation' : 'review coverage is adequate'}.`] };
  } },

  CODE_OWNERSHIP_RISK: { domain: 'engineering', label: 'Code ownership risk', async run(ctx) {
    const totalRepos = ctx.graph.metrics.byNodeType.find(t => t.type === 'REPOSITORY')?.c || 0;
    if (!totalRepos) return insufficient('no repositories in the graph');
    const orphans = ctx.graph.orphanRepos.length;
    const probability = clamp01(orphans / totalRepos);
    return { probability,
      drivers: [`${orphans}/${totalRepos} repositories have no clear owner`],
      evidence: [`${orphans} repository(ies) lack an ownership edge in the Operational Graph${orphans ? `: ${ctx.graph.orphanRepos.slice(0, 3).map(o => o.name).join(', ')}` : ''}.`] };
  } },

  // ── People ──────────────────────────────────────────────────────────────────
  BUS_FACTOR: { domain: 'people', label: 'Bus factor risk', async run(ctx) {
    const total = Object.values(ctx.byActor).reduce((s, n) => s + n, 0);
    const top = Object.entries(ctx.byActor).sort((a, b) => b[1] - a[1])[0];
    if (!top || total < 5) return insufficient('too little contributor activity');
    const share = top[1] / total;
    const probability = clamp01(share);
    return { probability, target: { name: top[0] },
      drivers: [`${top[0]} accounts for ${Math.round(share * 100)}% of tracked activity`],
      evidence: [`Work is concentrated: ${top[0]} drives ${Math.round(share * 100)}% of recent events — a bus-factor concentration.`] };
  } },

  KNOWLEDGE_LOSS: { domain: 'people', label: 'Knowledge loss risk', async run(ctx) {
    const top = Object.entries(ctx.byActor).sort((a, b) => b[1] - a[1])[0];
    if (!top) return insufficient('no contributors to assess');
    const node = await ctx.resolveEmployee(top[0]);
    if (!node) return insufficient(`could not resolve ${top[0]} in the graph`);
    const sim = await ctx.simulate({ type: 'EMPLOYEE_DEPARTURE', targetEntityId: node.id }).catch(() => null);
    const kl = sim?.knowledgeLoss?.score ?? 0;
    return { probability: clamp01(kl / 100), target: { id: node.id, name: top[0] },
      drivers: [`${top[0]} is the top contributor`, sim?.knowledgeLoss?.note || 'sole-ownership analysis'],
      evidence: [`If ${top[0]} departed, simulation estimates knowledge-loss severity ${kl}/100.`, sim?.knowledgeLoss?.note].filter(Boolean),
      simulation: sim ? { risk: sim.overallRiskScore, atRisk: sim.knowledgeLoss?.atRisk?.length } : null };
  } },

  EMPLOYEE_DEPENDENCY: { domain: 'people', label: 'Employee dependency', async run(ctx) {
    const total = Object.values(ctx.byActor).reduce((s, n) => s + n, 0);
    const sorted = Object.entries(ctx.byActor).sort((a, b) => b[1] - a[1]);
    if (sorted.length < 2 || total < 5) return insufficient('too few contributors');
    const top2 = (sorted[0][1] + (sorted[1]?.[1] || 0)) / total;
    return { probability: clamp01(top2), target: { name: sorted[0][0] },
      drivers: [`top 2 contributors drive ${Math.round(top2 * 100)}% of activity`],
      evidence: [`${sorted[0][0]} and ${sorted[1]?.[0]} together account for ${Math.round(top2 * 100)}% of activity.`] };
  } },

  BURNOUT_RISK: { domain: 'people', label: 'Burnout risk', async run(ctx) {
    const counts = Object.values(ctx.byActor);
    const top = Object.entries(ctx.byActor).sort((a, b) => b[1] - a[1])[0];
    if (!top || counts.length < 2) return insufficient('too few contributors');
    const dev = deviation(counts.sort((a, b) => a - b));
    const meetingLoad = ctx.meetingsByActor[top[0]] || 0;
    const probability = clamp01((dev.anomaly ? 0.4 : 0.2) + Math.min(0.4, meetingLoad / 15) + (top[1] > 2 * (counts.reduce((s, n) => s + n, 0) / counts.length) ? 0.2 : 0));
    return { probability, target: { name: top[0] },
      drivers: [`${top[0]} activity ${dev.direction} baseline (z=${dev.z})`, `${meetingLoad} meeting(s)`],
      evidence: [`${top[0]} shows outlier workload (${top[1]} events, ${meetingLoad} meetings) versus peers.`] };
  } },

  MEETING_OVERLOAD: { domain: 'people', label: 'Meeting overload', async run(ctx) {
    const entries = Object.entries(ctx.meetingsByActor).sort((a, b) => b[1] - a[1]);
    if (!entries.length) return insufficient('no meeting attendance data');
    const [name, count] = entries[0];
    const probability = clamp01(count / 12);
    return { probability, target: { name },
      drivers: [`${name} attended ${count} meeting(s) in the window`],
      evidence: [`${name} is in ${count} meeting(s) — ${count >= 8 ? 'a heavy load that erodes focus time' : 'a manageable load'}.`] };
  } },

  PRODUCTIVITY_TREND: { domain: 'people', label: 'Productivity trend', async run(ctx) {
    const t = trend(ctx.velocitySeries);
    if (t.insufficient) return insufficient('not enough history');
    const probability = clamp01(t.direction === 'falling' ? 0.4 + Math.min(0.4, -t.changePct / 100) : 0.2);
    return { probability, trend: t,
      drivers: [`overall activity ${t.direction} (${t.changePct}%)`],
      evidence: [`Workspace activity is ${t.direction} (${t.changePct >= 0 ? '+' : ''}${t.changePct}%).`] };
  } },

  // ── Customers ───────────────────────────────────────────────────────────────
  CHURN_RISK: { domain: 'customers', label: 'Customer churn risk', async run(ctx) {
    if (!ctx.customerEvents.length) return insufficient('no customer activity');
    const neg = ctx.customerEvents.filter(e => NEG_CUSTOMER.test(`${e.title} ${e.summary || ''}`));
    const byCust = {};
    for (const e of neg) { const k = e.entity?.name || e.entity?.id || 'unknown'; byCust[k] = (byCust[k] || 0) + 1; }
    const top = Object.entries(byCust).sort((a, b) => b[1] - a[1])[0];
    const probability = clamp01(neg.length / Math.max(3, ctx.customerEvents.length) + (top ? 0.2 : 0));
    let sim = null;
    if (top) { const node = await ctx.resolveCustomer(top[0]); if (node) sim = await ctx.simulate({ type: 'CUSTOMER_CHURN', targetEntityId: node.id }).catch(() => null); }
    return { probability, target: top ? { name: top[0] } : null,
      drivers: [`${neg.length} negative customer signal(s)`, top ? `${top[0]} most at-risk (${top[1]} signals)` : ''].filter(Boolean),
      evidence: [`${neg.length}/${ctx.customerEvents.length} customer events carried churn-risk language.`, sim ? `Simulated churn of ${top[0]} → risk ${sim.overallRiskScore}, ~$${Number(sim.financialEstimate?.estimate || 0).toLocaleString()}.` : null].filter(Boolean),
      simulation: sim ? { risk: sim.overallRiskScore, financial: sim.financialEstimate?.estimate } : null };
  } },

  CUSTOMER_HEALTH: { domain: 'customers', label: 'Customer health degradation', async run(ctx) {
    if (!ctx.customerEvents.length) return insufficient('no customer activity');
    const neg = ctx.customerEvents.filter(e => NEG_CUSTOMER.test(`${e.title} ${e.summary || ''}`)).length;
    const pos = ctx.customerEvents.filter(e => POS_CUSTOMER.test(`${e.title} ${e.summary || ''}`)).length;
    const probability = clamp01((neg - pos + ctx.customerEvents.length * 0.1) / Math.max(3, ctx.customerEvents.length));
    return { probability, drivers: [`${neg} negative vs ${pos} positive customer signals`],
      evidence: [`Net customer sentiment: ${pos - neg} (${pos} positive, ${neg} negative) across ${ctx.customerEvents.length} events.`] };
  } },

  RENEWAL_RISK: { domain: 'customers', label: 'Renewal risk', async run(ctx) {
    const neg = ctx.customerEvents.filter(e => NEG_CUSTOMER.test(`${e.title} ${e.summary || ''}`)).length;
    if (!ctx.customerEvents.length) return insufficient('no customer activity');
    return { probability: clamp01(neg / Math.max(4, ctx.customerEvents.length)),
      drivers: [`${neg} at-risk customer signal(s)`], evidence: [`${neg} customer event(s) suggest renewal risk.`] };
  } },

  SUPPORT_ESCALATION: { domain: 'customers', label: 'Support escalation', async run(ctx) {
    const esc = ctx.events.filter(e => /escalat|urgent|sev1|sev2|angry|complaint/i.test(`${e.title} ${e.summary || ''}`));
    const t = trend(dailySeries(esc, 21));
    if (esc.length < 2) return insufficient('too few escalation signals');
    return { probability: clamp01(Math.min(1, esc.length / 10) * 0.7 + (t.direction === 'rising' ? 0.2 : 0)), trend: t,
      drivers: [`${esc.length} escalation signal(s), trend ${t.direction}`], evidence: [`Escalation signals are ${t.direction}.`] };
  } },

  EXPANSION_OPPORTUNITY: { domain: 'customers', label: 'Expansion opportunity', async run(ctx) {
    const pos = ctx.customerEvents.filter(e => POS_CUSTOMER.test(`${e.title} ${e.summary || ''}`));
    if (pos.length < 1) return insufficient('no expansion signals');
    return { probability: clamp01(pos.length / Math.max(3, ctx.customerEvents.length)),
      drivers: [`${pos.length} positive/expansion signal(s)`], evidence: [`${pos.length} customer event(s) suggest expansion potential.`] };
  } },

  // ── Operations ──────────────────────────────────────────────────────────────
  OPERATIONAL_HEALTH: { domain: 'operations', label: 'Operational health degradation', async run(ctx) {
    const health = ctx.health ?? 70;
    const t = trend(dailySeries(ctx.incidents, 30));
    const probability = clamp01((100 - health) / 100 * 0.7 + (t.direction === 'rising' ? 0.2 : 0));
    return { probability, trend: t,
      drivers: [`workspace health ${health}/100`, `incident trend ${t.direction}`],
      evidence: [`Current workspace health is ${health}/100; incidents are ${t.direction}.`] };
  } },

  CAPACITY_RISK: { domain: 'operations', label: 'Capacity risk', async run(ctx) {
    const contributors = Object.keys(ctx.byActor).length;
    const load = ctx.events.length / Math.max(1, contributors);
    const t = trend(ctx.velocitySeries);
    if (contributors < 2) return insufficient('too few contributors');
    const probability = clamp01(Math.min(1, load / 60) * 0.6 + (t.direction === 'rising' ? 0.3 : 0));
    return { probability, trend: t,
      drivers: [`${Math.round(load)} events per contributor`, `load trend ${t.direction}`],
      evidence: [`${ctx.events.length} events across ${contributors} contributor(s) — load is ${t.direction}.`] };
  } },

  SECURITY_DRIFT: { domain: 'operations', label: 'Security drift', async run(ctx) {
    const sec = ctx.events.filter(e => e.eventType === 'security' || /vuln|breach|exposed|leaked|unauthor|cve/i.test(`${e.title} ${e.summary || ''}`));
    if (sec.length < 1) return insufficient('no security signals');
    const t = trend(dailySeries(sec, 30));
    return { probability: clamp01(Math.min(1, sec.length / 8) * 0.7 + (t.direction === 'rising' ? 0.2 : 0)), trend: t,
      drivers: [`${sec.length} security signal(s)`], evidence: [`${sec.length} security-related event(s), trend ${t.direction}.`] };
  } },

  INTEGRATION_FAILURE: { domain: 'operations', label: 'Integration failure risk', async run(ctx) {
    const conns = ctx.graph.metrics.byNodeType.find(t => t.type === 'INTEGRATION')?.c || 0;
    const errs = ctx.events.filter(e => /webhook.*fail|integration.*(fail|error|down)|connector.*error|api.*unavailable/i.test(`${e.title} ${e.summary || ''}`));
    if (!conns && !errs.length) return insufficient('no integration signals');
    return { probability: clamp01(Math.min(1, errs.length / 5) * 0.8),
      drivers: [`${errs.length} integration error signal(s)`, `${conns} connector(s) active`],
      evidence: errs.length ? [`${errs.length} integration failure signal(s) observed.`] : [`${conns} connectors active; no failures observed.`] };
  } },

  POLICY_VIOLATION: { domain: 'operations', label: 'Policy violation risk', async run(ctx) {
    const denied = ctx.events.filter(e => /denied|violation|unauthorized|blocked by policy|non.?complian/i.test(`${e.title} ${e.summary || ''}`));
    if (!denied.length) return insufficient('no policy-violation signals');
    return { probability: clamp01(Math.min(1, denied.length / 5) * 0.8),
      drivers: [`${denied.length} policy signal(s)`], evidence: [`${denied.length} policy-related event(s) observed.`] };
  } },
};

export const DOMAINS = ['engineering', 'people', 'customers', 'operations'];
export const modelsByDomain = (domain) => Object.entries(MODELS).filter(([, m]) => m.domain === domain).map(([id]) => id);
export const allTypes = () => Object.keys(MODELS);
