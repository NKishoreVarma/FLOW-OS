/**
 * EventStore — durable PostgreSQL persistence for every FLOW Event.
 *
 * Append-only. Idempotent on the PK (event_id) and on the partial unique
 * (workspace_id, connector, source_event_id). All reads are tenant-scoped —
 * workspace_id is mandatory on every query path.
 */

import db from '../config/db.js';
import { logger } from '../utils/logger.js';

/**
 * Append an event durably.
 * @returns {Promise<{ stored: boolean, duplicate: boolean, error?: string }>}
 */
export async function append(event) {
  try {
    const res = await db.query(
      `INSERT INTO flow_events
        (event_id, event_type, connector, workspace_id, organization_id, actor, entity,
         title, summary, ts, payload, metadata, importance, confidence, priority,
         correlation_id, causation_id, parent_event_id, source_event_id, version)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
       ON CONFLICT DO NOTHING
       RETURNING event_id`,
      [
        event.eventId, event.eventType, event.connector, event.workspaceId,
        event.organizationId, JSON.stringify(event.actor || {}), JSON.stringify(event.entity || {}),
        event.title || '', event.summary || '', event.timestamp,
        JSON.stringify(event.payload || {}), JSON.stringify(event.metadata || {}),
        event.importance ?? 0.5, event.confidence ?? 70, event.priority || 'low',
        event.correlationId, event.causationId, event.parentEvent,
        event.sourceEventId, event.version,
      ],
    );
    return { stored: res.rowCount > 0, duplicate: res.rowCount === 0 };
  } catch (err) {
    logger.rag(`[EventStore] append failed (${event.eventId}): ${err.message}`);
    return { stored: false, duplicate: false, error: err.message };
  }
}

export async function getById(workspaceId, eventId) {
  const { rows } = await db.query(
    `SELECT * FROM flow_events WHERE workspace_id = $1 AND event_id = $2`,
    [workspaceId, eventId],
  );
  return rows[0] ? mapRow(rows[0]) : null;
}

/**
 * Structured, tenant-scoped query. Used by replay, search, timeline, inspector.
 *
 * @param {Object} filter
 *   workspaceId  (required) · eventType · connector · correlationId · causationId
 *   · actorId · since · until · order ('ASC'|'DESC') · limit · offset
 */
export async function query(filter = {}) {
  const {
    workspaceId, eventType, connector, correlationId, causationId, actorId,
    since, until, order = 'DESC', limit = 100, offset = 0,
  } = filter;
  if (!workspaceId) throw new Error('EventStore.query requires workspaceId (tenant isolation)');

  const where = ['workspace_id = $1'];
  const params = [workspaceId];
  let i = 2;
  if (eventType)     { where.push(`event_type = $${i++}`);     params.push(eventType); }
  if (connector)     { where.push(`connector = $${i++}`);      params.push(connector); }
  if (correlationId) { where.push(`correlation_id = $${i++}`); params.push(correlationId); }
  if (causationId)   { where.push(`causation_id = $${i++}`);   params.push(causationId); }
  if (actorId)       { where.push(`actor->>'id' = $${i++}`);   params.push(actorId); }
  if (since)         { where.push(`ts >= $${i++}`);            params.push(since); }
  if (until)         { where.push(`ts <= $${i++}`);            params.push(until); }

  const dir = order === 'ASC' ? 'ASC' : 'DESC';
  params.push(Math.min(limit, 1000)); const limIdx = i++;
  params.push(offset);                 const offIdx = i++;

  const { rows } = await db.query(
    `SELECT * FROM flow_events
      WHERE ${where.join(' AND ')}
      ORDER BY ts ${dir}
      LIMIT $${limIdx} OFFSET $${offIdx}`,
    params,
  );
  return rows.map(mapRow);
}

export async function count(filter = {}) {
  const { workspaceId, eventType, connector, since } = filter;
  if (!workspaceId) throw new Error('EventStore.count requires workspaceId');
  const where = ['workspace_id = $1'];
  const params = [workspaceId];
  let i = 2;
  if (eventType) { where.push(`event_type = $${i++}`); params.push(eventType); }
  if (connector) { where.push(`connector = $${i++}`);  params.push(connector); }
  if (since)     { where.push(`ts >= $${i++}`);        params.push(since); }
  const { rows } = await db.query(
    `SELECT count(*)::int AS c FROM flow_events WHERE ${where.join(' AND ')}`, params);
  return rows[0].c;
}

/** Record one subscriber delivery outcome (observability + Inspector). */
export async function recordDelivery(eventId, workspaceId, subscriber, status, opts = {}) {
  try {
    await db.query(
      `INSERT INTO flow_event_deliveries
         (event_id, workspace_id, subscriber, status, attempts, error_message, latency_ms)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [eventId, workspaceId, subscriber, status, opts.attempts ?? 1,
       opts.error ?? null, opts.latencyMs ?? null],
    );
  } catch { /* delivery logging is best-effort — never block the pipeline */ }
}

/** Map a snake_case DB row to a unified FLOW Event (jsonb is already parsed by pg). */
export function mapRow(r) {
  return {
    eventId:        r.event_id,
    eventType:      r.event_type,
    connector:      r.connector,
    workspaceId:    r.workspace_id,
    organizationId: r.organization_id,
    actor:          r.actor,
    entity:         r.entity,
    title:          r.title,
    summary:        r.summary,
    timestamp:      r.ts instanceof Date ? r.ts.toISOString() : r.ts,
    payload:        r.payload,
    metadata:       r.metadata,
    importance:     r.importance,
    confidence:     r.confidence,
    priority:       r.priority,
    correlationId:  r.correlation_id,
    causationId:    r.causation_id,
    parentEvent:    r.parent_event_id,
    sourceEventId:  r.source_event_id,
    version:        r.version,
    // CompanyEvent-compat mirror so replayed events still satisfy 9.4 engines.
    id:                 r.event_id,
    type:               r.event_type,
    source:             r.connector,
    ts:                 r.ts instanceof Date ? r.ts.toISOString() : r.ts,
    actors:             r.actor && r.actor.id ? [r.actor] : [],
    entities:           r.entity && r.entity.id ? [r.entity] : [],
    correlationGroupId: r.correlation_id,
    correlatedEventIds: [],
  };
}
