import { query } from '../config/db.js';
import { getMetrics } from './pilotMetrics.js';

export async function buildDigest(workspaceId) {
  const [metrics, feedbackRes, actionsRes] = await Promise.all([
    getMetrics(workspaceId, 1),
    query(
      `SELECT COUNT(*)::int AS total,
              SUM(CASE WHEN thumbs = 'up' THEN 1 ELSE 0 END)::int AS positive
       FROM pilot_feedback
       WHERE workspace_id = $1 AND reported_at > NOW() - INTERVAL '1 day'`,
      [workspaceId]
    ),
    query(
      `SELECT COUNT(*)::int AS count
       FROM pilot_events
       WHERE workspace_id = $1 AND event = 'action.completed'
         AND ts > NOW() - INTERVAL '1 day'`,
      [workspaceId]
    ),
  ]);

  const todaySessions = metrics.dau[0]?.users ?? 0;
  const totalErrors =
    (metrics.errors['morning_brief.failed'] ?? 0) +
    (metrics.errors['action.failed'] ?? 0);
  const fb = feedbackRes.rows[0];

  return {
    date: new Date().toISOString().slice(0, 10),
    sessions: todaySessions,
    actionsCompleted: actionsRes.rows[0].count,
    errors: totalErrors,
    feedback: { total: fb.total ?? 0, positive: fb.positive ?? 0 },
    timeToFirstValueMs: metrics.timeToFirstValueMs,
  };
}

export function scheduleDigestCron() {
  const wsId = process.env.SIM_WORKSPACE_ID || 'workspace_corp_alpha';
  const run = () => buildDigest(wsId).catch(() => {});
  run();
  setInterval(run, 86_400_000);
}
