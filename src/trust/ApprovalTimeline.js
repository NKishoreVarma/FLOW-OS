/**
 * ApprovalTimeline — Trust Center
 *
 * Builds a visual timeline for every approval request lifecycle:
 *   Generated → Requested → Under Review → Decision → Execution → Completion → Audit
 *
 * Reads from:
 *   pending_approvals, audit_logs, execution_records, notifications
 *
 * Never modifies data.
 */

import { query } from '../config/db.js';

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Build the full visual timeline for a single approval request.
 */
export async function getApprovalTimeline(approvalId, workspaceId) {
  const { rows } = await query(
    `SELECT pa.*,
            p.name AS policy_name,
            er.id AS exec_id, er.status AS exec_status, er.created_at AS exec_at
     FROM pending_approvals pa
     LEFT JOIN policies p       ON p.id = pa.policy_id
     LEFT JOIN execution_records er
               ON er.workspace_id = pa.workspace_id
               AND er.metadata->>'approvalId' = pa.id::text
     WHERE pa.id = $1 AND pa.workspace_id = $2
     LIMIT 1`,
    [approvalId, workspaceId]
  ).catch(() => ({ rows: [] }));

  if (!rows[0]) return null;
  const a = rows[0];

  const auditRows = await _getAuditRows(approvalId, workspaceId);
  const notifRows = await _getNotifications(approvalId, workspaceId);

  const steps = _buildSteps(a, auditRows, notifRows);

  return {
    approvalId,
    workspaceId,
    action:       a.action_type,
    connector:    a.connector_id,
    status:       a.status,
    riskLevel:    a.risk_level,
    requestedBy:  a.requested_by,
    approvedBy:   a.approved_by,
    rejectedBy:   a.rejected_by ?? null,
    policyName:   a.policy_name,
    requiredApprovals: a.required_approvals ?? 1,
    approvalVotes: _parseJson(a.approval_votes, []),
    createdAt:    a.created_at,
    resolvedAt:   a.resolved_at ?? a.updated_at,
    steps,
    timeline: steps.map(s => ({ at: s.at, label: s.label, status: s.status })),
    durationMs:   _calcDuration(a),
    isExpired:    _isExpired(a),
    ttlMs:        _getTtlMs(a),
  };
}

/**
 * List all approval timelines for a workspace (recent 100).
 */
export async function listApprovalTimelines(workspaceId, { status = null, limit = 100 } = {}) {
  let sql = `SELECT id, action_type, connector_id, status, risk_level,
                    requested_by, approved_by, created_at, updated_at
             FROM pending_approvals WHERE workspace_id = $1`;
  const params = [workspaceId];

  if (status) { params.push(status); sql += ` AND status = $${params.length}`; }
  sql += ` ORDER BY created_at DESC LIMIT $${params.length + 1}`;
  params.push(limit);

  const { rows } = await query(sql, params).catch(() => ({ rows: [] }));
  return rows.map(r => ({
    approvalId:  r.id,
    action:      r.action_type,
    connector:   r.connector_id,
    status:      r.status,
    riskLevel:   r.risk_level,
    requestedBy: r.requested_by,
    approvedBy:  r.approved_by,
    createdAt:   r.created_at,
    updatedAt:   r.updated_at,
  }));
}

/**
 * Get approval statistics for the workspace.
 */
export async function getApprovalStats(workspaceId, { days = 30 } = {}) {
  const since = new Date(Date.now() - days * 86400_000).toISOString();
  const { rows } = await query(
    `SELECT status, risk_level, COUNT(*) AS count,
            AVG(EXTRACT(EPOCH FROM (updated_at - created_at))) AS avg_resolution_secs
     FROM pending_approvals
     WHERE workspace_id = $1 AND created_at >= $2
     GROUP BY status, risk_level
     ORDER BY status, risk_level`,
    [workspaceId, since]
  ).catch(() => ({ rows: [] }));

  const stats = { total: 0, byStatus: {}, byRisk: {}, avgResolutionMins: null };
  let totalSecs = 0;
  let resolvedCount = 0;

  for (const r of rows) {
    const count = Number(r.count);
    stats.total += count;
    stats.byStatus[r.status] = (stats.byStatus[r.status] ?? 0) + count;
    if (r.risk_level) stats.byRisk[r.risk_level] = (stats.byRisk[r.risk_level] ?? 0) + count;
    if (r.avg_resolution_secs && ['APPROVED','REJECTED','EXECUTED'].includes(r.status)) {
      totalSecs    += parseFloat(r.avg_resolution_secs) * count;
      resolvedCount += count;
    }
  }
  if (resolvedCount > 0) stats.avgResolutionMins = Math.round(totalSecs / resolvedCount / 60);
  return stats;
}

// ── Internal ──────────────────────────────────────────────────────────────────

async function _getAuditRows(approvalId, workspaceId) {
  const { rows } = await query(
    `SELECT id, action, actor_id, outcome, metadata, created_at
     FROM audit_logs
     WHERE workspace_id = $1
       AND (metadata->>'approvalId' = $2 OR resource_id = $2)
     ORDER BY created_at ASC`,
    [workspaceId, approvalId]
  ).catch(() => ({ rows: [] }));
  return rows;
}

async function _getNotifications(approvalId, workspaceId) {
  const { rows } = await query(
    `SELECT id, type, message, created_at
     FROM notifications
     WHERE workspace_id = $1 AND metadata->>'approvalId' = $2
     ORDER BY created_at ASC`,
    [workspaceId, approvalId]
  ).catch(() => ({ rows: [] }));
  return rows;
}

function _buildSteps(a, auditRows, notifRows) {
  const steps = [];

  // Step 1 — Generated
  steps.push({
    step:   1,
    label:  'Action planned',
    status: 'complete',
    at:     a.created_at,
    detail: `${a.action_type} requested on connector ${a.connector_id}`,
    actor:  a.requested_by,
  });

  // Step 2 — Approval requested
  const requestNotif = notifRows.find(n => n.type?.includes('APPROVAL_REQUIRED'));
  steps.push({
    step:   2,
    label:  'Approval requested',
    status: 'complete',
    at:     requestNotif?.created_at ?? a.created_at,
    detail: `Policy requires ${a.required_approvals ?? 1} approval(s). Risk: ${a.risk_level ?? 'unknown'}.`,
    actor:  null,
  });

  // Step 3 — Under review
  const votes    = _parseJson(a.approval_votes, []);
  const pending  = ['PENDING'].includes(a.status);
  steps.push({
    step:   3,
    label:  pending ? 'Awaiting approver decision' : 'Review completed',
    status: pending ? 'pending' : 'complete',
    at:     null,
    detail: votes.length
      ? `${votes.length} vote(s) recorded: ${votes.map(v => v.decision).join(', ')}`
      : 'No votes recorded yet.',
    actor:  votes[0]?.userId ?? null,
  });

  // Step 4 — Decision
  const resolved = ['APPROVED','REJECTED','EXPIRED'].includes(a.status);
  steps.push({
    step:   4,
    label:  resolved ? `Decision: ${a.status}` : 'Decision pending',
    status: resolved ? 'complete' : 'waiting',
    at:     resolved ? (a.resolved_at ?? a.updated_at) : null,
    detail: a.status === 'REJECTED'
      ? `Rejected by ${a.rejected_by ?? 'approver'}.`
      : a.status === 'EXPIRED'
      ? 'Approval request expired after 48 hours.'
      : a.approved_by
      ? `Approved by ${a.approved_by}.`
      : null,
    actor:  a.approved_by ?? a.rejected_by ?? null,
  });

  // Step 5 — Execution
  const execAudit = auditRows.find(r => r.action === 'connector_action_executed');
  steps.push({
    step:   5,
    label:  execAudit ? 'Action executed' : a.status === 'EXECUTED' ? 'Action executed' : 'Execution pending',
    status: execAudit || a.status === 'EXECUTED' ? 'complete' : 'waiting',
    at:     execAudit?.created_at ?? null,
    detail: execAudit ? `Outcome: ${execAudit.outcome}` : null,
    actor:  execAudit?.actor_id ?? null,
  });

  // Step 6 — Audit recorded
  const auditEntry = auditRows[auditRows.length - 1];
  steps.push({
    step:   6,
    label:  auditEntry ? 'Audit record written' : 'Audit pending',
    status: auditEntry ? 'complete' : 'waiting',
    at:     auditEntry?.created_at ?? null,
    detail: auditEntry ? `Audit ID: ${auditEntry.id.slice(0,8)}` : null,
    actor:  null,
  });

  return steps;
}

function _calcDuration(a) {
  if (!a.resolved_at && a.status === 'PENDING') return null;
  const end   = new Date(a.resolved_at ?? a.updated_at ?? Date.now()).getTime();
  const start = new Date(a.created_at).getTime();
  return end - start;
}

function _isExpired(a) {
  return a.status === 'EXPIRED' || (a.status === 'PENDING' && a.expires_at && new Date(a.expires_at) < new Date());
}

function _getTtlMs(a) {
  if (!a.expires_at) return null;
  return new Date(a.expires_at).getTime() - Date.now();
}

function _parseJson(v, fallback) {
  if (!v) return fallback;
  if (typeof v === 'object') return v;
  try { return JSON.parse(v); } catch { return fallback; }
}
