/**
 * PredictionReporter — assembles the final prediction: the 8-field output plus a
 * deterministic explanation (why / evidence / historical comparisons / confidence
 * breakdown / missing evidence / alternative outcomes). Explanations are built
 * from the prediction's own real inputs — never opaque scores.
 */

import { horizonFor } from './ForecastEngine.js';

const DOMAIN_KW = {
  engineering: ['incident', 'deploy', 'sprint', 'pr', 'release'],
  people: ['departure', 'burnout', 'knowledge', 'offboard', 'attrition'],
  customers: ['customer', 'churn', 'renewal', 'escalat'],
  operations: ['incident', 'security', 'capacity', 'integration', 'policy'],
};

export function report(prediction, ctx) {
  const pct = Math.round((prediction.probability || 0) * 100);
  const horizon = horizonFor(prediction.type);

  return {
    type: prediction.type,
    domain: prediction.domain,
    label: prediction.label,
    prediction: statement(prediction, pct, horizon),
    probability: pct,
    riskScore: prediction.riskScore,
    riskLevel: prediction.riskLevel,
    confidence: prediction.confidence,
    timeHorizon: horizon,
    trend: prediction.trend || { direction: 'stable', changePct: 0 },
    supportingEvidence: prediction.evidence || [],
    businessImpact: businessImpact(prediction),
    preventiveActions: prediction.preventiveActions || [],
    target: prediction.target || null,
    insufficient: !!prediction.insufficient,
    explanation: explanation(prediction, ctx, pct),
  };
}

function statement(p, pct, horizon) {
  if (p.insufficient) return `Insufficient evidence to predict ${p.label.toLowerCase()} — monitoring.`;
  const who = p.target?.name ? ` (${p.target.name})` : '';
  return `${pct}% likelihood of ${p.label.toLowerCase()}${who} within ${horizon} — ${p.riskLevel} risk.`;
}

function businessImpact(p) {
  if (p.simulation) return { level: p.riskLevel, note: `Simulated impact: risk ${p.simulation.risk}${p.simulation.financial ? `, ~$${Number(p.simulation.financial).toLocaleString()}` : ''}.`, financial: p.simulation.financial || null };
  const noteByDomain = { engineering: 'Delivery/reliability exposure.', people: 'Team continuity and capacity exposure.', customers: 'Revenue and retention exposure.', operations: 'Operational stability exposure.' };
  return { level: p.riskLevel, note: noteByDomain[p.domain] || 'Operational exposure.', financial: null };
}

function explanation(p, ctx, pct) {
  const kws = DOMAIN_KW[p.domain] || [];
  const historical = (ctx.memory || [])
    .filter(m => kws.some(k => `${m.type} ${m.title || ''}`.toLowerCase().includes(k)))
    .slice(0, 3)
    .map(m => ({ when: m.createdAt, what: `${m.type}: ${m.title || ''}`.slice(0, 120) }));

  return {
    why: `${p.label}: ${(p.drivers || []).join('; ') || 'derived from workspace signals'}.`,
    evidence: p.evidence || [],
    historicalComparisons: historical,
    confidenceBreakdown: p.confidence,
    missingEvidence: p.insufficient ? (p.evidence || ['Not enough data in the window to score this reliably.']) : [],
    alternativeOutcomes: p.insufficient ? [] : [
      { outcome: 'higher', note: `If the ${p.trend?.direction === 'rising' ? 'current rise continues' : 'drivers intensify'}, likelihood exceeds ${Math.min(100, pct + 20)}%.` },
      { outcome: 'lower', note: `If the preventive actions are taken, likelihood drops below ${Math.max(0, pct - 25)}%.` },
    ],
  };
}
