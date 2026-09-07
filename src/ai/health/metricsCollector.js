/**
 * Provider Metrics Collector — rolling in-memory window with optional DB persistence.
 *
 * Tracks per-provider: latency, token usage, cost, error rate, rate limit hits.
 * The window holds the last WINDOW_SIZE requests per provider.
 * Stats are derived on-the-fly — no background cron needed.
 */
import { query } from '../../config/db.js';

const WINDOW_SIZE = 1000; // requests kept in memory per provider

const _windows = new Map(); // provider → CircularBuffer of request records

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Record the outcome of one AI request.
 */
export function record({ provider, model, taskType, workspaceId, latencyMs, inputTokens, outputTokens, costUsd, status = 'success', cached = false, fallbackFrom = null }) {
  if (!_windows.has(provider)) _windows.set(provider, []);
  const buf = _windows.get(provider);
  buf.push({ ts: Date.now(), model, taskType, workspaceId, latencyMs, inputTokens, outputTokens, costUsd, status, cached, fallbackFrom });
  if (buf.length > WINDOW_SIZE) buf.shift();

  // Best-effort async DB persistence (non-blocking)
  _persist({ provider, model, taskType, workspaceId, latencyMs, inputTokens, outputTokens, costUsd, status, cached, fallbackFrom }).catch(() => {});
}

/**
 * Get aggregated stats for a provider over the last N minutes (default 60).
 */
export function getStats(provider, { minutes = 60 } = {}) {
  const buf      = _windows.get(provider) ?? [];
  const cutoff   = Date.now() - minutes * 60_000;
  const window   = buf.filter(r => r.ts >= cutoff);

  if (window.length === 0) return _emptyStats(provider);

  const errors    = window.filter(r => r.status === 'error').length;
  const fallbacks = window.filter(r => r.status === 'fallback' || r.fallbackFrom).length;
  const cached    = window.filter(r => r.cached).length;
  const latencies = window.map(r => r.latencyMs).filter(Boolean).sort((a, b) => a - b);
  const totalCost = window.reduce((s, r) => s + (r.costUsd ?? 0), 0);
  const inTokens  = window.reduce((s, r) => s + (r.inputTokens ?? 0), 0);
  const outTokens = window.reduce((s, r) => s + (r.outputTokens ?? 0), 0);

  return {
    provider,
    windowMinutes: minutes,
    requestCount:  window.length,
    errorRate:     +(errors / window.length * 100).toFixed(1),
    fallbackRate:  +(fallbacks / window.length * 100).toFixed(1),
    cacheHitRate:  +(cached / window.length * 100).toFixed(1),
    latency: {
      p50: _percentile(latencies, 0.50),
      p95: _percentile(latencies, 0.95),
      p99: _percentile(latencies, 0.99),
      avg: latencies.length > 0 ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : null,
    },
    tokens: { input: inTokens, output: outTokens, total: inTokens + outTokens },
    estimatedCostUsd: +totalCost.toFixed(4),
    modelBreakdown:   _countBy(window, 'model'),
    taskBreakdown:    _countBy(window, 'taskType'),
  };
}

/**
 * Get stats for all tracked providers.
 */
export function getAllStats({ minutes = 60 } = {}) {
  const providers = [..._windows.keys()];
  return providers.map(p => getStats(p, { minutes }));
}

/**
 * Get hourly cost trend across all providers (from DB, last 24h).
 */
export async function getCostTrend({ hours = 24 } = {}) {
  try {
    const r = await query(
      `SELECT DATE_TRUNC('hour', created_at) AS hour,
              provider,
              SUM(cost_usd)::numeric AS cost,
              COUNT(*)::int AS requests
       FROM model_requests
       WHERE created_at > NOW() - INTERVAL '${hours} hours'
       GROUP BY 1, 2 ORDER BY 1`,
      []
    );
    return r.rows;
  } catch {
    return [];
  }
}

// ── Internals ──────────────────────────────────────────────────────────────────

async function _persist(data) {
  try {
    await query(
      `INSERT INTO model_requests
         (provider, model, task_type, workspace_id, latency_ms, input_tokens, output_tokens, cost_usd, status, cached, fallback_from)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [data.provider, data.model, data.taskType, data.workspaceId,
       data.latencyMs, data.inputTokens, data.outputTokens, data.costUsd,
       data.status, data.cached, data.fallbackFrom]
    );
  } catch {}
}

function _percentile(sorted, p) {
  if (sorted.length === 0) return null;
  const idx = Math.ceil(p * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

function _countBy(arr, key) {
  const counts = {};
  for (const item of arr) counts[item[key] ?? 'unknown'] = (counts[item[key] ?? 'unknown'] ?? 0) + 1;
  return counts;
}

function _emptyStats(provider) {
  return { provider, windowMinutes: 60, requestCount: 0, errorRate: 0, fallbackRate: 0, cacheHitRate: 0,
    latency: { p50: null, p95: null, p99: null, avg: null }, tokens: { input: 0, output: 0, total: 0 },
    estimatedCostUsd: 0, modelBreakdown: {}, taskBreakdown: {} };
}
