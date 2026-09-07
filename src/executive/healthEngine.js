/**
 * Organization Health Engine — domain health scores.
 *
 * Computes health for 8 domains + overall company.
 * Each score is 0–100, derived from:
 *   - KPI values relative to thresholds
 *   - Active incidents / open risks
 *   - Prediction risk scores (when available)
 *   - Execution success rates
 *   - Graph connectivity (knowledge silos, orphans)
 *
 * No LLM calls. All scores are deterministic functions of data.
 */

import { computeKPIs }  from './kpiEngine.js';
import { predict }      from '../predictions/index.js';
import * as EventStore  from '../events/EventStore.js';
import { metrics as graphMetrics } from '../graph/GraphMetrics.js';
import db               from '../config/db.js';

const MS_PER_DAY = 86_400_000;
function since(days) { return new Date(Date.now() - days * MS_PER_DAY); }

// ── Domain definitions ────────────────────────────────────────────────────────

const DOMAINS = ['engineering', 'infrastructure', 'support', 'sales', 'finance', 'hr', 'security', 'operations'];

/**
 * Compute health for all domains + overall.
 *
 * @param {string} workspaceId
 * @param {object} [opts]
 * @param {number} [opts.windowDays=30]
 * @returns {Promise<HealthReport>}
 */
export async function computeHealth(workspaceId, { windowDays = 30 } = {}) {
  const ws = String(workspaceId);

  const [kpiReport, predReport, gMetrics] = await Promise.allSettled([
    computeKPIs(ws, { windowDays }),
    predict(ws, { persist: false }),
    graphMetrics(ws),
  ]);

  const kpis        = kpiReport.status === 'fulfilled'   ? kpiReport.value.kpis : [];
  const predictions = predReport.status === 'fulfilled'  ? predReport.value.predictions : [];
  const graph       = gMetrics.status === 'fulfilled'    ? gMetrics.value : null;

  const domainScores = await Promise.all(
    DOMAINS.map(domain => _scoreDomain(ws, domain, { kpis, predictions, graph, windowDays }))
  );

  const overall = _computeOverall(domainScores);

  return {
    workspaceId: ws,
    generatedAt: new Date().toISOString(),
    windowDays,
    overall,
    domains: domainScores,
  };
}

/**
 * Single domain health.
 */
export async function computeDomainHealth(workspaceId, domain, { windowDays = 30 } = {}) {
  const ws = String(workspaceId);
  if (!DOMAINS.includes(domain)) throw new Error(`Unknown domain: ${domain}`);

  const [kpiReport, predReport] = await Promise.allSettled([
    computeKPIs(ws, { windowDays }),
    predict(ws, { persist: false }),
  ]);

  const kpis        = kpiReport.status === 'fulfilled'  ? kpiReport.value.kpis : [];
  const predictions = predReport.status === 'fulfilled' ? predReport.value.predictions : [];

  return _scoreDomain(ws, domain, { kpis, predictions, graph: null, windowDays });
}

// ── Domain scorers ────────────────────────────────────────────────────────────

async function _scoreDomain(ws, domain, { kpis, predictions, graph, windowDays }) {
  const domainKpis  = kpis.filter(k => k.domain === domain);
  const domainPreds = predictions.filter(p => p.domain === domain);

  let score       = 100;
  const evidence  = [];
  const recs      = [];
  const signals   = [];

  // ── Score from KPIs ──────────────────────────────────────────────────────
  for (const kpi of domainKpis) {
    const penalty = _kpiPenalty(kpi);
    if (penalty > 0) {
      score -= penalty;
      signals.push({ source: 'kpi', name: kpi.name, value: kpi.value, penalty });
      evidence.push(`${kpi.label}: ${kpi.value ?? 'N/A'} ${kpi.unit} (${kpi.confidence})`);
    }
  }

  // ── Score from predictions ────────────────────────────────────────────────
  const highRiskPreds = domainPreds.filter(p => p.riskScore >= 70 && !p.insufficient);
  const medRiskPreds  = domainPreds.filter(p => p.riskScore >= 40 && p.riskScore < 70 && !p.insufficient);

  score -= highRiskPreds.length * 8;
  score -= medRiskPreds.length  * 4;

  for (const p of highRiskPreds) {
    signals.push({ source: 'prediction', type: p.type, riskScore: p.riskScore });
    evidence.push(`High risk: ${p.prediction} (${p.riskScore}% risk)`);
    if (p.preventiveActions?.length) recs.push({ title: p.preventiveActions[0], source: 'prediction', severity: 'high' });
  }

  // ── Domain-specific signals ───────────────────────────────────────────────
  const domainExtra = await _domainSpecificSignals(ws, domain, windowDays);
  score -= domainExtra.penalty;
  evidence.push(...domainExtra.evidence);
  recs.push(...domainExtra.recommendations);
  signals.push(...domainExtra.signals);

  // ── Graph bonus ───────────────────────────────────────────────────────────
  if (domain === 'knowledge' && graph) {
    const siloRatio = graph.nodeCount > 0 ? graph.orphanNodes / graph.nodeCount : 0;
    if (siloRatio > 0.3) { score -= 10; evidence.push(`${Math.round(siloRatio * 100)}% of graph nodes are isolated`); }
  }

  score = Math.max(0, Math.min(100, Math.round(score)));

  // ── Trend: compare to prediction direction ────────────────────────────────
  const trendSignal = _deriveTrend(domainKpis, domainPreds);

  // ── Confidence ────────────────────────────────────────────────────────────
  const measuredKpis = domainKpis.filter(k => k.confidence === 'measured').length;
  const confidence = measuredKpis >= 2 ? 'high' : measuredKpis === 1 ? 'medium' : 'low';

  return {
    domain,
    score,
    state:     _scoreToState(score),
    trend:     trendSignal,
    confidence,
    evidence:  evidence.slice(0, 8),
    recommendations: recs.slice(0, 3),
    signals,
  };
}

async function _domainSpecificSignals(ws, domain, windowDays) {
  const result = { penalty: 0, evidence: [], recommendations: [], signals: [] };

  try {
    switch (domain) {
      case 'engineering': {
        const { rows } = await db.query(
          `SELECT COUNT(*)::int c FROM flow_events
            WHERE workspace_id = $1 AND event_type = 'deployment.failed' AND ts >= $2`,
          [ws, since(windowDays)],
        );
        const failures = rows[0]?.c ?? 0;
        if (failures > 0) {
          result.penalty += Math.min(failures * 5, 20);
          result.evidence.push(`${failures} failed deployments in past ${windowDays} days`);
          result.signals.push({ source: 'event', type: 'deployment.failed', count: failures });
          if (failures > 3) result.recommendations.push({ title: 'Investigate deployment pipeline failures', source: 'health', severity: 'high' });
        }
        break;
      }
      case 'infrastructure': {
        const { rows } = await db.query(
          `SELECT
             COUNT(*) FILTER (WHERE event_type = 'incident.created')::int AS created,
             COUNT(*) FILTER (WHERE event_type = 'incident.resolved')::int AS resolved
            FROM flow_events
           WHERE workspace_id = $1 AND ts >= $2`,
          [ws, since(windowDays)],
        );
        const open = Math.max(0, (rows[0]?.created ?? 0) - (rows[0]?.resolved ?? 0));
        if (open > 0) {
          result.penalty += Math.min(open * 10, 30);
          result.evidence.push(`${open} open incidents`);
          result.signals.push({ source: 'event', type: 'open_incidents', count: open });
          if (open >= 2) result.recommendations.push({ title: 'Resolve open infrastructure incidents', source: 'health', severity: 'critical' });
        }
        break;
      }
      case 'security': {
        const { rows } = await db.query(
          `SELECT COUNT(*)::int c FROM flow_events
            WHERE workspace_id = $1 AND event_type LIKE 'security.%' AND ts >= $2`,
          [ws, since(windowDays)],
        );
        const alerts = rows[0]?.c ?? 0;
        if (alerts > 0) {
          result.penalty += Math.min(alerts * 15, 40);
          result.evidence.push(`${alerts} security events in past ${windowDays} days`);
          result.signals.push({ source: 'event', type: 'security_alerts', count: alerts });
          result.recommendations.push({ title: 'Review security alerts and patch dependencies', source: 'health', severity: 'critical' });
        }
        break;
      }
      case 'support': {
        const { rows } = await db.query(
          `SELECT COUNT(*) FILTER (WHERE event_type = 'support.ticket.escalated')::int AS escalations
             FROM flow_events WHERE workspace_id = $1 AND ts >= $2`,
          [ws, since(windowDays)],
        );
        const esc = rows[0]?.escalations ?? 0;
        if (esc > 0) {
          result.penalty += Math.min(esc * 5, 15);
          result.evidence.push(`${esc} support escalations in past ${windowDays} days`);
        }
        break;
      }
      case 'hr': {
        const { rows } = await db.query(
          `SELECT COUNT(*) FILTER (WHERE event_type = 'employee.offboarded')::int AS departures
             FROM flow_events WHERE workspace_id = $1 AND ts >= $2`,
          [ws, since(windowDays)],
        );
        const dep = rows[0]?.departures ?? 0;
        if (dep > 2) {
          result.penalty += Math.min(dep * 5, 20);
          result.evidence.push(`${dep} employee departures in past ${windowDays} days`);
          result.recommendations.push({ title: 'Investigate attrition drivers', source: 'health', severity: 'high' });
        }
        break;
      }
      default: break;
    }
  } catch { /* best-effort */ }

  return result;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _kpiPenalty(kpi) {
  if (kpi.value === null || kpi.confidence === 'insufficient') return 0;
  if (kpi.trend === 'degraded') return 10;
  return 0;
}

function _scoreToState(score) {
  if (score >= 85) return 'healthy';
  if (score >= 65) return 'at_risk';
  if (score >= 40) return 'degraded';
  return 'critical';
}

function _deriveTrend(kpis, preds) {
  const downKpis  = kpis.filter(k => k.trend === 'down' || k.trend === 'degraded').length;
  const upKpis    = kpis.filter(k => k.trend === 'up' || k.trend === 'good').length;
  const risingPreds = preds.filter(p => p.trend === 'rising').length;
  const fallingPreds = preds.filter(p => p.trend === 'falling').length;

  if (downKpis > upKpis || risingPreds > fallingPreds) return 'declining';
  if (upKpis > downKpis || fallingPreds > risingPreds) return 'improving';
  return 'stable';
}

function _computeOverall(domainScores) {
  const weights = {
    engineering:    0.20,
    infrastructure: 0.15,
    support:        0.10,
    sales:          0.15,
    finance:        0.10,
    hr:             0.10,
    security:       0.15,
    operations:     0.05,
  };

  let weighted = 0;
  let totalW   = 0;
  const allEvidence = [];
  const allRecs     = [];

  for (const d of domainScores) {
    const w = weights[d.domain] ?? 0.1;
    weighted += d.score * w;
    totalW   += w;
    if (d.state === 'critical' || d.state === 'degraded') allEvidence.push(`${d.domain}: ${d.state} (${d.score})`);
    allRecs.push(...d.recommendations);
  }

  const score = Math.round(weighted / totalW);
  const critical = domainScores.filter(d => d.state === 'critical');

  return {
    score,
    state:           _scoreToState(score),
    trend:           _aggregateTrend(domainScores),
    confidence:      _aggregateConfidence(domainScores),
    criticalDomains: critical.map(d => d.domain),
    evidence:        allEvidence.slice(0, 6),
    recommendations: allRecs.slice(0, 5),
  };
}

function _aggregateTrend(domains) {
  const declining = domains.filter(d => d.trend === 'declining').length;
  const improving = domains.filter(d => d.trend === 'improving').length;
  if (declining > improving) return 'declining';
  if (improving > declining) return 'improving';
  return 'stable';
}

function _aggregateConfidence(domains) {
  const high = domains.filter(d => d.confidence === 'high').length;
  if (high >= 4) return 'high';
  if (high >= 2) return 'medium';
  return 'low';
}
