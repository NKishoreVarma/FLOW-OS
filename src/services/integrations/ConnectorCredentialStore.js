/**
 * ConnectorCredentialStore — encrypted, persistent credential storage for all
 * non-Google connectors (GitHub, Slack, Jira, Notion, HubSpot, etc.).
 *
 * Google uses GoogleTokenManager (same AES-256-GCM scheme) — this file extends
 * the same pattern to every other connector.
 *
 * Key: AES-256-GCM, derived from JWT_SECRET via scrypt — never stored.
 * Storage: `connector_credentials` table (scripts/migrate-integrations-v10.sql).
 *
 * Drop-in replacement for the in-memory authManager for connectors that need
 * persistent, workspace-scoped credentials.
 */

import crypto from 'crypto';
import db     from '../../config/db.js';

const ALGORITHM = 'aes-256-gcm';
const KEY_LEN   = 32;
const SALT      = 'flow-connector-creds-v10';

// ── Encryption ────────────────────────────────────────────────────────────────

function _key() {
  return crypto.scryptSync(process.env.JWT_SECRET, SALT, KEY_LEN);
}

function encrypt(plaintext) {
  const iv     = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, _key(), iv);
  const enc    = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag    = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${enc.toString('hex')}`;
}

function decrypt(ciphertext) {
  const [ivHex, tagHex, encHex] = ciphertext.split(':');
  if (!ivHex || !tagHex || !encHex) throw new Error('Invalid ciphertext format');
  const decipher = crypto.createDecipheriv(ALGORITHM, _key(), Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  return Buffer.concat([
    decipher.update(Buffer.from(encHex, 'hex')),
    decipher.final(),
  ]).toString('utf8');
}

// ── Core CRUD ─────────────────────────────────────────────────────────────────

/**
 * Save (upsert) credentials for a workspace + connector.
 * Payload is any JSON-serializable object (OAuth tokens, PAT, API key, etc.).
 */
export async function saveCredentials(workspaceId, connectorId, payload, {
  authStrategy   = 'api_key',
  scopes         = null,
  accountLabel   = null,
  accountEmail   = null,
  expiresAt      = null,
  meta           = {},
} = {}) {
  const encrypted = encrypt(JSON.stringify(payload));

  await db.query(
    `INSERT INTO connector_credentials
       (workspace_id, connector_id, auth_strategy, encrypted_payload,
        scopes, account_label, account_email, connected_at, last_refreshed_at, expires_at, revoked_at, meta)
     VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW(), $8, NULL, $9)
     ON CONFLICT (workspace_id, connector_id) DO UPDATE SET
       auth_strategy      = EXCLUDED.auth_strategy,
       encrypted_payload  = EXCLUDED.encrypted_payload,
       scopes             = COALESCE(EXCLUDED.scopes, connector_credentials.scopes),
       account_label      = COALESCE(EXCLUDED.account_label, connector_credentials.account_label),
       account_email      = COALESCE(EXCLUDED.account_email, connector_credentials.account_email),
       last_refreshed_at  = NOW(),
       expires_at         = EXCLUDED.expires_at,
       revoked_at         = NULL,
       meta               = connector_credentials.meta || EXCLUDED.meta`,
    [workspaceId, connectorId, authStrategy, encrypted, scopes, accountLabel, accountEmail, expiresAt, meta],
  );
}

/**
 * Load and decrypt credentials. Returns null if not found or revoked.
 */
export async function loadCredentials(workspaceId, connectorId) {
  const { rows } = await db.query(
    `SELECT encrypted_payload FROM connector_credentials
      WHERE workspace_id = $1 AND connector_id = $2 AND revoked_at IS NULL`,
    [workspaceId, connectorId],
  );
  if (!rows.length) return null;
  try {
    return JSON.parse(decrypt(rows[0].encrypted_payload));
  } catch {
    return null;
  }
}

/**
 * Update an OAuth2 token payload after a token refresh without touching other columns.
 */
export async function refreshCredentials(workspaceId, connectorId, newTokenPayload) {
  const existing = await loadCredentials(workspaceId, connectorId);
  if (!existing) return;
  const merged = { ...existing, ...newTokenPayload };
  const encrypted = encrypt(JSON.stringify(merged));
  await db.query(
    `UPDATE connector_credentials SET encrypted_payload = $1, last_refreshed_at = NOW()
      WHERE workspace_id = $2 AND connector_id = $3`,
    [encrypted, workspaceId, connectorId],
  );
}

/**
 * Return connection metadata without tokens. Safe for API responses.
 * Includes health status persisted by the last validateCredentials() call.
 */
export async function getCredentialMeta(workspaceId, connectorId) {
  const { rows } = await db.query(
    `SELECT auth_strategy, scopes, account_label, account_email,
            connected_at, last_refreshed_at, expires_at, revoked_at, meta
       FROM connector_credentials
      WHERE workspace_id = $1 AND connector_id = $2`,
    [workspaceId, connectorId],
  );
  if (!rows.length) return null;
  const r    = rows[0];
  const meta = r.meta || {};
  return {
    authStrategy:    r.auth_strategy,
    scopes:          r.scopes ? r.scopes.split(' ').filter(Boolean) : [],
    accountLabel:    r.account_label,
    accountEmail:    r.account_email,
    connectedAt:     r.connected_at,
    lastRefreshedAt: r.last_refreshed_at,
    expiresAt:       r.expires_at,
    isRevoked:       !!r.revoked_at,
    meta,
    connected:       !r.revoked_at,
    healthStatus:    meta.healthStatus   || (r.revoked_at ? 'revoked' : 'unknown'),
    healthReason:    meta.healthReason   || null,
    healthCheckedAt: meta.healthCheckedAt || null,
    needsReconnect:  meta.needsReconnect || false,
  };
}

/**
 * Persist the result of the last health/validation check into the meta JSONB column.
 * Called by validateCredentials() in each OAuth service after probing the upstream API.
 *
 * @param {string} workspaceId
 * @param {string} connectorId
 * @param {'healthy'|'degraded'|'revoked'|'expired'|'invalid'} status
 * @param {string|null} reason   — human-readable error detail (not exposed to end users)
 */
export async function updateHealthStatus(workspaceId, connectorId, status, reason = null) {
  const patch = JSON.stringify({
    healthStatus:    status,
    healthReason:    reason,
    healthCheckedAt: new Date().toISOString(),
    needsReconnect:  ['revoked', 'expired', 'invalid'].includes(status),
  });
  await db.query(
    `UPDATE connector_credentials
        SET meta = meta || $1::jsonb
      WHERE workspace_id = $2 AND connector_id = $3`,
    [patch, workspaceId, connectorId],
  );
}

/**
 * True if this workspace has active (non-revoked) credentials for this connector.
 */
export async function hasCredentials(workspaceId, connectorId) {
  const { rows } = await db.query(
    `SELECT 1 FROM connector_credentials
      WHERE workspace_id = $1 AND connector_id = $2 AND revoked_at IS NULL LIMIT 1`,
    [workspaceId, connectorId],
  );
  return rows.length > 0;
}

/**
 * Soft-revoke credentials. Does not delete — allows audit trail.
 */
export async function revokeCredentials(workspaceId, connectorId) {
  await db.query(
    `UPDATE connector_credentials SET revoked_at = NOW()
      WHERE workspace_id = $1 AND connector_id = $2`,
    [workspaceId, connectorId],
  );
}

/**
 * Hard-delete credentials (for GDPR / data deletion requests).
 */
export async function deleteCredentials(workspaceId, connectorId) {
  await db.query(
    `DELETE FROM connector_credentials WHERE workspace_id = $1 AND connector_id = $2`,
    [workspaceId, connectorId],
  );
}

/**
 * List all connected connector IDs for a workspace (non-revoked only).
 */
export async function listConnectedConnectors(workspaceId) {
  const { rows } = await db.query(
    `SELECT connector_id, auth_strategy, account_label, connected_at
       FROM connector_credentials
      WHERE workspace_id = $1 AND revoked_at IS NULL
      ORDER BY connected_at DESC`,
    [workspaceId],
  );
  return rows.map(r => ({
    connectorId:   r.connector_id,
    authStrategy:  r.auth_strategy,
    accountLabel:  r.account_label,
    connectedAt:   r.connected_at,
  }));
}

/**
 * Check whether stored OAuth tokens are expired (or close to expiring).
 * Pass `bufferMs` to treat tokens as expired if they expire within that window.
 */
export async function isTokenExpired(workspaceId, connectorId, bufferMs = 5 * 60 * 1000) {
  const { rows } = await db.query(
    `SELECT expires_at FROM connector_credentials
      WHERE workspace_id = $1 AND connector_id = $2 AND revoked_at IS NULL`,
    [workspaceId, connectorId],
  );
  if (!rows.length || !rows[0].expires_at) return false;
  return Date.now() + bufferMs >= new Date(rows[0].expires_at).getTime();
}
