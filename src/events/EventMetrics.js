/**
 * EventMetrics — in-process observability counters for the event platform.
 *
 * Tracks throughput, latency percentiles, per-type / per-connector volume, and
 * the failure/drop/dead-letter counters the Inspector and health endpoints read.
 * Process-scoped (resets on restart) — durable per-delivery outcomes live in the
 * flow_event_deliveries table.
 */

const counters = {
  published:    0,
  stored:       0,
  duplicates:   0,
  routed:       0,
  delivered:    0,
  failed:       0,
  deadLettered: 0,
  dropped:      0,
};

const latencies = [];        // ring buffer of end-to-end publish latencies (ms)
const perType = new Map();
const perConnector = new Map();
let windowStart = Date.now();
let windowCount = 0;

export function incr(metric, n = 1) {
  if (metric in counters) counters[metric] += n;
}

export function recordLatency(ms) {
  latencies.push(ms);
  if (latencies.length > 1000) latencies.shift();
}

export function recordType(type) {
  perType.set(type, (perType.get(type) || 0) + 1);
}

export function recordConnector(connector) {
  perConnector.set(connector, (perConnector.get(connector) || 0) + 1);
}

export function tickThroughput() {
  windowCount++;
}

export function snapshot() {
  const now = Date.now();
  const elapsedSec = Math.max(1, (now - windowStart) / 1000);
  const sorted = [...latencies].sort((a, b) => a - b);
  const pct = (q) => (sorted.length ? sorted[Math.floor(q * (sorted.length - 1))] : 0);
  return {
    counters:   { ...counters },
    throughput: {
      eventsPerSec: +(windowCount / elapsedSec).toFixed(2),
      windowSec:    Math.round(elapsedSec),
      windowCount,
    },
    latencyMs:  { p50: pct(0.5), p95: pct(0.95), p99: pct(0.99), samples: sorted.length },
    byType:     Object.fromEntries(perType),
    byConnector: Object.fromEntries(perConnector),
    timestamp:  new Date(now).toISOString(),
  };
}

export function resetWindow() {
  windowStart = Date.now();
  windowCount = 0;
}
