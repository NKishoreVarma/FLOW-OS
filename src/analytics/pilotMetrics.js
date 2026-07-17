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
