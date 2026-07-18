/**
 * NotificationHandler — generates in-app notifications from webhook events.
 *
 * Persists to webhook_notifications table (viewable via API).
 * Broadcasts WEBHOOK_NOTIFICATION over WebSocket for real-time display.
 *
 * Only medium and high urgency events generate notifications to avoid noise.
 */

import db                   from '../../../config/db.js';
import { broadcastToWorkspace } from '../../socketService.js';

// Notification templates per event type
const TEMPLATES = {
  'pr.merged':               e => ({ title: `PR merged: ${e.metadata?.repo || ''}`, body: e.summary }),
  'pr.review_requested':     e => ({ title: `Review requested`, body: e.summary }),
  'deployment.failed':       e => ({ title: `Deployment FAILED`, body: e.summary }),
  'deployment.succeeded':    e => ({ title: `Deployment succeeded`, body: e.summary }),
  'ci.failed':               e => ({ title: `CI pipeline failed`, body: e.summary }),
  'release.published':       e => ({ title: `New release published`, body: e.summary }),
  'issue.opened':            e => ({ title: `New issue opened`, body: e.summary }),
  'issue.assigned':          e => ({ title: `Issue assigned to you`, body: e.summary }),
  'sprint.completed':        e => ({ title: `Sprint completed`, body: e.summary }),
  'calendar.invite_received':e => ({ title: `Meeting invite`, body: e.summary }),
  'issue.status_changed':    e => ({ title: `Issue status changed`, body: e.summary }),
};

export async function handle(event) {
  // Only notify for medium+ urgency
  if (event.urgency === 'low') return;

  const template = TEMPLATES[event.eventType];
  if (!template && event.urgency !== 'high') return;

  const { title, body } = template
    ? template(event)
    : { title: event.summary, body: null };

  // Persist to DB
  let notificationId;
  try {
    const { rows } = await db.query(
      `INSERT INTO webhook_notifications
         (workspace_id, event_id, connector_id, event_type, title, body, urgency)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [event.workspaceId, event.eventId, event.connectorId, event.eventType, title, body, event.urgency],
    );
    notificationId = rows[0]?.id;
  } catch { /* non-fatal — table may not exist yet */ }

  // Broadcast over WebSocket
  broadcastToWorkspace(event.workspaceId, 'WEBHOOK_NOTIFICATION', {
    notificationId,
    eventId:     event.eventId,
    connectorId: event.connectorId,
    eventType:   event.eventType,
    title,
    body,
    urgency:     event.urgency,
    actor:       event.actor,
    receivedAt:  event.receivedAt,
  });
}
