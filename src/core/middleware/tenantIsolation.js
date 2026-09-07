/**
 * FLOW OS — Tenant Isolation Middleware
 *
 * Two responsibilities:
 *
 *   1. Require workspace-id header on all workspace-scoped routes.
 *   2. Validate the workspace belongs to req.user.orgId (cross-org guard).
 *   3. Resolve workspace-level role from WorkspaceMember join table.
 *      Falls back to org-level role if no membership record exists.
 *
 * On success:
 *   req.tenantId      = workspace externalId (safe to use in all downstream queries)
 *   req.workspace     = { id, externalId, orgId, org: { plan }, members: [{ role }] }
 *   req.workspaceRole = workspace-scoped role (or org role as fallback)
 *
 * governanceMiddleware reads req.workspace + req.workspaceRole without re-querying.
 */

import { prisma }                              from '../config/prisma.js';
import { ValidationError, AuthorizationError } from '../errors/index.js';

const EXCLUDED_PATHS = [
  '/api/health',
  '/api/auth/signup',
  '/api/auth/login',
  '/api/auth/refresh',
  '/api/org',
  '/api/orgs',
  '/api/users',
  '/api/webhook/ingest',
  '/api/ai/providers',  // infrastructure health — no workspace scoping needed
  '/api/analytics/live', // SSE endpoint — EventSource cannot send custom headers; handler re-verifies via query params
  // OAuth callbacks arrive from Google's redirect — no workspace-id header possible.
  // workspaceId is recovered from the HMAC-signed state param inside the route handler.
  '/api/communication/oauth/callback',
  '/api/meetings/oauth/callback',
  '/api/google/callback',
];

export async function tenantIsolation(req, res, next) {
  if (EXCLUDED_PATHS.some(path => req.path.startsWith(path))) {
    return next();
  }

  const workspaceId = req.headers['workspace-id'] || req.headers['x-workspace-id'];

  if (!workspaceId) {
    return next(new ValidationError('Missing workspace-id header. All requests must be tenant-scoped.'));
  }

  // If no authenticated user (shouldn't happen on protected routes), set tenantId only.
  if (!req.user) {
    req.tenantId = String(workspaceId);
    return next();
  }

  try {
    const workspace = await prisma.workspace.findFirst({
      where: {
        externalId: String(workspaceId),
        orgId:      req.user.orgId,
      },
      select: {
        id:         true,
        externalId: true,
        orgId:      true,
        org: {
          select: { plan: true },
        },
        // Resolve workspace-level role for this user in one query.
        members: {
          where:  { userId: req.user.id },
          select: { role: true },
        },
      },
    });

    if (!workspace) {
      return next(new AuthorizationError(
        `Workspace "${workspaceId}" does not belong to your organization or does not exist.`
      ));
    }

    // Workspace role takes precedence over org role for connector actions.
    // OWNER org role always passes through unchanged (no workspace membership needed).
    const workspaceRole =
      workspace.members[0]?.role ??   // explicit workspace membership
      req.user.role;                   // org role fallback

    req.tenantId      = workspace.externalId;
    req.workspace     = workspace;
    req.workspaceRole = workspaceRole;
    next();
  } catch (err) {
    next(err);
  }
}
