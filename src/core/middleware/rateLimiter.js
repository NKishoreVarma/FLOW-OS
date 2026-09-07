import { RateLimitError } from '../errors/index.js';

const buckets = new Map();

const DEFAULT_MAX    = 200;
const DEFAULT_WINDOW = 60;

// Evict expired buckets every 5 minutes to prevent unbounded memory growth.
setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (now - bucket.start > bucket.windowMs * 2) buckets.delete(key);
  }
}, 5 * 60 * 1000).unref();

export function rateLimiter({ max = DEFAULT_MAX, windowSec = DEFAULT_WINDOW } = {}) {
  return (req, res, next) => {
    // Prefer workspace-id for per-tenant isolation; fall back to API key then IP.
    const key = req.headers['workspace-id'] || req.headers['x-api-key'] || req.ip;
    const now = Date.now();
    const windowMs = windowSec * 1000;

    let bucket = buckets.get(key);
    if (!bucket || now - bucket.start > windowMs) {
      bucket = { start: now, count: 0, windowMs };
      buckets.set(key, bucket);
    }

    bucket.count++;

    const remaining = Math.max(0, max - bucket.count);
    res.setHeader('X-RateLimit-Limit', max);
    res.setHeader('X-RateLimit-Remaining', remaining);
    res.setHeader('X-RateLimit-Reset', Math.ceil((bucket.start + windowMs) / 1000));

    if (bucket.count > max) {
      return next(new RateLimitError(`Rate limit exceeded: ${max} requests per ${windowSec}s per tenant.`));
    }

    next();
  };
}
