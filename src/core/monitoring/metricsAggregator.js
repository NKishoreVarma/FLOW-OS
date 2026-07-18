/**
 * metricsAggregator — one place to read the whole platform's operational metrics.
 * Pulls from the event platform, engine timers, DB pool, Redis, BullMQ queues,
 * connectors, WebSockets, and the process itself. No tenant data — purely
 * operational counters for SRE/monitoring consumption.
 */

import { poolStats } from '../../config/db.js';
import { redisHealth } from '../../config/redis.js';
import { getQueueMetrics } from './queueMetrics.js';
import { snapshot as engineSnapshot } from './engineMetrics.js';

const safe = async (fn, fb) => { try { return await fn(); } catch { return fb; } };

let lastCpu = process.cpuUsage();
let lastCpuAt = Date.now();
function cpuPercent() {
  const now = process.cpuUsage();
  const elapsedUs = (Date.now() - lastCpuAt) * 1000;
  const usedUs = (now.user - lastCpu.user) + (now.system - lastCpu.system);
  lastCpu = now; lastCpuAt = Date.now();
  return elapsedUs > 0 ? +((usedUs / elapsedUs) * 100).toFixed(1) : 0;
}

export async function aggregate() {
  const [queues, eventPlatform, connectors, websocket] = await Promise.all([
    safe(() => getQueueMetrics(), {}),
    safe(async () => (await import('../../events/index.js')).getMetrics(), null),
    safe(async () => (await import('../governance/eventSubscribers.js')).getAllConnectorMetrics(), {}),
    safe(async () => (await import('../../services/socketService.js')).getSocketStatus(), null),
  ]);

  const mem = process.memoryUsage();
  return {
    timestamp: new Date().toISOString(),
    uptimeSec: Math.round(process.uptime()),
    process: {
      pid: process.pid,
      cpuPercent: cpuPercent(),
      memory: { rss: mem.rss, heapUsed: mem.heapUsed, heapTotal: mem.heapTotal, external: mem.external },
      heapUsedPct: +((mem.heapUsed / mem.heapTotal) * 100).toFixed(1),
      node: process.version,
    },
    db: poolStats(),
    redis: redisHealth(),
    queues,
    eventPlatform,      // events/sec, latency p50/p95/p99, counters (from EventMetrics)
    engines: engineSnapshot(),  // prediction/simulation run counts + latency
    connectors,         // per-workspace executed/denied/approvalRequired
    websocket,          // active connections per workspace
  };
}
