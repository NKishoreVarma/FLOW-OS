/**
 * orgResolver — resolves a workspaceId → organizationId with an in-process cache.
 *
 * Extracted so both the publisher and replay paths share one implementation
 * (previously duplicated inside Phase 9.4 EventPipeline).
 */

import { logger } from '../utils/logger.js';

const _cache = new Map();

export async function resolveOrgId(workspaceId) {
  if (!workspaceId) return null;
  const key = String(workspaceId);
  if (_cache.has(key)) return _cache.get(key);
  try {
    const { prisma } = await import('../core/config/prisma.js');
    const ws = await prisma.workspace.findFirst({
      where:  { externalId: key },
      select: { orgId: true },
    });
    if (ws?.orgId) {
      _cache.set(key, ws.orgId);
      return ws.orgId;
    }
  } catch (err) {
    logger.rag(`[orgResolver] ${err.message}`);
  }
  return null;
}
