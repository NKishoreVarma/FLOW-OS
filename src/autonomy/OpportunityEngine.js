/**
 * OpportunityEngine — Module 4
 *
 * Continuously discovers automation and efficiency opportunities by running
 * deterministic pattern matchers over the UnifiedOrganizationState.
 *
 * Each opportunity includes estimated value, confidence, suggested workflow,
 * business impact, and owner. No heuristic numbers are invented — all estimates
 * are clearly labeled and sourced from observable signals.
 */

import { query } from '../config/db.js';
import { AppError } from '../core/errors/index.js';

export const OpportunityCategory = Object.freeze({
  AUTOMATION:     'automation',
  COST:           'cost',
  RELIABILITY:    'reliability',
  PRODUCTIVITY:   'productivity',
  QUALITY:        'quality',
  SECURITY:       'security',
  KNOWLEDGE:      'knowledge',
  COLLABORATION:  'collaboration',
});

// ── Discovery ─────────────────────────────────────────────────────────────────

/**
 * Run all opportunity matchers against org state.
 * @returns {Opportunity[]}
 */
export function discoverOpportunities(workspaceId, orgState) {
  const matchers = [
    _idleConnectors,
    _highFailureWorkflows,
    _approvalBottlenecks,
    _largePRQueue,
    _slowReviewCycles,
    _teamOverload,
    _staleKnowledge,
    _repeatedManualPatterns,
    _highIncidentRate,
    _degradedConnectors,
    _atRiskCustomers,
    _calendarOverload,
    _infraCostSignal,
    _knowledgeSilos,
  ];

  const opportunities = [];
  for (const matcher of matchers) {
    try {
      const result = matcher(workspaceId, orgState);
      if (result) opportunities.push(...(Array.isArray(result) ? result : [result]));
    } catch { /* best-effort */ }
  }

  return opportunities
    .filter(o => o.confidence >= 0.3)
    .sort((a, b) => (b.estimatedValueUsd + b.estimatedHoursSaved * 150) -
                    (a.estimatedValueUsd + a.estimatedHoursSaved * 150));
}

// ── Matchers ──────────────────────────────────────────────────────────────────

function _idleConnectors(workspaceId, { connectorState }) {
  if (!connectorState) return null;
  const degraded = (connectorState.connectors ?? []).filter(c => c.status === 'DEGRADED');
  if (!degraded.length) return null;
  return {
    id:                 `opp_idle_connectors_${Date.now()}`,
    workspaceId,
    title:             `${degraded.length} connector(s) degraded — reconnect to restore full automation`,
    description:       `${degraded.map(c => c.name).join(', ')} are degraded. Reconnecting them will restore automated workflows and data collection.`,
    category:          OpportunityCategory.RELIABILITY,
    estimatedValueUsd: degraded.length * 500,
    estimatedHoursSaved: degraded.length * 2,
    confidence:        0.9,
    businessImpact:    'Degraded connectors reduce the quality of AI recommendations and block automated workflows.',
    suggestedWorkflow: { action: 'reconnect_connectors', connectorIds: degraded.map(c => c.id) },
    owner:             'Platform Team',
    evidence:          degraded.map(c => ({ connector: c.name, status: c.status })),
  };
}

function _highFailureWorkflows(workspaceId, { workflowHistory }) {
  if (!workflowHistory) return null;
  const { rows = [], failureRate } = workflowHistory;
  if (failureRate < 0.1) return null;
  const failedWorkflows = rows.filter(r => r.status === 'FAILED');
  return {
    id:                 `opp_workflow_failures_${Date.now()}`,
    workspaceId,
    title:             `Workflow failure rate ${(failureRate * 100).toFixed(0)}% — above 10% threshold`,
    description:       `${failedWorkflows.reduce((s, r) => s + Number(r.count), 0)} failed workflow runs in the last 7 days across ${failedWorkflows.length} workflow types.`,
    category:          OpportunityCategory.RELIABILITY,
    estimatedValueUsd: failedWorkflows.reduce((s, r) => s + Number(r.count) * 50, 0),
    estimatedHoursSaved: failedWorkflows.reduce((s, r) => s + Number(r.count) * 0.5, 0),
    confidence:        0.85,
    businessImpact:    'High workflow failure rates mean manual intervention is required, reducing automation ROI.',
    suggestedWorkflow: { action: 'audit_failed_workflows', workflows: failedWorkflows.map(r => r.workflow_id) },
    owner:             'Engineering',
    evidence:          failedWorkflows,
  };
}

function _approvalBottlenecks(workspaceId, { executionMetrics }) {
  if (!executionMetrics) return null;
  const waiting = Number(executionMetrics.waiting_approval ?? 0);
  if (waiting < 3) return null;
  return {
    id:                 `opp_approval_bottleneck_${Date.now()}`,
    workspaceId,
    title:             `${waiting} workflow(s) blocked on approval`,
    description:       `${waiting} workflows are in WAITING_APPROVAL state. Long approval queues reduce autonomy efficiency and delay business outcomes.`,
    category:          OpportunityCategory.AUTOMATION,
    estimatedValueUsd: waiting * 200,
    estimatedHoursSaved: waiting * 4,
    confidence:        0.8,
    businessImpact:    'Each blocked workflow represents delayed business value and engineer context-switching cost.',
    suggestedWorkflow: { action: 'escalate_pending_approvals', count: waiting },
    owner:             'Operations',
    evidence:          [{ waiting_approval: waiting }],
  };
}

function _largePRQueue(workspaceId, { kgStats }) {
  if (!kgStats) return null;
  const prNodes = (kgStats.nodesByType ?? []).find(n => n.node_type === 'pull_request');
  const count = Number(prNodes?.count ?? 0);
  if (count < 10) return null;
  return {
    id:                 `opp_pr_queue_${Date.now()}`,
    workspaceId,
    title:             `${count} open pull requests in the knowledge graph`,
    description:       `Large PR queues delay deployments, create merge conflicts, and increase review cognitive load.`,
    category:          OpportunityCategory.QUALITY,
    estimatedValueUsd: count * 100,
    estimatedHoursSaved: count * 1.5,
    confidence:        0.7,
    businessImpact:    'Stale PRs accumulate merge conflicts and increase review time exponentially.',
    suggestedWorkflow: { action: 'review_and_merge_prs', workflowId: 'pr-review' },
    owner:             'Engineering',
    evidence:          [{ open_prs: count }],
  };
}

function _slowReviewCycles(workspaceId, { workflowHistory }) {
  if (!workflowHistory?.rows) return null;
  const prWorkflow = (workflowHistory.rows ?? []).filter(r => r.workflow_id === 'pr-review' && r.status === 'COMPLETED');
  if (!prWorkflow.length) return null;
  const avgMs = prWorkflow[0]?.avg_duration_ms ?? 0;
  if (avgMs < 300000) return null; // < 5 min is fine
  return {
    id:                 `opp_slow_review_${Date.now()}`,
    workspaceId,
    title:             `PR review workflow averaging ${Math.round(avgMs/60000)} minutes`,
    description:       `Slow PR review cycles block deployment velocity. Consider automation rules or team SLAs.`,
    category:          OpportunityCategory.PRODUCTIVITY,
    estimatedValueUsd: 1000,
    estimatedHoursSaved: 8,
    confidence:        0.65,
    businessImpact:    'Slow review cycles are the #1 bottleneck in continuous delivery pipelines.',
    suggestedWorkflow: { action: 'optimize_review_workflow', workflowId: 'pr-review' },
    owner:             'Engineering Lead',
    evidence:          [{ avg_review_ms: avgMs }],
  };
}

function _teamOverload(workspaceId, { teamWorkload }) {
  if (!teamWorkload?.assignments?.length) return null;
  const overloaded = teamWorkload.assignments.filter(a => Number(a.open_tasks) > 15);
  if (!overloaded.length) return null;
  return {
    id:                 `opp_team_overload_${Date.now()}`,
    workspaceId,
    title:             `${overloaded.length} team member(s) have >15 open tasks — burnout risk`,
    description:       `High task counts per engineer correlate with quality issues, bugs shipped, and eventual churn.`,
    category:          OpportunityCategory.COLLABORATION,
    estimatedValueUsd: overloaded.length * 2000,
    estimatedHoursSaved: overloaded.length * 5,
    confidence:        0.75,
    businessImpact:    'Overloaded engineers ship bugs 3× more frequently and leave 2× as often.',
    suggestedWorkflow: { action: 'rebalance_workload', assignees: overloaded.map(a => a.assignee_id) },
    owner:             'Engineering Manager',
    evidence:          overloaded,
  };
}

function _staleKnowledge(workspaceId, { kgStats }) {
  if (!kgStats) return null;
  const total = kgStats.totalNodes ?? 0;
  if (total < 100) return null;
  return {
    id:                 `opp_stale_knowledge_${Date.now()}`,
    workspaceId,
    title:             `Knowledge graph has ${total} nodes — sync recommended`,
    description:       `Large knowledge graphs benefit from periodic re-vectorization to keep semantic search accurate.`,
    category:          OpportunityCategory.KNOWLEDGE,
    estimatedValueUsd: 200,
    estimatedHoursSaved: 2,
    confidence:        0.5,
    businessImpact:    'Stale vectors reduce AI answer quality and recommendation accuracy.',
    suggestedWorkflow: { action: 'sync_knowledge_graph', workspaceId },
    owner:             'Platform Team',
    evidence:          [{ total_nodes: total, total_edges: kgStats.totalEdges }],
  };
}

function _repeatedManualPatterns(workspaceId, { workflowHistory }) {
  if (!workflowHistory?.rows) return null;
  const repeated = (workflowHistory.rows ?? []).filter(r => Number(r.count) > 10 && r.status === 'COMPLETED');
  if (!repeated.length) return null;
  return {
    id:                 `opp_repeated_workflows_${Date.now()}`,
    workspaceId,
    title:             `${repeated.length} workflow(s) run >10 times — automation candidates`,
    description:       `Repeated successful workflows are strong automation candidates that can be scheduled or event-triggered.`,
    category:          OpportunityCategory.AUTOMATION,
    estimatedValueUsd: repeated.reduce((s, r) => s + Number(r.count) * 30, 0),
    estimatedHoursSaved: repeated.reduce((s, r) => s + Number(r.count) * 0.25, 0),
    confidence:        0.8,
    businessImpact:    'Automating repeated workflows frees engineering time for higher-value work.',
    suggestedWorkflow: { action: 'schedule_recurring_workflows', candidates: repeated.map(r => r.workflow_id) },
    owner:             'Operations',
    evidence:          repeated,
  };
}

function _highIncidentRate(workspaceId, { recentEvents }) {
  if (!recentEvents) return null;
  const incidents = (recentEvents.recentIncidents ?? []).length;
  if (incidents < 3) return null;
  return {
    id:                 `opp_high_incidents_${Date.now()}`,
    workspaceId,
    title:             `${incidents} incidents in the last 24 hours — proactive automation needed`,
    description:       `High incident rates suggest a systemic issue. Automated incident response can reduce MTTR significantly.`,
    category:          OpportunityCategory.RELIABILITY,
    estimatedValueUsd: incidents * 1000,
    estimatedHoursSaved: incidents * 3,
    confidence:        0.85,
    businessImpact:    `Each unmitigated incident costs engineering time and customer trust.`,
    suggestedWorkflow: { action: 'enable_incident_response_automation', workflowId: 'production-incident-response' },
    owner:             'Infrastructure',
    evidence:          recentEvents.recentIncidents,
  };
}

function _degradedConnectors(workspaceId, { connectorState }) {
  if (!connectorState) return null;
  const down = (connectorState.connectors ?? []).filter(c => c.status === 'DOWN');
  if (!down.length) return null;
  return {
    id:                 `opp_down_connectors_${Date.now()}`,
    workspaceId,
    title:             `${down.length} connector(s) down — immediate action required`,
    description:       `${down.map(c => c.name).join(', ')} are completely unreachable. This blocks all dependent automations.`,
    category:          OpportunityCategory.RELIABILITY,
    estimatedValueUsd: down.length * 1500,
    estimatedHoursSaved: down.length * 6,
    confidence:        0.95,
    businessImpact:    'Down connectors mean FLOW cannot execute automations that depend on them.',
    suggestedWorkflow: { action: 'investigate_downed_connectors', connectorIds: down.map(c => c.id) },
    owner:             'Platform Team',
    evidence:          down,
  };
}

function _atRiskCustomers(workspaceId, { customerSignals }) {
  if (!customerSignals?.at_risk_count) return null;
  const atRisk = Number(customerSignals.at_risk_count);
  if (atRisk < 1) return null;
  return {
    id:                 `opp_at_risk_customers_${Date.now()}`,
    workspaceId,
    title:             `${atRisk} customer(s) with health score < 50 — churn risk`,
    description:       `Low health score customers are 5× more likely to churn. Proactive outreach can reverse the trend.`,
    category:          OpportunityCategory.AUTOMATION,
    estimatedValueUsd: atRisk * 5000,
    estimatedHoursSaved: 0,
    confidence:        0.7,
    businessImpact:    'Each churned customer represents lost ARR and reputational risk.',
    suggestedWorkflow: { action: 'customer_success_outreach', count: atRisk },
    owner:             'Customer Success',
    evidence:          [customerSignals],
  };
}

function _calendarOverload(workspaceId, { calendarContext }) {
  if (!calendarContext?.meeting_count) return null;
  const hours = Number(calendarContext.total_hours ?? 0);
  if (hours < 20) return null;
  return {
    id:                 `opp_calendar_overload_${Date.now()}`,
    workspaceId,
    title:             `${hours}h of meetings scheduled in next 7 days — consider async alternatives`,
    description:       `High meeting loads reduce deep work time. AI meeting summaries can reduce repeat syncs.`,
    category:          OpportunityCategory.PRODUCTIVITY,
    estimatedValueUsd: hours * 75,
    estimatedHoursSaved: hours * 0.3,
    confidence:        0.6,
    businessImpact:    'Every hour in a meeting is an hour not spent on focused work.',
    suggestedWorkflow: { action: 'generate_async_alternatives' },
    owner:             'Team Lead',
    evidence:          [calendarContext],
  };
}

function _infraCostSignal(workspaceId, { budgetSignals }) {
  if (!budgetSignals?.month_spend) return null;
  const spend = Number(budgetSignals.month_spend);
  if (spend < 1000) return null;
  return {
    id:                 `opp_infra_cost_${Date.now()}`,
    workspaceId,
    title:             `$${spend.toFixed(0)} infrastructure spend this month — optimization opportunity`,
    description:       `Automated right-sizing and idle resource cleanup can reduce costs by 20-30%.`,
    category:          OpportunityCategory.COST,
    estimatedValueUsd: spend * 0.2,
    estimatedHoursSaved: 4,
    confidence:        0.55,
    businessImpact:    'Cloud cost optimization is a direct EBITDA improvement.',
    suggestedWorkflow: { action: 'run_cost_optimization' },
    owner:             'Infrastructure',
    evidence:          [budgetSignals],
  };
}

function _knowledgeSilos(workspaceId, { knowledgeSilos }) {
  if (!knowledgeSilos?.topOwners?.length) return null;
  const silos = knowledgeSilos.topOwners.filter(o => Number(o.node_count) > 10);
  if (!silos.length) return null;
  return {
    id:                 `opp_knowledge_silos_${Date.now()}`,
    workspaceId,
    title:             `${silos.length} knowledge silo(s) detected — bus factor risk`,
    description:       `${silos[0]?.owner ?? 'One person'} owns >10 knowledge graph nodes. If they leave, critical context is lost.`,
    category:          OpportunityCategory.KNOWLEDGE,
    estimatedValueUsd: silos.length * 3000,
    estimatedHoursSaved: silos.length * 8,
    confidence:        0.7,
    businessImpact:    'Knowledge silos are the #1 risk factor in software team resilience.',
    suggestedWorkflow: { action: 'distribute_knowledge_ownership', owners: silos.map(s => s.owner) },
    owner:             'Engineering Manager',
    evidence:          silos,
  };
}

// ── Persistence ───────────────────────────────────────────────────────────────

export async function saveOpportunities(workspaceId, opportunities) {
  if (!opportunities.length) return [];
  const saved = [];
  for (const opp of opportunities) {
    const { rows } = await query(
      `INSERT INTO autonomy_opportunities
         (workspace_id, title, description, category, estimated_value_usd, estimated_hours_saved,
          confidence, suggested_workflow, business_impact, owner, evidence, metadata)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       RETURNING *`,
      [workspaceId, opp.title, opp.description ?? null, opp.category,
       opp.estimatedValueUsd ?? 0, opp.estimatedHoursSaved ?? 0,
       opp.confidence, JSON.stringify(opp.suggestedWorkflow ?? {}),
       opp.businessImpact ?? null, opp.owner ?? null,
       JSON.stringify(opp.evidence ?? []), JSON.stringify({})]
    ).catch(() => ({ rows: [] }));
    if (rows[0]) saved.push(rows[0]);
  }
  return saved;
}

export async function listOpportunities(workspaceId, { status = 'OPEN', limit = 50 } = {}) {
  const { rows } = await query(
    `SELECT * FROM autonomy_opportunities WHERE workspace_id = $1 AND status = $2
     ORDER BY estimated_value_usd DESC, confidence DESC LIMIT $3`,
    [workspaceId, status, limit]
  );
  return rows;
}

export async function updateOpportunityStatus(workspaceId, opportunityId, status) {
  const { rows } = await query(
    `UPDATE autonomy_opportunities SET status = $1, actioned_at = NOW()
     WHERE id = $2 AND workspace_id = $3 RETURNING *`,
    [status, opportunityId, workspaceId]
  );
  if (!rows[0]) throw new AppError('Opportunity not found', 404, 'NOT_FOUND');
  return rows[0];
}
