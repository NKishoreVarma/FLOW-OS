/**
 * WaitCoordinator — the single authority for registering and resolving
 * all durable wait states for long-running workflow executions.
 *
 * Architecture:
 *   RuntimeEngine calls registerWait() when a step throws WAITING_FOR_TIMER / WAITING_FOR_CALLBACK.
 *   AutomationEngine calls onEvent() when any event arrives on the FLOW event bus.
 *   TimerManager calls handleTimerFired() when a BullMQ timer job fires.
 *   External callers POST /webhook/workflow-callback/:token → handleCallback().
 *
 *   When a wait resolves:
 *     resolveWait() → injects resolved data into runtimeCtx.variables
 *                   → calls RuntimeEngine.resumeFromWait()
 *
 * All state is durable (PostgreSQL). This module holds no in-memory state.
 * After a crash, re-registration is not needed — WaitStore is the source of truth.
 */

import { logger }            from '../utils/logger.js';
import {
  createWait,
  getWait,
  findWaitByCallbackToken,
  findPendingEventWaits,
  resolveWait     as dbResolveWait,
  expireWait,
  cancelWaitsForExecution,
  setTimerJobId,
  appendReceivedEvent,
  generateCallbackToken,
} from './WaitStore.js';
import { scheduleTimer, cancelTimer } from './TimerManager.js';
import { evaluate }          from '../automation/eventRouter/ConditionEvaluator.js';
import { isBusinessHours, nextBusinessHoursStart } from '../automation/scheduler/BusinessHours.js';

// ── Registration ──────────────────────────────────────────────────────────────

/**
 * Register a wait state for a halted execution.
 * Called by the new step-type handlers in StepExecutor when they decide to pause.
 *
 * @param {object} def
 * @param {string} def.executionId
 * @param {string} def.workspaceId
 * @param {string} def.stepId
 * @param {string} def.waitType — EVENT | TIMER | CALLBACK | DATE | DURATION | BUSINESS_HOURS | MULTI_EVENT
 * @param {string} [def.eventType]
 * @param {object} [def.eventFilter]
 * @param {string|Date} [def.resumeAfter]
 * @param {number} [def.durationMs]
 * @param {string} [def.timezone]
 * @param {object[]} [def.requiredEvents]
 * @param {string|Date} [def.timeoutAt]
 * @returns {Promise<{waitId, callbackToken?}>}
 */
export async function registerWait(def) {
  const {
    executionId,
    workspaceId,
    stepId,
    waitType,
    eventType    = null,
    eventFilter  = null,
    resumeAfter  = null,
    durationMs   = null,
    timezone     = 'UTC',
    requiredEvents = null,
    timeoutAt    = null,
  } = def;

  let resolvedResumeAfter = resumeAfter;
  let callbackToken       = null;

  // Compute resume time for duration / business-hours waits
  if (waitType === 'DURATION' && durationMs) {
    resolvedResumeAfter = new Date(Date.now() + durationMs).toISOString();
  }
  if (waitType === 'BUSINESS_HOURS') {
    resolvedResumeAfter = nextBusinessHoursStart(timezone);
  }

  if (waitType === 'CALLBACK') {
    callbackToken = generateCallbackToken();
  }

  const wait = await createWait({
    executionId,
    workspaceId,
    stepId,
    waitType,
    eventType,
    eventFilter,
    resumeAfter:    resolvedResumeAfter ? new Date(resolvedResumeAfter) : null,
    callbackToken,
    requiredEvents,
    timeoutAt:      timeoutAt ? new Date(timeoutAt) : null,
  });

  // Schedule BullMQ timer for time-based waits
  if (resolvedResumeAfter && ['TIMER','DATE','DURATION','BUSINESS_HOURS'].includes(waitType)) {
    const { timerId, jobId } = await scheduleTimer({
      executionId,
      workspaceId,
      waitStateId:   wait.id,
      timerType:     'RESUME',
      fireAt:        new Date(resolvedResumeAfter),
    });
    await setTimerJobId(wait.id, jobId);
    logger.info(`[WaitCoordinator] Registered ${waitType} wait ${wait.id} for ${executionId}, fires at ${resolvedResumeAfter}`);
  }

  // Schedule escalation timeout if requested
  if (timeoutAt) {
    await scheduleTimer({
      executionId,
      workspaceId,
      waitStateId:  wait.id,
      timerType:    'TIMEOUT',
      fireAt:       new Date(timeoutAt),
    });
  }

  logger.info(`[WaitCoordinator] Registered ${waitType} wait ${wait.id} for execution ${executionId} step ${stepId}`);
  return { waitId: wait.id, callbackToken };
}

// ── Event routing ─────────────────────────────────────────────────────────────

/**
 * Called by AutomationEngine for every event on the FLOW event bus.
 * Finds all PENDING event waits for this workspace+eventType, evaluates
 * their filters, and resolves matching ones.
 */
export async function onEvent(event) {
  const { workspaceId, eventType } = event;
  if (!workspaceId || !eventType) return;

  const waits = await findPendingEventWaits(workspaceId, eventType);
  if (waits.length === 0) return;

  for (const wait of waits) {
    try {
      if (wait.wait_type === 'EVENT') {
        const filter = wait.event_filter;
        if (filter && !evaluate(filter, event)) continue;
        await _resolveWait(wait.id, wait.execution_id, wait.workspace_id, { event });
      } else if (wait.wait_type === 'MULTI_EVENT') {
        await _handleMultiEventArrival(wait, event);
      }
    } catch (err) {
      logger.error(`[WaitCoordinator] Error resolving wait ${wait.id}: ${err.message}`);
    }
  }
}

// ── Timer fired ───────────────────────────────────────────────────────────────

/**
 * Called by TimerManager when a BullMQ timer job fires.
 */
export async function handleTimerFired({ executionId, workspaceId, waitStateId, timerType }) {
  if (timerType === 'TIMEOUT') {
    await _handleTimeout(executionId, workspaceId, waitStateId);
    return;
  }

  if (timerType === 'ESCALATION') {
    await _handleEscalation(executionId, workspaceId, waitStateId);
    return;
  }

  // RESUME / REMINDER
  if (!waitStateId) {
    logger.warn(`[WaitCoordinator] Timer fired for ${executionId} but no waitStateId`);
    return;
  }

  const wait = await getWait(waitStateId);
  if (!wait || wait.status !== 'PENDING') return;

  await _resolveWait(wait.id, executionId, workspaceId, { timerFired: true, firedAt: new Date().toISOString() });
}

// ── Callback ──────────────────────────────────────────────────────────────────

/**
 * Resolve a wait via external HTTP callback.
 * Called by /webhook/workflow-callback/:token handler.
 *
 * @param {string} token — the callback_token from the wait registration
 * @param {object} data  — arbitrary payload sent by the external system
 */
export async function handleCallback(token, data = {}) {
  const wait = await findWaitByCallbackToken(token);
  if (!wait) {
    const err = new Error(`No pending wait found for callback token`);
    err.status = 404;
    throw err;
  }

  await _resolveWait(wait.id, wait.execution_id, wait.workspace_id, { callback: data });
  return { executionId: wait.execution_id, waitId: wait.id };
}

// ── Cancellation ──────────────────────────────────────────────────────────────

/**
 * Cancel all pending waits for an execution (e.g., workflow was cancelled).
 */
export async function cancelAllWaits(executionId) {
  await cancelWaitsForExecution(executionId);
  await cancelTimer(executionId);
}

// ── Internal ──────────────────────────────────────────────────────────────────

async function _resolveWait(waitId, executionId, workspaceId, resolvedWith) {
  const resolved = await dbResolveWait(waitId, resolvedWith);
  if (!resolved) return; // already resolved — idempotent

  // Resume the halted workflow with the resolved data
  const { resumeFromWait } = await import('../runtime/RuntimeEngine.js');
  await resumeFromWait(executionId, workspaceId, resolvedWith);
}

async function _handleMultiEventArrival(wait, event) {
  // Append the received event and check if all required events have arrived
  const updated = await appendReceivedEvent(wait.id, event);
  if (!updated) return;

  const required = Array.isArray(wait.required_events) ? wait.required_events : [];
  const received = Array.isArray(updated.received_events) ? updated.received_events : [];

  const allReceived = required.every(req =>
    received.some(r => r.eventType === req.eventType)
  );

  if (allReceived) {
    await _resolveWait(
      wait.id,
      wait.execution_id,
      wait.workspace_id,
      { multiEvent: true, receivedEvents: received }
    );
  }
}

async function _handleTimeout(executionId, workspaceId, waitStateId) {
  const wait = waitStateId ? await getWait(waitStateId) : null;
  if (wait && wait.status === 'PENDING') {
    await expireWait(wait.id);
  }

  // Fail the workflow with a timeout error
  const { markFailed } = await import('../workflows/WorkflowState.js');
  await markFailed(executionId, new Error('Workflow wait state timed out (SLA exceeded)'));
  logger.warn(`[WaitCoordinator] Execution ${executionId} timed out — marked FAILED`);
}

async function _handleEscalation(executionId, workspaceId, waitStateId) {
  // Broadcast an escalation event — the workflow itself decides what to do
  const { broadcastToWorkspace } = await import('../services/socketService.js');
  broadcastToWorkspace(workspaceId, 'WORKFLOW_ESCALATION', {
    executionId,
    waitStateId,
    escalatedAt: new Date().toISOString(),
  });
  logger.warn(`[WaitCoordinator] Escalation triggered for execution ${executionId}`);
}
