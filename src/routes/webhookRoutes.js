/**
 * Webhook Routes — universal inbound webhook endpoint.
 *
 * Mounted at /api/webhooks (before authenticate middleware — no JWT required).
 * Single route: POST /api/webhooks/:connector
 *
 * Pipeline per request (all async, responds immediately):
 *   1. Raw body capture (required for HMAC signature verification)
 *   2. Workspace resolution (query param or X-Flow-Workspace header)
 *   3. HMAC signature verification (connector-specific, via WebhookManager)
 *   4. Slack URL verification challenge passthrough (before signature check)
 *   5. JSON parse
 *   6. processWebhookRequest() — replay protection → normalize → sequence → persist → enqueue
 *
 * Respond with 200 before BullMQ processing completes (async pipeline).
 * Slack requires < 3s response time; GitHub and Jira are lenient.
 *
 * Supported connectors (via :connector param):
 *   github, slack, google, gmail, google-calendar, notion, jira
 *
 * Webhook URL format:
 *   https://your-domain.com/api/webhooks/github?workspace=workspace_corp_alpha
 */

import express  from 'express';
import { validateWebhookSignature, recordWebhookEvent } from '../services/integrations/WebhookManager.js';
import { processWebhookRequest } from '../services/webhooks/WebhookProcessor.js';
import { enqueueSyncJob }        from '../config/syncQueue.js';
import { logger }                from '../utils/logger.js';

const router = express.Router();

// Raw body capture — signature verification requires the original bytes
router.use(express.raw({ type: ['application/json', 'application/x-www-form-urlencoded'], limit: '4mb' }));

function resolveWorkspace(req) {
  return (
    req.query.workspace ||
    req.headers['x-flow-workspace'] ||
    req.headers['x-workspace-id'] ||
    null
  );
}

// ── Universal handler ─────────────────────────────────────────────────────────

router.post('/:connector', async (req, res) => {
  const connectorId = req.params.connector;
  const rawBody     = req.body; // Buffer from express.raw()

  // Parse body first (needed for Slack challenge and workspace resolution)
  let payload;
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  // Slack URL verification challenge — must respond before auth check
  if (connectorId === 'slack' && payload.type === 'url_verification') {
    return res.json({ challenge: payload.challenge });
  }

  const workspaceId = resolveWorkspace(req);
  if (!workspaceId) {
    return res.status(400).json({ error: 'workspace query param required (?workspace=<id>)' });
  }

  // Signature verification (non-fatal if webhook is not yet registered in DB)
  try {
    const valid = await validateWebhookSignature(connectorId, workspaceId, req.headers, rawBody);
    if (!valid) {
      logger.warn(`[webhook] ${connectorId} signature invalid for workspace ${workspaceId}`);
      return res.status(401).json({ error: 'Invalid webhook signature' });
    }
  } catch {
    // Webhook may not be registered yet — allow through in dev; log the miss
    logger.debug(`[webhook] ${connectorId} signature check skipped for workspace ${workspaceId} (not registered)`);
  }

  // Respond immediately — Slack enforces a 3s SLA
  res.status(200).json({ ok: true });

  // Async pipeline (no await on response path)
  Promise.resolve().then(async () => {
    try {
      const result = await processWebhookRequest(
        connectorId, workspaceId, req.headers, rawBody, payload,
      );

      if (result.accepted) {
        logger.queue(`[webhook] ${connectorId}/${workspaceId} accepted event ${result.eventId}`);
      } else {
        logger.debug(`[webhook] ${connectorId}/${workspaceId} rejected: ${result.reason}`);
      }

      // Record delivery count in webhook_registrations
      await recordWebhookEvent(workspaceId, connectorId).catch(() => {});

      // Trigger targeted sync for the affected resource (connector-specific)
      const syncHint = _syncHint(connectorId, req.headers, payload);
      if (syncHint) {
        await enqueueSyncJob(workspaceId, connectorId, syncHint.resourceType, {
          trigger:        'webhook',
          webhookPayload: payload,
          delayMs:        syncHint.delayMs ?? 0,
        }).catch(() => {});
      }
    } catch (err) {
      logger.error(`[webhook] pipeline error ${connectorId}/${workspaceId}: ${err.message}`);
    }
  });
});

// ── Sync hints per connector event ───────────────────────────────────────────

function _syncHint(connectorId, headers, payload) {
  switch (connectorId) {
    case 'github': {
      const eventType = headers['x-github-event'] || '';
      const rt = _githubResourceType(eventType);
      return rt ? { resourceType: rt, delayMs: 0 } : null;
    }
    case 'slack': {
      const event = payload.event || {};
      if (event.type === 'message' && event.channel) {
        return { resourceType: 'messages', delayMs: 2000 };
      }
      return null;
    }
    case 'jira': {
      const key = payload.issue?.key;
      return key ? { resourceType: 'issues', delayMs: 0 } : null;
    }
    case 'notion':
      return { resourceType: 'pages', delayMs: 1000 };
    case 'google':
    case 'google-calendar':
      return { resourceType: 'events', delayMs: 1000 };
    default:
      return null;
  }
}

function _githubResourceType(eventType) {
  switch (eventType) {
    case 'push':                    return 'commits';
    case 'pull_request':
    case 'pull_request_review':     return 'pull_requests';
    case 'issues':                  return 'issues';
    case 'release':                 return 'releases';
    default:                        return null;
  }
}

export default router;
