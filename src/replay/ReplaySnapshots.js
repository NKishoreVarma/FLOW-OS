/**
 * ReplaySnapshots — reconstructs workspace STATE as-of-T by folding events up to
 * that instant. Computed on the fly with SQL aggregates over the durable event
 * store (flow_events) — no snapshot is ever persisted, so there is no duplicate
 * storage and every snapshot is exact for any historical timestamp.
 *
 * The Operational Graph is deliberately NOT the source: it holds only current
 * last_observed_at and cannot represent past state.
 */

import db from '../config/db.js';

const RESOLVED_RE = `(title ILIKE '%resolved%' OR title ILIKE '%closed%' OR title ILIKE '%mitigated%'
                   OR summary ILIKE '%resolved%' OR summary ILIKE '%recovered%')`;

/**
 * @param {string} workspaceId
 * @param {string|Date} at ISO timestamp — state as of this moment
 * @returns {Promise<Object>} snapshot
 */
export async function snapshotAt(workspaceId, at) {
  const ts = new Date(at).toISOString();
  const ws = String(workspaceId);

  const [totals, byType, byConn, byPri, incidents, contributors, customers, entities] = await Promise.all([
    db.query(`SELECT count(*)::int c FROM flow_events WHERE workspace_id=$1 AND ts<=$2`, [ws, ts]),
    db.query(`SELECT event_type t, count(*)::int c FROM flow_events WHERE workspace_id=$1 AND ts<=$2 GROUP BY event_type`, [ws, ts]),
    db.query(`SELECT connector t, count(*)::int c FROM flow_events WHERE workspace_id=$1 AND ts<=$2 GROUP BY connector`, [ws, ts]),
    db.query(`SELECT priority t, count(*)::int c FROM flow_events WHERE workspace_id=$1 AND ts<=$2 GROUP BY priority`, [ws, ts]),
    db.query(
      `SELECT
         count(*) FILTER (WHERE event_type='incident')::int AS opened,
         count(*) FILTER (WHERE event_type='incident' AND ${RESOLVED_RE})::int AS resolved,
         count(*) FILTER (WHERE event_type IN ('incident','security') AND priority='critical')::int AS critical
       FROM flow_events WHERE workspace_id=$1 AND ts<=$2`, [ws, ts]),
    db.query(
      `SELECT actor->>'name' AS actor, count(*)::int c FROM flow_events
        WHERE workspace_id=$1 AND ts<=$2 AND actor->>'name' IS NOT NULL
        GROUP BY actor->>'name' ORDER BY c DESC LIMIT 10`, [ws, ts]),
    db.query(
      `SELECT DISTINCT entity->>'id' AS id FROM flow_events
        WHERE workspace_id=$1 AND ts<=$2 AND event_type='customer' AND entity->>'id' IS NOT NULL LIMIT 1000`, [ws, ts]),
    db.query(
      `SELECT DISTINCT entity->>'id' AS id FROM flow_events
        WHERE workspace_id=$1 AND ts<=$2 AND event_type='incident' AND entity->>'id' IS NOT NULL LIMIT 1000`, [ws, ts]),
  ]);

  const inc = incidents.rows[0];
  const asMap = (rows) => Object.fromEntries(rows.map(r => [r.t, r.c]));

  return {
    at: ts,
    totalEvents: totals.rows[0].c,
    byType: asMap(byType.rows),
    byConnector: asMap(byConn.rows),
    byPriority: asMap(byPri.rows),
    incidents: { opened: inc.opened, resolved: inc.resolved, open: Math.max(0, inc.opened - inc.resolved), critical: inc.critical },
    deployments: asMap(byType.rows).deployment || 0,
    meetings: asMap(byType.rows).meeting || 0,
    engineeringEvents: asMap(byType.rows).engineering || 0,
    activeContributors: contributors.rows.length,
    topContributors: contributors.rows.map(r => ({ actor: r.actor, events: r.c })),
    customerIds: customers.rows.map(r => r.id),
    incidentIds: entities.rows.map(r => r.id),
  };
}
