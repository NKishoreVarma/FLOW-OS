/**
 * NotificationEngine — decides which events are worth surfacing to the user.
 *
 * Filters by:
 *   - Value threshold (composite score ≥ 0.65)
 *   - Actionability (must have a clear next action)
 *   - Deduplication (no repeat within 60 minutes)
 *   - Rate limiting (max 10 per workspace per hour)
 *
 * Broadcasts accepted notifications via WebSocket.
 */

import { broadcastToWorkspace } from '../socketService.js';
import { logger } from '../../utils/logger.js';

// In-memory deduplication: workspaceId → Map<fingerprint, timestamp>
const _sentFingerprints = new Map();
const DEDUP_WINDOW_MS   = 60 * 60 * 1000; // 1 hour
const MAX_PER_HOUR      = 10;
const SCORE_THRESHOLD   = 0.65;

/**
 * Evaluate a set of scored items and push notifications for qualifying ones.
 *
 * @param {string} workspaceId
 * @param {ScoredWorkItem[]} items - Items with .scores from PriorityEngine
 * @param {string} [context] - 'morning_brief' | 'incident' | 'continuous'
 */
export function fireNotifications(workspaceId, items, context = 'continuous') {
  const wsId    = String(workspaceId);
  const now     = Date.now();
  const sent    = _getOrCreateRegistry(wsId, now);

  // Count how many we've already sent this hour
  const sentThisHour = [...sent.values()].filter(ts => now - ts < DEDUP_WINDOW_MS).length;
  if (sentThisHour >= MAX_PER_HOUR) return;

  let remaining = MAX_PER_HOUR - sentThisHour;

  for (const item of items) {
    if (remaining <= 0) break;

    const score = item.scores?.composite ?? 0;
    if (score < SCORE_THRESHOLD) continue;
    if (!_isActionable(item)) continue;

    const fp = _fingerprint(item);
    const lastSent = sent.get(fp);
    if (lastSent && now - lastSent < DEDUP_WINDOW_MS) continue;

    const notification = _buildNotification(item, context);
    _push(wsId, notification);
    sent.set(fp, now);
    remaining--;
    logger.rag(`[Notify] ${wsId} — ${notification.title}`);
  }
}

/**
 * Push a single high-priority notification immediately (bypasses rate limit).
 * Use for CRITICAL incidents only.
 */
export function pushCritical(workspaceId, item) {
  const notification = _buildNotification(item, 'critical');
  _push(String(workspaceId), { ...notification, priority: 'critical' });
}

// ── Internal ──────────────────────────────────────────────────────────────────

function _push(wsId, notification) {
  broadcastToWorkspace(wsId, 'AUTONOMOUS_NOTIFICATION', notification);
}

function _buildNotification(item, context) {
  const score  = item.scores;
  const type   = (item.type || 'item').toUpperCase();
  const label  = _typeLabel(type);
  const action = _deriveAction(item);

  return {
    id:         `notif_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
    type:       type,
    title:      item.name || `${label} update`,
    summary:    item.summary || action,
    action,
    actionType: _deriveActionType(item),
    priority:   score?.priority || 'medium',
    urgency:    score?.urgency || 0.5,
    impact:     score?.businessImpact || 0.5,
    context,
    ts:         new Date().toISOString(),
    metadata:   item.metadata || {},
  };
}

function _isActionable(item) {
  // Must have a clear next action the user can take
  return Boolean(
    item.type === 'INCIDENT'           ||
    item.type === 'PR'                 ||
    item.type === 'RECOMMENDATION'     ||
    item.type === 'CUSTOMER'           ||
    item.type === 'CUSTOMER_EVENT'     ||
    (item.type === 'MEETING' && item.ts) ||
    item.scores?.priority === 'critical'
  );
}

function _fingerprint(item) {
  return `${item.type}::${item.id || item.name || ''}`.toLowerCase().replace(/\s+/g, '_');
}

function _deriveAction(item) {
  switch ((item.type || '').toUpperCase()) {
    case 'INCIDENT':         return 'Review and assign incident response';
    case 'PR':               return 'Review pull request';
    case 'RECOMMENDATION':   return item.summary || 'Review recommendation';
    case 'CUSTOMER':
    case 'CUSTOMER_EVENT':   return 'Review customer update';
    case 'MEETING':          return 'Prepare for upcoming meeting';
    default:                 return 'Review item';
  }
}

function _deriveActionType(item) {
  switch ((item.type || '').toUpperCase()) {
    case 'INCIDENT':   return 'escalate';
    case 'PR':         return 'review';
    case 'MEETING':    return 'prepare';
    case 'CUSTOMER':   return 'follow_up';
    default:           return 'review';
  }
}

function _typeLabel(type) {
  const map = { PR: 'Pull Request', INCIDENT: 'Incident', MEETING: 'Meeting', CUSTOMER: 'Customer', ISSUE: 'Issue' };
  return map[type] || type.toLowerCase();
}

function _getOrCreateRegistry(wsId, now) {
  if (!_sentFingerprints.has(wsId)) _sentFingerprints.set(wsId, new Map());
  const registry = _sentFingerprints.get(wsId);
  // Prune old entries
  for (const [fp, ts] of registry) {
    if (now - ts > DEDUP_WINDOW_MS) registry.delete(fp);
  }
  return registry;
}
