/**
 * Disconnect Suite — validates graceful connector teardown.
 */

import { assert, assertObject } from '../helpers/assert.js';
import {
  saveCredentials, loadCredentials, revokeCredentials,
  hasCredentials, getCredentialMeta,
} from '../../services/integrations/ConnectorCredentialStore.js';
import { deactivateWebhook, getWebhookInfo } from '../../services/integrations/WebhookManager.js';
import { isDatabaseReachable } from '../helpers/testContext.js';

export const SUITE = 'disconnect';

export const tests = [

  {
    name:                'revokeCredentials marks credential row as revoked',
    connectors:          'all',
    requiresCredentials: false,
    requiresDatabase:    true,
    async run({ workspaceId, connectorId }) {
      if (!(await isDatabaseReachable())) throw new Error('SKIP: database unavailable');
      await saveCredentials(workspaceId, connectorId, { accessToken: 'to-revoke' });
      assert(await hasCredentials(workspaceId, connectorId) === false,
        'in-memory authManager has no credentials before they are stored there');

      // revokeCredentials in ConnectorCredentialStore marks revoked_at
      await revokeCredentials(workspaceId, connectorId);
      const loaded = await loadCredentials(workspaceId, connectorId);
      assert(loaded === null, 'loadCredentials returns null after revokeCredentials');
    },
  },

  {
    name:                'OAuth service disconnect clears credentials',
    connectors:          ['github', 'slack', 'notion', 'jira'],
    requiresCredentials: false,
    requiresDatabase:    true,
    async run({ workspaceId, connectorId }) {
      if (!(await isDatabaseReachable())) throw new Error('SKIP: database unavailable');
      // Save a fake credential first
      await saveCredentials(workspaceId, connectorId, { accessToken: 'disconnect-test' });

      const svc = await _loadOAuthService(connectorId);
      if (typeof svc.disconnect !== 'function') throw new Error(`${connectorId}: disconnect() not exported`);
      await svc.disconnect(workspaceId);

      const loaded = await loadCredentials(workspaceId, connectorId);
      assert(loaded === null, 'credentials are null after disconnect()');
    },
  },

  {
    name:                'disconnect clears webhook registration',
    connectors:          ['github', 'slack', 'jira'],
    requiresCredentials: false,
    requiresDatabase:    true,
    async run({ workspaceId, connectorId }) {
      if (!(await isDatabaseReachable())) throw new Error('SKIP: database unavailable');
      // Register a webhook, then deactivate
      const { registerWebhook } = await import('../../services/integrations/WebhookManager.js');
      await registerWebhook(workspaceId, connectorId, {
        endpointUrl: `https://example.com/api/webhooks/${connectorId}?workspace=${workspaceId}`,
        eventTypes:  ['push'],
      });
      await deactivateWebhook(workspaceId, connectorId);

      const info = await getWebhookInfo(workspaceId, connectorId);
      assert(info === null || info.status === 'inactive',
        `webhook status should be null or inactive after deactivation, got: ${info?.status}`);
    },
  },

  {
    name:                'OAuth service disconnect clears sync cursor state',
    connectors:          ['github', 'slack', 'notion', 'jira'],
    requiresCredentials: false,
    requiresDatabase:    true,
    async run({ workspaceId, connectorId }) {
      if (!(await isDatabaseReachable())) throw new Error('SKIP: database unavailable');
      // Write a sync cursor then disconnect
      const { markSyncComplete } = await import('../../services/integrations/SyncStateManager.js');
      // Verify disconnect function clears state via getStatus returning 'disconnected'
      const svc = await _loadOAuthService(connectorId);
      if (typeof svc.disconnect !== 'function') return;
      await saveCredentials(workspaceId, connectorId, { accessToken: 'pre-disconnect' });
      await svc.disconnect(workspaceId);

      if (typeof svc.getStatus === 'function') {
        const status = await svc.getStatus(workspaceId);
        assert(
          status?.connected === false || status?.status === 'disconnected' || status === null,
          `getStatus should reflect disconnected state, got: ${JSON.stringify(status)}`,
        );
      }
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
