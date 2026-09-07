/**
 * DecisionExplainer — Trust Center
 *
 * Generates human-readable explanations for any FLOW decision:
 * executive briefings, recommendations, workflow executions,
 * autonomous actions, approvals, and RAG query answers.
 *
 * Reads ONLY from existing tables:
 *   briefings, briefing_recommendations, execution_records,
 *   pending_approvals, audit_logs, autonomy_runs, autonomy_opportunities.
 *
 * Never modifies data. Never calls AI providers directly.
 */

import { query } from '../config/db.js';

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Explain any platform decision by ID.
 * Tries each decision type in order; returns the first match.
 */
export async function explainDecision(id, workspaceId) {
  const [briefing, execution, approval, autonomy] = await Promise.allSettled([
    _explainBriefing(id, workspaceId),
    _explainExecution(id, workspaceId),
    _explainApproval(id, workspaceId),
    _explainAutonomyRun(id, workspaceId),
  ]);

  const match = [briefing, execution, approval, autonomy].find(
    r => r.status === 'fulfilled' && r.value !== null
  );

  if (match) return match.value;
  return _notFound(id);
}

/**
 * Explain a specific recommendation by briefing_recommendation ID.
 */
export async function explainRecommendation(recommendationId, workspaceId) {
  const { rows } = await query(
    `SELECT br.*, b.workspace_id, b.role, b.created_at AS briefing_created_at
     FROM briefing_recommendations br
     JOIN briefings b ON b.id = br.briefing_id
     WHERE br.id = $1 AND b.workspace_id = $2`,
    [recommendationId, workspaceId]
  ).catch(() => ({ rows: [] }));

  if (!rows[0]) return _notFound(recommendationId);
  const rec = rows[0];

  const evidence     = _parseJson(rec.evidence, []);
  const alternatives = _parseJson(rec.alternatives, []);

  return {
    id:          recommendationId,
    type:        'RECOMMENDATION',
    title:       rec.title ?? 'Untitled Recommendation',
    reason:      rec.reasoning ?? rec.description ?? 'No reasoning recorded.',
    confidence:  rec.confidence ?? null,
    model:       rec.model_used ?? null,
    promptVersion: rec.prompt_version ?? null,
    evidenceSources: evidence,
    knowledgeEntities: _extractEntities(evidence),
    alternativesConsidered: alternatives,
    whyAlternativesRejected: rec.why_rejected ?? null,
    briefingRole: rec.role,
    generatedAt:  rec.briefing_created_at,
    workspaceId,
  };
}

/**
 * List all explainable decisions for a workspace (recent 50).
 */
export async function listExplainableDecisions(workspaceId, { limit = 50, type = null } = {}) {
  const decisions = await Promise.allSettled([
    _listBriefings(workspaceId, Math.ceil(limit / 4)),
    _listExecutions(workspaceId, Math.ceil(limit / 4)),
    _listApprovals(workspaceId, Math.ceil(limit / 4)),
    _listAutonomyRuns(workspaceId, Math.ceil(limit / 4)),
  ]);

  const all = decisions
    .filter(r => r.status === 'fulfilled')
    .flatMap(r => r.value)
    .filter(d => !type || d.type === type)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, limit);

  return { decisions: all, total: all.length };
}

// ── Type-specific explainers ──────────────────────────────────────────────────

async function _explainBriefing(id, workspaceId) {
  const { rows } = await query(
    `SELECT b.*,
            COALESCE(
              json_agg(br.*) FILTER (WHERE br.id IS NOT NULL), '[]'
            ) AS recommendations
     FROM briefings b
     LEFT JOIN briefing_recommendations br ON br.briefing_id = b.id
     WHERE b.id = $1 AND b.workspace_id = $2
     GROUP BY b.id`,
    [id, workspaceId]
  ).catch(() => ({ rows: [] }));
  if (!rows[0]) return null;

  const b   = rows[0];
  const recs = _parseJson(b.recommendations, []);

  return {
    id,
    type:       'BRIEFING',
    title:      `Executive Briefing — ${b.role ?? 'All'}`,
    reason:     b.summary ?? 'Operational intelligence briefing generated from workspace signals.',
    confidence: _avgConfidence(recs),
    model:      b.model_used ?? process.env.GEMINI_MODEL ?? 'gemini-2.5-flash',
    promptVersion: b.prompt_version ?? '1.0',
    evidenceSources: _parseJson(b.evidence, []),
    knowledgeEntities: _parseJson(b.graph_entities, []),
    alternativesConsidered: [],
    whyAlternativesRejected: null,
    recommendations: recs.map(r => ({
      id:         r.id,
      title:      r.title,
      confidence: r.confidence,
      type:       r.type,
    })),
    generatedAt: b.created_at,
    workspaceId,
  };
}

async function _explainExecution(id, workspaceId) {
  const { rows } = await query(
    `SELECT er.*, al.action, al.actor_id, al.metadata AS audit_meta
     FROM execution_records er
     LEFT JOIN audit_logs al ON al.resource_id = er.id::text AND al.workspace_id = $2
     WHERE er.id = $1 AND er.workspace_id = $2
     LIMIT 1`,
    [id, workspaceId]
  ).catch(() => ({ rows: [] }));
  if (!rows[0]) return null;

  const e    = rows[0];
  const plan = _parseJson(e.plan, {});

  return {
    id,
    type:       'EXECUTION',
    title:      plan.title ?? `Execution ${id.slice(0, 8)}`,
    reason:     plan.reasoning ?? plan.description ?? 'Action executed via governed execution pipeline.',
    confidence: e.confidence ?? null,
    model:      e.model_used ?? null,
    promptVersion: null,
    evidenceSources: _parseJson(e.evidence, []),
    knowledgeEntities: _parseJson(e.graph_context, []),
    alternativesConsidered: _parseJson(plan.alternatives, []),
    whyAlternativesRejected: plan.selected_rationale ?? null,
    riskLevel:  e.risk_level ?? null,
    status:     e.status,
    actorId:    e.actor_id ?? e.audit_meta?.actorId,
    generatedAt: e.created_at,
    workspaceId,
  };
}

async function _explainApproval(id, workspaceId) {
  const { rows } = await query(
    `SELECT pa.*, p.name AS policy_name, p.description AS policy_desc
     FROM pending_approvals pa
     LEFT JOIN policies p ON p.id = pa.policy_id
     WHERE pa.id = $1 AND pa.workspace_id = $2`,
    [id, workspaceId]
  ).catch(() => ({ rows: [] }));
  if (!rows[0]) return null;

  const a      = rows[0];
  const meta   = _parseJson(a.metadata, {});

  return {
    id,
    type:       'APPROVAL',
    title:      `Approval Request — ${a.action_type ?? 'Unknown Action'}`,
    reason:     meta.reasoning ?? `Action requires ${a.risk_level ?? 'elevated'} risk approval.`,
    confidence: null,
    model:      null,
    promptVersion: null,
    evidenceSources: meta.evidence ?? [],
    knowledgeEntities: [],
    alternativesConsidered: [],
    whyAlternativesRejected: null,
    riskLevel:  a.risk_level,
    status:     a.status,
    requestedBy: a.requested_by,
    approvedBy: a.approved_by,
    policyName: a.policy_name,
    policyDescription: a.policy_desc,
    generatedAt: a.created_at,
    workspaceId,
  };
}

async function _explainAutonomyRun(id, workspaceId) {
  const { rows } = await query(
    `SELECT * FROM autonomy_runs WHERE id = $1 AND workspace_id = $2`,
    [id, workspaceId]
  ).catch(() => ({ rows: [] }));
  if (!rows[0]) return null;

  const r      = rows[0];
  const result = _parseJson(r.result, {});
  const ctx    = _parseJson(r.context, {});

  return {
    id,
    type:       'AUTONOMY_RUN',
    title:      `Autonomous Planning Cycle — ${new Date(r.started_at).toLocaleString()}`,
    reason:     result.summary ?? 'Autonomous planning cycle executed.',
    confidence: result.avgConfidence ?? null,
    model:      null,
    promptVersion: null,
    evidenceSources: result.evidenceSources ?? [],
    knowledgeEntities: ctx.graphEntities ?? [],
    alternativesConsidered: result.rejectedCandidates ?? [],
    whyAlternativesRejected: 'Ranked below confidence/priority threshold.',
    actionsQueued: result.actionsQueued ?? 0,
    triggeredBy: r.triggered_by,
    status:     r.status,
    generatedAt: r.started_at,
    workspaceId,
  };
}

// ── List helpers ──────────────────────────────────────────────────────────────

async function _listBriefings(workspaceId, limit) {
  const { rows } = await query(
    `SELECT id, role, summary, created_at FROM briefings WHERE workspace_id = $1 ORDER BY created_at DESC LIMIT $2`,
    [workspaceId, limit]
  ).catch(() => ({ rows: [] }));
  return rows.map(r => ({ id: r.id, type: 'BRIEFING', title: `Briefing — ${r.role ?? 'All'}`, createdAt: r.created_at }));
}

async function _listExecutions(workspaceId, limit) {
  const { rows } = await query(
    `SELECT id, status, plan, created_at FROM execution_records WHERE workspace_id = $1 ORDER BY created_at DESC LIMIT $2`,
    [workspaceId, limit]
  ).catch(() => ({ rows: [] }));
  return rows.map(r => {
    const plan = _parseJson(r.plan, {});
    return { id: r.id, type: 'EXECUTION', title: plan.title ?? `Execution ${r.id.slice(0,8)}`, status: r.status, createdAt: r.created_at };
  });
}

async function _listApprovals(workspaceId, limit) {
  const { rows } = await query(
    `SELECT id, action_type, status, risk_level, created_at FROM pending_approvals WHERE workspace_id = $1 ORDER BY created_at DESC LIMIT $2`,
    [workspaceId, limit]
  ).catch(() => ({ rows: [] }));
  return rows.map(r => ({ id: r.id, type: 'APPROVAL', title: `Approval — ${r.action_type}`, status: r.status, createdAt: r.created_at }));
}

async function _listAutonomyRuns(workspaceId, limit) {
  const { rows } = await query(
    `SELECT id, status, triggered_by, started_at FROM autonomy_runs WHERE workspace_id = $1 ORDER BY started_at DESC LIMIT $2`,
    [workspaceId, limit]
  ).catch(() => ({ rows: [] }));
  return rows.map(r => ({ id: r.id, type: 'AUTONOMY_RUN', title: `Autonomy Cycle — ${new Date(r.started_at).toLocaleDateString()}`, status: r.status, createdAt: r.started_at }));
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function _parseJson(v, fallback) {
  if (!v) return fallback;
  if (typeof v === 'object') return v;
  try { return JSON.parse(v); } catch { return fallback; }
}

function _avgConfidence(recs) {
  const confs = recs.map(r => r.confidence).filter(c => c != null);
  if (!confs.length) return null;
  return Math.round(confs.reduce((s, c) => s + c, 0) / confs.length);
}

function _extractEntities(evidence) {
  if (!Array.isArray(evidence)) return [];
  return evidence
    .filter(e => e.type === 'graph_node' || e.node_id || e.entityId)
    .map(e => ({ id: e.node_id ?? e.entityId ?? e.id, type: e.nodeType ?? e.type, label: e.label ?? e.name }));
}

function _notFound(id) {
  return { id, type: 'UNKNOWN', title: 'Decision Not Found', reason: 'No decision record found for this ID.', evidenceSources: [], knowledgeEntities: [], alternativesConsidered: [] };
}
