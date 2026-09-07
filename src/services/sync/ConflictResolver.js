/**
 * ConflictResolver — detects and records sync conflicts.
 *
 * Conflict scenario: FLOW stored metadata on an item (e.g., meeting notes in
 * extendedProperties) and the same item was also updated on the provider side
 * since the last sync. For most connectors, the provider is the source of truth
 * (remote_wins). Conflicts are logged for audit and surfaced in the UI.
 *
 * Strategy:
 *   - remote_wins (default): provider state overwrites local FLOW metadata
 *   - local_wins:            FLOW metadata is preserved, provider update ignored
 *   - merged:                both sets of fields are combined (FLOW metadata +
 *                            provider update fields)
 *
 * The SyncEngine calls checkConflict() before ingesting items that had locally
 * stored metadata. For pure read connectors (GitHub, Slack, Jira) this is a no-op.
 */

import db from '../../config/db.js';

const DEFAULT_STRATEGY = 'remote_wins';

/**
 * Check whether this item has a conflict (was locally modified since last sync).
 * Currently a stub — returns false unless the item is in the local-modified set.
 * Extend this when FLOW supports write-back to connectors.
 *
 * @returns {{ hasConflict: boolean, localEtag?: string }}
 */
export async function checkConflict(workspaceId, connectorId, resourceType, externalId, remoteEtag) {
  // No write-back connectors in Phase 10.2 → conflicts can only arise for
  // Google Calendar and Notion (where FLOW stores extendedProperties / page props).
  // For now: detect etag mismatch for these connectors.
  if (!['google-calendar', 'notion'].includes(connectorId)) {
    return { hasConflict: false };
  }

  const { rows } = await db.query(
    `SELECT etag FROM sync_items
      WHERE workspace_id = $1 AND connector_id = $2
        AND resource_type = $3 AND external_id = $4`,
    [workspaceId, connectorId, resourceType, externalId],
  );

  if (!rows.length) return { hasConflict: false };
  const localEtag = rows[0].etag;
  if (!localEtag || localEtag === remoteEtag) return { hasConflict: false };

  return { hasConflict: true, localEtag };
}

/**
 * Record a conflict and apply the configured resolution strategy.
 * Returns the effective resolution for this item.
 */
export async function resolveConflict(workspaceId, connectorId, resourceType, externalId, {
  localEtag  = null,
  remoteEtag = null,
  strategy   = DEFAULT_STRATEGY,
} = {}) {
  const resolution = ['local_wins', 'remote_wins', 'merged'].includes(strategy)
    ? strategy
    : DEFAULT_STRATEGY;

  await db.query(
    `INSERT INTO sync_conflicts
       (workspace_id, connector_id, resource_type, external_id, local_etag, remote_etag, resolution, resolved_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
     ON CONFLICT DO NOTHING`,
    [workspaceId, connectorId, resourceType, externalId, localEtag, remoteEtag, resolution],
  );

  return resolution;
}

/**
 * List unresolved (pending) conflicts for a workspace.
 */
export async function listConflicts(workspaceId, { limit = 50, connectorId = null } = {}) {
  const params = [workspaceId, limit];
  const filter = connectorId ? 'AND connector_id = $3' : '';
  if (connectorId) params.push(connectorId);

  const { rows } = await db.query(
    `SELECT id, connector_id, resource_type, external_id, resolution,
            local_etag, remote_etag, detected_at, resolved_at
       FROM sync_conflicts
      WHERE workspace_id = $1 ${filter}
      ORDER BY detected_at DESC
      LIMIT $2`,
    params,
  );
  return rows;
}
