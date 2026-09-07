/**
 * AutonomyMetrics — Module 13
 *
 * Tracks 13 metric types across the autonomy engine:
 *   1.  recommendations_generated
 *   2.  recommendations_accepted
 *   3.  recommendations_dismissed
 *   4.  workflows_executed
 *   5.  workflows_succeeded
 *   6.  workflow_success_rate
 *   7.  predictions_generated
 *   8.  prediction_accuracy
 *   9.  goals_completed
 *   10. cost_savings_usd
 *   11. time_saved_minutes
 *   12. approval_latency_avg_ms
 *   13. learning_accuracy
 */

import { query }             from '../config/db.js';
import { getLearningStats }  from './LearningEngine.js';
import { getImprovementMetrics } from './OptimizationEngine.js';

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Collect all 13 metric types for a workspace and return a unified snapshot.
 */
export async function collectMetrics(workspaceId, { days = 30 } = {}) {
  const since = new Date(Date.now() - days * 86400000).toISOString();

  const [
    learningStats,
    workflowStats,
    predictionStats,
    goalStats,
    approvalStats,
    runStats,
    improvementHistory,
  ] = await Promise.all([
    _getLearningMetrics(workspaceId).catch(() => ({})),
    _getWorkflowMetrics(workspaceId, since).catch(() => ({})),
    _getPredictionMetrics(workspaceId, since).catch(() => ({})),
    _getGoalMetrics(workspaceId).catch(() => ({})),
    _getApprovalMetrics(workspaceId, since).catch(() => ({})),
    _getRunMetrics(workspaceId, since).catch(() => ({})),
    getImprovementMetrics(workspaceId).catch(() => []),
  ]);

  const total        = Number(learningStats.total ?? 0);
  const accepted     = Number(learningStats.accepted ?? 0);
  const successful   = Number(learningStats.successful ?? 0);
  const wfTotal      = Number(workflowStats.total ?? 0);
  const wfSuccess    = Number(workflowStats.completed ?? 0);
  const predTotal    = Number(predictionStats.total ?? 0);
  const predAccurate = Number(predictionStats.accurate ?? 0);

  return {
    workspaceId,
    collectedAt:   new Date().toISOString(),
    periodDays:    days,

    // 1–3. Recommendation metrics
    recommendations_generated:  total,
    recommendations_accepted:   accepted,
    recommendations_dismissed:  Number(learningStats.dismissed ?? 0),

    // 4–6. Workflow metrics
    workflows_executed:    wfTotal,
    workflows_succeeded:   wfSuccess,
    workflow_success_rate: wfTotal > 0 ? Math.round((wfSuccess / wfTotal) * 100) / 100 : 0,

    // 7–8. Prediction metrics
    predictions_generated: predTotal,
    prediction_accuracy:   predTotal > 0 ? Math.round((predAccurate / predTotal) * 100) / 100 : 0,

    // 9. Goals
    goals_completed: Number(goalStats.achieved ?? 0),

    // 10–11. Value delivery
    cost_savings_usd:    Number(learningStats.total_impact_usd ?? 0),
    time_saved_minutes:  Number(learningStats.total_time_saved_min ?? 0),

    // 12. Approval latency
    approval_latency_avg_ms: Number(approvalStats.avg_latency_ms ?? 0),

    // 13. Learning accuracy (% of accepted recs that succeeded)
    learning_accuracy: accepted > 0 ? Math.round((successful / accepted) * 100) / 100 : 0,

    // Additional context
    autonomy_runs:       Number(runStats.total ?? 0),
    runs_this_period:    Number(runStats.period_total ?? 0),
    avg_run_duration_ms: Number(runStats.avg_duration_ms ?? 0),
    improvement_history: improvementHistory,
  };
}

/**
 * Get a lightweight metrics summary for the dashboard.
 */
export async function getMetricsSummary(workspaceId) {
  const full = await collectMetrics(workspaceId, { days: 7 });
  return {
    workspaceId,
    week: {
      recommendations:    full.recommendations_generated,
      accepted:           full.recommendations_accepted,
      workflowsRun:       full.workflows_executed,
      successRate:        full.workflow_success_rate,
      timeSavedMinutes:   full.time_saved_minutes,
      costSavings:        full.cost_savings_usd,
      learningAccuracy:   full.learning_accuracy,
    },
  };
}

// ── Collectors ────────────────────────────────────────────────────────────────

async function _getLearningMetrics(workspaceId) {
  return getLearningStats(workspaceId);
}

async function _getWorkflowMetrics(workspaceId, since) {
  const { rows } = await query(
    `SELECT
       COUNT(*) AS total,
       COUNT(*) FILTER (WHERE status = 'COMPLETED') AS completed,
       COUNT(*) FILTER (WHERE status = 'FAILED')    AS failed,
       AVG(EXTRACT(EPOCH FROM (completed_at - started_at))*1000)
         FILTER (WHERE status = 'COMPLETED')::int   AS avg_duration_ms
     FROM workflow_executions
     WHERE workspace_id = $1
       AND triggered_by LIKE 'autonomy%'
       AND started_at >= $2`,
    [workspaceId, since]
  );
  return rows[0] ?? {};
}

async function _getPredictionMetrics(workspaceId, since) {
  const { rows } = await query(
    `SELECT
       COUNT(*)                                             AS total,
       COUNT(*) FILTER (WHERE outcome = 'SUCCESS')          AS accurate
     FROM autonomy_learning_records
     WHERE workspace_id = $1
       AND recommendation_type LIKE '%PREDICT%'
       AND created_at >= $2`,
    [workspaceId, since]
  );
  return rows[0] ?? {};
}

async function _getGoalMetrics(workspaceId) {
  const { rows } = await query(
    `SELECT
       COUNT(*) FILTER (WHERE status = 'ACTIVE')    AS active,
       COUNT(*) FILTER (WHERE status = 'ACHIEVED')  AS achieved,
       COUNT(*) FILTER (WHERE status = 'MISSED')    AS missed,
       AVG(current_progress) AS avg_progress
     FROM autonomy_goals
     WHERE workspace_id = $1`,
    [workspaceId]
  );
  return rows[0] ?? {};
}

async function _getApprovalMetrics(workspaceId, since) {
  const { rows } = await query(
    `SELECT
       AVG(EXTRACT(EPOCH FROM (updated_at - created_at))*1000)::int AS avg_latency_ms,
       COUNT(*) AS total,
       COUNT(*) FILTER (WHERE status = 'APPROVED') AS approved,
       COUNT(*) FILTER (WHERE status = 'REJECTED') AS rejected
     FROM pending_approvals
     WHERE workspace_id = $1 AND created_at >= $2`,
    [workspaceId, since]
  );
  return rows[0] ?? {};
}

async function _getRunMetrics(workspaceId, since) {
  const { rows } = await query(
    `SELECT
       COUNT(*)                                          AS total,
       COUNT(*) FILTER (WHERE started_at >= $2)          AS period_total,
       AVG(duration_ms) FILTER (WHERE duration_ms IS NOT NULL)::int AS avg_duration_ms
     FROM autonomy_runs
     WHERE workspace_id = $1`,
    [workspaceId, since]
  );
  return rows[0] ?? {};
}
