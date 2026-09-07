/**
 * GitHubOAuthService — OAuth 2.0 for GitHub OAuth Apps.
 *
 * Auth modes (chosen by available env vars):
 *   1. OAuth App   — GITHUB_CLIENT_ID + GITHUB_CLIENT_SECRET
 *   2. PAT         — store via storePAT() or GITHUB_TOKEN env var
 *
 * OAuth security:
 *   CSRF:  HMAC-signed state (prefix: 'github', 10-minute window)
 *   PKCE:  S256 code_challenge (GitHub has supported PKCE since 2022)
 *
 * Scopes: repo, read:user, read:org, notifications
 *
 * Reconnect flow:
 *   POST /api/integrations-hub/github/reconnect
 *   → revokeCredentials() then getAuthUrl() → user re-authenticates → handleCallback()
 *
 * Token lifecycle:
 *   GitHub OAuth App tokens do not expire unless the user revokes access.
 *   Revocation is detected by healthCheck() → 401 on /user endpoint.
 *   validateCredentials() persists health status and sets needsReconnect flag.
 */

import {
  signState,
  verifyState,
  generateCodeVerifier,
  computeCodeChallenge,
} from './oauthHelpers.js';
import {
  saveCredentials,
  loadCredentials,
  getCredentialMeta,
  revokeCredentials,
  updateHealthStatus,
} from './ConnectorCredentialStore.js';
import { AppError } from '../../core/errors/index.js';

const CONNECTOR_ID = 'github';
const PREFIX       = 'github';
const GITHUB_API   = process.env.GITHUB_API_URL || 'https://api.github.com';

const OAUTH_SCOPES = 'repo read:user read:org notifications';

function _cfg() {
  const clientId     = process.env.GITHUB_CLIENT_ID;
  const clientSecret = process.env.GITHUB_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  return {
    clientId,
    clientSecret,
    redirectUri: process.env.GITHUB_REDIRECT_URI
      || 'http://localhost:5001/api/integrations-hub/github/callback',
  };
}

// ── GitHub API fetch ──────────────────────────────────────────────────────────

async function _ghFetch(path, token) {
  const url = `${GITHUB_API}${path}`;
  const tokenPreview = token ? `${token.slice(0, 8)}…` : '(none)';
  console.log(`[GitHub PAT] → GET ${url}  token=${tokenPreview}`);

  const res = await fetch(url, {
    headers: {
      Authorization:          `Bearer ${token}`,
      Accept:                 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent':           'FLOW-OS/10.1',
    },
  });

  console.log(`[GitHub PAT] ← HTTP ${res.status} ${res.statusText}  path=${path}`);

  if (res.status === 401) {
    const body = await res.json().catch(() => ({}));
    console.error(`[GitHub PAT] 401 body:`, JSON.stringify(body));
    throw new AppError('GitHub token is invalid or has been revoked. Ensure the token has the "repo" and "read:user" scopes and has not expired.', 401, 'TOKEN_REVOKED');
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    console.error(`[GitHub PAT] ${res.status} body:`, JSON.stringify(body));
    throw new AppError(body.message || `GitHub API returned ${res.status}`, res.status >= 500 ? 502 : res.status, 'GITHUB_API_ERROR');
  }
  return res.json();
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Generate a GitHub OAuth consent URL with PKCE (S256).
 * Throws 503 if OAuth App credentials are not configured.
 *
 * @returns {{ authUrl: string, state: string }}
 */
export function getAuthUrl(workspaceId) {
  const cfg = _cfg();
  if (!cfg) {
    throw new AppError(
      'GitHub OAuth App is not configured. Set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET, or store a PAT via POST /api/integrations-hub/github/pat.',
      503,
      'GITHUB_OAUTH_NOT_CONFIGURED',
    );
  }

  const codeVerifier    = generateCodeVerifier();
  const codeChallenge   = computeCodeChallenge(codeVerifier);
  const state           = signState(PREFIX, workspaceId, { codeVerifier });

  const url = new URL('https://github.com/login/oauth/authorize');
  url.searchParams.set('client_id',             cfg.clientId);
  url.searchParams.set('redirect_uri',          cfg.redirectUri);
  url.searchParams.set('scope',                 OAUTH_SCOPES);
  url.searchParams.set('state',                 state);
  url.searchParams.set('code_challenge',        codeChallenge);
  url.searchParams.set('code_challenge_method', 'S256');

  return { authUrl: url.toString(), state };
}

/**
 * Handle OAuth callback: verify CSRF state, exchange code+PKCE verifier for token,
 * fetch GitHub user, persist encrypted credentials.
 *
 * @returns {{ workspaceId: string, login: string, email: string|null }}
 */
export async function handleCallback(code, stateStr) {
  const { workspaceId, codeVerifier } = verifyState(PREFIX, stateStr);
  const cfg = _cfg();
  if (!cfg) throw new AppError('GitHub OAuth App not configured', 503, 'GITHUB_OAUTH_NOT_CONFIGURED');

  const body = {
    client_id:     cfg.clientId,
    client_secret: cfg.clientSecret,
    code,
    redirect_uri:  cfg.redirectUri,
  };
  // Include PKCE verifier if present (backwards compat with non-PKCE states)
  if (codeVerifier) body.code_verifier = codeVerifier;

  const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body:    JSON.stringify(body),
  });
  const tokenData = await tokenRes.json();

  if (tokenData.error) {
    throw new AppError(
      `GitHub OAuth error: ${tokenData.error_description || tokenData.error}`,
      400,
      'OAUTH_EXCHANGE_FAILED',
    );
  }

  const accessToken = tokenData.access_token;
  const user        = await _ghFetch('/user', accessToken);

  await saveCredentials(workspaceId, CONNECTOR_ID, {
    accessToken,
    tokenType: tokenData.token_type,
    scope:     tokenData.scope,
  }, {
    authStrategy: 'oauth2',
    scopes:       tokenData.scope,
    accountLabel: user.login,
    accountEmail: user.email,
  });

  await updateHealthStatus(workspaceId, CONNECTOR_ID, 'healthy');

  return { workspaceId, login: user.login, email: user.email };
}

/**
 * Store and validate a Personal Access Token.
 * Validates against /user before saving.
 *
 * @returns {{ login: string, email: string|null, name: string|null }}
 */
export async function storePAT(workspaceId, token) {
  console.log(`[GitHub PAT] storePAT called  workspaceId=${workspaceId}  tokenLen=${token?.length ?? 0}`);

  let user;
  try {
    user = await _ghFetch('/user', token);
    console.log(`[GitHub PAT] /user OK  login=${user.login}  email=${user.email}`);
  } catch (err) {
    console.error(`[GitHub PAT] /user validation failed:`, err.message, `code=${err.code}`);
    throw err;
  }

  try {
    await saveCredentials(workspaceId, CONNECTOR_ID, { accessToken: token }, {
      authStrategy: 'pat',
      accountLabel: user.login,
      accountEmail: user.email,
    });
    console.log(`[GitHub PAT] credentials saved for workspaceId=${workspaceId}`);
  } catch (err) {
    console.error(`[GitHub PAT] saveCredentials failed:`, err.message);
    throw err;
  }

  await updateHealthStatus(workspaceId, CONNECTOR_ID, 'healthy');
  console.log(`[GitHub PAT] storePAT complete  login=${user.login}`);
  return { login: user.login, email: user.email, name: user.name };
}

/**
 * Return the access token for a workspace.
 * DB-stored credentials take precedence; GITHUB_TOKEN env var is the workspace fallback.
 */
export async function getAccessToken(workspaceId) {
  // DB-stored, workspace-scoped credentials always take precedence.
  const cred = await loadCredentials(workspaceId, CONNECTOR_ID);
  if (cred?.accessToken) return cred.accessToken;
  // Phase 9 — tenant hardening: the global GITHUB_TOKEN env fallback must NOT silently
  // execute for an arbitrary workspace. It is honored ONLY for the workspace explicitly
  // named in GITHUB_TOKEN_WORKSPACE — any other workspace gets no token (honest
  // CREDENTIAL_NOT_FOUND upstream), never another tenant's/global credential.
  const allowedWs = process.env.GITHUB_TOKEN_WORKSPACE;
  if (process.env.GITHUB_TOKEN && allowedWs && String(workspaceId) === String(allowedWs)) {
    return process.env.GITHUB_TOKEN;
  }
  return null;
}

/**
 * Connection status and health metadata.
 */
export async function getStatus(workspaceId) {
  const meta = await getCredentialMeta(workspaceId, CONNECTOR_ID);
  if (!meta) {
    if (process.env.GITHUB_TOKEN) {
      return {
        connected:    true,
        authStrategy: 'env',
        accountLabel: 'GITHUB_TOKEN (env)',
        healthStatus: 'unknown',
      };
    }
    return { connected: false };
  }
  return { connected: meta.connected, ...meta };
}

/**
 * Revoke the OAuth token on GitHub and soft-delete local credentials.
 * Falls back to local revocation if the GitHub API call fails.
 */
export async function disconnect(workspaceId) {
  const cred = await loadCredentials(workspaceId, CONNECTOR_ID);
  const cfg  = _cfg();

  if (cred?.accessToken && cfg) {
    try {
      // GitHub API: delete application token (invalidates it immediately)
      await fetch(`https://api.github.com/applications/${cfg.clientId}/token`, {
        method:  'DELETE',
        headers: {
          Authorization:  `Basic ${Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString('base64')}`,
          Accept:         'application/vnd.github+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ access_token: cred.accessToken }),
      });
    } catch { /* non-fatal — local revocation still happens below */ }
  }

  await revokeCredentials(workspaceId, CONNECTOR_ID);
  return { disconnected: true };
}

/**
 * Clear credentials and return a fresh OAuth consent URL.
 * The caller should redirect the user to the returned authUrl.
 */
export async function reconnect(workspaceId) {
  await revokeCredentials(workspaceId, CONNECTOR_ID);
  return getAuthUrl(workspaceId);
}

/**
 * Probe the upstream GitHub API and persist the health result.
 * Sets needsReconnect=true if the token is revoked or invalid.
 *
 * @returns {{ valid: boolean, healthStatus: string, reason?: string, login?: string }}
 */
export async function validateCredentials(workspaceId) {
  const token = await getAccessToken(workspaceId);
  if (!token) {
    return { valid: false, healthStatus: 'not_connected', action: 'connect' };
  }

  try {
    const data = await _ghFetch('/rate_limit', token);
    await updateHealthStatus(workspaceId, CONNECTOR_ID, 'healthy');
    return {
      valid:        true,
      healthStatus: 'healthy',
      remaining:    data.rate?.remaining,
      resetAt:      data.rate?.reset ? new Date(data.rate.reset * 1000).toISOString() : null,
    };
  } catch (err) {
    const isRevoked = err.code === 'TOKEN_REVOKED' || err.statusCode === 401;
    const status    = isRevoked ? 'revoked' : 'degraded';
    await updateHealthStatus(workspaceId, CONNECTOR_ID, status, err.message).catch(() => {});
    return {
      valid:        false,
      healthStatus: status,
      reason:       err.message,
      action:       isRevoked ? 'reconnect' : 'retry',
    };
  }
}

/**
 * Health check (non-persisting, for status endpoint).
 */
export async function healthCheck(workspaceId) {
  const token = await getAccessToken(workspaceId);
  if (!token) return { healthy: false, reason: 'No credentials' };
  try {
    const data = await _ghFetch('/rate_limit', token);
    return {
      healthy:   true,
      remaining: data.rate?.remaining,
      resetAt:   data.rate?.reset ? new Date(data.rate.reset * 1000).toISOString() : null,
    };
  } catch (err) {
    return { healthy: false, reason: err.message };
  }
}
