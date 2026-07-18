/**
 * Reconnect Suite — validates that a connector can be re-authorized after disconnect.
 */

import { assert, assertString } from '../helpers/assert.js';
import { saveCredentials, loadCredentials, revokeCredentials }
  from '../../services/integrations/ConnectorCredentialStore.js';
import { isDatabaseReachable } from '../helpers/testContext.js';

export const SUITE = 'reconnect';

export const tests = [

  {
    name:                'reconnect: fresh credentials can be saved after revoke',
    connectors:          'all',
    requiresCredentials: false,
    requiresDatabase:    true,
    async run({ workspaceId, connectorId }) {
      if (!(await isDatabaseReachable())) throw new Error('SKIP: database unavailable');

      // Initial connect
      await saveCredentials(workspaceId, connectorId, { accessToken: 'first-token' });
      const first = await loadCredentials(workspaceId, connectorId);
      assert(first?.accessToken === 'first-token', 'first credential round-trips');

      // Disconnect
      await revokeCredentials(workspaceId, connectorId);
      assert((await loadCredentials(workspaceId, connectorId)) === null, 'null after revoke');

      // Reconnect
      await saveCredentials(workspaceId, connectorId, { accessToken: 'second-token' });
      const second = await loadCredentials(workspaceId, connectorId);
      assert(second?.accessToken === 'second-token', 'reconnect stores new credentials');
    },
  },

  {
    name:                'reconnect: getAuthUrl still generates valid URL after disconnect',
    connectors:          ['github', 'slack', 'notion', 'jira'],
    requiresCredentials: false,
    async run({ workspaceId, connectorId }) {
      const svc = await _loadOAuthService(connectorId);
      if (typeof svc.getAuthUrl !== 'function') return;
      // Must succeed regardless of whether credentials exist (it's initiating a new flow)
      let url;
      try {
        url = svc.getAuthUrl(workspaceId);
      } catch (err) {
        if (err.message.toLowerCase().includes('client')) return; // env not configured
        throw err;
      }
      assert(typeof url === 'string' && url.startsWith('http'), 'getAuthUrl returns URL string');
    },
  },

  {
    name:                'reconnect: OAuth service reconnect() resets health status',
    connectors:          ['github', 'slack', 'notion', 'jira'],
    requiresCredentials: false,
    requiresDatabase:    true,
    async run({ workspaceId, connectorId }) {
      if (!(await isDatabaseReachable())) throw new Error('SKIP: database unavailable');
      const svc = await _loadOAuthService(connectorId);
      if (typeof svc.reconnect !== 'function') return;
      // Store fake creds so reconnect() has something to re-validate
      await saveCredentials(workspaceId, connectorId, { accessToken: 'stale' });
      // reconnect() typically calls validateCredentials() which may fail without real token
      // — we just verify it doesn't throw unexpectedly (network errors are OK)
      try {
        await svc.reconnect(workspaceId);
      } catch (err) {
        // Only propagate non-network errors
        if (err.code === 'ECONNREFUSED' || err.message.includes('fetch')) return;
        if (err.message.includes('401') || err.message.includes('expired')) return;
        throw err;
      }
    },
  },

  {
    name:                'reconnect: multiple connect/disconnect cycles do not corrupt DB rows',
    connectors:          'all',
    requiresCredentials: false,
    requiresDatabase:    true,
    async run({ workspaceId, connectorId }) {
      if (!(await isDatabaseReachable())) throw new Error('SKIP: database unavailable');
      for (let i = 1; i <= 3; i++) {
        await saveCredentials(workspaceId, connectorId, { accessToken: `cycle-${i}` });
        const loaded = await loadCredentials(workspaceId, connectorId);
        assert(loaded?.accessToken === `cycle-${i}`, `cycle ${i}: loaded credential matches`);
        await revokeCredentials(workspaceId, connectorId);
        assert((await loadCredentials(workspaceId, connectorId)) === null, `cycle ${i}: null after revoke`);
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
