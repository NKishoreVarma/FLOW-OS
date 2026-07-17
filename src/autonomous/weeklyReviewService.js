/**
 * FLOW OS — Weekly Executive Review Service (Phase 19)
 *
 * Extends the existing Phase 17 getWeeklySummary() with:
 *   - Engineering velocity (PR/commit events from flow_events)
 *   - Execution success rate (execution_records)
 *   - Operational risks (top-3 from Prediction Engine)
 *   - Recommended priorities (NOW items from workday queue)
 *
 * Reuse only — no new DB tables. Every number is evidence-backed.
 */

import { getWeeklySummary } from '../success/successMetrics.js';
import { prisma }           from '../core/config/prisma.js';
import db                   from '../config/db.js';
import { predict }          from '../predictions/PredictionEngine.js';
import { getWorkQueue }     from '../workday/workdayEngine.js';

export async function getWeeklyReview(workspaceId, { days = 7 } = {}) {
  const since = new Date(Date.now() - days * 24 * 3_600_000);

  const [baseResult, execResult, predResult, queueResult] = await Promise.allSettled([
    getWeeklySummary(workspaceId, { sinceDays: days }),
    prisma.executionRecord.groupBy({
      by: ['status'],
      where: { workspaceId, createdAt: { gte: since } },
      _count: { _all: true },
    }),
    predict(workspaceId, {}),
    getWorkQueue(workspaceId, {}),
  ]);

  const base = baseResult.status === 'fulfilled' ? baseResult.value : { headline: [], detail: [] };
  const execGroups = execResult.status === 'fulfilled' ? execResult.value : [];
  const predictions = predResult.status === 'fulfilled' ? predResult.value.predictions || [] : [];
  const queue = queueResult.status === 'fulfilled' ? queueResult.value : { now: [] };

  // Execution success rate
  const totalExec = execGroups.reduce((s, g) => s + g._count._all, 0);
  const executedCount = (execGroups.find((g) => g.status === 'EXECUTED')?._count._all) || 0;
  const failedCount   = (execGroups.find((g) => g.status === 'FAILED')?._count._all) || 0;
  const executionSuccessRate = totalExec > 0 ? Math.round((executedCount / totalExec) * 100) : null;

  // Engineering velocity from flow_events
  let prsMerged = 0, deploymentsCompleted = 0;
  try {
    const evRes = await db.query(
      `SELECT
         COUNT(*) FILTER (WHERE (event_type = 'engineering' OR metadata->>'kind' = 'pull_request') AND metadata->>'action' = 'closed') ::int AS prs,
         COUNT(*) FILTER (WHERE event_type = 'deployment' OR metadata->>'kind' = 'deployment') ::int AS deploys
       FROM flow_events
       WHERE workspace_id = $1 AND ts >= $2`,
      [workspaceId, since.toISOString()],
    );
    prsMerged = evRes.rows[0]?.prs || 0;
    deploymentsCompleted = evRes.rows[0]?.deploys || 0;
  } catch { /* best-effort — table may not exist in all environments */ }

  // Top operational risks from predictions
  const operationalRisks = predictions
    .filter((p) => p.probability >= 0.5)
    .sort((a, b) => b.probability - a.probability)
    .slice(0, 3)
    .map((p) => ({
      prediction: p.prediction,
      probability: Math.round(p.probability * 100),
      trend: p.trend,
      timeHorizon: p.timeHorizon,
    }));

  // Recommended priorities from NOW queue
  const recommendedPriorities = (queue.now || []).slice(0, 3).map((item) => ({
    title: item.title,
    type: item.type,
    reason: item.reasons?.[0] || item.subtitle || '',
  }));

  return {
    window: { days, since: since.toISOString() },
    generatedAt: new Date().toISOString(),
    summary: base,
    engineeringVelocity: {
      prsMerged,
      deploymentsCompleted,
      evidenceSource: 'flow_events',
    },
    executionSuccessRate: {
      rate: executionSuccessRate,
      executed: executedCount,
      failed: failedCount,
      total: totalExec,
      evidenceSource: 'execution_records',
    },
    operationalRisks,
    recommendedPriorities,
  };
}
