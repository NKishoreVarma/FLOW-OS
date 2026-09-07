/**
 * Shared OAuth 2.0 helpers: CSRF state signing/verification and PKCE.
 *
 * CSRF protection model:
 *   state = base64url(JSON.stringify({ workspaceId, nonce, ts, cv?, sig }))
 *   sig   = HMAC-SHA256(JWT_SECRET, "${prefix}:${workspaceId}:${nonce}:${ts}:${cv||''}")
 *
 * timestamp (ts) prevents state replay — state expires after STATE_MAX_AGE_MS.
 * codeVerifier (cv) is embedded for PKCE flows (GitHub, Jira).
 * timingSafeEqual prevents timing-based sig comparison attacks.
 *
 * PKCE (RFC 7636):
 *   codeVerifier  = base64url(random 32 bytes)   // 43 chars, high entropy
 *   codeChallenge = base64url(SHA-256(verifier))  // S256 method
 *
 * Supported connectors:
 *   PKCE: github, jira
 *   CSRF only: slack, notion (platforms do not support PKCE)
 *   googleapis: google (handles PKCE internally)
 */

import crypto from 'crypto';
import { AppError } from '../../core/errors/index.js';

export const STATE_MAX_AGE_MS = 10 * 60 * 1000; // 10 minutes

// ── PKCE ─────────────────────────────────────────────────────────────────────

/**
 * Generate a PKCE code_verifier.
 * 32 random bytes → base64url = 43 URL-safe chars (meets RFC 7636 §4.1).
 */
export function generateCodeVerifier() {
  return crypto.randomBytes(32).toString('base64url');
}

/**
 * Derive code_challenge from code_verifier using S256 method.
 */
export function computeCodeChallenge(verifier) {
  return crypto.createHash('sha256').update(verifier).digest('base64url');
}

// ── CSRF state ────────────────────────────────────────────────────────────────

/**
 * Sign an OAuth state parameter.
 *
 * @param {string} prefix        — connector name used as HMAC scope ('github', 'slack', etc.)
 * @param {string} workspaceId
 * @param {object} [opts]
 * @param {string} [opts.codeVerifier] — include for PKCE flows
 * @returns {string} base64url-encoded signed state
 */
export function signState(prefix, workspaceId, { codeVerifier = null } = {}) {
  const nonce = crypto.randomBytes(16).toString('hex');
  const ts    = Date.now();
  const cv    = codeVerifier || '';

  const hmac = crypto.createHmac('sha256', process.env.JWT_SECRET);
  hmac.update(`${prefix}:${workspaceId}:${nonce}:${ts}:${cv}`);
  const sig = hmac.digest('hex');

  const payload = { workspaceId, nonce, ts, sig };
  if (cv) payload.cv = cv;

  return Buffer.from(JSON.stringify(payload)).toString('base64url');
}

/**
 * Verify a signed OAuth state parameter.
 *
 * @param {string} prefix     — must match the prefix used in signState()
 * @param {string} stateStr   — raw state string from the OAuth callback query param
 * @returns {{ workspaceId: string, codeVerifier: string|null }}
 * @throws {AppError} on tampered state, missing fields, or expired state
 */
export function verifyState(prefix, stateStr) {
  let parsed;
  try {
    parsed = JSON.parse(Buffer.from(stateStr, 'base64url').toString('utf8'));
  } catch {
    throw new AppError(`Malformed ${prefix} OAuth state`, 400, 'INVALID_OAUTH_STATE');
  }

  const { workspaceId, nonce, ts, sig, cv } = parsed;

  if (!workspaceId || !nonce || !sig) {
    throw new AppError(`Incomplete ${prefix} OAuth state`, 400, 'INVALID_OAUTH_STATE');
  }

  // Replay protection — state is single-use and time-bounded
  if (ts && Date.now() - ts > STATE_MAX_AGE_MS) {
    throw new AppError(
      `${prefix} OAuth state has expired. Please restart the authorization flow.`,
      400,
      'OAUTH_STATE_EXPIRED',
    );
  }

  // Reconstruct the expected HMAC
  const hmac     = crypto.createHmac('sha256', process.env.JWT_SECRET);
  hmac.update(`${prefix}:${workspaceId}:${nonce}:${ts || ''}:${cv || ''}`);
  const expected = hmac.digest('hex');

  // Length check before timingSafeEqual (both are hex SHA-256 = 64 chars, but be safe)
  let sigBuf, expBuf;
  try {
    sigBuf = Buffer.from(sig, 'hex');
    expBuf = Buffer.from(expected, 'hex');
  } catch {
    throw new AppError(`${prefix} OAuth state has invalid signature encoding`, 400, 'CSRF_DETECTED');
  }

  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    throw new AppError(
      `${prefix} OAuth state verification failed — possible CSRF attack`,
      400,
      'CSRF_DETECTED',
    );
  }

  return { workspaceId, codeVerifier: cv || null };
}
