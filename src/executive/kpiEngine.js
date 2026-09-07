/**
 * KPI Engine — computes 12 KPIs from connected systems.
 *
 * Data sources (read-only):
 *   - flow_events  (EventStore.query)
 *   - execution_records  (listExecutionRecords)
 *   - graph_nodes / graph_edges  (db.query)
 *   - pending_approvals  (db.query)
 *
 * No LLM calls. All KPIs are deterministic functions of real records.
 */

import * as EventStore        from '../events/EventStore.js';
import { listExecutionRecords } from '../execution/executionHistory.js';
import db                     from '../config/db.js';

const MS_PER_HOUR  = 3600_000;
const MS_PER_DAY   = 86_400_000;

// ── Helpers ───────────────────────────────────────────────────────────────────

function since(days) { return new Date(Date.now() - days * MS_PER_DAY); }

function trend(current, previous) {
  if (!previous || previous === 0) return current > 0 ? 'up' : 'stable';
  const delta = (current - previous) / previous;
  if (delta >  0.05) return 'up';
  if (delta < -0.05) return 'down';
  return 'stable';
}

async function eventCount(workspaceId, eventType, days) {
  try {
    return await EventStore.count({ workspaceId, eventType, since: since(days) });
  } catch { return 0; }
}

/**
 * Compute all 12 KPIs for a workspace over the past `windowDays` days.
 * Each KPI returns: { name, value, unit, trend, previous, window, confidence, evidence }
 *
 * @param {string} workspaceId
 * @param {object} [opts]
 * @param {number} [opts.windowDays=30]
 * @returns {Promise<KPIReport>}
 */
export async function computeKPIs(workspaceId, { windowDays = 30 } = {}) {
  const ws   = String(workspaceId);
  const half = Math.ceil(windowDays / 2);

  const [kpis, errors] = await _runAll(ws, windowDays, half);

  return {
    workspaceId: ws,
    generatedAt: new Date().toISOString(),
    windowDays,
    kpis,
    errors,
  };
}

/**
 * Fetch a single named KPI.
 * @param {string} workspaceId
 * @param {string} name - one of the KPI_NAMES
 * @returns {Promise<KPI>}
 */
export async function computeKPI(workspaceId, name) {
  const ws = String(workspaceId);
  const fn = KPI_FUNCTIONS[name];
  if (!fn) throw new Error(`Unknown KPI: ${name}`);
  return fn(ws, 30, 15);
}

export const KPI_NAMES = [
  'deployment_frequency',
  'lead_time_hours',
  'mttr_hours',
  'open_incidents',
  'support_sla_pct',
  'customer_response_time_hours',
  'sprint_velocity',
  'review_latency_hours',
  'pr_cycle_time_hours',
  'approval_delay_hours',
  'knowledge_silos',
  'execution_success_rate',
];

// ── KPI implementations ───────────────────────────────────────────────────────

async function kpi_deployment_frequency(ws, window, half) {
  const [current, previous] = await Promise.all([
    eventCount(ws, 'deployment.completed', window),
    eventCount(ws, 'deployment.completed', half),
  ]);
  const perDay = +(current / window).toFixed(2);
  return {
    name:       'deployment_frequency',
    label:      'Deployment Frequency',
    value:      perDay,
    unit:       'deploys/day',
    trend:      trend(current, previous * 2),
    previous:   +(previous / half).toFixed(2),
    window:     window,
    confidence: current > 0 ? 'measured' : 'insufficient',
    evidence:   [`${current} deployments in the past ${window} days`],
    domain:     'engineering',
  };
}

async function kpi_lead_time_hours(ws, window) {
  try {
    const { rows } = await db.query(
      `SELECT AVG(EXTRACT(EPOCH FROM (e2.ts - e1.ts)) / 3600)::float AS avg_hours
         FROM flow_events e1
         JOIN flow_events e2 ON e1.correlation_id = e2.correlation_id
            AND e1.workspace_id = e2.workspace_id
            AND e2.event_type = 'deployment.completed'
         WHERE e1.workspace_id = $1
           AND e1.event_type IN ('pull_request.opened','code.committed')
           AND e1.ts >= $2`,
      [ws, since(window)],
    );
    const val = rows[0]?.avg_hours ?? null;
    return {
      name:       'lead_time_hours',
      label:      'Lead Time for Changes',
      value:      val !== null ? +val.toFixed(1) : null,
      unit:       'hours',
      trend:      val !== null ? (val < 24 ? 'good' : val > 72 ? 'degraded' : 'stable') : 'unknown',
      previous:   null,
      window,
      confidence: val !== null ? 'measured' : 'insufficient',
      evidence:   val !== null ? [`Avg ${val.toFixed(1)}h from PR open to deploy in the past ${window} days`] : ['No correlated PR→deploy events found'],
      domain:     'engineering',
    };
  } catch {
    return _nullKPI('lead_time_hours', 'Lead Time for Changes', 'hours', 'engineering', window);
  }
}

async function kpi_mttr_hours(ws, window) {
  try {
    const { rows } = await db.query(
      `SELECT AVG(EXTRACT(EPOCH FROM (e2.ts - e1.ts)) / 3600)::float AS avg_hours,
              COUNT(*)::int cnt
         FROM flow_events e1
         JOIN flow_events e2 ON e1.correlation_id = e2.correlation_id
            AND e1.workspace_id = e2.workspace_id
            AND e2.event_type = 'incident.resolved'
         WHERE e1.workspace_id = $1
           AND e1.event_type = 'incident.created'
           AND e1.ts >= $2`,
      [ws, since(window)],
    );
    const val   = rows[0]?.avg_hours ?? null;
    const count = rows[0]?.cnt ?? 0;
    return {
      name:       'mttr_hours',
      label:      'Mean Time to Recover',
      value:      val !== null ? +val.toFixed(1) : null,
      unit:       'hours',
      trend:      val !== null ? (val < 1 ? 'good' : val > 8 ? 'degraded' : 'stable') : 'unknown',
      previous:   null,
      window,
      confidence: count > 0 ? 'measured' : 'insufficient',
      evidence:   count > 0 ? [`${count} incidents resolved; avg recovery ${val?.toFixed(1)}h`] : ['No resolved incidents found'],
      domain:     'infrastructure',
    };
  } catch {
    return _nullKPI('mttr_hours', 'Mean Time to Recover', 'hours', 'infrastructure', window);
  }
}

async function kpi_open_incidents(ws) {
  try {
    const { rows } = await db.query(
      `SELECT COUNT(*)::int c
         FROM flow_events
        WHERE workspace_id = $1
          AND event_type = 'incident.created'
          AND id NOT IN (
            SELECT correlation_id FROM flow_events
             WHERE workspace_id = $1 AND event_type = 'incident.resolved'
               AND correlation_id IS NOT NULL
          )`,
      [ws],
    );
    const val = rows[0]?.c ?? 0;
    return {
      name:       'open_incidents',
      label:      'Open Incidents',
      value:      val,
      unit:       'incidents',
      trend:      val === 0 ? 'good' : val > 3 ? 'degraded' : 'stable',
      previous:   null,
      window:     null,
      confidence: 'measured',
      evidence:   [`${val} unresolved incidents in event log`],
      domain:     'infrastructure',
    };
  } catch {
    return _nullKPI('open_incidents', 'Open Incidents', 'incidents', 'infrastructure', null);
  }
}

async function kpi_support_sla_pct(ws, window) {
  try {
    const { rows } = await db.query(
      `SELECT
         COUNT(*) FILTER (WHERE event_type = 'support.ticket.created')::int AS total,
         COUNT(*) FILTER (WHERE event_type = 'support.ticket.resolved'
           AND (metadata->>'resolutionHours')::float < 24)::int AS within_sla
        FROM flow_events
       WHERE workspace_id = $1 AND ts >= $2`,
      [ws, since(window)],
    );
    const total = rows[0]?.total ?? 0;
    const within = rows[0]?.within_sla ?? 0;
    const pct = total > 0 ? +(within / total * 100).toFixed(1) : null;
    return {
      name:       'support_sla_pct',
      label:      'Support SLA %',
      value:      pct,
      unit:       '%',
      trend:      pct === null ? 'unknown' : pct >= 95 ? 'good' : pct < 80 ? 'degraded' : 'stable',
      previous:   null,
      window,
      confidence: total > 0 ? 'measured' : 'insufficient',
      evidence:   total > 0 ? [`${within}/${total} tickets resolved within 24h SLA`] : ['No support ticket events found'],
      domain:     'support',
    };
  } catch {
    return _nullKPI('support_sla_pct', 'Support SLA %', '%', 'support', window);
  }
}

async function kpi_customer_response_time(ws, window) {
  try {
    const { rows } = await db.query(
      `SELECT AVG((metadata->>'responseTimeHours')::float)::float AS avg_hours,
              COUNT(*) FILTER (WHERE metadata->>'responseTimeHours' IS NOT NULL)::int AS cnt
         FROM flow_events
        WHERE workspace_id = $1
          AND event_type IN ('email.sent','communication.sent')
          AND ts >= $2`,
      [ws, since(window)],
    );
    const val   = rows[0]?.avg_hours ?? null;
    const count = rows[0]?.cnt ?? 0;
    return {
      name:       'customer_response_time_hours',
      label:      'Customer Response Time',
      value:      val !== null ? +val.toFixed(1) : null,
      unit:       'hours',
      trend:      val === null ? 'unknown' : val < 4 ? 'good' : val > 24 ? 'degraded' : 'stable',
      previous:   null,
      window,
      confidence: count > 0 ? 'measured' : 'insufficient',
      evidence:   count > 0 ? [`Avg ${val?.toFixed(1)}h customer response across ${count} messages`] : ['No response-time metadata on email events'],
      domain:     'customers',
    };
  } catch {
    return _nullKPI('customer_response_time_hours', 'Customer Response Time', 'hours', 'customers', window);
  }
}

async function kpi_sprint_velocity(ws, window) {
  try {
    const { rows } = await db.query(
      `SELECT AVG((metadata->>'storyPoints')::float)::float AS avg_sp,
              COUNT(*)::int cnt
         FROM flow_events
        WHERE workspace_id = $1
          AND event_type = 'sprint.completed'
          AND ts >= $2`,
      [ws, since(window)],
    );
    const val   = rows[0]?.avg_sp ?? null;
    const count = rows[0]?.cnt ?? 0;
    return {
      name:       'sprint_velocity',
      label:      'Sprint Velocity',
      value:      val !== null ? Math.round(val) : null,
      unit:       'story points/sprint',
      trend:      'stable',
      previous:   null,
      window,
      confidence: count > 0 ? 'measured' : 'insufficient',
      evidence:   count > 0 ? [`${count} sprints completed; avg ${Math.round(val)} story points`] : ['No sprint.completed events found'],
      domain:     'engineering',
    };
  } catch {
    return _nullKPI('sprint_velocity', 'Sprint Velocity', 'story points/sprint', 'engineering', window);
  }
}

async function kpi_review_latency(ws, window) {
  try {
    const { rows } = await db.query(
      `SELECT AVG(EXTRACT(EPOCH FROM (e2.ts - e1.ts)) / 3600)::float AS avg_hours,
              COUNT(*)::int cnt
         FROM flow_events e1
         JOIN flow_events e2 ON e1.correlation_id = e2.correlation_id
            AND e1.workspace_id = e2.workspace_id
            AND e2.event_type IN ('pull_request.reviewed','pull_request.approved')
        WHERE e1.workspace_id = $1
          AND e1.event_type = 'pull_request.opened'
          AND e1.ts >= $2`,
      [ws, since(window)],
    );
    const val   = rows[0]?.avg_hours ?? null;
    const count = rows[0]?.cnt ?? 0;
    return {
      name:       'review_latency_hours',
      label:      'PR Review Latency',
      value:      val !== null ? +val.toFixed(1) : null,
      unit:       'hours',
      trend:      val === null ? 'unknown' : val < 4 ? 'good' : val > 24 ? 'degraded' : 'stable',
      previous:   null,
      window,
      confidence: count > 0 ? 'measured' : 'insufficient',
      evidence:   count > 0 ? [`${count} PRs reviewed; avg ${val?.toFixed(1)}h wait for first review`] : ['No PR open→review event pairs found'],
      domain:     'engineering',
    };
  } catch {
    return _nullKPI('review_latency_hours', 'PR Review Latency', 'hours', 'engineering', window);
  }
}

async function kpi_pr_cycle_time(ws, window) {
  try {
    const { rows } = await db.query(
      `SELECT AVG(EXTRACT(EPOCH FROM (e2.ts - e1.ts)) / 3600)::float AS avg_hours,
              COUNT(*)::int cnt
         FROM flow_events e1
         JOIN flow_events e2 ON e1.correlation_id = e2.correlation_id
            AND e1.workspace_id = e2.workspace_id
            AND e2.event_type = 'pull_request.merged'
        WHERE e1.workspace_id = $1
          AND e1.event_type = 'pull_request.opened'
          AND e1.ts >= $2`,
      [ws, since(window)],
    );
    const val   = rows[0]?.avg_hours ?? null;
    const count = rows[0]?.cnt ?? 0;
    return {
      name:       'pr_cycle_time_hours',
      label:      'PR Cycle Time',
      value:      val !== null ? +val.toFixed(1) : null,
      unit:       'hours',
      trend:      val === null ? 'unknown' : val < 24 ? 'good' : val > 72 ? 'degraded' : 'stable',
      previous:   null,
      window,
      confidence: count > 0 ? 'measured' : 'insufficient',
      evidence:   count > 0 ? [`${count} PRs merged; avg cycle time ${val?.toFixed(1)}h`] : ['No PR open→merge event pairs found'],
      domain:     'engineering',
    };
  } catch {
    return _nullKPI('pr_cycle_time_hours', 'PR Cycle Time', 'hours', 'engineering', window);
  }
}

async function kpi_approval_delay(ws, window) {
  try {
    const { rows } = await db.query(
      `SELECT AVG(EXTRACT(EPOCH FROM (resolved_at - created_at)) / 3600)::float AS avg_hours,
              COUNT(*)::int cnt
         FROM pending_approvals
        WHERE workspace_id = $1
          AND status IN ('APPROVED','REJECTED')
          AND created_at >= $2`,
      [ws, since(window)],
    );
    const val   = rows[0]?.avg_hours ?? null;
    const count = rows[0]?.cnt ?? 0;
    return {
      name:       'approval_delay_hours',
      label:      'Approval Delay',
      value:      val !== null ? +val.toFixed(1) : null,
      unit:       'hours',
      trend:      val === null ? 'unknown' : val < 4 ? 'good' : val > 24 ? 'degraded' : 'stable',
      previous:   null,
      window,
      confidence: count > 0 ? 'measured' : 'insufficient',
      evidence:   count > 0 ? [`${count} approvals resolved; avg wait ${val?.toFixed(1)}h`] : ['No resolved approvals in window'],
      domain:     'operations',
    };
  } catch {
    return _nullKPI('approval_delay_hours', 'Approval Delay', 'hours', 'operations', window);
  }
}

async function kpi_knowledge_silos(ws) {
  try {
    const { rows } = await db.query(
      `SELECT COUNT(DISTINCT n.id)::int AS silo_count
         FROM graph_nodes n
        WHERE n.workspace_id = $1
          AND n.type IN ('DOCUMENT','REPOSITORY','KNOWLEDGE_BASE')
          AND NOT EXISTS (
            SELECT 1 FROM graph_edges e
             WHERE e.workspace_id = $1
               AND (e.source_id = n.id OR e.target_id = n.id)
               AND e.relationship_type IN ('KNOWS','CREATED','ASSIGNED_TO','WORKS_ON')
          )`,
      [ws],
    );
    const val = rows[0]?.silo_count ?? 0;
    return {
      name:       'knowledge_silos',
      label:      'Knowledge Silos',
      value:      val,
      unit:       'isolated nodes',
      trend:      val === 0 ? 'good' : val > 5 ? 'degraded' : 'stable',
      previous:   null,
      window:     null,
      confidence: 'measured',
      evidence:   [`${val} knowledge nodes have no contributor/owner edges in the graph`],
      domain:     'knowledge',
    };
  } catch {
    return _nullKPI('knowledge_silos', 'Knowledge Silos', 'isolated nodes', 'knowledge', null);
  }
}

async function kpi_execution_success_rate(ws, window) {
  try {
    const records = await listExecutionRecords(ws, { limit: 200 });
    const recent = records.filter(r => new Date(r.createdAt) >= since(window));
    const total  = recent.length;
    const success = recent.filter(r => r.status === 'EXECUTED').length;
    const pct = total > 0 ? +(success / total * 100).toFixed(1) : null;
    return {
      name:       'execution_success_rate',
      label:      'Execution Success Rate',
      value:      pct,
      unit:       '%',
      trend:      pct === null ? 'unknown' : pct >= 95 ? 'good' : pct < 80 ? 'degraded' : 'stable',
      previous:   null,
      window,
      confidence: total > 0 ? 'measured' : 'insufficient',
      evidence:   total > 0 ? [`${success}/${total} executions succeeded in past ${window} days`] : ['No execution records in window'],
      domain:     'operations',
    };
  } catch {
    return _nullKPI('execution_success_rate', 'Execution Success Rate', '%', 'operations', window);
  }
}

// ── KPI function registry ─────────────────────────────────────────────────────

const KPI_FUNCTIONS = {
  deployment_frequency:         (ws, w) => kpi_deployment_frequency(ws, w, Math.ceil(w / 2)),
  lead_time_hours:              kpi_lead_time_hours,
  mttr_hours:                   kpi_mttr_hours,
  open_incidents:               kpi_open_incidents,
  support_sla_pct:              kpi_support_sla_pct,
  customer_response_time_hours: kpi_customer_response_time,
  sprint_velocity:              kpi_sprint_velocity,
  review_latency_hours:         kpi_review_latency,
  pr_cycle_time_hours:          kpi_pr_cycle_time,
  approval_delay_hours:         kpi_approval_delay,
  knowledge_silos:              kpi_knowledge_silos,
  execution_success_rate:       kpi_execution_success_rate,
};

async function _runAll(ws, window, half) {
  const kpis   = [];
  const errors = [];

  const settled = await Promise.allSettled(
    KPI_NAMES.map(name => KPI_FUNCTIONS[name](ws, window, half))
  );

  settled.forEach((r, i) => {
    if (r.status === 'fulfilled') {
      kpis.push(r.value);
    } else {
      errors.push({ kpi: KPI_NAMES[i], error: r.reason?.message });
      kpis.push(_nullKPI(KPI_NAMES[i], KPI_NAMES[i], '?', 'unknown', window));
    }
  });

  return [kpis, errors];
}

function _nullKPI(name, label, unit, domain, window) {
  return { name, label, value: null, unit, trend: 'unknown', previous: null, window, confidence: 'insufficient', evidence: [], domain };
}
