import { query } from '../../config/db.js';

export const DOMAIN = 'executiveReports';

const REPORT_TYPES = ['morning_brief', 'weekly_brief', 'board_brief', 'investor_brief'];

// Minimum quality criteria per brief type
const CRITERIA = {
  morning_brief:   { minLength: 100, needsRecommendations: true,  needsCitations: false },
  weekly_brief:    { minLength: 200, needsRecommendations: true,  needsCitations: true  },
  board_brief:     { minLength: 400, needsRecommendations: true,  needsCitations: true  },
  investor_brief:  { minLength: 300, needsRecommendations: false, needsCitations: true  },
};

export async function evaluate(workspaceId) {
  const metrics = {};
  const findings = [];
  const typeScores = {};

  for (const briefType of REPORT_TYPES) {
    const criteria = CRITERIA[briefType];
    try {
      const r = await query(
        `SELECT COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE LENGTH(summary) >= $3)::int     AS meets_length,
                COUNT(*) FILTER (WHERE metadata->>'evidenceCount' IS NOT NULL AND
                                       (metadata->>'evidenceCount')::int > 0)::int AS has_citations,
                COUNT(*) FILTER (WHERE metadata->>'recommendationCount' IS NOT NULL AND
                                       (metadata->>'recommendationCount')::int > 0)::int AS has_recs,
                MAX("createdAt") AS latest_at
         FROM "Briefing"
         WHERE "workspaceId" = $1
           AND "briefType" = $2
           AND "createdAt" > NOW() - INTERVAL '30 days'`,
        [workspaceId, briefType, criteria.minLength]
      );
      const row = r.rows[0] ?? {};
      const total = row.total ?? 0;
      metrics[`${briefType}_count`] = total;
      metrics[`${briefType}_latest`] = row.latest_at ?? null;

      if (total === 0) {
        typeScores[briefType] = null;
        if (briefType === 'morning_brief') findings.push('Morning Brief has not been generated in 30 days.');
        continue;
      }

      const lengthScore = Math.round((row.meets_length / total) * 100);
      const recScore    = criteria.needsRecommendations
        ? Math.round((row.has_recs / total) * 100)
        : 100;
      const citScore    = criteria.needsCitations
        ? Math.round((row.has_citations / total) * 100)
        : 100;

      typeScores[briefType] = Math.round((lengthScore + recScore + citScore) / 3);

      if (recScore < 60 && criteria.needsRecommendations)
        findings.push(`${briefType}: only ${recScore}% include recommendations.`);
      if (citScore < 60 && criteria.needsCitations)
        findings.push(`${briefType}: only ${citScore}% include cited evidence.`);
    } catch {
      typeScores[briefType] = null;
    }
  }

  metrics.typeScores = typeScores;

  // ── Coverage: how many brief types have been generated ───────────────────
  const coveredTypes = REPORT_TYPES.filter(t => (metrics[`${t}_count`] ?? 0) > 0).length;
  metrics.briefTypeCoverage = coveredTypes;
  if (coveredTypes < 2)
    findings.push(`Only ${coveredTypes} of 4 brief types generated — coverage is low.`);

  const validScores = Object.values(typeScores).filter(s => s !== null);
  if (validScores.length === 0) {
    return { domain: DOMAIN, score: null, status: 'insufficient_data', metrics, findings };
  }

  const avgTypeScore   = Math.round(validScores.reduce((a, b) => a + b, 0) / validScores.length);
  const coverageScore  = Math.round((coveredTypes / REPORT_TYPES.length) * 100);
  const score          = Math.round(avgTypeScore * 0.75 + coverageScore * 0.25);

  return { domain: DOMAIN, score, metrics, findings };
}
