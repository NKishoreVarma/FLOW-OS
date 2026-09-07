/**
 * HorizontalScaler — Module 10 (Scalability)
 *
 * Coordinates horizontal scaling decisions and provides cluster-level
 * telemetry. Works with LeaderElection and WorkerFailover (HA layer).
 *
 * Scaling recommendations are advisory — actual scaling is performed by
 * the orchestration layer (K8s HPA, Docker Swarm, or manual).
 * FLOW exports metrics; the orchestrator acts on them.
 */

import redis from '../config/redis.js';
import { getLeaderId, isLeader } from '../ha/LeaderElection.js';
import { listWorkers }           from '../ha/WorkerFailover.js';

const SCALE_KEY = 'scaler:recommendation';
const METRICS_KEY = 'scaler:metrics';

// Thresholds for scale-up/scale-down recommendations
const SCALE_UP_CPU_PCT   = Number(process.env.SCALE_UP_CPU_PCT   ?? 70);
const SCALE_DOWN_CPU_PCT = Number(process.env.SCALE_DOWN_CPU_PCT ?? 30);
const SCALE_UP_QUEUE_LEN = Number(process.env.SCALE_UP_QUEUE_LEN ?? 500);
const MIN_REPLICAS       = Number(process.env.MIN_REPLICAS        ?? 1);
const MAX_REPLICAS       = Number(process.env.MAX_REPLICAS        ?? 20);

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Collect cluster-wide metrics and emit a scaling recommendation.
 * Should be called periodically by the leader node.
 */
export async function evaluateScaling() {
  if (!isLeader()) return null;

  const workers   = await listWorkers();
  const cpuAvg    = _avgCpu(workers);
  const memAvg    = _avgMem(workers);
  const queueLen  = await _totalQueueLength();
  const current   = workers.length;

  let action    = 'MAINTAIN';
  let targetReplicas = current;

  if (cpuAvg > SCALE_UP_CPU_PCT || queueLen > SCALE_UP_QUEUE_LEN) {
    action         = 'SCALE_UP';
    targetReplicas = Math.min(MAX_REPLICAS, current + Math.ceil(current * 0.5));
  } else if (cpuAvg < SCALE_DOWN_CPU_PCT && queueLen < SCALE_UP_QUEUE_LEN * 0.2 && current > MIN_REPLICAS) {
    action         = 'SCALE_DOWN';
    targetReplicas = Math.max(MIN_REPLICAS, current - 1);
  }

  const recommendation = {
    timestamp:   new Date().toISOString(),
    action,
    current,
    targetReplicas,
    cpuAvgPct:   Math.round(cpuAvg),
    memAvgPct:   Math.round(memAvg),
    queueLength: queueLen,
    leader:      getLeaderId(),
  };

  await redis.setex(SCALE_KEY, 120, JSON.stringify(recommendation)).catch(() => {});
  return recommendation;
}

/**
 * Get the last scaling recommendation (readable by all nodes).
 */
export async function getScalingRecommendation() {
  try {
    const raw = await redis.get(SCALE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

/**
 * Get aggregate cluster metrics.
 */
export async function getClusterMetrics() {
  const workers = await listWorkers();
  return {
    totalNodes:    workers.length,
    leader:        getLeaderId(),
    isCurrentLeader: isLeader(),
    cpuAvgPct:     Math.round(_avgCpu(workers)),
    memAvgPct:     Math.round(_avgMem(workers)),
    nodes:         workers.map(w => ({
      id:       w.workerId,
      hostname: w.hostname,
      cpuPct:   w.cpuPct ?? 0,
      memPct:   w.memPct ?? 0,
      uptimeMs: w.uptimeMs ?? 0,
      lastSeen: w.lastSeen,
    })),
  };
}

/**
 * Publish local node metrics so other nodes can aggregate them.
 */
export async function publishLocalMetrics() {
  const mem    = process.memoryUsage();
  const memPct = (mem.heapUsed / mem.heapTotal) * 100;
  const metrics = {
    timestamp: Date.now(),
    pid:       process.pid,
    memPct:    Math.round(memPct),
    uptimeMs:  process.uptime() * 1000,
  };
  try {
    await redis.setex(`${METRICS_KEY}:${process.pid}`, 60, JSON.stringify(metrics));
  } catch {}
}

// ── Internal ──────────────────────────────────────────────────────────────────

function _avgCpu(workers) {
  if (!workers.length) return 0;
  return workers.reduce((s, w) => s + (w.cpuPct ?? 0), 0) / workers.length;
}

function _avgMem(workers) {
  if (!workers.length) return 0;
  return workers.reduce((s, w) => s + (w.memPct ?? 0), 0) / workers.length;
}

async function _totalQueueLength() {
  try {
    const { Queue } = await import('bullmq');
    const names     = ['ingestion-queue', 'summary-queue', 'prediction-queue'];
    const counts    = await Promise.all(names.map(async n => {
      const q = new Queue(n, { connection: redis });
      const c = await q.getJobCounts().catch(() => ({}));
      return (c.waiting ?? 0) + (c.delayed ?? 0);
    }));
    return counts.reduce((s, c) => s + c, 0);
  } catch { return 0; }
}
