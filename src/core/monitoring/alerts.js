/**
 * alerts — deterministic health-rule evaluation over the aggregated metrics.
 * Pull-based: callers (the /api/alerts endpoint, the monitoring dashboard, or a
 * scheduled check) evaluate on demand. Each alert has severity + rule + message.
 */

import { aggregate } from './metricsAggregator.js';

// Thresholds (override via env).
const T = {
  queueBacklog:   Number(process.env.ALERT_QUEUE_BACKLOG ?? 1000),
  queueFailed:    Number(process.env.ALERT_QUEUE_FAILED ?? 50),
  dbWaiting:      Number(process.env.ALERT_DB_WAITING ?? 20),
  heapPct:        Number(process.env.ALERT_HEAP_PCT ?? 90),
  cpuPct:         Number(process.env.ALERT_CPU_PCT ?? 90),
  eventDeadLetter: Number(process.env.ALERT_EVENT_DLQ ?? 25),
};

export async function evaluateAlerts() {
  const m = await aggregate();
  const alerts = [];
  const add = (severity, rule, message) => alerts.push({ severity, rule, message });

  // Queues.
  for (const [q, c] of Object.entries(m.queues || {})) {
    if ((c.waiting || 0) >= T.queueBacklog) add('warning', 'queue_backlog', `${q}: ${c.waiting} jobs waiting`);
    if ((c.failed || 0) >= T.queueFailed) add('critical', 'queue_failures', `${q}: ${c.failed} failed jobs`);
  }

  // Database.
  if (m.db?.waiting >= T.dbWaiting) add('warning', 'db_pool_saturation', `${m.db.waiting} queries waiting on the pool`);
  if ((m.db?.errors || 0) > 0 && m.db.errors >= (m.db.queries || 1) * 0.05) add('warning', 'db_error_rate', `${m.db.errors} query errors`);

  // Redis.
  if (m.redis && m.redis.status !== 'ready') add('critical', 'redis_unhealthy', `Redis status: ${m.redis.status}`);
  if ((m.redis?.reconnects || 0) >= 5) add('warning', 'redis_flapping', `Redis reconnected ${m.redis.reconnects}×`);

  // Process.
  if (m.process?.heapUsedPct >= T.heapPct) add('warning', 'high_memory', `Heap at ${m.process.heapUsedPct}%`);
  if (m.process?.cpuPercent >= T.cpuPct) add('warning', 'high_cpu', `CPU at ${m.process.cpuPercent}%`);

  // Event platform.
  if ((m.eventPlatform?.counters?.deadLettered || 0) >= T.eventDeadLetter) add('warning', 'event_dead_letter', `${m.eventPlatform.counters.deadLettered} events dead-lettered`);
  if ((m.eventPlatform?.counters?.dropped || 0) > 0) add('info', 'event_drops', `${m.eventPlatform.counters.dropped} invalid events dropped`);

  const bySeverity = alerts.reduce((acc, a) => { acc[a.severity] = (acc[a.severity] || 0) + 1; return acc; }, {});
  return {
    evaluatedAt: new Date().toISOString(),
    status: bySeverity.critical ? 'critical' : bySeverity.warning ? 'degraded' : 'ok',
    count: alerts.length,
    bySeverity,
    alerts,
  };
}
