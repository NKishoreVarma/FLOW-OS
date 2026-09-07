/**
 * RealtimeNotificationEngine — event-triggered smart push notifications.
 *
 * Different from autonomous/NotificationEngine (which fires on analysis cycles).
 * This engine fires IMMEDIATELY when a CompanyEvent arrives and meets criteria.
 *
 * Notification categories:
 *   - critical_incident:    production outage, sev0/sev1
 *   - customer_escalation:  at-risk customer action required
 *   - approval_required:    pending approval needs attention
 *   - deployment_failure:   rollback / failure
 *   - executive_alert:      cross-team critical impact
 *   - meeting_reminder:     meeting starting in N minutes
 *   - security_warning:     security event detected
 *
 * Dedup: 30-minute fingerprint window per category (shorter than autonomous,
 * because real-time events are inherently unique).
 */

import { broadcastToWorkspace } from '../socketService.js';
import { EventType } from './EventNormalizer.js';
import { logger } from '../../utils/logger.js';

// In-memory dedup: wsId → Map<fingerprint, timestamp>
const _dedup   = new Map();
const DEDUP_MS = 30 * 60 * 1000; // 30 minutes

// Events that always fire regardless of dedup
const ALWAYS_FIRE_TYPES = new Set([EventType.SECURITY, EventType.COMPLIANCE]);

/**
 * Evaluate a CompanyEvent and push a notification if it qualifies.
 *
 * @param {import('./EventNormalizer.js').CompanyEvent} event
 */
export function evaluateAndNotify(event) {
  const category = _classify(event);
  if (!category) return;

  const fp  = _fingerprint(event, category);
  const now = Date.now();

  // Check dedup unless always-fire
  if (!ALWAYS_FIRE_TYPES.has(event.type)) {
    const sent = _getRegistry(event.workspaceId);
    const last = sent.get(fp);
    if (last && now - last < DEDUP_MS) return; // Already sent recently
    sent.set(fp, now);
    _pruneRegistry(sent, now);
  }

  const notification = _buildNotification(event, category);
  broadcastToWorkspace(String(event.workspaceId), 'REALTIME_NOTIFICATION', notification);
  logger.rag(`[RealtimeNotify] ${event.workspaceId} — ${category}: ${event.title.slice(0, 60)}`);
}

// ── Notification classifier ───────────────────────────────────────────────────

function _classify(event) {
  const { type, priority, title = '', summary = '' } = event;
  const text = `${title} ${summary}`.toLowerCase();

  if (type === EventType.SECURITY)                                                           return 'security_warning';
  if (type === EventType.COMPLIANCE)                                                          return 'security_warning';
  if (type === EventType.INCIDENT && priority === 'critical')                                 return 'critical_incident';
  if (type === EventType.INCIDENT && priority === 'high')                                     return 'critical_incident';
  if (type === EventType.DEPLOYMENT && /fail|error|rollback|revert/i.test(text))              return 'deployment_failure';
  if (type === EventType.APPROVAL)                                                             return 'approval_required';
  if (type === EventType.CUSTOMER && /churn|at.risk|escalat|cancel/i.test(text))              return 'customer_escalation';
  if (type === EventType.MEETING && _meetingStartsSoon(event))                                 return 'meeting_reminder';
  if (priority === 'critical' && event.businessImpact >= 0.8)                                return 'executive_alert';

  return null; // Not worth notifying
}

// ── Notification builder ──────────────────────────────────────────────────────

function _buildNotification(event, category) {
  const labels = {
    critical_incident:   { label: 'Critical Incident',    emoji: '🔴' },
    customer_escalation: { label: 'Customer Escalation',  emoji: '🟠' },
    approval_required:   { label: 'Approval Required',    emoji: '🟡' },
    deployment_failure:  { label: 'Deployment Failed',    emoji: '🔴' },
    executive_alert:     { label: 'Executive Alert',      emoji: '⚠️' },
    meeting_reminder:    { label: 'Meeting Starting Soon', emoji: '🔵' },
    security_warning:    { label: 'Security Alert',       emoji: '🔐' },
  };

  const meta = labels[category] || { label: category, emoji: '⚡' };

  return {
    id:           `rtn_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
    category,
    label:        meta.label,
    emoji:        meta.emoji,
    title:        event.title.slice(0, 100),
    summary:      event.summary?.slice(0, 200) || '',
    priority:     event.priority,
    severity:     event.severity,
    eventId:      event.id,
    eventType:    event.type,
    source:       event.source,
    actors:       event.actors?.slice(0, 2) || [],
    affectedTeams:event.affectedTeams || [],
    correlationGroupId: event.correlationGroupId || null,
    actions:      _notificationActions(event, category),
    ts:           new Date().toISOString(),
  };
}

function _notificationActions(event, category) {
  const base = [{ label: 'View', type: 'view', eventId: event.id }];
  switch (category) {
    case 'critical_incident':
    case 'deployment_failure': base.push({ label: 'Investigate', type: 'investigate', eventId: event.id }); break;
    case 'approval_required':  base.push({ label: 'Approve Now', type: 'approve', eventId: event.id }); break;
    case 'customer_escalation':base.push({ label: 'Follow Up', type: 'follow_up', eventId: event.id }); break;
    case 'meeting_reminder':   base.push({ label: 'Join Meeting', type: 'join', eventId: event.id }); break;
  }
  base.push({ label: 'Ask FLOW', type: 'copilot', context: event.title });
  return base;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _meetingStartsSoon(event) {
  if (!event.ts) return false;
  const hoursUntil = (new Date(event.ts).getTime() - Date.now()) / 3_600_000;
  return hoursUntil > 0 && hoursUntil < 0.5; // within 30 minutes
}

function _fingerprint(event, category) {
  return `${category}::${event.type}::${(event.title || '').slice(0, 40).toLowerCase().replace(/\s+/g, '_')}`;
}

function _getRegistry(wsId) {
  if (!_dedup.has(wsId)) _dedup.set(wsId, new Map());
  return _dedup.get(wsId);
}

function _pruneRegistry(registry, now) {
  for (const [fp, ts] of registry) {
    if (now - ts > DEDUP_MS * 4) registry.delete(fp);
  }
}
