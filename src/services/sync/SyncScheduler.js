/**
 * SyncScheduler — manages BullMQ repeat jobs for scheduled background syncs.
 *
 * Each active workspace+connector+resourceType gets a repeating BullMQ job
 * that fires on the configured interval. The schedule is persisted in the
 * sync_schedules table so it survives restarts and can be inspected via API.
 *
 * Operations:
 *   activateSchedule()   — create/update BullMQ repeat job + DB record
 *   deactivateSchedule() — remove BullMQ repeat job + mark DB record disabled
 *   getSchedules()       — list active schedules for a workspace
 *   activateAllConnected() — called at server start to restore schedules for
 *                            all workspaces that have connected connectors
 */

import { Queue }         from 'bullmq';
import Redis             from 'ioredis';
import db                from '../../config/db.js';
import { logger }        from '../../utils/logger.js';
import { DEFAULT_RESOURCE_TYPES, SYNC_INTERVALS } from './SyncEngine.js';
import { listConnectedConnectors } from '../integrations/ConnectorCredentialStore.js';
import { hasTokens }     from '../google/GoogleTokenManager.js';

const connection = new Redis(process.env.REDIS_URL || 'redis://127.0.0.1:6379', {
  maxRetriesPerRequest: null,
});

const syncQueue = new Queue('connector-sync', { connection });

/**
 * Activate a scheduled sync for one workspace+connector+resourceType.
 *
 * @param {string} workspaceId
 * @param {string} connectorId
 * @param {string} resourceType
 * @param {number} [intervalMs]  — defaults to SYNC_INTERVALS[connectorId]
 */
export async function activateSchedule(workspaceId, connectorId, resourceType = 'default', intervalMs) {
  const interval = intervalMs ?? SYNC_INTERVALS[connectorId] ?? SYNC_INTERVALS.default;
  const jobName  = `scheduled:${workspaceId}:${connectorId}:${resourceType}`;

  // Remove any existing repeat job for this triple
  await syncQueue.removeRepeatable(jobName, { every: interval });

  // Add new repeat job
  await syncQueue.add(
    jobName,
    { workspaceId, connectorId, resourceType, trigger: 'scheduled' },
    { repeat: { every: interval }, jobId: jobName },
  );

  // Persist to DB
  await db.query(
    `INSERT INTO sync_schedules (workspace_id, connector_id, resource_type, interval_ms, bullmq_key, enabled)
     VALUES ($1, $2, $3, $4, $5, true)
     ON CONFLICT (workspace_id, connector_id, resource_type) DO UPDATE SET
       interval_ms = $4,
       bullmq_key  = $5,
       enabled     = true,
       updated_at  = NOW()`,
    [workspaceId, connectorId, resourceType, interval, jobName],
  );

  logger.queue(`SyncScheduler: activated ${connectorId}/${resourceType} for ${workspaceId} (every ${interval / 60000}m)`);
}

/**
 * Deactivate a scheduled sync.
 */
export async function deactivateSchedule(workspaceId, connectorId, resourceType = 'default') {
  const { rows } = await db.query(
    `SELECT bullmq_key, interval_ms FROM sync_schedules
      WHERE workspace_id = $1 AND connector_id = $2 AND resource_type = $3`,
    [workspaceId, connectorId, resourceType],
  );

  if (rows.length) {
    const { bullmq_key, interval_ms } = rows[0];
    try {
      await syncQueue.removeRepeatable(bullmq_key, { every: interval_ms });
    } catch { /* job may not exist in queue */ }
  }

  await db.query(
    `UPDATE sync_schedules SET enabled = false, updated_at = NOW()
      WHERE workspace_id = $1 AND connector_id = $2 AND resource_type = $3`,
    [workspaceId, connectorId, resourceType],
  );

  logger.queue(`SyncScheduler: deactivated ${connectorId}/${resourceType} for ${workspaceId}`);
}

/**
 * List all schedules for a workspace.
 */
export async function getSchedules(workspaceId) {
  const { rows } = await db.query(
    `SELECT connector_id, resource_type, interval_ms, enabled, created_at, updated_at
       FROM sync_schedules
      WHERE workspace_id = $1
      ORDER BY connector_id, resource_type`,
    [workspaceId],
  );
  return rows;
}

/**
 * Activate all resource types for a connector.
 * Called after OAuth connect or on server start.
 */
export async function activateConnector(workspaceId, connectorId) {
  const types = DEFAULT_RESOURCE_TYPES[connectorId] || ['default'];
  for (const resourceType of types) {
    await activateSchedule(workspaceId, connectorId, resourceType);
  }
  return { activated: types.length, resourceTypes: types };
}

/**
 * Deactivate all resource types for a connector.
 * Called after OAuth disconnect.
 */
export async function deactivateConnector(workspaceId, connectorId) {
  const types = DEFAULT_RESOURCE_TYPES[connectorId] || ['default'];
  for (const resourceType of types) {
    await deactivateSchedule(workspaceId, connectorId, resourceType);
  }
  return { deactivated: types.length };
}

/**
 * Restore all active schedules on server boot.
 * Queries sync_schedules for enabled rows and re-registers BullMQ repeat jobs
 * (they are lost when the process restarts unless persisted in Redis, which
 *  BullMQ does — but this provides a DB-backed fallback).
 */
export async function restoreSchedulesOnBoot() {
  try {
    const { rows } = await db.query(
      `SELECT workspace_id, connector_id, resource_type, interval_ms, bullmq_key
         FROM sync_schedules WHERE enabled = true`,
    );

    let restored = 0;
    for (const row of rows) {
      try {
        await syncQueue.add(
          row.bullmq_key,
          { workspaceId: row.workspace_id, connectorId: row.connector_id,
            resourceType: row.resource_type, trigger: 'scheduled' },
          { repeat: { every: row.interval_ms }, jobId: row.bullmq_key },
        );
        restored++;
      } catch { /* job may already exist in Redis */ }
    }

    logger.queue(`SyncScheduler: restored ${restored}/${rows.length} schedules on boot`);
  } catch (err) {
    // sync_schedules table may not exist yet if migration hasn't run
    logger.warn(`SyncScheduler: could not restore schedules — ${err.message}`);
  }
}
