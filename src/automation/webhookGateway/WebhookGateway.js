/**
 * WebhookGateway — Express router that ingests, verifies, deduplicates,
 * and publishes external webhook events into the FLOW event bus.
 *
 * Routes (mounted at /webhooks):
 *   POST /webhooks/github
 *   POST /webhooks/slack
 *   POST /webhooks/stripe
 *   POST /webhooks/jira
 *   POST /webhooks/google
 *   POST /webhooks/custom/:connector
 *
 * The raw body is preserved for signature verification (express.raw middleware).
 * After verification the parsed payload is published to the event bus.
 */

import { Router }                from 'express';
import { query }                 from '../../config/db.js';
import { publishFields }         from '../../events/index.js';
import { checkAndMark }          from './ReplayProtection.js';
import { randomUUID }            from 'crypto';
import { logger }                from '../../utils/logger.js';

import * as GitHub   from './verifiers/GitHubVerifier.js';
import * as Slack    from './verifiers/SlackVerifier.js';
import * as Stripe   from './verifiers/StripeVerifier.js';
import * as Jira     from './verifiers/JiraVerifier.js';
import * as Google   from './verifiers/GoogleVerifier.js';
import * as Custom   from './verifiers/CustomVerifier.js';

const VERIFIERS = {
  github: { v: GitHub,  secret: () => process.env.GITHUB_WEBHOOK_SECRET },
  slack:  { v: Slack,   secret: () => process.env.SLACK_SIGNING_SECRET },
  stripe: { v: Stripe,  secret: () => process.env.STRIPE_WEBHOOK_SECRET },
  jira:   { v: Jira,    secret: () => process.env.JIRA_WEBHOOK_SECRET },
  google: { v: Google,  secret: () => null },
};

const router = Router();

// ── Raw body middleware (required for signature verification) ─────────────────
// Applied per-route so it doesn't interfere with the rest of the API.
import bodyParser from 'body-parser';
const rawBody = bodyParser.raw({ type: '*/*', limit: '10mb' });

// ── Known connector routes ────────────────────────────────────────────────────

for (const [connector, { v, secret }] of Object.entries(VERIFIERS)) {
  router.post(`/${connector}`, rawBody, makeHandler(connector, v, secret));
}

// ── Custom connector route ────────────────────────────────────────────────────
router.post('/custom/:connector', rawBody, (req, res, next) => {
  makeHandler(req.params.connector, Custom, () => process.env[`WEBHOOK_SECRET_${req.params.connector.toUpperCase()}`])(req, res, next);
});

// ── Handler factory ───────────────────────────────────────────────────────────

function makeHandler(connector, verifier, getSecret) {
  return async (req, res) => {
    const rawBody = req.body;  // Buffer

    // 1. Workspace resolution — via workspaceId query param or header
    const workspaceId = req.query.workspaceId
      ?? req.headers['x-workspace-id']
      ?? process.env[`${connector.toUpperCase()}_WEBHOOK_WORKSPACE`];

    // 2. Signature verification
    const secret = getSecret();
    const verification = verifier.verify(req, rawBody, secret);

    // Parse payload
    let payload;
    try { payload = JSON.parse(rawBody.toString('utf8')); }
    catch { payload = {}; }

    const deliveryId  = verifier.extractDeliveryId?.(req, payload) ?? randomUUID();
    const rawEventType = verifier.extractEventType?.(req, payload) ?? `${connector}.webhook`;

    // Persist delivery record
    const deliveryRecordId = await _persistDelivery({
      connector, deliveryId, payload, headers: req.headers,
      signatureVerified: verification.ok, eventId: rawEventType,
      workspaceId: workspaceId ?? null,
    });

    // Signature failure — reject with 401 but still log
    if (!verification.ok) {
      logger.warn(`[WebhookGateway] ${connector} signature failed: ${verification.reason}`);
      return res.status(401).json({ error: 'Signature verification failed', reason: verification.reason });
    }

    // 3. Slack URL verification challenge
    if (connector === 'slack' && payload?.type === 'url_verification') {
      return res.json({ challenge: payload.challenge });
    }

    // 4. Replay protection
    const { duplicate } = await checkAndMark(connector, deliveryId);
    if (duplicate) {
      logger.info(`[WebhookGateway] ${connector} duplicate delivery ${deliveryId} — ignored`);
      await _updateDelivery(deliveryRecordId, 'DUPLICATE');
      return res.status(200).json({ status: 'duplicate', deliveryId });
    }

    // 5. Publish to FLOW event bus (which routes to automation triggers + timeline)
    if (workspaceId) {
      publishFields({
        workspaceId,
        source:        connector,
        type:          rawEventType,
        title:         `Webhook: ${rawEventType}`,
        payload,
        importance:    0.5,
        sourceEventId: deliveryId,
      }).then(async () => {
        await _updateDelivery(deliveryRecordId, 'PROCESSED');
      }).catch(async err => {
        logger.error(`[WebhookGateway] Event publish failed: ${err.message}`);
        await _updateDelivery(deliveryRecordId, 'FAILED', err.message);
      });
    } else {
      // No workspaceId — still acknowledge but don't route to event bus
      logger.warn(`[WebhookGateway] ${connector} webhook has no workspaceId — not published`);
      await _updateDelivery(deliveryRecordId, 'PROCESSED');
    }

    res.status(200).json({ status: 'accepted', deliveryId, connector });
  };
}

async function _persistDelivery({ connector, deliveryId, payload, headers, signatureVerified, eventId, workspaceId }) {
  const id = randomUUID();
  try {
    await query(
      `INSERT INTO webhook_deliveries
         (id, workspace_id, connector, delivery_id, signature_verified, payload, headers, event_id, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'RECEIVED')`,
      [id, workspaceId ?? null, connector, deliveryId,
       signatureVerified, JSON.stringify(payload),
       JSON.stringify({ 'x-forwarded-for': headers['x-forwarded-for'], 'user-agent': headers['user-agent'] }),
       eventId],
    );
  } catch { /* non-fatal */ }
  return id;
}

async function _updateDelivery(id, status, error = null) {
  if (!id) return;
  try {
    await query(
      'UPDATE webhook_deliveries SET status=$1, error=$2, processed_at=NOW() WHERE id=$3',
      [status, error, id],
    );
  } catch { /* non-fatal */ }
}

export { router as webhookRouter };
