/**
 * OrganizationStateCollector — Module 2
 *
 * Collects a UnifiedOrganizationState snapshot from all available data sources.
 * Uses existing services — never owns data; never writes.
 *
 * Every collection is best-effort: if a source is unavailable its key is null
 * so the Autonomy Engine can always produce partial results.
 */

import { query }                        from '../config/db.js';
import { calculateWorkspaceHealth }     from '../services/healthScoreService.js';
import { predict }                      from '../predictions/PredictionEngine.js';
import { getConnector, listConnectors } from '../connectors/registry.js';
import { queryEvents }                  from '../events/index.js';
import { EventType }                    from '../events/EventSchemaRegistry.js';
import { logger }                       from '../utils/logger.js';

const SAFE = async (label, fn) => {
  try { return await fn(); }
  catch (err) { logger.warn(`[StateCollector] ${label}: ${err.message}`); return null; }
};

/**
 * @returns {Promise<UnifiedOrganizationState>}
 */
export async function collectOrganizationState(workspaceId) {
  const t0 = Date.now();

  const [
    workflowHistory,
    kgStats,
    executionMetrics,
    recentEvents,
    connectorState,
    healthScore,
    incidents,
    predictions,
    teamWorkload,
    infraHealth,
    calendarContext,
    customerSignals,
    budgetSignals,
    knowledgeSilos,
  ] = await Promise.all([
    SAFE('workflowHistory',  () => _workflowHistory(workspaceId)),
    SAFE('kgStats',          () => _kgStats(workspaceId)),
    SAFE('executionMetrics', () => _executionMetrics(workspaceId)),
    SAFE('recentEvents',     () => _recentEvents(workspaceId)),
    SAFE('connectorState',   () => _connectorState(workspaceId)),
    SAFE('healthScore',      () => calculateWorkspaceHealth(workspaceId)),
    SAFE('incidents',        () => _openIncidents(workspaceId)),
    SAFE('predictions',      () => predict(workspaceId, { domain: null })),
    SAFE('teamWorkload',     () => _teamWorkload(workspaceId)),
    SAFE('infraHealth',      () => _infraHealth(workspaceId)),
    SAFE('calendarContext',  () => _calendarContext(workspaceId)),
    SAFE('customerSignals',  () => _customerSignals(workspaceId)),
    SAFE('budgetSignals',    () => _budgetSignals(workspaceId)),
    SAFE('knowledgeSilos',   () => _knowledgeSilos(workspaceId)),
  ]);

  return {
    workspaceId,
    collectedAt:     new Date().toISOString(),
    collectionMs:    Date.now() - t0,
    workflowHistory,
    kgStats,
    executionMetrics,
    recentEvents,
    connectorState,
    healthScore,
    incidents,
    predictions,
    teamWorkload,
    infraHealth,
    calendarContext,
    customerSignals,
    budgetSignals,
    knowledgeSilos,
  };
}

// ── Collectors ────────────────────────────────────────────────────────────────

async function _workflowHistory(workspaceId) {
  const { rows } = await query(
    `SELECT workflow_id, status, COUNT(*) AS count,
            AVG(EXTRACT(EPOCH FROM (completed_at - started_at)) * 1000)::int AS avg_duration_ms
     FROM workflow_executions
     WHERE workspace_id = $1 AND started_at > NOW() - INTERVAL '7 days'
     GROUP BY workflow_id, status
     ORDER BY workflow_id, status`,
    [workspaceId]
  );
  const total = rows.reduce((s, r) => s + Number(r.count), 0);
  const failed = rows.filter(r => r.status === 'FAILED').reduce((s, r) => s + Number(r.count), 0);
  return { rows, total, failureRate: total ? failed / total : 0 };
}

async function _kgStats(workspaceId) {
  const { rows } = await query(
    `SELECT node_type, COUNT(*) AS count
     FROM graph_nodes WHERE workspace_id = $1
     GROUP BY node_type ORDER BY count DESC LIMIT 20`,
    [workspaceId]
  );
  const { rows: edgeRows } = await query(
    `SELECT COUNT(*) AS total_edges FROM graph_edges WHERE workspace_id = $1`,
    [workspaceId]
  );
  return {
    nodesByType: rows,
    totalNodes:  rows.reduce((s, r) => s + Number(r.count), 0),
    totalEdges:  Number(edgeRows[0]?.total_edges ?? 0),
  };
}

async function _executionMetrics(workspaceId) {
  const { rows } = await query(
    `SELECT
       COUNT(*) FILTER (WHERE status = 'COMPLETED') AS completed,
       COUNT(*) FILTER (WHERE status = 'FAILED')    AS failed,
       COUNT(*) FILTER (WHERE status = 'RUNNING')   AS running,
       COUNT(*) FILTER (WHERE status = 'WAITING_APPROVAL') AS waiting_approval,
       COUNT(*) AS total,
       AVG(EXTRACT(EPOCH FROM (completed_at - started_at)) * 1000)
         FILTER (WHERE status = 'COMPLETED')::int AS avg_duration_ms
     FROM workflow_executions
     WHERE workspace_id = $1 AND started_at > NOW() - INTERVAL '30 days'`,
    [workspaceId]
  );
  return rows[0];
}

async function _recentEvents(workspaceId) {
  try {
    const result = await queryEvents({
      workspaceId,
      limit: 100,
      since: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    });
    const events = result?.events ?? [];
    const byType = {};
    for (const e of events) {
      byType[e.eventType] = (byType[e.eventType] ?? 0) + 1;
    }
    const incidents = events.filter(e => e.eventType === EventType.INCIDENT);
    return { total: events.length, byType, recentIncidents: incidents.slice(0, 5) };
  } catch {
    return { total: 0, byType: {}, recentIncidents: [] };
  }
}

async function _connectorState(workspaceId) {
  const connectors = listConnectors(workspaceId);
  const health = await Promise.all(
    connectors.map(async c => {
      try {
        const h = await c.healthCheck(workspaceId);
        return { id: c.id, name: c.name, status: h.status, latencyMs: h.latencyMs ?? null };
      } catch {
        return { id: c.id, name: c.name, status: 'DOWN', latencyMs: null };
      }
    })
  );
  const connected  = health.filter(h => h.status === 'HEALTHY').length;
  const degraded   = health.filter(h => h.status === 'DEGRADED').length;
  const down       = health.filter(h => h.status === 'DOWN').length;
  return { connectors: health, connected, degraded, down, total: health.length };
}

async function _openIncidents(workspaceId) {
  const { rows } = await query(
    `SELECT id, title, severity, status, created_at
     FROM incidents
     WHERE workspace_id = $1 AND status IN ('OPEN','INVESTIGATING')
     ORDER BY created_at DESC LIMIT 10`,
    [workspaceId]
  ).catch(() => ({ rows: [] }));
  return rows;
}

async function _teamWorkload(workspaceId) {
  const { rows } = await query(
    `SELECT assignee_id, COUNT(*) AS open_tasks
     FROM jira_issues
     WHERE workspace_id = $1 AND status NOT IN ('Done','Closed','Cancelled')
     GROUP BY assignee_id
     ORDER BY open_tasks DESC LIMIT 20`,
    [workspaceId]
  ).catch(() => ({ rows: [] }));
  return { assignments: rows };
}

async function _infraHealth(workspaceId) {
  const { rows } = await query(
    `SELECT connector, status, COUNT(*) AS count
     FROM audit_logs
     WHERE workspace_id = $1 AND created_at > NOW() - INTERVAL '1 hour'
     GROUP BY connector, status`,
    [workspaceId]
  ).catch(() => ({ rows: [] }));
  return { recentAuditSummary: rows };
}

async function _calendarContext(workspaceId) {
  const { rows } = await query(
    `SELECT COUNT(*) AS meeting_count,
            SUM(EXTRACT(EPOCH FROM (end_time - start_time))/3600)::numeric(8,2) AS total_hours
     FROM calendar_events
     WHERE workspace_id = $1
       AND start_time BETWEEN NOW() AND NOW() + INTERVAL '7 days'`,
    [workspaceId]
  ).catch(() => ({ rows: [{}] }));
  return rows[0] ?? {};
}

async function _customerSignals(workspaceId) {
  const { rows } = await query(
    `SELECT COUNT(*) FILTER (WHERE health_score < 50)  AS at_risk_count,
            COUNT(*) FILTER (WHERE health_score >= 80)  AS healthy_count,
            COUNT(*)                                     AS total,
            AVG(health_score)::numeric(5,2)              AS avg_health
     FROM customers
     WHERE workspace_id = $1`,
    [workspaceId]
  ).catch(() => ({ rows: [{}] }));
  return rows[0] ?? {};
}

async function _budgetSignals(workspaceId) {
  const { rows } = await query(
    `SELECT SUM(cost_usd)::numeric(12,2) AS month_spend,
            MAX(cost_usd)                AS max_single_cost,
            COUNT(*)                     AS cost_events
     FROM audit_logs
     WHERE workspace_id = $1
       AND created_at > date_trunc('month', NOW())
       AND metadata->>'cost_usd' IS NOT NULL`,
    [workspaceId]
  ).catch(() => ({ rows: [{}] }));
  return rows[0] ?? {};
}

async function _knowledgeSilos(workspaceId) {
  const { rows } = await query(
    `SELECT properties->>'owner' AS owner, COUNT(*) AS node_count
     FROM graph_nodes
     WHERE workspace_id = $1
       AND properties->>'owner' IS NOT NULL
     GROUP BY properties->>'owner'
     HAVING COUNT(*) > 5
     ORDER BY node_count DESC LIMIT 10`,
    [workspaceId]
  ).catch(() => ({ rows: [] }));
  return { topOwners: rows };
}
