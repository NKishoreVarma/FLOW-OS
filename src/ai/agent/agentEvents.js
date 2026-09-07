/**
 * Lightweight, content-redacted event sink for an agent run.
 *
 * Records events in memory (for getEvents()/debugging), forwards them to an
 * optional caller callback, and mirrors them onto the in-process eventBus so
 * existing observability can subscribe. NOTHING sensitive is emitted: no tool
 * payloads, no message bodies, no tokens, no credentials, no PII — only IDs,
 * counts, provenance metadata, and classified reasons.
 */

import { eventBus } from '../../core/events/eventBus.js';
import { AgentEventType } from './types.js';

// Keys whose values are never allowed into an event, even if a caller passes them.
const FORBIDDEN_KEYS = new Set([
  'payload', 'input', 'body', 'content', 'text', 'data', 'result',
  'token', 'accessToken', 'apiKey', 'password', 'secret', 'authorization', 'cookie',
]);

/** Shallow-redact a details object down to safe, primitive metadata. */
function safeDetails(details = {}) {
  const out = {};
  for (const [k, v] of Object.entries(details)) {
    if (FORBIDDEN_KEYS.has(k)) continue;
    if (v == null) { out[k] = v; continue; }
    const t = typeof v;
    if (t === 'string') { out[k] = v.length > 120 ? `${v.slice(0, 120)}…` : v; }
    else if (t === 'number' || t === 'boolean') { out[k] = v; }
    else if (Array.isArray(v)) { out[k] = v.length; }            // count only, never contents
    else if (t === 'object') { out[k] = safeDetails(v); }        // recurse, still redacted
  }
  return out;
}

/**
 * @param {object} opts
 * @param {string}  opts.runId
 * @param {string}  opts.workspaceId
 * @param {(evt:object)=>void} [opts.onEvent]
 * @param {boolean} [opts.emitToBus=true]
 */
export function createEventSink({ runId, workspaceId, onEvent, emitToBus = true }) {
  const events = [];

  function emit(type, details = {}) {
    const evt = {
      type,
      runId,
      workspaceId,
      ts: new Date().toISOString(),
      ...safeDetails(details),
    };
    events.push(evt);
    try { onEvent?.(evt); } catch { /* never let a listener break the run */ }
    if (emitToBus) {
      try { eventBus.emit(type, evt); } catch { /* best-effort */ }
    }
    return evt;
  }

  return { emit, events, EventType: AgentEventType };
}
