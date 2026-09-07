/**
 * EventInspector — read-only observability queries for the admin Inspector page.
 *
 * Every function is tenant-scoped: workspaceId is mandatory and no query can
 * return another workspace's events. Reads from flow_events (durable log) and
 * flow_event_deliveries (per-subscriber outcomes) plus the in-process metrics.
 */

import db from '../config/db.js';
import { mapRow } from './EventStore.js';
import { snapshot as metricsSnapshot } from './EventMetrics.js';

/** Live event stream — most recent events, optional type/connector filter. */
export async function liveEvents(workspaceId, { limit = 50, type, connector } = {}) {
  const where = ['workspace_id = $1'];
  const params = [workspaceId];
  let i = 2;
  if (type)      { where.push(`event_type = $${i++}`); params.push(type); }
  if (connector) { where.push(`connector = $${i++}`);  params.push(connector); }
  params.push(Math.min(limit, 200));
  const { rows } = await db.query(
    `SELECT * FROM flow_events WHERE ${where.join(' AND ')} ORDER BY ts DESC LIMIT $${i}`,
    params,
  );
  return rows.map(mapRow);
}

/** Single event with its full payload and per-subscriber delivery outcomes. */
export async function eventDetail(workspaceId, eventId) {
  const { rows } = await db.query(
    `SELECT * FROM flow_events WHERE workspace_id = $1 AND event_id = $2`,
    [workspaceId, eventId],
  );
  if (!rows.length) return null;
  const event = mapRow(rows[0]);
  const { rows: deliveries } = await db.query(
    `SELECT subscriber, status, attempts, error_message, latency_ms, created_at
       FROM flow_event_deliveries
      WHERE workspace_id = $1 AND event_id = $2
      ORDER BY created_at ASC`,
    [workspaceId, eventId],
  );
  return { event, deliveries };
}

/** Failed / dead-lettered deliveries with the originating event summary. */
export async function failures(workspaceId, { limit = 50 } = {}) {
  const { rows } = await db.query(
    `SELECT d.event_id, d.subscriber, d.status, d.attempts, d.error_message, d.latency_ms, d.created_at,
            e.event_type, e.connector, e.title
       FROM flow_event_deliveries d
       LEFT JOIN flow_events e ON e.event_id = d.event_id
      WHERE d.workspace_id = $1 AND d.status IN ('failed', 'dead_letter')
      ORDER BY d.created_at DESC
      LIMIT $2`,
    [workspaceId, Math.min(limit, 200)],
  );
  return rows;
}

/** Per-subscriber health: delivered / failed / dead-letter counts + avg latency. */
export async function subscriberStats(workspaceId) {
  const { rows } = await db.query(
    `SELECT subscriber,
            count(*)::int                                          AS total,
            count(*) FILTER (WHERE status = 'delivered')::int      AS delivered,
            count(*) FILTER (WHERE status = 'failed')::int         AS failed,
            count(*) FILTER (WHERE status = 'dead_letter')::int    AS dead_letter,
            round(avg(latency_ms))::int                            AS avg_latency_ms,
            max(latency_ms)::int                                   AS max_latency_ms
       FROM flow_event_deliveries
      WHERE workspace_id = $1
      GROUP BY subscriber
      ORDER BY total DESC`,
    [workspaceId],
  );
  return rows;
}

/** Volume breakdown by type, connector, and priority over a time window. */
export async function processingStats(workspaceId, { hoursBack = 24 } = {}) {
  const since = new Date(Date.now() - Math.min(hoursBack, 720) * 3_600_000).toISOString();
  const [byType, byConnector, byPriority, totals] = await Promise.all([
    db.query(
      `SELECT event_type, count(*)::int AS c FROM flow_events
        WHERE workspace_id = $1 AND ts >= $2 GROUP BY event_type ORDER BY c DESC`,
      [workspaceId, since]),
    db.query(
      `SELECT connector, count(*)::int AS c FROM flow_events
        WHERE workspace_id = $1 AND ts >= $2 GROUP BY connector ORDER BY c DESC`,
      [workspaceId, since]),
    db.query(
      `SELECT priority, count(*)::int AS c FROM flow_events
        WHERE workspace_id = $1 AND ts >= $2 GROUP BY priority ORDER BY c DESC`,
      [workspaceId, since]),
    db.query(
      `SELECT count(*)::int AS c FROM flow_events WHERE workspace_id = $1 AND ts >= $2`,
      [workspaceId, since]),
  ]);
  return {
    hoursBack,
    total:       totals.rows[0].c,
    byType:      byType.rows,
    byConnector: byConnector.rows,
    byPriority:  byPriority.rows,
  };
}

/** Causation/correlation chain — events in a group, chronological. */
export async function correlationGraph(workspaceId, correlationId) {
  const { rows } = await db.query(
    `SELECT event_id, event_type, connector, title, priority, ts, causation_id, parent_event_id
       FROM flow_events
      WHERE workspace_id = $1 AND correlation_id = $2
      ORDER BY ts ASC`,
    [workspaceId, correlationId],
  );
  return rows;
}

/** Top-line overview: durable totals + live metrics snapshot. */
export async function overview(workspaceId) {
  const [{ rows: totalRows }, { rows: failRows }] = await Promise.all([
    db.query(`SELECT count(*)::int AS c FROM flow_events WHERE workspace_id = $1`, [workspaceId]),
    db.query(
      `SELECT count(*) FILTER (WHERE status = 'failed')::int      AS failed,
              count(*) FILTER (WHERE status = 'dead_letter')::int AS dead_letter
         FROM flow_event_deliveries WHERE workspace_id = $1`,
      [workspaceId]),
  ]);
  return {
    workspaceId,
    storedEvents: totalRows[0].c,
    failedDeliveries:     failRows[0].failed,
    deadLetterDeliveries: failRows[0].dead_letter,
    metrics: metricsSnapshot(),
  };
}
