/**
 * DeltaProcessor — item-level dedup and delta detection.
 *
 * Maintains sync_items table: (workspace_id, connector_id, resource_type, external_id, etag).
 * Before ingesting an item, callers check isDuplicate(). If the etag matches the last
 * synced value, the item is skipped (not re-ingested into the vector store).
 *
 * On every sync the caller calls markSynced() for each item it processes, whether or not
 * the item was actually ingested. This keeps last_seen_at fresh for garbage collection.
 */

import db from '../../config/db.js';

/**
 * Check whether an item has already been synced and is unchanged.
 *
 * @param {string} workspaceId
 * @param {string} connectorId
 * @param {string} resourceType
 * @param {string} externalId   — provider's stable unique ID for the item
 * @param {string|null} etag    — content fingerprint (SHA, historyId, updatedAt, etc.)
 *                                Pass null to always re-ingest.
 * @returns {Promise<boolean>}  true = unchanged (skip ingestion)
 */
export async function isDuplicate(workspaceId, connectorId, resourceType, externalId, etag) {
  if (!etag) return false;
  const { rows } = await db.query(
    `SELECT etag FROM sync_items
      WHERE workspace_id = $1 AND connector_id = $2
        AND resource_type = $3 AND external_id = $4`,
    [workspaceId, connectorId, resourceType, externalId],
  );
  return rows.length > 0 && rows[0].etag === etag;
}

/**
 * Record that an item was seen in the current sync run.
 * Upserts: inserts if new, updates last_seen_at (and etag) if existing.
 *
 * @param {string} workspaceId
 * @param {string} connectorId
 * @param {string} resourceType
 * @param {string} externalId
 * @param {string|null} etag
 */
export async function markSynced(workspaceId, connectorId, resourceType, externalId, etag) {
  await db.query(
    `INSERT INTO sync_items (workspace_id, connector_id, resource_type, external_id, etag)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (workspace_id, connector_id, resource_type, external_id) DO UPDATE SET
       etag         = EXCLUDED.etag,
       last_seen_at = NOW()`,
    [workspaceId, connectorId, resourceType, externalId, etag ?? null],
  );
}

/**
 * Batch version of markSynced for efficiency (one round-trip per page).
 *
 * @param {string} workspaceId
 * @param {string} connectorId
 * @param {string} resourceType
 * @param {Array<{ externalId: string, etag?: string }>} items
 */
export async function bulkMarkSynced(workspaceId, connectorId, resourceType, items) {
  if (!items.length) return;

  // Build multi-row VALUES clause
  const rows   = items.map((item, i) => {
    const base = i * 5;
    return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5})`;
  });
  const values = items.flatMap(item => [
    workspaceId, connectorId, resourceType, item.externalId, item.etag ?? null,
  ]);

  await db.query(
    `INSERT INTO sync_items (workspace_id, connector_id, resource_type, external_id, etag)
     VALUES ${rows.join(', ')}
     ON CONFLICT (workspace_id, connector_id, resource_type, external_id) DO UPDATE SET
       etag         = EXCLUDED.etag,
       last_seen_at = NOW()`,
    values,
  );
}

/**
 * Return all known external IDs for a connector+resource (for local-vs-remote diffing).
 */
export async function getKnownIds(workspaceId, connectorId, resourceType) {
  const { rows } = await db.query(
    `SELECT external_id, etag FROM sync_items
      WHERE workspace_id = $1 AND connector_id = $2 AND resource_type = $3`,
    [workspaceId, connectorId, resourceType],
  );
  return new Map(rows.map(r => [r.external_id, r.etag]));
}

/**
 * Remove items from the dedup table that haven't been seen since cutoffDate.
 * Useful for garbage-collecting deleted items.
 */
export async function pruneStaleItems(workspaceId, connectorId, resourceType, cutoffDate) {
  const { rowCount } = await db.query(
    `DELETE FROM sync_items
      WHERE workspace_id = $1 AND connector_id = $2
        AND resource_type = $3 AND last_seen_at < $4`,
    [workspaceId, connectorId, resourceType, cutoffDate],
  );
  return rowCount;
}
