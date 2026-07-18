/**
 * AnomalyPredictor — flags when a current value deviates from its own recent
 * baseline. Deterministic z-score-style deviation over the series' own history
 * (mean + standard deviation), not a trained model.
 */

export function deviation(series = []) {
  const counts = series.map(s => (typeof s === 'number' ? s : s.count || 0));
  if (counts.length < 4) return { anomaly: false, z: 0, insufficient: true };

  const baseline = counts.slice(0, -1);
  const current = counts[counts.length - 1];
  const mean = baseline.reduce((s, n) => s + n, 0) / baseline.length;
  const variance = baseline.reduce((s, n) => s + (n - mean) ** 2, 0) / baseline.length;
  const std = Math.sqrt(variance) || 1;
  const z = +((current - mean) / std).toFixed(2);

  return { anomaly: Math.abs(z) >= 1.5, z, current, mean: +mean.toFixed(2), direction: z > 0 ? 'above' : 'below', insufficient: false };
}
