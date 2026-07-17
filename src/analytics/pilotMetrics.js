import { query } from '../config/db.js';

export async function getMetrics(workspaceId, days = 14) {
  const [dauRes, featureRes, errorRes, ttfvRes] = await Promise.all([
    query(
      `SELECT DATE(ts) AS day, COUNT(DISTINCT user_id)::int AS users
       FROM pilot_events
       WHERE workspace_id = $1 AND event = 'session.start'
         AND ts > NOW() - ($2::int * INTERVAL '1 day')
       GROUP BY day ORDER BY day`,
      [workspaceId, days]
    ),
    query(
      `SELECT properties->>'route' AS route, COUNT(*)::int AS count
       FROM pilot_events
       WHERE workspace_id = $1 AND event = 'feature.visited'
         AND ts > NOW() - ($2::int * INTERVAL '1 day')
       GROUP BY route ORDER BY count DESC LIMIT 10`,
      [workspaceId, days]
    ),
    query(
      `SELECT event, COUNT(*)::int AS count
       FROM pilot_events
       WHERE workspace_id = $1
         AND event IN ('morning_brief.failed', 'action.failed')
         AND ts > NOW() - ($2::int * INTERVAL '1 day')
       GROUP BY event`,
      [workspaceId, days]
    ),
    query(
      `SELECT AVG(EXTRACT(EPOCH FROM (b.ts - a.ts)) * 1000)::int AS avg_ms
       FROM pilot_events a
       JOIN pilot_events b
         ON a.workspace_id = b.workspace_id
        AND a.user_id      = b.user_id
        AND a.event        = 'session.start'
        AND b.event        = 'morning_brief.loaded'
        AND b.ts > a.ts
        AND b.ts < a.ts + INTERVAL '5 minutes'
       WHERE a.workspace_id = $1
         AND a.ts > NOW() - ($2::int * INTERVAL '1 day')`,
      [workspaceId, days]
    ),
  ]);

  return {
    dau: dauRes.rows.map(r => ({ day: r.day, users: r.users })),
    featureEngagement: featureRes.rows.map(r => ({ route: r.route, count: r.count })),
    errors: Object.fromEntries(errorRes.rows.map(r => [r.event, r.count])),
    timeToFirstValueMs: ttfvRes.rows[0]?.avg_ms ?? null,
  };
}

/**
 * FLOW Efficiency — how much work is being completed inside FLOW vs. dismissed.
 * Reads pilot_events WHERE event IN ('action.accepted','action.dismissed','workflow.started','workflow.completed').
 * Plus execution_records for execution success rate.
 */
export async function getEfficiencyMetrics(workspaceId, days = 7) {
  try {
    const [eventsRes, execRes] = await Promise.all([
      query(
        `SELECT event, COUNT(*)::int AS n
         FROM pilot_events
         WHERE workspace_id = $1
           AND event IN ('action.accepted','action.dismissed','workflow.started','workflow.completed')
           AND ts > NOW() - ($2::int * INTERVAL '1 day')
         GROUP BY event`,
        [workspaceId, days]
      ),
      query(
        `SELECT status, COUNT(*)::int AS n
         FROM execution_records
         WHERE workspace_id = $1
           AND created_at > NOW() - ($2::int * INTERVAL '1 day')
         GROUP BY status`,
        [workspaceId, days]
      ),
    ]);

    const ev = Object.fromEntries(eventsRes.rows.map(r => [r.event, r.n]));
    const ex = Object.fromEntries(execRes.rows.map(r => [r.status, r.n]));

    const accepted  = ev['action.accepted'] || 0;
    const dismissed = ev['action.dismissed'] || 0;
    const totalShown = accepted + dismissed;
    const acceptanceRate = totalShown > 0 ? Math.round((accepted / totalShown) * 100) : null;

    const wStarted   = ev['workflow.started'] || 0;
    const wCompleted = ev['workflow.completed'] || 0;
    const completionRate = wStarted > 0 ? Math.round((wCompleted / wStarted) * 100) : null;

    const executed = ex['EXECUTED'] || 0;
    const failed   = ex['FAILED'] || 0;
    const executionSuccessRate = (executed + failed) > 0 ? Math.round((executed / (executed + failed)) * 100) : null;

    return {
      actionsAccepted: accepted,
      actionsDismissed: dismissed,
      acceptanceRate,
      workflowsStarted: wStarted,
      workflowsCompleted: wCompleted,
      workflowCompletionRate: completionRate,
      executionSuccessRate,
      executedTotal: executed,
      failedTotal: failed,
      evidenceSource: 'pilot_events + execution_records',
    };
  } catch {
    return {
      actionsAccepted: 0,
      actionsDismissed: 0,
      acceptanceRate: null,
      workflowsStarted: 0,
      workflowsCompleted: 0,
      workflowCompletionRate: null,
      executionSuccessRate: null,
      executedTotal: 0,
      failedTotal: 0,
      evidenceSource: 'pilot_events + execution_records',
    };
  }
}
