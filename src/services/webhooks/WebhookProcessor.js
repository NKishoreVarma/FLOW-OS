/**
 * WebhookProcessor — main pipeline orchestrator for inbound webhook events.
 *
 * Pipeline per incoming request:
 *   1. Replay protection  — claimDelivery() via Redis SET NX (deduplicate)
 *   2. PERMISSION GATE    — drop events from resources the workspace has not
 *                           authorized FLOW to read (Phase 13.1)
 *   3. Normalize          — translate raw payload into FLOW native event format
 *   4. Sequence tracking  — assign monotonic sequence number per (workspace, connector, resource)
 *   5. Persist to DB      — insert into webhook_events table (idempotent on conflict)
 *   6. Enqueue for async  — push to BullMQ webhook-processing queue
 *   7. Broadcast          — fan-out to all pipeline subscribers (async, after BullMQ ack)
 *
 * The gate runs BEFORE persistence, not in the worker: webhook_events stores the
 * raw provider payload, so gating any later would still write the contents of a
 * hidden channel to the database.
 *
 * Steps 6 and 7 are wired in the BullMQ worker (webhookWorker.js). The HTTP
 * handler only runs steps 1–6, so it can respond immediately (< 20ms).
 */

import { claimDelivery, extractDeliveryId } from './ReplayProtection.js';
import { normalize }                         from './EventNormalizer.js';
import { nextSequence }         from './SequenceTracker.js';
import { enqueueWebhookEvent }  from '../../config/webhookQueue.js';
import { isWebhookAllowed }     from '../../core/governance/integrationPermissions/index.js';
import db                       from '../../config/db.js';
import { logger }               from '../../utils/logger.js';

/**
 * Process one inbound webhook request.
 *
 * @param {string}       connectorId  - 'github' | 'slack' | 'google' | 'notion' | 'jira'
 * @param {string}       workspaceId
 * @param {object}       headers      - raw HTTP headers
 * @param {Buffer|string} rawBody     - original request body (Buffer preferred for sig verification)
 * @param {object}       parsedBody   - already-parsed JSON payload
 * @returns {{ accepted: boolean, eventId?: string, reason?: string }}
 */
export async function processWebhookRequest(connectorId, workspaceId, headers, rawBody, parsedBody) {
  // Step 1 — Extract delivery ID for replay protection (before full normalization)
  const deliveryId = extractDeliveryId(connectorId, headers, parsedBody);

  // Step 2 — Replay protection
  const claimed = await claimDelivery(workspaceId, connectorId, deliveryId).catch(() => true);
  if (!claimed) {
    logger.debug(`[webhook] duplicate delivery ${deliveryId} for ${connectorId}:${workspaceId}`);
    return { accepted: false, reason: 'duplicate' };
  }

  // Step 2b — Integration Permission Gate. A webhook from a resource the
  // workspace has not authorized is dropped here: never normalized, never
  // persisted, never queued, never published.
  const verdict = await isWebhookAllowed(workspaceId, connectorId, parsedBody);
  if (!verdict.allowed) {
    logger.security(
      `[webhook] blocked ${connectorId} delivery for ${workspaceId} — ` +
      `resource not authorized by Integration Permissions (${verdict.reason})`,
    );
    return { accepted: false, reason: 'permission_denied' };
  }

  // Step 3 — Full normalization (passes extracted deliveryId for stable eventId generation)
  let event;
  try {
    event = normalize(connectorId, headers, parsedBody, deliveryId, workspaceId);
  } catch (err) {
    logger.warn(`[webhook] normalize failed ${connectorId}: ${err.message}`);
    return { accepted: false, reason: 'normalization_failed' };
  }

  // Step 4 — Sequence number (ordering guard for out-of-order delivery)
  const sequence = await nextSequence(workspaceId, connectorId, event.resourceId).catch(() => 0);
  event.sequence = sequence;

  // Step 5 — Persist to webhook_events
  try {
    await db.query(
      `INSERT INTO webhook_events
         (workspace_id, connector_id, event_id, delivery_id, event_type, resource_type,
          resource_id, action, actor, summary, urgency, sequence, metadata, raw_payload, processing_status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 'queued')
       ON CONFLICT (workspace_id, connector_id, delivery_id) DO NOTHING`,
      [
        workspaceId,
        connectorId,
        event.eventId,
        event.deliveryId,
        event.eventType,
        event.resourceType,
        event.resourceId,
        event.action,
        JSON.stringify(event.actor),
        event.summary,
        event.urgency,
        sequence,
        JSON.stringify(event.metadata),
        JSON.stringify(parsedBody),
      ],
    );
  } catch (err) {
    // Non-fatal — continue to enqueue even if DB write fails
    logger.warn(`[webhook] db persist failed ${connectorId}:${event.eventId}: ${err.message}`);
  }

  // Step 6 — Enqueue to BullMQ (worker runs the broadcast fan-out)
  await enqueueWebhookEvent(event, parsedBody);

  return { accepted: true, eventId: event.eventId };
}

/**
 * Mark a webhook event as processed (called by webhookWorker after broadcast).
 */
export async function markProcessed(workspaceId, connectorId, deliveryId) {
  try {
    await db.query(
      `UPDATE webhook_events
       SET processing_status = 'processed', processed_at = NOW()
       WHERE workspace_id = $1 AND connector_id = $2 AND delivery_id = $3`,
      [workspaceId, connectorId, deliveryId],
    );
  } catch { /* non-fatal */ }
}

/**
 * Mark a webhook event as failed after exhausting all BullMQ retries.
 */
export async function markFailed(workspaceId, connectorId, deliveryId, errorMessage) {
  try {
    await db.query(
      `UPDATE webhook_events
       SET processing_status = 'failed', error_message = $4, processed_at = NOW()
       WHERE workspace_id = $1 AND connector_id = $2 AND delivery_id = $3`,
      [workspaceId, connectorId, deliveryId, errorMessage],
    );
  } catch { /* non-fatal */ }
}
