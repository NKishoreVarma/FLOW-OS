/**
 * TriggerStore — durable PostgreSQL CRUD for trigger definitions.
 *
 * Schema (created by scripts/migrate-automation-platform.sql):
 *   automation_triggers (id, workspace_id, name, description, event_id,
 *     workflow_id, enabled, conditions, param_mapping, priority, rate_limit,
 *     created_by, created_at, updated_at)
 */

import { query } from '../../config/db.js';
import { ValidationError } from '../../core/errors/index.js';
import { randomUUID }      from 'crypto';

const VALID_PRIORITIES = ['LOW', 'NORMAL', 'HIGH', 'CRITICAL'];

function assertWorkspace(workspaceId) {
  if (!workspaceId) throw new ValidationError('workspaceId is required');
}

export async function createTrigger({
  workspaceId, name, description = '', eventId, workflowId,
  enabled = true, conditions = {}, paramMapping = {},
  priority = 'NORMAL', rateLimit = {}, createdBy,
}) {
  assertWorkspace(workspaceId);
  if (!name)       throw new ValidationError('name is required');
  if (!eventId)    throw new ValidationError('eventId is required');
  if (!workflowId) throw new ValidationError('workflowId is required');
  if (!VALID_PRIORITIES.includes(priority)) throw new ValidationError(`priority must be one of ${VALID_PRIORITIES.join(', ')}`);

  const id = randomUUID();
  const { rows: [row] } = await query(
    `INSERT INTO automation_triggers
       (id, workspace_id, name, description, event_id, workflow_id, enabled,
        conditions, param_mapping, priority, rate_limit, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     RETURNING *`,
    [id, workspaceId, name, description, eventId, workflowId, enabled,
     JSON.stringify(conditions), JSON.stringify(paramMapping), priority,
     JSON.stringify(rateLimit), createdBy ?? null],
  );
  return normalize(row);
}

export async function getTrigger(id, workspaceId) {
  assertWorkspace(workspaceId);
  const { rows } = await query(
    'SELECT * FROM automation_triggers WHERE id=$1 AND workspace_id=$2',
    [id, workspaceId],
  );
  if (!rows[0]) return null;
  return normalize(rows[0]);
}

export async function listTriggers(workspaceId, { eventId, enabled, limit = 100, offset = 0 } = {}) {
  assertWorkspace(workspaceId);
  const where = ['workspace_id=$1'];
  const vals  = [workspaceId];
  if (eventId   !== undefined) { where.push(`event_id=$${vals.push(eventId)}`); }
  if (enabled   !== undefined) { where.push(`enabled=$${vals.push(enabled)}`); }
  const { rows } = await query(
    `SELECT * FROM automation_triggers WHERE ${where.join(' AND ')}
     ORDER BY created_at DESC LIMIT $${vals.push(limit)} OFFSET $${vals.push(offset)}`,
    vals,
  );
  return rows.map(normalize);
}

export async function updateTrigger(id, workspaceId, patch) {
  assertWorkspace(workspaceId);
  const allowed = ['name', 'description', 'enabled', 'conditions', 'param_mapping',
                   'priority', 'rate_limit', 'workflow_id'];
  const sets = [], vals = [];
  for (const [k, v] of Object.entries(patch)) {
    const col = k.replace(/([A-Z])/g, '_$1').toLowerCase();
    if (!allowed.includes(col)) continue;
    const val = (typeof v === 'object' && v !== null) ? JSON.stringify(v) : v;
    sets.push(`${col}=$${vals.push(val)}`);
  }
  if (!sets.length) throw new ValidationError('No updatable fields provided');
  sets.push(`updated_at=NOW()`);
  const { rows } = await query(
    `UPDATE automation_triggers SET ${sets.join(',')} WHERE id=$${vals.push(id)} AND workspace_id=$${vals.push(workspaceId)} RETURNING *`,
    vals,
  );
  if (!rows[0]) return null;
  return normalize(rows[0]);
}

export async function deleteTrigger(id, workspaceId) {
  assertWorkspace(workspaceId);
  const { rowCount } = await query(
    'DELETE FROM automation_triggers WHERE id=$1 AND workspace_id=$2',
    [id, workspaceId],
  );
  return rowCount > 0;
}

/** Fetch all ENABLED triggers for a specific eventId across workspaces (used by router fan-out). */
export async function getEnabledTriggersForEvent(eventId) {
  const { rows } = await query(
    'SELECT * FROM automation_triggers WHERE event_id=$1 AND enabled=true ORDER BY priority DESC, created_at ASC',
    [eventId],
  );
  return rows.map(normalize);
}

function normalize(row) {
  return {
    id:          row.id,
    workspaceId: row.workspace_id,
    name:        row.name,
    description: row.description ?? '',
    eventId:     row.event_id,
    workflowId:  row.workflow_id,
    enabled:     row.enabled,
    conditions:  row.conditions  ?? {},
    paramMapping: row.param_mapping ?? {},
    priority:    row.priority,
    rateLimit:   row.rate_limit  ?? {},
    createdBy:   row.created_by  ?? null,
    createdAt:   row.created_at,
    updatedAt:   row.updated_at,
  };
}
