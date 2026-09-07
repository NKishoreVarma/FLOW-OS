/**
 * FLOW OS — JWT Authentication Middleware
 */

import jwt from 'jsonwebtoken';
import { AuthenticationError } from '../errors/index.js';

// validateEnv() guarantees JWT_SECRET is present and meets length requirements before this module loads.
const JWT_SECRET = process.env.JWT_SECRET;

export function authenticate(req, res, next) {
  const publicPaths = [
    '/api/health',
    '/api/auth/signup',
    '/api/auth/login',
    '/api/auth/refresh',
    '/api/analytics/live',
    // OAuth callbacks arrive from Google's redirect — they carry a signed state param
    // (HMAC-SHA256 via GoogleOAuthService.verifyState) instead of a JWT.
    // No Authorization header is possible on an external redirect.
    '/api/communication/oauth/callback',
    '/api/meetings/oauth/callback',
    '/api/google/callback',
  ];
  if (publicPaths.some(p => req.path.startsWith(p))) {
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
