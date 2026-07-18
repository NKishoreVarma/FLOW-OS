/**
 * ReplayDiffEngine — compares two snapshots and classifies what happened between
 * them: added · removed · changed · resolved · escalated. Answers "what changed
 * between Monday and Friday?", "before vs after the incident/deployment".
 */

export function diffSnapshots(before, after) {
  const setDiff = (a = [], b = []) => { const s = new Set(a); return b.filter(x => !s.has(x)); };

  // Entity-level movements.
  const newCustomers = setDiff(before.customerIds, after.customerIds);
  const newIncidents = setDiff(before.incidentIds, after.incidentIds);

  // Metric deltas by event type.
  const changed = [];
  const types = new Set([...Object.keys(before.byType || {}), ...Object.keys(after.byType || {})]);
  for (const t of types) {
    const from = before.byType?.[t] || 0;
    const to = after.byType?.[t] || 0;
    if (to !== from) changed.push({ metric: t, from, to, delta: to - from });
  }
  changed.sort((a, b) => b.delta - a.delta);

  const incidentsResolved = Math.max(0, (after.incidents?.resolved || 0) - (before.incidents?.resolved || 0));
  const incidentsOpened   = Math.max(0, (after.incidents?.opened || 0) - (before.incidents?.opened || 0));
  const criticalDelta     = (after.incidents?.critical || 0) - (before.incidents?.critical || 0);

  return {
    window: { from: before.at, to: after.at },
    added: {
      events: (after.totalEvents || 0) - (before.totalEvents || 0),
      incidents: incidentsOpened,
      deployments: Math.max(0, (after.deployments || 0) - (before.deployments || 0)),
      customers: newCustomers,
      newIncidentIds: newIncidents,
    },
    removed: { note: 'Events are append-only; nothing is deleted. See "resolved" for closed items.' },
    changed,
    resolved: { incidents: incidentsResolved },
    escalated: { criticalIncidents: Math.max(0, criticalDelta), openIncidentsNow: after.incidents?.open || 0 },
    summary: _summary(incidentsOpened, incidentsResolved, criticalDelta, changed, newCustomers.length),
  };
}

function _summary(opened, resolved, critDelta, changed, newCust) {
  const parts = [];
  if (opened) parts.push(`${opened} incident(s) opened`);
  if (resolved) parts.push(`${resolved} resolved`);
  if (critDelta > 0) parts.push(`${critDelta} escalated to critical`);
  if (newCust) parts.push(`${newCust} customer(s) newly involved`);
  const topGrowth = changed.find(c => c.delta > 0);
  if (topGrowth) parts.push(`most activity in "${topGrowth.metric}" (+${topGrowth.delta})`);
  return parts.length ? parts.join('; ') + '.' : 'No material change between the two snapshots.';
}
