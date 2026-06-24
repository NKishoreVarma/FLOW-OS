/**
 * FLOW OS — User Management Service
 */

import bcrypt from 'bcryptjs';
import { prisma } from '../../core/config/prisma.js';
import { eventBus } from '../../core/events/eventBus.js';
import { ValidationError, NotFoundError } from '../../core/errors/index.js';

const SALT_ROUNDS = 12;

/**
 * List all users in the organization.
 */
export async function listUsers(orgId) {
  return prisma.user.findMany({
    where: { orgId },
    select: {
      id: true,
      email: true,
      fullName: true,
      role: true,
      isActive: true,
      lastLogin: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
  });
}

/**
 * Get a single user by ID (scoped to org).
 */
export async function getUser(orgId, userId) {
  const user = await prisma.user.findFirst({
    where: { id: userId, orgId },
    select: {
      id: true,
      email: true,
      fullName: true,
      role: true,
      isActive: true,
      lastLogin: true,
      createdAt: true,
    },
  });

  if (!user) throw new NotFoundError('User');
  return user;
}

/**
 * Invite a new user to the organization.
 */
export async function inviteUser(orgId, { email, fullName, role = 'MEMBER', password }) {
  if (!email || !fullName || !password) {
    throw new ValidationError('email, fullName, and password are required');
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw new ValidationError('Email already registered');

  const validRoles = ['ADMIN', 'MEMBER', 'VIEWER'];
  if (!validRoles.includes(role)) {
    throw new ValidationError(`Invalid role. Allowed: ${validRoles.join(', ')}`);
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

  const user = await prisma.user.create({
    data: { email, fullName, passwordHash, role, orgId },
    select: {
      id: true,
      email: true,
      fullName: true,
      role: true,
      createdAt: true,
    },
  });

  eventBus.emit('USER_INVITED', { orgId, userId: user.id, role });
  return user;
}

/**
 * Update a user's role or active status.
 */
export async function updateUser(orgId, userId, data) {
  // Ensure user belongs to this org
  const existing = await prisma.user.findFirst({ where: { id: userId, orgId } });
  if (!existing) throw new NotFoundError('User');

  // Cannot demote the last OWNER
  if (existing.role === 'OWNER' && data.role && data.role !== 'OWNER') {
    const ownerCount = await prisma.user.count({ where: { orgId, role: 'OWNER' } });
    if (ownerCount <= 1) {
      throw new ValidationError('Cannot demote the last owner of the organization');
    }
  }

  const user = await prisma.user.update({
    where: { id: userId },
    data: {
      ...(data.role && { role: data.role }),
      ...(typeof data.isActive === 'boolean' && { isActive: data.isActive }),
      ...(data.fullName && { fullName: data.fullName }),
    },
    select: {
      id: true,
      email: true,
      fullName: true,
      role: true,
      isActive: true,
    },
  });

  eventBus.emit('USER_UPDATED', { orgId, userId });
  return user;
}

/**
 * Remove a user from the organization.
 */
export async function removeUser(orgId, userId) {
  const existing = await prisma.user.findFirst({ where: { id: userId, orgId } });
  if (!existing) throw new NotFoundError('User');

  if (existing.role === 'OWNER') {
    const ownerCount = await prisma.user.count({ where: { orgId, role: 'OWNER' } });
    if (ownerCount <= 1) {
      throw new ValidationError('Cannot remove the last owner of the organization');
    }
  }

  await prisma.user.delete({ where: { id: userId } });
  eventBus.emit('USER_REMOVED', { orgId, userId });
}
