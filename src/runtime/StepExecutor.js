/**
 * Generic Step Executor
 *
 * Dispatches a plan step to the appropriate handler based on step.type.
 * The executor is completely workflow-agnostic — it knows about step types
 * (action, skip, parallel, conditional, loop, approval, delay,
 *  wait_for_event, compensation, sub_workflow), not about PRs or Slack or GitHub.
 *
 * Step types:
 *   action         — execute a connector action via executeAction()
 *   skip           — no-op with reasons (e.g. an unsafe PR)
 *   parallel       — run substeps concurrently via Promise.allSettled
 *   conditional    — evaluate condition, branch to then/else
 *   loop           — iterate over a variable-resolved array
 *   approval       — explicit human-approval gate (distinct from governance approval)
 *   delay          — wait N milliseconds (capped at 60s in-process)
 *   wait_for_event — pause until a named event arrives (signals RuntimeEngine to halt)
 *   compensation   — run a rollback action
 *   sub_workflow   — execute a nested workflow by ID
 */

import { executeAction }          from '../connectors/executionEngine.js';
import { AppError, ValidationError } from '../core/errors/index.js';
import {
  interpolate,
  evaluateCondition,
  setVariable,
  recordStepResult,
} from './RuntimeContext.js';

// ── Public dispatcher ─────────────────────────────────────────────────────────

export async function executeStep(step, runtimeCtx, engineCtx) {
  switch (step.type) {
    case 'action':              return _action(step, runtimeCtx, engineCtx);
    case 'skip':                return _skip(step, runtimeCtx, engineCtx);
    case 'parallel':            return _parallel(step, runtimeCtx, engineCtx);
    case 'conditional':         return _conditional(step, runtimeCtx, engineCtx);
    case 'loop':                return _loop(step, runtimeCtx, engineCtx);
    case 'approval':            return _approval(step, runtimeCtx, engineCtx);
    case 'delay':               return _delay(step, runtimeCtx, engineCtx);
    case 'wait_for_event':      return _waitForEvent(step, runtimeCtx, engineCtx);
    case 'compensation':        return _compensation(step, runtimeCtx, engineCtx);
    case 'sub_workflow':        return _subWorkflow(step, runtimeCtx, engineCtx);
    // Phase 9 — durable wait step types
    case 'wait_event':          return _durableWaitEvent(step, runtimeCtx, engineCtx);
    case 'wait_until_date':     return _waitUntilDate(step, runtimeCtx, engineCtx);
    case 'wait_duration':       return _waitDuration(step, runtimeCtx, engineCtx);
    case 'wait_business_hours': return _waitBusinessHours(step, runtimeCtx, engineCtx);
    case 'wait_callback':       return _waitCallback(step, runtimeCtx, engineCtx);
    case 'wait_multi_event':    return _waitMultiEvent(step, runtimeCtx, engineCtx);
    default:
      throw new ValidationError(`Unknown step type: ${step.type}`);
  }
}

// ── Handlers ──────────────────────────────────────────────────────────────────

async function _action(step, runtimeCtx, engineCtx) {
  const { connectorId, actionType, verifyField } = step;

  if (!connectorId) throw new ValidationError(`Step '${step.id}': connectorId is required for action steps`);
  if (!actionType)  throw new ValidationError(`Step '${step.id}': actionType is required for action steps`);

  // Resolve payload — supports buildPayload(ctx) function or {{interpolation}}
  const payload = typeof step.buildPayload === 'function'
    ? step.buildPayload(runtimeCtx)
    : interpolate(step.payload ?? {}, runtimeCtx);

  const { result } = await executeAction({
    workspaceId: runtimeCtx.workspaceId,
    connectorId,
    actionType,
    payload,
    actor:   engineCtx.actor,
    orgPlan: engineCtx.orgPlan ?? 'free',
  });

  if (verifyField && !result[verifyField]) {
    const err = new AppError(
      `Step '${step.id}': verification failed — ${verifyField} was not truthy in connector response`,
      502,
      'STEP_VERIFICATION_FAILED'
    );
    err.result = result;
    throw err;
  }

  return result;
}

function _skip(step) {
  return { skipped: true, reasons: step.reasons ?? [] };
}

async function _parallel(step, runtimeCtx, engineCtx) {
  if (!Array.isArray(step.steps) || step.steps.length === 0) {
    throw new ValidationError(`Step '${step.id}': parallel step requires a non-empty steps array`);
  }

  const settled = await Promise.allSettled(
    step.steps.map(substep => executeStep(substep, runtimeCtx, engineCtx))
  );

  const results = settled.map((r, i) => ({
    stepId: step.steps[i].id,
    status: r.status === 'fulfilled' ? 'completed' : 'failed',
    output: r.status === 'fulfilled' ? r.value : null,
    error:  r.status === 'rejected'  ? r.reason?.message : null,
  }));

  // Persist sub-results so later steps can reference them
  for (const r of results) {
    if (r.status === 'completed') {
      recordStepResult(runtimeCtx, r.stepId, r.output);
    }
  }

  const failedCount = results.filter(r => r.status === 'failed').length;
  if (failedCount > 0 && step.failFast !== false) {
    const firstFail = results.find(r => r.status === 'failed');
    throw new AppError(
      `Parallel step '${step.id}' had ${failedCount} failure(s); first: ${firstFail.error}`,
      500,
      'PARALLEL_STEP_FAILED'
    );
  }

  return { results, failedCount, completedCount: results.length - failedCount };
}

async function _conditional(step, runtimeCtx, engineCtx) {
  const conditionMet = evaluateCondition(step.condition, runtimeCtx);

  if (step.outputAs) setVariable(runtimeCtx, step.outputAs, conditionMet);

  const branch = conditionMet ? step.then : step.else;
  if (!branch) return { conditionMet, branched: false };

  const output = await executeStep(branch, runtimeCtx, engineCtx);
  return { conditionMet, branched: true, output };
}

async function _loop(step, runtimeCtx, engineCtx) {
  if (!step.over) {
    throw new ValidationError(`Step '${step.id}': loop step requires an 'over' expression`);
  }
  if (!step.body) {
    throw new ValidationError(`Step '${step.id}': loop step requires a 'body' step`);
  }

  // Resolve the collection to iterate over
  const items = typeof step.over === 'function'
    ? step.over(runtimeCtx)
    : (runtimeCtx.variables[step.over] ?? []);

  const as      = step.as ?? 'item';
  const results = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    setVariable(runtimeCtx, as,       item);
    setVariable(runtimeCtx, `${as}Index`, i);

    const result = await executeStep(step.body, runtimeCtx, engineCtx);
    results.push(result);

    if (result?._break) break;
  }

  return { results, iterations: results.length };
}

function _approval(step) {
  // Creates an explicit approval gate. The RuntimeEngine catches this and halts.
  const err = new AppError(
    `Step '${step.id}' requires explicit approval: ${step.reason ?? 'manual review required'}`,
    403,
    'APPROVAL_REQUIRED'
  );
  err.meta = { stepId: step.id, reason: step.reason };
  throw err;
}

async function _delay(step, runtimeCtx) {
  const ms = typeof step.duration === 'function'
    ? step.duration(runtimeCtx)
    : (interpolate(step.durationMs, runtimeCtx) ?? step.durationMs ?? 0);

  const capped = Math.min(Number(ms), 60_000); // never block more than 60s in-process
  await new Promise(r => setTimeout(r, capped));
  return { delayed: true, requestedMs: ms, actualMs: capped };
}

function _waitForEvent(step) {
  // Signal the RuntimeEngine to halt and wait for an external event.
  const err = new AppError(
    `Step '${step.id}' is waiting for event: ${step.eventType}`,
    202,
    'WAITING_FOR_EVENT'
  );
  err.meta = { stepId: step.id, eventType: step.eventType, filter: step.filter ?? null };
  throw err;
}

async function _compensation(step, runtimeCtx, engineCtx) {
  if (!step.compensates) {
    throw new ValidationError(`Step '${step.id}': compensation step requires a 'compensates' step definition`);
  }
  return executeStep(
    { ...step.compensates, id: `${step.id}_comp`, type: step.compensates.type ?? 'action' },
    runtimeCtx,
    engineCtx
  );
}

async function _subWorkflow(step, runtimeCtx, engineCtx) {
  if (!step.workflowId) {
    throw new ValidationError(`Step '${step.id}': sub_workflow step requires a workflowId`);
  }
  // Lazy import to avoid circular dependency
  const { startExecution } = await import('./RuntimeEngine.js');
  const resolvedParams = interpolate(step.params ?? {}, runtimeCtx);
  return startExecution(step.workflowId, resolvedParams, engineCtx);
}

// ── Phase 9 — Durable wait step handlers ─────────────────────────────────────
//
// Each handler follows the same pattern:
//   1. Check runtimeCtx.variables for a resolved wait result (set by WaitCoordinator
//      before calling resumeFromWait). If present → return the resolved data.
//   2. Register the wait with WaitCoordinator and throw WAITING_FOR_TIMER /
//      WAITING_FOR_CALLBACK. RuntimeEngine catches this, checkpoints, and halts.
//   On resume, step 1 fires and the step completes normally.

const RESOLVED_PREFIX = '__wait_resolved__';

function _getWaitResolution(step, runtimeCtx) {
  return runtimeCtx.variables[`${RESOLVED_PREFIX}${step.id}`] ?? null;
}

function _signalWait(step, code, meta = {}) {
  const err = new AppError(
    `Step '${step.id}' is waiting (${code})`,
    202,
    code,
  );
  err.meta = { stepId: step.id, ...meta };
  throw err;
}

/**
 * wait_event — durable version of wait_for_event.
 * step.eventType   — required
 * step.eventFilter — optional ConditionEvaluator condition
 * step.timeoutAt   — optional ISO date; fail with timeout if not resolved by then
 */
async function _durableWaitEvent(step, runtimeCtx, engineCtx) {
  const resolved = _getWaitResolution(step, runtimeCtx);
  if (resolved) return resolved;

  const { registerWait } = await import('../orchestration/WaitCoordinator.js');
  const { waitId }       = await registerWait({
    executionId:  runtimeCtx.executionId,
    workspaceId:  runtimeCtx.workspaceId,
    stepId:       step.id,
    waitType:     'EVENT',
    eventType:    step.eventType,
    eventFilter:  step.eventFilter ?? null,
    timeoutAt:    step.timeoutAt ?? null,
  });

  _signalWait(step, 'WAITING_FOR_TIMER', { waitId, waitType: 'EVENT', eventType: step.eventType });
}

/**
 * wait_until_date — pause until a specific ISO date/time.
 * step.until — ISO string or {{variable}} expression
 */
async function _waitUntilDate(step, runtimeCtx) {
  const resolved = _getWaitResolution(step, runtimeCtx);
  if (resolved) return resolved;

  const until = interpolate(step.until ?? step.resumeAt, runtimeCtx);
  if (!until) throw new ValidationError(`Step '${step.id}': wait_until_date requires 'until' or 'resumeAt'`);

  const target = new Date(until);
  if (isNaN(target.getTime())) throw new ValidationError(`Step '${step.id}': 'until' is not a valid date: ${until}`);

  // If target is in the past, skip the wait and return immediately
  if (target <= new Date()) {
    return { waited: false, reason: 'target date already passed', resumedAt: new Date().toISOString() };
  }

  const { registerWait } = await import('../orchestration/WaitCoordinator.js');
  const { waitId }       = await registerWait({
    executionId:  runtimeCtx.executionId,
    workspaceId:  runtimeCtx.workspaceId,
    stepId:       step.id,
    waitType:     'DATE',
    resumeAfter:  target.toISOString(),
    timeoutAt:    step.timeoutAt ?? null,
  });

  _signalWait(step, 'WAITING_FOR_TIMER', { waitId, waitType: 'DATE', resumeAfter: target.toISOString() });
}

/**
 * wait_duration — pause for a specified duration (ms / seconds / minutes / hours / days).
 * step.durationMs   — milliseconds (exact)
 * step.durationSec  — seconds
 * step.durationMin  — minutes
 * step.durationHrs  — hours
 * step.durationDays — days
 */
async function _waitDuration(step, runtimeCtx) {
  const resolved = _getWaitResolution(step, runtimeCtx);
  if (resolved) return resolved;

  const ms = _resolveDurationMs(step, runtimeCtx);
  if (ms <= 0) return { waited: false, reason: 'duration <= 0' };

  const { registerWait } = await import('../orchestration/WaitCoordinator.js');
  const { waitId }       = await registerWait({
    executionId: runtimeCtx.executionId,
    workspaceId: runtimeCtx.workspaceId,
    stepId:      step.id,
    waitType:    'DURATION',
    durationMs:  ms,
    timeoutAt:   step.timeoutAt ?? null,
  });

  _signalWait(step, 'WAITING_FOR_TIMER', { waitId, waitType: 'DURATION', durationMs: ms });
}

/**
 * wait_business_hours — pause until the next business-hours window starts.
 * step.timezone — IANA timezone (default 'UTC')
 */
async function _waitBusinessHours(step, runtimeCtx) {
  const resolved = _getWaitResolution(step, runtimeCtx);
  if (resolved) return resolved;

  const { isBusinessHours } = await import('../automation/scheduler/BusinessHours.js');
  const timezone            = step.timezone ?? 'UTC';

  // If already in business hours, skip the wait
  if (isBusinessHours(timezone)) {
    return { waited: false, reason: 'already in business hours', timezone };
  }

  const { registerWait } = await import('../orchestration/WaitCoordinator.js');
  const { waitId }       = await registerWait({
    executionId: runtimeCtx.executionId,
    workspaceId: runtimeCtx.workspaceId,
    stepId:      step.id,
    waitType:    'BUSINESS_HOURS',
    timezone,
    timeoutAt:   step.timeoutAt ?? null,
  });

  _signalWait(step, 'WAITING_FOR_TIMER', { waitId, waitType: 'BUSINESS_HOURS', timezone });
}

/**
 * wait_callback — pause until an external system POSTs to the callback URL.
 * Returns { callbackToken, callbackUrl } so planner steps can send it to the
 * external system (e.g., via a Slack message or email before halting).
 */
async function _waitCallback(step, runtimeCtx) {
  const resolved = _getWaitResolution(step, runtimeCtx);
  if (resolved) return resolved;

  const { registerWait } = await import('../orchestration/WaitCoordinator.js');
  const { waitId, callbackToken } = await registerWait({
    executionId: runtimeCtx.executionId,
    workspaceId: runtimeCtx.workspaceId,
    stepId:      step.id,
    waitType:    'CALLBACK',
    timeoutAt:   step.timeoutAt ?? null,
  });

  // Store the callback token in variables so subsequent steps (e.g., send_email) can use it
  setVariable(runtimeCtx, `${step.id}_callbackToken`, callbackToken);
  setVariable(runtimeCtx, `${step.id}_callbackUrl`, `/webhook/workflow-callback/${callbackToken}`);

  _signalWait(step, 'WAITING_FOR_CALLBACK', { waitId, callbackToken });
}

/**
 * wait_multi_event — pause until all N named events have arrived.
 * step.events — array of { eventType, filter? }
 * step.timeoutAt — optional deadline
 */
async function _waitMultiEvent(step, runtimeCtx) {
  const resolved = _getWaitResolution(step, runtimeCtx);
  if (resolved) return resolved;

  if (!Array.isArray(step.events) || step.events.length === 0) {
    throw new ValidationError(`Step '${step.id}': wait_multi_event requires a non-empty 'events' array`);
  }

  const { registerWait } = await import('../orchestration/WaitCoordinator.js');
  const { waitId }       = await registerWait({
    executionId:    runtimeCtx.executionId,
    workspaceId:    runtimeCtx.workspaceId,
    stepId:         step.id,
    waitType:       'MULTI_EVENT',
    requiredEvents: step.events,
    timeoutAt:      step.timeoutAt ?? null,
  });

  _signalWait(step, 'WAITING_FOR_TIMER', { waitId, waitType: 'MULTI_EVENT', required: step.events.length });
}

// ── Duration helpers ──────────────────────────────────────────────────────────

function _resolveDurationMs(step, runtimeCtx) {
  const raw = step.durationMs ?? step.duration;
  if (typeof raw === 'number') return raw;
  if (typeof raw === 'function') return raw(runtimeCtx);

  const resolved = interpolate(raw, runtimeCtx);
  if (typeof resolved === 'number') return resolved;

  // Named duration fields
  const ms  = Number(step.durationMs  ?? 0);
  const sec = Number(step.durationSec ?? 0) * 1_000;
  const min = Number(step.durationMin ?? 0) * 60_000;
  const hrs = Number(step.durationHrs ?? 0) * 3_600_000;
  const day = Number(step.durationDays ?? 0) * 86_400_000;
  return ms + sec + min + hrs + day;
}
