/**
 * ReplayBuilder — fetches the ordered event stream for a normalized filter,
 * reading ONLY from the Unified Event Platform (no duplicate storage). Handles
 * pagination for long ranges and multi-type (OR) queries by merging per-type
 * results. Returns events oldest-first (the natural replay order).
 */

import { queryEvents, search } from '../events/index.js';

const PAGE = 1000; // EventStore.query caps each page at 1000 rows

/**
 * @param {string} workspaceId
 * @param {object} filter from ReplayFilters.normalizeScope
 * @returns {Promise<{ events: Array, total: number, truncated: boolean }>}
 */
export async function buildStream(workspaceId, filter = {}) {
  const limit = Math.min(filter.limit || 5000, 100_000);
  let events;

  if (filter.text) {
    // Entity-focused replay → full-text search over the durable store.
    events = await search({ workspaceId, text: filter.text, since: filter.since, until: filter.until, order: 'ASC', limit });
  } else if (filter.eventTypes && filter.eventTypes.length > 1) {
    // Multi-type: one indexed query per type, merged.
    const perType = await Promise.all(filter.eventTypes.map(t =>
      _paginate(workspaceId, { ...filter, eventType: t }, Math.ceil(limit / filter.eventTypes.length))));
    events = perType.flat();
  } else {
    const eventType = filter.eventTypes ? filter.eventTypes[0] : filter.eventType;
    events = await _paginate(workspaceId, { ...filter, eventType }, limit);
  }

  // Client-side importance gate (executive digest), then chronological order.
  if (Number.isFinite(filter.minImportance)) events = events.filter(e => (e.importance ?? 0) >= filter.minImportance);
  events.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

  const truncated = events.length >= limit;
  return { events: events.slice(0, limit), total: events.length, truncated };
}

async function _paginate(workspaceId, filter, cap) {
  const out = [];
  let offset = 0;
  while (out.length < cap) {
    const want = Math.min(PAGE, cap - out.length);
    const batch = await queryEvents({
      workspaceId,
      eventType: filter.eventType,
      connector: filter.connector,
      actorId: filter.actorId,
      correlationId: filter.correlationId,
      since: filter.since,
      until: filter.until,
      order: 'ASC',
      limit: want,
      offset,
    });
    out.push(...batch);
    if (batch.length < want) break; // store returned fewer than requested → exhausted
    offset += batch.length;
  }
  return out;
}
