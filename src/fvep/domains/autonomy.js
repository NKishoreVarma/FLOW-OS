import { query } from '../../config/db.js';

export const DOMAIN = 'autonomy';

export async function evaluate(workspaceId) {
  const metrics = {};
  const findings = [];

  // ── Execution records: autonomous vs human-initiated ─────────────────────
  try {
    const r = await query(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE status = 'EXECUTED')::int            AS executed,
              COUNT(*) FILTER (WHERE status = 'ROLLED_BACK')::int         AS rolled_back,
              COUNT(*) FILTER (WHERE metadata->>'initiatedBy' = 'autonomous')::int AS autonomous_total,
              COUNT(*) FILTER (WHERE metadata->>'initiatedBy' = 'autonomous'
                               AND status = 'EXECUTED')::int              AS autonomous_success,
              COUNT(*) FILTER (WHERE metadata->>'overrideBy' IS NOT NULL)::int AS human_overrides,
              COUNT(*) FILTER (WHERE metadata->>'actionAccepted' = 'true')::int AS accepted,
              COUNT(*) FILTER (WHERE metadata->>'actionDismissed' = 'true')::int AS dismissed
       FROM execution_records
       WHERE workspace_id = $1
         AND created_at > NOW() - INTERVAL '30 days'`,
      [workspaceId]
    );
    const row = r.rows[0] ?? {};

    metrics.totalExecutions      = row.total              ?? 0;
    metrics.executedCount        = row.executed           ?? 0;
    metrics.rolledBackCount      = row.rolled_back        ?? 0;
    metrics.autonomousTotal      = row.autonomous_total   ?? 0;
    metrics.autonomousSuccess    = row.autonomous_success ?? 0;
    metrics.humanOverrides       = row.human_overrides    ?? 0;
    metrics.accepted             = row.accepted           ?? 0;
    metrics.dismissed            = row.dismissed          ?? 0;

    const shown = metrics.accepted + metrics.dismissed;
    metrics.recommendationAcceptance = shown > 0
      ? Math.round((metrics.accepted / shown) * 100)
      : null;

    metrics.executionSuccessRate = metrics.autonomousTotal > 0
      ? Math.round((metrics.autonomousSuccess / metrics.autonomousTotal) * 100)
      : null;

    const overrideBase = metrics.executedCount;
    metrics.overrideRate = overrideBase > 0
      ? Math.round((metrics.humanOverrides / overrideBase) * 100)
      : null;

    metrics.rollbackRate = metrics.executedCount > 0
      ? Math.round((metrics.rolledBackCount / metrics.executedCount) * 100)
      : null;

    if (metrics.recommendationAcceptance !== null && metrics.recommendationAcceptance < 50)
      findings.push(`Recommendation acceptance is ${metrics.recommendationAcceptance}% — users are rejecting most suggestions.`);
    if (metrics.overrideRate !== null && metrics.overrideRate > 20)
      findings.push(`Human override rate is ${metrics.overrideRate}% — autonomous actions may lack trust.`);
    if (metrics.rollbackRate !== null && metrics.rollbackRate > 5)
      findings.push(`Rollback rate of ${metrics.rollbackRate}% indicates execution quality issues.`);
  } catch {
    return { domain: DOMAIN, score: null, status: 'insufficient_data', metrics, findings: ['execution_records not accessible.'] };
  }

  // ── Business impact: value generated (from success metrics) ──────────────
  try {
    const r = await query(
      `SELECT COUNT(*)::int AS tasks_completed,
              COUNT(DISTINCT metadata->>'approvalId') FILTER (WHERE status = 'EXECUTED') AS approvals_cleared
       FROM execution_records
       WHERE workspace_id = $1
         AND status = 'EXECUTED'
         AND created_at > NOW() - INTERVAL '30 days'`,
      [workspaceId]
    );
    const row = r.rows[0] ?? {};
    metrics.tasksCompleted   = row.tasks_completed   ?? 0;
    metrics.approvalsCleared = row.approvals_cleared ?? 0;
    metrics.estimatedHoursSaved = Math.round(metrics.tasksCompleted * 0.25);
  } catch {
    metrics.tasksCompleted = 0;
  }

  if (metrics.totalExecutions === 0 && metrics.autonomousTotal === 0) {
    return { domain: DOMAIN, score: null, status: 'insufficient_data', metrics, findings: ['No executions in 30 days.'] };
  }

  // ── Score ─────────────────────────────────────────────────────────────────
  const acceptScore   = metrics.recommendationAcceptance ?? 60;
  const execScore     = metrics.executionSuccessRate     ?? 70;
  const noOverride    = 100 - Math.min(100, (metrics.overrideRate ?? 10) * 3);
  const noRollback    = 100 - Math.min(100, (metrics.rollbackRate ?? 5) * 8);
  const impactScore   = Math.min(100, (metrics.tasksCompleted ?? 0) * 5);

  const score = Math.round(
    acceptScore  * 0.30 +
    execScore    * 0.30 +
    noOverride   * 0.20 +
    noRollback   * 0.10 +
    impactScore  * 0.10
  );

  return { domain: DOMAIN, score, metrics, findings };
}
