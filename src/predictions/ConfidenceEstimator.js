/**
 * ConfidenceEstimator — how much to trust a prediction, from the amount and
 * recency of the evidence behind it and the depth of history. Low when a model
 * flags insufficient signal — the engine never projects confidence it lacks.
 */

const clamp = (n) => Math.max(0, Math.min(100, Math.round(n)));

export function estimateConfidence(prediction, ctx) {
  if (prediction.insufficient) return { score: 20, level: 'very_low', note: 'Insufficient evidence — treat as a weak signal.' };

  let c = 40;
  c += Math.min(20, (prediction.evidence?.length || 0) * 8);   // evidence quantity
  c += Math.min(15, (prediction.drivers?.length || 0) * 5);    // distinct drivers
  c += Math.min(15, (ctx.windowDays / 60) * 15);               // history depth
  if (prediction.trend && !prediction.trend.insufficient) c += 10; // a real trend exists
  if (prediction.simulation) c += 5;                            // corroborated by simulation

  const score = clamp(c);
  const lv = score >= 80 ? 'very_high' : score >= 65 ? 'high' : score >= 45 ? 'moderate' : score >= 30 ? 'low' : 'very_low';
  return { score, level: lv, note: `Based on ${prediction.evidence?.length || 0} evidence point(s) over ${ctx.windowDays} days.` };
}
