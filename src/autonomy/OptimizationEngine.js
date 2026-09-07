/**
 * OptimizationEngine — Module 8
 *
 * Analyzes learning records to improve workflow ordering, retry policies,
 * approval routing, execution timing, and resource allocation.
 * Produces optimization recommendations consumed by the ContinuousPlanner.
 */

import { query }           from '../config/db.js';
import { logger }          from '../utils/logger.js';

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Run all optimization analyses and return a set of actionable recommendations
 * for the next planning cycle.
 */
export async function runOptimization(workspaceId, orgState) {
  const [
    workflowOpts,
    approvalOpts,
    timingOpts,
    retryOpts,
    resourceOpts,
  ] = await Promise.all([
    _analyzeWorkflowOrdering(workspaceId).catch(() => []),
    _analyzeApprovalRouting(workspaceId).catch(() => []),
    _analyzeExecutionTiming(workspaceId, orgState).catch(() => []),
    _analyzeRetryPolicies(workspaceId).catch(() => []),
    _analyzeResourceAllocation(workspaceId, orgState).catch(() => []),
  ]);

  const recommendations = [
    ...workflowOpts,
    ...approvalOpts,
    ...timingOpts,
    ...retryOpts,
    ...resourceOpts,
  ].filter(Boolean);

  return {
    recommendations,
    analyzedAt: new Date().toISOString(),
    summary: {
      total:    recommendations.length,
      byDomain: _groupBy(recommendations, 'domain'),
    },
  };
}

/**
 * Get improvement metrics — how much the system has improved over time.
 */
export async function getImprovementMetrics(workspaceId) {
  const { rows } = await query(
    `SELECT
       date_trunc('week', created_at)            AS week,
       COUNT(*)                                   AS total,
       COUNT(*) FILTER (WHERE outcome = 'SUCCESS') AS successes,
       AVG(success_score) FILTER (WHERE success_score IS NOT NULL) AS avg_score
     FROM autonomy_learning_records
     WHERE workspace_id = $1 AND resolved_at IS NOT NULL
     GROUP BY 1 ORDER BY 1 DESC LIMIT 12`,
    [workspaceId]
  );
  return rows;
}

// ── Workflow Ordering ─────────────────────────────────────────────────────────

async function _analyzeWorkflowOrdering(workspaceId) {
  const { rows } = await query(
    `SELECT workflow_id,
            COUNT(*) AS total,
            COUNT(*) FILTER (WHERE status = 'FAILED')    AS failures,
            AVG(EXTRACT(EPOCH FROM (completed_at - started_at))*1000)
              FILTER (WHERE status = 'COMPLETED')::int   AS avg_ms
     FROM workflow_executions
     WHERE workspace_id = $1 AND started_at > NOW() - INTERVAL '30 days'
     GROUP BY workflow_id
     HAVING COUNT(*) >= 3`,
    [workspaceId]
  ).catch(() => ({ rows: [] }));

  return rows
    .filter(r => Number(r.failures) / Number(r.total) > 0.3)
    .map(r => ({
      domain:      'workflow',
      type:        'REORDER_STEPS',
      title:       `Workflow ${r.workflow_id} has high failure rate`,
      detail:      `${Math.round(Number(r.failures)/Number(r.total)*100)}% failure rate over ${r.total} runs`,
      suggestion:  'Review step ordering and add pre-condition checks',
      workflowId:  r.workflow_id,
      impact:      'HIGH',
    }));
}

// ── Approval Routing ─────────────────────────────────────────────────────────

async function _analyzeApprovalRouting(workspaceId) {
  const { rows } = await query(
    `SELECT
       AVG(EXTRACT(EPOCH FROM (updated_at - created_at))/3600)::numeric(8,2) AS avg_hours,
       COUNT(*) AS total,
       COUNT(*) FILTER (WHERE status = 'EXPIRED') AS expired
     FROM pending_approvals
     WHERE workspace_id = $1 AND created_at > NOW() - INTERVAL '30 days'`,
    [workspaceId]
  ).catch(() => ({ rows: [{}] }));

  const r = rows[0];
  const avgHours = Number(r?.avg_hours ?? 0);
  const expired  = Number(r?.expired ?? 0);
  const opts     = [];

  if (avgHours > 8) {
    opts.push({
      domain:     'approvals',
      type:       'EXPEDITE_ROUTING',
      title:      'Approval latency is high',
      detail:     `Average approval takes ${avgHours.toFixed(1)}h — SLA risk`,
      suggestion: 'Enable Slack/email notifications for pending approvals',
      impact:     'MEDIUM',
    });
  }

  if (expired > 2) {
    opts.push({
      domain:     'approvals',
      type:       'REDUCE_EXPIRY',
      title:      `${expired} approvals expired without action`,
      detail:     'Expired approvals block workflows and waste planning cycles',
      suggestion: 'Reduce approval TTL and add reminder escalation',
      impact:     'MEDIUM',
    });
  }

  return opts;
}

// ── Execution Timing ─────────────────────────────────────────────────────────

async function _analyzeExecutionTiming(workspaceId, orgState) {
  const { rows } = await query(
    `SELECT EXTRACT(HOUR FROM started_at) AS hour,
            COUNT(*) AS total,
            COUNT(*) FILTER (WHERE status = 'FAILED') AS failures
     FROM workflow_executions
     WHERE workspace_id = $1 AND started_at > NOW() - INTERVAL '30 days'
     GROUP BY 1 ORDER BY 1`,
    [workspaceId]
  ).catch(() => ({ rows: [] }));

  const badHours = rows.filter(r => Number(r.failures) / Number(r.total) > 0.4 && Number(r.total) >= 3);
  if (!badHours.length) return [];

  return [{
    domain:     'timing',
    type:       'SHIFT_EXECUTION_WINDOW',
    title:      'High failure rate during specific hours',
    detail:     `Hours ${badHours.map(r => r.hour).join(', ')} show >40% failure rate`,
    suggestion: 'Schedule high-risk workflows outside these windows',
    impact:     'MEDIUM',
  }];
}

// ── Retry Policies ───────────────────────────────────────────────────────────

async function _analyzeRetryPolicies(workspaceId) {
  const { rows } = await query(
    `SELECT workflow_id, COUNT(*) AS retry_count
     FROM workflow_executions
     WHERE workspace_id = $1
       AND status = 'FAILED'
       AND started_at > NOW() - INTERVAL '14 days'
     GROUP BY workflow_id
     HAVING COUNT(*) >= 3
     ORDER BY retry_count DESC LIMIT 5`,
    [workspaceId]
  ).catch(() => ({ rows: [] }));

  return rows.map(r => ({
    domain:     'retry',
    type:       'ADJUST_RETRY_POLICY',
    title:      `Workflow ${r.workflow_id} fails repeatedly`,
    detail:     `${r.retry_count} failures in 14 days — current retry policy may be too aggressive`,
    suggestion: 'Add exponential backoff, increase pre-condition validation, or add circuit breaker',
    workflowId: r.workflow_id,
    impact:     'HIGH',
  }));
}

// ── Resource Allocation ──────────────────────────────────────────────────────

async function _analyzeResourceAllocation(workspaceId, orgState) {
  const opts = [];
  const cs   = orgState?.connectorState;

  if (cs) {
    const idle = (cs.connectors ?? []).filter(c => c.status === 'HEALTHY');
    if (idle.length > 3) {
      opts.push({
        domain:     'resources',
        type:       'LEVERAGE_IDLE_CONNECTORS',
        title:      `${idle.length} connectors healthy but may be underutilized`,
        detail:     `Connected: ${idle.map(c => c.id).join(', ')}`,
        suggestion: 'Consider syncing data or running maintenance tasks on idle connectors',
        impact:     'LOW',
      });
    }
  }

  const wl = orgState?.teamWorkload?.assignments ?? [];
  const overloaded = wl.filter(w => Number(w.open_tasks) > 15);
  if (overloaded.length > 0) {
    opts.push({
      domain:     'resources',
      type:       'REBALANCE_WORKLOAD',
      title:      `${overloaded.length} team member(s) overloaded`,
      detail:     `Members with >15 open tasks: ${overloaded.map(w => w.assignee_id).join(', ')}`,
      suggestion: 'Redistribute tasks or auto-triage lower priority items',
      impact:     'HIGH',
    });
  }

  return opts;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _groupBy(arr, key) {
  return arr.reduce((acc, item) => {
    acc[item[key]] = (acc[item[key]] ?? 0) + 1;
    return acc;
  }, {});
}
