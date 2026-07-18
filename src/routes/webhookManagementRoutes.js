/**
 * Webhook Management Routes — REST API for webhook lifecycle management.
 *
 * Mounted at /api/webhooks/manage (JWT-protected — workspace-id header required).
 *
 * All routes require a valid JWT and the workspace-id header.
 * All mutations are ADMIN/OWNER only (enforced by governance checks via workspace role).
 *
 * Routes:
 *   GET    /registrations              — list registered webhooks for workspace
 *   POST   /registrations              — register a new webhook
 *   GET    /registrations/:connector   — get single webhook registration
 *   PATCH  /registrations/:connector   — update event types / endpoint
 *   DELETE /registrations/:connector   — deactivate webhook
 *   GET    /events                     — list recent webhook events (paginated)
 *   GET    /events/:eventId            — single event detail with deliveries
 *   POST   /events/:eventId/replay     — re-enqueue an event for reprocessing
 *   GET    /stats                      — aggregate stats across all connectors
 *   GET    /notifications              — list recent in-app notifications
 *   PATCH  /notifications/:id/read     — mark notification as read
 */

import express from 'express';
import {
  registerWebhook,
  deactivateWebhook,
  getWebhookInfo,
  listWebhooks,
} from '../services/integrations/WebhookManager.js';
import { enqueueWebhookEvent } from '../config/webhookQueue.js';
import db from '../config/db.js';

const router = express.Router();

// ── Middleware ────────────────────────────────────────────────────────────────

function requireWorkspace(req, res, next) {
  const workspaceId = req.headers['workspace-id'];
  if (!workspaceId) return res.status(400).json({ error: 'workspace-id header required' });
  req.workspaceId = workspaceId;
  next();
}

router.use(requireWorkspace);

// ── Webhook Registrations ─────────────────────────────────────────────────────

router.get('/registrations', async (req, res) => {
  const webhooks = await listWebhooks(req.workspaceId);
  res.json({ webhooks });
});

router.post('/registrations', async (req, res) => {
  const { connectorId, endpointUrl, eventTypes = [], secret } = req.body;
  if (!connectorId || !endpointUrl) {
    return res.status(400).json({ error: 'connectorId and endpointUrl required' });
  }

  const webhookSecret = await registerWebhook(req.workspaceId, connectorId, {
    endpointUrl,
    eventTypes,
    secret,
  });

  res.status(201).json({
    connectorId,
    endpointUrl,
    secret: webhookSecret,
    message: 'Store this secret now — it will not be shown again',
  });
});

router.get('/registrations/:connector', async (req, res) => {
  const info = await getWebhookInfo(req.workspaceId, req.params.connector);
  if (!info) return res.status(404).json({ error: 'Not found' });
  res.json(info);
});

router.patch('/registrations/:connector', async (req, res) => {
  const { eventTypes, endpointUrl } = req.body;
  if (!eventTypes && !endpointUrl) {
    return res.status(400).json({ error: 'eventTypes or endpointUrl required' });
  }

  const fields = [];
  const values = [];
  let i = 1;
  if (eventTypes)  { fields.push(`event_types = $${i++}`);  values.push(eventTypes); }
  if (endpointUrl) { fields.push(`endpoint_url = $${i++}`); values.push(endpointUrl); }
  fields.push(`updated_at = NOW()`);
  values.push(req.workspaceId, req.params.connector);

  await db.query(
    `UPDATE webhook_registrations SET ${fields.join(', ')}
      WHERE workspace_id = $${i++} AND connector_id = $${i++}`,
    values,
  );

  res.json({ ok: true });
});

router.delete('/registrations/:connector', async (req, res) => {
  await deactivateWebhook(req.workspaceId, req.params.connector);
  res.json({ ok: true });
});

// ── Event Log ─────────────────────────────────────────────────────────────────

router.get('/events', async (req, res) => {
  const limit     = Math.min(parseInt(req.query.limit) || 50, 200);
  const offset    = parseInt(req.query.offset) || 0;
  const connector = req.query.connector;
  const urgency   = req.query.urgency;
  const status    = req.query.status;

  const conditions = ['workspace_id = $1'];
  const params     = [req.workspaceId];
  let idx = 2;

  if (connector) { conditions.push(`connector_id = $${idx++}`); params.push(connector); }
  if (urgency)   { conditions.push(`urgency = $${idx++}`);      params.push(urgency); }
  if (status)    { conditions.push(`processing_status = $${idx++}`); params.push(status); }

  const where = conditions.join(' AND ');

  const { rows } = await db.query(
    `SELECT id, connector_id, event_id, delivery_id, event_type, resource_type,
            resource_id, action, actor, summary, urgency, sequence,
            processing_status, error_message, received_at, processed_at
       FROM webhook_events
      WHERE ${where}
      ORDER BY received_at DESC
      LIMIT $${idx++} OFFSET $${idx}`,
    [...params, limit, offset],
  );

  res.json({ events: rows, limit, offset });
});

router.get('/events/:eventId', async (req, res) => {
  const { rows } = await db.query(
    `SELECT * FROM webhook_events
      WHERE workspace_id = $1 AND event_id = $2`,
    [req.workspaceId, req.params.eventId],
  );
  if (!rows.length) return res.status(404).json({ error: 'Not found' });

  const event = rows[0];

  // Fetch delivery attempts from webhook_deliveries
  const { rows: deliveries } = await db.query(
    `SELECT attempt, status, error_message, processing_time_ms, created_at
       FROM webhook_deliveries
      WHERE workspace_id = $1 AND delivery_id = $2
      ORDER BY attempt ASC`,
    [req.workspaceId, event.delivery_id],
  ).catch(() => ({ rows: [] }));

  res.json({ event, deliveries });
});

router.post('/events/:eventId/replay', async (req, res) => {
  const { rows } = await db.query(
    `SELECT * FROM webhook_events
      WHERE workspace_id = $1 AND event_id = $2`,
    [req.workspaceId, req.params.eventId],
  );
  if (!rows.length) return res.status(404).json({ error: 'Not found' });

  const row = rows[0];

  // Reconstruct the normalized event object from DB record
  const event = {
    eventId:      row.event_id,
    deliveryId:   `replay:${row.delivery_id}:${Date.now()}`, // new deliveryId to bypass replay protection
    connectorId:  row.connector_id,
    workspaceId:  row.workspace_id,
    eventType:    row.event_type,
    resourceType: row.resource_type,
    resourceId:   row.resource_id,
    action:       row.action,
    actor:        row.actor,
    summary:      row.summary,
    urgency:      row.urgency,
    metadata:     row.metadata,
    receivedAt:   row.received_at,
    replayed:     true,
  };

  await enqueueWebhookEvent(event, row.raw_payload);

  res.json({ ok: true, replayJobId: event.deliveryId });
});

// ── Stats ─────────────────────────────────────────────────────────────────────

router.get('/stats', async (req, res) => {
  const { rows: connectorStats } = await db.query(
    `SELECT connector_id,
            COUNT(*)                                    AS total_events,
            COUNT(*) FILTER (WHERE urgency = 'high')   AS high_urgency,
            COUNT(*) FILTER (WHERE processing_status = 'failed') AS failed,
            MAX(received_at)                            AS last_event_at
       FROM webhook_events
      WHERE workspace_id = $1
      GROUP BY connector_id`,
    [req.workspaceId],
  );

  const { rows: registrations } = await db.query(
    `SELECT connector_id, status, event_count, last_event_at
       FROM webhook_registrations
      WHERE workspace_id = $1`,
    [req.workspaceId],
  );

  res.json({ connectorStats, registrations });
});

// ── Notifications ─────────────────────────────────────────────────────────────

router.get('/notifications', async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 20, 100);
  const unreadOnly = req.query.unread === 'true';

  const { rows } = await db.query(
    `SELECT id, connector_id, event_type, title, body, urgency, is_read, created_at
       FROM webhook_notifications
      WHERE workspace_id = $1
        ${unreadOnly ? 'AND is_read = false' : ''}
      ORDER BY created_at DESC
      LIMIT $2`,
    [req.workspaceId, limit],
  ).catch(() => ({ rows: [] }));

  res.json({ notifications: rows });
});

router.patch('/notifications/:id/read', async (req, res) => {
  await db.query(
    `UPDATE webhook_notifications SET is_read = true
      WHERE workspace_id = $1 AND id = $2`,
    [req.workspaceId, req.params.id],
  ).catch(() => {});

  res.json({ ok: true });
});

export default router;
