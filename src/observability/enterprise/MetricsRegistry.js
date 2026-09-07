/**
 * MetricsRegistry — Module 7 (Enterprise Observability)
 *
 * In-process metrics registry: counters, gauges, histograms.
 * Metrics are queryable via /api/metrics (enterprise) and exported as
 * Prometheus text format when METRICS_FORMAT=prometheus.
 */

const _metrics = new Map(); // name → { type, value, labels, help, buckets? }

// ── Counter ───────────────────────────────────────────────────────────────────

export function incrementCounter(name, labels = {}, value = 1) {
  const key = _key(name, labels);
  const m   = _metrics.get(key);
  if (m) { m.value += value; return; }
  _metrics.set(key, { type: 'counter', name, labels, value, help: name });
}

export function getCounter(name, labels = {}) {
  return _metrics.get(_key(name, labels))?.value ?? 0;
}

// ── Gauge ─────────────────────────────────────────────────────────────────────

export function setGauge(name, value, labels = {}) {
  const key = _key(name, labels);
  const m   = _metrics.get(key);
  if (m) { m.value = value; return; }
  _metrics.set(key, { type: 'gauge', name, labels, value, help: name });
}

export function getGauge(name, labels = {}) {
  return _metrics.get(_key(name, labels))?.value ?? 0;
}

// ── Histogram ─────────────────────────────────────────────────────────────────

const _DEFAULT_BUCKETS = [1, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000];

export function observeHistogram(name, value, labels = {}, buckets = _DEFAULT_BUCKETS) {
  const key = _key(name, labels);
  let m = _metrics.get(key);
  if (!m) {
    m = {
      type: 'histogram', name, labels, help: name,
      buckets: buckets.map(b => ({ le: b, count: 0 })),
      sum: 0, count: 0,
    };
    _metrics.set(key, m);
  }
  m.sum   += value;
  m.count += 1;
  for (const b of m.buckets) { if (value <= b.le) b.count++; }
}

export function getHistogram(name, labels = {}) {
  return _metrics.get(_key(name, labels)) ?? null;
}

// ── Snapshot ──────────────────────────────────────────────────────────────────

export function getAllMetrics() {
  const out = {};
  for (const [key, m] of _metrics) {
    out[key] = { ...m };
  }
  return out;
}

export function getMetricsSummary() {
  const counters   = [];
  const gauges     = [];
  const histograms = [];
  for (const m of _metrics.values()) {
    if (m.type === 'counter')   counters.push({ name: m.name, labels: m.labels, value: m.value });
    if (m.type === 'gauge')     gauges.push({ name: m.name, labels: m.labels, value: m.value });
    if (m.type === 'histogram') histograms.push({
      name: m.name, labels: m.labels,
      count: m.count, sum: m.sum,
      avg: m.count ? Math.round(m.sum / m.count) : 0,
      p95: _estimatePercentile(m, 0.95),
    });
  }
  return { counters, gauges, histograms, totalMetrics: _metrics.size };
}

/**
 * Export as Prometheus text format.
 */
export function exportPrometheus() {
  const lines = [];
  for (const m of _metrics.values()) {
    const labelStr = Object.entries(m.labels).map(([k, v]) => `${k}="${v}"`).join(',');
    const suffix   = labelStr ? `{${labelStr}}` : '';
    if (m.type === 'counter' || m.type === 'gauge') {
      lines.push(`# TYPE ${m.name} ${m.type}`);
      lines.push(`${m.name}${suffix} ${m.value}`);
    } else if (m.type === 'histogram') {
      lines.push(`# TYPE ${m.name} histogram`);
      for (const b of m.buckets) {
        lines.push(`${m.name}_bucket{le="${b.le}"${labelStr ? ',' + labelStr : ''}} ${b.count}`);
      }
      lines.push(`${m.name}_sum${suffix} ${m.sum}`);
      lines.push(`${m.name}_count${suffix} ${m.count}`);
    }
  }
  return lines.join('\n');
}

export function resetMetrics() {
  _metrics.clear();
}

// ── Predefined metric names ───────────────────────────────────────────────────

export const METRICS = Object.freeze({
  WORKFLOW_STARTED:    'flow_workflows_started_total',
  WORKFLOW_COMPLETED:  'flow_workflows_completed_total',
  WORKFLOW_FAILED:     'flow_workflows_failed_total',
  WORKFLOW_DURATION:   'flow_workflow_duration_ms',
  AGENT_CALLS:         'flow_agent_calls_total',
  AGENT_DURATION:      'flow_agent_duration_ms',
  PLANNER_CYCLES:      'flow_planner_cycles_total',
  PLANNER_DURATION:    'flow_planner_duration_ms',
  CONNECTOR_ACTIONS:   'flow_connector_actions_total',
  CONNECTOR_ERRORS:    'flow_connector_errors_total',
  CONNECTOR_DURATION:  'flow_connector_duration_ms',
  KG_NODES:            'flow_kg_nodes_total',
  KG_EDGES:            'flow_kg_edges_total',
  KG_QUERY_DURATION:   'flow_kg_query_duration_ms',
  EVENTS_PUBLISHED:    'flow_events_published_total',
  EVENTS_DELIVERED:    'flow_events_delivered_total',
  HTTP_REQUESTS:       'flow_http_requests_total',
  HTTP_DURATION:       'flow_http_duration_ms',
  CACHE_HITS:          'flow_cache_hits_total',
  CACHE_MISSES:        'flow_cache_misses_total',
  AUTONOMY_CYCLES:     'flow_autonomy_cycles_total',
  AUTONOMY_ACTIONS:    'flow_autonomy_actions_total',
});

// ── Internal ──────────────────────────────────────────────────────────────────

function _key(name, labels) {
  const lStr = Object.keys(labels).sort().map(k => `${k}=${labels[k]}`).join(',');
  return lStr ? `${name}{${lStr}}` : name;
}

function _estimatePercentile(histogram, pct) {
  const target = histogram.count * pct;
  for (const b of histogram.buckets) {
    if (b.count >= target) return b.le;
  }
  return histogram.buckets.at(-1)?.le ?? 0;
}
