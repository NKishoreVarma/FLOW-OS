/**
 * Universal Workflow Runtime Engine
 *
 * Orchestrates any workflow defined in the WorkflowLoader registry.
 * Contains zero workflow-specific logic — all step semantics live in StepExecutor.
 *
 * Execution model:
 *   1.  Load definition from WorkflowLoader
 *   2.  Build execution plan (via registered planner or definition.steps)
 *   3.  Persist plan to workflow_executions (status: PLANNING)
 *   4.  Register control object in _running map (enables pause/cancel)
 *   5.  Start _execute() async (caller gets executionId immediately)
 *   6.  In _execute(): mark RUNNING → iterate steps → save checkpoints → mark COMPLETED/FAILED
 *
 * Pause/Resume:
 *   pause() sets control.paused = true; the step loop spins at 100ms until unpaused or cancelled.
 *   resume() sets control.paused = false; the loop continues from the current position.
 *
 * Cancellation:
 *   cancel() sets control.cancelled = true; checked at the top of each step iteration.
 *
 * Approval pausing:
 *   When executeStep() throws APPROVAL_REQUIRED, the engine checkpoints, marks WAITING_APPROVAL,
 *   removes from _running, and returns. Resume happens when the approval resolves and
 *   resumeAfterApproval() is called externally.
 *
 * Recovery:
 *   recoverStaleExecutions() (called at boot) finds RUNNING executions in the DB,
 *   loads their checkpoint + plan, determines which steps are already done, and
 *   re-enters _execute() from the first incomplete step.
 *
 * Timeouts:
 *   Each execution is wrapped in withTimeout(). Default: WORKFLOW_TIMEOUT_MS (10 min).
 */

import { broadcastToWorkspace }       from '../services/socketService.js';
import { AppError }                   from '../core/errors/index.js';
import { WorkflowEvent }              from './RuntimeEvents.js';
import { executeStep }                from './StepExecutor.js';
import { buildExecutionPlan, loadDefinition } from './WorkflowLoader.js';
import { saveCheckpoint, loadCheckpoint, deleteCheckpoint, findStaleExecutions, failStaleExecution } from './RuntimePersistence.js';
import {
  createRuntimeContext,
  deserializeContext,
  trackStepOutput,
  trackStepFailure,
  setVariable,
  setApprovalWaiting,
} from './RuntimeContext.js';
import {
  createExecution,
  markRunning,
  markCompleted,
  markFailed,
  markWaitingApproval,
  markCancelled,
  markPaused,
  markRunningFromPaused,
  markWaitingEvent,
  markWaitingTimer,
  markWaitingCallback,
  recordStepStart,
  recordStepComplete,
  recordStepFailed,
  recordStepSkipped,
  getExecution,
  listExecutions,
  getSnapshot,
} from '../workflows/WorkflowState.js';

const WORKFLOW_TIMEOUT_MS = parseInt(process.env.WORKFLOW_TIMEOUT_MS, 10) || 10 * 60 * 1000;
const MAX_RETRY_DEFAULT   = 2;
const RETRY_DELAY_MS      = 2000;

// executionId → { paused: bool, cancelled: bool }
const _running = new Map();

// SSE push function — registered by runtimeRoutes to avoid circular import
let _ssePush = null;
export function registerSSEPush(fn) { _ssePush = fn; }

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Launch a workflow from a pre-built plan (skips the planner call).
 * Used by WorkflowEngine.launchWorkflow for backward-compatible /api/workflows/* routes.
 *
 * @param {object} plan — already-built ExecutionPlan from a planner
 * @param {object} ctx  — { workspaceId, orgId, actor, orgPlan }
 */
export async function startExecutionWithPlan(plan, ctx) {
  const { workspaceId, orgId, actor, orgPlan = 'free' } = ctx;

  const execution = await createExecution({
    workspaceId,
    orgId,
    workflowId:   plan.workflowId,
    workflowName: plan.workflowName,
    plan,
    startedBy: actor?.email ?? actor?.id ?? null,
  });

  const runtimeCtx = createRuntimeContext({
    executionId: execution.id,
    workspaceId,
    workflowId:  plan.workflowId,
    params:      plan.params ?? {},
  });

  _running.set(execution.id, { paused: false, cancelled: false });

  _execute(execution.id, plan, runtimeCtx, ctx).catch(err => {
    console.error(`[RuntimeEngine] unhandled error in ${execution.id}:`, err.message);
    markFailed(execution.id, err).catch(() => {});
    _broadcast(workspaceId, execution.id, WorkflowEvent.FAILED, { error: err.message });
  });

  return { executionId: execution.id, status: 'PLANNING' };
}

/**
 * Launch a workflow by ID. Returns immediately with { executionId, status }.
 *
 * @param {string} workflowId  — registered workflow ID
 * @param {object} params      — workflow-specific params (owner, repo, etc.)
 * @param {object} ctx         — { workspaceId, orgId, actor, orgPlan }
 */
export async function startExecution(workflowId, params, ctx) {
  const { workspaceId, orgId, actor, orgPlan = 'free' } = ctx;

  const definition = loadDefinition(workflowId);
  const plan       = await buildExecutionPlan(workflowId, params, ctx);

  const execution = await createExecution({
    workspaceId,
    orgId,
    workflowId,
    workflowName: plan.workflowName ?? definition.name,
    plan,
    startedBy: actor?.email ?? actor?.id ?? null,
  });

  const runtimeCtx = createRuntimeContext({
    executionId: execution.id,
    workspaceId,
    workflowId,
    params,
  });

  _running.set(execution.id, { paused: false, cancelled: false });

  _execute(execution.id, plan, runtimeCtx, ctx).catch(err => {
    console.error(`[RuntimeEngine] unhandled error in ${execution.id}:`, err.message);
    markFailed(execution.id, err).catch(() => {});
    _broadcast(workspaceId, execution.id, WorkflowEvent.FAILED, { error: err.message });
  });

  return { executionId: execution.id, status: 'PLANNING' };
}

/** Pause a running execution after the current step completes. */
export async function pauseExecution(executionId, workspaceId) {
  const ctrl = _running.get(executionId);
  if (!ctrl) throw new AppError('Execution is not running', 409, 'NOT_RUNNING');
  ctrl.paused = true;
  await markPaused(executionId);
  _broadcast(workspaceId, executionId, WorkflowEvent.PAUSED, { executionId });
}

/** Resume a paused execution. */
export async function resumeExecution(executionId, workspaceId) {
  const ctrl = _running.get(executionId);
  if (!ctrl) throw new AppError('Execution is not paused', 409, 'NOT_PAUSED');
  ctrl.paused = false;
  await markRunningFromPaused(executionId);
  _broadcast(workspaceId, executionId, WorkflowEvent.RESUMED, { executionId });
}

/** Cancel a running or paused execution. */
export async function cancelExecution(executionId, workspaceId) {
  const ctrl = _running.get(executionId);
  if (ctrl) {
    ctrl.cancelled = true;
    ctrl.paused    = false; // unblock the pause loop so it can reach the cancelled check
  }
  await markCancelled(executionId);
  await deleteCheckpoint(executionId);
  _running.delete(executionId);
  _broadcast(workspaceId, executionId, WorkflowEvent.CANCELLED, { executionId });
}

/**
 * Resume a WAITING_APPROVAL execution after its approval is resolved.
 * Called by the approval route handler (approvalRoutes.js) on approve.
 */
export async function resumeAfterApproval(executionId, workspaceId, engineCtx) {
  const checkpoint = await loadCheckpoint(executionId);
  const { rows }   = await (await import('../config/db.js')).pool.query(
    `SELECT plan FROM workflow_executions WHERE id = $1 AND workspace_id = $2`,
    [executionId, workspaceId]
  );
  if (!rows.length || !checkpoint) {
    throw new AppError('Cannot resume — execution or checkpoint not found', 404, 'NOT_FOUND');
  }

  const plan       = rows[0].plan;
  const runtimeCtx = deserializeContext(checkpoint);

  _running.set(executionId, { paused: false, cancelled: false });
  await markRunning(executionId);

  _execute(executionId, plan, runtimeCtx, engineCtx).catch(err => {
    markFailed(executionId, err).catch(() => {});
    _broadcast(workspaceId, executionId, WorkflowEvent.FAILED, { error: err.message });
  });

  _broadcast(workspaceId, executionId, WorkflowEvent.APPROVAL_RESOLVED, { executionId });
}

/**
 * Resume an execution that was paused at a durable wait step.
 * Called by WaitCoordinator._resolveWait() when a wait is resolved.
 *
 * The resolved data is injected into runtimeCtx.variables under the key
 * `__wait_resolved__<stepId>` so that the step handler can detect it on
 * the next execution pass and return normally instead of re-registering.
 *
 * @param {string} executionId
 * @param {string} workspaceId
 * @param {object} resolvedWith — the resolved wait payload from WaitCoordinator
 */
export async function resumeFromWait(executionId, workspaceId, resolvedWith) {
  const checkpoint = await loadCheckpoint(executionId);
  const { rows }   = await (await import('../config/db.js')).pool.query(
    `SELECT plan, status FROM workflow_executions WHERE id = $1 AND workspace_id = $2`,
    [executionId, workspaceId]
  );

  if (!rows.length || !checkpoint) {
    console.error(`[RuntimeEngine] resumeFromWait: missing plan or checkpoint for ${executionId}`);
    return;
  }

  const { plan, status } = rows[0];
  if (!['WAITING_EVENT', 'WAITING_TIMER', 'WAITING_CALLBACK',
        'WAITING_DATE', 'WAITING_MULTI_EVENT', 'PAUSED'].includes(status)) {
    console.warn(`[RuntimeEngine] resumeFromWait: execution ${executionId} is in status ${status} — skipping`);
    return;
  }

  const runtimeCtx = deserializeContext(checkpoint);

  // Inject resolved data into variables so the step handler finds it on re-run
  if (resolvedWith?.stepId || runtimeCtx._pendingWaitStepId) {
    const stepId = resolvedWith?.stepId ?? runtimeCtx._pendingWaitStepId;
    setVariable(runtimeCtx, `__wait_resolved__${stepId}`, resolvedWith);
  } else {
    // Inject against the most recent wait step we can identify from the checkpoint
    setVariable(runtimeCtx, '__wait_resolved_last', resolvedWith);
  }

  const engineCtx = {
    workspaceId,
    orgId:   runtimeCtx.orgId  ?? null,
    actor:   { id: runtimeCtx.startedBy, email: runtimeCtx.startedBy },
    orgPlan: 'free',
  };

  _running.set(executionId, { paused: false, cancelled: false });
  await markRunning(executionId);

  _execute(executionId, plan, runtimeCtx, engineCtx).catch(err => {
    markFailed(executionId, err).catch(() => {});
    _broadcast(workspaceId, executionId, WorkflowEvent.FAILED, { error: err.message });
  });
}

// ── Read API ──────────────────────────────────────────────────────────────────

export async function getWorkflowExecution(executionId, workspaceId) {
  const snap = getSnapshot(executionId);
  if (snap && snap.workspaceId === workspaceId) return snap;
  return getExecution(executionId, workspaceId);
}

export async function listWorkflowExecutions(workspaceId, options = {}) {
  return listExecutions(workspaceId, options);
}

// ── Internal: main execution loop ─────────────────────────────────────────────

async function _execute(executionId, plan, runtimeCtx, engineCtx) {
  const { workspaceId } = runtimeCtx;
  const control = _running.get(executionId) ?? { paused: false, cancelled: false };

  await markRunning(executionId);
  _broadcast(workspaceId, executionId, WorkflowEvent.STARTED, {
    executionId,
    workflowId:   plan.workflowId,
    workflowName: plan.workflowName,
    summary:      plan.summary ?? null,
  });

  // Steps already completed in a prior run (recovery / resume after approval)
  const doneStepIds = new Set(await _getCompletedStepIds(executionId));
  const finalResults = { steps: {} };

  try {
    await _withTimeout(executionId, async () => {
      for (const step of plan.steps) {
        // ── Cancellation check ──────────────────────────────────────────────
        if (control.cancelled) break;

        // ── Pause loop ──────────────────────────────────────────────────────
        while (control.paused && !control.cancelled) {
          await _sleep(100);
        }
        if (control.cancelled) break;

        // ── Recovery: skip already-done steps ───────────────────────────────
        if (doneStepIds.has(step.id)) {
          finalResults.steps[step.id] = { status: 'SKIPPED_RECOVERED' };
          continue;
        }

        // ── Skip steps (no I/O, no DB record with start/end) ────────────────
        if (step.type === 'skip') {
          const output = { skipped: true, reasons: step.reasons ?? [] };
          await recordStepSkipped(executionId, step.id, step.name ?? step.id, step.reasons?.join('; ') ?? '');
          _broadcast(workspaceId, executionId, WorkflowEvent.STEP_SKIPPED, {
            executionId, stepId: step.id, stepName: step.name, reasons: step.reasons ?? [],
          });
          trackStepOutput(runtimeCtx, step, output);
          if (step.outputAs) setVariable(runtimeCtx, step.outputAs, output);
          finalResults.steps[step.id] = { status: 'SKIPPED', reasons: step.reasons ?? [] };
          runtimeCtx.metrics.stepsSkipped++;
          continue;
        }

        // ── All other step types ─────────────────────────────────────────────
        const recordId = await recordStepStart(
          executionId, step.id, step.name ?? step.id,
          typeof step.buildPayload === 'function' ? null : (step.payload ?? step.params ?? null)
        );
        _broadcast(workspaceId, executionId, WorkflowEvent.STEP_STARTED, {
          executionId, stepId: step.id, stepName: step.name,
        });

        const t0         = Date.now();
        const maxRetries = step.retryable === false ? 1 : (step.maxRetries ?? MAX_RETRY_DEFAULT);
        let success      = false;
        let lastErr      = null;
        let output       = null;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
          try {
            output  = await executeStep(step, runtimeCtx, engineCtx);
            success = true;
            break;
          } catch (err) {
            lastErr = err;

            // ── Approval required — halt the workflow ────────────────────────
            if (err.code === 'APPROVAL_REQUIRED') {
              const approvalId = err.meta?.approvalId ?? null;
              await recordStepFailed(recordId, executionId, err, Date.now() - t0);
              setApprovalWaiting(runtimeCtx, step.id, approvalId);
              await saveCheckpoint(executionId, runtimeCtx);
              await markWaitingApproval(executionId, approvalId);
              _broadcast(workspaceId, executionId, WorkflowEvent.APPROVAL_REQUESTED, {
                executionId, stepId: step.id, stepName: step.name, approvalId,
              });
              _running.delete(executionId);
              return; // halt — resumeAfterApproval() will re-enter
            }

            // ── Phase 9 durable waits — halt, save checkpoint, then return ───
            if (err.code === 'WAITING_FOR_EVENT') {
              await saveCheckpoint(executionId, runtimeCtx);
              await markWaitingEvent(executionId);
              _running.delete(executionId);
              return;
            }

            if (err.code === 'WAITING_FOR_TIMER') {
              await saveCheckpoint(executionId, runtimeCtx);
              await markWaitingTimer(executionId);
              _running.delete(executionId);
              return;
            }

            if (err.code === 'WAITING_FOR_CALLBACK') {
              await saveCheckpoint(executionId, runtimeCtx);
              await markWaitingCallback(executionId);
              _running.delete(executionId);
              return;
            }

            // ── Retry on transient errors ────────────────────────────────────
            const isTransient = (err.statusCode >= 500 || err.code === 'GITHUB_API_ERROR' || err.code === 'ECONNRESET');
            if (attempt < maxRetries && isTransient && step.retryable !== false) {
              _broadcast(workspaceId, executionId, WorkflowEvent.STEP_RETRYING, {
                executionId, stepId: step.id, attempt, error: err.message,
              });
              await _sleep(RETRY_DELAY_MS * attempt);
            }
          }
        }

        const durationMs = Date.now() - t0;
        runtimeCtx.metrics.stepsRun++;

        if (success) {
          await recordStepComplete(recordId, executionId, step.id, output, durationMs);
          trackStepOutput(runtimeCtx, step, output);
          if (step.outputAs) setVariable(runtimeCtx, step.outputAs, output);
          runtimeCtx.stepResults[step.id] = output;
          runtimeCtx.rollbackStack.push(step.id);
          _broadcast(workspaceId, executionId, WorkflowEvent.STEP_COMPLETED, {
            executionId, stepId: step.id, stepName: step.name, output, durationMs,
          });
          finalResults.steps[step.id] = { status: 'COMPLETED', output };
          // Save checkpoint after each successful step (enables recovery)
          await saveCheckpoint(executionId, runtimeCtx);
        } else {
          runtimeCtx.metrics.stepsFailed++;
          await recordStepFailed(recordId, executionId, lastErr, durationMs);
          trackStepFailure(runtimeCtx, step, lastErr);
          _broadcast(workspaceId, executionId, WorkflowEvent.STEP_FAILED, {
            executionId, stepId: step.id, stepName: step.name, error: lastErr?.message, durationMs,
          });
          finalResults.steps[step.id] = { status: 'FAILED', error: lastErr?.message };

          // Run compensation steps if defined
          if (Array.isArray(step.compensationSteps)) {
            for (const compStep of step.compensationSteps) {
              try {
                await executeStep(compStep, runtimeCtx, engineCtx);
              } catch { /* compensation is best-effort */ }
            }
          }

          // critical: false → absorb and continue (e.g. Slack notification)
          if (step.critical === false) continue;

          // Fail fast by default for critical steps
          throw lastErr;
        }
      }
    });

    if (control.cancelled) {
      await markCancelled(executionId);
      await deleteCheckpoint(executionId);
      _broadcast(workspaceId, executionId, WorkflowEvent.CANCELLED, { executionId });
    } else {
      finalResults.metrics = {
        ...runtimeCtx.metrics,
        completedAt: Date.now(),
        durationMs:  Date.now() - runtimeCtx.metrics.startedAt,
      };
      await markCompleted(executionId, finalResults);
      await deleteCheckpoint(executionId);
      _broadcast(workspaceId, executionId, WorkflowEvent.COMPLETED, { executionId, results: finalResults });
    }
  } catch (err) {
    await markFailed(executionId, err);
    await deleteCheckpoint(executionId);
    _broadcast(workspaceId, executionId, WorkflowEvent.FAILED, { executionId, error: err.message });
    throw err;
  } finally {
    _running.delete(executionId);
  }
}

// ── Recovery (called at boot) ─────────────────────────────────────────────────

export async function recoverStaleExecutions() {
  const stale = await findStaleExecutions();
  if (stale.length === 0) return;

  console.log(`[RuntimeEngine] recovering ${stale.length} stale execution(s)`);

  for (const row of stale) {
    try {
      const checkpoint = await loadCheckpoint(row.id);
      if (!checkpoint || !row.plan) {
        await failStaleExecution(row.id, 'Recovery failed: missing checkpoint or plan');
        continue;
      }

      const runtimeCtx = deserializeContext(checkpoint);
      const engineCtx  = {
        workspaceId: row.workspace_id,
        orgId:       row.org_id,
        actor:       { id: row.started_by, email: row.started_by },
        orgPlan:     'free',
      };

      _running.set(row.id, { paused: false, cancelled: false });

      _execute(row.id, row.plan, runtimeCtx, engineCtx).catch(err => {
        console.error(`[RuntimeEngine] recovery failed for ${row.id}:`, err.message);
        markFailed(row.id, err).catch(() => {});
      });

      _broadcast(row.workspace_id, row.id, WorkflowEvent.RECOVERED, { executionId: row.id });
    } catch (err) {
      console.error(`[RuntimeEngine] could not recover ${row.id}:`, err.message);
      await failStaleExecution(row.id, `Recovery error: ${err.message}`);
    }
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _broadcast(workspaceId, executionId, event, payload) {
  broadcastToWorkspace(workspaceId, event, { executionId, ...payload });
  if (_ssePush && executionId) {
    _ssePush(executionId, event, { executionId, ...payload });
  }
}

async function _withTimeout(executionId, fn) {
  return Promise.race([
    fn(),
    new Promise((_, reject) =>
      setTimeout(
        () => reject(new AppError(
          `Workflow ${executionId} timed out after ${WORKFLOW_TIMEOUT_MS}ms`,
          504,
          'WORKFLOW_TIMEOUT'
        )),
        WORKFLOW_TIMEOUT_MS
      )
    ),
  ]);
}

const _sleep = ms => new Promise(r => setTimeout(r, ms));

async function _getCompletedStepIds(executionId) {
  const { pool } = await import('../config/db.js');
  const { rows } = await pool.query(
    `SELECT step_id FROM workflow_step_executions
     WHERE workflow_id = $1 AND status IN ('COMPLETED','SKIPPED')`,
    [executionId]
  );
  return rows.map(r => r.step_id);
}
