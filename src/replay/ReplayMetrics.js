/**
 * ReplayMetrics — analytics over a replayed event stream: velocity over time,
 * peak activity, most active people, and lifecycle stats (incident MTTR,
 * deployment frequency). Computed from the events already fetched — no extra
 * queries.
 */

export function computeMetrics(events = []) {
  if (!events.length) return { totalEvents: 0, velocity: [], topActors: [], byType: {}, byConnector: {}, incident: null, deployment: null, span: null };

  const byType = {}, byConnector = {}, actors = {};
  const dayBuckets = {};

  for (const e of events) {
    byType[e.eventType] = (byType[e.eventType] || 0) + 1;
    byConnector[e.connector] = (byConnector[e.connector] || 0) + 1;
    const a = e.actor?.name || e.actor?.id;
    if (a) actors[a] = (actors[a] || 0) + 1;
    const day = e.timestamp.slice(0, 10);
    dayBuckets[day] = (dayBuckets[day] || 0) + 1;
  }

  const velocity = Object.entries(dayBuckets).map(([day, count]) => ({ day, count })).sort((a, b) => a.day.localeCompare(b.day));
  const peak = velocity.reduce((m, v) => (v.count > (m?.count || 0) ? v : m), null);
  const topActors = Object.entries(actors).map(([actor, count]) => ({ actor, count })).sort((a, b) => b.count - a.count).slice(0, 10);

  const span = { from: events[0].timestamp, to: events[events.length - 1].timestamp };
  const days = Math.max(1, (new Date(span.to) - new Date(span.from)) / 86_400_000);

  return {
    totalEvents: events.length,
    velocity,
    peakPeriod: peak,
    topActors,
    byType,
    byConnector,
    incident: incidentStats(events),
    deployment: { count: byType.deployment || 0, perWeek: +((byType.deployment || 0) / days * 7).toFixed(2) },
    span,
  };
}

/** Approximate MTTR: pair incident open→resolved by correlation id. */
function incidentStats(events) {
  const incidents = events.filter(e => e.eventType === 'incident');
  if (!incidents.length) return { count: 0, resolved: 0, mttrHours: null };
  const opened = new Map();
  const durations = [];
  for (const e of incidents) {
    const key = e.correlationId || e.eventId;
    if (/resolved|closed|mitigated|recovered/i.test(`${e.title} ${e.summary || ''}`)) {
      const start = opened.get(key);
      if (start) durations.push((new Date(e.timestamp) - new Date(start)) / 3_600_000);
    } else if (!opened.has(key)) {
      opened.set(key, e.timestamp);
    }
  }
  const mttr = durations.length ? +(durations.reduce((s, d) => s + d, 0) / durations.length).toFixed(1) : null;
  return { count: incidents.length, resolved: durations.length, mttrHours: mttr };
}
