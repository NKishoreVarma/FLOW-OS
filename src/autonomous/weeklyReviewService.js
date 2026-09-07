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

  // Phase 7 — Workspace pattern recognition
  const patterns = [];

  try {
    // Stale PRs — PRs older than 3 days (graph nodes with type PR and old createdAt)
    const stalePRs = await prisma.graphNode.findMany({
      where: {
        workspaceId,
        type: 'PR',
        createdAt: { lt: new Date(Date.now() - 3 * 86_400_000) },
      },
      orderBy: { createdAt: 'asc' },
      take: 10,
      select: { name: true, createdAt: true, metadata: true },
    });
    if (stalePRs.length > 0) {
      const oldest = stalePRs[0];
      const ageDays = Math.round((Date.now() - new Date(oldest.createdAt).getTime()) / 86_400_000);
      patterns.push({
        type: 'stale_prs',
        title: `${stalePRs.length} PRs open 3+ days`,
        detail: `Oldest: "${oldest.name}" (${ageDays}d). Code review bottleneck may be slowing delivery.`,
        severity: stalePRs.length > 5 ? 'high' : 'medium',
        evidenceSource: 'knowledge_graph',
      });
    }

    // Recurring incidents — same incident type appearing 2+ times
    const recentIncidents = await prisma.orgMemoryRecord.findMany({
      where: { workspaceId, type: 'INCIDENT', createdAt: { gte: since } },
      select: { title: true, tags: true, createdAt: true },
      take: 20,
    });
    if (recentIncidents.length >= 2) {
      const tagFreq = {};
      recentIncidents.forEach(i => {
        (i.tags || []).forEach(t => { tagFreq[t] = (tagFreq[t] || 0) + 1; });
      });
      const recurring = Object.entries(tagFreq).filter(([, c]) => c >= 2).map(([t]) => t);
      if (recurring.length > 0) {
        patterns.push({
          type: 'recurring_incidents',
          title: `Recurring incidents: ${recurring.slice(0, 3).join(', ')}`,
          detail: `${recentIncidents.length} incidents in ${days}d. Tags appear repeatedly — consider a root cause review.`,
          severity: 'high',
          evidenceSource: 'org_memory',
        });
      }
    }

    // Skipped meetings — notification MEETING type not acted on (best-effort using notifications)
    const meetingNotifs = await prisma.notification.findMany({
      where: {
        workspaceId,
        type: { contains: 'MEETING', mode: 'insensitive' },
        createdAt: { gte: since },
      },
      select: { title: true, body: true, createdAt: true },
      take: 20,
    }).catch(() => []);
    if (meetingNotifs.length >= 3) {
      patterns.push({
        type: 'meeting_load',
        title: `${meetingNotifs.length} meeting notifications this week`,
        detail: 'High meeting volume detected. Consider blocking focus time or delegating recurring syncs.',
        severity: meetingNotifs.length > 8 ? 'high' : 'medium',
        evidenceSource: 'notifications',
      });
    }
  } catch { /* pattern analysis is best-effort */ }

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
    patterns,
  };
}
