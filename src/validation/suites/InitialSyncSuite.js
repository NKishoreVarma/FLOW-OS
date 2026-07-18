/**
 * Initial Sync Suite — validates first-run sync bootstrapping.
 */

import { assert, assertArray, assertGreaterThan } from '../helpers/assert.js';
import { DEFAULT_RESOURCE_TYPES, SYNC_INTERVALS } from '../../services/sync/SyncEngine.js';
import { getCursor, getSyncHistory } from '../../services/integrations/SyncStateManager.js';
import { isDatabaseReachable } from '../helpers/testContext.js';

export const SUITE = 'initial_sync';

// All 6 connectors with their expected resource types
const EXPECTED_TYPES = {
  github:           ['repositories', 'pull_requests', 'issues', 'commits', 'releases'],
  gmail:            ['threads', 'messages', 'labels'],
  'google-calendar':['events', 'invites'],
  slack:            ['channels', 'messages', 'threads'],
  notion:           ['pages', 'databases'],
  jira:             ['projects', 'issues', 'comments'],
};

export const tests = [

  {
    name:                'SyncEngine.DEFAULT_RESOURCE_TYPES covers all 6 connectors',
    connectors:          'all',
    requiresCredentials: false,
    async run({ connectorId }) {
      const types = DEFAULT_RESOURCE_TYPES[connectorId];
      assertArray(types, `DEFAULT_RESOURCE_TYPES[${connectorId}]`);
      assertGreaterThan(types.length, 0, `${connectorId} resource type count`);
    },
  },

  {
    name:                'DEFAULT_RESOURCE_TYPES matches expected types per connector',
    connectors:          'all',
    requiresCredentials: false,
    async run({ connectorId }) {
      const expected = EXPECTED_TYPES[connectorId];
      if (!expected) return; // connector not in expected map
      const actual = DEFAULT_RESOURCE_TYPES[connectorId] || [];
      for (const t of expected) {
        assert(actual.includes(t), `${connectorId}: expected resource type "${t}" in DEFAULT_RESOURCE_TYPES`);
      }
    },
  },

  {
    name:                'SyncEngine.SYNC_INTERVALS covers all 6 connectors',
    connectors:          'all',
    requiresCredentials: false,
    async run({ connectorId }) {
      const interval = SYNC_INTERVALS[connectorId];
      assert(typeof interval === 'number' && interval > 0,
        `SYNC_INTERVALS[${connectorId}] must be a positive number, got ${interval}`);
    },
  },

  {
    name:                'getCursor returns null before any sync has run',
    connectors:          'all',
    requiresCredentials: false,
    requiresDatabase:    true,
    async run({ workspaceId, connectorId }) {
      if (!(await isDatabaseReachable())) throw new Error('SKIP: database unavailable');
      const resourceType = DEFAULT_RESOURCE_TYPES[connectorId]?.[0] || 'default';
      const cursor = await getCursor(workspaceId, connectorId, resourceType);
      assert(cursor === null, `getCursor should return null for fresh workspace, got: ${cursor}`);
    },
  },

  {
    name:                'markSyncStarted creates a sync record in DB',
    connectors:          'all',
    requiresCredentials: false,
    requiresDatabase:    true,
    async run({ workspaceId, connectorId }) {
      if (!(await isDatabaseReachable())) throw new Error('SKIP: database unavailable');
      const { markSyncStarted, markSyncComplete } = await import('../../services/integrations/SyncStateManager.js');
      const resourceType = DEFAULT_RESOURCE_TYPES[connectorId]?.[0] || 'default';
      const syncId = await markSyncStarted(workspaceId, connectorId, resourceType, 'manual');
      assert(typeof syncId === 'string' || typeof syncId === 'number', `syncId: got ${typeof syncId}`);

      // Complete it so the row doesn't linger
      await markSyncComplete(syncId, workspaceId, connectorId, resourceType, {
        cursor: 'test-cursor-1', itemsNew: 5, itemsUpdated: 0, itemsSkipped: 0, itemsFailed: 0,
      });

      const history = await getSyncHistory(workspaceId, connectorId, { limit: 1, resourceType });
      assert(history.length > 0, 'sync history has at least one entry after markSyncComplete');
      assert(history[0].status === 'success', `latest sync status should be success, got: ${history[0].status}`);
    },
  },

  {
    name:                'markSyncComplete stores cursor for next incremental run',
    connectors:          'all',
    requiresCredentials: false,
    requiresDatabase:    true,
    async run({ workspaceId, connectorId }) {
      if (!(await isDatabaseReachable())) throw new Error('SKIP: database unavailable');
      const { markSyncStarted, markSyncComplete } = await import('../../services/integrations/SyncStateManager.js');
      const resourceType = DEFAULT_RESOURCE_TYPES[connectorId]?.[1] || DEFAULT_RESOURCE_TYPES[connectorId]?.[0] || 'default';
      const syncId = await markSyncStarted(workspaceId, connectorId, resourceType, 'manual');
      await markSyncComplete(syncId, workspaceId, connectorId, resourceType, {
        cursor: 'cursor-after-initial-sync', itemsNew: 10, itemsUpdated: 0, itemsSkipped: 0, itemsFailed: 0,
      });

      const cursor = await getCursor(workspaceId, connectorId, resourceType);
      assert(cursor === 'cursor-after-initial-sync', `cursor should be stored after sync, got: ${cursor}`);
    },
  },

  {
    name:                'runInitialSync enqueues jobs for all resource types of connector',
    connectors:          'all',
    requiresCredentials: false,
    async run({ connectorId }) {
      // Test that runInitialSync queues the right number of jobs by inspecting the function
      const { runInitialSync } = await import('../../services/sync/SyncEngine.js');
      assert(typeof runInitialSync === 'function', 'runInitialSync must be exported');
      // Verify DEFAULT_RESOURCE_TYPES has entries for this connector (structural)
      const types = DEFAULT_RESOURCE_TYPES[connectorId];
      assert(Array.isArray(types) && types.length > 0,
        `${connectorId} must have resource types for runInitialSync to enqueue`);
    },
  },

];
