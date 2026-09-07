/**
 * requestLogger — one structured log line per request on completion, carrying the
 * correlation id, method/path/status, duration, and (when known) workspace + user.
 * 5xx logs at error, 4xx or slow (>1s) at warn, else info. Skips the health
 * probes to avoid flooding the log with liveness/readiness checks.
 */

import { logger } from '../../utils/logger.js';

const SKIP = new Set(['/health/live', '/health/ready']);

export function requestLogger(req, res, next) {
  if (SKIP.has(req.path)) return next();
  const start = Date.now();
  res.on('finish', () => {
    const meta = {
      requestId: req.id,
      method: req.method,
      path: req.path,
      status: res.statusCode,
      durationMs: Date.now() - start,
      workspaceId: req.headers['workspace-id'] || undefined,
      userId: req.user?.id || undefined,
    };
    if (res.statusCode >= 500) logger.error('request', meta);
    else if (res.statusCode >= 400 || meta.durationMs > 1000) logger.warn('request', meta);
    else logger.info('request', meta);
  });
  next();
}
