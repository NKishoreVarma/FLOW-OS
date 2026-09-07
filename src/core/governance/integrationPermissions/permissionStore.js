/**
 * FLOW OS — Integration Permission Store (Phase 13.1)
 *
 * CRUD over integration_permissions + integration_permission_settings, with a
 * short-lived in-memory cache. The gate calls loadPermissionMap() for every item
 * that flows through a sync, so the 60s TTL keeps PostgreSQL out of the hot path
 * while permission changes still propagate within a minute.
 *
 * Same cache shape and TTL as core/governance/policyStore.js.
 *
 * Future: Redis-backed cache for multi-process deployments.
 */

import { prisma } from '../../config/prisma.js';
import { logger } from '../../../utils/logger.js';
import { getResourceTypes, isGoverned } from './resourceTypes.js';

const CACHE_TTL_MS = 60_000;

// `${workspaceId}:${connector}` → { map, settings, expiresAt }
const permissionCache = new Map();

function cacheKey(workspaceId, connector) {
  return `${workspaceId}:${connector}`;
}

export function invalidate(workspaceId, connector) {
  permissionCache.delete(cacheKey(workspaceId, connector));
}

export function invalidateWorkspace(workspaceId) {
  for (const key of permissionCache.keys()) {
    if (key.startsWith(`${workspaceId}:`)) permissionCache.delete(key);
  }
}

/** Test seam — the validation harness needs a cold cache between assertions. */
export function clearCache() {
  permissionCache.clear();
}

// ── Settings ──────────────────────────────────────────────────────────────────

export async function getSettings(workspaceId, connector) {
  const existing = await prisma.integrationPermissionSetting.findUnique({
    where: { workspaceId_connector: { workspaceId, connector } },
  });
  if (existing) return existing;

  return {
    workspaceId,
    connector,
    autoAllowNew:        false,
    dmPolicy:            'NEVER',
    legacyGrandfathered: false,
    lastDiscoveredAt:    null,
  };
}

export async function updateSettings(workspaceId, connector, patch = {}) {
  const data = {};
  if (typeof patch.autoAllowNew === 'boolean')        data.autoAllowNew = patch.autoAllowNew;
  if (typeof patch.dmPolicy === 'string')             data.dmPolicy = patch.dmPolicy;
  if (typeof patch.legacyGrandfathered === 'boolean') data.legacyGrandfathered = patch.legacyGrandfathered;
  if (patch.lastDiscoveredAt)                         data.lastDiscoveredAt = patch.lastDiscoveredAt;

  const row = await prisma.integrationPermissionSetting.upsert({
    where:  { workspaceId_connector: { workspaceId, connector } },
    update: data,
    create: { workspaceId, connector, ...data },
  });

  invalidate(workspaceId, connector);
  return row;
}

// ── Read ──────────────────────────────────────────────────────────────────────

/**
 * Load the full permission map for a workspace+connector.
 *
 * @returns {Promise<{ map: Map<string, {allowed: boolean, resourceType: string, resourceName: string}>, settings: object }>}
 *          map is keyed by resourceId (provider-native ids are unique per connector)
 */
export async function loadPermissionMap(workspaceId, connector) {
  const key    = cacheKey(workspaceId, connector);
  const cached = permissionCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return { map: cached.map, settings: cached.settings };
  }

  const [rows, settings] = await Promise.all([
    prisma.integrationPermission.findMany({ where: { workspaceId, connector } }),
    getSettings(workspaceId, connector),
  ]);

  const map = new Map();
  for (const row of rows) {
    map.set(row.resourceId, {
      allowed:      row.allowed,
      resourceType: row.resourceType,
      resourceName: row.resourceName,
    });
  }

  permissionCache.set(key, { map, settings, expiresAt: Date.now() + CACHE_TTL_MS });
  return { map, settings };
}

export async function listResources(workspaceId, connector, { q, allowed, resourceType } = {}) {
  const where = { workspaceId, connector };
  if (typeof allowed === 'boolean') where.allowed = allowed;
  if (resourceType)                 where.resourceType = resourceType;
  if (q)                            where.resourceName = { contains: q, mode: 'insensitive' };

  return prisma.integrationPermission.findMany({
    where,
    orderBy: [{ resourceType: 'asc' }, { resourceName: 'asc' }],
  });
}

/** Counts for the dashboard cards: total / allowed / hidden, per connector. */
export async function getSummary(workspaceId, connector) {
  const grouped = await prisma.integrationPermission.groupBy({
    by:    ['allowed'],
    where: { workspaceId, connector },
    _count: { _all: true },
  });

  const allowed = grouped.find(g => g.allowed === true)?._count._all ?? 0;
  const hidden  = grouped.find(g => g.allowed === false)?._count._all ?? 0;

  return { total: allowed + hidden, allowed, hidden };
}

// ── Write ─────────────────────────────────────────────────────────────────────

/**
 * Upsert a freshly discovered catalog.
 *
 * Existing rows keep their `allowed` flag — re-discovering must never silently
 * re-open a resource an admin has hidden. New rows default to `defaultAllowed`,
 * which is false (deny-by-default) except on the first discovery of a
 * grandfathered connector (see the v13 migration).
 *
 * @param {Array<{resourceType,resourceId,resourceName,parentId?,metadata?}>} resources
 */
export async function upsertDiscovered(workspaceId, connector, resources, { defaultAllowed = false } = {}) {
  let created = 0;
  let updated = 0;

  for (const r of resources) {
    const result = await prisma.integrationPermission.upsert({
      where: {
        workspaceId_connector_resourceType_resourceId: {
          workspaceId,
          connector,
          resourceType: r.resourceType,
          resourceId:   String(r.resourceId),
        },
      },
      // Refresh display data only. `allowed` is deliberately absent.
      update: {
        resourceName: r.resourceName,
        parentId:     r.parentId ?? null,
        metadata:     r.metadata ?? {},
        discoveredAt: new Date(),
      },
      create: {
        workspaceId,
        connector,
        resourceType: r.resourceType,
        resourceId:   String(r.resourceId),
        resourceName: r.resourceName,
        parentId:     r.parentId ?? null,
        metadata:     r.metadata ?? {},
        allowed:      defaultAllowed,
      },
      select: { createdAt: true, updatedAt: true },
    });

    if (result.createdAt.getTime() === result.updatedAt.getTime()) created++;
    else updated++;
  }

  invalidate(workspaceId, connector);
  logger.security(
    `integrationPermissions: discovered ${resources.length} ${connector} resources for ${workspaceId} ` +
    `(${created} new, default ${defaultAllowed ? 'ALLOWED' : 'HIDDEN'})`,
  );

  return { created, updated, total: resources.length };
}

/**
 * Apply a bulk permission change.
 * @param {Array<{resourceType,resourceId,allowed}>} changes
 */
export async function setAllowed(workspaceId, connector, changes, { userId = null } = {}) {
  const applied = [];

  for (const c of changes) {
    const row = await prisma.integrationPermission.update({
      where: {
        workspaceId_connector_resourceType_resourceId: {
          workspaceId,
          connector,
          resourceType: c.resourceType,
          resourceId:   String(c.resourceId),
        },
      },
      data: { allowed: !!c.allowed, updatedBy: userId },
    }).catch(() => null); // a resource that vanished from the provider is not an error

    if (row) {
      applied.push({
        resourceType: row.resourceType,
        resourceId:   row.resourceId,
        resourceName: row.resourceName,
        allowed:      row.allowed,
      });
    }
  }

  invalidate(workspaceId, connector);
  return applied;
}

/** Bulk allow/hide every resource of a connector (optionally one type). */
export async function setAllForConnector(workspaceId, connector, allowed, { resourceType = null, userId = null } = {}) {
  const where = { workspaceId, connector };
  if (resourceType) where.resourceType = resourceType;

  const { count } = await prisma.integrationPermission.updateMany({
    where,
    data: { allowed: !!allowed, updatedBy: userId },
  });

  invalidate(workspaceId, connector);
  return { count };
}

/** Stamp lastSyncedAt so the UI can show "never synced" vs "synced 2m ago". */
export async function markSynced(workspaceId, connector, resourceIds = []) {
  if (!resourceIds.length) return;

  await prisma.integrationPermission.updateMany({
    where: { workspaceId, connector, resourceId: { in: resourceIds.map(String) } },
    data:  { lastSyncedAt: new Date() },
  });
}

/** Which governed connectors have a permission catalog in this workspace. */
export async function listConfiguredConnectors(workspaceId) {
  const rows = await prisma.integrationPermission.groupBy({
    by:    ['connector'],
    where: { workspaceId },
    _count: { _all: true },
  });
  return rows.filter(r => isGoverned(r.connector)).map(r => r.connector);
}

/** Resource types declared by the taxonomy but absent from the catalog. */
export async function getMissingTypes(workspaceId, connector) {
  const rows = await prisma.integrationPermission.groupBy({
    by:    ['resourceType'],
    where: { workspaceId, connector },
  });
  const present = new Set(rows.map(r => r.resourceType));
  return getResourceTypes(connector).map(t => t.type).filter(t => !present.has(t));
}
