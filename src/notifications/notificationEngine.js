/**
 * FLOW OS — Workspace Notification Engine (Phase 14 M3)
 *
 * The single, centralized notification path. Every source (Execution Engine, GitHub /
 * merge-conflict, Slack, Jira, Simulation, Prediction, Replay, Operational Brain)
 * produces a notification through here. Notifications are:
 *   - Actionable  — carry one-click actions
 *   - Deduplicated — a repeated signal collapses onto its dedupeKey
 *   - Priority-scored — 0..100 for ranking
 *   - Permission-aware — delivered only to the relevant people
 *
 * Persisted to PostgreSQL (`notifications`) and pushed over the workspace WebSocket.
 * Consolidates the earlier Phase 9.4 RealtimeNotificationEngine (which stays as a
 * lightweight WS-only helper); this engine is the durable, targeted authority.
 */

import { prisma } from '../core/config/prisma.js';
import { broadcastToWorkspace } from '../services/socketService.js';
import { priorityFor, resolveRoleRecipients, canSee, dedupeKeyFor } from './notificationTargeting.js';

const DEDUPE_WINDOW_MS = 6 * 60 * 60 * 1000; // 6h

/**
 * Create (or dedupe) a notification.
 * @returns { notification, deduped: boolean }
 */
export async function createNotification({
  orgId, workspaceId, type, priority, severity, title, body,
  actions = [], recipients = [], dedupeKey, sourceEventId,
}) {
  if (!workspaceId || !type || !title) {
    throw new Error('workspaceId, type, and title are required');
  }
  const key = dedupeKey || dedupeKeyFor(type, [title]);

  // Dedupe: same workspace + key within the window → return the existing one.
  const existing = await prisma.notification.findFirst({
    where: { workspaceId, dedupeKey: key, createdAt: { gt: new Date(Date.now() - DEDUPE_WINDOW_MS) } },
    orderBy: { createdAt: 'desc' },
  });
  if (existing) return { notification: existing, deduped: true };

  const notification = await prisma.notification.create({
    data: {
      orgId: orgId ?? 'unknown',
      workspaceId,
      type,
      priority: priority ?? priorityFor(type, severity),
      title,
      body: body ?? null,
      actions,
      recipients,
      dedupeKey: key,
      sourceEventId: sourceEventId ?? null,
    },
  });

  try {
    broadcastToWorkspace(workspaceId, 'NOTIFICATION_CREATED', {
      id: notification.id, type, priority: notification.priority, title,
      body, actions, recipients, createdAt: notification.createdAt,
    });
  } catch { /* WS best-effort */ }

  // Deliver to Slack when connected — fire-and-forget, never blocks or breaks
  // notification creation. No-op if Slack isn't connected for the workspace.
  import('./slackNotifier.js')
    .then(({ deliverToSlack }) => deliverToSlack(workspaceId, { type, priority: notification.priority, title, body, actions }))
    .catch(() => {});

  return { notification, deduped: false };
}

// ── Source-specific helpers (the tested contract) ──────────────────────────────

/** Merge conflict — target ONLY the involved owners (from ownershipAnalyzer). */
export async function notifyMergeConflict({ orgId, workspaceId, ownership, message, severity = 'high', sourceEventId }) {
  return createNotification({
    orgId, workspaceId, type: 'MERGE_CONFLICT', severity,
    title: `Merge conflict in ${ownership.repo || 'repository'}`,
    body: message,
    actions: ownership.suggestedActions || [],
    recipients: ownership.owners || [],                     // only the relevant people
    dedupeKey: dedupeKeyFor('MERGE_CONFLICT', [ownership.repo, ownership.number]),
    sourceEventId,
  });
}

/** Approval required — route to the workspace's ADMIN/OWNER approvers. */
export async function notifyApprovalRequired({ orgId, workspaceId, approvalId, connector, actionType, riskLevel, title }) {
  const recipients = await resolveRoleRecipients(orgId, ['ADMIN', 'OWNER']);
  return createNotification({
    orgId, workspaceId, type: 'APPROVAL_REQUIRED', severity: riskLevel === 'CRITICAL' ? 'high' : 'medium',
    title: title || `Approval required: ${connector} ${actionType}`,
    body: `A ${riskLevel} action needs approval before it can run.`,
    actions: [{ label: 'Review approval', kind: 'open_approval', payload: { approvalId } }],
    recipients,
    dedupeKey: dedupeKeyFor('APPROVAL_REQUIRED', [approvalId]),
  });
}

/** Execution completed — inform the person who ran it. */
export async function notifyExecutionDone({ orgId, workspaceId, executionId, executedBy, connector, actionType }) {
  return createNotification({
    orgId, workspaceId, type: 'EXECUTION_DONE', severity: 'low',
    title: `Done: ${connector} ${actionType}`,
    body: null,
    recipients: executedBy ? [executedBy] : [],
    dedupeKey: dedupeKeyFor('EXECUTION_DONE', [executionId]),
  });
}

// ── Read side (permission-filtered) ────────────────────────────────────────────

export async function listNotifications(workspaceId, user, { limit = 50, unreadOnly = false } = {}) {
  const rows = await prisma.notification.findMany({
    where: { workspaceId }, orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }], take: Math.min(limit * 3, 300),
  });
  const visible = rows.filter((n) => canSee(n, user));
  const withRead = visible.map((n) => ({ ...n, read: (n.readBy || []).includes(user?.id) }));
  const filtered = unreadOnly ? withRead.filter((n) => !n.read) : withRead;
  return filtered.slice(0, limit);
}

export async function unreadCount(workspaceId, user) {
  const list = await listNotifications(workspaceId, user, { limit: 200, unreadOnly: true });
  return list.length;
}

export async function markRead(id, workspaceId, userId) {
  const n = await prisma.notification.findFirst({ where: { id, workspaceId } });
  if (!n) return null;
  const readBy = new Set(n.readBy || []);
  readBy.add(userId);
  return prisma.notification.update({ where: { id }, data: { readBy: [...readBy] } });
}

// ── Event bus glue ─────────────────────────────────────────────────────────────

/** Map a FLOW event to a notification (best-effort; unmatched types are ignored). */
export async function handleEvent(event) {
  try {
    const type = event.eventType || event.rawType || event.type || '';
    const p = event.payload || {};
    const orgId = event.organizationId || p.orgId;
    const workspaceId = event.workspaceId || p.workspaceId;
    if (!workspaceId) return;

    if (/MERGE_CONFLICT|CI_FAILED/i.test(type) && (p.owners || p.notify)) {
      await notifyMergeConflict({
        orgId, workspaceId, sourceEventId: event.eventId,
        ownership: { repo: p.repo, number: p.number, owners: p.owners || p.notify, suggestedActions: p.actions || [] },
        message: (p.reasons || []).join(' '), severity: p.severity || 'high',
      });
    } else if (/EXECUTION_APPROVAL_REQUIRED|APPROVAL_REQUIRED/i.test(type)) {
      await notifyApprovalRequired({
        orgId, workspaceId, approvalId: p.approvalId, connector: p.connector,
        actionType: p.actionType, riskLevel: p.riskLevel, title: p.title,
      });
    } else if (/EXECUTION_COMPLETED/i.test(type)) {
      await notifyExecutionDone({
        orgId, workspaceId, executionId: p.executionId, executedBy: p.executedBy,
        connector: p.connector, actionType: p.actionType,
      });
    }
  } catch { /* notifications are best-effort; never break the bus */ }
}

export default {
  createNotification, notifyMergeConflict, notifyApprovalRequired, notifyExecutionDone,
  listNotifications, unreadCount, markRead, handleEvent,
};
