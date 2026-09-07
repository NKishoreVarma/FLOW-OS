import { query } from '../../config/db.js';

export const DOMAIN = 'predictionEngine';

export async function evaluate(workspaceId) {
  const metrics = {};
  const findings = [];

  // ── Prediction history from memory records ───────────────────────────────
  try {
    const r = await query(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE "createdAt" > NOW() - INTERVAL '7 days')::int AS recent,
              COUNT(DISTINCT metadata->>'domain')::int AS distinct_domains,
              AVG((metadata->>'probability')::numeric)::numeric AS avg_probability,
              AVG((metadata->>'confidence')::numeric)::numeric AS avg_confidence,
              COUNT(*) FILTER (WHERE (metadata->>'probability')::numeric > 0.8)::int AS high_confidence,
              COUNT(*) FILTER (WHERE metadata->>'outcome' IS NOT NULL)::int AS with_outcome,
              COUNT(*) FILTER (WHERE metadata->>'outcome' = 'correct')::int AS correct
       FROM "OrgMemoryRecord"
       WHERE "workspaceId" = $1
         AND type = 'PREDICTION'`,
      [workspaceId]
    );
    const row = r.rows[0] ?? {};
    metrics.totalPredictions    = row.total            ?? 0;
    metrics.recentPredictions   = row.recent           ?? 0;
    metrics.distinctDomains     = row.distinct_domains ?? 0;
    metrics.avgProbability      = parseFloat(row.avg_probability ?? 0).toFixed(2);
    metrics.avgConfidence       = parseFloat(row.avg_confidence  ?? 0).toFixed(2);
    metrics.highConfidenceCount = row.high_confidence  ?? 0;
    metrics.predictionsWithOutcome = row.with_outcome  ?? 0;
    metrics.correctPredictions  = row.correct          ?? 0;

    metrics.accuracyRate = metrics.predictionsWithOutcome > 0
      ? Math.round((metrics.correctPredictions / metrics.predictionsWithOutcome) * 100)
      : null;

    metrics.calibration = metrics.totalPredictions > 0
      ? Math.round((metrics.highConfidenceCount / metrics.totalPredictions) * 100)
      : null;

    if (metrics.totalPredictions === 0)
      findings.push('No prediction history found — prediction engine may not be running.');
    if (metrics.recentPredictions === 0 && metrics.totalPredictions > 0)
      findings.push('No predictions in the last 7 days — cron may not be running.');
    if (metrics.distinctDomains < 3 && metrics.totalPredictions > 0)
      findings.push(`Only ${metrics.distinctDomains} prediction domains covered.`);
    if (metrics.accuracyRate !== null && metrics.accuracyRate < 55)
      findings.push(`Prediction accuracy ${metrics.accuracyRate}% — below 55% threshold.`);
  } catch {
    return { domain: DOMAIN, score: null, status: 'insufficient_data', metrics, findings: ['OrgMemoryRecord not accessible.'] };
  }

  // ── False positive proxy: high-confidence predictions that were wrong ─────
  try {
    const r = await query(
      `SELECT COUNT(*)::int AS fp
       FROM "OrgMemoryRecord"
       WHERE "workspaceId" = $1
         AND type = 'PREDICTION'
         AND (metadata->>'probability')::numeric > 0.75
         AND metadata->>'outcome' = 'incorrect'`,
      [workspaceId]
    );
    metrics.falsePositives = r.rows[0]?.fp ?? 0;
    if (metrics.falsePositives > 5)
      findings.push(`${metrics.falsePositives} high-confidence predictions were incorrect (false positives).`);
  } catch {
    metrics.falsePositives = 0;
  }

  if (metrics.totalPredictions === 0) {
    return { domain: DOMAIN, score: null, status: 'insufficient_data', metrics, findings };
  }

  // ── Score ─────────────────────────────────────────────────────────────────
  const hasHistory    = metrics.totalPredictions > 0    ? 100 : 0;
  const hasCoverage   = Math.min(100, metrics.distinctDomains * 15);
  const hasRecent     = metrics.recentPredictions > 0   ? 100 : 20;
  const accuracyScore = metrics.accuracyRate            ?? 60;
  const calibScore    = metrics.calibration             ?? 50;
  const noFP          = Math.max(0, 100 - metrics.falsePositives * 10);

  const score = Math.round(
    hasHistory   * 0.15 +
    hasCoverage  * 0.15 +
    hasRecent    * 0.15 +
    accuracyScore * 0.30 +
    calibScore   * 0.15 +
    noFP         * 0.10
  );

  return { domain: DOMAIN, score, metrics, findings };
}
