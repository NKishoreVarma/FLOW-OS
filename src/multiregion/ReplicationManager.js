/**
 * ReplicationManager — Module 2 (Multi-Region)
 *
 * Asynchronous cross-region event replication and workflow state recovery.
 * Events are shipped to secondary regions via HTTP. Workflow checkpoints
 * are read from shared storage on failover.
 */

import { getSecondaryRegions, isMultiRegion } from './RegionConfig.js';
import { logger }  from '../utils/logger.js';
import { query }   from '../config/db.js';

const REPLICATION_TIMEOUT_MS = Number(process.env.REPLICATION_TIMEOUT_MS ?? 10_000);
const REPLICATION_BATCH_SIZE = Number(process.env.REPLICATION_BATCH_SIZE ?? 100);

// In-memory buffer of events waiting for replication (evicted on success/TTL)
const _buffer = [];
const MAX_BUFFER = 10_000;

// ── Event Replication ─────────────────────────────────────────────────────────

/**
 * Queue an event for cross-region replication.
 * Called by the event platform after durable storage.
 */
export function queueForReplication(event) {
  if (!isMultiRegion()) return;
  if (_buffer.length >= MAX_BUFFER) {
    _buffer.shift(); // drop oldest to prevent memory growth
  }
  _buffer.push({ event, queuedAt: Date.now(), attempts: 0 });
}

/**
 * Flush the replication buffer to all healthy secondary regions.
 * Called on a configurable schedule by the HA engine.
 */
export async function flushReplicationBuffer() {
  if (!isMultiRegion() || _buffer.length === 0) return { replicated: 0, failed: 0 };

  const secondaries = getSecondaryRegions().filter(r => r.healthy && r.endpoint);
  if (secondaries.length === 0) return { replicated: 0, failed: 0 };

  const batch = _buffer.splice(0, REPLICATION_BATCH_SIZE);
  let   replicated = 0;
  let   failed     = 0;

  await Promise.allSettled(
    secondaries.map(async region => {
      try {
        const ctrl  = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), REPLICATION_TIMEOUT_MS);
        const res   = await fetch(`${region.endpoint}/api/events/ingest`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json', 'x-replication-source': process.env.REGION_ID ?? 'primary' },
          body:    JSON.stringify({ events: batch.map(b => b.event) }),
          signal:  ctrl.signal,
        });
        clearTimeout(timer);
        if (res.ok) replicated += batch.length;
        else        failed     += batch.length;
      } catch (err) {
        failed += batch.length;
        // Re-queue if not too many attempts
        for (const item of batch) {
          if (item.attempts < 3) {
            item.attempts++;
            _buffer.unshift(item);
          }
        }
        logger.warn(`[ReplicationManager] region ${region.id}: ${err.message}`);
      }
    })
  );

  return { replicated, failed, bufferSize: _buffer.length };
}

/**
 * Get replication lag — number of events pending replication.
 */
export function getReplicationLag() {
  return { pendingEvents: _buffer.length, regions: getSecondaryRegions().length };
}

// ── Workflow State Recovery ───────────────────────────────────────────────────

/**
 * On regional failover, recover in-flight workflows by querying the DB.
 * Returns workflows that were RUNNING/WAITING on the failed region.
 */
export async function recoverWorkflowsFromRegion(failedRegionId) {
  logger.warn(`[ReplicationManager] recovering workflows from failed region: ${failedRegionId}`);

  const { rows } = await query(
    `SELECT id, workflow_id, workspace_id, status, started_at, params
     FROM workflow_executions
     WHERE status IN ('RUNNING','WAITING_APPROVAL')
       AND metadata->>'region' = $1
     ORDER BY started_at ASC`,
    [failedRegionId]
  ).catch(() => ({ rows: [] }));

  logger.info(`[ReplicationManager] found ${rows.length} workflow(s) to recover`);
  return rows;
}

/**
 * Mark a workflow as recovered (transferred to this region).
 */
export async function markWorkflowRecovered(executionId, newRegionId) {
  await query(
    `UPDATE workflow_executions
     SET metadata = jsonb_set(COALESCE(metadata,'{}'), '{region}', $1::jsonb),
         metadata = jsonb_set(metadata, '{recovered_from}', $2::jsonb),
         metadata = jsonb_set(metadata, '{recovered_at}', $3::jsonb)
     WHERE id = $4`,
    [JSON.stringify(newRegionId), JSON.stringify('failover'), JSON.stringify(new Date().toISOString()), executionId]
  ).catch(() => null);
}

/**
 * Health summary for monitoring.
 */
export function getReplicationHealth() {
  const secondaries = getSecondaryRegions();
  return {
    multiRegion:    isMultiRegion(),
    secondaryCount: secondaries.length,
    healthySecondaries: secondaries.filter(r => r.healthy).length,
    bufferSize:     _buffer.length,
    maxBuffer:      MAX_BUFFER,
    batchSize:      REPLICATION_BATCH_SIZE,
  };
}
