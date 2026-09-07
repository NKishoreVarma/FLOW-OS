/**
 * EventSearch — tenant-scoped query surface over the durable event store.
 *
 * Structured filters delegate to EventStore.query. When a free-text term is
 * supplied it matches title/summary (ILIKE). Powers the Inspector search box and
 * any consumer that needs historical lookup without provider-specific code.
 */

import db from '../config/db.js';
import { query as storeQuery, mapRow } from './EventStore.js';

/**
 * @param {Object} filter — { workspaceId (required), text?, eventType?, connector?,
 *                            correlationId?, since?, until?, limit?, order? }
 */
export async function search(filter = {}) {
  if (!filter.workspaceId) throw new Error('search requires workspaceId (tenant isolation)');

  // No text term → pure structured query.
  if (!filter.text) {
    return storeQuery({ ...filter, order: filter.order || 'DESC' });
  }

  const where = ['workspace_id = $1', '(title ILIKE $2 OR summary ILIKE $2)'];
  const params = [filter.workspaceId, `%${filter.text}%`];
  let i = 3;
  if (filter.eventType)     { where.push(`event_type = $${i++}`);     params.push(filter.eventType); }
  if (filter.connector)     { where.push(`connector = $${i++}`);      params.push(filter.connector); }
  if (filter.correlationId) { where.push(`correlation_id = $${i++}`); params.push(filter.correlationId); }
  if (filter.since)         { where.push(`ts >= $${i++}`);            params.push(filter.since); }
  if (filter.until)         { where.push(`ts <= $${i++}`);            params.push(filter.until); }
  params.push(Math.min(filter.limit || 50, 500));

  const { rows } = await db.query(
    `SELECT * FROM flow_events
      WHERE ${where.join(' AND ')}
      ORDER BY ts DESC
      LIMIT $${i}`,
    params,
  );
  return rows.map(mapRow);
}
