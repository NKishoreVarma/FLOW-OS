/**
 * LogPipeline — Module 7 (Enterprise Observability)
 *
 * Structured log pipeline: enrichment, filtering, sampling, and export.
 * Wraps the existing logger with enterprise fields (traceId, spanId,
 * workspaceId, orgId, requestId) and routes to configurable sinks.
 *
 * Sink priority: LOG_SINK env var (stdout | file | http | null).
 */

import { createWriteStream } from 'fs';
import { join }              from 'path';

const LOG_LEVEL   = process.env.LOG_LEVEL    ?? 'info';
const LOG_SINK    = process.env.LOG_SINK     ?? 'stdout';
const LOG_FILE    = process.env.LOG_FILE     ?? null;
const LOG_HTTP    = process.env.LOG_HTTP_ENDPOINT ?? null;
const SAMPLE_RATE = Number(process.env.LOG_SAMPLE_RATE ?? 1.0); // 1.0 = keep all

const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
const MIN_LEVEL = LEVELS[LOG_LEVEL] ?? 1;

let _fileStream = null;
if (LOG_SINK === 'file' && LOG_FILE) {
  _fileStream = createWriteStream(LOG_FILE, { flags: 'a' });
}

// Buffered HTTP batch (max 100 lines, flush every 5s)
const _httpBuffer = [];
let   _httpTimer  = null;

// ── Public API ────────────────────────────────────────────────────────────────

export function log(level, message, fields = {}) {
  if ((LEVELS[level] ?? 0) < MIN_LEVEL) return;
  if (Math.random() > SAMPLE_RATE && level !== 'error') return;

  const entry = _build(level, message, fields);
  _emit(entry);
}

export const logger = {
  debug: (msg, fields = {}) => log('debug', msg, fields),
  info:  (msg, fields = {}) => log('info',  msg, fields),
  warn:  (msg, fields = {}) => log('warn',  msg, fields),
  error: (msg, fields = {}) => log('error', msg, fields),
};

/**
 * Create a child logger that pre-fills a set of fields on every call.
 */
export function childLogger(baseFields = {}) {
  return {
    debug: (msg, f = {}) => log('debug', msg, { ...baseFields, ...f }),
    info:  (msg, f = {}) => log('info',  msg, { ...baseFields, ...f }),
    warn:  (msg, f = {}) => log('warn',  msg, { ...baseFields, ...f }),
    error: (msg, f = {}) => log('error', msg, { ...baseFields, ...f }),
  };
}

/**
 * Express middleware that attaches a request-scoped child logger.
 */
export function requestLoggerMiddleware(req, res, next) {
  const start = Date.now();
  req.log = childLogger({
    requestId:   req.id,
    method:      req.method,
    path:        req.path,
    workspaceId: req.headers['workspace-id'] ?? undefined,
    userId:      req.user?.id ?? undefined,
  });
  res.on('finish', () => {
    const ms = Date.now() - start;
    const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';
    log(level, 'request', {
      requestId:   req.id,
      method:      req.method,
      path:        req.path,
      status:      res.statusCode,
      durationMs:  ms,
      workspaceId: req.headers['workspace-id'] ?? undefined,
      userId:      req.user?.id ?? undefined,
    });
  });
  next();
}

/**
 * Flush any pending HTTP buffer.
 */
export async function flushLogs() {
  if (_httpBuffer.length > 0) await _sendHttp([..._httpBuffer.splice(0)]);
}

// ── Internal ──────────────────────────────────────────────────────────────────

function _build(level, message, fields) {
  return {
    ts:      new Date().toISOString(),
    level,
    message: _redact(message),
    service: 'flow-os',
    version: process.env.APP_VERSION ?? '1.0.0',
    ...Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, _redact(v)])),
  };
}

const REDACT_KEYS = /token|password|secret|authorization|apikey|jwt|cookie|pii/i;

function _redact(value) {
  if (typeof value === 'string') return value;
  if (typeof value !== 'object' || value === null) return value;
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    out[k] = REDACT_KEYS.test(k) ? '[REDACTED]' : _redact(v);
  }
  return out;
}

function _emit(entry) {
  const line = JSON.stringify(entry);
  if (LOG_SINK === 'null') return;
  if (LOG_SINK === 'file' && _fileStream) {
    _fileStream.write(line + '\n');
    return;
  }
  if (LOG_SINK === 'http' && LOG_HTTP) {
    _httpBuffer.push(entry);
    if (_httpBuffer.length >= 100) {
      const batch = _httpBuffer.splice(0);
      _sendHttp(batch).catch(() => {});
    } else if (!_httpTimer) {
      _httpTimer = setTimeout(() => {
        _httpTimer = null;
        const batch = _httpBuffer.splice(0);
        if (batch.length) _sendHttp(batch).catch(() => {});
      }, 5000);
    }
    return;
  }
  // stdout (default)
  process.stdout.write(line + '\n');
}

async function _sendHttp(batch) {
  await fetch(LOG_HTTP, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ logs: batch }),
  });
}
