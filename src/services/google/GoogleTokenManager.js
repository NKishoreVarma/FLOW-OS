/**
 * GoogleTokenManager — persistent, encrypted Google OAuth token storage.
 *
 * Tokens are encrypted with AES-256-GCM using a key derived from JWT_SECRET.
 * The encryption key is never stored — it is re-derived on every process start.
 *
 * Storage: `google_oauth_tokens` PostgreSQL table (external workspace ID as key).
 * This table is independent of the Prisma schema; it is created by
 * scripts/migrate-google-oauth.sql.
 *
 * Replaces the in-memory authManager for all Google OAuth adapters.
 */

import crypto from 'crypto';
import db     from '../../config/db.js';

const ALGORITHM = 'aes-256-gcm';
const KEY_LEN   = 32;

// ── Encryption helpers ────────────────────────────────────────────────────────

function _deriveKey() {
  return crypto.scryptSync(process.env.JWT_SECRET, 'flow-google-oauth-v1', KEY_LEN);
}

function encrypt(plaintext) {
  const iv     = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, _deriveKey(), iv);
  const enc    = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag    = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${enc.toString('hex')}`;
}

function decrypt(ciphertext) {
  const [ivHex, tagHex, encHex] = ciphertext.split(':');
  if (!ivHex || !tagHex || !encHex) throw new Error('Invalid ciphertext format');
  const decipher = crypto.createDecipheriv(ALGORITHM, _deriveKey(), Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  return Buffer.concat([
    decipher.update(Buffer.from(encHex, 'hex')),
    decipher.final(),
  ]).toString('utf8');
}

// ── CRUD ──────────────────────────────────────────────────────────────────────

/**
 * Persist (upsert) OAuth tokens for a workspace.
 * Encrypts before writing. Pass an email string if known (display only).
 */
export async function saveTokens(workspaceId, tokens, { email = null } = {}) {
  const encrypted = encrypt(JSON.stringify(tokens));
  const scopes    = tokens.scope || null;

  await db.query(
    `INSERT INTO google_oauth_tokens
       (workspace_id, encrypted_tokens, email, scopes, connected_at, last_refreshed_at)
     VALUES ($1, $2, $3, $4, NOW(), NOW())
     ON CONFLICT (workspace_id) DO UPDATE SET
       encrypted_tokens  = EXCLUDED.encrypted_tokens,
       email             = COALESCE(EXCLUDED.email, google_oauth_tokens.email),
       scopes            = EXCLUDED.scopes,
       last_refreshed_at = NOW()`,
    [workspaceId, encrypted, email, scopes],
  );
}

/**
 * Load and decrypt OAuth tokens. Returns null if not found or decryption fails.
 */
export async function loadTokens(workspaceId) {
  const { rows } = await db.query(
    'SELECT encrypted_tokens FROM google_oauth_tokens WHERE workspace_id = $1',
    [workspaceId],
  );
  if (!rows.length) return null;
  try {
    return JSON.parse(decrypt(rows[0].encrypted_tokens));
  } catch {
    return null;
  }
}

/**
 * Return connection metadata (no tokens). Safe to expose in API responses.
 */
export async function getTokenMeta(workspaceId) {
  const { rows } = await db.query(
    `SELECT email, scopes, connected_at, last_refreshed_at
       FROM google_oauth_tokens WHERE workspace_id = $1`,
    [workspaceId],
  );
  if (!rows.length) return null;
  return {
    email:           rows[0].email,
    scopes:          rows[0].scopes?.split(' ').filter(Boolean) ?? [],
    connectedAt:     rows[0].connected_at,
    lastRefreshedAt: rows[0].last_refreshed_at,
  };
}

/**
 * True if this workspace has stored Google tokens.
 */
export async function hasTokens(workspaceId) {
  const { rows } = await db.query(
    'SELECT 1 FROM google_oauth_tokens WHERE workspace_id = $1 LIMIT 1',
    [workspaceId],
  );
  return rows.length > 0;
}

/**
 * Delete stored tokens (used on disconnect / revoke).
 */
export async function clearTokens(workspaceId) {
  await db.query(
    'DELETE FROM google_oauth_tokens WHERE workspace_id = $1',
    [workspaceId],
  );
}
