/**
 * Runtime-side WorkflowState re-export.
 *
 * WorkflowState lives in src/workflows/WorkflowState.js.
 * RuntimeEngine imports from './WorkflowState.js' (relative to src/runtime/).
 * This shim re-exports everything and adds Phase-9 status transitions for the
 * new durable wait statuses (WAITING_EVENT, WAITING_TIMER, WAITING_CALLBACK).
 */

export * from '../workflows/WorkflowState.js';

import { pool } from '../config/db.js';

function _updateStatus(executionId, status) {
  return pool.query(
    `UPDATE workflow_executions SET status = $2 WHERE id = $1`,
    [executionId, status]
  );
}

/** Mark an execution as blocked waiting for an event from the event bus. */
export async function markWaitingEvent(executionId) {
  await _updateStatus(executionId, 'WAITING_EVENT');
}

/** Mark an execution as blocked waiting for a BullMQ timer to fire. */
export async function markWaitingTimer(executionId) {
  await _updateStatus(executionId, 'WAITING_TIMER');
}

/** Mark an execution as blocked waiting for an external HTTP callback. */
export async function markWaitingCallback(executionId) {
  await _updateStatus(executionId, 'WAITING_CALLBACK');
}
