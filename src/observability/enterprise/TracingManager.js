/**
 * TracingManager — Module 7 (Enterprise Observability)
 *
 * Distributed tracing for workflow executions, agent calls, planner cycles,
 * connector actions, and knowledge graph operations. In-process trace store
 * with optional export to stdout/file as OTLP-compatible JSON.
 *
 * Design: zero external dependencies — all trace data stays in-process unless
 * OTLP_ENDPOINT is configured for export.
 */

import { createHash, randomUUID } from 'crypto';
import { createWriteStream }      from 'fs';
import { join }                   from 'path';

const MAX_SPANS   = Number(process.env.TRACE_MAX_SPANS   ?? 50_000);
const EXPORT_PATH = process.env.TRACE_EXPORT_PATH        ?? null;
const OTLP_ENDPOINT = process.env.OTLP_ENDPOINT          ?? null;

// Circular ring-buffer of completed spans (in-memory)
const _spans = [];
let _exportStream = null;

if (EXPORT_PATH) {
  _exportStream = createWriteStream(join(EXPORT_PATH, 'traces.jsonl'), { flags: 'a' });
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Start a new trace span. Returns a span context that callers must end().
 */
export function startSpan(name, { traceId = null, parentId = null, attributes = {}, kind = 'INTERNAL' } = {}) {
  const span = {
    spanId:    randomUUID(),
    traceId:   traceId ?? randomUUID(),
    parentId,
    name,
    kind,        // INTERNAL | SERVER | CLIENT | PRODUCER | CONSUMER
    startMs:   Date.now(),
    endMs:     null,
    durationMs: null,
    status:    'OK',
    error:     null,
    attributes: { ...attributes },
    events:    [],
  };
  return span;
}

/**
 * End a span and record it.
 */
export function endSpan(span, { status = 'OK', error = null, attributes = {} } = {}) {
  span.endMs     = Date.now();
  span.durationMs = span.endMs - span.startMs;
  span.status    = status;
  span.error     = error ? (error.message ?? String(error)) : null;
  Object.assign(span.attributes, attributes);
  _record(span);
  return span;
}

/**
 * Add a named event to an in-flight span.
 */
export function addSpanEvent(span, name, attributes = {}) {
  span.events.push({ name, timestampMs: Date.now(), attributes });
}

/**
 * Convenience: wrap an async function in a span.
 */
export async function trace(name, fn, ctx = {}) {
  const span = startSpan(name, ctx);
  try {
    const result = await fn(span);
    endSpan(span, { status: 'OK' });
    return result;
  } catch (err) {
    endSpan(span, { status: 'ERROR', error: err });
    throw err;
  }
}

/**
 * Get recent spans, optionally filtered.
 */
export function getSpans({ traceId = null, name = null, limit = 200, status = null } = {}) {
  let result = [..._spans];
  if (traceId) result = result.filter(s => s.traceId === traceId);
  if (name)    result = result.filter(s => s.name.includes(name));
  if (status)  result = result.filter(s => s.status === status);
  return result.slice(-limit).reverse();
}

/**
 * Get a full trace tree by traceId.
 */
export function getTrace(traceId) {
  const spans = _spans.filter(s => s.traceId === traceId);
  return _buildTree(spans);
}

/**
 * Get tracing statistics.
 */
export function getTracingStats() {
  const total   = _spans.length;
  const errors  = _spans.filter(s => s.status === 'ERROR').length;
  const byName  = {};
  for (const s of _spans) {
    if (!byName[s.name]) byName[s.name] = { count: 0, totalMs: 0, errors: 0 };
    byName[s.name].count++;
    byName[s.name].totalMs += s.durationMs ?? 0;
    if (s.status === 'ERROR') byName[s.name].errors++;
  }
  const ops = Object.entries(byName).map(([name, v]) => ({
    name,
    count:   v.count,
    avgMs:   Math.round(v.totalMs / v.count),
    errorPct: Math.round(v.errors / v.count * 100),
  })).sort((a, b) => b.count - a.count).slice(0, 20);
  return { total, errors, errorPct: total ? Math.round(errors/total*100) : 0, topOperations: ops };
}

// ── Internal ──────────────────────────────────────────────────────────────────

function _record(span) {
  if (_spans.length >= MAX_SPANS) _spans.shift();
  _spans.push(span);
  if (_exportStream) {
    _exportStream.write(JSON.stringify(span) + '\n');
  }
  if (OTLP_ENDPOINT) {
    _exportOTLP(span).catch(() => {});
  }
}

function _buildTree(spans) {
  const map = {};
  for (const s of spans) map[s.spanId] = { ...s, children: [] };
  const roots = [];
  for (const s of Object.values(map)) {
    if (s.parentId && map[s.parentId]) map[s.parentId].children.push(s);
    else roots.push(s);
  }
  return roots;
}

async function _exportOTLP(span) {
  const body = JSON.stringify({
    resourceSpans: [{
      resource: { attributes: [{ key: 'service.name', value: { stringValue: 'flow-os' } }] },
      scopeSpans: [{
        scope: { name: 'flow-os-tracer' },
        spans: [{
          traceId:    span.traceId.replace(/-/g, '').padStart(32, '0'),
          spanId:     span.spanId.replace(/-/g, '').padStart(16, '0'),
          parentSpanId: span.parentId?.replace(/-/g, '').padStart(16, '0') ?? '',
          name:       span.name,
          kind:       2,
          startTimeUnixNano: String(span.startMs * 1_000_000),
          endTimeUnixNano:   String((span.endMs ?? Date.now()) * 1_000_000),
          attributes: Object.entries(span.attributes).map(([k, v]) => ({
            key: k, value: { stringValue: String(v) },
          })),
          status: { code: span.status === 'ERROR' ? 2 : 1 },
        }],
      }],
    }],
  });
  await fetch(OTLP_ENDPOINT + '/v1/traces', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });
}
