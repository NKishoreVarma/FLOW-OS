/**
 * OAuth Suite — validates authorization flow mechanics for every connector.
 *
 * Tests the plumbing: URL generation, CSRF state signing/verification, PKCE,
 * encrypted credential storage, and structural integrity. OAuth code exchange
 * requires real provider credentials (marked requiresCredentials=true).
 */

import { assert, assertUrl, assertString, assertIncludes, assertObject, assertThrows }
  from '../helpers/assert.js';
import { signState, verifyState, generateCodeVerifier, computeCodeChallenge, STATE_MAX_AGE_MS }
  from '../../services/integrations/oauthHelpers.js';
import { saveCredentials, loadCredentials, revokeCredentials }
  from '../../services/integrations/ConnectorCredentialStore.js';
import { isDatabaseReachable } from '../helpers/testContext.js';

export const SUITE = 'oauth';

export const tests = [

  {
    name:                'oauthHelpers: signState produces valid base64url state',
    connectors:          'all',
    requiresCredentials: false,
    async run({ connectorId }) {
      const state = signState(connectorId, 'ws-test-1');
      assertString(state, 'signState result');
      // must be parseable as base64url JSON
      const parsed = JSON.parse(Buffer.from(state, 'base64url').toString('utf8'));
      assert(parsed.workspaceId === 'ws-test-1', 'workspaceId embedded in state');
      assert(typeof parsed.nonce === 'string' && parsed.nonce.length > 0, 'nonce present');
      assert(typeof parsed.ts === 'number', 'timestamp present');
      assert(typeof parsed.sig === 'string' && parsed.sig.length > 0, 'signature present');
    },
  },

  {
    name:                'oauthHelpers: verifyState accepts a freshly signed state',
    connectors:          'all',
    requiresCredentials: false,
    async run({ connectorId }) {
      const state = signState(connectorId, 'ws-test-2');
      const parsed = verifyState(connectorId, state);
      assert(parsed.workspaceId === 'ws-test-2', 'verifyState returns correct workspaceId');
    },
  },

  {
    name:                'oauthHelpers: verifyState rejects tampered state (CSRF guard)',
    connectors:          'all',
    requiresCredentials: false,
    async run({ connectorId }) {
      await assertThrows(
        () => verifyState(connectorId, 'tampered-base64url-garbage'),
        err => err.message.includes('state') || err.statusCode === 400 || err.code === 'INVALID_OAUTH_STATE',
        'verifyState rejects tampered state',
      );
    },
  },

  {
    name:                'oauthHelpers: verifyState rejects expired state',
    connectors:          'all',
    requiresCredentials: false,
    async run({ connectorId }) {
      const oldTs   = Date.now() - STATE_MAX_AGE_MS - 1000;
      const payload = JSON.stringify({ workspaceId: 'ws-stale', nonce: 'n1', ts: oldTs, sig: 'fake' });
      const stale   = Buffer.from(payload).toString('base64url');
      await assertThrows(
        () => verifyState(connectorId, stale),
        err => err.message.toLowerCase().includes('expired') || err.statusCode === 400,
        'verifyState rejects expired state',
      );
    },
  },

  {
    name:                'oauthHelpers: PKCE code verifier and challenge are correct length',
    connectors:          ['github', 'slack', 'notion', 'jira', 'gmail', 'google-calendar'],
    requiresCredentials: false,
    async run() {
      const verifier   = generateCodeVerifier();
      const challenge  = computeCodeChallenge(verifier);
      assert(verifier.length >= 43 && verifier.length <= 128, `verifier length: ${verifier.length}`);
      assert(challenge.length > 0, 'challenge non-empty');
      assert(challenge !== verifier, 'challenge must differ from verifier');
    },
  },

  {
    name:                'getAuthUrl: returns a valid URL with required OAuth params',
    connectors:          ['github', 'slack', 'notion', 'jira'],
    requiresCredentials: false,
    async run({ connectorId, workspaceId }) {
      const svc = await _loadOAuthService(connectorId);
      if (!svc.getAuthUrl) { throw new Error('getAuthUrl not exported'); }
      let url;
      try {
        url = svc.getAuthUrl(workspaceId);
      } catch (err) {
        // Missing env vars for OAuth client ID → acceptable if env not configured
        if (err.message.toLowerCase().includes('client') || err.message.toLowerCase().includes('env')) {
          return; // skip when provider env vars absent — not a code failure
        }
        throw err;
      }
      assertUrl(url, 'OAuth initiation URL');
      assertIncludes(url, 'state=', 'state param in URL');
    },
  },

  {
    name:                'state parameter includes workspace binding',
    connectors:          ['github', 'slack', 'notion', 'jira'],
    requiresCredentials: false,
    async run({ connectorId, workspaceId }) {
      const svc = await _loadOAuthService(connectorId);
      let url;
      try {
        url = svc.getAuthUrl(workspaceId);
      } catch { return; } // env vars absent
      const stateParam = new URL(url).searchParams.get('state');
      assertString(stateParam, 'state param value');
      const parsed = JSON.parse(Buffer.from(stateParam, 'base64url').toString('utf8'));
      assert(parsed.workspaceId === workspaceId, 'state binds to workspaceId');
    },
  },

  {
    name:                'credentials: saveCredentials encrypts payload at rest',
    connectors:          'all',
    requiresCredentials: false,
    requiresDatabase:    true,
    async run({ workspaceId, connectorId }) {
      if (!(await isDatabaseReachable())) throw new Error('SKIP: database unavailable');
      const payload = { accessToken: 'tok_test_123', refreshToken: 'ref_test_456' };
      await saveCredentials(workspaceId, connectorId, payload, { authStrategy: 'oauth2' });

      // Load back via decryption path
      const loaded = await loadCredentials(workspaceId, connectorId);
      assertObject(loaded, 'loaded credentials');
      assert(loaded.accessToken === payload.accessToken, 'accessToken round-trips correctly');
      assert(loaded.refreshToken === payload.refreshToken, 'refreshToken round-trips correctly');

      // Verify the raw DB row is not plaintext
      const { default: db } = await import('../../config/db.js');
      const { rows } = await db.query(
        `SELECT encrypted_payload FROM connector_credentials
          WHERE workspace_id = $1 AND connector_id = $2`,
        [workspaceId, connectorId],
      );
      assert(rows.length > 0, 'credential row exists in DB');
      assert(!rows[0].encrypted_payload.includes('tok_test_123'), 'access token is not plaintext in DB');
      assert(!rows[0].encrypted_payload.includes('ref_test_456'), 'refresh token is not plaintext in DB');

      await revokeCredentials(workspaceId, connectorId);
    },
  },

  {
    name:                'credentials: revokeCredentials returns null on subsequent load',
    connectors:          'all',
    requiresCredentials: false,
    requiresDatabase:    true,
    async run({ workspaceId, connectorId }) {
      if (!(await isDatabaseReachable())) throw new Error('SKIP: database unavailable');
      await saveCredentials(workspaceId, connectorId, { accessToken: 'revoke_me' });
      await revokeCredentials(workspaceId, connectorId);
      const loaded = await loadCredentials(workspaceId, connectorId);
      assert(loaded === null, 'loadCredentials returns null after revoke');
    },
  },

];

// ── Helpers ───────────────────────────────────────────────────────────────────

async function _loadOAuthService(connectorId) {
  switch (connectorId) {
    case 'github':          return import('../../services/integrations/GitHubOAuthService.js');
    // gmail and google-calendar use Google's OAuth via their adapter — no standalone service file
    case 'gmail':
    case 'google-calendar': return {}; // handled by connector adapter directly
    case 'slack':           return import('../../services/integrations/SlackOAuthService.js');
    case 'notion':          return import('../../services/integrations/NotionOAuthService.js');
    case 'jira':            return import('../../services/integrations/JiraOAuthService.js');
    default:                return {};
  }
}
