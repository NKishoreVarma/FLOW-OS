/**
 * SyncStateManager — tracks incremental sync state and history for every connector.
 *
 * Tables: sync_state (cursors), sync_records (per-run history).
 * Both are created by scripts/migrate-integrations-v10.sql.
 *
 * Design:
 *   - Each workspace+connector+resourceType triple has exactly one sync_state row.
 *   - Every sync run writes a sync_records row for audit + UI history.
 *   - Cursors are platform-native strings (historyId for Gmail, since for GitHub, etc.).
 */

import db from '../../config/db.js';

// ── Sync State (cursor management) ────────────────────────────────────────────

/**
 * Read the current sync cursor for a connector+resource.
 * Returns null if no sync has ever run.
 */
export async function getCursor(workspaceId, connectorId, resourceType = 'default') {
  const { rows } = await db.query(
    `SELECT cursor, last_sync_at, status
       FROM sync_state
      WHERE workspace_id = $1 AND connector_id = $2 AND resource_type = $3`,
    [workspaceId, connectorId, resourceType],
  );
  if (!rows.length) return null;
  return {
    cursor:      rows[0].cursor,
    lastSyncAt:  rows[0].last_sync_at,
    status:      rows[0].status,
  };
}

/**
 * Mark a sync as started. Returns the sync record ID to pass to markComplete/markFailed.
 */
export async function markSyncStarted(workspaceId, connectorId, resourceType = 'default', trigger = 'scheduled') {
  // Upsert sync_state to mark as running
  await db.query(
    `INSERT INTO sync_state (workspace_id, connector_id, resource_type, status)
     VALUES ($1, $2, $3, 'running')
     ON CONFLICT (workspace_id, connector_id, resource_type) DO UPDATE SET
       status        = 'running',
       error_message = NULL`,
    [workspaceId, connectorId, resourceType],
  );

  // Get the current cursor (before this run)
  const state = await getCursor(workspaceId, connectorId, resourceType);

  // Create a sync_records row
  const { rows } = await db.query(
    `INSERT INTO sync_records
       (workspace_id, connector_id, resource_type, status, trigger, cursor_before, started_at)
     VALUES ($1, $2, $3, 'running', $4, $5, NOW())
     RETURNING id`,
    [workspaceId, connectorId, resourceType, trigger, state?.cursor ?? null],
  );
  return rows[0].id;
}

/**
 * Mark a sync as completed, update cursor to the new position.
 */
export async function markSyncComplete(syncRecordId, workspaceId, connectorId, resourceType, {
  newCursor     = null,
  itemsSynced   = 0,
  itemsFailed   = 0,
  itemsBlocked  = 0,
  nextSyncAt    = null,
} = {}) {
  const now = new Date();
  const { rows: rec } = await db.query(
    'SELECT started_at FROM sync_records WHERE id = $1',
    [syncRecordId],
  );
  const durationMs = rec.length ? now - new Date(rec[0].started_at) : null;

  await db.query(
    `UPDATE sync_records SET
       status        = $1,
       items_synced  = $2,
       items_failed  = $3,
       cursor_after  = $4,
       finished_at   = NOW(),
       duration_ms   = $5,
       meta          = meta || $7::jsonb
     WHERE id = $6`,
    [
      itemsFailed > 0 ? 'partial' : 'completed', itemsSynced, itemsFailed, newCursor, durationMs, syncRecordId,
      JSON.stringify({ itemsBlocked }),
    ],
  );

  await db.query(
    `UPDATE sync_state SET
       cursor       = COALESCE($1, cursor),
       last_sync_at = NOW(),
       next_sync_at = $2,
       status       = 'idle',
       item_count   = $3,
       error_message = NULL
     WHERE workspace_id = $4 AND connector_id = $5 AND resource_type = $6`,
    [newCursor, nextSyncAt, itemsSynced, workspaceId, connectorId, resourceType],
  );
}

/**
 * Mark a sync as failed with an error message.
 */
export async function markSyncFailed(syncRecordId, workspaceId, connectorId, resourceType, errorMessage) {
  const now = new Date();
  const { rows: rec } = await db.query(
    'SELECT started_at FROM sync_records WHERE id = $1',
    [syncRecordId],
  );
  const durationMs = rec.length ? now - new Date(rec[0].started_at) : null;

  await Promise.all([
    db.query(
      `UPDATE sync_records SET status = 'failed', error_message = $1, finished_at = NOW(), duration_ms = $2 WHERE id = $3`,
      [errorMessage, durationMs, syncRecordId],
    ),
    db.query(
      `UPDATE sync_state SET status = 'failed', error_message = $1
        WHERE workspace_id = $2 AND connector_id = $3 AND resource_type = $4`,
      [errorMessage, workspaceId, connectorId, resourceType],
    ),
  ]);
}

// ── Sync History (UI + audit) ─────────────────────────────────────────────────

/**
 * Return the last N sync records for a workspace+connector.
 */
export async function getSyncHistory(workspaceId, connectorId, { limit = 20, resourceType = null } = {}) {
  const params = [workspaceId, connectorId, limit];
  const rtFilter = resourceType ? 'AND resource_type = $4' : '';
  if (resourceType) params.push(resourceType);

  const { rows } = await db.query(
    `SELECT id, resource_type, status, trigger, items_synced, items_failed,
            error_message, started_at, finished_at, duration_ms
       FROM sync_records
      WHERE workspace_id = $1 AND connector_id = $2 ${rtFilter}
      ORDER BY started_at DESC
      LIMIT $3`,
    params,
  );
  return rows;
}

/**
 * Return aggregate sync stats for a connector: total synced, last sync time, success rate.
 */
export async function getSyncStats(workspaceId, connectorId) {
  const { rows } = await db.query(
    `SELECT
       COUNT(*)                                            AS total_runs,
       SUM(items_synced)                                   AS total_items,
       SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS successful_runs,
       MAX(finished_at)                                    AS last_sync_at,
       AVG(duration_ms)                                    AS avg_duration_ms
       FROM sync_records
      WHERE workspace_id = $1 AND connector_id = $2`,
    [workspaceId, connectorId],
  );
  if (!rows.length) return null;
  const r    = rows[0];
  const total = parseInt(r.total_runs, 10);
  return {
    totalRuns:      total,
    totalItems:     parseInt(r.total_items, 10) || 0,
    successRate:    total ? Math.round((parseInt(r.successful_runs, 10) / total) * 100) : 0,
    lastSyncAt:     r.last_sync_at,
    avgDurationMs:  r.avg_duration_ms ? Math.round(r.avg_duration_ms) : null,
  };
}

/**
 * List all connectors that have sync state for this workspace.
 */
export async function listSyncedConnectors(workspaceId) {
  const { rows } = await db.query(
    `SELECT DISTINCT connector_id, MAX(last_sync_at) AS last_sync_at
       FROM sync_state
      WHERE workspace_id = $1
      GROUP BY connector_id
      ORDER BY last_sync_at DESC NULLS LAST`,
    [workspaceId],
  );
  return rows;
}

/**
 * Schedule the next sync for a connector (used by the sync worker scheduler).
 */
export async function scheduleNextSync(workspaceId, connectorId, resourceType, nextSyncAt) {
  await db.query(
    `UPDATE sync_state SET next_sync_at = $1
      WHERE workspace_id = $2 AND connector_id = $3 AND resource_type = $4`,
    [nextSyncAt, workspaceId, connectorId, resourceType],
  );
}

/**
 * Find connectors that are due for a sync (next_sync_at in the past, status idle).
 * Called by the sync worker cron.
 */
export async function getDueForSync(bufferMs = 60_000) {
  const cutoff = new Date(Date.now() + bufferMs).toISOString();
  const { rows } = await db.query(
    `SELECT workspace_id, connector_id, resource_type, cursor, last_sync_at
       FROM sync_state
      WHERE status = 'idle' AND next_sync_at IS NOT NULL AND next_sync_at <= $1`,
    [cutoff],
  );
  return rows;
}
