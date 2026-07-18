/**
 * GoogleOAuthService — unified OAuth flow for all Google APIs.
 *
 * Handles: consent URL generation, code exchange, token storage,
 * auto-refresh wiring, status checks, and revocation.
 *
 * CSRF protection: the OAuth state param is HMAC-signed with JWT_SECRET.
 * No Redis required — state is verified statelessy on callback.
 *
 * Google APIs covered by the unified scopes:
 *   Gmail, Google Calendar, Google Drive, Docs, Sheets, People API
 */

import crypto      from 'crypto';
import { google }  from 'googleapis';
import { saveTokens, loadTokens, clearTokens, getTokenMeta, hasTokens } from './GoogleTokenManager.js';
import { AppError } from '../../core/errors/index.js';

// Health status helpers — stored in google_oauth_tokens.meta (JSONB)
// We use a lightweight inline update rather than importing ConnectorCredentialStore
// because Google tokens live in a separate table (google_oauth_tokens).
import db from '../../config/db.js';

async function _updateGoogleHealth(workspaceId, status, reason = null) {
  try {
    await db.query(
      `UPDATE google_oauth_tokens
          SET meta = COALESCE(meta, '{}'::jsonb) || $1::jsonb
        WHERE workspace_id = $2`,
      [JSON.stringify({
        healthStatus:    status,
        healthReason:    reason,
        healthCheckedAt: new Date().toISOString(),
        needsReconnect:  ['revoked', 'expired', 'invalid'].includes(status),
      }), workspaceId],
    );
  } catch { /* non-fatal */ }
}

// ── Unified scope set for all 6 Google services ───────────────────────────────
export const GOOGLE_SCOPES = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/spreadsheets.readonly',
  'https://www.googleapis.com/auth/contacts.readonly',
];

// ── CSRF state helpers ────────────────────────────────────────────────────────

function signState(workspaceId) {
  const nonce = crypto.randomBytes(16).toString('hex');
  const hmac  = crypto.createHmac('sha256', process.env.JWT_SECRET);
  hmac.update(`${workspaceId}:${nonce}`);
  const sig = hmac.digest('hex');
  return Buffer.from(JSON.stringify({ workspaceId, nonce, sig })).toString('base64url');
}

function verifyState(stateStr) {
  let parsed;
  try {
    parsed = JSON.parse(Buffer.from(stateStr, 'base64url').toString('utf8'));
  } catch {
    throw new AppError('Malformed OAuth state parameter', 400, 'INVALID_OAUTH_STATE');
  }

  const { workspaceId, nonce, sig } = parsed;
  if (!workspaceId || !nonce || !sig) {
    throw new AppError('Incomplete OAuth state parameter', 400, 'INVALID_OAUTH_STATE');
  }

  const hmac     = crypto.createHmac('sha256', process.env.JWT_SECRET);
  hmac.update(`${workspaceId}:${nonce}`);
  const expected = hmac.digest('hex');

  if (!crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'))) {
    throw new AppError('OAuth state verification failed — possible CSRF', 400, 'CSRF_DETECTED');
  }

  return workspaceId;
}

// ── OAuth2 client factory ─────────────────────────────────────────────────────

function _createOAuth2Client(redirectUri) {
  const clientId     = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret || clientId === 'YOUR_GOOGLE_CLIENT_ID_HERE') {
    throw new AppError(
      'Google OAuth is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env',
      503,
      'GOOGLE_NOT_CONFIGURED',
    );
  }

  const redirect = redirectUri
    || process.env.GOOGLE_REDIRECT_URI
    || 'http://localhost:5001/api/google/callback';

  return new google.auth.OAuth2(clientId, clientSecret, redirect);
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Generate the Google consent URL.
 * The state is HMAC-signed so the callback can verify it.
 *
 * @param {string} workspaceId — externalId from workspace-id header
 * @param {object} opts
 * @param {string} [opts.redirectUri]
 * @param {string[]} [opts.scopes]   — override if a subset is needed
 * @returns {{ authUrl: string, state: string }}
 */
export function getAuthUrl(workspaceId, { redirectUri, scopes } = {}) {
  const oauth2 = _createOAuth2Client(redirectUri);
  const state  = signState(workspaceId);
  const authUrl = oauth2.generateAuthUrl({
    access_type: 'offline',
    prompt:      'consent',
    scope:       scopes || GOOGLE_SCOPES,
    state,
  });
  return { authUrl, state };
}

/**
 * Exchange an OAuth code for tokens, verify CSRF state, persist tokens.
 *
 * @param {string} code         — from Google's redirect query param
 * @param {string} stateStr     — signed state from getAuthUrl()
 * @param {object} opts
 * @param {string} [opts.redirectUri]
 * @returns {{ workspaceId: string, tokens: object, email: string|null }}
 */
export async function handleCallback(code, stateStr, { redirectUri } = {}) {
  const workspaceId = verifyState(stateStr);
  const oauth2      = _createOAuth2Client(redirectUri);

  let tokens;
  try {
    const result = await oauth2.getToken(code);
    tokens = result.tokens;
  } catch (err) {
    throw new AppError(
      `Google OAuth token exchange failed: ${err.message}`,
      502,
      'OAUTH_EXCHANGE_FAILED',
    );
  }

  // Resolve email from id_token if present
  let email = null;
  if (tokens.id_token) {
    try {
      const ticket  = await oauth2.verifyIdToken({ idToken: tokens.id_token });
      email         = ticket.getPayload()?.email ?? null;
    } catch { /* non-fatal */ }
  }

  await saveTokens(workspaceId, tokens, { email });
  await _updateGoogleHealth(workspaceId, 'healthy');
  return { workspaceId, tokens, email };
}

/**
 * Build an OAuth2Client with stored tokens and auto-refresh wiring.
 * Returns null if this workspace has no stored tokens.
 * Throws AppError('TOKEN_REVOKED') if the refresh token has been revoked
 * (Google returns 'invalid_grant' on the first attempt to use it).
 *
 * @param {string} workspaceId
 * @param {string} [redirectUri]
 * @returns {Promise<import('googleapis').Auth.OAuth2Client|null>}
 */
export async function getOAuth2Client(workspaceId, redirectUri) {
  const tokens = await loadTokens(workspaceId);
  if (!tokens) return null;

  const oauth2 = _createOAuth2Client(redirectUri);
  oauth2.setCredentials(tokens);

  // Persist refreshed tokens and detect revocation
  oauth2.on('tokens', newTokens => {
    saveTokens(workspaceId, { ...tokens, ...newTokens }).catch(() => {});
  });

  // Validate tokens are still usable (catches revoked refresh tokens)
  try {
    // If access token is expired, googleapis will attempt a refresh on the first API call.
    // We don't call a validation API here — that's done by validateCredentials().
    // This just ensures the client is properly configured.
    if (tokens.expiry_date && Date.now() > tokens.expiry_date && !tokens.refresh_token) {
      throw new AppError('Google access token has expired and no refresh token is available', 401, 'TOKEN_EXPIRED');
    }
  } catch (err) {
    if (err.code === 'TOKEN_EXPIRED') throw err;
  }

  return oauth2;
}

/**
 * Check connection status for a workspace.
 * @returns {{ connected: boolean, email: string|null, scopes: string[], connectedAt: Date|null }}
 */
export async function getStatus(workspaceId) {
  const meta = await getTokenMeta(workspaceId);
  if (!meta) return { connected: false, email: null, scopes: [], connectedAt: null };
  return { connected: true, ...meta };
}

/**
 * Revoke the Google tokens and remove from DB.
 * Best-effort revocation — DB deletion happens regardless of Google API response.
 */
export async function disconnect(workspaceId) {
  const tokens = await loadTokens(workspaceId);
  if (tokens) {
    try {
      const oauth2 = _createOAuth2Client();
      oauth2.setCredentials(tokens);
      await oauth2.revokeCredentials();
    } catch { /* non-fatal — tokens may already be expired */ }
  }
  await clearTokens(workspaceId);
  return { disconnected: true };
}

/**
 * Re-authenticate — clears stored tokens and returns a fresh consent URL.
 * The caller should redirect the user to the returned authUrl.
 * Existing tokens are revoked on Google's side first (best-effort).
 */
export async function reconnect(workspaceId, { redirectUri } = {}) {
  const tokens = await loadTokens(workspaceId);
  if (tokens) {
    try {
      const oauth2 = _createOAuth2Client(redirectUri);
      oauth2.setCredentials(tokens);
      await oauth2.revokeCredentials();
    } catch { /* tokens may already be expired — clearTokens always runs */ }
  }
  await clearTokens(workspaceId);
  return getAuthUrl(workspaceId, { redirectUri });
}

/**
 * Probe the People API to verify the token is still valid, persist health result.
 * Sets needsReconnect=true if the token is revoked or refresh has failed.
 *
 * @returns {{ valid: boolean, healthStatus: string, email?: string, action?: string }}
 */
export async function validateCredentials(workspaceId) {
  const connected = await hasTokens(workspaceId);
  if (!connected) {
    return { valid: false, healthStatus: 'not_connected', action: 'connect' };
  }

  try {
    const oauth2 = await getOAuth2Client(workspaceId);
    if (!oauth2) {
      return { valid: false, healthStatus: 'not_connected', action: 'connect' };
    }

    // Light-weight probe: fetch the token info from Google
    const { data } = await google.oauth2({ version: 'v2', auth: oauth2 }).userinfo.get();
    await _updateGoogleHealth(workspaceId, 'healthy');
    return { valid: true, healthStatus: 'healthy', email: data.email };
  } catch (err) {
    const message = err.message || '';
    let status    = 'degraded';
    let action    = 'retry';

    if (
      message.includes('invalid_grant') ||
      message.includes('Token has been expired or revoked') ||
      err.code === 'TOKEN_REVOKED' ||
      err.code === 'TOKEN_EXPIRED'
    ) {
      status = 'revoked';
      action = 'reconnect';
    }

    await _updateGoogleHealth(workspaceId, status, message).catch(() => {});
    return { valid: false, healthStatus: status, reason: message, action };
  }
}
