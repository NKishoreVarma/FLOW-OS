/**
 * ScheduledJobStore — PostgreSQL CRUD for automation scheduled jobs.
 */

import { query }      from '../../config/db.js';
import { randomUUID } from 'crypto';
import { ValidationError } from '../../core/errors/index.js';

const SCHEDULE_TYPES = ['CRON', 'DELAY', 'RECURRING'];

export async function createJob({
  workspaceId, name, eventId, payload = {},
  scheduleType, cronExpression, delayMs,
  timezone = 'UTC', businessHoursOnly = false, enabled = true,
}) {
  if (!workspaceId)   throw new ValidationError('workspaceId required');
  if (!name)          throw new ValidationError('name required');
  if (!eventId)       throw new ValidationError('eventId required');
  if (!SCHEDULE_TYPES.includes(scheduleType)) throw new ValidationError(`scheduleType must be one of ${SCHEDULE_TYPES.join(', ')}`);
  if (scheduleType === 'DELAY' && !delayMs) throw new ValidationError('delayMs required for DELAY type');
  if ((scheduleType === 'CRON' || scheduleType === 'RECURRING') && !cronExpression) throw new ValidationError('cronExpression required for CRON/RECURRING type');

  const id = randomUUID();
  const { rows: [row] } = await query(
    `INSERT INTO scheduled_jobs
       (id, workspace_id, name, event_id, payload, schedule_type, cron_expression,
        delay_ms, timezone, business_hours_only, enabled)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     RETURNING *`,
    [id, workspaceId, name, eventId, JSON.stringify(payload), scheduleType,
     cronExpression ?? null, delayMs ?? null, timezone, businessHoursOnly, enabled],
  );
  return normalize(row);
}

export async function getJob(id, workspaceId) {
  const { rows } = await query('SELECT * FROM scheduled_jobs WHERE id=$1 AND workspace_id=$2', [id, workspaceId]);
  return rows[0] ? normalize(rows[0]) : null;
}

export async function listJobs(workspaceId, { enabled } = {}) {
  const where = ['workspace_id=$1'];
  const vals  = [workspaceId];
  if (enabled !== undefined) where.push(`enabled=$${vals.push(enabled)}`);
  const { rows } = await query(
    `SELECT * FROM scheduled_jobs WHERE ${where.join(' AND ')} ORDER BY created_at DESC`,
    vals,
  );
  return rows.map(normalize);
}

export async function updateJob(id, workspaceId, { enabled, cronExpression, payload, bullJobId, lastFiredAt, nextFireAt } = {}) {
  const sets = ['updated_at=NOW()'], vals = [];
  if (enabled !== undefined)        sets.push(`enabled=$${vals.push(enabled)}`);
  if (cronExpression !== undefined) sets.push(`cron_expression=$${vals.push(cronExpression)}`);
  if (payload !== undefined)        sets.push(`payload=$${vals.push(JSON.stringify(payload))}`);
  if (bullJobId !== undefined)      sets.push(`bull_job_id=$${vals.push(bullJobId)}`);
  if (lastFiredAt !== undefined)    sets.push(`last_fired_at=$${vals.push(lastFiredAt)}`);
  if (nextFireAt !== undefined)     sets.push(`next_fire_at=$${vals.push(nextFireAt)}`);
  const { rows: [row] } = await query(
    `UPDATE scheduled_jobs SET ${sets.join(',')} WHERE id=$${vals.push(id)} AND workspace_id=$${vals.push(workspaceId)} RETURNING *`,
    vals,
  );
  return row ? normalize(row) : null;
}

export async function deleteJob(id, workspaceId) {
  const { rowCount } = await query('DELETE FROM scheduled_jobs WHERE id=$1 AND workspace_id=$2', [id, workspaceId]);
  return rowCount > 0;
}

function normalize(row) {
  return {
    id:               row.id,
    workspaceId:      row.workspace_id,
    name:             row.name,
    eventId:          row.event_id,
    payload:          row.payload ?? {},
    scheduleType:     row.schedule_type,
    cronExpression:   row.cron_expression ?? null,
    delayMs:          row.delay_ms ?? null,
    timezone:         row.timezone,
    businessHoursOnly: row.business_hours_only,
    enabled:          row.enabled,
    lastFiredAt:      row.last_fired_at ?? null,
    nextFireAt:       row.next_fire_at   ?? null,
    bullJobId:        row.bull_job_id    ?? null,
    createdAt:        row.created_at,
    updatedAt:        row.updated_at,
  };
}
