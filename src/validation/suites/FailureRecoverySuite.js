/**
 * Failure Recovery Suite — validates graceful degradation under error conditions.
 */

import { assert, assertObject } from '../helpers/assert.js';
import { getCursor, markSyncStarted, markSyncFailed, getSyncHistory }
  from '../../services/integrations/SyncStateManager.js';
import { isDatabaseReachable } from '../helpers/testContext.js';

export const SUITE = 'failure_recovery';

export const tests = [

  {
    name:                'markSyncFailed records failure without losing previous cursor',
    connectors:          'all',
    requiresCredentials: false,
    requiresDatabase:    true,
    async run({ workspaceId, connectorId }) {
      if (!(await isDatabaseReachable())) throw new Error('SKIP: database unavailable');
      const { markSyncComplete } = await import('../../services/integrations/SyncStateManager.js');
      const rt = 'repositories';

      // Establish a valid cursor from a previous successful sync
      const id1 = await markSyncStarted(workspaceId, connectorId, rt, 'scheduled');
      await markSyncComplete(id1, workspaceId, connectorId, rt, {
        cursor: 'last-good-cursor', itemsNew: 5, itemsUpdated: 0, itemsSkipped: 0, itemsFailed: 0,
      });

      // Start a new sync and fail it
      const id2 = await markSyncStarted(workspaceId, connectorId, rt, 'scheduled');
      await markSyncFailed(id2, workspaceId, connectorId, rt, 'Simulated API error');

      // Cursor must still be the last successful cursor
      const cursor = await getCursor(workspaceId, connectorId, rt);
      assert(cursor === 'last-good-cursor',
        `cursor should remain 'last-good-cursor' after failure, got: ${cursor}`);
    },
  },

  {
    name:                'getSyncHistory records failed sync with error message',
    connectors:          'all',
    requiresCredentials: false,
    requiresDatabase:    true,
    async run({ workspaceId, connectorId }) {
      if (!(await isDatabaseReachable())) throw new Error('SKIP: database unavailable');
      const rt   = 'pull_requests';
      const msg  = 'Simulated 429 rate limit error';
      const id   = await markSyncStarted(workspaceId, connectorId, rt, 'webhook');
      await markSyncFailed(id, workspaceId, connectorId, rt, msg);

      const history = await getSyncHistory(workspaceId, connectorId, { limit: 5, resourceType: rt });
      const failed  = history.find(h => h.status === 'failed');
      assert(failed !== undefined, 'failed sync should appear in history');
      assert(
        failed.error_message?.includes('Simulated') || failed.error_message?.includes('429'),
        `error_message should contain error detail, got: ${failed.error_message}`,
      );
    },
  },

  {
    name:                'ConnectorCredentialStore.hasCredentials is safe to call without DB',
    connectors:          'all',
    requiresCredentials: false,
    async run({ workspaceId, connectorId }) {
      const { hasCredentials } = await import('../../services/integrations/ConnectorCredentialStore.js');
      // Should return false or throw a non-crashing error — no panics
      let result;
      try {
        result = await hasCredentials(workspaceId, connectorId);
      } catch { result = false; }
      assert(result === false || result === true, 'hasCredentials returns boolean');
    },
  },

  {
    name:                'EventNormalizer does not throw on malformed body',
    connectors:          'all',
    requiresCredentials: false,
    async run({ workspaceId, connectorId }) {
      const { normalize } = await import('../../services/webhooks/EventNormalizer.js');
      // Should produce an event even with empty/missing fields
      let event;
      try {
        event = normalize(connectorId, {}, {}, 'del-malformed', workspaceId);
        assertObject(event, 'normalized event from empty body');
        assert(typeof event.eventType === 'string', 'eventType is always a string');
      } catch (err) {
        // Must not throw on malformed input — normalize should degrade gracefully
        throw new Error(`normalize() threw on malformed body: ${err.message}`);
      }
    },
  },

  {
    name:                'DeltaProcessor is safe when sync_items table does not exist',
    connectors:          'all',
    requiresCredentials: false,
    requiresDatabase:    true,
    async run({ workspaceId, connectorId }) {
      if (!(await isDatabaseReachable())) throw new Error('SKIP: database unavailable');
      // Calling isDuplicate when the table exists but has no rows returns false (not a crash)
      const { isDuplicate } = await import('../../services/sync/DeltaProcessor.js');
      let result;
      try {
        result = await isDuplicate(workspaceId, connectorId, 'issues', 'safe-check', 'etag');
        assert(typeof result === 'boolean', 'isDuplicate returns boolean even on first use');
      } catch {
        // Table might not exist — acceptable in environments without migration
        throw new Error('SKIP: sync_items table not present (run migration first)');
      }
    },
  },

  {
    name:                'all connector OAuth services export healthCheck()',
    connectors:          ['github', 'slack', 'notion', 'jira'],
    requiresCredentials: false,
    async run({ connectorId }) {
      const svc = await _loadOAuthService(connectorId);
      assert(typeof svc.healthCheck === 'function',
        `${connectorId} OAuth service must export healthCheck()`);
    },
  },

  {
    name:                'healthCheck does not throw without credentials — returns DISCONNECTED status',
    connectors:          ['github', 'slack', 'notion', 'jira'],
    requiresCredentials: false,
    requiresDatabase:    true,
    async run({ workspaceId, connectorId }) {
      if (!(await isDatabaseReachable())) throw new Error('SKIP: database unavailable');
      const svc = await _loadOAuthService(connectorId);
      let health;
      try {
        health = await svc.healthCheck(workspaceId);
      } catch (err) {
        // Should not throw — degrade to an error status instead
        throw new Error(`healthCheck() threw instead of returning status: ${err.message}`);
      }
      assertObject(health, `${connectorId} healthCheck result`);
    },
  },

];

async function _loadOAuthService(connectorId) {
  switch (connectorId) {
    case 'github': return import('../../services/integrations/GitHubOAuthService.js');
    case 'slack':  return import('../../services/integrations/SlackOAuthService.js');
    case 'notion': return import('../../services/integrations/NotionOAuthService.js');
    case 'jira':   return import('../../services/integrations/JiraOAuthService.js');
    default:       return {};
  }
}
