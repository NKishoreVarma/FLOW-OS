/**
 * adminEnterpriseRoutes — Module 11 (Enterprise Admin Console)
 *
 * REST API for enterprise administrators:
 *   /api/admin/sso          — SSO config CRUD
 *   /api/admin/mfa          — MFA management
 *   /api/admin/sessions     — Session management
 *   /api/admin/ip-allowlist — IP allowlist management
 *   /api/admin/roles        — Custom role CRUD + assignment
 *   /api/admin/compliance   — Compliance report generation
 *   /api/admin/scaling      — Cluster scaling status
 *   /api/admin/ha           — HA status
 *   /api/admin/upgrade      — Upgrade management
 *   /api/admin/audit        — Enterprise audit log
 *
 * All routes: JWT required + OWNER or ADMIN role.
 */

import { Router }                             from 'express';
import { authenticate }                       from '../core/middleware/authenticate.js';
import { authorize }                          from '../core/middleware/authorize.js';
import { getSSOConfig, upsertSSOConfig, deleteSSOConfig }    from '../security/enterprise/SSOProvider.js';
import { getMFAStatus, disableMFA, regenerateBackupCodes }   from '../security/enterprise/MFAManager.js';
import { listUserSessions, revokeAllSessions, purgeExpiredSessions } from '../security/enterprise/SessionManager.js';
import { addEntry, removeEntry, listEntries }                         from '../security/enterprise/IPAllowlist.js';
import { createRole, listRoles, getRole, updateRole, deleteRole, assignRole, revokeRole, getUserRoles } from '../rbac/CustomRoles.js';
import { getEffectivePermissions }            from '../rbac/PermissionEngine.js';
import { generateSOC2Report, generateISO27001Report, generateAuditReport, generateAccessReport, generateApprovalReport, listReports } from '../compliance/ComplianceReporter.js';
import { getClusterMetrics, getScalingRecommendation, evaluateScaling } from '../scaling/HorizontalScaler.js';
import { getHealth }                          from '../ha/HealthMonitor.js';
import { listWorkers }                        from '../ha/WorkerFailover.js';
import { isLeader, getLeaderId }             from '../ha/LeaderElection.js';
import { listVersions, validateCompatibility } from '../upgrade/CompatibilityValidator.js';
import { listRollbacks }                      from '../upgrade/RollbackManager.js';
import { query }                              from '../config/db.js';

const router = Router();
const ADMIN  = ['OWNER', 'ADMIN'];

router.use(authenticate);
router.use(authorize(...ADMIN));

// ── SSO ───────────────────────────────────────────────────────────────────────

router.get('/sso', async (req, res, next) => {
  try {
    const cfg = await getSSOConfig(req.user.orgId);
    res.json({ sso: cfg });
  } catch (err) { next(err); }
});

router.put('/sso', async (req, res, next) => {
  try {
    const cfg = await upsertSSOConfig(req.user.orgId, req.body);
    res.json({ sso: cfg });
  } catch (err) { next(err); }
});

router.delete('/sso', async (req, res, next) => {
  try {
    await deleteSSOConfig(req.user.orgId);
    res.json({ deleted: true });
  } catch (err) { next(err); }
});

// ── MFA ───────────────────────────────────────────────────────────────────────

router.get('/mfa/:userId', async (req, res, next) => {
  try {
    const status = await getMFAStatus(req.params.userId);
    res.json({ mfa: status });
  } catch (err) { next(err); }
});

router.delete('/mfa/:userId', async (req, res, next) => {
  try {
    await disableMFA(req.params.userId);
    res.json({ disabled: true });
  } catch (err) { next(err); }
});

router.post('/mfa/:userId/backup-codes', async (req, res, next) => {
  try {
    const codes = await regenerateBackupCodes(req.params.userId);
    res.json({ backupCodes: codes });
  } catch (err) { next(err); }
});

// ── Sessions ──────────────────────────────────────────────────────────────────

router.get('/sessions/:userId', async (req, res, next) => {
  try {
    const sessions = await listUserSessions(req.params.userId);
    res.json({ sessions });
  } catch (err) { next(err); }
});

router.delete('/sessions/:userId', async (req, res, next) => {
  try {
    const count = await revokeAllSessions(req.params.userId);
    res.json({ revoked: count });
  } catch (err) { next(err); }
});

router.post('/sessions/purge', async (req, res, next) => {
  try {
    const count = await purgeExpiredSessions();
    res.json({ purged: count });
  } catch (err) { next(err); }
});

// ── IP Allowlist ──────────────────────────────────────────────────────────────

router.get('/ip-allowlist', async (req, res, next) => {
  try {
    const entries = await listEntries(req.user.orgId);
    res.json({ entries });
  } catch (err) { next(err); }
});

router.post('/ip-allowlist', async (req, res, next) => {
  try {
    const entry = await addEntry(req.user.orgId, req.body);
    res.status(201).json({ entry });
  } catch (err) { next(err); }
});

router.delete('/ip-allowlist/:id', async (req, res, next) => {
  try {
    await removeEntry(req.user.orgId, req.params.id);
    res.json({ deleted: true });
  } catch (err) { next(err); }
});

// ── Roles ─────────────────────────────────────────────────────────────────────

router.get('/roles', async (req, res, next) => {
  try { res.json({ roles: await listRoles(req.user.orgId) }); }
  catch (err) { next(err); }
});

router.post('/roles', async (req, res, next) => {
  try { res.status(201).json({ role: await createRole(req.user.orgId, req.body) }); }
  catch (err) { next(err); }
});

router.get('/roles/:id', async (req, res, next) => {
  try { res.json({ role: await getRole(req.user.orgId, req.params.id) }); }
  catch (err) { next(err); }
});

router.put('/roles/:id', async (req, res, next) => {
  try { res.json({ role: await updateRole(req.user.orgId, req.params.id, req.body) }); }
  catch (err) { next(err); }
});

router.delete('/roles/:id', async (req, res, next) => {
  try { res.json(await deleteRole(req.user.orgId, req.params.id)); }
  catch (err) { next(err); }
});

router.post('/roles/:id/assign', async (req, res, next) => {
  try {
    const { userId, ...opts } = req.body;
    res.json({ assignment: await assignRole(req.user.orgId, userId, req.params.id, opts) });
  } catch (err) { next(err); }
});

router.post('/roles/:id/revoke', async (req, res, next) => {
  try {
    res.json(await revokeRole(req.user.orgId, req.body.userId, req.params.id));
  } catch (err) { next(err); }
});

router.get('/users/:userId/roles', async (req, res, next) => {
  try {
    const [roles, permissions] = await Promise.all([
      getUserRoles(req.user.orgId, req.params.userId),
      getEffectivePermissions(req.params.userId, req.user.orgId),
    ]);
    res.json({ roles, effectivePermissions: permissions });
  } catch (err) { next(err); }
});

// ── Compliance ────────────────────────────────────────────────────────────────

router.post('/compliance/soc2', async (req, res, next) => {
  try {
    const { periodStart, periodEnd } = req.body;
    res.json(await generateSOC2Report(req.user.orgId, periodStart, periodEnd));
  } catch (err) { next(err); }
});

router.post('/compliance/iso27001', async (req, res, next) => {
  try {
    const { periodStart, periodEnd } = req.body;
    res.json(await generateISO27001Report(req.user.orgId, periodStart, periodEnd));
  } catch (err) { next(err); }
});

router.post('/compliance/audit', async (req, res, next) => {
  try {
    const { periodStart, periodEnd } = req.body;
    res.json(await generateAuditReport(req.user.orgId, periodStart, periodEnd));
  } catch (err) { next(err); }
});

router.post('/compliance/access', async (req, res, next) => {
  try { res.json(await generateAccessReport(req.user.orgId)); }
  catch (err) { next(err); }
});

router.post('/compliance/approval', async (req, res, next) => {
  try {
    const { periodStart, periodEnd } = req.body;
    res.json(await generateApprovalReport(req.user.orgId, periodStart, periodEnd));
  } catch (err) { next(err); }
});

router.get('/compliance/reports', async (req, res, next) => {
  try { res.json({ reports: await listReports(req.user.orgId, { type: req.query.type }) }); }
  catch (err) { next(err); }
});

// ── Scaling + HA ──────────────────────────────────────────────────────────────

router.get('/scaling', async (req, res, next) => {
  try {
    const [metrics, recommendation] = await Promise.all([
      getClusterMetrics(),
      getScalingRecommendation(),
    ]);
    res.json({ cluster: metrics, recommendation });
  } catch (err) { next(err); }
});

router.post('/scaling/evaluate', async (req, res, next) => {
  try { res.json({ recommendation: await evaluateScaling() }); }
  catch (err) { next(err); }
});

router.get('/ha', async (req, res, next) => {
  try {
    const [health, workers] = await Promise.all([getHealth(), listWorkers()]);
    res.json({
      health,
      leader:    getLeaderId(),
      isLeader:  isLeader(),
      workers,
    });
  } catch (err) { next(err); }
});

// ── Upgrade ───────────────────────────────────────────────────────────────────

router.get('/upgrade/versions', async (req, res, next) => {
  try { res.json({ versions: await listVersions() }); }
  catch (err) { next(err); }
});

router.post('/upgrade/validate', async (req, res, next) => {
  try {
    const result = await validateCompatibility(req.body.fromVersion, req.body.toVersion);
    res.json(result);
  } catch (err) { next(err); }
});

router.get('/upgrade/rollbacks', async (req, res, next) => {
  try { res.json({ rollbacks: await listRollbacks() }); }
  catch (err) { next(err); }
});

// ── Audit log ─────────────────────────────────────────────────────────────────

router.get('/audit', async (req, res, next) => {
  try {
    const { limit = 100, offset = 0, action, actorId } = req.query;
    const conds = ['org_id = $1'];
    const vals  = [req.user.orgId];
    if (action)  conds.push(`action = $${vals.push(action)}`);
    if (actorId) conds.push(`actor_id = $${vals.push(actorId)}`);
    const { rows } = await query(
      `SELECT * FROM audit_logs WHERE ${conds.join(' AND ')}
       ORDER BY created_at DESC LIMIT $${vals.push(Number(limit))} OFFSET $${vals.push(Number(offset))}`,
      vals
    );
    res.json({ audit: rows, limit: Number(limit), offset: Number(offset) });
  } catch (err) { next(err); }
});

export default router;
