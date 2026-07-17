/**
 * FLOW OS — Adaptive Workday Engine · Signal Collector (Sprint 2.2)
 *
 * Gathers candidate WorkItems from the FAST existing sources — it collects nothing new,
 * it re-frames what FLOW already has: pending approvals (Governance), the Notification
 * Engine's already-permission-filtered signals (merge conflicts, incidents, execution
 * done…), and Prediction Engine risks. Meetings and other items can be injected by the
 * caller. Each item is normalized so the deterministic prioritizer can rank it.
 */

import { prisma } from '../core/config/prisma.js';
import { predict } from '../predictions/PredictionEngine.js';

const NOTIF_TYPE = {
  MERGE_CONFLICT: { type: 'conflict',  department: 'engineering', route: '/inbox',    label: 'Resolve conflict' },
  CI_FAILED:      { type: 'ci',        department: 'engineering', route: '/projects', label: 'Fix CI' },
  APPROVAL_REQUIRED: { type: 'approval', department: 'operations', route: '/inbox',   label: 'Review approval' },
  INCIDENT:       { type: 'incident',  department: 'security',    route: '/activity', label: 'Handle incident' },
  EXECUTION_DONE: { type: 'execution', department: 'operations',  route: '/activity', label: 'Done' },
};
const DOMAIN_OF = { engineering: 'engineering', people: 'hr', customers: 'sales', operations: 'operations' };

function impactFromPriority(p) { return p >= 80 ? 'critical' : p >= 65 ? 'high' : p >= 45 ? 'medium' : 'low'; }
function impactFromRisk(riskLevel) { return riskLevel === 'CRITICAL' ? 'critical' : riskLevel === 'HIGH' ? 'high' : 'medium'; }
function deptOfConnector(c) { return /github|jira|gitlab/i.test(c || '') ? 'engineering' : /hubspot|salesforce/i.test(c || '') ? 'sales' : 'operations'; }

export async function collect(workspaceId, { extraItems = [] } = {}) {
  const [apprR, notifR, predR] = await Promise.allSettled([
    prisma.pendingApproval.findMany({ where: { workspaceId, status: 'PENDING' }, orderBy: { createdAt: 'desc' }, take: 20 }),
    prisma.notification.findMany({ where: { workspaceId }, orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }], take: 30 }),
    predict(workspaceId).catch(() => ({ predictions: [] })),
  ]);

  const items = [];

  // ── Pending approvals (Governance) ───────────────────────────────────────────
  if (apprR.status === 'fulfilled') {
    for (const a of apprR.value) {
      items.push({
        id: `ap-${a.id}`, type: 'approval', source: a.connectorId || 'system',
        title: `Approve: ${a.connectorId || ''} ${a.actionType || 'action'}`.trim(),
        subtitle: `${a.riskLevel || 'HIGH'} risk · ${a.requiredApprovals || 1} approval(s) required`,
        owners: [], requester: a.requesterId, participants: [],
        blocking: a.riskLevel === 'CRITICAL' ? 2 : 1,
        businessImpact: impactFromRisk(a.riskLevel), department: deptOfConnector(a.connectorId),
        actionRoute: '/inbox', actionLabel: 'Review approval',
        suggestedActions: [
          { label: 'Approve', workflowId: 'approve_action', risk: a.riskLevel === 'CRITICAL' ? 'CRITICAL' : 'HIGH', params: { approvalId: a.id, connectorId: a.connectorId, actionType: a.actionType } },
          { label: 'Reject', workflowId: 'reject_action', risk: 'LOW', params: { approvalId: a.id } },
        ],
        estimatedImpact: `Unblocks ${a.riskLevel === 'CRITICAL' ? 'critical' : 'HIGH risk'} workflow`,
        raw: a,
      });
    }
  }

  // ── Notification Engine signals (already permission-filtered) ────────────────
  if (notifR.status === 'fulfilled') {
    for (const n of notifR.value) {
      if (/APPROVAL_REQUIRED/i.test(n.type || '')) continue; // approvals handled above (richer)
      const meta = NOTIF_TYPE[n.type] || { type: 'notification', department: 'operations', route: '/inbox', label: 'Open' };
      const recipients = Array.isArray(n.recipients) ? n.recipients : [];
      items.push({
        id: `nf-${n.id}`, type: meta.type, source: 'system',
        title: n.title, subtitle: n.body || '',
        owners: recipients, participants: recipients,
        blocking: meta.type === 'conflict' ? Math.max(1, recipients.length - 1) : 0,
        businessImpact: impactFromPriority(n.priority ?? 45),
        department: meta.department, actionRoute: meta.route, actionLabel: meta.label,
        suggestedActions: [
          { label: 'Open', workflowId: 'navigate', risk: 'LOW', params: { route: meta.route } },
        ],
        estimatedImpact: 'Clears notification',
        raw: n,
      });
    }
  }

  // ── Prediction risks (Prediction Engine) ─────────────────────────────────────
  if (predR.status === 'fulfilled') {
    for (const p of (predR.value.predictions || []).filter((x) => !x.insufficient && (x.riskScore ?? 0) >= 55).slice(0, 6)) {
      items.push({
        id: `pr-${p.type}`, type: 'risk', source: 'prediction',
        title: p.prediction, subtitle: (p.preventiveActions || [])[0] || 'Emerging risk',
        owners: [], participants: [],
        blocking: 0, riskScore: p.riskScore, predictionConfidence: p.confidence?.overall ?? p.confidence ?? null,
        businessImpact: p.riskScore >= 75 ? 'high' : 'medium', department: DOMAIN_OF[p.domain] || 'operations',
        actionRoute: '/', actionLabel: 'Review risk',
        suggestedActions: [
          { label: 'Investigate', workflowId: 'navigate', risk: 'LOW', params: { route: '/brain' } },
        ],
        estimatedImpact: p.probability >= 0.8 ? 'Prevents high-probability risk' : 'Mitigates risk',
        raw: p,
      });
    }
  }

  // ── Failed executions (last 24 h) ─────────────────────────────────────────
  try {
    const failed = await prisma.executionRecord.findMany({
      where: { workspaceId, status: 'FAILED', createdAt: { gte: new Date(Date.now() - 24 * 3_600_000) } },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: { id: true, connector: true, actionType: true, summary: true, riskLevel: true, createdAt: true },
    });
    for (const e of failed) {
      items.push({
        id: `fe-${e.id}`, type: 'execution_failed', source: e.connector || 'system',
        title: `Failed: ${e.summary || e.actionType || 'execution'}`,
        subtitle: `${e.connector || 'system'} · ${e.riskLevel || 'MEDIUM'} risk · retry available`,
        owners: [], participants: [], blocking: 1,
        businessImpact: 'high', department: deptOfConnector(e.connector),
        actionRoute: '/inbox', actionLabel: 'Retry',
        suggestedActions: [
          { label: 'Dismiss', workflowId: 'dismiss', risk: 'LOW', params: { recordId: e.id } },
        ],
        estimatedImpact: 'Clears failed workflow',
        raw: e,
      });
    }
  } catch { /* best-effort */ }

  // ── Connector warnings (DEGRADED / DOWN) ─────────────────────────────────
  try {
    const { checkAllHealth } = await import('../connectors/registry.js');
    const health = await checkAllHealth(workspaceId);
    for (const [connectorId, h] of Object.entries(health || {})) {
      if (!h || h.status === 'HEALTHY') continue;
      items.push({
        id: `cw-${connectorId}`, type: 'connector_warning', source: connectorId,
        title: `${connectorId} needs attention`,
        subtitle: h.message || `Status: ${h.status} — reconnect to restore access`,
        owners: [], participants: [], blocking: 1,
        businessImpact: h.status === 'DOWN' ? 'critical' : 'medium',
        department: deptOfConnector(connectorId),
        actionRoute: '/admin/ops', actionLabel: 'Reconnect',
        suggestedActions: [
          { label: 'Go to Admin', workflowId: 'navigate', risk: 'LOW', params: { route: '/admin/ops' } },
        ],
        estimatedImpact: 'Restores connector access',
        raw: { connectorId, health: h },
      });
    }
  } catch { /* best-effort */ }

  // ── Recent incidents (last 48 h) ──────────────────────────────────────────
  try {
    const { queryMemory } = await import('../services/orgMemoryService.js');
    const incidents = await queryMemory(workspaceId, 'INCIDENT', { hours: 48, limit: 5 });
    for (const inc of incidents) {
      items.push({
        id: `inc-${inc.id}`, type: 'incident', source: 'system',
        title: inc.title,
        subtitle: inc.body || 'Investigate and resolve',
        owners: [inc.author].filter(Boolean), participants: [],
        blocking: 2, businessImpact: 'critical', department: 'engineering',
        actionRoute: '/inbox', actionLabel: 'Investigate',
        suggestedActions: [
          { label: 'Investigate', workflowId: 'navigate', risk: 'LOW', params: { route: '/brain' } },
          { label: 'Escalate', workflowId: 'navigate', risk: 'LOW', params: { route: '/council' } },
        ],
        estimatedImpact: 'Resolves production incident',
        raw: inc,
      });
    }
  } catch { /* best-effort */ }

  return [...items, ...extraItems];
}

