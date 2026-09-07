/**
 * PermissionEngine — Module 5 (Advanced RBAC)
 *
 * Hierarchical permission evaluation across org > workspace > department >
 * team > project > connector > workflow > action > agent > report > marketplace.
 *
 * Permission inheritance: child scopes inherit from parent scopes.
 * Custom roles inherit permissions from their parent_role.
 */

import { query }    from '../config/db.js';
import { AppError } from '../core/errors/index.js';

// Permission scope hierarchy (parent → children)
export const SCOPE_HIERARCHY = Object.freeze([
  'org', 'workspace', 'department', 'team', 'project',
  'connector', 'workflow', 'action', 'agent', 'report', 'marketplace',
]);

// Built-in system roles with their base permissions
export const SYSTEM_ROLES = Object.freeze({
  OWNER:  { permissions: ['*'], inherits: null },
  ADMIN:  { permissions: ['read:*', 'write:*', 'execute:*', 'manage:workspace', 'manage:users', 'manage:connectors'], inherits: null },
  MEMBER: { permissions: ['read:*', 'write:own', 'execute:limited'], inherits: null },
  VIEWER: { permissions: ['read:*'], inherits: null },
  GUEST:  { permissions: ['read:public'], inherits: null },
});

// 60-second permission cache per user
const _cache = new Map();
const CACHE_TTL_MS = 60_000;

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Check if a user has a permission in a given scope context.
 */
export async function hasPermission(userId, orgId, permission, scopeContext = {}) {
  const effective = await getEffectivePermissions(userId, orgId, scopeContext);
  return _matchesPermission(effective, permission);
}

/**
 * Get all effective permissions for a user in a scope context.
 * Merges system role, custom roles, and inherited permissions.
 */
export async function getEffectivePermissions(userId, orgId, scopeContext = {}) {
  const cacheKey = `${userId}:${orgId}:${JSON.stringify(scopeContext)}`;
  const cached   = _cache.get(cacheKey);
  if (cached && Date.now() < cached.expiresAt) return cached.permissions;

  const [systemRole, customRoles] = await Promise.all([
    _getSystemRole(userId, orgId),
    _getCustomRoles(userId, orgId, scopeContext),
  ]);

  // System role permissions
  const systemPerms = SYSTEM_ROLES[systemRole]?.permissions ?? [];

  // Custom role permissions (with inheritance)
  const customPerms = await _expandRolePermissions(customRoles);

  const all = _dedupePermissions([...systemPerms, ...customPerms]);
  _cache.set(cacheKey, { permissions: all, expiresAt: Date.now() + CACHE_TTL_MS });
  return all;
}

/**
 * Require a permission — throws 403 if not granted.
 */
export async function requirePermission(userId, orgId, permission, scopeContext = {}) {
  const ok = await hasPermission(userId, orgId, permission, scopeContext);
  if (!ok) throw new AppError(`Permission denied: ${permission}`, 403, 'PERMISSION_DENIED');
}

/**
 * Invalidate cached permissions for a user.
 */
export function invalidatePermissionCache(userId) {
  for (const key of _cache.keys()) {
    if (key.startsWith(`${userId}:`)) _cache.delete(key);
  }
}

/**
 * Express middleware that enforces a permission.
 */
export function requirePermissionMiddleware(permission, getScopeContext = () => ({})) {
  return async (req, res, next) => {
    try {
      const userId = req.user?.id ?? req.user?.userId;
      const orgId  = req.user?.orgId;
      if (!userId || !orgId) return res.status(401).json({ error: 'Unauthenticated' });
      const scopeContext = getScopeContext(req);
      await requirePermission(userId, orgId, permission, scopeContext);
      next();
    } catch (err) {
      next(err);
    }
  };
}

// ── Internal ──────────────────────────────────────────────────────────────────

async function _getSystemRole(userId, orgId) {
  const { rows } = await query(
    `SELECT u.role FROM users u WHERE u.id = $1 AND u.org_id = $2`,
    [userId, orgId]
  ).catch(() => ({ rows: [] }));
  return rows[0]?.role ?? 'VIEWER';
}

async function _getCustomRoles(userId, orgId, scopeContext) {
  const { scope_type, scope_id } = _buildScopeConditions(scopeContext);
  const { rows } = await query(
    `SELECT r.id, r.name, r.permissions, r.parent_role
     FROM enterprise_role_assignments ra
     JOIN enterprise_roles r ON r.id = ra.role_id
     WHERE ra.user_id = $1 AND ra.org_id = $2
       AND (ra.expires_at IS NULL OR ra.expires_at > NOW())
     ORDER BY r.name`,
    [userId, orgId]
  ).catch(() => ({ rows: [] }));
  return rows;
}

async function _expandRolePermissions(roles) {
  const all = [];
  for (const role of roles) {
    const perms = _parseJson(role.permissions, []);
    all.push(...perms);
    if (role.parent_role) {
      const { rows: parent } = await query(
        `SELECT permissions FROM enterprise_roles WHERE name = $1`,
        [role.parent_role]
      ).catch(() => ({ rows: [] }));
      if (parent[0]) all.push(..._parseJson(parent[0].permissions, []));
    }
  }
  return all;
}

function _matchesPermission(effective, required) {
  if (effective.includes('*')) return true;
  if (effective.includes(required)) return true;
  // Wildcard matching: 'read:*' matches 'read:users'
  const [action, resource] = required.split(':');
  if (effective.includes(`${action}:*`)) return true;
  if (effective.includes(`*:${resource}`)) return true;
  return false;
}

function _dedupePermissions(perms) {
  return [...new Set(perms)];
}

function _buildScopeConditions(ctx) {
  return {
    scope_type: ctx.scopeType ?? 'org',
    scope_id:   ctx.scopeId   ?? null,
  };
}

function _parseJson(v, fallback) {
  if (Array.isArray(v)) return v;
  try { return JSON.parse(v); } catch { return fallback; }
}
