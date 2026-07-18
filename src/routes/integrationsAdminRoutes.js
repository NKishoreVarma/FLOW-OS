/**
 * Integration Hub Admin Routes
 *
 * Mounted at /api/integrations-hub (JWT + workspace-id required, except OAuth callbacks).
 *
 * Route map:
 *   GET  /api/integrations-hub/status                        — status for all integrations
 *   GET  /api/integrations-hub/:connectorId/status           — single connector status
 *   GET  /api/integrations-hub/:connectorId/health           — real-time health check
 *   GET  /api/integrations-hub/:connectorId/auth             — initiate OAuth flow (returns authUrl)
 *   GET  /api/integrations-hub/github/callback               — GitHub OAuth callback (public)
 *   GET  /api/integrations-hub/slack/callback                — Slack OAuth callback (public)
 *   GET  /api/integrations-hub/notion/callback               — Notion OAuth callback (public)
 *   GET  /api/integrations-hub/jira/callback                 — Jira OAuth callback (public)
 *   POST /api/integrations-hub/github/pat                    — store GitHub PAT
 *   POST /api/integrations-hub/notion/token                  — store Notion integration token
 *   POST /api/integrations-hub/jira/token                    — store Jira API token
 *   POST /api/integrations-hub/:connectorId/disconnect       — revoke credentials (soft-delete)
 *   POST /api/integrations-hub/:connectorId/reconnect        — revoke + return fresh OAuth URL
 *   GET  /api/integrations-hub/:connectorId/validate         — probe upstream API, persist health
 *   POST /api/integrations-hub/:connectorId/sync             — trigger manual sync
 *   GET  /api/integrations-hub/:connectorId/sync/history     — sync history
 *   GET  /api/integrations-hub/:connectorId/sync/stats       — aggregate sync stats
 *   GET  /api/integrations-hub/:connectorId/webhook          — webhook registration info
 *   POST /api/integrations-hub/:connectorId/webhook          — register webhook
 *   DELETE /api/integrations-hub/:connectorId/webhook        — deactivate webhook
 */

import express from 'express';
import { AppError, ValidationError } from '../core/errors/index.js';
import { enqueueSyncJob }            from '../config/syncQueue.js';
import {
  listConnectedConnectors,
  hasCredentials,
} from '../services/integrations/ConnectorCredentialStore.js';
import {
  getSyncHistory,
  getSyncStats,
} from '../services/integrations/SyncStateManager.js';
import {
  registerWebhook,
  deactivateWebhook,
  getWebhookInfo,
  listWebhooks,
} from '../services/integrations/WebhookManager.js';

const router = express.Router();

// ── Workspace guard ───────────────────────────────────────────────────────────

const CALLBACK_PATHS = ['/github/callback', '/slack/callback', '/notion/callback', '/jira/callback'];

router.use((req, res, next) => {
  if (CALLBACK_PATHS.some(p => req.path.endsWith(p))) return next();
  const workspaceId = req.headers['workspace-id'] || req.tenantId;
  if (!workspaceId) {
    return res.status(400).json({ error: { code: 'MISSING_WORKSPACE', message: 'workspace-id header required' } });
  }
  req.workspaceId = workspaceId;
  next();
});

// ── Per-connector OAuth service loader ────────────────────────────────────────

async function getOAuthService(connectorId) {
  switch (connectorId) {
    case 'github':          return import('../services/integrations/GitHubOAuthService.js');
    case 'slack':           return import('../services/integrations/SlackOAuthService.js');
    case 'notion':          return import('../services/integrations/NotionOAuthService.js');
    case 'jira':            return import('../services/integrations/JiraOAuthService.js');
    case 'google':
    case 'gmail':
    case 'google-calendar': return import('../services/google/GoogleOAuthService.js');
    default:
      throw new AppError(`Unknown connector: ${connectorId}`, 400, 'UNKNOWN_CONNECTOR');
  }
}

// For /status, gmail and google-calendar both map to the same Google credential set.
// We normalise the connector ID so the status response uses a stable key.
const GOOGLE_CONNECTOR_IDS = new Set(['gmail', 'google-calendar', 'google']);

const CONNECTORS = ['github', 'slack', 'jira', 'notion', 'gmail', 'google-calendar'];

// ── GET /api/integrations-hub/status ─────────────────────────────────────────

router.get('/status', async (req, res, next) => {
  try {
    const { workspaceId } = req;
    const [connected, webhooks] = await Promise.all([
      listConnectedConnectors(workspaceId),
      listWebhooks(workspaceId),
    ]);

    const webhookMap = Object.fromEntries(webhooks.map(w => [w.connector_id, w]));

    const statuses = await Promise.allSettled(
      CONNECTORS.map(async id => {
        const svc = await getOAuthService(id).catch(() => null);
        const status = svc ? await svc.getStatus(workspaceId).catch(() => ({ connected: false })) : { connected: false };
        const stats  = await getSyncStats(workspaceId, id).catch(() => null);
        return [id, { ...status, syncStats: stats, webhook: webhookMap[id] || null }];
      }),
    );

    const result = {};
    for (const s of statuses) {
      if (s.status === 'fulfilled') {
        const [id, val] = s.value;
        result[id] = val;
        // Google connectors share one token — surface the same status under both keys
        if (GOOGLE_CONNECTOR_IDS.has(id)) {
          result['gmail']           = result['gmail'] || val;
          result['google-calendar'] = result['google-calendar'] || val;
        }
      }
    }

    res.json({ success: true, integrations: result, connectedCount: connected.length });
  } catch (err) { next(err); }
});

// ── GET /api/integrations-hub/:connectorId/status ────────────────────────────

router.get('/:connectorId/status', async (req, res, next) => {
  try {
    const svc    = await getOAuthService(req.params.connectorId);
    const status = await svc.getStatus(req.workspaceId);
    const stats  = await getSyncStats(req.workspaceId, req.params.connectorId).catch(() => null);
    const webhook = await getWebhookInfo(req.workspaceId, req.params.connectorId).catch(() => null);
    res.json({ success: true, ...status, syncStats: stats, webhook });
  } catch (err) { next(err); }
});

// ── GET /api/integrations-hub/:connectorId/health ────────────────────────────

router.get('/:connectorId/health', async (req, res, next) => {
  try {
    const svc    = await getOAuthService(req.params.connectorId);
    const health = await svc.healthCheck(req.workspaceId);
    res.json({ success: true, connectorId: req.params.connectorId, ...health });
  } catch (err) { next(err); }
});

// ── GET /api/integrations-hub/:connectorId/auth ──────────────────────────────

router.get('/:connectorId/auth', async (req, res, next) => {
  try {
    const svc    = await getOAuthService(req.params.connectorId);
    const result = await svc.getAuthUrl(req.workspaceId);
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
});

// ── OAuth callbacks (no JWT — external redirect) ──────────────────────────────

async function _oauthCallback(connectorId, req, res) {
  const { code, state, error } = req.query;
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
  const dest        = `/platform/integrations`;

  if (error) return res.redirect(`${frontendUrl}${dest}?error=${encodeURIComponent(error)}&connector=${connectorId}`);
  if (!code || !state) return res.status(400).send('Missing code or state');

  try {
    const svc    = await getOAuthService(connectorId);
    const result = await svc.handleCallback(code, state);
    res.redirect(`${frontendUrl}${dest}?connected=${connectorId}&workspace=${result.workspaceId}`);
  } catch (err) {
    res.redirect(`${frontendUrl}${dest}?error=${encodeURIComponent(err.message)}&connector=${connectorId}`);
  }
}

router.get('/github/callback',  (req, res) => _oauthCallback('github',  req, res));
router.get('/slack/callback',   (req, res) => _oauthCallback('slack',   req, res));
router.get('/notion/callback',  (req, res) => _oauthCallback('notion',  req, res));
router.get('/jira/callback',    (req, res) => _oauthCallback('jira',    req, res));

// ── POST /api/integrations-hub/github/pat ────────────────────────────────────

router.post('/github/pat', async (req, res, next) => {
  try {
    const { token } = req.body || {};
    if (!token) throw new ValidationError('token is required');
    const { storePAT } = await import('../services/integrations/GitHubOAuthService.js');
    const result = await storePAT(req.workspaceId, token);
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
});

// ── POST /api/integrations-hub/notion/token ──────────────────────────────────

router.post('/notion/token', async (req, res, next) => {
  try {
    const { token } = req.body || {};
    if (!token) throw new ValidationError('token is required');
    const { storeIntegrationToken } = await import('../services/integrations/NotionOAuthService.js');
    const result = await storeIntegrationToken(req.workspaceId, token);
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
});

// ── POST /api/integrations-hub/jira/token ────────────────────────────────────

router.post('/jira/token', async (req, res, next) => {
  try {
    const { email, apiToken, domain } = req.body || {};
    const { storeAPIToken } = await import('../services/integrations/JiraOAuthService.js');
    const result = await storeAPIToken(req.workspaceId, { email, apiToken, domain });
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
});

// ── POST /api/integrations-hub/:connectorId/disconnect ───────────────────────

router.post('/:connectorId/disconnect', async (req, res, next) => {
  try {
    const svc    = await getOAuthService(req.params.connectorId);
    const result = await svc.disconnect(req.workspaceId);
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
});

// ── POST /api/integrations-hub/:connectorId/reconnect ────────────────────────
// Revokes the existing token, then returns a fresh OAuth consent URL.
// Flow: POST /reconnect → redirect user to { authUrl } → callback saves new tokens.

router.post('/:connectorId/reconnect', async (req, res, next) => {
  try {
    const { connectorId } = req.params;
    const svc             = await getOAuthService(connectorId);

    if (typeof svc.reconnect !== 'function') {
      return res.status(400).json({
        error: { code: 'RECONNECT_NOT_SUPPORTED', message: `${connectorId} does not support reconnect via this endpoint.` },
      });
    }

    const result = await svc.reconnect(req.workspaceId);
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
});

// ── GET /api/integrations-hub/:connectorId/validate ──────────────────────────
// Probes the upstream API with the stored token; persists the health result.
// Returns { valid, healthStatus, action? } without revoking anything.

router.get('/:connectorId/validate', async (req, res, next) => {
  try {
    const svc = await getOAuthService(req.params.connectorId);

    if (typeof svc.validateCredentials !== 'function') {
      // Fall back to healthCheck if validateCredentials not implemented
      const result = await svc.healthCheck(req.workspaceId);
      return res.json({ success: true, valid: result.healthy, healthStatus: result.healthy ? 'healthy' : 'degraded', ...result });
    }

    const result = await svc.validateCredentials(req.workspaceId);
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
});

// ── POST /api/integrations-hub/:connectorId/sync ─────────────────────────────

router.post('/:connectorId/sync', async (req, res, next) => {
  try {
    const { connectorId } = req.params;
    const connected = await hasCredentials(req.workspaceId, connectorId);
    if (!connected && connectorId !== 'github') {
      throw new AppError(`${connectorId} is not connected`, 400, 'NOT_CONNECTED');
    }
    await enqueueSyncJob(req.workspaceId, connectorId, req.body?.resourceType || 'default', {
      trigger: 'manual',
    });
    res.json({ success: true, queued: true, connector: connectorId });
  } catch (err) { next(err); }
});

// ── GET /api/integrations-hub/:connectorId/sync/history ──────────────────────

router.get('/:connectorId/sync/history', async (req, res, next) => {
  try {
    const history = await getSyncHistory(req.workspaceId, req.params.connectorId, {
      limit:        parseInt(req.query.limit, 10) || 20,
      resourceType: req.query.resourceType || null,
    });
    res.json({ success: true, history });
  } catch (err) { next(err); }
});

// ── GET /api/integrations-hub/:connectorId/sync/stats ────────────────────────

router.get('/:connectorId/sync/stats', async (req, res, next) => {
  try {
    const stats = await getSyncStats(req.workspaceId, req.params.connectorId);
    res.json({ success: true, stats });
  } catch (err) { next(err); }
});

// ── Webhook management ────────────────────────────────────────────────────────

router.get('/:connectorId/webhook', async (req, res, next) => {
  try {
    const info = await getWebhookInfo(req.workspaceId, req.params.connectorId);
    res.json({ success: true, webhook: info });
  } catch (err) { next(err); }
});

router.post('/:connectorId/webhook', async (req, res, next) => {
  try {
    const { connectorId } = req.params;
    const baseUrl         = process.env.WEBHOOK_BASE_URL || `http://localhost:5001`;
    const endpointUrl     = `${baseUrl}/api/webhooks/${connectorId}?workspace=${req.workspaceId}`;
    const eventTypes      = req.body?.eventTypes || _defaultEventTypes(connectorId);

    const secret = await registerWebhook(req.workspaceId, connectorId, {
      endpointUrl,
      eventTypes,
    });

    res.json({
      success: true,
      endpointUrl,
      eventTypes,
      note:    'Register this URL and the secret with your provider. The secret is shown only once.',
      secret,
    });
  } catch (err) { next(err); }
});

router.delete('/:connectorId/webhook', async (req, res, next) => {
  try {
    await deactivateWebhook(req.workspaceId, req.params.connectorId);
    res.json({ success: true, deactivated: true });
  } catch (err) { next(err); }
});

function _defaultEventTypes(connectorId) {
  switch (connectorId) {
    case 'github': return ['push', 'pull_request', 'pull_request_review', 'issues', 'deployment', 'deployment_status', 'workflow_run'];
    case 'slack':  return ['message', 'app_mention', 'reaction_added'];
    case 'jira':   return ['jira:issue_created', 'jira:issue_updated', 'jira:issue_deleted'];
    default:       return ['*'];
  }
}

export default router;
