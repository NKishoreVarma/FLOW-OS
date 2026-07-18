/**
 * Refresh Suite — validates OAuth token refresh lifecycle.
 */

import { assert, assertObject, assertString } from '../helpers/assert.js';
import {
  saveCredentials, loadCredentials, refreshCredentials,
  isTokenExpired, getCredentialMeta, updateHealthStatus,
} from '../../services/integrations/ConnectorCredentialStore.js';
import { isDatabaseReachable } from '../helpers/testContext.js';

export const SUITE = 'refresh';

export const tests = [

  {
    name:                'saveCredentials with expiresAt stores expiry in DB',
    connectors:          'all',
    requiresCredentials: false,
    requiresDatabase:    true,
    async run({ workspaceId, connectorId }) {
      if (!(await isDatabaseReachable())) throw new Error('SKIP: database unavailable');
      const futureExpiry = new Date(Date.now() + 3600_000);
      await saveCredentials(workspaceId, connectorId, { accessToken: 'not-expired' }, {
        authStrategy: 'oauth2',
        expiresAt:    futureExpiry,
      });
      const meta = await getCredentialMeta(workspaceId, connectorId);
      assertObject(meta, 'credential meta');
      assert(meta.expires_at !== null, 'expires_at is stored');
    },
  },

  {
    name:                'isTokenExpired returns false for non-expired token',
    connectors:          'all',
    requiresCredentials: false,
    requiresDatabase:    true,
    async run({ workspaceId, connectorId }) {
      if (!(await isDatabaseReachable())) throw new Error('SKIP: database unavailable');
      const futureExpiry = new Date(Date.now() + 3600_000);
      await saveCredentials(workspaceId, connectorId, { accessToken: 'valid' }, {
        authStrategy: 'oauth2',
        expiresAt:    futureExpiry,
      });
      const expired = await isTokenExpired(workspaceId, connectorId);
      assert(expired === false, 'non-expired token: isTokenExpired should return false');
    },
  },

  {
    name:                'isTokenExpired returns true for already-expired token',
    connectors:          'all',
    requiresCredentials: false,
    requiresDatabase:    true,
    async run({ workspaceId, connectorId }) {
      if (!(await isDatabaseReachable())) throw new Error('SKIP: database unavailable');
      const pastExpiry = new Date(Date.now() - 60_000); // expired 1 minute ago
      await saveCredentials(workspaceId, connectorId, { accessToken: 'expired' }, {
        authStrategy: 'oauth2',
        expiresAt:    pastExpiry,
      });
      const expired = await isTokenExpired(workspaceId, connectorId);
      assert(expired === true, 'expired token: isTokenExpired should return true');
    },
  },

  {
    name:                'refreshCredentials updates accessToken without losing refreshToken',
    connectors:          'all',
    requiresCredentials: false,
    requiresDatabase:    true,
    async run({ workspaceId, connectorId }) {
      if (!(await isDatabaseReachable())) throw new Error('SKIP: database unavailable');
      await saveCredentials(workspaceId, connectorId, {
        accessToken:  'old-access',
        refreshToken: 'keep-me',
      }, { authStrategy: 'oauth2' });

      await refreshCredentials(workspaceId, connectorId, {
        accessToken:  'new-access',
        refreshToken: 'keep-me',
        expiresAt:    new Date(Date.now() + 3600_000),
      });

      const loaded = await loadCredentials(workspaceId, connectorId);
      assertObject(loaded, 'loaded after refresh');
      assert(loaded.accessToken === 'new-access', 'accessToken is updated after refresh');
      assert(loaded.refreshToken === 'keep-me', 'refreshToken is preserved after refresh');
    },
  },

  {
    name:                'updateHealthStatus stores status in connector_credentials',
    connectors:          'all',
    requiresCredentials: false,
    requiresDatabase:    true,
    async run({ workspaceId, connectorId }) {
      if (!(await isDatabaseReachable())) throw new Error('SKIP: database unavailable');
      await saveCredentials(workspaceId, connectorId, { accessToken: 'tok' });
      await updateHealthStatus(workspaceId, connectorId, 'healthy');
      const meta = await getCredentialMeta(workspaceId, connectorId);
      assert(meta?.health_status === 'healthy', `expected health_status=healthy, got ${meta?.health_status}`);

      await updateHealthStatus(workspaceId, connectorId, 'expired', 'Token expired');
      const meta2 = await getCredentialMeta(workspaceId, connectorId);
      assert(meta2?.health_status === 'expired', `expected health_status=expired, got ${meta2?.health_status}`);
    },
  },

  {
    name:                'OAuth services export getAccessToken for downstream connector use',
    connectors:          ['github', 'slack', 'notion', 'jira'],
    requiresCredentials: false,
    async run({ connectorId }) {
      const svc = await _loadOAuthService(connectorId);
      assert(typeof svc.getAccessToken === 'function' || typeof svc.getBotToken === 'function',
        `${connectorId} OAuth service must export getAccessToken or getBotToken`);
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
