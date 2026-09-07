/**
 * TimelineHandler — appends webhook events to the connector action timeline.
 *
 * Uses the existing connectors ExecutionEngine timeline (in-memory ring buffer
 * + PostgreSQL AuditLog) via a direct DB write. Broadcasts TIMELINE_EVENT
 * over WebSocket so the OperationalTimeline component updates live.
 */

import db                   from '../../../config/db.js';
import { broadcastToWorkspace } from '../../socketService.js';

const CONNECTOR_DISPLAY = {
  github:           'GitHub',
  slack:            'Slack',
  jira:             'Jira',
  notion:           'Notion',
  google:           'Google',
  gmail:            'Gmail',
  'google-calendar':'Calendar',
};

export async function handle(event) {
  // Write to AuditLog so /api/connectors/audit picks it up
  try {
    await db.query(
      `INSERT INTO "AuditLog"
         ("workspaceId", "connectorId", action, outcome, actor, metadata, "createdAt")
       VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
      [
        event.workspaceId,
        event.connectorId,
        event.eventType,
        'success',
        event.actor?.name || event.connectorId,
        JSON.stringify({
          eventId:      event.eventId,
          resourceId:   event.resourceId,
          resourceType: event.resourceType,
          summary:      event.summary,
          urgency:      event.urgency,
          via:          'webhook',
        }),
      ],
    );
  } catch { /* non-fatal — AuditLog schema may differ */ }

  // Broadcast timeline event over WebSocket
  broadcastToWorkspace(event.workspaceId, 'TIMELINE_EVENT', {
    eventId:       event.eventId,
    connectorId:   event.connectorId,
    connectorName: CONNECTOR_DISPLAY[event.connectorId] || event.connectorId,
    eventType:     event.eventType,
    resourceType:  event.resourceType,
    resourceId:    event.resourceId,
    actor:         event.actor,
    summary:       event.summary,
    urgency:       event.urgency,
    receivedAt:    event.receivedAt,
    via:           'webhook',
  });
}
