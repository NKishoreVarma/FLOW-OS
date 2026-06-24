/**
 * FLOW OS — Tenant Isolation Middleware
 * 
 * Extracts workspace-id from request headers and attaches it to req.tenantId.
 * All downstream services use req.tenantId for data scoping.
 * 
 * Backward-compatible with our existing header-based workspace isolation.
 */

import { ValidationError } from '../errors/index.js';

const EXCLUDED_PATHS = [
  '/api/health',
  '/api/auth/signup',
  '/api/auth/login',
  '/api/auth/refresh'
];

export function tenantIsolation(req, res, next) {
  // Skip tenant check for public routes
  if (EXCLUDED_PATHS.some(path => req.path.startsWith(path))) {
    return next();
  }

  const workspaceId = req.headers['workspace-id'] || req.headers['x-workspace-id'];

  if (!workspaceId) {
    return next(new ValidationError('Missing workspace-id header. All requests must be tenant-scoped.'));
  }

  req.tenantId = String(workspaceId);
  next();
}
