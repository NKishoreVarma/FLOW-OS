/**
 * FLOW OS — Organization Management Service
 */

import { prisma } from '../../core/config/prisma.js';
import { eventBus } from '../../core/events/eventBus.js';
import { ValidationError, NotFoundError } from '../../core/errors/index.js';

/**
 * Get the org the authenticated user belongs to.
 */
export async function getOrganization(orgId) {
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    include: {
      workspaces: true,
      _count: { select: { users: true } },
    },
  });

  if (!org) throw new NotFoundError('Organization');
  return org;
}

/**
 * Update organization metadata.
 */
export async function updateOrganization(orgId, data) {
  const org = await prisma.organization.update({
    where: { id: orgId },
    data: {
      name: data.name,
      plan: data.plan,
    },
  });

  eventBus.emit('ORG_UPDATED', { orgId });
  return org;
}

/**
 * Create a new workspace inside the org.
 */
export async function createWorkspace(orgId, { name }) {
  if (!name) throw new ValidationError('Workspace name is required');

  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

  const workspace = await prisma.workspace.create({
    data: {
      name,
      orgId,
      externalId: `workspace_${slug}_${Date.now().toString(36)}`,
    },
  });

  eventBus.emit('WORKSPACE_CREATED', { orgId, workspaceId: workspace.externalId });
  return workspace;
}

/**
 * List all workspaces for an org.
 */
export async function listWorkspaces(orgId) {
  return prisma.workspace.findMany({
    where: { orgId },
    include: {
      _count: { select: { integrations: true, agents: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
}
