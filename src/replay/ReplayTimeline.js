/**
 * ReplayTimeline — buckets an ordered event stream into time frames (the DVR's
 * scrubbable track). Each frame holds its events, a running total, and a per-type
 * breakdown so the player can render density and jump between moments.
 */

const BUCKET_MS = { hour: 3_600_000, day: 86_400_000, week: 604_800_000 };

function bucketStart(ts, ms) {
  return new Date(Math.floor(new Date(ts).getTime() / ms) * ms).toISOString();
}

/**
 * @param {Array} events oldest-first
 * @param {{ bucket?: 'hour'|'day'|'week' }} opts
 * @returns {{ frames, totalEvents, span, bucket }}
 */
export function buildTimeline(events = [], { bucket = 'day' } = {}) {
  const ms = BUCKET_MS[bucket] || BUCKET_MS.day;
  const map = new Map();
  let running = 0;

  for (const e of events) {
    const key = bucketStart(e.timestamp, ms);
    if (!map.has(key)) map.set(key, { t: key, events: [], count: 0, byType: {}, cumulative: 0 });
    const f = map.get(key);
    f.events.push(frameEvent(e));
    f.count++;
    f.byType[e.eventType] = (f.byType[e.eventType] || 0) + 1;
  }

  const frames = [...map.values()].sort((a, b) => new Date(a.t) - new Date(b.t));
  for (const f of frames) { running += f.count; f.cumulative = running; }

  return {
    frames,
    totalEvents: events.length,
    bucket,
    span: events.length ? { from: events[0].timestamp, to: events[events.length - 1].timestamp } : null,
  };
}

function frameEvent(e) {
  return {
    eventId: e.eventId, eventType: e.eventType, connector: e.connector,
    title: e.title, priority: e.priority, importance: e.importance,
    actor: e.actor?.name || e.actor?.id || null,
    ts: e.timestamp, correlationId: e.correlationId, causationId: e.causationId,
  };
}
