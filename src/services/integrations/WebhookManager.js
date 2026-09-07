/**
 * WebhookManager — registers, validates, and routes inbound webhook events.
 *
 * Each connector has its own signature scheme:
 *   GitHub   — X-Hub-Signature-256: sha256=<HMAC-SHA256>
 *   Slack    — X-Slack-Signature: v0=<HMAC-SHA256> + X-Slack-Request-Timestamp
 *   Notion   — No native webhooks (polling-based sync instead)
 *   Jira     — X-Hub-Signature: sha256=<HMAC-SHA256>  (Atlassian Connect)
 *
 * The shared secret is stored encrypted via ConnectorCredentialStore under
 * a synthetic connectorId like 'github:webhook' to separate from the main creds.
 *
 * Registration is stored in webhook_registrations table.
 */

import crypto    from 'crypto';
import db        from '../../config/db.js';
import { saveCredentials, loadCredentials } from './ConnectorCredentialStore.js';

const ALGORITHM = 'aes-256-gcm';
const KEY_LEN   = 32;
const SALT      = 'flow-webhook-secret-v10';

// ── Secret encryption (separate key derivation from main creds) ───────────────

function _key() {
  return crypto.scryptSync(process.env.JWT_SECRET, SALT, KEY_LEN);
}

function encryptSecret(secret) {
  const iv     = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, _key(), iv);
  const enc    = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  const tag    = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${enc.toString('hex')}`;
}

function decryptSecret(ciphertext) {
  const [ivHex, tagHex, encHex] = ciphertext.split(':');
  const decipher = crypto.createDecipheriv(ALGORITHM, _key(), Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  return Buffer.concat([
    decipher.update(Buffer.from(encHex, 'hex')),
    decipher.final(),
  ]).toString('utf8');
}

// ── Connector signature schemes ───────────────────────────────────────────────

const SCHEMES = {
  github: {
    headerName:  'x-hub-signature-256',
    compute:     (secret, body) => `sha256=${crypto.createHmac('sha256', secret).update(body).digest('hex')}`,
    compare:     (a, b) => {
      if (a.length !== b.length) return false;
      return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
    },
  },
  slack: {
    headerName:  'x-slack-signature',
    timestampHeader: 'x-slack-request-timestamp',
    compute:     (secret, body, ts) => {
      const sigBase = `v0:${ts}:${body}`;
      return `v0=${crypto.createHmac('sha256', secret).update(sigBase).digest('hex')}`;
    },
    compare:     (a, b) => {
      if (a.length !== b.length) return false;
      return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
    },
    validate:    (_secret, _body, ts) => {
      // Reject if timestamp is more than 5 minutes old (replay attack prevention)
      return Math.abs(Date.now() / 1000 - parseInt(ts, 10)) < 300;
    },
  },
  jira: {
    headerName:  'x-hub-signature',
    compute:     (secret, body) => `sha256=${crypto.createHmac('sha256', secret).update(body).digest('hex')}`,
    compare:     (a, b) => {
      if (a.length !== b.length) return false;
      return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
    },
  },
};

// ── Registration ──────────────────────────────────────────────────────────────

/**
 * Register (or update) a webhook for a workspace+connector.
 * Returns the webhook secret to send to the platform.
 */
export async function registerWebhook(workspaceId, connectorId, {
  endpointUrl,
  eventTypes   = [],
  platformHookId = null,
  secret       = null,
}) {
  const webhookSecret = secret || crypto.randomBytes(32).toString('hex');
  const secretHash    = crypto.createHash('sha256').update(webhookSecret).digest('hex');
  const encryptedSec  = encryptSecret(webhookSecret);

  await db.query(
    `INSERT INTO webhook_registrations
       (workspace_id, connector_id, platform_hook_id, event_types, endpoint_url,
        secret_hash, encrypted_secret, status, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'active', NOW(), NOW())
     ON CONFLICT (workspace_id, connector_id) DO UPDATE SET
       platform_hook_id = COALESCE(EXCLUDED.platform_hook_id, webhook_registrations.platform_hook_id),
       event_types      = EXCLUDED.event_types,
       endpoint_url     = EXCLUDED.endpoint_url,
       secret_hash      = EXCLUDED.secret_hash,
       encrypted_secret = EXCLUDED.encrypted_secret,
       status           = 'active',
       updated_at       = NOW()`,
    [workspaceId, connectorId, platformHookId, eventTypes, endpointUrl, secretHash, encryptedSec],
  );

  return webhookSecret;
}

/**
 * Update the platform-assigned hook ID after registering with the platform.
 */
export async function setPlatformHookId(workspaceId, connectorId, platformHookId) {
  await db.query(
    `UPDATE webhook_registrations SET platform_hook_id = $1, updated_at = NOW()
      WHERE workspace_id = $2 AND connector_id = $3`,
    [platformHookId, workspaceId, connectorId],
  );
}

/**
 * Deactivate a webhook registration.
 */
export async function deactivateWebhook(workspaceId, connectorId) {
  await db.query(
    `UPDATE webhook_registrations SET status = 'inactive', updated_at = NOW()
      WHERE workspace_id = $1 AND connector_id = $2`,
    [workspaceId, connectorId],
  );
}

// ── Signature validation ──────────────────────────────────────────────────────

/**
 * Validate an inbound webhook request.
 *
 * @param {string} connectorId  — 'github' | 'slack' | 'jira'
 * @param {string} workspaceId  — resolved from webhook path or payload
 * @param {object} headers      — raw request headers (lowercase)
 * @param {Buffer|string} body  — raw request body
 * @returns {Promise<boolean>}
 */
export async function validateWebhookSignature(connectorId, workspaceId, headers, body) {
  const { rows } = await db.query(
    `SELECT encrypted_secret FROM webhook_registrations
      WHERE workspace_id = $1 AND connector_id = $2 AND status = 'active'`,
    [workspaceId, connectorId],
  );
  if (!rows.length) return false;

  let secret;
  try {
    secret = decryptSecret(rows[0].encrypted_secret);
  } catch {
    return false;
  }

  const scheme = SCHEMES[connectorId];
  if (!scheme) return true; // no scheme registered → passthrough (dev mode)

  const bodyStr = Buffer.isBuffer(body) ? body.toString('utf8') : String(body);
  const incomingSig = headers[scheme.headerName] || '';

  if (scheme.validate) {
    const ts = headers[scheme.timestampHeader] || '';
    if (!scheme.validate(secret, bodyStr, ts)) return false;
    const expected = scheme.compute(secret, bodyStr, ts);
    return scheme.compare(incomingSig, expected);
  }

  const expected = scheme.compute(secret, bodyStr);
  return scheme.compare(incomingSig, expected);
}

/**
 * Record that an event was received (increments event_count, updates last_event_at).
 */
export async function recordWebhookEvent(workspaceId, connectorId) {
  await db.query(
    `UPDATE webhook_registrations
        SET event_count   = event_count + 1,
            last_event_at = NOW(),
            updated_at    = NOW()
      WHERE workspace_id = $1 AND connector_id = $2`,
    [workspaceId, connectorId],
  );
}

// ── Query ─────────────────────────────────────────────────────────────────────

export async function getWebhookInfo(workspaceId, connectorId) {
  const { rows } = await db.query(
    `SELECT platform_hook_id, event_types, endpoint_url, status,
            last_event_at, event_count, created_at
       FROM webhook_registrations
      WHERE workspace_id = $1 AND connector_id = $2`,
    [workspaceId, connectorId],
  );
  return rows[0] ?? null;
}

export async function listWebhooks(workspaceId) {
  const { rows } = await db.query(
    `SELECT connector_id, platform_hook_id, event_types, endpoint_url,
            status, last_event_at, event_count, created_at
       FROM webhook_registrations
      WHERE workspace_id = $1
      ORDER BY created_at DESC`,
    [workspaceId],
  );
  return rows;
}
