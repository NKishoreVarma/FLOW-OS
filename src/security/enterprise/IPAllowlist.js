/**
 * IPAllowlist — Module 4 (Enterprise Security)
 *
 * IP-based access control with CIDR range support.
 * Allowlist entries are stored in PostgreSQL with a 60s in-memory cache.
 */

import { query }    from '../../config/db.js';
import { ValidationError } from '../../core/errors/index.js';

const _cache = new Map(); // orgId → { entries, expiresAt }
const CACHE_TTL_MS = 60_000;

// ── Public API ────────────────────────────────────────────────────────────────

export async function addEntry(orgId, cidr, { label = null, createdBy = null } = {}) {
  if (!_isValidCIDR(cidr)) throw new ValidationError(`Invalid CIDR: ${cidr}`);
  const { rows } = await query(
    `INSERT INTO enterprise_ip_allowlists (org_id, cidr, label, created_by)
     VALUES ($1,$2,$3,$4) RETURNING *`,
    [orgId, cidr, label, createdBy]
  );
  _cache.delete(orgId);
  return rows[0];
}

export async function removeEntry(orgId, entryId) {
  const { rowCount } = await query(
    `DELETE FROM enterprise_ip_allowlists WHERE id=$1 AND org_id=$2`,
    [entryId, orgId]
  );
  _cache.delete(orgId);
  return { deleted: !!rowCount };
}

export async function listEntries(orgId) {
  const { rows } = await query(
    `SELECT * FROM enterprise_ip_allowlists WHERE org_id=$1 ORDER BY created_at DESC`,
    [orgId]
  );
  return rows;
}

/**
 * Check if an IP address is allowed for an org.
 * Returns true if no allowlist exists (allowlist is opt-in).
 */
export async function isAllowed(orgId, ip) {
  const entries = await _cachedEntries(orgId);
  if (entries.length === 0) return true; // no allowlist = all IPs allowed
  return entries.some(e => e.enabled && _ipMatchesCIDR(ip, e.cidr));
}

/**
 * Express middleware — blocks requests from non-allowed IPs.
 * Only enforces when the org has at least one allowlist entry.
 */
export function ipAllowlistMiddleware(getOrgId) {
  return async (req, res, next) => {
    try {
      const orgId = typeof getOrgId === 'function' ? getOrgId(req) : req.user?.orgId;
      if (!orgId) return next();
      const ip     = req.ip ?? req.socket?.remoteAddress ?? '';
      const allowed = await isAllowed(orgId, ip);
      if (!allowed) return res.status(403).json({ error: 'IP address not permitted', code: 'IP_BLOCKED' });
      next();
    } catch (err) {
      next(err);
    }
  };
}

// ── Internal ──────────────────────────────────────────────────────────────────

async function _cachedEntries(orgId) {
  const cached = _cache.get(orgId);
  if (cached && Date.now() < cached.expiresAt) return cached.entries;
  const entries = await listEntries(orgId);
  _cache.set(orgId, { entries, expiresAt: Date.now() + CACHE_TTL_MS });
  return entries;
}

function _isValidCIDR(cidr) {
  const parts = cidr.split('/');
  if (parts.length !== 2) return _isValidIP(cidr.replace('/', '')) || false;
  const prefix = parseInt(parts[1], 10);
  return _isValidIP(parts[0]) && !isNaN(prefix) && prefix >= 0 && prefix <= 32;
}

function _isValidIP(ip) {
  return /^(\d{1,3}\.){3}\d{1,3}$/.test(ip) &&
    ip.split('.').every(o => Number(o) <= 255);
}

function _ipMatchesCIDR(ip, cidr) {
  if (!cidr.includes('/')) return ip === cidr;
  const [range, bits] = cidr.split('/');
  const mask   = ~(0xffffffff >>> parseInt(bits, 10));
  const ipInt  = _ipToInt(ip);
  const rangeInt = _ipToInt(range);
  return (ipInt & mask) === (rangeInt & mask);
}

function _ipToInt(ip) {
  return ip.split('.').reduce((acc, o) => (acc << 8) | parseInt(o, 10), 0) >>> 0;
}
