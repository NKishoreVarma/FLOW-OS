import { logger } from '../../utils/logger.js';
import { getRecovery } from './recoveryMap.js';

export class AppError extends Error {
  /**
   * @param {string} message
   * @param {number} statusCode
   * @param {string} code
   * @param {object|null} meta  — extra JSON included in the error response (e.g. { approvalId })
   */
  constructor(message, statusCode = 500, code = 'INTERNAL_ERROR', meta = null) {
    super(message);
    this.statusCode = statusCode;
    this.code       = code;
    this.isOperational = true;
    if (meta) this.meta = meta;
  }
}

export class AuthenticationError extends AppError {
  constructor(message = 'Authentication required') {
    super(message, 401, 'AUTHENTICATION_REQUIRED');
  }
}

export class AuthorizationError extends AppError {
  constructor(message = 'Insufficient permissions') {
    super(message, 403, 'FORBIDDEN');
  }
}

export class NotFoundError extends AppError {
  constructor(resource = 'Resource') {
    super(`${resource} not found`, 404, 'NOT_FOUND');
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Validation failed') {
    super(message, 400, 'VALIDATION_ERROR');
  }
}

export class RateLimitError extends AppError {
  constructor(message = 'Rate limit exceeded') {
    super(message, 429, 'RATE_LIMITED');
  }
}

/**
 * Express error-handling middleware.
 * Mount as the LAST middleware in the chain.
 */
export function errorHandler(err, req, res, _next) {
  const statusCode = err.statusCode || 500;
  const code       = err.code       || 'INTERNAL_ERROR';
  const requestId  = req.headers['x-request-id'];

  if (!err.isOperational) {
    logger.error(`Unhandled error on ${req.method} ${req.path}`, {
      code,
      statusCode,
      requestId,
      error: err.message,
      stack: err.stack,
    });
  }

  const IS_PRODUCTION = process.env.NODE_ENV === 'production';

  const recovery = getRecovery(code);

  res.status(statusCode).json({
    error: {
      code,
      message: err.message,
      ...(recovery ? {
        userMessage: recovery.userMessage,
        recoverySteps: recovery.recoverySteps,
        ...(recovery.selfServeAction ? { selfServeAction: recovery.selfServeAction } : {}),
      } : {}),
      ...(err.meta ? { meta: err.meta } : {}),
      ...(requestId ? { requestId } : {}),
      ...(!IS_PRODUCTION ? { stack: err.stack } : {}),
    },
  });
}
