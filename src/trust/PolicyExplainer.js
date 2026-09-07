/**
 * PolicyExplainer — Trust Center
 *
 * Explains WHY a connector action was blocked, what policy triggered the
 * denial, who owns it, what the approval path is, and what the user can
 * do next. Reads from existing governance tables only.
 *
 * Tables: policies, pending_approvals, audit_logs
 */

import { query } from '../config/db.js';
import { DEFAULT_ROLE_PERMISSIONS as ROLE_ACTION_MATRIX, Effect } from '../core/governance/constants.js';

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Explain a policy denial for a connector action.
 * Pass the pending_approval ID or the audit_log ID for the denial event.
 */
export async function explainPolicyDenial(id, workspaceId) {
  const [fromApproval, fromAudit] = await Promise.allSettled([
    _fromApproval(id, workspaceId),
    _fromAudit(id, workspaceId),
  ]);

  const match = [fromApproval, fromAudit].find(r => r.status === 'fulfilled' && r.value !== null);
  if (match) return match.value;
  return _notFound(id);
}

/**
 * Explain what policies are active for a connector + action combination.
 * Used by the UI to preview what will happen BEFORE executing.
 */
export async function explainPolicyPreview(workspaceId, { connector, actionType, role }) {
  const policies = await _getPoliciesForAction(workspaceId, connector, actionType);
  const defaultMatrix = _checkDefaultMatrix(role, connector, actionType);

  const appliedPolicies = policies.filter(p => p.enabled);
  const denyPolicy = appliedPolicies.find(p => p.effect === 'DENY');
  const requiresApproval = appliedPolicies.find(p => p.effect === 'REQUIRE_APPROVAL');

  let effect = Effect.ALLOW;
  let triggeringPolicy = null;

  if (denyPolicy) {
    effect = Effect.DENY;
    triggeringPolicy = denyPolicy;
  } else if (requiresApproval) {
    effect = Effect.REQUIRE_APPROVAL;
    triggeringPolicy = requiresApproval;
  } else if (defaultMatrix.effect !== Effect.ALLOW) {
    effect = defaultMatrix.effect;
  }

  return {
    connector,
    actionType,
    role,
    effect,
    triggeringPolicy: triggeringPolicy ? _formatPolicy(triggeringPolicy) : null,
    defaultMatrixEffect: defaultMatrix.effect,
    defaultMatrixReason: defaultMatrix.reason,
    appliedPolicies: appliedPolicies.map(_formatPolicy),
    inactivePolicies: policies.filter(p => !p.enabled).map(_formatPolicy),
    approvalPath: _buildApprovalPath(effect, appliedPolicies),
    whatYouCanDo: _buildNextSteps(effect, triggeringPolicy, role),
  };
}

/**
 * List all active policies for a workspace.
 */
export async function listPolicies(workspaceId, { connector = null, effect = null } = {}) {
  let sql = `SELECT * FROM policies WHERE workspace_id = $1`;
  const params = [workspaceId];

  if (connector) { params.push(connector); sql += ` AND connector_id = $${params.length}`; }
  if (effect)    { params.push(effect);    sql += ` AND effect = $${params.length}`; }

  sql += ` ORDER BY created_at DESC`;

  const { rows } = await query(sql, params).catch(() => ({ rows: [] }));
  return rows.map(_formatPolicy);
}

// ── Internal ──────────────────────────────────────────────────────────────────

async function _fromApproval(id, workspaceId) {
  const { rows } = await query(
    `SELECT pa.*, p.name AS policy_name, p.description AS policy_desc,
            p.effect AS policy_effect, p.conditions, p.created_by AS policy_owner
     FROM pending_approvals pa
     LEFT JOIN policies p ON p.id = pa.policy_id
     WHERE pa.id = $1 AND pa.workspace_id = $2`,
    [id, workspaceId]
  ).catch(() => ({ rows: [] }));
  if (!rows[0]) return null;

  const a = rows[0];
  return _buildExplanation(a, workspaceId);
}

async function _fromAudit(id, workspaceId) {
  const { rows } = await query(
    `SELECT al.*, p.name AS policy_name, p.description AS policy_desc,
            p.effect AS policy_effect, p.conditions, p.created_by AS policy_owner
     FROM audit_logs al
     LEFT JOIN policies p ON p.id = (al.metadata->>'policyId')::uuid
     WHERE al.id = $1 AND al.workspace_id = $2
       AND al.outcome IN ('denied','approval_required')`,
    [id, workspaceId]
  ).catch(() => ({ rows: [] }));
  if (!rows[0]) return null;

  const al   = rows[0];
  const meta = _parseJson(al.metadata, {});
  return _buildExplanation({ ...al, ...meta, action_type: al.action }, workspaceId);
}

async function _getPoliciesForAction(workspaceId, connector, actionType) {
  const { rows } = await query(
    `SELECT * FROM policies
     WHERE workspace_id = $1
       AND (connector_id = $2 OR connector_id IS NULL)
       AND (action_type = $3 OR action_type IS NULL)
     ORDER BY priority DESC NULLS LAST`,
    [workspaceId, connector, actionType]
  ).catch(() => ({ rows: [] }));
  return rows;
}

function _checkDefaultMatrix(role, connector, actionType) {
  if (!role || !ROLE_ACTION_MATRIX) return { effect: Effect.ALLOW, reason: 'No matrix check performed.' };
  const roleEntry = ROLE_ACTION_MATRIX[role];
  if (!roleEntry) return { effect: Effect.ALLOW, reason: `No matrix entry for role ${role}.` };

  const key = `${connector}:${actionType}`;
  const wildcard = actionType;
  const matched = roleEntry[key] ?? roleEntry[wildcard] ?? roleEntry['*'];

  if (!matched) return { effect: Effect.ALLOW, reason: 'Action allowed by default (not in deny list).' };
  return { effect: matched, reason: `Default matrix rule for role ${role}: ${matched}` };
}

function _buildExplanation(record, workspaceId) {
  const conditions = _parseJson(record.conditions, {});

  return {
    id:          record.id,
    type:        record.status ? 'PENDING_APPROVAL' : 'AUDIT_DENIAL',
    action:      record.action_type ?? record.action,
    connector:   record.connector_id ?? record.connector,
    status:      record.status ?? record.outcome,
    riskLevel:   record.risk_level ?? null,
    requestedBy: record.requested_by ?? record.actor_id,

    policy: record.policy_name ? {
      id:          record.policy_id,
      name:        record.policy_name,
      description: record.policy_desc,
      effect:      record.policy_effect ?? record.effect ?? 'DENY',
      conditions,
      owner:       record.policy_owner,
    } : null,

    whyBlocked: _buildWhyBlocked(record),
    approvalPath: _buildApprovalPath(record.effect ?? record.policy_effect, []),
    whatYouCanDo: _buildNextSteps(record.effect ?? record.policy_effect, record, null),

    createdAt: record.created_at,
    workspaceId,
  };
}

function _buildWhyBlocked(record) {
  if (record.policy_name) {
    return `The policy "${record.policy_name}" ${record.policy_effect === 'REQUIRE_APPROVAL' ? 'requires approval from an ADMIN or OWNER' : 'denies this action'} for the action "${record.action_type ?? record.action}".`;
  }
  if (record.reason) return record.reason;
  return `The action "${record.action_type ?? record.action}" was blocked by workspace governance rules.`;
}

function _buildApprovalPath(effect, policies) {
  if (effect !== Effect.REQUIRE_APPROVAL && effect !== 'REQUIRE_APPROVAL') return null;
  const approvalPolicy = policies.find(p => p.effect === 'REQUIRE_APPROVAL') ?? {};
  return {
    steps: [
      { step: 1, label: 'Action requested',       status: 'complete' },
      { step: 2, label: 'Pending approval',        status: 'pending' },
      { step: 3, label: 'ADMIN/OWNER reviews',     status: 'waiting', note: `Required by: ${approvalPolicy.name ?? 'workspace policy'}` },
      { step: 4, label: 'Action executed (if approved)', status: 'waiting' },
      { step: 5, label: 'Audit recorded',          status: 'waiting' },
    ],
    estimatedWaitTime: '< 24 hours (48h TTL on approval requests)',
    whoCanApprove: ['ADMIN', 'OWNER'],
  };
}

function _buildNextSteps(effect, policy, role) {
  if (effect === Effect.DENY || effect === 'DENY') {
    return [
      'Contact a workspace OWNER to update or disable the blocking policy.',
      policy?.name ? `Policy "${policy.name}" is preventing this action.` : null,
      role === 'MEMBER' ? 'Members cannot override DENY policies — escalate to an ADMIN.' : null,
    ].filter(Boolean);
  }
  if (effect === Effect.REQUIRE_APPROVAL || effect === 'REQUIRE_APPROVAL') {
    return [
      'An ADMIN or OWNER must approve this action before it can execute.',
      'Navigate to the Approvals page to track the request.',
      'You will be notified when the request is approved or rejected.',
    ];
  }
  return ['This action is allowed. No further steps required.'];
}

function _formatPolicy(p) {
  return {
    id:          p.id,
    name:        p.name,
    description: p.description,
    effect:      p.effect,
    connectorId: p.connector_id,
    actionType:  p.action_type,
    conditions:  _parseJson(p.conditions, {}),
    enabled:     p.enabled ?? true,
    priority:    p.priority,
    createdBy:   p.created_by,
    createdAt:   p.created_at,
  };
}

function _parseJson(v, fallback) {
  if (!v) return fallback;
  if (typeof v === 'object') return v;
  try { return JSON.parse(v); } catch { return fallback; }
}

function _notFound(id) {
  return { id, type: 'UNKNOWN', whyBlocked: 'No denial record found for this ID.', policy: null, approvalPath: null, whatYouCanDo: [] };
}
