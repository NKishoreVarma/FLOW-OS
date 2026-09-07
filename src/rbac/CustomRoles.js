/**
 * CustomRoles — Module 5 (Advanced RBAC)
 *
 * CRUD for custom organization roles with permission inheritance.
 */

import { query }                           from '../config/db.js';
import { AppError, ValidationError }       from '../core/errors/index.js';
import { invalidatePermissionCache }       from './PermissionEngine.js';
import { SYSTEM_ROLES, SCOPE_HIERARCHY }   from './PermissionEngine.js';

// ── Public API ────────────────────────────────────────────────────────────────

export async function createRole(orgId, data) {
  const { name, displayName, description, parentRole, scope = 'org', permissions = [] } = data;
  if (!name || !displayName) throw new ValidationError('name and displayName are required');
  if (SYSTEM_ROLES[name.toUpperCase()]) throw new ValidationError(`${name} is a reserved system role`);
  if (!SCOPE_HIERARCHY.includes(scope)) throw new ValidationError(`Invalid scope. Must be one of: ${SCOPE_HIERARCHY.join(', ')}`);
  if (parentRole) {
    const exists = await getRoleByName(orgId, parentRole);
    if (!exists && !SYSTEM_ROLES[parentRole.toUpperCase()]) throw new ValidationError(`Parent role '${parentRole}' not found`);
  }

  const { rows } = await query(
    `INSERT INTO enterprise_roles (org_id, name, display_name, description, parent_role, scope, permissions)
     VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb) RETURNING *`,
    [orgId, name, displayName, description ?? null, parentRole ?? null, scope, JSON.stringify(permissions)]
  );
  return rows[0];
}

export async function listRoles(orgId) {
  const { rows } = await query(
    `SELECT * FROM enterprise_roles WHERE org_id=$1 ORDER BY name`,
    [orgId]
  );
  return rows;
}

export async function getRole(orgId, roleId) {
  const { rows } = await query(
    `SELECT * FROM enterprise_roles WHERE id=$1 AND org_id=$2`,
    [roleId, orgId]
  );
  if (!rows[0]) throw new AppError('Role not found', 404, 'ROLE_NOT_FOUND');
  return rows[0];
}

export async function getRoleByName(orgId, name) {
  const { rows } = await query(
    `SELECT * FROM enterprise_roles WHERE name=$1 AND org_id=$2`,
    [name, orgId]
  );
  return rows[0] ?? null;
}

export async function updateRole(orgId, roleId, updates) {
  const role = await getRole(orgId, roleId);
  if (role.is_system_role) throw new ValidationError('System roles cannot be modified');

  const allowed = ['display_name','description','parent_role','permissions'];
  const sets = [], vals = [];
  for (const [k, v] of Object.entries(updates)) {
    const col = _camel(k);
    if (!allowed.includes(col)) continue;
    const val = col === 'permissions' ? JSON.stringify(v) : v;
    sets.push(`${col} = $${vals.push(val)}`);
  }
  if (!sets.length) throw new ValidationError('No valid fields to update');
  sets.push('updated_at = NOW()');

  const { rows } = await query(
    `UPDATE enterprise_roles SET ${sets.join(', ')}
     WHERE id = $${vals.push(roleId)} AND org_id = $${vals.push(orgId)} RETURNING *`,
    vals
  );
  return rows[0];
}

export async function deleteRole(orgId, roleId) {
  const role = await getRole(orgId, roleId);
  if (role.is_system_role) throw new ValidationError('System roles cannot be deleted');
  await query('DELETE FROM enterprise_roles WHERE id=$1 AND org_id=$2', [roleId, orgId]);
  return { deleted: true };
}

export async function assignRole(orgId, userId, roleId, { scopeType = 'org', scopeId = null, grantedBy = null, expiresAt = null } = {}) {
  await getRole(orgId, roleId); // verify role exists
  const { rows } = await query(
    `INSERT INTO enterprise_role_assignments
       (org_id, user_id, role_id, scope_type, scope_id, granted_by, expires_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT DO NOTHING RETURNING *`,
    [orgId, userId, roleId, scopeType, scopeId, grantedBy, expiresAt]
  );
  invalidatePermissionCache(userId);
  return rows[0] ?? { alreadyAssigned: true };
}

export async function revokeRole(orgId, userId, roleId) {
  await query(
    `DELETE FROM enterprise_role_assignments WHERE org_id=$1 AND user_id=$2 AND role_id=$3`,
    [orgId, userId, roleId]
  );
  invalidatePermissionCache(userId);
  return { revoked: true };
}

export async function getUserRoles(orgId, userId) {
  const { rows } = await query(
    `SELECT ra.*, r.name, r.display_name, r.scope, r.permissions
     FROM enterprise_role_assignments ra
     JOIN enterprise_roles r ON r.id = ra.role_id
     WHERE ra.org_id=$1 AND ra.user_id=$2
       AND (ra.expires_at IS NULL OR ra.expires_at > NOW())`,
    [orgId, userId]
  );
  return rows;
}

function _camel(s) {
  return s.replace(/([A-Z])/g, m => `_${m.toLowerCase()}`);
}
