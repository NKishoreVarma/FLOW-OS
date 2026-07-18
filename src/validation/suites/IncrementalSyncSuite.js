/**
 * Incremental Sync Suite — validates delta sync: cursor-based, etag-dedup, minimal re-fetch.
 */

import { assert, assertGreaterThan } from '../helpers/assert.js';
import { isDuplicate, markSynced, bulkMarkSynced, getKnownIds }
  from '../../services/sync/DeltaProcessor.js';
import { isDatabaseReachable } from '../helpers/testContext.js';

export const SUITE = 'incremental_sync';

export const tests = [

  {
    name:                'DeltaProcessor.isDuplicate returns false for first-seen item',
    connectors:          'all',
    requiresCredentials: false,
    requiresDatabase:    true,
    async run({ workspaceId, connectorId }) {
      if (!(await isDatabaseReachable())) throw new Error('SKIP: database unavailable');
      const externalId = `test-item-${Date.now()}`;
      const result = await isDuplicate(workspaceId, connectorId, 'repositories', externalId, 'etag-v1');
      assert(result === false, 'first-seen item: isDuplicate should return false');
    },
  },

  {
    name:                'DeltaProcessor.isDuplicate returns true for same etag (unchanged item)',
    connectors:          'all',
    requiresCredentials: false,
    requiresDatabase:    true,
    async run({ workspaceId, connectorId }) {
      if (!(await isDatabaseReachable())) throw new Error('SKIP: database unavailable');
      const externalId = `test-etag-${Date.now()}`;
      await markSynced(workspaceId, connectorId, 'repositories', externalId, 'etag-stable');
      const dup = await isDuplicate(workspaceId, connectorId, 'repositories', externalId, 'etag-stable');
      assert(dup === true, 'same etag: isDuplicate should return true (no need to re-sync)');
    },
  },

  {
    name:                'DeltaProcessor.isDuplicate returns false for changed etag (updated item)',
    connectors:          'all',
    requiresCredentials: false,
    requiresDatabase:    true,
    async run({ workspaceId, connectorId }) {
      if (!(await isDatabaseReachable())) throw new Error('SKIP: database unavailable');
      const externalId = `test-changed-${Date.now()}`;
      await markSynced(workspaceId, connectorId, 'pull_requests', externalId, 'etag-old');
      const dup = await isDuplicate(workspaceId, connectorId, 'pull_requests', externalId, 'etag-new');
      assert(dup === false, 'changed etag: isDuplicate should return false (item changed, re-sync needed)');
    },
  },

  {
    name:                'bulkMarkSynced stores multiple items atomically',
    connectors:          'all',
    requiresCredentials: false,
    requiresDatabase:    true,
    async run({ workspaceId, connectorId }) {
      if (!(await isDatabaseReachable())) throw new Error('SKIP: database unavailable');
      const ts = Date.now();
      const items = [
        { externalId: `bulk-a-${ts}`, etag: 'e-a' },
        { externalId: `bulk-b-${ts}`, etag: 'e-b' },
        { externalId: `bulk-c-${ts}`, etag: 'e-c' },
      ];
      await bulkMarkSynced(workspaceId, connectorId, 'commits', items);
      const known = await getKnownIds(workspaceId, connectorId, 'commits');
      for (const item of items) {
        assert(known.includes(item.externalId), `${item.externalId} should be in known IDs`);
      }
    },
  },

  {
    name:                'markSynced updates etag on re-sync (upsert semantic)',
    connectors:          'all',
    requiresCredentials: false,
    requiresDatabase:    true,
    async run({ workspaceId, connectorId }) {
      if (!(await isDatabaseReachable())) throw new Error('SKIP: database unavailable');
      const id = `upsert-test-${Date.now()}`;
      await markSynced(workspaceId, connectorId, 'issues', id, 'etag-first');
      await markSynced(workspaceId, connectorId, 'issues', id, 'etag-second');
      // After upsert, isDuplicate should match the latest etag
      const dup = await isDuplicate(workspaceId, connectorId, 'issues', id, 'etag-second');
      assert(dup === true, 'latest etag matches after upsert');
      const dupOld = await isDuplicate(workspaceId, connectorId, 'issues', id, 'etag-first');
      assert(dupOld === false, 'old etag no longer matches after update');
    },
  },

  {
    name:                'cursor is preserved across sync runs (no regression)',
    connectors:          'all',
    requiresCredentials: false,
    requiresDatabase:    true,
    async run({ workspaceId, connectorId }) {
      if (!(await isDatabaseReachable())) throw new Error('SKIP: database unavailable');
      const { markSyncStarted, markSyncComplete, getCursor }
        = await import('../../services/integrations/SyncStateManager.js');
      const rt = 'issues';

      const id1 = await markSyncStarted(workspaceId, connectorId, rt, 'scheduled');
      await markSyncComplete(id1, workspaceId, connectorId, rt,
        { cursor: 'cursor-run-1', itemsNew: 10, itemsUpdated: 0, itemsSkipped: 0, itemsFailed: 0 });

      const id2 = await markSyncStarted(workspaceId, connectorId, rt, 'scheduled');
      const cursorBeforeComplete = await getCursor(workspaceId, connectorId, rt);
      // Cursor from run 1 must still be available during run 2 (before run 2 completes)
      assert(cursorBeforeComplete === 'cursor-run-1', `cursor should be 'cursor-run-1' before run 2 completes`);

      await markSyncComplete(id2, workspaceId, connectorId, rt,
        { cursor: 'cursor-run-2', itemsNew: 3, itemsUpdated: 0, itemsSkipped: 7, itemsFailed: 0 });
      const cursorAfter = await getCursor(workspaceId, connectorId, rt);
      assert(cursorAfter === 'cursor-run-2', `cursor should be updated to 'cursor-run-2'`);
    },
  },

];
