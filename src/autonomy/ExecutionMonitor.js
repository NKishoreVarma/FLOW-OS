/**
 * ExecutionMonitor — Module 11
 *
 * Monitors running, waiting, blocked, completed, and failed autonomous workflow
 * executions. Implements auto-retry, escalation, pause, resume, and rollback
 * for executions submitted by the ContinuousPlanner.
 */

import {
  listWorkflowExecutions,
  pauseExecution,
  resumeExecution,
  cancelExecution,
  startExecutionWithPlan,
  buildExecutionPlan,
} from '../runtime/index.js';
import { query }   from '../config/db.js';
import { publish } from '../events/index.js';
import { logger }  from '../utils/logger.js';

// Max auto-retries for FAILED executions before escalating
const MAX_AUTO_RETRIES   = 3;
// Executions waiting >30 min in WAITING_APPROVAL are escalated
const APPROVAL_WAIT_MS   = 30 * 60 * 1000;
// Executions RUNNING >2h without progress are treated as stale
const STALE_RUNNING_MS   = 2 * 60 * 60 * 1000;

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Run one monitor tick — inspect all in-flight executions and take action.
 */
export async function runMonitorTick(workspaceId) {
  const [running, failed, waiting] = await Promise.all([
    _getExecutionsByStatus(workspaceId, 'RUNNING'),
    _getExecutionsByStatus(workspaceId, 'FAILED'),
    _getExecutionsByStatus(workspaceId, 'WAITING_APPROVAL'),
  ]);

  const actions = [];

  // Handle stale running executions
  for (const exec of running) {
    const age = Date.now() - new Date(exec.started_at ?? 0).getTime();
    if (age > STALE_RUNNING_MS) {
      await _handleStaleExecution(workspaceId, exec);
      actions.push({ executionId: exec.id, action: 'ESCALATED_STALE' });
    }
  }

  // Handle failed executions — auto-retry or escalate
  for (const exec of failed) {
    const retries = Number(exec.metadata?.auto_retries ?? 0);
    if (retries < MAX_AUTO_RETRIES && _isRetryable(exec)) {
      await _autoRetry(workspaceId, exec, retries);
      actions.push({ executionId: exec.id, action: 'AUTO_RETRIED', attempt: retries + 1 });
    } else {
      await _escalate(workspaceId, exec, 'RETRY_LIMIT_REACHED');
      actions.push({ executionId: exec.id, action: 'ESCALATED_FAILED' });
    }
  }

  // Handle waiting for approval too long
  for (const exec of waiting) {
    const age = Date.now() - new Date(exec.started_at ?? 0).getTime();
    if (age > APPROVAL_WAIT_MS) {
      await _escalate(workspaceId, exec, 'APPROVAL_TIMEOUT');
      actions.push({ executionId: exec.id, action: 'ESCALATED_APPROVAL_TIMEOUT' });
    }
  }

  return { workspaceId, tickAt: new Date().toISOString(), actions };
}

/**
 * Get current status summary of all autonomous executions.
 */
export async function getMonitorStatus(workspaceId) {
  const { rows } = await query(
    `SELECT status, COUNT(*) AS count
     FROM workflow_executions
     WHERE workspace_id = $1
       AND triggered_by LIKE 'autonomy%'
       AND started_at > NOW() - INTERVAL '7 days'
     GROUP BY status`,
    [workspaceId]
  ).catch(() => ({ rows: [] }));

  const byStatus = rows.reduce((acc, r) => {
    acc[r.status] = Number(r.count);
    return acc;
  }, {});

  const { rows: recentRows } = await query(
    `SELECT id, workflow_id, status, started_at, completed_at, error_message
     FROM workflow_executions
     WHERE workspace_id = $1
       AND triggered_by LIKE 'autonomy%'
     ORDER BY started_at DESC LIMIT 20`,
    [workspaceId]
  ).catch(() => ({ rows: [] }));

  return {
    workspaceId,
    byStatus,
    running:         byStatus.RUNNING ?? 0,
    waiting:         byStatus.WAITING_APPROVAL ?? 0,
    completed:       byStatus.COMPLETED ?? 0,
    failed:          byStatus.FAILED ?? 0,
    cancelled:       byStatus.CANCELLED ?? 0,
    recentExecutions: recentRows,
  };
}

/**
 * Force-pause an autonomous execution.
 */
export async function pauseAutonomousExecution(workspaceId, executionId) {
  await pauseExecution(executionId, workspaceId);
  logger.info(`[ExecutionMonitor] paused ${executionId}`);
  return { executionId, action: 'PAUSED' };
}

/**
 * Resume a paused autonomous execution.
 */
export async function resumeAutonomousExecution(workspaceId, executionId) {
  await resumeExecution(executionId, workspaceId);
  logger.info(`[ExecutionMonitor] resumed ${executionId}`);
  return { executionId, action: 'RESUMED' };
}

/**
 * Cancel an autonomous execution.
 */
export async function cancelAutonomousExecution(workspaceId, executionId) {
  await cancelExecution(executionId, workspaceId);
  logger.info(`[ExecutionMonitor] cancelled ${executionId}`);
  return { executionId, action: 'CANCELLED' };
}

// ── Internal ──────────────────────────────────────────────────────────────────

async function _getExecutionsByStatus(workspaceId, status) {
  return listWorkflowExecutions(workspaceId, {
    status,
    limit: 50,
    triggeredBy: 'autonomy',
  }).catch(() => []);
}

function _isRetryable(exec) {
  const nonRetryable = ['CANCELLED', 'PAUSED', 'WAITING_APPROVAL'];
  return !nonRetryable.includes(exec.status);
}

async function _autoRetry(workspaceId, exec, previousRetries) {
  try {
    await query(
      `UPDATE workflow_executions
       SET metadata = jsonb_set(COALESCE(metadata,'{}'), '{auto_retries}', $1::jsonb)
       WHERE id = $2`,
      [JSON.stringify(previousRetries + 1), exec.id]
    ).catch(() => null);

    if (exec.workflow_id) {
      const plan = await buildExecutionPlan(exec.workflow_id, exec.params ?? {}, {
        workspaceId,
        userId:      'autonomy-engine',
        role:        'MEMBER',
        triggeredBy: 'autonomy-monitor-retry',
      });
      await startExecutionWithPlan(plan, {
        workspaceId,
        userId:      'autonomy-engine',
        role:        'MEMBER',
        triggeredBy: `autonomy-monitor-retry-${previousRetries + 1}`,
      });
    }
  } catch (err) {
    logger.warn(`[ExecutionMonitor] retry failed for ${exec.id}: ${err.message}`);
  }
}

async function _escalate(workspaceId, exec, reason) {
  logger.warn(`[ExecutionMonitor] escalating ${exec.id}: ${reason}`);
  await publish('autonomy', 'EXECUTION_ESCALATED', {
    executionId: exec.id,
    workflowId:  exec.workflow_id,
    reason,
    status:      exec.status,
    error:       exec.error_message,
  }, { workspaceId }).catch(() => null);
}

async function _handleStaleExecution(workspaceId, exec) {
  logger.warn(`[ExecutionMonitor] stale execution ${exec.id} — cancelling`);
  await cancelExecution(exec.id, workspaceId).catch(() => null);
  await _escalate(workspaceId, exec, 'STALE_RUNNING');
}
