/**
 * AutonomyEngine — Module 1
 *
 * Main orchestrator for the Autonomous Enterprise Operating System.
 * Runs the planning cycle on a configurable schedule per workspace, manages
 * start/stop/pause/resume lifecycle, and exposes health and metrics.
 *
 * All autonomous execution goes through ContinuousPlanner →
 * startExecutionWithPlan() → RuntimeEngine → Action Registry → Connectors.
 * This engine never invokes executeAction or connector methods directly.
 */

import { runPlanningCycle }   from './ContinuousPlanner.js';
import { runMonitorTick }     from './ExecutionMonitor.js';
import { collectMetrics }     from './AutonomyMetrics.js';
import { ensureDefaultPolicy, listPolicies } from './AutonomyPolicyEngine.js';
import { query }              from '../config/db.js';
import { publish }            from '../events/index.js';
import { logger }             from '../utils/logger.js';

const DEFAULT_CYCLE_MS = Number(process.env.AUTONOMY_CYCLE_MS ?? 15 * 60 * 1000); // 15 min
const DEFAULT_MONITOR_MS = Number(process.env.AUTONOMY_MONITOR_MS ?? 5 * 60 * 1000); // 5 min

// Per-workspace engine state (process-scoped — see CLAUDE.md TD-01)
const _engines = new Map(); // workspaceId → EngineState

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Start the autonomy engine for a workspace.
 */
export async function startEngine(workspaceId, orgId, opts = {}) {
  if (_engines.get(workspaceId)?.status === 'RUNNING') {
    return { workspaceId, status: 'ALREADY_RUNNING' };
  }

  const policy = await _getPrimaryPolicy(workspaceId);
  const cycleMs   = Number(policy?.run_interval_ms ?? DEFAULT_CYCLE_MS);
  const enabled   = policy?.enabled !== false;

  if (!enabled) {
    return { workspaceId, status: 'DISABLED_BY_POLICY' };
  }

  const state = {
    workspaceId,
    orgId,
    status:        'RUNNING',
    startedAt:     new Date().toISOString(),
    lastCycleAt:   null,
    lastMonitorAt: null,
    cycleCount:    0,
    cycleMs,
    cycleTimer:    null,
    monitorTimer:  null,
    paused:        false,
  };
  _engines.set(workspaceId, state);

  // Run immediately then on interval
  _scheduleCycle(state);
  _scheduleMonitor(state);

  logger.info(`[AutonomyEngine] started for ${workspaceId} (cycle: ${cycleMs}ms)`);
  await publish('autonomy', 'AUTONOMY_ENGINE_STARTED', { workspaceId, cycleMs }, { workspaceId }).catch(() => null);

  return { workspaceId, status: 'STARTED', cycleMs };
}

/**
 * Stop the autonomy engine for a workspace.
 */
export async function stopEngine(workspaceId) {
  const state = _engines.get(workspaceId);
  if (!state) return { workspaceId, status: 'NOT_RUNNING' };

  _clearTimers(state);
  _engines.delete(workspaceId);

  logger.info(`[AutonomyEngine] stopped for ${workspaceId}`);
  await publish('autonomy', 'AUTONOMY_ENGINE_STOPPED', { workspaceId }, { workspaceId }).catch(() => null);

  return { workspaceId, status: 'STOPPED' };
}

/**
 * Pause the engine — no new cycles start, in-flight cycles complete.
 */
export async function pauseEngine(workspaceId) {
  const state = _engines.get(workspaceId);
  if (!state) return { workspaceId, status: 'NOT_RUNNING' };
  _clearTimers(state);
  state.paused  = true;
  state.status  = 'PAUSED';
  return { workspaceId, status: 'PAUSED' };
}

/**
 * Resume a paused engine.
 */
export async function resumeEngine(workspaceId) {
  const state = _engines.get(workspaceId);
  if (!state) return { workspaceId, status: 'NOT_RUNNING' };
  state.paused = false;
  state.status = 'RUNNING';
  _scheduleCycle(state);
  _scheduleMonitor(state);
  return { workspaceId, status: 'RESUMED' };
}

/**
 * Trigger a one-shot planning cycle outside the schedule.
 */
export async function triggerCycle(workspaceId, orgId, { dryRun = false } = {}) {
  const state = _engines.get(workspaceId);
  const effectiveOrgId = state?.orgId ?? orgId ?? '';
  return runPlanningCycle(workspaceId, effectiveOrgId, {
    triggeredBy: 'manual',
    dryRun,
  });
}

/**
 * Get health status of all running engines.
 */
export function getHealth() {
  const engines = [];
  for (const [ws, state] of _engines) {
    engines.push({
      workspaceId:   ws,
      status:        state.status,
      startedAt:     state.startedAt,
      lastCycleAt:   state.lastCycleAt,
      lastMonitorAt: state.lastMonitorAt,
      cycleCount:    state.cycleCount,
      cycleMs:       state.cycleMs,
      paused:        state.paused,
    });
  }
  return {
    running: engines.filter(e => e.status === 'RUNNING').length,
    paused:  engines.filter(e => e.status === 'PAUSED').length,
    engines,
  };
}

/**
 * Get autonomy metrics for a workspace.
 */
export async function getMetrics(workspaceId, opts = {}) {
  return collectMetrics(workspaceId, opts);
}

/**
 * List the most recent autonomy runs for a workspace.
 */
export async function listRuns(workspaceId, { limit = 20 } = {}) {
  const { rows } = await query(
    `SELECT * FROM autonomy_runs
     WHERE workspace_id = $1
     ORDER BY started_at DESC LIMIT $2`,
    [workspaceId, limit]
  );
  return rows;
}

// ── Boot ─────────────────────────────────────────────────────────────────────

/**
 * Called once at server boot. Starts engines for all workspaces that have an
 * enabled autonomy policy.
 */
export async function startAutonomyEngine() {
  try {
    const { rows } = await query(
      `SELECT DISTINCT p.workspace_id, w.org_id
       FROM autonomy_policies p
       LEFT JOIN workspaces w ON w.id = p.workspace_id
       WHERE p.scope = 'workspace' AND p.enabled = true`,
    );

    for (const row of rows) {
      await startEngine(row.workspace_id, row.org_id).catch(err =>
        logger.warn(`[AutonomyEngine] boot-start ${row.workspace_id}: ${err.message}`)
      );
    }

    logger.info(`[AutonomyEngine] boot complete — ${rows.length} workspace(s) started`);
  } catch (err) {
    logger.warn(`[AutonomyEngine] boot error (non-fatal): ${err.message}`);
  }
}

// ── Internal ──────────────────────────────────────────────────────────────────

function _scheduleCycle(state) {
  const { workspaceId, orgId, cycleMs } = state;

  const runCycle = async () => {
    if (state.paused) return;
    const runId = await _startRun(workspaceId);
    const t0 = Date.now();
    try {
      const result = await runPlanningCycle(workspaceId, orgId, { triggeredBy: 'schedule' });
      state.lastCycleAt = new Date().toISOString();
      state.cycleCount++;
      await _completeRun(runId, result, Date.now() - t0);
    } catch (err) {
      logger.error(`[AutonomyEngine] cycle error ${workspaceId}: ${err.message}`);
      await _failRun(runId, err.message, Date.now() - t0);
    }
  };

  // First cycle immediately, then interval
  runCycle();
  state.cycleTimer = setInterval(runCycle, cycleMs);
}

function _scheduleMonitor(state) {
  const { workspaceId } = state;

  const runMonitor = async () => {
    if (state.paused) return;
    try {
      await runMonitorTick(workspaceId);
      state.lastMonitorAt = new Date().toISOString();
    } catch (err) {
      logger.warn(`[AutonomyEngine] monitor tick error ${workspaceId}: ${err.message}`);
    }
  };

  state.monitorTimer = setInterval(runMonitor, DEFAULT_MONITOR_MS);
}

function _clearTimers(state) {
  if (state.cycleTimer)   { clearInterval(state.cycleTimer);   state.cycleTimer   = null; }
  if (state.monitorTimer) { clearInterval(state.monitorTimer); state.monitorTimer = null; }
}

async function _getPrimaryPolicy(workspaceId) {
  const policies = await listPolicies(workspaceId).catch(() => []);
  return policies.find(p => p.scope === 'workspace' && !p.scope_id) ?? null;
}

async function _startRun(workspaceId) {
  const { rows } = await query(
    `INSERT INTO autonomy_runs (workspace_id, triggered_by)
     VALUES ($1, 'schedule') RETURNING id`,
    [workspaceId]
  ).catch(() => ({ rows: [{ id: null }] }));
  return rows[0]?.id ?? null;
}

async function _completeRun(runId, result, durationMs) {
  if (!runId) return;
  await query(
    `UPDATE autonomy_runs SET
       status = 'COMPLETED',
       opportunities_found       = $1,
       risks_found               = $2,
       recommendations_generated = $3,
       workflows_submitted       = $4,
       workflows_completed       = $5,
       duration_ms               = $6,
       summary                   = $7,
       completed_at              = NOW()
     WHERE id = $8`,
    [
      result.opportunities,
      result.risks,
      result.candidates,
      result.autoExecuted + result.pendingApproval,
      result.autoExecuted,
      durationMs,
      JSON.stringify({ autoExecuted: result.autoExecuted, pendingApproval: result.pendingApproval }),
      runId,
    ]
  ).catch(() => null);
}

async function _failRun(runId, errorMsg, durationMs) {
  if (!runId) return;
  await query(
    `UPDATE autonomy_runs SET status = 'FAILED', error = $1, duration_ms = $2, completed_at = NOW()
     WHERE id = $3`,
    [errorMsg, durationMs, runId]
  ).catch(() => null);
}
