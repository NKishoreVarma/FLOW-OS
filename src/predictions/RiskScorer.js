/**
 * RiskScorer — turns a model's probability + trend into a bounded risk score and
 * level. Rising trends amplify, falling trends dampen. Deterministic.
 */

const clamp = (n) => Math.max(0, Math.min(100, Math.round(n)));
export const level = (s) => (s >= 75 ? 'critical' : s >= 55 ? 'high' : s >= 30 ? 'moderate' : 'low');

export function scoreRisk(prediction) {
  const p = (prediction.probability || 0) * 100;
  const trendAdj = prediction.trend
    ? (prediction.trend.direction === 'rising' ? 8 : prediction.trend.direction === 'falling' ? -8 : 0)
    : 0;
  const score = prediction.insufficient ? clamp(p) : clamp(p + trendAdj);
  return { riskScore: score, riskLevel: level(score) };
}
