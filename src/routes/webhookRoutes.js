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

  // Signature verification MUST use the exact bytes GitHub/Slack signed. The global
  // JSON parser captures those on req.rawBody (verify hook); prefer it. Fall back to
  // the route-level express.raw() Buffer, or re-serialize as a last resort.
  const sigBody = Buffer.isBuffer(req.rawBody) ? req.rawBody
    : Buffer.isBuffer(req.body) ? req.body
    : (typeof req.body === 'string' ? Buffer.from(req.body) : null);

  const rawBody = req.body; // may be a Buffer (route raw parser) or a parsed object

  // Parse body defensively: raw bytes, string, or an already-decoded object.
  let payload;
  try {
    if (Buffer.isBuffer(req.rawBody))           payload = JSON.parse(req.rawBody.toString('utf8'));
    else if (Buffer.isBuffer(rawBody))          payload = JSON.parse(rawBody.toString('utf8'));
    else if (typeof rawBody === 'string')       payload = JSON.parse(rawBody);
    else if (rawBody && typeof rawBody === 'object') payload = rawBody;
    else throw new Error('empty body');
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

  // Signature verification. Uses the exact signed bytes (req.rawBody).
  // FAIL-CLOSED: outside development, an unregistered/unverifiable webhook is
  // REJECTED (401) — never allowed through. Dev may allow-through for local testing.
  // Reversible override: WEBHOOK_ALLOW_UNREGISTERED=true.
  const allowUnregistered =
    process.env.WEBHOOK_ALLOW_UNREGISTERED === 'true' ||
    (process.env.NODE_ENV !== 'production' && process.env.FLOW_ENV !== 'production');
  try {
    const valid = await validateWebhookSignature(connectorId, workspaceId, req.headers, sigBody ?? rawBody);
    if (!valid) {
      logger.warn(`[webhook] ${connectorId} signature invalid for workspace ${workspaceId}`);
      return res.status(401).json({ error: 'Invalid webhook signature' });
    }
  } catch {
    if (!allowUnregistered) {
      logger.warn(`[webhook] ${connectorId} unverifiable (not registered / verify error) — FAIL CLOSED for workspace ${workspaceId}`);
      return res.status(401).json({ error: 'Webhook not registered or signature unverifiable' });
    }
    logger.debug(`[webhook] ${connectorId} signature check skipped (dev, not registered) for workspace ${workspaceId}`);
  }

  // DURABLE-BEFORE-ACK: processWebhookRequest replay-checks → gates → normalizes →
  // persists to webhook_events (idempotent) → enqueues to the durable webhook queue.
  // We AWAIT it before acking so a crash cannot silently drop an event; on failure we
  // return 5xx so the provider retries (idempotent persist + replay protection make
  // the retry safe). This path is LLM-free and well within provider SLAs (<3s).
  try {
    const result = await processWebhookRequest(
      connectorId, workspaceId, req.headers, rawBody, payload,
    );
    if (result.accepted) {
      logger.queue(`[webhook] ${connectorId}/${workspaceId} accepted event ${result.eventId}`);
      // Secondary, non-durable-critical side effects (fire-and-forget).
      recordWebhookEvent(workspaceId, connectorId).catch(() => {});
      const syncHint = _syncHint(connectorId, req.headers, payload);
      if (syncHint) {
        enqueueSyncJob(workspaceId, connectorId, syncHint.resourceType, {
          trigger:        'webhook',
          webhookPayload: payload,
          delayMs:        syncHint.delayMs ?? 0,
        }).catch(() => {});
      }
    } else {
      logger.debug(`[webhook] ${connectorId}/${workspaceId} rejected: ${result.reason}`);
    }
    // Ack only AFTER durable persistence. Rejected-but-valid (dup/permission) is a 200
    // (provider should not retry a correctly-refused event).
    return res.status(200).json({ ok: true, accepted: !!result.accepted });
  } catch (err) {
    logger.error(`[webhook] pipeline error ${connectorId}/${workspaceId}: ${err.message}`);
    return res.status(500).json({ error: 'processing_failed' });   // provider retries
  }
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
