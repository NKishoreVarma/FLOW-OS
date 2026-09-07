/**
 * WebhookAutoRegistrar — when a workspace connects a provider, set up real-time
 * webhooks so events reach the FLOW live panel within seconds (instead of the
 * 3-minute connector poll).
 *
 * Per provider it does two things:
 *   1. FLOW-side  — registerWebhook() stores the receiver endpoint + a signing secret.
 *   2. Provider-side — creates the actual webhook on the provider (GitHub repo hooks),
 *      pointed at our endpoint and signed with that secret, so deliveries verify.
 *
 * Requires WEBHOOK_BASE_URL — a PUBLIC url (ngrok in dev, the domain in prod).
 * Without it, providers cannot reach this server, so registration is skipped and
 * the connector poller remains the (near-real-time) source. Best-effort throughout:
 * this never throws into the connect flow.
 */

import { registerWebhook } from './WebhookManager.js';
import { getConnector }    from '../../connectors/registry.js';
import { ActionType }      from '../../connectors/capabilities.js';
import { getCredentials }  from '../../connectors/authManager.js';
import { logger }          from '../../utils/logger.js';

const GITHUB_API = process.env.GITHUB_API_URL || 'https://api.github.com';
const MAX_REPOS  = 5;

/**
 * Register real-time webhooks for a freshly-connected connector. Fire-and-forget
 * from the connect handler — the returned promise is for logging/tests only.
 */
export async function autoRegisterWebhooks(workspaceId, connectorId) {
  const base = process.env.WEBHOOK_BASE_URL;
  if (!base) {
    logger.rag?.(`[WebhookAutoReg] WEBHOOK_BASE_URL not set — skipping ${connectorId} webhooks (poller still active)`);
    return { registered: false, reason: 'no_public_url' };
  }

  const endpointUrl = `${base.replace(/\/+$/, '')}/api/webhooks/${connectorId}?workspace=${encodeURIComponent(workspaceId)}`;
  try {
    if (connectorId === 'github') return await _github(workspaceId, endpointUrl);

    // slack / jira: store the FLOW-side registration + secret. The provider-side
    // subscription is created in that provider's app config (not via a user token).
    const secret = await registerWebhook(workspaceId, connectorId, { endpointUrl, eventTypes: [] });
    logger.rag?.(`[WebhookAutoReg] ${connectorId} endpoint registered (${endpointUrl})`);
    return { registered: !!secret, connectorId, endpointUrl, providerHooks: 'manual' };
  } catch (err) {
    logger.rag?.(`[WebhookAutoReg] ${connectorId} failed: ${err.message}`);
    return { registered: false, error: err.message };
  }
}

// ── GitHub: FLOW-side registration + real repo hooks via the user's PAT ─────────
async function _github(workspaceId, endpointUrl) {
  const secret = await registerWebhook(workspaceId, 'github', { endpointUrl, eventTypes: ['pull_request', 'push'] });

  const token = getCredentials(workspaceId, 'github')?.apiKey || process.env.GITHUB_TOKEN;
  if (!token) {
    logger.rag?.('[WebhookAutoReg] github registered FLOW-side but no token to create repo hooks');
    return { registered: true, connectorId: 'github', endpointUrl, hooks: [] };
  }

  const github = getConnector('github');
  let repos = [];
  try { repos = await github.execute(workspaceId, ActionType.READ, { resourceType: 'repos', limit: MAX_REPOS }); }
  catch (err) { logger.rag?.(`[WebhookAutoReg] github repo list failed: ${err.message}`); }

  const headers = {
    Authorization:          `Bearer ${token}`,
    Accept:                 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent':           'FLOW-OS/1.0',
    'Content-Type':         'application/json',
  };
  const body = JSON.stringify({
    name:   'web',
    active: true,
    events: ['pull_request', 'push'],
    config: { url: endpointUrl, content_type: 'json', secret },
  });

  const hooks = [];
  for (const repo of (repos || []).slice(0, MAX_REPOS)) {
    if (!repo?.owner || !repo?.name) continue;
    try {
      const res = await fetch(`${GITHUB_API}/repos/${repo.owner}/${repo.name}/hooks`, { method: 'POST', headers, body });
      // 2xx = created; 422 = a hook with this config already exists (idempotent, fine).
      const ok = res.ok || res.status === 422;
      hooks.push({ repo: repo.name, ok, status: res.status });
    } catch (err) {
      hooks.push({ repo: repo.name, ok: false, error: err.message });
    }
  }

  const ready = hooks.filter(h => h.ok).length;
  logger.rag?.(`[WebhookAutoReg] github: ${ready}/${hooks.length} repo hook(s) ready → ${endpointUrl}`);
  return { registered: true, connectorId: 'github', endpointUrl, hooks };
}

export default { autoRegisterWebhooks };
