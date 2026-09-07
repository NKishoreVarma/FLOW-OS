/**
 * ComplianceReporter — Module 6 (Compliance)
 *
 * Generates SOC2, ISO27001, audit, access, approval, and security reports
 * from existing FLOW data stores. No new data sources — reads audit_logs,
 * pending_approvals, workflow_executions, enterprise_sessions, flow_events,
 * and enterprise_role_assignments.
 */

import { query }     from '../config/db.js';
import { writeFile } from 'fs/promises';
import { join }      from 'path';
import { mkdirSync } from 'fs';

const REPORT_ROOT = process.env.REPORT_ROOT ?? join(process.env.HOME ?? '/tmp', 'flow-os-reports');

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Generate a SOC2 Type II evidence report for a period.
 */
export async function generateSOC2Report(orgId, periodStart, periodEnd) {
  const period = { start: new Date(periodStart).toISOString(), end: new Date(periodEnd).toISOString() };

  const [accessControl, changeManagement, availability, confidentiality, security] = await Promise.all([
    _gatherAccessControl(orgId, period),
    _gatherChangeManagement(orgId, period),
    _gatherAvailability(orgId, period),
    _gatherConfidentiality(orgId, period),
    _gatherSecurityEvents(orgId, period),
  ]);

  const report = {
    reportType:  'SOC2_TYPE_II',
    orgId,
    period,
    generatedAt: new Date().toISOString(),
    controls: {
      CC6_AccessControl:    accessControl,
      CC7_ChangeManagement: changeManagement,
      CC9_Availability:     availability,
      CC8_Confidentiality:  confidentiality,
      CC6_3_Security:       security,
    },
    attestation: {
      system: 'FLOW OS Enterprise',
      criteria: 'AICPA Trust Services Criteria',
      period: `${period.start} to ${period.end}`,
    },
  };

  return _saveReport(orgId, 'soc2', report, period);
}

/**
 * Generate an ISO 27001 evidence package.
 */
export async function generateISO27001Report(orgId, periodStart, periodEnd) {
  const period = { start: new Date(periodStart).toISOString(), end: new Date(periodEnd).toISOString() };

  const [accessMgmt, assetMgmt, incidentMgmt, auditTrail, userMgmt] = await Promise.all([
    _gatherAccessControl(orgId, period),
    _gatherAssetManagement(orgId, period),
    _gatherIncidentManagement(orgId, period),
    _gatherAuditTrail(orgId, period),
    _gatherUserManagement(orgId, period),
  ]);

  const report = {
    reportType: 'ISO27001',
    orgId,
    period,
    generatedAt: new Date().toISOString(),
    clauses: {
      A9_AccessControl:      accessMgmt,
      A8_AssetManagement:    assetMgmt,
      A16_IncidentManagement: incidentMgmt,
      A12_7_AuditTrail:      auditTrail,
      A9_2_UserManagement:   userMgmt,
    },
    standard: 'ISO/IEC 27001:2022',
  };

  return _saveReport(orgId, 'iso27001', report, period);
}

/**
 * Generate an audit report: who did what and when.
 */
export async function generateAuditReport(orgId, periodStart, periodEnd) {
  const period = { start: new Date(periodStart).toISOString(), end: new Date(periodEnd).toISOString() };
  const trail  = await _gatherAuditTrail(orgId, period);
  const report = { reportType: 'AUDIT', orgId, period, generatedAt: new Date().toISOString(), ...trail };
  return _saveReport(orgId, 'audit', report, period);
}

/**
 * Generate an access report: who has access to what.
 */
export async function generateAccessReport(orgId) {
  const [users, roles, sessions, sso] = await Promise.all([
    query(`SELECT u.id, u.email, u.role, u.created_at FROM users u WHERE u.org_id=$1 ORDER BY u.created_at`, [orgId]).catch(() => ({ rows: [] })),
    query(`SELECT ra.user_id, r.name, r.scope FROM enterprise_role_assignments ra JOIN enterprise_roles r ON r.id=ra.role_id WHERE ra.org_id=$1`, [orgId]).catch(() => ({ rows: [] })),
    query(`SELECT user_id, COUNT(*) AS active_sessions FROM enterprise_sessions WHERE org_id=$1 AND revoked=false AND expires_at>NOW() GROUP BY user_id`, [orgId]).catch(() => ({ rows: [] })),
    query(`SELECT provider, enabled FROM enterprise_sso_configs WHERE org_id=$1`, [orgId]).catch(() => ({ rows: [] })),
  ]);

  const period = { start: new Date(0).toISOString(), end: new Date().toISOString() };
  const report = {
    reportType:  'ACCESS',
    orgId,
    generatedAt: new Date().toISOString(),
    totalUsers:  users.rows.length,
    users:       users.rows,
    roleAssignments: roles.rows,
    activeSessions:  sessions.rows,
    ssoProviders:    sso.rows,
  };
  return _saveReport(orgId, 'access', report, period);
}

/**
 * Generate an approval report: approval decisions and latency.
 */
export async function generateApprovalReport(orgId, periodStart, periodEnd) {
  const period = { start: new Date(periodStart).toISOString(), end: new Date(periodEnd).toISOString() };
  const { rows } = await query(
    `SELECT status, COUNT(*) AS count,
            AVG(EXTRACT(EPOCH FROM (updated_at - created_at))/3600)::numeric(8,2) AS avg_hours,
            MIN(created_at) AS oldest, MAX(created_at) AS newest
     FROM pending_approvals
     WHERE workspace_id IN (SELECT id FROM workspaces WHERE org_id=$1)
       AND created_at BETWEEN $2 AND $3
     GROUP BY status`,
    [orgId, period.start, period.end]
  ).catch(() => ({ rows: [] }));

  const report = {
    reportType:  'APPROVAL',
    orgId, period,
    generatedAt: new Date().toISOString(),
    summary:     rows,
    totalApprovals: rows.reduce((s, r) => s + Number(r.count), 0),
  };
  return _saveReport(orgId, 'approval', report, period);
}

/**
 * List all generated compliance reports for an org.
 */
export async function listReports(orgId, { type = null } = {}) {
  const conds = ['org_id = $1'];
  const vals  = [orgId];
  if (type) conds.push(`report_type = $${vals.push(type.toUpperCase())}`);
  const { rows } = await query(
    `SELECT * FROM compliance_reports WHERE ${conds.join(' AND ')} ORDER BY generated_at DESC LIMIT 100`,
    vals
  );
  return rows;
}

/**
 * Get a single report.
 */
export async function getReport(orgId, reportId) {
  const { rows } = await query(
    `SELECT * FROM compliance_reports WHERE id=$1 AND org_id=$2`,
    [reportId, orgId]
  );
  return rows[0] ?? null;
}

// ── Evidence Gatherers ────────────────────────────────────────────────────────

async function _gatherAccessControl(orgId, period) {
  const { rows } = await query(
    `SELECT COUNT(DISTINCT user_id) AS unique_users, COUNT(*) AS total_sessions,
            COUNT(*) FILTER (WHERE mfa_verified) AS mfa_sessions
     FROM enterprise_sessions
     WHERE org_id=$1 AND created_at BETWEEN $2 AND $3`,
    [orgId, period.start, period.end]
  ).catch(() => ({ rows: [{}] }));
  return { ...rows[0], evidence: 'enterprise_sessions' };
}

async function _gatherChangeManagement(orgId, period) {
  const { rows } = await query(
    `SELECT workflow_id, status, COUNT(*) AS count
     FROM workflow_executions
     WHERE workspace_id IN (SELECT id FROM workspaces WHERE org_id=$1)
       AND started_at BETWEEN $2 AND $3
     GROUP BY workflow_id, status`,
    [orgId, period.start, period.end]
  ).catch(() => ({ rows: [] }));
  return { workflowChanges: rows, evidence: 'workflow_executions' };
}

async function _gatherAvailability(orgId, period) {
  const { rows } = await query(
    `SELECT COUNT(*) FILTER (WHERE status='COMPLETED') AS completed,
            COUNT(*) FILTER (WHERE status='FAILED') AS failed,
            COUNT(*) AS total
     FROM workflow_executions
     WHERE workspace_id IN (SELECT id FROM workspaces WHERE org_id=$1)
       AND started_at BETWEEN $2 AND $3`,
    [orgId, period.start, period.end]
  ).catch(() => ({ rows: [{}] }));
  const r = rows[0] ?? {};
  const uptime = r.total > 0 ? Number(r.completed)/Number(r.total) : 1;
  return { uptimePct: Math.round(uptime * 10000) / 100, ...r, evidence: 'workflow_executions' };
}

async function _gatherConfidentiality(orgId, period) {
  const { rows } = await query(
    `SELECT COUNT(*) AS privacy_events
     FROM flow_events
     WHERE workspace_id IN (SELECT id FROM workspaces WHERE org_id=$1)
       AND event_type = 'PRIVACY_SHIELD_TRIGGERED'
       AND created_at BETWEEN $2 AND $3`,
    [orgId, period.start, period.end]
  ).catch(() => ({ rows: [{ privacy_events: 0 }] }));
  return { ...rows[0], evidence: 'flow_events (privacy gate activations)' };
}

async function _gatherSecurityEvents(orgId, period) {
  const { rows } = await query(
    `SELECT action, COUNT(*) AS count
     FROM audit_logs
     WHERE workspace_id IN (SELECT id FROM workspaces WHERE org_id=$1)
       AND created_at BETWEEN $2 AND $3
       AND action LIKE 'DENIED%' OR action = 'AUTH_FAILED'
     GROUP BY action`,
    [orgId, period.start, period.end]
  ).catch(() => ({ rows: [] }));
  return { deniedActions: rows, evidence: 'audit_logs' };
}

async function _gatherAssetManagement(orgId, period) {
  const { rows } = await query(
    `SELECT node_type, COUNT(*) AS count
     FROM graph_nodes
     WHERE workspace_id IN (SELECT id FROM workspaces WHERE org_id=$1)
     GROUP BY node_type ORDER BY count DESC LIMIT 20`,
    [orgId]
  ).catch(() => ({ rows: [] }));
  return { assetInventory: rows, evidence: 'graph_nodes (Knowledge Graph)' };
}

async function _gatherIncidentManagement(orgId, period) {
  const { rows } = await query(
    `SELECT event_type, COUNT(*) AS count
     FROM flow_events
     WHERE workspace_id IN (SELECT id FROM workspaces WHERE org_id=$1)
       AND event_type IN ('INCIDENT_CREATED','INCIDENT_RESOLVED','RISK_DETECTED')
       AND created_at BETWEEN $2 AND $3
     GROUP BY event_type`,
    [orgId, period.start, period.end]
  ).catch(() => ({ rows: [] }));
  return { incidents: rows, evidence: 'flow_events' };
}

async function _gatherAuditTrail(orgId, period) {
  const { rows } = await query(
    `SELECT actor_id, action, resource_type, created_at
     FROM audit_logs
     WHERE workspace_id IN (SELECT id FROM workspaces WHERE org_id=$1)
       AND created_at BETWEEN $2 AND $3
     ORDER BY created_at DESC LIMIT 5000`,
    [orgId, period.start, period.end]
  ).catch(() => ({ rows: [] }));
  return { entries: rows.length, sample: rows.slice(0, 100), evidence: 'audit_logs' };
}

async function _gatherUserManagement(orgId, period) {
  const { rows } = await query(
    `SELECT u.email, u.role, u.created_at
     FROM users u WHERE u.org_id=$1 ORDER BY u.created_at`,
    [orgId]
  ).catch(() => ({ rows: [] }));
  return { totalUsers: rows.length, users: rows, evidence: 'users' };
}

// ── Persistence ───────────────────────────────────────────────────────────────

async function _saveReport(orgId, type, report, period) {
  const dir     = join(REPORT_ROOT, orgId, type);
  mkdirSync(dir, { recursive: true });
  const ts      = new Date().toISOString().replace(/[:.]/g, '-');
  const filePath = join(dir, `${type}-${ts}.json`);
  await writeFile(filePath, JSON.stringify(report, null, 2));

  const { rows } = await query(
    `INSERT INTO compliance_reports (org_id, report_type, period_start, period_end, status, evidence, file_path)
     VALUES ($1,$2,$3,$4,'COMPLETED',$5::jsonb,$6) RETURNING id`,
    [orgId, type.toUpperCase(), period.start, period.end, JSON.stringify({ summary: true }), filePath]
  ).catch(() => ({ rows: [{}] }));

  return { reportId: rows[0]?.id, filePath, report };
}
