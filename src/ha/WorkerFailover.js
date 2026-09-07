/**
 * WorkerFailover — Module 1 (HA)
 *
 * Worker health tracking and failover coordination.
 * Workers register on boot, send heartbeats, and are marked DOWN
 * when heartbeats stop. The leader coordinates reassignment of stale work.
 */

import { randomUUID }  from 'crypto';
import { hostname }    from 'os';
import { logger }      from '../utils/logger.js';
import { isLeader }    from './LeaderElection.js';

const HEARTBEAT_MS   = Number(process.env.HA_HEARTBEAT_MS ?? 10_000);
const STALE_AFTER_MS = Number(process.env.HA_STALE_MS    ?? 45_000);

const WORKER_ID = `${hostname()}:${process.pid}:${randomUUID().slice(0, 8)}`;

const _registry  = new Map(); // workerId → WorkerRecord
let   _hbTimer   = null;
let   _sweepTimer = null;

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Register this process as a worker and start sending heartbeats.
 */
export function registerWorker(redis, workerType, metadata = {}) {
  const record = {
    workerId:  WORKER_ID,
    workerType,
    host:      hostname(),
    pid:       process.pid,
    status:    'ALIVE',
    startedAt: Date.now(),
    lastHeartbeat: Date.now(),
    metadata,
  };
  _registry.set(WORKER_ID, record);

  const key = _workerKey(workerType, WORKER_ID);
  redis.set(key, JSON.stringify(record), 'EX', Math.ceil(STALE_AFTER_MS / 1000)).catch(() => null);

  _hbTimer = setInterval(() => _sendHeartbeat(redis, workerType, record), HEARTBEAT_MS);
  logger.info(`[WorkerFailover] registered ${workerType}:${WORKER_ID}`);

  return WORKER_ID;
}

/**
 * Deregister this worker gracefully.
 */
export function deregisterWorker(redis, workerType) {
  if (_hbTimer)   { clearInterval(_hbTimer);  _hbTimer  = null; }
  if (_sweepTimer) { clearInterval(_sweepTimer); _sweepTimer = null; }
  redis.del(_workerKey(workerType, WORKER_ID)).catch(() => null);
  _registry.delete(WORKER_ID);
  logger.info(`[WorkerFailover] deregistered ${workerType}:${WORKER_ID}`);
}

/**
 * Start the leader sweep — only runs on the elected leader.
 * Detects stale workers and triggers failover.
 */
export function startLeaderSweep(redis, workerType, { onWorkerDown } = {}) {
  _sweepTimer = setInterval(async () => {
    if (!isLeader('worker-coordinator')) return;
    const stale = await _findStaleWorkers(redis, workerType);
    for (const w of stale) {
      logger.warn(`[WorkerFailover] stale worker detected: ${w.workerId}`);
      await redis.del(_workerKey(workerType, w.workerId)).catch(() => null);
      if (onWorkerDown) onWorkerDown(w);
    }
  }, STALE_AFTER_MS);
}

/**
 * List all known alive workers for a type.
 */
export async function listWorkers(redis, workerType) {
  const pattern = `flow:worker:${workerType}:*`;
  const keys    = await _scan(redis, pattern);
  const workers = [];
  for (const k of keys) {
    const raw = await redis.get(k).catch(() => null);
    if (raw) {
      try { workers.push(JSON.parse(raw)); } catch { /* ignore malformed */ }
    }
  }
  return workers;
}

/**
 * Get this node's worker ID.
 */
export function getWorkerId() { return WORKER_ID; }

/**
 * Get local registry snapshot.
 */
export function getLocalRegistry() {
  return [..._registry.values()];
}

// ── Internal ──────────────────────────────────────────────────────────────────

async function _sendHeartbeat(redis, workerType, record) {
  record.lastHeartbeat = Date.now();
  const key = _workerKey(workerType, WORKER_ID);
  await redis.set(key, JSON.stringify(record), 'EX', Math.ceil(STALE_AFTER_MS / 1000)).catch(err =>
    logger.warn(`[WorkerFailover] heartbeat failed: ${err.message}`)
  );
}

async function _findStaleWorkers(redis, workerType) {
  const workers = await listWorkers(redis, workerType);
  const now     = Date.now();
  return workers.filter(w => now - (w.lastHeartbeat ?? 0) > STALE_AFTER_MS);
}

async function _scan(redis, pattern) {
  const keys   = [];
  let   cursor = '0';
  do {
    const [next, batch] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
    cursor = next;
    keys.push(...batch);
  } while (cursor !== '0');
  return keys;
}

function _workerKey(type, id) {
  return `flow:worker:${type}:${id}`;
}

export { WORKER_ID };
