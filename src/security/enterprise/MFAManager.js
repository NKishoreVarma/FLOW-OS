/**
 * MFAManager — Module 4 (Enterprise Security)
 *
 * TOTP-based MFA using RFC 6238. No external dependencies — uses Node.js crypto.
 * Implements: setup, verify, backup codes, and enforcement policy.
 */

import { createHmac, randomBytes } from 'crypto';
import { query }    from '../../config/db.js';
import { AppError } from '../../core/errors/index.js';

const TOTP_DIGITS   = 6;
const TOTP_STEP     = 30;       // seconds
const TOTP_WINDOW   = 1;        // ±1 step tolerance
const BACKUP_COUNT  = 10;

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Generate a new TOTP secret and return setup data.
 */
export async function setupMFA(userId, orgId) {
  const secret = _generateBase32Secret(20);
  const backupCodes = _generateBackupCodes();

  await query(
    `INSERT INTO enterprise_mfa_configs (user_id, org_id, method, secret, backup_codes)
     VALUES ($1,$2,'totp',$3,$4)
     ON CONFLICT (user_id, method)
     DO UPDATE SET secret=$3, backup_codes=$4, verified=false`,
    [userId, orgId, secret, JSON.stringify(backupCodes)]
  );

  const issuer  = encodeURIComponent(process.env.MFA_ISSUER ?? 'FLOW OS');
  const account = encodeURIComponent(userId);
  const otpauthUrl = `otpauth://totp/${issuer}:${account}?secret=${secret}&issuer=${issuer}&digits=${TOTP_DIGITS}&period=${TOTP_STEP}`;

  return { secret, otpauthUrl, backupCodes };
}

/**
 * Verify a TOTP code and mark MFA as verified on first success.
 */
export async function verifyMFA(userId, code) {
  const { rows } = await query(
    `SELECT * FROM enterprise_mfa_configs WHERE user_id = $1 AND method = 'totp'`,
    [userId]
  );
  const config = rows[0];
  if (!config) throw new AppError('MFA not configured', 404, 'MFA_NOT_CONFIGURED');

  const valid = _verifyTOTP(config.secret, code);
  if (!valid) {
    // Try backup codes
    const backupCodes = _parseJson(config.backup_codes, []);
    const idx = backupCodes.indexOf(code.trim());
    if (idx !== -1) {
      backupCodes.splice(idx, 1);
      await query(
        `UPDATE enterprise_mfa_configs SET backup_codes=$1, last_used_at=NOW() WHERE user_id=$2 AND method='totp'`,
        [JSON.stringify(backupCodes), userId]
      );
      return { verified: true, backupCodeUsed: true, remainingCodes: backupCodes.length };
    }
    return { verified: false, reason: 'Invalid TOTP code' };
  }

  await query(
    `UPDATE enterprise_mfa_configs SET verified=true, last_used_at=NOW() WHERE user_id=$1 AND method='totp'`,
    [userId]
  );
  return { verified: true };
}

/**
 * Disable MFA for a user (admin action).
 */
export async function disableMFA(userId) {
  await query(
    `DELETE FROM enterprise_mfa_configs WHERE user_id = $1`,
    [userId]
  );
  return { disabled: true };
}

/**
 * Check if a user has MFA enabled and verified.
 */
export async function getMFAStatus(userId) {
  const { rows } = await query(
    `SELECT method, verified, last_used_at FROM enterprise_mfa_configs WHERE user_id = $1`,
    [userId]
  );
  return {
    enabled:  rows.length > 0,
    verified: rows.some(r => r.verified),
    methods:  rows.map(r => ({ method: r.method, verified: r.verified, lastUsedAt: r.last_used_at })),
  };
}

/**
 * Generate new backup codes (invalidates old ones).
 */
export async function regenerateBackupCodes(userId) {
  const newCodes = _generateBackupCodes();
  await query(
    `UPDATE enterprise_mfa_configs SET backup_codes=$1 WHERE user_id=$2 AND method='totp'`,
    [JSON.stringify(newCodes), userId]
  );
  return { backupCodes: newCodes };
}

// ── TOTP Implementation (RFC 6238) ────────────────────────────────────────────

function _verifyTOTP(secret, code) {
  const now     = Math.floor(Date.now() / 1000 / TOTP_STEP);
  const trimmed = (code ?? '').replace(/\s/g, '');
  for (let i = -TOTP_WINDOW; i <= TOTP_WINDOW; i++) {
    if (_generateTOTP(secret, now + i) === trimmed) return true;
  }
  return false;
}

function _generateTOTP(secret, counter) {
  const key   = _base32Decode(secret);
  const buf   = Buffer.alloc(8);
  const hi    = Math.floor(counter / 0x100000000);
  const lo    = counter >>> 0;
  buf.writeUInt32BE(hi, 0);
  buf.writeUInt32BE(lo, 4);
  const hmac  = createHmac('sha1', key).update(buf).digest();
  const off   = hmac[hmac.length - 1] & 0x0f;
  const code  = ((hmac[off] & 0x7f) << 24) |
                ((hmac[off+1] & 0xff) << 16) |
                ((hmac[off+2] & 0xff) <<  8) |
                 (hmac[off+3] & 0xff);
  return String(code % (10 ** TOTP_DIGITS)).padStart(TOTP_DIGITS, '0');
}

function _generateBase32Secret(bytes = 20) {
  return _base32Encode(randomBytes(bytes));
}

const B32_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function _base32Encode(buf) {
  let out = '', bits = 0, acc = 0;
  for (const byte of buf) {
    acc  = (acc << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      out += B32_CHARS[(acc >> bits) & 0x1f];
    }
  }
  if (bits > 0) out += B32_CHARS[(acc << (5 - bits)) & 0x1f];
  return out;
}

function _base32Decode(str) {
  const s    = str.toUpperCase().replace(/=+$/, '');
  let   out  = [], bits = 0, acc = 0;
  for (const c of s) {
    const v = B32_CHARS.indexOf(c);
    if (v < 0) continue;
    acc  = (acc << 5) | v;
    bits += 5;
    if (bits >= 8) { bits -= 8; out.push((acc >> bits) & 0xff); }
  }
  return Buffer.from(out);
}

function _generateBackupCodes() {
  return Array.from({ length: BACKUP_COUNT }, () =>
    randomBytes(4).toString('hex').toUpperCase()
  );
}

function _parseJson(v, fallback) {
  if (Array.isArray(v)) return v;
  try { return JSON.parse(v); } catch { return fallback; }
}
