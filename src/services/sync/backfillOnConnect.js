/**
 * backfillOnConnect — enqueue an INITIAL sync + activate the recurring schedule
 * for a connector the moment a workspace authorizes it.
 *
 * This closes gap A1: OAuth stores tokens but never triggered a first data pull,
 * so a freshly connected workspace stayed empty until the next scheduled tick.
 *
 * Safety invariants (do NOT regress):
 *  - Flag-gated. Off unless SYNC_ON_CONNECT === 'true'. Rollback = unset the flag.
 *  - Respects the deny-by-default Integration Permission Gate. If the workspace
 *    has not allowed any resources yet, SyncEngine.filterItems drops everything
 *    BEFORE dedup/persistence — this is a safe no-op, never fabricated data.
 *  - Best-effort. A backfill failure never breaks the OAuth callback / connect flow.
 *  - Reusable: call from the OAuth callback (on connect) AND from the permission
 *    save path (once resources are actually allowed) — jobId dedup makes it idempotent.
 */

import { enqueueSyncJob }        from '../../config/syncQueue.js';
import { activateConnector }     from './SyncScheduler.js';
import { DEFAULT_RESOURCE_TYPES } from './SyncEngine.js';
import { logger }               from '../../utils/logger.js';

// Google shares one OAuth token across these sync connectors.
const CONNECTOR_GROUPS = {
  google: ['gmail', 'google-calendar'],
};

function isEnabled() {
  return process.env.SYNC_ON_CONNECT === 'true';
}

/**
 * Enqueue an initial backfill for every connector in a provider group.
 *
 * @param {string} workspaceId  — workspace externalId (tenant key)
 * @param {string} provider     — 'google' | a single connectorId ('gmail', 'github'…)
 * @returns {Promise<{enqueued: string[], skipped: string, reason?: string}>}
 */
export async function backfillOnConnect(workspaceId, provider) {
  if (!isEnabled()) {
    return { enqueued: [], skipped: 'flag-disabled', reason: 'SYNC_ON_CONNECT!=true' };
  }
  if (!workspaceId) {
    return { enqueued: [], skipped: 'no-workspace' };
  }

  const connectors = CONNECTOR_GROUPS[provider] || [provider];
  const enqueued = [];

  for (const connectorId of connectors) {
    const resourceTypes = DEFAULT_RESOURCE_TYPES[connectorId];
    if (!resourceTypes) continue; // no sync adapter for this connector

    // CRITICAL PATH — the initial backfill. Each resource type is enqueued
    // independently so one failure never drops the rest. This must NOT depend on
    // recurring-schedule persistence (see below).
    for (const resourceType of resourceTypes) {
      try {
        await enqueueSyncJob(workspaceId, connectorId, resourceType, { trigger: 'initial' });
        enqueued.push(`${connectorId}/${resourceType}`);
      } catch (err) {
        logger.queue(`backfillOnConnect: enqueue ${connectorId}/${resourceType} failed for ${workspaceId} — ${err.message}`);
      }
    }

    // BEST-EFFORT — register the recurring schedule so the workspace stays current
    // after the initial pull. Decoupled from the enqueue above: if the scheduler
    // store (sync_schedules) is unavailable, the one-time backfill still fired.
    try {
      await activateConnector(workspaceId, connectorId);
    } catch (err) {
      logger.queue(`backfillOnConnect: schedule activation for ${connectorId} skipped (${err.message})`);
    }
  }

  logger.queue?.(`backfillOnConnect: enqueued initial sync for ${workspaceId} — ${enqueued.join(', ') || '(none)'}`);
  return { enqueued, skipped: enqueued.length ? null : 'nothing-enqueued' };
}
