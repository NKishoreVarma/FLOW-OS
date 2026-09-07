/**
 * FLOW OS — Governance Middleware
 *
 * Attaches governance context to req after workspace validation resolves.
 * Downstream code (execution engine, route handlers) reads req.govContext.
 *
 * Sprint 5.3-B: uses req.workspaceRole (workspace-scoped role from WorkspaceMember)
 * instead of the org-level role from JWT, giving per-workspace permission control.
 *
 * This middleware makes NO authorization decisions.
 * permissionEvaluator is the decision authority.
 */

import { PLAN_CAPABILITY_GATES } from './constants.js';

const SKIP_PATHS = [
  '/api/health',
  '/api/auth/',
  '/dev-dashboard',
  '/api/dev/',
];

export function governanceMiddleware(req, _res, next) {
  if (SKIP_PATHS.some(p => req.path.startsWith(p))) {
    return next();
  }

  if (!req.user) {
    return next();
  }

  const orgPlan = req.workspace?.org?.plan ?? 'free';

  // req.workspaceRole is set by tenantIsolation when a workspace is resolved.
  // Falls back to org role (req.user.role) for non-workspace routes.
  const role = req.workspaceRole ?? req.user.role;

  req.govContext = {
    role,
    orgId:       req.user.orgId,
    userId:      req.user.id,
    workspaceId: req.tenantId ?? null,
    orgPlan,
    planGate:    PLAN_CAPABILITY_GATES[orgPlan] ?? PLAN_CAPABILITY_GATES.free,
  };

  next();
}
