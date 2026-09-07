/**
 * RiskCalculator — a single overall risk score from the estimated impacts,
 * weighted by scenario likelihood and criticality (blast radius, customer
 * exposure). Names the top risk drivers so the score is explainable.
 */

const clamp = (n) => Math.max(0, Math.min(100, Math.round(n)));
const level = (s) => (s >= 80 ? 'critical' : s >= 60 ? 'high' : s >= 35 ? 'moderate' : 'low');

export function calculate(impact, findings, plan) {
  const dims = [
    { name: 'business', score: impact.business.score, w: 0.25 },
    { name: 'customer', score: impact.customer.score, w: 0.25 },
    { name: 'engineering', score: impact.engineering.score, w: 0.2 },
    { name: 'operational', score: impact.operational.score, w: 0.15 },
    { name: 'knowledge loss', score: impact.knowledgeLoss.score, w: 0.15 },
  ];
  let weighted = dims.reduce((s, d) => s + d.score * d.w, 0);

  // Criticality multiplier from raw blast radius.
  const impacted = impact.cascade?.impactedCount || 0;
  const criticality = 1 + Math.min(0.25, impacted / 400);
  // Likelihood tilts the score toward/away from urgency.
  const likelihood = plan.likelihood ?? 0.5;

  const raw = weighted * criticality * (0.7 + likelihood * 0.6);
  const score = clamp(raw);

  const drivers = dims.filter(d => d.score >= 45).sort((a, b) => b.score - a.score)
    .map(d => ({ driver: d.name, score: d.score }));
  if (impacted > 20) drivers.unshift({ driver: 'blast radius', score: clamp(impacted) });

  return {
    score, level: level(score),
    likelihood, criticality: +criticality.toFixed(2),
    drivers: drivers.slice(0, 5),
    summary: `${level(score).toUpperCase()} risk (${score}/100) — driven by ${drivers.slice(0, 2).map(d => d.driver).join(' and ') || 'limited exposure'}.`,
  };
}
