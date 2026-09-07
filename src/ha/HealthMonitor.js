/**
 * HealthMonitor — Module 1 (HA)
 *
 * Centralized health monitoring for all FLOW subsystems.
 * Runs health checks on a configurable interval and triggers failover
 * actions when components become unhealthy.
 */

import { query }            from '../config/db.js';
import { redisHealth }      from '../config/redis.js';
import { logger }           from '../utils/logger.js';
import { publish }          from '../events/index.js';

const CHECK_INTERVAL_MS  = Number(process.env.HA_HEALTH_CHECK_MS  ?? 15_000);
const UNHEALTHY_THRESHOLD = Number(process.env.HA_UNHEALTHY_THRESHOLD ?? 3);

const _checks      = new Map(); // name → CheckDefinition
const _results     = new Map(); // name → CheckResult
const _failCounts  = new Map(); // name → consecutive failure count
let   _timer       = null;

// ── Registration ──────────────────────────────────────────────────────────────

export function registerCheck(name, fn, { critical = false, timeout = 5000 } = {}) {
  _checks.set(name, { name, fn, critical, timeout });
}

export function unregisterCheck(name) {
  _checks.delete(name);
  _results.delete(name);
  _failCounts.delete(name);
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────

export function startHealthMonitor() {
  _registerBuiltinChecks();
  _runAll();
  _timer = setInterval(_runAll, CHECK_INTERVAL_MS);
  logger.info(`[HealthMonitor] started (interval: ${CHECK_INTERVAL_MS}ms)`);
}

export function stopHealthMonitor() {
  if (_timer) { clearInterval(_timer); _timer = null; }
}

// ── Queries ───────────────────────────────────────────────────────────────────

export function getHealth() {
  const checks = [];
  let overallStatus = 'HEALTHY';

  for (const [name, result] of _results) {
    checks.push(result);
    const def = _checks.get(name);
    if (result.status !== 'HEALTHY' && def?.critical) overallStatus = 'UNHEALTHY';
    else if (result.status !== 'HEALTHY' && overallStatus === 'HEALTHY') overallStatus = 'DEGRADED';
  }

  return { status: overallStatus, checks, checkedAt: new Date().toISOString() };
}

export function isHealthy(name) {
  return _results.get(name)?.status === 'HEALTHY';
}

export function getCheckResult(name) {
  return _results.get(name) ?? null;
}

// ── Internal ──────────────────────────────────────────────────────────────────

async function _runAll() {
  await Promise.allSettled([..._checks.values()].map(_runCheck));
}

async function _runCheck(def) {
  const t0 = Date.now();
  let status = 'HEALTHY';
  let detail = null;
  let error  = null;

  try {
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('health check timeout')), def.timeout)
    );
    const result = await Promise.race([def.fn(), timeoutPromise]);
    status = result?.status ?? 'HEALTHY';
    detail = result?.detail ?? null;
  } catch (err) {
    status = 'UNHEALTHY';
    error  = err.message;
  }

  const latencyMs = Date.now() - t0;
  const prev      = _results.get(def.name);
  const failCount = status !== 'HEALTHY'
    ? (_failCounts.get(def.name) ?? 0) + 1
    : 0;

  _failCounts.set(def.name, failCount);
  _results.set(def.name, {
    name:     def.name,
    status,
    detail,
    error,
    latencyMs,
    critical: def.critical,
    failCount,
    checkedAt: new Date().toISOString(),
  });

  if (failCount >= UNHEALTHY_THRESHOLD && (prev?.status === 'HEALTHY' || !prev)) {
    logger.error(`[HealthMonitor] ${def.name} UNHEALTHY after ${failCount} failures`);
    publish('ha', 'HEALTH_CHECK_FAILED', {
      check: def.name, critical: def.critical, error, failCount,
    }, {}).catch(() => null);
  } else if (status === 'HEALTHY' && prev?.status !== 'HEALTHY' && prev) {
    logger.info(`[HealthMonitor] ${def.name} recovered`);
    publish('ha', 'HEALTH_CHECK_RECOVERED', { check: def.name }, {}).catch(() => null);
  }
}

function _registerBuiltinChecks() {
  // PostgreSQL
  registerCheck('postgresql', async () => {
    const { rows } = await query('SELECT 1 AS ok');
    return rows[0]?.ok === 1 ? { status: 'HEALTHY' } : { status: 'UNHEALTHY', detail: 'unexpected result' };
  }, { critical: true, timeout: 5000 });

  // Redis
  registerCheck('redis', async () => {
    const h = await redisHealth();
    return { status: h.status === 'ok' ? 'HEALTHY' : 'UNHEALTHY', detail: h.detail };
  }, { critical: true, timeout: 3000 });

  // BullMQ (just check redis connectivity via queue ping)
  registerCheck('bullmq', async () => {
    const h = await redisHealth();
    return { status: h.status === 'ok' ? 'HEALTHY' : 'DEGRADED', detail: 'via redis' };
  }, { critical: false, timeout: 3000 });

  // Process memory
  registerCheck('process_memory', async () => {
    const used = process.memoryUsage().heapUsed;
    const limit = 1024 * 1024 * 1024; // 1GB
    const pct   = (used / limit) * 100;
    return {
      status: pct > 90 ? 'UNHEALTHY' : pct > 70 ? 'DEGRADED' : 'HEALTHY',
      detail: `heap ${Math.round(pct)}% (${Math.round(used / 1024 / 1024)}MB)`,
    };
  }, { critical: false, timeout: 1000 });
}
