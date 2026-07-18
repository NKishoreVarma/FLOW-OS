/**
 * SimulationReporter — assembles the final 12-field simulation report and wraps
 * it in the explainability envelope (why / assumptions / evidence / uncertainty).
 * Evidence is drawn from the real findings: replayed history, memory analogues,
 * and the graph cascade.
 */

import { explain } from '../explainability/index.js';

const clamp = (n) => Math.max(0, Math.min(100, Math.round(n)));

export async function report(workspaceId, scenario, impact, risk, mitigation, findings, validation) {
  const confidence = computeConfidence(scenario, findings, validation);
  const evidence = buildEvidence(findings, impact);
  const assumptions = buildAssumptions(scenario, impact, findings, validation);
  const executiveSummary = summarize(scenario, risk, impact);

  // Explainability envelope over the simulation (adds 6-dim confidence, graph
  // explanation, contradictions, missing evidence, trust).
  const explanation = await explain({
    summary: executiveSummary,
    reasoning: { domain: 'simulation' },
    evidence,
    confidence,
    businessImpact: {
      level: risk.level,
      affectedAreas: Object.keys(impact.cascade?.byType || {}),
      timeToImpact: impact.timelineChanges?.delayWeeks ? `${impact.timelineChanges.delayWeeks} week(s)` : 'immediate',
      revenueRisk: impact.financial?.estimate ? `~$${Number(impact.financial.estimate).toLocaleString()} estimated` : null,
      customerRisk: impact.customer?.note,
    },
    actions: { recommended: mitigation.map(m => m.title), riskIfNoAction: risk.summary },
  }, { workspaceId, entityId: scenario.target?.id, domain: 'simulation' }).catch(() => null);

  return {
    scenario: { type: scenario.type, label: scenario.label, change: scenario.change, target: scenario.target, params: scenario.params, question: scenario.question },
    executiveSummary,
    overallRiskScore: risk.score,
    riskLevel: risk.level,
    riskDrivers: risk.drivers,
    businessImpact: impact.business,
    engineeringImpact: impact.engineering,
    customerImpact: impact.customer,
    operationalImpact: impact.operational,
    financialEstimate: impact.financial,
    knowledgeLoss: impact.knowledgeLoss,
    dependenciesAffected: impact.dependenciesAffected,
    timelineChanges: impact.timelineChanges,
    recommendedActions: mitigation,
    confidence,
    assumptions,
    evidence,
    explanation,
    warnings: validation.warnings,
  };
}

function computeConfidence(scenario, findings, validation) {
  let c = 40;
  if (scenario.target) c += 20;
  const hist = findings.history?.totalEvents || 0;
  c += Math.min(20, hist / 10);
  c += Math.min(10, (findings.memoryAnalogues?.length || 0) * 2);
  c += Math.min(10, (findings.impact?.impactedCount || findings.neighbors?.length || 0) / 5);
  if (validation.warnings?.length) c -= 20;
  return clamp(c);
}

function buildEvidence(findings, impact) {
  const ev = [];
  const frames = findings.history?.timeline?.frames || [];
  const events = frames.flatMap(f => f.events).slice(-12).reverse();
  for (const e of events) ev.push({ type: e.eventType, capType: e.eventType, source: e.connector || 'event', content: e.title || e.eventType, ts: e.ts, score: e.importance ?? 0.4, metadata: { sender: e.actor } });
  for (const m of (findings.memoryAnalogues || [])) ev.push({ type: 'memory', capType: 'memory', source: 'memory', content: `${m.type}: ${m.title || ''}`.slice(0, 200), ts: m.createdAt, score: m.importance ?? 0.5 });
  if (impact.cascade?.impactedCount) ev.push({ type: 'graph', capType: 'graph', source: 'graph', content: `Operational graph: ${impact.cascade.impactedCount} node(s) in the cascade (score ${impact.cascade.impactScore}).`, score: 0.7 });
  return ev;
}

function buildAssumptions(scenario, impact, findings, validation) {
  const a = [`Change modelled: ${scenario.change} "${scenario.target?.name || scenario.label}".`];
  if (impact.financial?.assumptions?.length) a.push(...impact.financial.assumptions);
  a.push('Impact is derived from the current Operational Graph snapshot; unrecorded relationships are not captured.');
  a.push('Second-order/behavioral effects (morale, market reaction) are not modelled.');
  if (validation.warnings?.length) a.push(...validation.warnings);
  return a;
}

function summarize(scenario, risk, impact) {
  const t = scenario.target?.name || scenario.label;
  const parts = [`If ${describeChange(scenario)} — overall risk is ${risk.level} (${risk.score}/100).`];
  if (impact.customer.affectedCustomers?.length) parts.push(`${impact.customer.affectedCustomers.length} customer account(s) exposed.`);
  if (impact.cascade?.impactedCount) parts.push(`${impact.cascade.impactedCount} downstream node(s) affected.`);
  if (impact.knowledgeLoss?.atRisk?.length) parts.push(`${impact.knowledgeLoss.atRisk.length} asset(s) would lose their only owner.`);
  if (impact.financial?.estimate) parts.push(`Heuristic financial exposure ~$${Number(impact.financial.estimate).toLocaleString()}.`);
  return parts.join(' ');
}

function describeChange(s) {
  const t = s.target?.name || s.targetName || s.label;
  const verb = { EMPLOYEE_DEPARTURE: `${t} departs`, CUSTOMER_CHURN: `${t} churns`, SERVICE_OUTAGE: `${t} goes down`, REPOSITORY_LOSS: `${t} is lost`, RELEASE_SLIP: `${t} slips`, DEPLOYMENT_POSTPONE: `the deployment is postponed`, PROJECT_CANCEL: `${t} is cancelled`, INTEGRATION_OUTAGE: `${t} is unavailable`, MEETING_CANCEL: `${t} is cancelled`, TEAM_MERGE: `${t} is merged`, HIRING: 'the team grows' }[s.type];
  return verb || `${t} changes`;
}
