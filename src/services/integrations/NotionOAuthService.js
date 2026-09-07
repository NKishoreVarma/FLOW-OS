/**
 * NotionOAuthService — Notion OAuth 2.0 (Public Integration).
 *
 * Notion supports OAuth for public integrations (requires submitting to Notion
 * for approval) and API key for internal integrations. FLOW supports both:
 *
 *   1. OAuth 2.0 (NOTION_CLIENT_ID + NOTION_CLIENT_SECRET set) — full workspace access
 *   2. API Key (internal integration token starting with "secret_") — simpler setup
 *
 * OAuth scopes are fixed by Notion at the integration capability level; the
 * authorization URL does not accept explicit scope params.
 *
 * Required env vars (OAuth mode):
 *   NOTION_CLIENT_ID
 *   NOTION_CLIENT_SECRET
 *   NOTION_REDIRECT_URI   (default: http://localhost:5001/api/integrations-hub/notion/callback)
 *
 * Required env var (API key mode):
 *   NOTION_API_KEY   (internal integration token)
 */

import { signState, verifyState } from './oauthHelpers.js';
import { saveCredentials, loadCredentials, getCredentialMeta, revokeCredentials, updateHealthStatus } from './ConnectorCredentialStore.js';
import { AppError } from '../../core/errors/index.js';

const CONNECTOR_ID  = 'notion';
const PREFIX        = 'notion';
const NOTION_API    = 'https://api.notion.com/v1';
const NOTION_VER    = '2022-06-28';

// signState / verifyState delegated to shared oauthHelpers (HMAC-SHA256, 10-min TTL)
// Notion does not support PKCE — CSRF protection is sufficient for confidential clients

// ── Config ────────────────────────────────────────────────────────────────────

function _cfg() {
  const clientId     = process.env.NOTION_CLIENT_ID;
  const clientSecret = process.env.NOTION_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  return {
    clientId,
    clientSecret,
    redirectUri: process.env.NOTION_REDIRECT_URI || 'http://localhost:5001/api/integrations-hub/notion/callback',
  };
}

// ── Notion API helper ─────────────────────────────────────────────────────────

async function notionFetch(endpoint, token, { method = 'GET', body = null } = {}) {
  const res = await fetch(`${NOTION_API}${endpoint}`, {
    method,
    headers: {
      Authorization:    `Bearer ${token}`,
      'Notion-Version': NOTION_VER,
      'Content-Type':   'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new AppError(data.message || `Notion API ${res.status}`, res.status >= 500 ? 502 : res.status, 'NOTION_API_ERROR');
  }
  return res.json();
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Generate Notion OAuth consent URL (OAuth App mode only).
 */
export function getAuthUrl(workspaceId) {
  const cfg = _cfg();
  if (!cfg) {
    throw new AppError(
      'Notion OAuth is not configured. Set NOTION_CLIENT_ID and NOTION_CLIENT_SECRET, or use an Integration Token via POST /api/integrations-hub/notion/token.',
      503,
      'NOTION_NOT_CONFIGURED',
    );
  }
  const state = signState(PREFIX, workspaceId);
  const url   = new URL('https://api.notion.com/v1/oauth/authorize');
  url.searchParams.set('client_id',     cfg.clientId);
  url.searchParams.set('redirect_uri',  cfg.redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('owner',         'user');
  url.searchParams.set('state',         state);
  return { authUrl: url.toString(), state };
}

/**
 * Handle OAuth callback — exchange code for access token.
 */
export async function handleCallback(code, stateStr) {
  const { workspaceId } = verifyState(PREFIX, stateStr);
  const cfg = _cfg();
  if (!cfg) throw new AppError('Notion OAuth not configured', 503, 'NOTION_NOT_CONFIGURED');

  const credentials = Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString('base64');
  const res = await fetch('https://api.notion.com/v1/oauth/token', {
    method:  'POST',
    headers: {
      Authorization:  `Basic ${credentials}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ code, grant_type: 'authorization_code', redirect_uri: cfg.redirectUri }),
  });

  const data = await res.json();
  if (data.error) {
    throw new AppError(`Notion OAuth error: ${data.error}`, 400, 'OAUTH_EXCHANGE_FAILED');
  }

  await saveCredentials(workspaceId, CONNECTOR_ID, {
    accessToken:   data.access_token,
    tokenType:     data.token_type,
    workspaceId:   data.workspace_id,
    workspaceName: data.workspace_name,
    workspaceIcon: data.workspace_icon,
    botId:         data.bot_id,
    owner:         data.owner,
  }, {
    authStrategy:  'oauth2',
    accountLabel:  data.workspace_name,
  });

  await updateHealthStatus(workspaceId, CONNECTOR_ID, 'healthy');
  return { workspaceId, notionWorkspaceName: data.workspace_name };
}

/**
 * Store an internal integration token (the simpler "API key" path).
 */
export async function storeIntegrationToken(workspaceId, token) {
  const data    = await notionFetch('/users/me', token);
  const botName = data.name || 'Notion Bot';

  await saveCredentials(workspaceId, CONNECTOR_ID, { accessToken: token }, {
    authStrategy:  'api_key',
    accountLabel:  botName,
  });
  await updateHealthStatus(workspaceId, CONNECTOR_ID, 'healthy');
  return { botName, botId: data.id };
}

/**
 * Return the access token for a workspace.
 * Falls back to NOTION_API_KEY env var.
 */
export async function getAccessToken(workspaceId) {
  const cred = await loadCredentials(workspaceId, CONNECTOR_ID);
  if (cred?.accessToken) return cred.accessToken;
  return process.env.NOTION_API_KEY || null;
}

/**
 * Connection status with health metadata.
 */
export async function getStatus(workspaceId) {
  const meta = await getCredentialMeta(workspaceId, CONNECTOR_ID);
  if (!meta) {
    if (process.env.NOTION_API_KEY) {
      return { connected: true, authStrategy: 'env', accountLabel: 'NOTION_API_KEY (env)', healthStatus: 'unknown' };
    }
    return { connected: false };
  }
  return { connected: meta.connected, ...meta };
}

/**
 * Revoke credentials (soft delete).
 * Notion does not provide a token revocation endpoint for integration tokens.
 */
export async function disconnect(workspaceId) {
  await revokeCredentials(workspaceId, CONNECTOR_ID);
  return { disconnected: true };
}

/**
 * Clear credentials and return a fresh OAuth consent URL.
 */
export async function reconnect(workspaceId) {
  await revokeCredentials(workspaceId, CONNECTOR_ID);
  return getAuthUrl(workspaceId);
}

/**
 * Probe /users/me and persist the health result.
 */
export async function validateCredentials(workspaceId) {
  const token = await getAccessToken(workspaceId);
  if (!token) return { valid: false, healthStatus: 'not_connected', action: 'connect' };

  try {
    const data = await notionFetch('/users/me', token);
    await updateHealthStatus(workspaceId, CONNECTOR_ID, 'healthy');
    return { valid: true, healthStatus: 'healthy', bot: data.name, botId: data.id };
  } catch (err) {
    const isRevoked = err.statusCode === 401 || err.message?.includes('unauthorized');
    const status    = isRevoked ? 'revoked' : 'degraded';
    await updateHealthStatus(workspaceId, CONNECTOR_ID, status, err.message).catch(() => {});
    return { valid: false, healthStatus: status, reason: err.message, action: isRevoked ? 'reconnect' : 'retry' };
  }
}

/**
 * Health check (non-persisting).
 */
export async function healthCheck(workspaceId) {
  const token = await getAccessToken(workspaceId);
  if (!token) return { healthy: false, reason: 'No credentials' };
  try {
    const data = await notionFetch('/users/me', token);
    return { healthy: true, bot: data.name, botId: data.id };
  } catch (err) {
    return { healthy: false, reason: err.message };
  }
}

// ── Notion API access helpers (used by NotionAdapter) ────────────────────────

export async function searchPages(workspaceId, query, { pageSize = 20 } = {}) {
  const token = await getAccessToken(workspaceId);
  if (!token) throw new AppError('Notion not connected', 401, 'NOTION_NOT_CONNECTED');
  return notionFetch('/search', token, {
    method: 'POST',
    body:   { query, filter: { value: 'page', property: 'object' }, page_size: pageSize },
  });
}

export async function getPage(workspaceId, pageId) {
  const token = await getAccessToken(workspaceId);
  if (!token) throw new AppError('Notion not connected', 401, 'NOTION_NOT_CONNECTED');
  return notionFetch(`/pages/${pageId}`, token);
}

export async function getBlockChildren(workspaceId, blockId) {
  const token = await getAccessToken(workspaceId);
  if (!token) throw new AppError('Notion not connected', 401, 'NOTION_NOT_CONNECTED');
  return notionFetch(`/blocks/${blockId}/children`, token);
}

export async function createPage(workspaceId, { parentId, title, content }) {
  const token = await getAccessToken(workspaceId);
  if (!token) throw new AppError('Notion not connected', 401, 'NOTION_NOT_CONNECTED');
  return notionFetch('/pages', token, {
    method: 'POST',
    body: {
      parent:     { type: 'page_id', page_id: parentId },
      properties: { title: { title: [{ type: 'text', text: { content: title } }] } },
      children:   content ? [{ object: 'block', type: 'paragraph', paragraph: { rich_text: [{ type: 'text', text: { content } }] } }] : [],
    },
  });
}
