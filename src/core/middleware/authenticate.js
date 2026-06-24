/**
 * FLOW OS — JWT Authentication Middleware
 */

import jwt from 'jsonwebtoken';
import { AuthenticationError } from '../errors/index.js';

const JWT_SECRET = process.env.JWT_SECRET || 'flow-os-dev-secret-change-in-production';

export function authenticate(req, res, next) {
  // Skip for public routes
  const publicPaths = ['/api/health', '/api/auth/signup', '/api/auth/login', '/api/auth/refresh'];
  if (publicPaths.some(path => req.path.startsWith(path))) {
    return next();
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(new AuthenticationError('Missing or malformed Authorization header'));
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = {
      id: decoded.userId,
      email: decoded.email,
      role: decoded.role,
      orgId: decoded.orgId
    };
    next();
  } catch (err) {
    return next(new AuthenticationError('Invalid or expired token'));
  }
}

/**
 * Generate a signed JWT for a user.
 */
export function signToken(payload, expiresIn = '24h') {
  return jwt.sign(payload, JWT_SECRET, { expiresIn });
}

export { JWT_SECRET };
