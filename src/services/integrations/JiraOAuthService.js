/**
 * JiraOAuthService — Jira Cloud OAuth 2.0 (3LO — Three-Legged OAuth).
 *
 * Auth modes:
 *   1. OAuth 2.0 3LO — JIRA_CLIENT_ID + JIRA_CLIENT_SECRET (user-delegated)
 *   2. API Token     — JIRA_EMAIL + JIRA_API_TOKEN + JIRA_DOMAIN (simpler setup)
 *
 * OAuth security:
 *   CSRF:  HMAC-signed state (prefix: 'jira', 10-minute window)
 *   PKCE:  S256 code_challenge (Atlassian OAuth 2.0 3LO supports PKCE since 2023)
 *
 * Scopes: read:jira-work, write:jira-work, read:jira-user, offline_access
 *
 * Refresh token handling:
 *   Access tokens expire in ~1 hour; refreshed transparently in getAccessToken().
 *   Refresh tokens are valid for 90 days (offline_access scope).
 *   Expired refresh tokens trigger needsReconnect=true.
 *
 * Cloud ID discovery:
 *   After token exchange, /oauth/token/accessible-resources returns the
 *   Atlassian cloud ID required for all Jira API calls.
 *   Multiple sites: uses the first accessible instance (cloudId = resources[0].id).
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
  refreshCredentials,
  getCredentialMeta,
  revokeCredentials,
  updateHealthStatus,
} from './ConnectorCredentialStore.js';
import { AppError } from '../../core/errors/index.js';

const CONNECTOR_ID   = 'jira';
const PREFIX         = 'jira';
const ATLASSIAN_AUTH = 'https://auth.atlassian.com';
const ATLASSIAN_API  = 'https://api.atlassian.com';

const SCOPES = 'read:jira-work write:jira-work read:jira-user offline_access';

function _cfg() {
  const clientId     = process.env.JIRA_CLIENT_ID;
  const clientSecret = process.env.JIRA_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  return {
    clientId,
    clientSecret,
    redirectUri: process.env.JIRA_REDIRECT_URI
      || 'http://localhost:5001/api/integrations-hub/jira/callback',
  };
}

// ── Token refresh ─────────────────────────────────────────────────────────────

async function _refreshAccessToken(workspaceId) {
  const cfg  = _cfg();
  const cred = await loadCredentials(workspaceId, CONNECTOR_ID);
  if (!cfg || !cred?.refreshToken) return null;

  const res = await fetch(`${ATLASSIAN_AUTH}/oauth/token`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({
      grant_type:    'refresh_token',
      client_id:     cfg.clientId,
      client_secret: cfg.clientSecret,
      refresh_token: cred.refreshToken,
    }),
  });

  const data = await res.json();

  if (data.error) {
    // 'invalid_grant' = refresh token expired or revoked
    if (data.error === 'invalid_grant') {
      await updateHealthStatus(workspaceId, CONNECTOR_ID, 'expired', 'Refresh token expired — user must re-authenticate');
      throw new AppError('Jira refresh token has expired. Please reconnect.', 401, 'REFRESH_TOKEN_EXPIRED');
    }
    throw new AppError(`Jira token refresh failed: ${data.error}`, 401, 'TOKEN_REFRESH_FAILED');
  }

  const updated = {
    ...cred,
    accessToken:  data.access_token,
    refreshToken: data.refresh_token || cred.refreshToken, // Atlassian may rotate
    expiresAt:    new Date(Date.now() + (data.expires_in || 3600) * 1000).toISOString(),
  };

  await refreshCredentials(workspaceId, CONNECTOR_ID, updated);
  return updated.accessToken;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Generate Jira OAuth 2.0 (3LO) consent URL with PKCE (S256).
 */
export function getAuthUrl(workspaceId) {
  const cfg = _cfg();
  if (!cfg) {
    throw new AppError(
      'Jira OAuth is not configured. Set JIRA_CLIENT_ID and JIRA_CLIENT_SECRET, or use API token mode via POST /api/integrations-hub/jira/token.',
      503,
      'JIRA_NOT_CONFIGURED',
    );
  }

  const codeVerifier  = generateCodeVerifier();
  const codeChallenge = computeCodeChallenge(codeVerifier);
  const state         = signState(PREFIX, workspaceId, { codeVerifier });

  const url = new URL(`${ATLASSIAN_AUTH}/authorize`);
  url.searchParams.set('audience',              'api.atlassian.com');
  url.searchParams.set('client_id',             cfg.clientId);
  url.searchParams.set('scope',                 SCOPES);
  url.searchParams.set('redirect_uri',          cfg.redirectUri);
  url.searchParams.set('state',                 state);
  url.searchParams.set('response_type',         'code');
  url.searchParams.set('prompt',                'consent');
  url.searchParams.set('code_challenge',        codeChallenge);
  url.searchParams.set('code_challenge_method', 'S256');

  return { authUrl: url.toString(), state };
}

/**
 * Handle OAuth callback: verify CSRF, exchange code + PKCE verifier, discover cloud ID.
 */
export async function handleCallback(code, stateStr) {
  const { workspaceId, codeVerifier } = verifyState(PREFIX, stateStr);
  const cfg = _cfg();
  if (!cfg) throw new AppError('Jira OAuth not configured', 503, 'JIRA_NOT_CONFIGURED');

  const tokenBody = {
    grant_type:    'authorization_code',
    client_id:     cfg.clientId,
    client_secret: cfg.clientSecret,
    code,
    redirect_uri:  cfg.redirectUri,
  };
  if (codeVerifier) tokenBody.code_verifier = codeVerifier;

  const tokenRes = await fetch(`${ATLASSIAN_AUTH}/oauth/token`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(tokenBody),
  });

  const tokenData = await tokenRes.json();
  if (tokenData.error) {
    throw new AppError(`Jira OAuth error: ${tokenData.error}`, 400, 'OAUTH_EXCHANGE_FAILED');
  }

  // Discover Atlassian cloud ID — required for all REST API calls
  const resRes    = await fetch(`${ATLASSIAN_API}/oauth/token/accessible-resources`, {
    headers: { Authorization: `Bearer ${tokenData.access_token}`, Accept: 'application/json' },
  });
  const resources = await resRes.json();

  if (!Array.isArray(resources) || resources.length === 0) {
    throw new AppError(
      'No accessible Jira Cloud sites found for this account. Make sure the authorizing user has access to at least one Jira site.',
      400,
      'NO_JIRA_SITES',
    );
  }

  const cloud    = resources[0];
  const expiresAt = new Date(Date.now() + (tokenData.expires_in || 3600) * 1000);

  await saveCredentials(workspaceId, CONNECTOR_ID, {
    accessToken:  tokenData.access_token,
    refreshToken: tokenData.refresh_token,
    expiresAt:    expiresAt.toISOString(),
    cloudId:      cloud.id,
    cloudName:    cloud.name,
    cloudUrl:     cloud.url,
    availableSites: resources.map(r => ({ id: r.id, name: r.name, url: r.url })),
  }, {
    authStrategy: 'oauth2',
    scopes:       tokenData.scope,
    accountLabel: cloud.name || 'Jira Cloud',
    expiresAt,
  });

  await updateHealthStatus(workspaceId, CONNECTOR_ID, 'healthy');
  return { workspaceId, cloudName: cloud.name, cloudId: cloud.id };
}

/**
 * Store API token credentials (email + API token + domain).
 * Validates against /myself before saving.
 */
export async function storeAPIToken(workspaceId, { email, apiToken, domain }) {
  if (!email || !apiToken || !domain) {
    throw new AppError('email, apiToken, and domain are all required', 400, 'VALIDATION_ERROR');
  }

  const cleanDomain = domain.replace(/^https?:\/\//, '').replace(/\/$/, '');
  const baseUrl     = `https://${cleanDomain}/rest/api/3`;
  const authHeader  = `Basic ${Buffer.from(`${email}:${apiToken}`).toString('base64')}`;

  const res = await fetch(`${baseUrl}/myself`, {
    headers: { Authorization: authHeader, Accept: 'application/json' },
  });

  if (res.status === 401) throw new AppError('Invalid Jira credentials — check email and API token', 401, 'INVALID_CREDENTIALS');
  if (!res.ok)            throw new AppError(`Jira API returned ${res.status}`, res.status, 'JIRA_API_ERROR');

  const user = await res.json();

  await saveCredentials(workspaceId, CONNECTOR_ID, {
    email,
    apiToken,
    domain:   cleanDomain,
    authMode: 'api_token',
  }, {
    authStrategy:  'api_key',
    accountLabel:  user.displayName || email,
    accountEmail:  email,
  });

  await updateHealthStatus(workspaceId, CONNECTOR_ID, 'healthy');
  return { displayName: user.displayName, accountId: user.accountId };
}

/**
 * Get a valid access token, auto-refreshing if the OAuth access token is expired.
 * Returns the full credential object for API-token mode (caller extracts what it needs).
 */
export async function getAccessToken(workspaceId) {
  const cred = await loadCredentials(workspaceId, CONNECTOR_ID);
  if (!cred) return null;

  if (cred.authMode === 'api_token') return cred;

  // OAuth mode: proactive refresh if within 60s of expiry
  if (cred.expiresAt && Date.now() > new Date(cred.expiresAt).getTime() - 60_000) {
    try {
      const newToken = await _refreshAccessToken(workspaceId);
      if (newToken) return { ...cred, accessToken: newToken };
    } catch (err) {
      if (err.code === 'REFRESH_TOKEN_EXPIRED') throw err;
      // Non-fatal: return existing token and let the caller deal with a potential 401
    }
  }

  return cred;
}

/**
 * Build auth header and base URL for Jira REST API calls.
 * Returns null if no credentials are available.
 */
export async function getJiraConfig(workspaceId) {
  let cred;
  try {
    cred = await getAccessToken(workspaceId);
  } catch (err) {
    if (err.code === 'REFRESH_TOKEN_EXPIRED') return null;
    throw err;
  }

  if (!cred) {
    // Env var fallback for dev/single-tenant
    const { JIRA_EMAIL, JIRA_API_TOKEN, JIRA_DOMAIN } = process.env;
    if (JIRA_EMAIL && JIRA_API_TOKEN && JIRA_DOMAIN) {
      return {
        authHeader: `Basic ${Buffer.from(`${JIRA_EMAIL}:${JIRA_API_TOKEN}`).toString('base64')}`,
        baseUrl:    `https://${JIRA_DOMAIN}/rest/api/3`,
      };
    }
    return null;
  }

  if (cred.authMode === 'api_token') {
    return {
      authHeader: `Basic ${Buffer.from(`${cred.email}:${cred.apiToken}`).toString('base64')}`,
      baseUrl:    `https://${cred.domain}/rest/api/3`,
    };
  }

  return {
    authHeader: `Bearer ${cred.accessToken}`,
    baseUrl:    `${ATLASSIAN_API}/ex/jira/${cred.cloudId}/rest/api/3`,
  };
}

/**
 * Connection status with health metadata.
 */
export async function getStatus(workspaceId) {
  const meta = await getCredentialMeta(workspaceId, CONNECTOR_ID);
  if (!meta) {
    const { JIRA_EMAIL, JIRA_API_TOKEN } = process.env;
    if (JIRA_EMAIL && JIRA_API_TOKEN) {
      return { connected: true, authStrategy: 'env', accountLabel: 'JIRA_API_TOKEN (env)', healthStatus: 'unknown' };
    }
    return { connected: false };
  }
  return { connected: meta.connected, ...meta };
}

/**
 * Revoke credentials (soft delete). Jira does not have a token revocation API.
 */
export async function disconnect(workspaceId) {
  await revokeCredentials(workspaceId, CONNECTOR_ID);
  return { disconnected: true };
}

/**
 * Clear credentials and return a new OAuth consent URL.
 */
export async function reconnect(workspaceId) {
  await revokeCredentials(workspaceId, CONNECTOR_ID);
  return getAuthUrl(workspaceId);
}

/**
 * Probe the Jira /myself endpoint, persist health result.
 */
export async function validateCredentials(workspaceId) {
  const cfg = await getJiraConfig(workspaceId).catch(() => null);
  if (!cfg) {
    return { valid: false, healthStatus: 'not_connected', action: 'connect' };
  }

  try {
    const res = await fetch(`${cfg.baseUrl}/myself`, {
      headers: { Authorization: cfg.authHeader, Accept: 'application/json' },
    });

    if (res.status === 401) {
      await updateHealthStatus(workspaceId, CONNECTOR_ID, 'revoked', 'Jira returned 401 — token revoked or expired');
      return { valid: false, healthStatus: 'revoked', action: 'reconnect' };
    }
    if (!res.ok) {
      await updateHealthStatus(workspaceId, CONNECTOR_ID, 'degraded', `Jira API ${res.status}`);
      return { valid: false, healthStatus: 'degraded', action: 'retry' };
    }

    const user = await res.json();
    await updateHealthStatus(workspaceId, CONNECTOR_ID, 'healthy');
    return { valid: true, healthStatus: 'healthy', displayName: user.displayName };
  } catch (err) {
    const isExpired = err.code === 'REFRESH_TOKEN_EXPIRED';
    const status    = isExpired ? 'expired' : 'degraded';
    await updateHealthStatus(workspaceId, CONNECTOR_ID, status, err.message).catch(() => {});
    return { valid: false, healthStatus: status, reason: err.message, action: 'reconnect' };
  }
}

/**
 * Health check (non-persisting, for real-time status endpoint).
 */
export async function healthCheck(workspaceId) {
  const cfg = await getJiraConfig(workspaceId).catch(() => null);
  if (!cfg) return { healthy: false, reason: 'No credentials' };
  try {
    const res = await fetch(`${cfg.baseUrl}/myself`, {
      headers: { Authorization: cfg.authHeader, Accept: 'application/json' },
    });
    if (!res.ok) return { healthy: false, reason: `Jira API ${res.status}` };
    const data = await res.json();
    return { healthy: true, displayName: data.displayName, accountId: data.accountId };
  } catch (err) {
    return { healthy: false, reason: err.message };
  }
}
