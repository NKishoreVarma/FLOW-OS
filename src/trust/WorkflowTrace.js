/**
 * WorkflowTrace — Trust Center
 *
 * Visual execution graph of any FLOW automation run:
 *   Planner → Runtime → Actions → Connector calls → Events → Completion
 * Includes retry history, rollback steps, and timing for each node.
 *
 * Reads from:
 *   autonomy_runs, execution_records, audit_logs, connector_timeline,
 *   flow_events, automation_runs (Phase 7 automations)
 *
 * Never modifies data.
 */

import { query } from '../config/db.js';

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Get the full execution trace for any workflow/automation run.
 * id may be: autonomy_run id, automation_run id, or execution_record id.
 */
export async function getWorkflowTrace(id, workspaceId) {
  const [autonomy, automation, execution] = await Promise.allSettled([
    _traceAutonomyRun(id, workspaceId),
    _traceAutomationRun(id, workspaceId),
    _traceExecutionRecord(id, workspaceId),
  ]);

  const match = [autonomy, automation, execution].find(
    r => r.status === 'fulfilled' && r.value !== null
  );
  if (match) return match.value;
  return _notFound(id);
}

/**
 * List recent workflow runs for a workspace.
 */
export async function listWorkflowRuns(workspaceId, { limit = 50, status = null } = {}) {
  const [autonomy, automation] = await Promise.allSettled([
    _listAutonomyRuns(workspaceId, Math.ceil(limit / 2), status),
    _listAutomationRuns(workspaceId, Math.ceil(limit / 2), status),
  ]);

  return [
    ...(autonomy.status   === 'fulfilled' ? autonomy.value   : []),
    ...(automation.status === 'fulfilled' ? automation.value : []),
  ]
    .sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt))
    .slice(0, limit);
}

// ── Internal tracers ──────────────────────────────────────────────────────────

async function _traceAutonomyRun(id, workspaceId) {
  const { rows } = await query(
    `SELECT * FROM autonomy_runs WHERE id = $1 AND workspace_id = $2`,
    [id, workspaceId]
  ).catch(() => ({ rows: [] }));
  if (!rows[0]) return null;

  const r       = rows[0];
  const result  = _parseJson(r.result, {});
  const context = _parseJson(r.context, {});
  const steps   = _parseJson(r.steps, []);

  const auditRows     = await _getAuditRows(id, workspaceId);
  const connTimeline  = await _getConnectorTimeline(id, workspaceId);
  const events        = await _getEvents(id, workspaceId);

  const nodes = _buildAutonomyNodes(r, result, context, steps, auditRows, connTimeline);
  const edges = _buildEdges(nodes);

  return {
    id,
    workspaceId,
    type:         'AUTONOMY_RUN',
    title:        `Autonomous Planning Cycle — ${new Date(r.started_at).toLocaleString()}`,
    status:       r.status,
    triggeredBy:  r.triggered_by,
    startedAt:    r.started_at,
    completedAt:  r.completed_at,
    durationMs:   _duration(r.started_at, r.completed_at),
    nodes,
    edges,
    events:       events.map(_normalizeEvent),
    summary: {
      totalSteps:   nodes.length,
      succeeded:    nodes.filter(n => n.status === 'success').length,
      failed:       nodes.filter(n => n.status === 'error').length,
      retried:      nodes.filter(n => (n.retryCount ?? 0) > 0).length,
      rolledBack:   nodes.filter(n => n.rolledBack).length,
    },
  };
}

async function _traceAutomationRun(id, workspaceId) {
  const { rows } = await query(
    `SELECT ar.*, rl.name AS rule_name, rl.trigger_event, rl.actions AS rule_actions
     FROM automation_runs ar
     LEFT JOIN automation_rules rl ON rl.id = ar.rule_id
     WHERE ar.id = $1 AND ar.workspace_id = $2`,
    [id, workspaceId]
  ).catch(() => ({ rows: [] }));
  if (!rows[0]) return null;

  const r    = rows[0];
  const steps = _parseJson(r.steps, []);

  const nodes = _buildAutomationNodes(r, steps);
  const edges = _buildEdges(nodes);

  return {
    id,
    workspaceId,
    type:        'AUTOMATION_RUN',
    title:       `Automation: ${r.rule_name ?? 'Unknown Rule'}`,
    status:      r.status,
    triggeredBy: r.trigger_event,
    startedAt:   r.started_at,
    completedAt: r.completed_at,
    durationMs:  _duration(r.started_at, r.completed_at),
    nodes,
    edges,
    events:      [],
    summary: {
      totalSteps: nodes.length,
      succeeded:  nodes.filter(n => n.status === 'success').length,
      failed:     nodes.filter(n => n.status === 'error').length,
      retried:    0,
      rolledBack: 0,
    },
  };
}

async function _traceExecutionRecord(id, workspaceId) {
  const { rows } = await query(
    `SELECT * FROM execution_records WHERE id = $1 AND workspace_id = $2`,
    [id, workspaceId]
  ).catch(() => ({ rows: [] }));
  if (!rows[0]) return null;

  const e    = rows[0];
  const plan = _parseJson(e.plan, {});
  const steps = _parseJson(e.steps, []);

  const auditRows    = await _getAuditRows(id, workspaceId);
  const connTimeline = await _getConnectorTimeline(id, workspaceId);

  const planNode = { id: 'plan', label: 'Execution Plan', type: 'planner', status: 'success', startedAt: e.created_at, durationMs: null, detail: plan.title ?? plan.description ?? null };
  const stepNodes = steps.map((s, i) => ({
    id:         `step-${i}`,
    label:      s.label ?? s.action ?? `Step ${i + 1}`,
    type:       'action',
    status:     s.status ?? 'success',
    startedAt:  s.startedAt ?? null,
    durationMs: s.durationMs ?? null,
    retryCount: s.retryAttempts ?? 0,
    rolledBack: s.rolledBack ?? false,
    detail:     s.detail ?? s.result ?? null,
  }));

  const connNodes = connTimeline.map((t, i) => ({
    id:         `conn-${i}`,
    label:      `${t.connector}: ${t.action}`,
    type:       'connector',
    status:     t.outcome === 'success' ? 'success' : 'error',
    startedAt:  t.executed_at,
    durationMs: t.latency_ms ?? null,
    detail:     t.result_summary ?? null,
  }));

  const auditNode = auditRows.length > 0 ? [{
    id:        'audit',
    label:     'Audit recorded',
    type:      'audit',
    status:    'success',
    startedAt: auditRows[auditRows.length - 1].created_at,
    durationMs: null,
    detail:    `${auditRows.length} audit log(s) written`,
  }] : [];

  const nodes = [planNode, ...stepNodes, ...connNodes, ...auditNode];

  return {
    id,
    workspaceId,
    type:        'EXECUTION_RECORD',
    title:       plan.title ?? `Execution ${id.slice(0,8)}`,
    status:      e.status,
    triggeredBy: e.actor_id,
    startedAt:   e.created_at,
    completedAt: e.completed_at ?? e.updated_at,
    durationMs:  _duration(e.created_at, e.completed_at ?? e.updated_at),
    nodes,
    edges:       _buildEdges(nodes),
    events:      [],
    summary: {
      totalSteps: stepNodes.length,
      succeeded:  stepNodes.filter(n => n.status === 'success').length,
      failed:     stepNodes.filter(n => n.status === 'error').length,
      retried:    stepNodes.filter(n => (n.retryCount ?? 0) > 0).length,
      rolledBack: stepNodes.filter(n => n.rolledBack).length,
    },
  };
}

// ── Node builders ─────────────────────────────────────────────────────────────

function _buildAutonomyNodes(r, result, context, steps, auditRows, connTimeline) {
  const nodes = [];

  nodes.push({ id: 'planner', label: 'Autonomous Planner', type: 'planner', status: 'success', startedAt: r.started_at, durationMs: null, detail: `Trigger: ${r.triggered_by}` });

  for (let i = 0; i < steps.length; i++) {
    const s = steps[i];
    nodes.push({
      id:         `step-${i}`,
      label:      s.label ?? s.type ?? `Step ${i + 1}`,
      type:       'action',
      status:     s.status ?? (r.status === 'failed' && i === steps.length - 1 ? 'error' : 'success'),
      startedAt:  s.startedAt ?? null,
      durationMs: s.durationMs ?? null,
      retryCount: s.retryAttempts ?? 0,
      rolledBack: s.rolledBack ?? false,
      detail:     s.detail ?? null,
    });
  }

  for (let i = 0; i < connTimeline.length; i++) {
    const t = connTimeline[i];
    nodes.push({ id: `conn-${i}`, label: `${t.connector}: ${t.action}`, type: 'connector', status: t.outcome === 'success' ? 'success' : 'error', startedAt: t.executed_at, durationMs: t.latency_ms ?? null, detail: t.result_summary ?? null });
  }

  if (auditRows.length > 0) {
    nodes.push({ id: 'audit', label: 'Audit recorded', type: 'audit', status: 'success', startedAt: auditRows[auditRows.length - 1].created_at, durationMs: null, detail: `${auditRows.length} entries` });
  }

  const completionStatus = r.status === 'completed' ? 'success' : r.status === 'failed' ? 'error' : 'pending';
  nodes.push({ id: 'complete', label: 'Planning cycle complete', type: 'completion', status: completionStatus, startedAt: r.completed_at, durationMs: null, detail: result.summary ?? null });

  return nodes;
}

function _buildAutomationNodes(r, steps) {
  const nodes = [];
  nodes.push({ id: 'trigger', label: `Trigger: ${r.trigger_event ?? 'Event'}`, type: 'planner', status: 'success', startedAt: r.started_at, durationMs: null });

  for (let i = 0; i < steps.length; i++) {
    const s = steps[i];
    nodes.push({ id: `step-${i}`, label: s.action ?? `Step ${i + 1}`, type: 'action', status: s.status ?? 'success', startedAt: s.startedAt ?? null, durationMs: s.durationMs ?? null, detail: s.result ?? null });
  }

  nodes.push({ id: 'complete', label: 'Automation run complete', type: 'completion', status: r.status === 'completed' ? 'success' : r.status === 'failed' ? 'error' : 'pending', startedAt: r.completed_at, durationMs: null });
  return nodes;
}

function _buildEdges(nodes) {
  const edges = [];
  for (let i = 0; i < nodes.length - 1; i++) {
    edges.push({ from: nodes[i].id, to: nodes[i + 1].id });
  }
  return edges;
}

// ── Data fetchers ─────────────────────────────────────────────────────────────

async function _getAuditRows(id, workspaceId) {
  const { rows } = await query(
    `SELECT id, action, outcome, created_at FROM audit_logs
     WHERE workspace_id = $1 AND (resource_id = $2 OR metadata->>'runId' = $2)
     ORDER BY created_at ASC`,
    [workspaceId, id]
  ).catch(() => ({ rows: [] }));
  return rows;
}

async function _getConnectorTimeline(id, workspaceId) {
  const { rows } = await query(
    `SELECT connector, action, outcome, executed_at, latency_ms, result_summary
     FROM connector_timeline
     WHERE workspace_id = $1 AND context_id = $2
     ORDER BY executed_at ASC`,
    [workspaceId, id]
  ).catch(() => ({ rows: [] }));
  return rows;
}

async function _getEvents(id, workspaceId) {
  const { rows } = await query(
    `SELECT id, type, source, connector, created_at
     FROM flow_events
     WHERE workspace_id = $1 AND (correlation_id = $2 OR metadata->>'runId' = $2)
     ORDER BY created_at ASC LIMIT 20`,
    [workspaceId, id]
  ).catch(() => ({ rows: [] }));
  return rows;
}

async function _listAutonomyRuns(workspaceId, limit, status) {
  let sql = `SELECT id, status, triggered_by, started_at, completed_at FROM autonomy_runs WHERE workspace_id = $1`;
  const params = [workspaceId];
  if (status) { params.push(status); sql += ` AND status = $${params.length}`; }
  sql += ` ORDER BY started_at DESC LIMIT $${params.length + 1}`;
  params.push(limit);
  const { rows } = await query(sql, params).catch(() => ({ rows: [] }));
  return rows.map(r => ({ id: r.id, type: 'AUTONOMY_RUN', status: r.status, triggeredBy: r.triggered_by, startedAt: r.started_at, completedAt: r.completed_at }));
}

async function _listAutomationRuns(workspaceId, limit, status) {
  let sql = `SELECT ar.id, ar.status, ar.started_at, ar.completed_at, rl.name AS rule_name FROM automation_runs ar LEFT JOIN automation_rules rl ON rl.id = ar.rule_id WHERE ar.workspace_id = $1`;
  const params = [workspaceId];
  if (status) { params.push(status); sql += ` AND ar.status = $${params.length}`; }
  sql += ` ORDER BY ar.started_at DESC LIMIT $${params.length + 1}`;
  params.push(limit);
  const { rows } = await query(sql, params).catch(() => ({ rows: [] }));
  return rows.map(r => ({ id: r.id, type: 'AUTOMATION_RUN', status: r.status, title: r.rule_name, startedAt: r.started_at, completedAt: r.completed_at }));
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function _normalizeEvent(e) {
  return { id: e.id, type: e.type, source: e.source, connector: e.connector, createdAt: e.created_at };
}

function _duration(start, end) {
  if (!start || !end) return null;
  return new Date(end).getTime() - new Date(start).getTime();
}

function _parseJson(v, fallback) {
  if (!v) return fallback;
  if (typeof v === 'object') return v;
  try { return JSON.parse(v); } catch { return fallback; }
}

function _notFound(id) {
  return { id, type: 'UNKNOWN', title: 'Workflow Not Found', nodes: [], edges: [], summary: { totalSteps: 0, succeeded: 0, failed: 0, retried: 0, rolledBack: 0 } };
}
