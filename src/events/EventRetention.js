/**
 * EventRetention — age-based pruning of the durable event store.
 *
 * Per-type retention windows; batched DELETEs to avoid long locks. Types with a
 * null window are kept indefinitely (memory, and anything unlisted falls back to
 * `default`). Intended to run from a scheduled job (BullMQ cron) or manually.
 */

import db from '../config/db.js';
import { logger } from '../utils/logger.js';

// Retention in days per event type. null = keep forever.
export const RETENTION_DAYS = {
  incident:       365,
  security:       365,
  authentication: 365,
  approval:       365,
  deployment:     180,
  customer:       180,
  knowledge:      180,
  engineering:    90,
  meeting:        90,
  timeline:       90,
  task:           90,
  recommendation: 60,
  communication:  30,
  ai:             30,
  integration:    30,
  memory:         null,   // kept indefinitely
  default:        90,
};

/**
 * @param {Object} opts — { batchSize?, dryRun? }
 * @returns {Promise<{ totalDeleted:number, perType:Object, dryRun:boolean }>}
 */
export async function prune({ batchSize = 5000, dryRun = false } = {}) {
  let totalDeleted = 0;
  const perType = {};

  // Never prune events belonging to a frozen certification fixture — retention must
  // not erode the golden regression dataset (this closes a real erosion vector that
  // dropped Helios flow_events over multiple days).
  const { getFrozenWorkspaces } = await import('../core/governance/frozenWorkspaces.js');
  const frozen = getFrozenWorkspaces();

  for (const [type, days] of Object.entries(RETENTION_DAYS)) {
    if (type === 'default' || days == null) continue;
    const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();

    if (dryRun) {
      const { rows } = await db.query(
        `SELECT count(*)::int AS c FROM flow_events WHERE event_type = $1 AND ts < $2 AND NOT (workspace_id = ANY($3))`,
        [type, cutoff, frozen],
      );
      perType[type] = rows[0].c;
      totalDeleted += rows[0].c;
      continue;
    }

    let deleted;
    do {
      const { rowCount } = await db.query(
        `DELETE FROM flow_events
          WHERE event_id IN (
            SELECT event_id FROM flow_events
             WHERE event_type = $1 AND ts < $2 AND NOT (workspace_id = ANY($4))
             LIMIT $3)`,
        [type, cutoff, batchSize, frozen],
      );
      deleted = rowCount;
      totalDeleted += rowCount;
      perType[type] = (perType[type] || 0) + rowCount;
    } while (deleted === batchSize);
  }

  logger.rag(`[EventRetention] pruned ${totalDeleted} events${dryRun ? ' (dry-run)' : ''}`);
  return { totalDeleted, perType, dryRun };
}
