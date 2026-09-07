/**
 * Executive Recommendation Engine — generates prioritized, evidence-backed recommendations.
 *
 * Sources:
 *   - Risk engine output
 *   - KPI degraded signals
 *   - Health score domain gaps
 *   - Prediction engine preventive actions
 *   - Execution failure patterns
 *   - Cognitive Brain agent outputs (optional — only when called with runBrain=true)
 *
 * Each recommendation:
 *   { title, severity, confidence, evidence[], estimatedBusinessImpact, suggestedWorkflow, approvalRequired, source, domain, score }
 */

import { detectRisks }    from './riskEngine.js';
import { computeHealth }  from './healthEngine.js';
import { computeKPIs }    from './kpiEngine.js';
import { predict }        from '../predictions/index.js';
import { listExecutionRecords } from '../execution/executionHistory.js';

/**
 * Generate prioritized executive recommendations.
 *
 * @param {string} workspaceId
 * @param {object} [opts]
 * @param {number} [opts.windowDays=30]
 * @param {number} [opts.limit=20]
 * @returns {Promise<RecommendationReport>}
 */
export async function generateRecommendations(workspaceId, { windowDays = 30, limit = 20 } = {}) {
  const ws = String(workspaceId);

  const [riskResult, healthResult, kpiResult, predResult, execResult] = await Promise.allSettled([
    detectRisks(ws, { windowDays, includePredictions: false }),
    computeHealth(ws, { windowDays }),
    computeKPIs(ws, { windowDays }),
    predict(ws, { persist: false }),
    listExecutionRecords(ws, { limit: 100, status: 'FAILED' }),
  ]);

  const risks    = riskResult.status   === 'fulfilled' ? riskResult.value.risks : [];
  const health   = healthResult.status === 'fulfilled' ? healthResult.value : null;
  const kpis     = kpiResult.status    === 'fulfilled' ? kpiResult.value.kpis : [];
  const preds    = predResult.status   === 'fulfilled' ? predResult.value.predictions : [];
  const failures = execResult.status   === 'fulfilled' ? execResult.value : [];

  const all = [
    ..._recsFromRisks(risks),
    ..._recsFromHealth(health),
    ..._recsFromKPIs(kpis),
    ..._recsFromPredictions(preds),
    ..._recsFromExecutionFailures(failures, windowDays),
  ];

  // Deduplicate by title, keep highest score
  const deduped = _deduplicateRecs(all);
  deduped.sort((a, b) => b.score - a.score);

  return {
    workspaceId: ws,
    generatedAt: new Date().toISOString(),
    windowDays,
    total:           deduped.length,
    recommendations: deduped.slice(0, limit),
  };
}

// ── Recommendation builders ───────────────────────────────────────────────────

function _recsFromRisks(risks) {
  return risks
    .filter(r => r.level === 'critical' || r.level === 'high')
    .flatMap(r => r.recommendations.map((title, i) => _rec({
      title,
      severity:    r.level === 'critical' ? 'critical' : 'high',
      confidence:  r.score >= 80 ? 'high' : 'medium',
      evidence:    r.evidence,
      estimatedBusinessImpact: _riskToImpact(r),
      suggestedWorkflow:       _riskToWorkflow(r),
      approvalRequired:        r.level === 'critical',
      source:      'risk_engine',
      domain:      _categoryToDomain(r.category),
      score:       r.score - (i * 5),
    })));
}

function _recsFromHealth(health) {
  if (!health) return [];
  const recs = [];

  for (const domain of (health.domains || [])) {
    if (domain.state === 'critical' || domain.state === 'degraded') {
      for (const r of (domain.recommendations || [])) {
        recs.push(_rec({
          title:       r.title || String(r),
          severity:    domain.state === 'critical' ? 'critical' : 'high',
          confidence:  domain.confidence,
          evidence:    domain.evidence.slice(0, 3),
          estimatedBusinessImpact: `${domain.domain} health at ${domain.score}/100 — at risk of operational impact`,
          suggestedWorkflow: `${domain.domain}_health_improvement`,
          approvalRequired: domain.state === 'critical',
          source: 'health_engine',
          domain: domain.domain,
          score:  100 - domain.score,
        }));
      }
    }
  }

  // Overall critical domains
  for (const cDomain of (health.overall?.criticalDomains ?? [])) {
    recs.push(_rec({
      title:       `Immediate action required: ${cDomain} is in critical state`,
      severity:    'critical',
      confidence:  health.overall.confidence,
      evidence:    [`${cDomain} health score in critical range`],
      estimatedBusinessImpact: `Critical ${cDomain} state risks business continuity`,
      suggestedWorkflow:       `escalate_${cDomain}_health`,
      approvalRequired:        true,
      source:      'health_engine',
      domain:      cDomain,
      score:       95,
    }));
  }

  return recs;
}

function _recsFromKPIs(kpis) {
  return kpis
    .filter(k => k.trend === 'degraded' && k.value !== null)
    .map(k => _rec({
      title:       `Improve ${k.label}: currently ${k.value}${k.unit} (degraded)`,
      severity:    'medium',
      confidence:  k.confidence === 'measured' ? 'high' : 'low',
      evidence:    k.evidence,
      estimatedBusinessImpact: `${k.label} below target threshold — operational efficiency impact`,
      suggestedWorkflow:       `improve_${k.name}`,
      approvalRequired:        false,
      source:      'kpi_engine',
      domain:      k.domain,
      score:       50,
    }));
}

function _recsFromPredictions(preds) {
  return preds
    .filter(p => p.riskScore >= 60 && !p.insufficient && p.preventiveActions?.length)
    .flatMap(p => p.preventiveActions.slice(0, 2).map((action, i) => _rec({
      title:       action,
      severity:    p.riskScore >= 80 ? 'high' : 'medium',
      confidence:  p.confidence?.level ?? 'medium',
      evidence:    p.evidence?.slice(0, 3).map(e => typeof e === 'string' ? e : (e.content || JSON.stringify(e))) || [],
      estimatedBusinessImpact: p.businessImpact?.summary || `Predicted ${p.type} risk at ${p.riskScore}%`,
      suggestedWorkflow:       `prevent_${p.type}`,
      approvalRequired:        p.riskScore >= 80,
      source:      'prediction_engine',
      domain:      p.domain,
      score:       p.riskScore - (i * 10),
    })));
}

function _recsFromExecutionFailures(failures, window) {
  if (!failures.length) return [];
  const recentMs = window * 86_400_000;
  const recent = failures.filter(f => Date.now() - new Date(f.createdAt).getTime() < recentMs);
  if (!recent.length) return [];

  return [_rec({
    title:       `Investigate ${recent.length} failed executions in past ${window} days`,
    severity:    recent.length >= 5 ? 'high' : 'medium',
    confidence:  'high',
    evidence:    recent.slice(0, 3).map(f => `${f.actionType || 'action'} failed: ${f.result?.error || 'unknown error'}`),
    estimatedBusinessImpact: `${recent.length} failed workflow executions may indicate connector or configuration issues`,
    suggestedWorkflow:       'audit_failed_executions',
    approvalRequired:        false,
    source:      'execution_history',
    domain:      'operations',
    score:       Math.min(70, recent.length * 10),
  })];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _rec(fields) {
  return {
    title:                   fields.title,
    severity:                fields.severity,
    confidence:              fields.confidence,
    evidence:                fields.evidence || [],
    estimatedBusinessImpact: fields.estimatedBusinessImpact,
    suggestedWorkflow:       fields.suggestedWorkflow,
    approvalRequired:        fields.approvalRequired ?? false,
    source:                  fields.source,
    domain:                  fields.domain,
    score:                   Math.max(0, Math.min(100, fields.score || 50)),
    generatedAt:             new Date().toISOString(),
  };
}

function _deduplicateRecs(recs) {
  const seen = new Map();
  for (const r of recs) {
    const key = r.title.toLowerCase().slice(0, 60);
    if (!seen.has(key) || seen.get(key).score < r.score) seen.set(key, r);
  }
  return Array.from(seen.values());
}

function _categoryToDomain(category) {
  const map = {
    release_risk: 'engineering', customer_churn: 'customers', security_risk: 'security',
    operational_bottleneck: 'operations', burnout: 'hr', approval_delay: 'operations',
    infrastructure_risk: 'infrastructure', knowledge_silo: 'knowledge', compliance_risk: 'compliance',
  };
  return map[category] || 'operations';
}

function _riskToImpact(risk) {
  const impacts = {
    release_risk: 'Deployment failures increase customer-visible downtime and reduce engineer velocity',
    customer_churn: 'Customer churn directly reduces ARR and increases cost of acquisition',
    security_risk: 'Security incidents risk data breach, regulatory fines, and reputational damage',
    operational_bottleneck: 'Blocked workflows delay product delivery and team productivity',
    burnout: 'Engineer burnout increases attrition cost ($150k+ per senior hire replacement)',
    approval_delay: 'Approval bottlenecks block time-sensitive business operations',
    infrastructure_risk: 'Infrastructure failures degrade product reliability and SLA performance',
    knowledge_silo: 'Single-contributor knowledge creates bus factor risk and onboarding friction',
    compliance_risk: 'Policy violations expose the company to regulatory and reputational risk',
  };
  return impacts[risk.category] || 'Operational risk requires immediate attention';
}

function _riskToWorkflow(risk) {
  const workflows = {
    release_risk: 'review_deployment_pipeline', customer_churn: 'activate_customer_success_playbook',
    security_risk: 'security_incident_response', operational_bottleneck: 'unblock_execution_queue',
    burnout: 'team_wellness_review', approval_delay: 'escalate_approval_requests',
    infrastructure_risk: 'incident_response', knowledge_silo: 'knowledge_transfer_sprint',
    compliance_risk: 'compliance_audit',
  };
  return workflows[risk.category] || 'operational_review';
}
