/**
 * ForecastEngine — projects a trend forward over a horizon by linear
 * extrapolation of the recent rate. Deterministic and explainable: "at the
 * current +X%/window rate, expect ~Y over the next N days."
 */

/**
 * @param {{recent:number, changePct:number}} t  a TrendAnalyzer result
 * @param {number} horizonDays
 * @returns {{ projected, horizonDays, ratePerDay, basis }}
 */
export function project(t, horizonDays = 14) {
  const ratePerDay = t.recent || 0;
  const growth = 1 + (t.changePct || 0) / 100;
  const projected = +(ratePerDay * horizonDays * growth).toFixed(1);
  return {
    projected,
    horizonDays,
    ratePerDay: +ratePerDay.toFixed(2),
    basis: `Recent rate ${ratePerDay.toFixed(2)}/day, trend ${t.changePct >= 0 ? '+' : ''}${t.changePct}% → ~${projected} over ${horizonDays}d.`,
  };
}

/** Map a 0..1 base signal + trend into a bounded probability. */
export function toProbability(base, trendResult, weight = 0.25) {
  const nudge = trendResult ? (trendResult.direction === 'rising' ? weight : trendResult.direction === 'falling' ? -weight : 0) : 0;
  return Math.max(0, Math.min(1, base + nudge));
}

export function horizonFor(type) {
  return {
    INCIDENT_PROBABILITY: '14 days', DEPLOYMENT_RISK: 'next deployment', SPRINT_DELAY: 'current sprint',
    PR_BOTTLENECK: '7 days', REVIEW_DELAY: '7 days', CODE_OWNERSHIP_RISK: '30 days',
    BURNOUT_RISK: '30 days', KNOWLEDGE_LOSS: '90 days', BUS_FACTOR: '90 days', EMPLOYEE_DEPENDENCY: '90 days',
    MEETING_OVERLOAD: '14 days', PRODUCTIVITY_TREND: '30 days',
    CHURN_RISK: '90 days', EXPANSION_OPPORTUNITY: '90 days', SUPPORT_ESCALATION: '14 days', RENEWAL_RISK: '90 days', CUSTOMER_HEALTH: '30 days',
    OPERATIONAL_HEALTH: '30 days', CAPACITY_RISK: '30 days', SECURITY_DRIFT: '30 days', INTEGRATION_FAILURE: '14 days', POLICY_VIOLATION: '30 days',
  }[type] || '30 days';
}
