/**
 * WaitStore — PostgreSQL CRUD for workflow_wait_states.
 *
 * One row per active wait. A workflow paused at a wait step has exactly one
 * PENDING row. The row is resolved (RESOLVED | EXPIRED | CANCELLED) when
 * the condition is satisfied or the workflow is cancelled.
 *
 * wait_type values:
 *   EVENT          — waiting for a specific FLOW event matching an eventType + optional filter
 *   TIMER          — waiting for a BullMQ-scheduled moment in time
 *   CALLBACK       — waiting for an external HTTP POST to /webhook/workflow-callback/:token
 *   DATE           — waiting until a specific ISO date/time
 *   DURATION       — waiting for N ms/s/m/h/d (translated to DATE at registration time)
 *   BUSINESS_HOURS — waiting until business hours start (computed from now)
 *   MULTI_EVENT    — waiting until N named events have all arrived
 */

import { pool } from '../config/db.js';
import { randomBytes } from 'crypto';

// ── Create ────────────────────────────────────────────────────────────────────

export async function createWait({
  executionId,
  workspaceId,
  stepId,
  waitType,
  eventType      = null,
  eventFilter    = null,
  resumeAfter    = null,
  callbackToken  = null,
  requiredEvents = null,
  timeoutAt      = null,
}) {
  const { rows } = await pool.query(
    `INSERT INTO workflow_wait_states
       (execution_id, workspace_id, step_id, wait_type,
        event_type, event_filter, resume_after,
        callback_token, required_events, timeout_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     RETURNING *`,
    [
      executionId, workspaceId, stepId, waitType,
      eventType, eventFilter ? JSON.stringify(eventFilter) : null,
      resumeAfter,
      callbackToken, requiredEvents ? JSON.stringify(requiredEvents) : null,
      timeoutAt,
    ]
  );
  return rows[0];
}

// ── Read ──────────────────────────────────────────────────────────────────────

export async function getWait(id) {
  const { rows } = await pool.query(
    `SELECT * FROM workflow_wait_states WHERE id = $1`,
    [id]
  );
  return rows[0] ?? null;
}

export async function getActiveWaitForExecution(executionId) {
  const { rows } = await pool.query(
    `SELECT * FROM workflow_wait_states
     WHERE execution_id = $1 AND status = 'PENDING'
     ORDER BY created_at DESC LIMIT 1`,
    [executionId]
  );
  return rows[0] ?? null;
}

export async function findWaitByCallbackToken(token) {
  const { rows } = await pool.query(
    `SELECT * FROM workflow_wait_states
     WHERE callback_token = $1 AND status = 'PENDING'`,
    [token]
  );
  return rows[0] ?? null;
}

/** Find all PENDING event waits that match a given eventType + workspaceId. */
export async function findPendingEventWaits(workspaceId, eventType) {
  const { rows } = await pool.query(
    `SELECT * FROM workflow_wait_states
     WHERE workspace_id = $1
       AND status = 'PENDING'
       AND wait_type IN ('EVENT', 'MULTI_EVENT')
       AND (event_type = $2 OR
            (wait_type = 'MULTI_EVENT' AND required_events::text ILIKE $3))`,
    [workspaceId, eventType, `%${eventType}%`]
  );
  return rows;
}

/** Find all PENDING timer/date waits whose resume_after has passed. (Recovery use.) */
export async function findExpiredTimerWaits() {
  const { rows } = await pool.query(
    `SELECT * FROM workflow_wait_states
     WHERE status = 'PENDING'
       AND wait_type IN ('TIMER','DATE','DURATION')
       AND resume_after <= NOW()`
  );
  return rows;
}

export async function listWaits(workspaceId, { executionId, status, limit = 50 } = {}) {
  const conditions = ['workspace_id = $1'];
  const params     = [workspaceId];
  let   idx        = 2;

  if (executionId) { conditions.push(`execution_id = $${idx++}`); params.push(executionId); }
  if (status)      { conditions.push(`status = $${idx++}`);        params.push(status); }

  params.push(Math.min(limit, 200));
  const { rows } = await pool.query(
    `SELECT * FROM workflow_wait_states
     WHERE ${conditions.join(' AND ')}
     ORDER BY created_at DESC LIMIT $${idx}`,
    params
  );
  return rows;
}

// ── Update ────────────────────────────────────────────────────────────────────

export async function resolveWait(id, resolvedWith = null) {
  const { rows } = await pool.query(
    `UPDATE workflow_wait_states
     SET status = 'RESOLVED', resolved_at = NOW(), resolved_with = $2
     WHERE id = $1 AND status = 'PENDING'
     RETURNING *`,
    [id, resolvedWith ? JSON.stringify(resolvedWith) : null]
  );
  return rows[0] ?? null;
}

export async function expireWait(id) {
  const { rows } = await pool.query(
    `UPDATE workflow_wait_states
     SET status = 'EXPIRED', resolved_at = NOW()
     WHERE id = $1 AND status = 'PENDING'
     RETURNING *`,
    [id]
  );
  return rows[0] ?? null;
}

export async function cancelWaitsForExecution(executionId) {
  await pool.query(
    `UPDATE workflow_wait_states
     SET status = 'CANCELLED', resolved_at = NOW()
     WHERE execution_id = $1 AND status = 'PENDING'`,
    [executionId]
  );
}

export async function setTimerJobId(id, jobId) {
  await pool.query(
    `UPDATE workflow_wait_states SET timer_job_id = $2 WHERE id = $1`,
    [id, jobId]
  );
}

/** Append an event to received_events for MULTI_EVENT waits. */
export async function appendReceivedEvent(id, event) {
  const { rows } = await pool.query(
    `UPDATE workflow_wait_states
     SET received_events = received_events || $2::jsonb
     WHERE id = $1 AND status = 'PENDING'
     RETURNING *`,
    [id, JSON.stringify([event])]
  );
  return rows[0] ?? null;
}

// ── Token generation ──────────────────────────────────────────────────────────

export function generateCallbackToken() {
  return randomBytes(32).toString('hex');
}
