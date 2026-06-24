/**
 * FLOW OS — In-Memory Rate Limiter Middleware
 * 
 * Token-bucket per IP. Enterprise-grade would use Redis,
 * but this is sufficient for the foundation phase.
 */

import { RateLimitError } from '../errors/index.js';

const buckets = new Map();

const DEFAULT_MAX = 100;    // requests
const DEFAULT_WINDOW = 60;  // seconds

export function rateLimiter({ max = DEFAULT_MAX, windowSec = DEFAULT_WINDOW } = {}) {
  return (req, res, next) => {
    const key = req.headers['x-api-key'] || req.ip;
    const now = Date.now();
    const windowMs = windowSec * 1000;

    let bucket = buckets.get(key);

    if (!bucket || now - bucket.start > windowMs) {
      bucket = { start: now, count: 0 };
      buckets.set(key, bucket);
    }

    bucket.count++;

    res.setHeader('X-RateLimit-Limit', max);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, max - bucket.count));

    if (bucket.count > max) {
      return next(new RateLimitError(`Rate limit exceeded. Max ${max} requests per ${windowSec}s.`));
    }

    next();
  };
}
