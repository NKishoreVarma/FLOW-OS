/**
 * ReplayFilters — normalizes a replay "scope" into a query filter over the
 * durable event store. A scope can target any dimension: time, employee,
 * customer, project, incident, repository, meeting, deployment, connector, or the
 * whole workspace. This module never queries — it only translates.
 */

const RANGES = { day: 1, '24h': 1, week: 7, '7d': 7, month: 30, '30d': 30, quarter: 90, '90d': 90 };

function resolveWindow(scope = {}) {
  const until = scope.to ? new Date(scope.to).toISOString() : new Date().toISOString();
  let since = scope.from ? new Date(scope.from).toISOString() : null;
  if (!since && scope.range) {
    const days = RANGES[scope.range] || 30;
    since = new Date(new Date(until).getTime() - days * 86_400_000).toISOString();
  }
  if (!since) since = new Date(new Date(until).getTime() - 30 * 86_400_000).toISOString(); // default 30d
  return { since, until };
}

/**
 * Build a normalized filter from a scope.
 * @returns {{ since, until, eventTypes?, connector?, actorId?, correlationId?, text?, minImportance?, limit }}
 */
export function normalizeScope(scope = {}) {
  const { since, until } = resolveWindow(scope);
  const filter = { since, until, limit: Math.min(scope.limit || 5000, 100_000) };

  if (scope.connector)     filter.connector = scope.connector;
  if (scope.employee)      filter.actorId = scope.employee;
  if (scope.actorId)       filter.actorId = scope.actorId;
  if (scope.correlationId) filter.correlationId = scope.correlationId;
  if (scope.eventType)     filter.eventTypes = [scope.eventType];
  if (Array.isArray(scope.eventTypes)) filter.eventTypes = scope.eventTypes;
  if (Number.isFinite(scope.minImportance)) filter.minImportance = scope.minImportance;

  // Entity-focused scopes resolve to a text match on title/summary (event store search),
  // since the durable event is the source of truth (no per-entity index required).
  const focus = scope.customer || scope.project || scope.repository || scope.incident || scope.meeting || scope.deployment || scope.focus;
  if (focus && !filter.correlationId) filter.text = String(focus);

  return filter;
}

export { RANGES };
