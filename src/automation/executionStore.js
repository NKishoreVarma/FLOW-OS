/**
 * executionStore — PostgreSQL persistence for automation trigger executions.
 * Every event→trigger→workflow mapping is recorded here as the Event Timeline.
 */

import { query }  from '../config/db.js';
import { randomUUID } from 'crypto';

export async function createExecution({
  triggerId, workspaceId, eventId, eventSourceId, workflowId,
  executionId = null, status = 'PENDING', params = {}, error = null,
}) {
  const id = randomUUID();
  const { rows: [row] } = await query(
    `INSERT INTO automation_executions
       (id, trigger_id, workspace_id, event_id, event_source_id,
        workflow_id, execution_id, status, params, error)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     RETURNING *`,
    [id, triggerId ?? null, workspaceId, eventId, eventSourceId ?? null,
     workflowId, executionId, status, JSON.stringify(params), error ?? null],
  );
  return normalize(row);
}

export async function updateExecution(id, { status, executionId, error } = {}) {
  if (!id) return null;
  const sets = ['updated_at=NOW()'];
  const vals = [];
  if (status      !== undefined) sets.push(`status=$${vals.push(status)}`);
  if (executionId !== undefined) sets.push(`execution_id=$${vals.push(executionId)}`);
  if (error       !== undefined) sets.push(`error=$${vals.push(error)}`);
  if (status === 'COMPLETED' || status === 'FAILED' || status === 'SKIPPED' || status === 'RATE_LIMITED') {
    sets.push('completed_at=NOW()');
  }
  const { rows: [row] } = await query(
    `UPDATE automation_executions SET ${sets.join(',')} WHERE id=$${vals.push(id)} RETURNING *`,
    vals,
  );
  return row ? normalize(row) : null;
}

export async function listExecutions(workspaceId, { triggerId, status, limit = 50, offset = 0 } = {}) {
  const where = ['workspace_id=$1'];
  const vals  = [workspaceId];
  if (triggerId) where.push(`trigger_id=$${vals.push(triggerId)}`);
  if (status)    where.push(`status=$${vals.push(status)}`);
  const { rows } = await query(
    `SELECT * FROM automation_executions WHERE ${where.join(' AND ')}
     ORDER BY started_at DESC LIMIT $${vals.push(limit)} OFFSET $${vals.push(offset)}`,
    vals,
  );
  return rows.map(normalize);
}

export async function getExecution(id, workspaceId) {
  const { rows } = await query(
    'SELECT * FROM automation_executions WHERE id=$1 AND workspace_id=$2',
    [id, workspaceId],
  );
  return rows[0] ? normalize(rows[0]) : null;
}

function normalize(row) {
  return {
    id:           row.id,
    triggerId:    row.trigger_id,
    workspaceId:  row.workspace_id,
    eventId:      row.event_id,
    eventSourceId: row.event_source_id,
    workflowId:   row.workflow_id,
    executionId:  row.execution_id,
    status:       row.status,
    params:       row.params ?? {},
    error:        row.error ?? null,
    startedAt:    row.started_at,
    completedAt:  row.completed_at ?? null,
    updatedAt:    row.updated_at,
  };
}
