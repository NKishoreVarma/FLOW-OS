/**
 * EventReplay — re-delivers stored events back through the subscriber fan-out.
 *
 * Enables debugging and future simulations. Replay re-routes to subscribers by
 * default (no re-storage) so it never pollutes the durable store. Pass a custom
 * sink to redirect replayed events elsewhere.
 *
 * Supported selectors: time range (hour/day/week or explicit since/until),
 * connector, user (actorId), project/customer (via correlationId or predicate),
 * event type, and correlation id.
 */

import { query, mapRow } from './EventStore.js';
import { migrate } from './EventVersioning.js';
import { route } from './EventRouter.js';

const RANGES = { hour: 3_600_000, day: 86_400_000, week: 604_800_000 };

/**
 * @param {Object} filter — { workspaceId (required), range?, since?, until?,
 *                            connector?, eventType?, actorId?, correlationId?, limit? }
 * @param {Object} opts   — { sink?(event), regenerateId? }
 * @returns {Promise<{ replayed:number, total:number }>}
 */
export async function replay(filter = {}, opts = {}) {
  if (!filter.workspaceId) throw new Error('replay requires workspaceId (tenant isolation)');

  const since = filter.since
    || (filter.range ? new Date(Date.now() - (RANGES[filter.range] || RANGES.day)).toISOString() : undefined);

  const events = await query({
    ...filter,
    since,
    order: 'ASC',
    limit: filter.limit || 500,
  });

  const sink = opts.sink || route;
  let replayed = 0;

  for (const raw of events) {
    const event = migrate({ ...raw });
    event.metadata = { ...(event.metadata || {}), replayed: true, originalEventId: raw.eventId };
    if (opts.regenerateId) event.eventId = `${raw.eventId}:replay:${Date.now()}`;
    await sink(event);
    replayed++;
  }

  return { replayed, total: events.length };
}

export { mapRow };
