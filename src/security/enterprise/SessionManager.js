/**
 * SessionManager — Module 4 (Enterprise Security)
 *
 * Enterprise session management with device trust, MFA state tracking,
 * and revocation. Sessions are stored in PostgreSQL and optionally in Redis.
 */

import { createHash, randomBytes } from 'crypto';
import { query }       from '../../config/db.js';
import { AppError }    from '../../core/errors/index.js';
import { signToken }   from '../../core/middleware/authenticate.js';

const SESSION_TTL_HOURS = Number(process.env.SESSION_TTL_HOURS ?? 8);
const MAX_SESSIONS_PER_USER = Number(process.env.MAX_SESSIONS_PER_USER ?? 10);

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Create an enterprise session after successful authentication.
 */
export async function createSession(userId, orgId, { ipAddress, userAgent, deviceId, workspaceId, mfaVerified = false, ssoSessionId = null } = {}) {
  // Purge excess sessions for user
  await _purgeExcessSessions(userId);

  const rawToken  = randomBytes(48).toString('hex');
  const tokenHash = _hash(rawToken);
  const expiresAt = new Date(Date.now() + SESSION_TTL_HOURS * 3600_000).toISOString();

  const { rows } = await query(
    `INSERT INTO enterprise_sessions
       (user_id, org_id, workspace_id, token_hash, ip_address, user_agent,
        device_id, sso_session_id, mfa_verified, expires_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     RETURNING id`,
    [userId, orgId, workspaceId, tokenHash, ipAddress, userAgent,
     deviceId, ssoSessionId, mfaVerified, expiresAt]
  );

  const sessionId = rows[0].id;
  const jwt       = signToken({ userId, orgId, sessionId, mfaVerified });

  return { sessionId, token: rawToken, jwt, expiresAt };
}

/**
 * Validate a session token (raw, not JWT).
 */
export async function validateSession(rawToken) {
  const tokenHash = _hash(rawToken);
  const { rows }  = await query(
    `SELECT * FROM enterprise_sessions
     WHERE token_hash = $1 AND revoked = false AND expires_at > NOW()`,
    [tokenHash]
  );
  if (!rows[0]) throw new AppError('Session expired or revoked', 401, 'SESSION_INVALID');
  await _touchSession(rows[0].id);
  return rows[0];
}

/**
 * Revoke a specific session.
 */
export async function revokeSession(sessionId) {
  await query(
    `UPDATE enterprise_sessions SET revoked = true WHERE id = $1`,
    [sessionId]
  );
  return { revoked: true, sessionId };
}

/**
 * Revoke all sessions for a user (logout all devices).
 */
export async function revokeAllSessions(userId) {
  const { rowCount } = await query(
    `UPDATE enterprise_sessions SET revoked = true WHERE user_id = $1 AND revoked = false`,
    [userId]
  );
  return { revoked: true, count: rowCount };
}

/**
 * Mark a session as MFA-verified.
 */
export async function markMFAVerified(sessionId) {
  await query(
    `UPDATE enterprise_sessions SET mfa_verified = true WHERE id = $1`,
    [sessionId]
  );
}

/**
 * List active sessions for a user.
 */
export async function listUserSessions(userId) {
  const { rows } = await query(
    `SELECT id, org_id, workspace_id, ip_address, user_agent, device_id,
            mfa_verified, created_at, last_active_at, expires_at
     FROM enterprise_sessions
     WHERE user_id = $1 AND revoked = false AND expires_at > NOW()
     ORDER BY last_active_at DESC`,
    [userId]
  );
  return rows;
}

/**
 * Purge expired sessions (call periodically).
 */
export async function purgeExpiredSessions() {
  const { rowCount } = await query(
    `DELETE FROM enterprise_sessions WHERE expires_at < NOW() OR revoked = true`
  );
  return { purged: rowCount };
}

/**
 * Get session by ID.
 */
export async function getSession(sessionId) {
  const { rows } = await query(
    `SELECT * FROM enterprise_sessions WHERE id = $1`,
    [sessionId]
  );
  return rows[0] ?? null;
}

// ── Internal ──────────────────────────────────────────────────────────────────

function _hash(raw) {
  return createHash('sha256').update(raw).digest('hex');
}

async function _touchSession(sessionId) {
  await query(
    `UPDATE enterprise_sessions SET last_active_at = NOW() WHERE id = $1`,
    [sessionId]
  ).catch(() => null);
}

async function _purgeExcessSessions(userId) {
  const { rows } = await query(
    `SELECT id FROM enterprise_sessions
     WHERE user_id = $1 AND revoked = false
     ORDER BY last_active_at ASC`,
    [userId]
  );
  if (rows.length >= MAX_SESSIONS_PER_USER) {
    const toRevoke = rows.slice(0, rows.length - MAX_SESSIONS_PER_USER + 1).map(r => r.id);
    await query(
      `UPDATE enterprise_sessions SET revoked = true WHERE id = ANY($1)`,
      [toRevoke]
    ).catch(() => null);
  }
}
