import { query } from '../../config/db.js';

export const DOMAIN = 'executiveIntelligence';

export async function evaluate(workspaceId) {
  const metrics = {};
  const findings = [];

  // ── Briefing existence & citation coverage ────────────────────────────────
  try {
    const r = await query(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE summary IS NOT NULL AND summary != '') AS has_summary,
              COUNT(*) FILTER (WHERE metadata->>'evidenceCount' IS NOT NULL) AS has_citations
       FROM "Briefing"
       WHERE "workspaceId" = $1
         AND "createdAt" > NOW() - INTERVAL '30 days'`,
      [workspaceId]
    );
    const row = r.rows[0] ?? {};
    metrics.totalBriefings    = row.total ?? 0;
    metrics.citationCoverage  = row.total > 0 ? Math.round((row.has_citations / row.total) * 100) : null;
    metrics.summaryPresence   = row.total > 0 ? Math.round((row.has_summary   / row.total) * 100) : null;

    if (metrics.totalBriefings === 0) findings.push('No briefings generated in the last 30 days.');
    if (metrics.citationCoverage !== null && metrics.citationCoverage < 50)
      findings.push(`Citation coverage low: ${metrics.citationCoverage}% of briefings cite evidence.`);
  } catch {
    metrics.briefingQueryError = true;
  }

  // ── Recommendation usefulness (accepted vs rejected) ─────────────────────
  try {
    const r = await query(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE status = 'accepted') AS accepted,
              COUNT(*) FILTER (WHERE status = 'rejected') AS rejected
       FROM "BriefingRecommendation"
       WHERE "workspaceId" = $1
         AND "createdAt" > NOW() - INTERVAL '30 days'`,
      [workspaceId]
    );
    const row = r.rows[0] ?? {};
    metrics.totalRecommendations  = row.total ?? 0;
    metrics.recommendationAcceptance =
      row.total > 0 ? Math.round((row.accepted / row.total) * 100) : null;

    if (metrics.recommendationAcceptance !== null && metrics.recommendationAcceptance < 40)
      findings.push(`Only ${metrics.recommendationAcceptance}% of recommendations accepted.`);
  } catch {
    metrics.recommendationQueryError = true;
  }

  // ── Hallucination proxy: briefings with no evidence but a long summary ────
  try {
    const r = await query(
      `SELECT COUNT(*)::int AS long_no_evidence
       FROM "Briefing"
       WHERE "workspaceId" = $1
         AND "createdAt" > NOW() - INTERVAL '30 days'
         AND LENGTH(summary) > 300
         AND (metadata->>'evidenceCount' IS NULL OR (metadata->>'evidenceCount')::int = 0)`,
      [workspaceId]
    );
    const bare = r.rows[0]?.long_no_evidence ?? 0;
    const total = metrics.totalBriefings ?? 0;
    metrics.hallucinationProxy = total > 0 ? Math.round((bare / total) * 100) : 0;
    if (metrics.hallucinationProxy > 20)
      findings.push(`${metrics.hallucinationProxy}% of briefings contain long summaries with zero evidence — potential hallucination risk.`);
  } catch {
    metrics.hallucinationProxy = 0;
  }

  // ── Score calculation ─────────────────────────────────────────────────────
  const citationScore  = metrics.citationCoverage  ?? 50;
  const summaryScore   = metrics.summaryPresence   ?? 50;
  const acceptScore    = metrics.recommendationAcceptance ?? 60;
  const noHalluScore   = 100 - (metrics.hallucinationProxy ?? 0);
  const hasBriefings   = (metrics.totalBriefings ?? 0) > 0 ? 100 : 0;

  const score = Math.round(
    citationScore  * 0.25 +
    summaryScore   * 0.20 +
    acceptScore    * 0.20 +
    noHalluScore   * 0.25 +
    hasBriefings   * 0.10
  );

  if (metrics.totalBriefings === 0) {
    return { domain: DOMAIN, score: null, status: 'insufficient_data', metrics, findings };
  }

  return { domain: DOMAIN, score, metrics, findings };
}
