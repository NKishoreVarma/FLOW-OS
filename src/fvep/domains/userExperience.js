import { query } from '../../config/db.js';

export const DOMAIN = 'userExperience';

export async function evaluate(workspaceId) {
  const metrics = {};
  const findings = [];

  // ── Conversation success: depth + follow-ups ──────────────────────────────
  try {
    const r = await query(
      `SELECT COUNT(DISTINCT cc.id)::int AS total_conversations,
              AVG(msg_counts.cnt)::numeric AS avg_depth,
              COUNT(DISTINCT cc.id) FILTER (WHERE msg_counts.cnt >= 3)::int AS deep_conversations
       FROM "CopilotConversation" cc
       LEFT JOIN (
         SELECT "conversationId", COUNT(*) AS cnt
         FROM "CopilotMessage"
         GROUP BY "conversationId"
       ) msg_counts ON msg_counts."conversationId" = cc.id
       WHERE cc."workspaceId" = $1
         AND cc."createdAt" > NOW() - INTERVAL '30 days'`,
      [workspaceId]
    );
    const row = r.rows[0] ?? {};
    metrics.totalConversations  = row.total_conversations ?? 0;
    metrics.avgConversationDepth = parseFloat(row.avg_depth ?? 0).toFixed(1);
    metrics.deepConversations   = row.deep_conversations ?? 0;
    metrics.taskCompletionProxy = metrics.totalConversations > 0
      ? Math.round((metrics.deepConversations / metrics.totalConversations) * 100)
      : null;

    if (metrics.taskCompletionProxy !== null && metrics.taskCompletionProxy < 30)
      findings.push(`Only ${metrics.taskCompletionProxy}% of conversations reach 3+ turns — most sessions abandoned early.`);
  } catch {
    metrics.conversationError = true;
  }

  // ── Customer satisfaction from feedback ───────────────────────────────────
  try {
    const r = await query(
      `SELECT COUNT(*)::int AS total,
              AVG(rating)::numeric AS avg_rating,
              COUNT(*) FILTER (WHERE rating >= 4)::int AS positive,
              COUNT(*) FILTER (WHERE rating <= 2)::int AS negative,
              COUNT(*) FILTER (WHERE type = 'bug')::int AS bug_reports
       FROM feedback_items
       WHERE workspace_id = $1
         AND created_at > NOW() - INTERVAL '30 days'`,
      [workspaceId]
    );
    const row = r.rows[0] ?? {};
    metrics.totalFeedback  = row.total      ?? 0;
    metrics.avgRating      = parseFloat(row.avg_rating ?? 0).toFixed(1);
    metrics.positiveFeedback = row.positive ?? 0;
    metrics.negativeFeedback = row.negative ?? 0;
    metrics.bugReports     = row.bug_reports ?? 0;
    metrics.satisfactionScore = metrics.totalFeedback > 0
      ? Math.round((parseFloat(metrics.avgRating) / 5) * 100)
      : null;

    if (metrics.avgRating < 3.5 && metrics.totalFeedback > 0)
      findings.push(`Average feedback rating is ${metrics.avgRating}/5.`);
    if (metrics.bugReports > 5)
      findings.push(`${metrics.bugReports} bug reports filed in the last 30 days.`);
  } catch {
    metrics.satisfactionScore = null;
  }

  // ── Feature adoption: distinct users and features used ───────────────────
  try {
    const r = await query(
      `SELECT COUNT(DISTINCT "userId")::int AS active_users,
              COUNT(DISTINCT metadata->>'feature')::int AS distinct_features
       FROM "AuditLog"
       WHERE "workspaceId" = $1
         AND "createdAt" > NOW() - INTERVAL '30 days'`,
      [workspaceId]
    );
    const row = r.rows[0] ?? {};
    metrics.activeUsers      = row.active_users      ?? 0;
    metrics.distinctFeatures = row.distinct_features ?? 0;
    metrics.featureAdoptionScore = Math.min(100, metrics.distinctFeatures * 8);

    if (metrics.activeUsers < 2 && metrics.totalConversations > 0)
      findings.push('Only 1 active user — adoption is limited to a single person.');
  } catch {
    metrics.activeUsers = 0;
    metrics.featureAdoptionScore = 0;
  }

  // ── Time-to-value: onboarding completion ─────────────────────────────────
  try {
    const r = await query(
      `SELECT completed_at, started_at,
              EXTRACT(EPOCH FROM (completed_at - started_at)) / 60 AS minutes_to_complete
       FROM onboarding_state
       WHERE workspace_id = $1
         AND completed_at IS NOT NULL
       ORDER BY completed_at DESC
       LIMIT 1`,
      [workspaceId]
    );
    if (r.rows.length > 0) {
      metrics.onboardingCompletedMinutes = Math.round(r.rows[0].minutes_to_complete ?? 0);
      metrics.timeToValueScore = metrics.onboardingCompletedMinutes <= 15 ? 100
        : metrics.onboardingCompletedMinutes <= 30 ? 80
        : metrics.onboardingCompletedMinutes <= 60 ? 60
        : 40;
    } else {
      metrics.timeToValueScore = 50;
    }
  } catch {
    metrics.timeToValueScore = 50;
  }

  if ((metrics.totalConversations ?? 0) === 0 && (metrics.totalFeedback ?? 0) === 0) {
    return { domain: DOMAIN, score: null, status: 'insufficient_data', metrics, findings: ['No user activity in the last 30 days.'] };
  }

  // ── Score ─────────────────────────────────────────────────────────────────
  const taskScore     = metrics.taskCompletionProxy  ?? 50;
  const satScore      = metrics.satisfactionScore    ?? 65;
  const adoptScore    = metrics.featureAdoptionScore ?? 40;
  const valueScore    = metrics.timeToValueScore     ?? 50;
  const convScore     = Math.min(100, (metrics.totalConversations ?? 0) * 2);

  const score = Math.round(
    taskScore   * 0.30 +
    satScore    * 0.30 +
    adoptScore  * 0.20 +
    valueScore  * 0.10 +
    convScore   * 0.10
  );

  return { domain: DOMAIN, score, metrics, findings };
}
