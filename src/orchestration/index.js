/**
 * Long-Running Workflow Orchestration Platform — public API and boot entry point.
 *
 * Call startOrchestration() once at server boot (after startWorkflowRuntime()).
 *
 * Architecture:
 *   TimerManager   — BullMQ queue + worker for durable timers
 *   WaitCoordinator — registers waits, resolves them on event/timer/callback
 *   RecoveryManager — boot recovery for waiting executions, periodic health check
 *
 *   The AutomationEngine subscriber bridge is wired here: every event on the
 *   FLOW event bus is forwarded to WaitCoordinator.onEvent() so waiting
 *   workflows can be resumed by events.
 */

export { registerWait, onEvent, handleTimerFired, handleCallback, cancelAllWaits } from './WaitCoordinator.js';
export { register as registerCompensation, runCompensation, getCompensationLog }   from './CompensationManager.js';
export { getExecutionDetail, listInstances, getCheckpointHistory, getExecutionGraph, getActiveWaits, getWaitReason } from './WorkflowInspector.js';
export { append as appendCheckpointHistory }                                        from './CheckpointHistory.js';

import { startTimerWorker, stopTimerWorker }     from './TimerManager.js';
import { bootRecovery, startPeriodicRecovery, stopPeriodicRecovery } from './RecoveryManager.js';
import { subscribe, unsubscribe }               from '../events/index.js';
import { logger }                               from '../utils/logger.js';

let _eventSubscriptionId = null;

export async function startOrchestration() {
  // 1. Start the BullMQ timer worker
  await startTimerWorker();

  // 2. Subscribe to the FLOW event bus — forward all events to WaitCoordinator
  //    so waiting EVENT/MULTI_EVENT workflows can be resumed
  const { onEvent } = await import('./WaitCoordinator.js');
  _eventSubscriptionId = subscribe(
    'orchestration-wait-resolver',
    {},   // no pre-filter — WaitStore does the matching
    async (event) => {
      try {
        await onEvent(event);
      } catch (err) {
        logger.error(`[Orchestration] onEvent error: ${err.message}`);
      }
    },
    { priority: 5, durable: false },
  );

  // 3. Boot recovery: re-wire waiting executions that survived the restart
  try {
    await bootRecovery();
  } catch (err) {
    logger.error('[Orchestration] Boot recovery error (non-fatal):', err.message);
  }

  // 4. Start periodic health check (stall detection, duplicate detection)
  startPeriodicRecovery();

  logger.info('[Orchestration] Long-running workflow orchestration started');
}

export async function stopOrchestration() {
  stopPeriodicRecovery();
  await stopTimerWorker();
  if (_eventSubscriptionId) {
    try { unsubscribe(_eventSubscriptionId); } catch { /* ignore */ }
    _eventSubscriptionId = null;
  }
}
