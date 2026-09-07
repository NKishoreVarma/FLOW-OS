/**
 * QueueSharding — Module 10 (Scalability)
 *
 * Distributes BullMQ jobs across N shards using a consistent hash of the
 * workspaceId. Each shard is an independent BullMQ queue on Redis so that
 * one noisy workspace cannot starve others.
 *
 * QUEUE_SHARDS env var (default 4) controls the fan-out factor.
 * All existing queue names are unchanged — sharding is additive.
 */

import { Queue } from 'bullmq';
import redis from '../config/redis.js';

const SHARD_COUNT = Number(process.env.QUEUE_SHARDS ?? 4);
const BASE_QUEUES = ['ingestion-queue', 'summary-queue', 'prediction-queue'];

const _shards = new Map(); // queueName → Queue[]

export function initQueueShards() {
  for (const base of BASE_QUEUES) {
    const shards = [];
    for (let i = 0; i < SHARD_COUNT; i++) {
      shards.push(new Queue(`${base}-shard-${i}`, { connection: redis }));
    }
    _shards.set(base, shards);
  }
}

/**
 * Add a job to the appropriate shard for a workspace.
 */
export async function addShardedJob(queueName, workspaceId, data, opts = {}) {
  const shards = _shards.get(queueName);
  if (!shards || shards.length === 0) {
    // Fallback: use the base queue (no sharding)
    const q = new Queue(queueName, { connection: redis });
    return q.add(queueName, data, opts);
  }
  const idx = _hash(workspaceId) % shards.length;
  return shards[idx].add(queueName, data, opts);
}

/**
 * Get the shard queue for a workspace.
 */
export function getShardQueue(queueName, workspaceId) {
  const shards = _shards.get(queueName);
  if (!shards) return null;
  return shards[_hash(workspaceId) % shards.length];
}

/**
 * Get aggregate job counts across all shards of a queue.
 */
export async function getShardedQueueStats(queueName) {
  const shards = _shards.get(queueName) ?? [];
  const stats  = { waiting: 0, active: 0, completed: 0, failed: 0, shards: [] };
  for (let i = 0; i < shards.length; i++) {
    const counts = await shards[i].getJobCounts().catch(() => ({}));
    stats.waiting   += counts.waiting   ?? 0;
    stats.active    += counts.active    ?? 0;
    stats.completed += counts.completed ?? 0;
    stats.failed    += counts.failed    ?? 0;
    stats.shards.push({ shard: i, ...counts });
  }
  return stats;
}

export function getShardCount() { return SHARD_COUNT; }

// ── Internal ──────────────────────────────────────────────────────────────────

function _hash(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) + h) ^ str.charCodeAt(i);
    h = h >>> 0; // unsigned 32-bit
  }
  return h;
}
