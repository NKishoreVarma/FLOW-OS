/**
 * AutonomyPolicyEngine — Module 9
 *
 * Manages autonomy LEVELS (0–5) per workspace, department, workflow, action,
 * or connector scope. This is separate from the governance policy engine —
 * it controls HOW MUCH FLOW can do autonomously, not WHAT it is permitted to do.
 *
 * Level 0 — Observe only (collect state, no recommendations surfaced)
 * Level 1 — Recommend only (surface recommendations, humans decide all)
 * Level 2 — Assist (auto-execute LOW risk; human required for MEDIUM+)
 * Level 3 — Supervised (auto-execute LOW+MEDIUM; human required for HIGH+)
 * Level 4 — Semi-autonomous (auto-execute LOW+MEDIUM+HIGH; human required for CRITICAL)
 * Level 5 — Fully autonomous (auto-execute everything within governance limits)
 */

import { query }                         from '../config/db.js';
import { ValidationError, AppError }     from '../core/errors/index.js';

export const AUTONOMY_LEVELS = Object.freeze({
  OBSERVE_ONLY:      0,
  RECOMMEND_ONLY:    1,
  ASSIST:            2,
  SUPERVISED:        3,
  SEMI_AUTONOMOUS:   4,
  FULLY_AUTONOMOUS:  5,
});

const LEVEL_LABELS = ['OBSERVE_ONLY', 'RECOMMEND_ONLY', 'ASSIST', 'SUPERVISED', 'SEMI_AUTONOMOUS', 'FULLY_AUTONOMOUS'];

const RISK_AUTO_THRESHOLD = {
  0: [],
  1: [],
  2: ['LOW'],
  3: ['LOW', 'MEDIUM'],
  4: ['LOW', 'MEDIUM', 'HIGH'],
  5: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
};

const DEFAULT_POLICY = {
  autonomy_level:       1,
  max_risk_level:       'LOW',
  require_human_review: true,
  max_cost_per_run_usd: 0,
  allowed_connectors:   [],
  blocked_action_ids:   [],
  schedule_cron:        null,
  run_interval_ms:      900000,
  enabled:              true,
};

// ── CRUD ──────────────────────────────────────────────────────────────────────

export async function createPolicy(workspaceId, data) {
  _validatePolicy(data);
  const {
    scope = 'workspace', scopeId = null,
    autonomyLevel = 1, maxRiskLevel = 'LOW',
    requireHumanReview = true, maxCostPerRunUsd = 0,
    allowedConnectors = [], blockedActionIds = [],
    scheduleCron = null, runIntervalMs = 900000, enabled = true,
  } = data;

  const { rows } = await query(
    `INSERT INTO autonomy_policies
       (workspace_id, scope, scope_id, autonomy_level, max_risk_level,
        require_human_review, max_cost_per_run_usd, allowed_connectors,
        blocked_action_ids, schedule_cron, run_interval_ms, enabled)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     ON CONFLICT (workspace_id, scope, COALESCE(scope_id,''))
     DO UPDATE SET
       autonomy_level       = EXCLUDED.autonomy_level,
       max_risk_level       = EXCLUDED.max_risk_level,
       require_human_review = EXCLUDED.require_human_review,
       max_cost_per_run_usd = EXCLUDED.max_cost_per_run_usd,
       allowed_connectors   = EXCLUDED.allowed_connectors,
       blocked_action_ids   = EXCLUDED.blocked_action_ids,
       schedule_cron        = EXCLUDED.schedule_cron,
       run_interval_ms      = EXCLUDED.run_interval_ms,
       enabled              = EXCLUDED.enabled,
       updated_at           = NOW()
     RETURNING *`,
    [workspaceId, scope, scopeId, autonomyLevel, maxRiskLevel,
     requireHumanReview, maxCostPerRunUsd,
     JSON.stringify(allowedConnectors), JSON.stringify(blockedActionIds),
     scheduleCron, runIntervalMs, enabled]
  );
  return rows[0];
}

export async function listPolicies(workspaceId) {
  const { rows } = await query(
    `SELECT * FROM autonomy_policies WHERE workspace_id = $1 ORDER BY scope, created_at`,
    [workspaceId]
  );
  return rows;
}

export async function getPolicy(workspaceId, policyId) {
  const { rows } = await query(
    'SELECT * FROM autonomy_policies WHERE id = $1 AND workspace_id = $2',
    [policyId, workspaceId]
  );
  if (!rows[0]) throw new AppError('Policy not found', 404, 'POLICY_NOT_FOUND');
  return rows[0];
}

export async function updatePolicy(workspaceId, policyId, updates) {
  _validatePolicy(updates);
  const allowed = ['autonomy_level','max_risk_level','require_human_review',
    'max_cost_per_run_usd','allowed_connectors','blocked_action_ids',
    'schedule_cron','run_interval_ms','enabled'];

  const setClauses = [];
  const vals       = [];

  for (const [key, val] of Object.entries(updates)) {
    const col = _camel2snake(key);
    if (!allowed.includes(col)) continue;
    const v = ['allowed_connectors','blocked_action_ids'].includes(col)
      ? JSON.stringify(val) : val;
    setClauses.push(`${col} = $${vals.push(v)}`);
  }
  if (!setClauses.length) throw new ValidationError('No valid fields to update');
  setClauses.push('updated_at = NOW()');

  const wsIdx = vals.push(workspaceId);
  const idIdx = vals.push(policyId);
  const { rows } = await query(
    `UPDATE autonomy_policies SET ${setClauses.join(', ')}
     WHERE workspace_id = $${wsIdx} AND id = $${idIdx} RETURNING *`,
    vals
  );
  if (!rows[0]) throw new AppError('Policy not found', 404, 'POLICY_NOT_FOUND');
  return rows[0];
}

export async function deletePolicy(workspaceId, policyId) {
  const { rowCount } = await query(
    'DELETE FROM autonomy_policies WHERE id = $1 AND workspace_id = $2',
    [policyId, workspaceId]
  );
  if (!rowCount) throw new AppError('Policy not found', 404, 'POLICY_NOT_FOUND');
  return { deleted: true };
}

// ── Policy Resolution ─────────────────────────────────────────────────────────

/**
 * Resolve the effective autonomy policy for a given execution context.
 * Specificity order: action > connector > workflow > department > workspace > default.
 */
export async function resolvePolicy(workspaceId, ctx = {}) {
  const { connectorId, workflowId, actionId, department } = ctx;
  const policies = await listPolicies(workspaceId);

  const policyFor = (scope, scopeId) =>
    policies.find(p => p.scope === scope && p.scope_id === (scopeId ?? null) && p.enabled);

  const effective =
    (actionId    && policyFor('action',     actionId))     ||
    (connectorId && policyFor('connector',  connectorId))  ||
    (workflowId  && policyFor('workflow',   workflowId))   ||
    (department  && policyFor('department', department))   ||
    policyFor('workspace', null)                           ||
    { ...DEFAULT_POLICY, workspace_id: workspaceId };

  return _enrichPolicy(effective);
}

/**
 * Evaluate whether a given action can proceed autonomously.
 * Returns { allowed, reason, requiresApproval, autonomyLevel }
 */
export async function canExecuteAutonomously(workspaceId, ctx = {}) {
  const { riskLevel = 'LOW', connectorId, actionId, estimatedCostUsd = 0 } = ctx;
  const policy = await resolvePolicy(workspaceId, ctx);

  if (!policy.enabled) {
    return { allowed: false, reason: 'Autonomy disabled', requiresApproval: false, autonomyLevel: 0 };
  }

  const level      = policy.autonomy_level;
  const autoRisks  = RISK_AUTO_THRESHOLD[level] ?? [];

  if (level === 0) {
    return { allowed: false, reason: 'Observe-only mode', requiresApproval: false, autonomyLevel: level };
  }

  if (level === 1) {
    return { allowed: false, reason: 'Recommend-only mode', requiresApproval: false, autonomyLevel: level };
  }

  if (!autoRisks.includes(riskLevel)) {
    return { allowed: false, reason: `Risk level ${riskLevel} exceeds autonomy level ${level}`, requiresApproval: true, autonomyLevel: level };
  }

  const blockedActions = policy.blocked_action_ids ?? [];
  if (actionId && blockedActions.includes(actionId)) {
    return { allowed: false, reason: `Action ${actionId} is blocked by policy`, requiresApproval: false, autonomyLevel: level };
  }

  const allowedConns = policy.allowed_connectors ?? [];
  if (connectorId && allowedConns.length > 0 && !allowedConns.includes(connectorId)) {
    return { allowed: false, reason: `Connector ${connectorId} not in allowed list`, requiresApproval: false, autonomyLevel: level };
  }

  const maxCost = Number(policy.max_cost_per_run_usd ?? 0);
  if (maxCost > 0 && estimatedCostUsd > maxCost) {
    return { allowed: false, reason: `Estimated cost $${estimatedCostUsd} exceeds limit $${maxCost}`, requiresApproval: true, autonomyLevel: level };
  }

  return {
    allowed:          true,
    reason:           `Autonomy level ${level} (${LEVEL_LABELS[level]}) permits ${riskLevel} risk`,
    requiresApproval: policy.require_human_review && level < 5,
    autonomyLevel:    level,
  };
}

/**
 * Ensure a default workspace-level policy exists. Called at autonomy engine boot.
 */
export async function ensureDefaultPolicy(workspaceId) {
  const policies = await listPolicies(workspaceId);
  if (policies.some(p => p.scope === 'workspace' && !p.scope_id)) return;
  await createPolicy(workspaceId, { scope: 'workspace' });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _enrichPolicy(policy) {
  const level = Number(policy.autonomy_level ?? 1);
  return {
    ...policy,
    autonomy_level:     level,
    level_label:        LEVEL_LABELS[level] ?? 'UNKNOWN',
    auto_execute_risks: RISK_AUTO_THRESHOLD[level] ?? [],
    allowed_connectors: _parseJson(policy.allowed_connectors, []),
    blocked_action_ids: _parseJson(policy.blocked_action_ids, []),
  };
}

function _parseJson(v, fallback) {
  if (Array.isArray(v)) return v;
  try { return JSON.parse(v); } catch { return fallback; }
}

function _validatePolicy(data) {
  if (data.autonomyLevel !== undefined) {
    const lvl = Number(data.autonomyLevel);
    if (isNaN(lvl) || lvl < 0 || lvl > 5) throw new ValidationError('autonomyLevel must be 0–5');
  }
}

function _camel2snake(s) {
  return s.replace(/([A-Z])/g, m => `_${m.toLowerCase()}`);
}
