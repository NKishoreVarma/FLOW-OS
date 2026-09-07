/**
 * PredictiveEngine — Module 5
 *
 * Wraps src/predictions/PredictionEngine and adds autonomy-specific prediction
 * types (release failure, deployment risk, incident probability, churn, SLA
 * violation, burnout, approval delays, budget overruns, capacity shortages,
 * knowledge silos). Returns a unified risk signal for the ContinuousPlanner.
 */

import { predict }           from '../predictions/PredictionEngine.js';
import { query }             from '../config/db.js';
import { logger }            from '../utils/logger.js';

const SAFE = async (label, fn) => {
  try { return await fn(); }
  catch (err) { logger.warn(`[PredictiveEngine] ${label}: ${err.message}`); return null; }
};

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Run all predictions — platform + autonomy-specific.
 * Returns { predictions, risks, summary } where risks are the top-N
 * predictions above the risk threshold.
 */
export async function runPredictions(workspaceId, orgState) {
  const [platformPredictions, autonomyPredictions] = await Promise.all([
    SAFE('platform', () => predict(workspaceId, {})),
    SAFE('autonomy',  () => _runAutonomyPredictions(workspaceId, orgState)),
  ]);

  const all = [
    ...(platformPredictions?.predictions ?? []),
    ...(autonomyPredictions ?? []),
  ];

  const risks = all
    .filter(p => Number(p.probability ?? 0) >= 0.55)
    .sort((a, b) => Number(b.probability) - Number(a.probability))
    .slice(0, 20);

  return {
    predictions: all,
    risks,
    summary: {
      total:      all.length,
      highRisk:   all.filter(p => Number(p.probability) >= 0.75).length,
      mediumRisk: all.filter(p => Number(p.probability) >= 0.55 && Number(p.probability) < 0.75).length,
      generatedAt: new Date().toISOString(),
    },
  };
}

/**
 * Get predictions filtered by domain.
 */
export async function getPredictionsForDomain(workspaceId, domain) {
  const result = await SAFE('domain-predict', () => predict(workspaceId, { domain }));
  return result?.predictions ?? [];
}

// ── Autonomy-specific prediction types ───────────────────────────────────────

async function _runAutonomyPredictions(workspaceId, orgState) {
  const predictors = [
    _predictReleaseFailure,
    _predictDeploymentRisk,
    _predictIncidentProbability,
    _predictApprovalDelay,
    _predictBudgetOverrun,
    _predictCapacityShortage,
    _predictKnowledgeSiloRisk,
    _predictChurnSignals,
    _predictBurnoutRisk,
    _predictSLAViolation,
  ];

  const results = await Promise.all(
    predictors.map(fn => SAFE(fn.name, () => fn(workspaceId, orgState)))
  );

  return results.filter(Boolean);
}

async function _predictReleaseFailure(workspaceId, orgState) {
  const wh = orgState?.workflowHistory;
  if (!wh) return null;

  const failureRate = wh.failureRate ?? 0;
  const probability = Math.min(0.95, failureRate * 1.3);

  return _prediction('RELEASE_FAILURE', 'Release failure likely this sprint', probability, {
    drivers: failureRate > 0.2 ? ['high workflow failure rate', 'multiple recent failures'] : ['stable workflow history'],
    timeHorizon: '7d',
    confidence: wh.total > 20 ? 0.78 : 0.45,
  });
}

async function _predictDeploymentRisk(workspaceId, orgState) {
  const incidents = orgState?.incidents ?? [];
  const recent    = incidents.filter(i => {
    const age = Date.now() - new Date(i.created_at ?? 0).getTime();
    return age < 48 * 3600 * 1000;
  }).length;

  const probability = Math.min(0.9, 0.3 + recent * 0.15);

  return _prediction('DEPLOYMENT_RISK', 'Deployment carries elevated risk', probability, {
    drivers: recent > 0 ? [`${recent} recent incident(s) indicate instability`] : ['system appears stable'],
    timeHorizon: '24h',
    confidence: 0.7,
  });
}

async function _predictIncidentProbability(workspaceId, orgState) {
  const cs = orgState?.connectorState;
  if (!cs) return null;

  const degraded = cs.degraded ?? 0;
  const down     = cs.down ?? 0;
  const total    = cs.total ?? 1;
  const ratio    = (degraded + down) / total;
  const probability = Math.min(0.95, ratio * 0.8 + 0.1);

  return _prediction('INCIDENT_PROBABILITY', 'Incident likely within 24 hours', probability, {
    drivers: down > 0
      ? [`${down} connector(s) DOWN`, `${degraded} DEGRADED`]
      : ['all connectors healthy'],
    timeHorizon: '24h',
    confidence: 0.72,
  });
}

async function _predictApprovalDelay(workspaceId, orgState) {
  const { rows } = await query(
    `SELECT COUNT(*) AS pending, MIN(created_at) AS oldest
     FROM pending_approvals
     WHERE workspace_id = $1 AND status = 'PENDING'`,
    [workspaceId]
  ).catch(() => ({ rows: [{}] }));

  const pending = Number(rows[0]?.pending ?? 0);
  if (pending === 0) return null;

  const ageHours = rows[0]?.oldest
    ? (Date.now() - new Date(rows[0].oldest).getTime()) / 3600000
    : 0;

  const probability = Math.min(0.9, 0.4 + pending * 0.08 + ageHours * 0.02);

  return _prediction('APPROVAL_DELAY', `${pending} pending approval(s) may delay operations`, probability, {
    drivers: [`${pending} approvals pending`, ageHours > 24 ? `oldest is ${Math.round(ageHours)}h old` : ''],
    timeHorizon: '24h',
    confidence: 0.75,
  });
}

async function _predictBudgetOverrun(workspaceId, orgState) {
  const budget = orgState?.budgetSignals;
  if (!budget?.month_spend) return null;

  const spend = Number(budget.month_spend ?? 0);
  const dayOfMonth = new Date().getDate();
  const projectedMonthly = dayOfMonth > 0 ? (spend / dayOfMonth) * 30 : spend;

  if (projectedMonthly < 5000) return null;

  const probability = projectedMonthly > 20000 ? 0.8 : 0.5;

  return _prediction('BUDGET_OVERRUN', 'Monthly spend on track to exceed budget', probability, {
    drivers: [`current month spend $${spend.toFixed(0)}`, `projected $${projectedMonthly.toFixed(0)}/month`],
    timeHorizon: '30d',
    confidence: 0.6,
  });
}

async function _predictCapacityShortage(workspaceId, orgState) {
  const wl = orgState?.teamWorkload?.assignments ?? [];
  if (wl.length === 0) return null;

  const maxLoad = Math.max(...wl.map(w => Number(w.open_tasks ?? 0)));
  if (maxLoad < 15) return null;

  const probability = Math.min(0.9, 0.4 + (maxLoad - 15) * 0.03);

  return _prediction('CAPACITY_SHORTAGE', 'Team capacity near saturation', probability, {
    drivers: [`max individual load: ${maxLoad} open tasks`, `${wl.filter(w => Number(w.open_tasks) > 10).length} overloaded members`],
    timeHorizon: '14d',
    confidence: 0.65,
  });
}

async function _predictKnowledgeSiloRisk(workspaceId, orgState) {
  const silos = orgState?.knowledgeSilos?.topOwners ?? [];
  const concentrated = silos.filter(s => Number(s.node_count) > 20);
  if (concentrated.length === 0) return null;

  const probability = Math.min(0.85, 0.4 + concentrated.length * 0.1);

  return _prediction('KNOWLEDGE_SILO', 'Critical knowledge concentrated in few people', probability, {
    drivers: concentrated.map(s => `${s.owner}: ${s.node_count} nodes`),
    timeHorizon: '90d',
    confidence: 0.68,
  });
}

async function _predictChurnSignals(workspaceId, orgState) {
  const cs = orgState?.customerSignals;
  if (!cs?.at_risk_count) return null;

  const atRisk = Number(cs.at_risk_count ?? 0);
  const total  = Number(cs.total ?? 1);
  const probability = Math.min(0.9, (atRisk / total) * 1.2);

  if (atRisk === 0) return null;

  return _prediction('CHURN_SIGNAL', `${atRisk} customer(s) at churn risk`, probability, {
    drivers: [`${atRisk} customers with health < 50`, `avg health ${cs.avg_health}`],
    timeHorizon: '30d',
    confidence: 0.7,
  });
}

async function _predictBurnoutRisk(workspaceId, orgState) {
  const cal = orgState?.calendarContext;
  if (!cal?.total_hours) return null;

  const hours = Number(cal.total_hours ?? 0);
  if (hours < 30) return null;

  const probability = Math.min(0.85, 0.3 + (hours - 30) * 0.02);

  return _prediction('BURNOUT_RISK', 'Heavy meeting load may lead to burnout', probability, {
    drivers: [`${hours.toFixed(1)} meeting hours this week`],
    timeHorizon: '14d',
    confidence: 0.55,
  });
}

async function _predictSLAViolation(workspaceId, orgState) {
  const incidents = (orgState?.incidents ?? []).filter(i => i.status === 'INVESTIGATING');
  if (incidents.length === 0) return null;

  const oldest = incidents.reduce((min, i) => {
    const age = Date.now() - new Date(i.created_at ?? 0).getTime();
    return age > min ? age : min;
  }, 0);

  const hoursOpen = oldest / 3600000;
  if (hoursOpen < 2) return null;

  const probability = Math.min(0.95, 0.4 + hoursOpen * 0.05);

  return _prediction('SLA_VIOLATION', 'Incident approaching SLA breach', probability, {
    drivers: [`${incidents.length} unresolved incident(s)`, `oldest open ${Math.round(hoursOpen)}h`],
    timeHorizon: '4h',
    confidence: 0.8,
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _prediction(type, label, probability, { drivers = [], timeHorizon = '7d', confidence = 0.6 } = {}) {
  return {
    type,
    prediction: label,
    probability: Math.round(probability * 100) / 100,
    confidence,
    timeHorizon,
    drivers: drivers.filter(Boolean),
    source: 'autonomy-predictive-engine',
    generatedAt: new Date().toISOString(),
  };
}
