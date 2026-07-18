/**
 * SyncEngine — unified orchestrator for all connector sync operations.
 *
 * Handles the full pipeline for a single sync job:
 *   1. Load checkpoint (cursor) from sync_state
 *   2. Call connector adapter (returns items + newCursor)
 *   3. INTEGRATION PERMISSION GATE — drop everything the workspace has not
 *      authorized FLOW to read (Phase 13.1)
 *   4. Dedup each item via DeltaProcessor (skip unchanged etags)
 *   5. Check conflict for write-back connectors (Calendar, Notion)
 *   6. Enqueue non-duplicate items into the ingestion pipeline
 *   7. Bulk-update DeltaProcessor with seen item IDs
 *   8. Persist new checkpoint and update sync_records
 *   9. Broadcast progress via WebSocket
 *
 * The gate runs BEFORE dedup so a blocked item leaves no trace anywhere: not in
 * the ingestion queue, not in the dedup table, not in the vector store.
 *
 * The caller (SyncWorker) handles BullMQ retry/DLQ on thrown errors.
 */

import { ingestionQueue }            from '../../config/queue.js';
import { filterItems, markSynced }   from '../../core/governance/integrationPermissions/index.js';
import {
  markSyncStarted,
  markSyncComplete,
  markSyncFailed,
  getCursor,
  scheduleNextSync,
}                                    from '../integrations/SyncStateManager.js';
import { isDuplicate, bulkMarkSynced } from './DeltaProcessor.js';
import { checkConflict, resolveConflict } from './ConflictResolver.js';
import {
  reportStarted,
  reportProgress,
  reportCompleted,
  reportFailed,
}                                    from './ProgressReporter.js';

// ── Connector adapter registry ────────────────────────────────────────────────

const ADAPTERS = {
  github:            () => import('./connectors/GitHubSyncAdapter.js'),
  gmail:             () => import('./connectors/GmailSyncAdapter.js'),
  'google-calendar': () => import('./connectors/CalendarSyncAdapter.js'),
  slack:             () => import('./connectors/SlackSyncAdapter.js'),
  notion:            () => import('./connectors/NotionSyncAdapter.js'),
  jira:              () => import('./connectors/JiraSyncAdapter.js'),
};

// Default sync intervals per connector (ms)
export const SYNC_INTERVALS = {
  github:            15 * 60 * 1000,
  gmail:             10 * 60 * 1000,
  'google-calendar': 15 * 60 * 1000,
  slack:             10 * 60 * 1000,
  notion:            30 * 60 * 1000,
  jira:              20 * 60 * 1000,
  default:           30 * 60 * 1000,
};

// Default resource types to sync per connector
export const DEFAULT_RESOURCE_TYPES = {
  github:            ['repositories', 'pull_requests', 'issues', 'commits', 'releases'],
  gmail:             ['threads', 'messages', 'labels'],
  'google-calendar': ['events', 'invites'],
  slack:             ['channels', 'messages', 'threads'],
  notion:            ['pages', 'databases'],
  jira:              ['projects', 'issues', 'comments'],
};

/**
 * Run a sync for one workspace + connector + resourceType.
 *
 * @param {string} workspaceId
 * @param {string} connectorId
 * @param {string} resourceType
 * @param {object} opts
 * @param {string} [opts.trigger]        — 'scheduled' | 'manual' | 'webhook' | 'initial'
 * @param {object} [opts.webhookPayload] — raw webhook payload for narrow syncs
 * @param {number} [opts.attempt]        — current attempt number (for logging)
 * @param {number} [opts.maxAttempts]    — max attempts before DLQ
 * @returns {Promise<{ itemsSynced: number, itemsNew: number, itemsSkipped: number, newCursor: string }>}
 */
export async function runSync(workspaceId, connectorId, resourceType, opts = {}) {
  const { trigger = 'scheduled', webhookPayload = null } = opts;

  const adapterLoader = ADAPTERS[connectorId];
  if (!adapterLoader) throw new Error(`No sync adapter for connector "${connectorId}"`);

  const adapter = await adapterLoader();

  // 1. Mark sync started; load current cursor
  const syncRecordId = await markSyncStarted(workspaceId, connectorId, resourceType, trigger);
  const cursorState  = await getCursor(workspaceId, connectorId, resourceType);
  const cursor       = cursorState?.cursor ?? null;

  reportStarted(workspaceId, connectorId, resourceType, trigger);

  let itemsSynced  = 0;
  let itemsNew     = 0;
  let itemsSkipped = 0;
  let itemsFailed  = 0;
  let itemsBlocked = 0;
  let newCursor    = cursor;

  try {
    // 2. Run connector adapter
    const result = await adapter.sync(workspaceId, resourceType, cursor, { webhookPayload });
    newCursor = result.newCursor ?? new Date().toISOString();

    // 3. Integration Permission Gate — the workspace decides what FLOW may read.
    //    Anything not explicitly authorized stops here and enters nothing.
    const gated = await filterItems(workspaceId, connectorId, result.items);
    const items = gated.allowed;
    itemsBlocked = gated.blocked.length;

    // Surface which allowed resources actually produced data ("synced 2m ago").
    if (gated.allowedResourceIds.length) {
      await markSynced(workspaceId, connectorId, gated.allowedResourceIds);
    }

    // 4-6. Process each permitted item: dedup → conflict check → ingest
    const seenItems = [];

    for (const item of items) {
      try {
        // 4. Dedup check
        const isDup = await isDuplicate(
          workspaceId, connectorId, resourceType,
          item.externalId, item.etag ?? null,
        );

        seenItems.push({ externalId: item.externalId, etag: item.etag ?? null });

        if (isDup) {
          itemsSkipped++;
          continue;
        }

        // 5. Conflict check (Calendar/Notion only)
        const { hasConflict, localEtag } = await checkConflict(
          workspaceId, connectorId, resourceType, item.externalId, item.etag,
        );

        if (hasConflict) {
          await resolveConflict(workspaceId, connectorId, resourceType, item.externalId, {
            localEtag,
            remoteEtag: item.etag,
            strategy:   'remote_wins', // provider is always source of truth
          });
          // Fall through: still ingest the remote version
        }

        // 6. Enqueue into ingestion pipeline
        await ingestionQueue.add('sync', {
          workspaceId,
          platform: item.platform,
          sender:   item.sender,
          channel:  item.channel,
          text:     item.text,
          metadata: item.metadata || {},
        }, {
          // Deduplicate in BullMQ as well (same external ID won't create 2 pending jobs)
          jobId: `ingest:${workspaceId}:${connectorId}:${item.externalId}`,
        });

        itemsNew++;
        itemsSynced++;
      } catch (itemErr) {
        itemsFailed++;
        // Don't throw — continue with remaining items; mark_failed happens at end if count is total
      }

      // Progress update every 25 items
      if ((itemsSynced + itemsSkipped) % 25 === 0) {
        reportProgress(workspaceId, connectorId, resourceType, {
          itemsProcessed: itemsSynced + itemsSkipped,
          itemsNew,
          itemsSkipped,
          page: Math.floor((itemsSynced + itemsSkipped) / 25),
        });
      }
    }

    // 7. Bulk-update dedup table
    if (seenItems.length) {
      await bulkMarkSynced(workspaceId, connectorId, resourceType, seenItems);
    }

    // 8. Persist checkpoint
    const interval   = SYNC_INTERVALS[connectorId] ?? SYNC_INTERVALS.default;
    const nextSyncAt = trigger === 'manual' ? null : new Date(Date.now() + interval);

    await markSyncComplete(syncRecordId, workspaceId, connectorId, resourceType, {
      newCursor,
      itemsSynced,
      itemsFailed,
      itemsBlocked,
      nextSyncAt,
    });

    // 9. Broadcast completion
    reportCompleted(workspaceId, connectorId, resourceType, {
      itemsSynced,
      itemsNew,
      itemsSkipped,
      itemsFailed,
      itemsBlocked,
      durationMs: undefined, // SyncStateManager computes this
      newCursor,
    });

    return { itemsSynced, itemsNew, itemsSkipped, itemsFailed, itemsBlocked, newCursor };
  } catch (err) {
    await markSyncFailed(syncRecordId, workspaceId, connectorId, resourceType, err.message);
    reportFailed(workspaceId, connectorId, resourceType, err, opts.attempt, opts.maxAttempts);
    throw err; // re-throw so BullMQ can retry
  }
}

/**
 * Run an initial full sync for all resource types of a connector.
 * Enqueues individual BullMQ jobs per resource type (not blocking).
 */
export async function runInitialSync(workspaceId, connectorId) {
  const { enqueueSyncJob } = await import('../../config/syncQueue.js');
  const types = DEFAULT_RESOURCE_TYPES[connectorId] || ['default'];

  for (const resourceType of types) {
    await enqueueSyncJob(workspaceId, connectorId, resourceType, {
      trigger: 'initial',
      delayMs: 0,
    });
  }

  return { enqueued: types.length, resourceTypes: types };
}
