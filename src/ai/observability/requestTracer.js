/**
 * Request Tracer — Layer 9 of the AI Platform.
 *
 * Creates an end-to-end trace for every AIPlatform request.
 * Captures: layer timings, provider used, token counts, guardrail outcomes,
 * memory operations, tool calls, cache hits, and final response metadata.
 *
 * Persists to model_requests (existing) + optionally to ai_request_traces.
 * Non-blocking — trace failures never affect the response.
 */
import { randomUUID } from 'crypto';
import { query }      from '../../config/db.js';
import { redact }     from '../guardrails/piiDetector.js';

const _activeTraces = new Map(); // traceId → Trace (in-flight)
const _recentTraces = [];        // ring buffer of last 200 completed traces
const MAX_RECENT    = 200;

export class Trace {
  constructor({ traceId, workspaceId, taskType, userId }) {
    this.traceId     = traceId;
    this.workspaceId = workspaceId;
    this.taskType    = taskType;
    this.userId      = userId ?? null;
    this.startedAt   = Date.now();
    this.layers      = {};   // layerName → { startMs, endMs, durationMs, meta }
    this.provider    = null;
    this.model       = null;
    this.inputTokens = null;
    this.outputTokens= null;
    this.costUsd     = null;
    this.cacheHit    = false;
    this.usedFallback= false;
    this.guardrailIssues = [];
    this.toolCalls   = [];
    this.memoryOps   = [];
    this.completedAt = null;
    this.durationMs  = null;
    this.status      = 'in_flight'; // in_flight | success | blocked | error
    this.blockedBy   = null;
    this.error       = null;
  }

  // Record entry into a named layer
  layerStart(name) {
    this.layers[name] = { startMs: Date.now() };
  }

  // Record exit from a named layer with optional metadata
  layerEnd(name, meta = {}) {
    const layer = this.layers[name] ?? { startMs: Date.now() };
    layer.endMs      = Date.now();
    layer.durationMs = layer.endMs - layer.startMs;
    Object.assign(layer, meta);
    this.layers[name] = layer;
  }

  addGuardrailIssue(phase, issues = []) {
    this.guardrailIssues.push({ phase, issues, ts: Date.now() });
  }

  addToolCall(toolName, durationMs, success) {
    this.toolCalls.push({ toolName, durationMs, success });
  }

  addMemoryOp(op, details = {}) {
    this.memoryOps.push({ op, ...details, ts: Date.now() });
  }

  complete({ provider, model, inputTokens, outputTokens, costUsd, cacheHit, usedFallback, status = 'success', blockedBy, error } = {}) {
    this.completedAt  = Date.now();
    this.durationMs   = this.completedAt - this.startedAt;
    this.provider     = provider ?? this.provider;
    this.model        = model ?? this.model;
    this.inputTokens  = inputTokens ?? this.inputTokens;
    this.outputTokens = outputTokens ?? this.outputTokens;
    this.costUsd      = costUsd ?? this.costUsd;
    this.cacheHit     = cacheHit ?? this.cacheHit;
    this.usedFallback = usedFallback ?? this.usedFallback;
    this.status       = status;
    this.blockedBy    = blockedBy ?? null;
    this.error        = error ? redact(error) : null;

    _activeTraces.delete(this.traceId);
    _recentTraces.push(this.toJSON());
    if (_recentTraces.length > MAX_RECENT) _recentTraces.shift();

    // Async persist — never await this
    _persist(this).catch(() => {});
  }

  toJSON() {
    return {
      traceId:       this.traceId,
      workspaceId:   this.workspaceId,
      taskType:      this.taskType,
      userId:        this.userId,
      startedAt:     new Date(this.startedAt).toISOString(),
      completedAt:   this.completedAt ? new Date(this.completedAt).toISOString() : null,
      durationMs:    this.durationMs,
      status:        this.status,
      provider:      this.provider,
      model:         this.model,
      inputTokens:   this.inputTokens,
      outputTokens:  this.outputTokens,
      costUsd:       this.costUsd,
      cacheHit:      this.cacheHit,
      usedFallback:  this.usedFallback,
      layers:        this.layers,
      guardrailIssues: this.guardrailIssues,
      toolCalls:     this.toolCalls,
      memoryOps:     this.memoryOps,
      blockedBy:     this.blockedBy,
      error:         this.error,
    };
  }
}

// ── Public API ─────────────────────────────────────────────────────────────────

export function startTrace({ workspaceId, taskType, userId } = {}) {
  const traceId = randomUUID();
  const trace   = new Trace({ traceId, workspaceId, taskType, userId });
  _activeTraces.set(traceId, trace);
  return trace;
}

export function getTrace(traceId)   { return _activeTraces.get(traceId) ?? null; }
export function getRecentTraces()   { return [..._recentTraces].reverse(); }
export function getActiveTraces()   { return [..._activeTraces.values()].map(t => t.toJSON()); }

// ── Persistence ────────────────────────────────────────────────────────────────
async function _persist(trace) {
  try {
    await query(
      `INSERT INTO model_requests
         (provider, model, task_type, workspace_id, latency_ms,
          input_tokens, output_tokens, cost_usd, status, cached)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        trace.provider, trace.model, trace.taskType, trace.workspaceId,
        trace.durationMs, trace.inputTokens, trace.outputTokens, trace.costUsd,
        trace.status === 'success' ? 'success' : 'error',
        trace.cacheHit,
      ]
    );
  } catch {}
}
