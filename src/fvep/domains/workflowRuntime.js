import { query } from '../../config/db.js';

export const DOMAIN = 'workflowRuntime';

export async function evaluate(workspaceId) {
  const metrics = {};
  const findings = [];

  try {
    const r = await query(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE status = 'EXECUTED')::int    AS executed,
              COUNT(*) FILTER (WHERE status = 'FAILED')::int      AS failed,
              COUNT(*) FILTER (WHERE status = 'ROLLED_BACK')::int AS rolled_back,
              COUNT(*) FILTER (WHERE status = 'RETRIED')::int     AS retried,
              AVG(EXTRACT(EPOCH FROM (completed_at - created_at)))::numeric AS avg_duration_sec,
              PERCENTILE_CONT(0.95) WITHIN GROUP (
                ORDER BY EXTRACT(EPOCH FROM (completed_at - created_at))
              ) AS p95_duration_sec
       FROM execution_records
       WHERE workspace_id = $1
         AND created_at > NOW() - INTERVAL '30 days'`,
      [workspaceId]
    );
    const row = r.rows[0] ?? {};

    metrics.totalExecutions   = row.total       ?? 0;
    metrics.successCount      = row.executed    ?? 0;
    metrics.failedCount       = row.failed      ?? 0;
    metrics.rolledBackCount   = row.rolled_back ?? 0;
    metrics.retriedCount      = row.retried     ?? 0;
    metrics.avgDurationSec    = parseFloat(row.avg_duration_sec ?? 0).toFixed(1);
    metrics.p95DurationSec    = parseFloat(row.p95_duration_sec ?? 0).toFixed(1);

    const total = metrics.totalExecutions;
    metrics.successRate  = total > 0 ? Math.round((metrics.successCount  / total) * 100) : null;
    metrics.failureRate  = total > 0 ? Math.round((metrics.failedCount   / total) * 100) : null;
    metrics.rollbackRate = total > 0 ? Math.round((metrics.rolledBackCount / total) * 100) : null;
    metrics.retryRate    = total > 0 ? Math.round((metrics.retriedCount  / total) * 100) : null;

    if (metrics.successRate !== null && metrics.successRate < 85)
      findings.push(`Workflow success rate is ${metrics.successRate}% — below the 85% threshold.`);
    if (metrics.rollbackRate !== null && metrics.rollbackRate > 10)
      findings.push(`Rollback rate is elevated at ${metrics.rollbackRate}%.`);
    if (metrics.retryRate !== null && metrics.retryRate > 15)
      findings.push(`Retry rate is ${metrics.retryRate}% — investigate execution timeouts.`);
    if (parseFloat(metrics.p95DurationSec) > 30)
      findings.push(`P95 execution duration ${metrics.p95DurationSec}s exceeds 30s target.`);
  } catch {
    metrics.queryError = true;
    return { domain: DOMAIN, score: null, status: 'insufficient_data', metrics, findings };
  }

  if (metrics.totalExecutions === 0) {
    return { domain: DOMAIN, score: null, status: 'insufficient_data', metrics, findings: ['No execution records in the last 30 days.'] };
  }

  // ── Approval delays (MEDIUM/HIGH tier pending > 48h) ──────────────────────
  try {
    const r = await query(
      `SELECT COUNT(*)::int AS long_pending
       FROM pending_approvals
       WHERE workspace_id = $1
         AND status = 'PENDING'
         AND created_at < NOW() - INTERVAL '48 hours'`,
      [workspaceId]
    );
    metrics.approvalDelays = r.rows[0]?.long_pending ?? 0;
    if (metrics.approvalDelays > 3)
      findings.push(`${metrics.approvalDelays} approvals pending for >48h — may block workflows.`);
  } catch {
    metrics.approvalDelays = 0;
  }

  // ── Score ─────────────────────────────────────────────────────────────────
  const successScore  = metrics.successRate  ?? 70;
  const noFailScore   = 100 - (metrics.failureRate ?? 30);
  const noRollback    = 100 - Math.min(100, (metrics.rollbackRate ?? 0) * 5);
  const noRetry       = 100 - Math.min(100, (metrics.retryRate ?? 0) * 3);
  const latencyScore  = Math.max(0, 100 - parseFloat(metrics.p95DurationSec) * 2);
  const noDelayScore  = Math.max(0, 100 - (metrics.approvalDelays ?? 0) * 10);

  const score = Math.round(
    successScore * 0.40 +
    noFailScore  * 0.20 +
    noRollback   * 0.15 +
    noRetry      * 0.10 +
    latencyScore * 0.10 +
    noDelayScore * 0.05
  );

  return { domain: DOMAIN, score, metrics, findings };
}
