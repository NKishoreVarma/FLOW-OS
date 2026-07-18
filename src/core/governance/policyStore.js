/**
 * FLOW OS — Policy Store
 *
 * CRUD for Policy records + a short-lived in-memory cache.
 * The evaluator calls getEffectivePolicies() on every connector action.
 * The 60-second TTL means policy changes propagate within one minute
 * without hitting PostgreSQL on every request.
 *
 * Future: Redis-backed distributed cache for multi-process deployments.
 */

import { prisma }              from '../config/prisma.js';
import { ValidationError, NotFoundError, AuthorizationError } from '../errors/index.js';

const CACHE_TTL_MS = 60_000;
const policyCache  = new Map(); // `${orgId}:${workspaceId|'*'}` → { policies, expiresAt }

// ── Cache helpers ─────────────────────────────────────────────────────────────

function cacheKey(orgId, workspaceId) {
  return `${orgId}:${workspaceId ?? '*'}`;
}

function invalidateOrgCache(orgId) {
  for (const key of policyCache.keys()) {
    if (key.startsWith(`${orgId}:`)) policyCache.delete(key);
  }
}

// ── Read ──────────────────────────────────────────────────────────────────────

/**
 * Fetch all enabled policies for an org+workspace combination.
 * Returns org-wide policies (workspaceId IS NULL) and workspace-specific ones.
 * Results are sorted by priority DESC so the evaluator can short-circuit on first match.
 *
 * @param {string} orgId
 * @param {string|null} workspaceId
 * @returns {Promise<Policy[]>}
 */
export async function getEffectivePolicies(orgId, workspaceId) {
  const key    = cacheKey(orgId, workspaceId);
  const cached = policyCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.policies;

  const policies = await prisma.policy.findMany({
    where: {
      orgId,
      enabled: true,
      OR: [
        { workspaceId: null },
        { workspaceId },
      ],
    },
    orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
  });

  policyCache.set(key, { policies, expiresAt: Date.now() + CACHE_TTL_MS });
  return policies;
}

/**
 * List policies for management UI (includes disabled policies).
 */
export async function listPolicies({ orgId, workspaceId, includeDisabled = false } = {}) {
  const where = { orgId };
  if (!includeDisabled) where.enabled = true;
  if (workspaceId !== undefined) {
    where.OR = [{ workspaceId: null }, { workspaceId }];
  }
  return prisma.policy.findMany({
    where,
    orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
  });
}

/**
 * Get a single policy by ID, scoped to orgId for tenant isolation.
 */
export async function getPolicy(id, orgId) {
  const policy = await prisma.policy.findFirst({ where: { id, orgId } });
  if (!policy) throw new NotFoundError(`Policy "${id}"`);
  return policy;
}

// ── Write ─────────────────────────────────────────────────────────────────────

/**
 * Create a new policy. Only OWNER may write policies.
 */
export async function createPolicy({
  orgId,
  workspaceId,
  connectorId,
  capability,
  actionType,
  subjectRole,
  subjectUserId,
  effect,
  conditions = {},
  priority   = 100,
  description,
  createdBy,
}) {
  const VALID_EFFECTS = ['ALLOW', 'DENY', 'REQUIRE_APPROVAL'];
  if (!VALID_EFFECTS.includes(effect)) {
    throw new ValidationError(`effect must be one of: ${VALID_EFFECTS.join(', ')}`);
  }
  if (!createdBy) throw new ValidationError('createdBy is required');

  const policy = await prisma.policy.create({
    data: {
      orgId,
      workspaceId:   workspaceId   ?? null,
      connectorId:   connectorId   ?? null,
      capability:    capability    ?? null,
      actionType:    actionType    ?? null,
      subjectRole:   subjectRole   ?? null,
      subjectUserId: subjectUserId ?? null,
      effect,
      conditions,
      priority,
      description:   description   ?? null,
      createdBy,
    },
  });

  invalidateOrgCache(orgId);
  return policy;
}

/**
 * Update an existing policy (OWNER only). Invalidates cache on change.
 */
export async function updatePolicy(id, orgId, patch) {
  await getPolicy(id, orgId); // throws NotFoundError if missing or wrong org

  const IMMUTABLE = ['id', 'orgId', 'createdBy', 'createdAt'];
  for (const key of IMMUTABLE) delete patch[key];

  const updated = await prisma.policy.update({
    where: { id },
    data:  { ...patch, updatedAt: new Date() },
  });

  invalidateOrgCache(orgId);
  return updated;
}

/**
 * Hard-delete a policy (OWNER only).
 */
export async function deletePolicy(id, orgId) {
  await getPolicy(id, orgId); // throws NotFoundError if missing or wrong org
  await prisma.policy.delete({ where: { id } });
  invalidateOrgCache(orgId);
}

/**
 * Toggle enabled/disabled without a full update.
 */
export async function togglePolicy(id, orgId, enabled) {
  await getPolicy(id, orgId);
  const updated = await prisma.policy.update({
    where: { id },
    data:  { enabled, updatedAt: new Date() },
  });
  invalidateOrgCache(orgId);
  return updated;
}
