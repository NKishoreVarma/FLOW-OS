/**
 * FLOW OS — Authentication Service
 */

import bcrypt from 'bcryptjs';
import { prisma } from '../../core/config/prisma.js';
import { signToken } from '../../core/middleware/authenticate.js';
import { eventBus } from '../../core/events/eventBus.js';
import { ValidationError, AuthenticationError } from '../../core/errors/index.js';

const SALT_ROUNDS = 12;

/**
 * Register a new user and create their organization.
 */
export async function signup({ email, password, fullName, orgName }) {
  if (!email || !password || !fullName || !orgName) {
    throw new ValidationError('email, password, fullName, and orgName are required');
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    throw new ValidationError('Email already registered');
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  const slug = orgName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

  // Transaction: create org + workspace + user atomically
  const result = await prisma.$transaction(async (tx) => {
    const org = await tx.organization.create({
      data: {
        name: orgName,
        slug: `${slug}-${Date.now().toString(36)}`,
      },
    });

    // Auto-create a default workspace
    const workspace = await tx.workspace.create({
      data: {
        name: `${orgName} HQ`,
        orgId: org.id,
        externalId: `workspace_${slug}_${Date.now().toString(36)}`,
      },
    });

    const user = await tx.user.create({
      data: {
        email,
        passwordHash,
        fullName,
        role: 'OWNER',
        orgId: org.id,
      },
    });

    return { org, workspace, user };
  });

  const token = signToken({
    userId: result.user.id,
    email: result.user.email,
    role: result.user.role,
    orgId: result.org.id,
  });

  eventBus.emit('USER_SIGNUP', {
    userId: result.user.id,
    orgId: result.org.id,
    workspaceId: result.workspace.externalId,
  });

  return {
    token,
    user: {
      id: result.user.id,
      email: result.user.email,
      fullName: result.user.fullName,
      role: result.user.role,
    },
    organization: {
      id: result.org.id,
      name: result.org.name,
      slug: result.org.slug,
    },
    workspace: {
      id: result.workspace.id,
      externalId: result.workspace.externalId,
    },
  };
}

/**
 * Authenticate an existing user.
 */
export async function login({ email, password }) {
  if (!email || !password) {
    throw new ValidationError('email and password are required');
  }

  const user = await prisma.user.findUnique({
    where: { email },
    include: { org: true },
  });

  if (!user || !user.isActive) {
    throw new AuthenticationError('Invalid credentials');
  }

  const isValid = await bcrypt.compare(password, user.passwordHash);
  if (!isValid) {
    throw new AuthenticationError('Invalid credentials');
  }

  // Update last login
  await prisma.user.update({
    where: { id: user.id },
    data: { lastLogin: new Date() },
  });

  const token = signToken({
    userId: user.id,
    email: user.email,
    role: user.role,
    orgId: user.orgId,
  });

  eventBus.emit('USER_LOGIN', { userId: user.id, orgId: user.orgId });

  return {
    token,
    user: {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
    },
    organization: {
      id: user.org.id,
      name: user.org.name,
    },
  };
}
