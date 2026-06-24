/**
 * FLOW OS — RBAC Authorization Middleware
 * 
 * Usage: authorize('ADMIN', 'OWNER') — allows only those roles through.
 */

import { AuthorizationError } from '../errors/index.js';

export function authorize(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return next(new AuthorizationError('Authentication required before authorization'));
    }

    if (!allowedRoles.includes(req.user.role)) {
      return next(new AuthorizationError(`Role '${req.user.role}' cannot access this resource`));
    }

    next();
  };
}
