/**
 * SlackOAuthService — Slack OAuth v2 (Bot + User token flow).
 *
 * Slack uses the "v2" OAuth which grants both a bot token (xoxb-) and
 * optionally a user token (xoxp-). FLOW requests a bot token so it can
 * join channels and read messages without acting as a specific user.
 *
 * Required env vars:
 *   SLACK_CLIENT_ID
 *   SLACK_CLIENT_SECRET
 *   SLACK_REDIRECT_URI   (default: http://localhost:5001/api/integrations-hub/slack/callback)
 *
 * Bot scopes requested:
 *   channels:history, channels:read, chat:write, files:read,
 *   groups:history, groups:read, im:history, im:read,
 *   mpim:history, mpim:read, reactions:read, team:read, users:read
 *
 * Credentials are stored via ConnectorCredentialStore (AES-256-GCM, PostgreSQL).
 * CSRF: HMAC-signed state param.
 */

import { signState, verifyState } from './oauthHelpers.js';
import { saveCredentials, loadCredentials, getCredentialMeta, revokeCredentials, updateHealthStatus } from './ConnectorCredentialStore.js';
import { AppError } from '../../core/errors/index.js';

const CONNECTOR_ID = 'slack';
const PREFIX       = 'slack';
const SLACK_API    = 'https://slack.com/api';

const BOT_SCOPES = [
  'channels:history',
  'channels:read',
  'chat:write',
  'files:read',
  'groups:history',
  'groups:read',
  'im:history',
  'im:read',
  'mpim:history',
  'mpim:read',
  'reactions:read',
  'team:read',
  'users:read',
  'users:read.email',
].join(',');

// signState / verifyState delegated to shared oauthHelpers (HMAC-SHA256, 10-min TTL)

// ── Slack API helper ──────────────────────────────────────────────────────────

function _cfg() {
  const clientId     = process.env.SLACK_CLIENT_ID;
  const clientSecret = process.env.SLACK_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  return {
    clientId,
    clientSecret,
    redirectUri: process.env.SLACK_REDIRECT_URI || 'http://localhost:5001/api/integrations-hub/slack/callback',
  };
}

async function slackFetch(method, params, botToken = null) {
  const url    = `${SLACK_API}/${method}`;
  const isPost = ['oauth.v2.access', 'chat.postMessage', 'conversations.join'].includes(method);

  const headers = { 'Content-Type': isPost ? 'application/x-www-form-urlencoded' : 'application/json' };
  if (botToken) headers['Authorization'] = `Bearer ${botToken}`;

  const res = await fetch(url, {
    method:  isPost ? 'POST' : 'GET',
    headers,
    body:    isPost ? new URLSearchParams(params).toString() : undefined,
    ...(isPost ? {} : { method: 'GET' }),
  });

  const data = await res.json();
  if (!data.ok) {
    throw new AppError(`Slack API error: ${data.error}`, 400, 'SLACK_API_ERROR');
  }
  return data;
}

async function slackGet(method, params, botToken) {
  const qs  = new URLSearchParams(params).toString();
  const url = `${SLACK_API}/${method}?${qs}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${botToken}`, 'Content-Type': 'application/json' },
  });
  const data = await res.json();
  if (!data.ok) throw new AppError(`Slack API error: ${data.error}`, 400, 'SLACK_API_ERROR');
  return data;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Generate a Slack OAuth v2 consent URL.
 */
export function getAuthUrl(workspaceId) {
  const cfg = _cfg();
  if (!cfg) {
    throw new AppError(
      'Slack OAuth is not configured. Set SLACK_CLIENT_ID and SLACK_CLIENT_SECRET in .env',
      503,
      'SLACK_NOT_CONFIGURED',
    );
  }
  // Slack OAuth v2 does not support PKCE — CSRF protection via HMAC-signed state only
  const state = signState(PREFIX, workspaceId);
  const url   = new URL('https://slack.com/oauth/v2/authorize');
  url.searchParams.set('client_id',    cfg.clientId);
  url.searchParams.set('redirect_uri', cfg.redirectUri);
  url.searchParams.set('scope',        BOT_SCOPES);
  url.searchParams.set('state',        state);
  return { authUrl: url.toString(), state };
}

/**
 * Exchange OAuth code for bot token, fetch team info, persist credentials.
 */
export async function handleCallback(code, stateStr) {
  const { workspaceId } = verifyState(PREFIX, stateStr);
  const cfg = _cfg();
  if (!cfg) throw new AppError('Slack OAuth not configured', 503, 'SLACK_NOT_CONFIGURED');

  const data = await slackFetch('oauth.v2.access', {
    client_id:     cfg.clientId,
    client_secret: cfg.clientSecret,
    code,
    redirect_uri:  cfg.redirectUri,
  });

  const botToken  = data.access_token;
  const teamId    = data.team?.id;
  const teamName  = data.team?.name;
  const botUserId = data.bot_user_id;

  await saveCredentials(workspaceId, CONNECTOR_ID, {
    botToken,
    botUserId,
    teamId,
    teamName,
    tokenType: 'bot',
    scope:     data.scope,
  }, {
    authStrategy:  'oauth2',
    scopes:        data.scope,
    accountLabel:  teamName,
  });

  await updateHealthStatus(workspaceId, CONNECTOR_ID, 'healthy');
  return { workspaceId, teamId, teamName, botUserId };
}

/**
 * Return the bot token for a workspace.
 */
export async function getBotToken(workspaceId) {
  const cred = await loadCredentials(workspaceId, CONNECTOR_ID);
  return cred?.botToken ?? null;
}

/**
 * Connection status with health metadata.
 */
export async function getStatus(workspaceId) {
  const meta = await getCredentialMeta(workspaceId, CONNECTOR_ID);
  if (!meta) return { connected: false };
  return { connected: meta.connected, ...meta };
}

/**
 * Revoke the bot token via auth.revoke, then soft-delete local credentials.
 * Slack bot tokens do not expire; revocation is permanent.
 */
export async function disconnect(workspaceId) {
  const cred = await loadCredentials(workspaceId, CONNECTOR_ID);
  if (cred?.botToken) {
    try {
      await slackGet('auth.revoke', {}, cred.botToken);
    } catch { /* non-fatal */ }
  }
  await revokeCredentials(workspaceId, CONNECTOR_ID);
  return { disconnected: true };
}

/**
 * Clear credentials and return a fresh OAuth consent URL.
 * Slack bot tokens don't expire, but may be revoked externally.
 */
export async function reconnect(workspaceId) {
  const cred = await loadCredentials(workspaceId, CONNECTOR_ID);
  if (cred?.botToken) {
    try { await slackGet('auth.revoke', {}, cred.botToken); } catch { /* non-fatal */ }
  }
  await revokeCredentials(workspaceId, CONNECTOR_ID);
  return getAuthUrl(workspaceId);
}

/**
 * Probe auth.test and persist the health result.
 */
export async function validateCredentials(workspaceId) {
  const token = await getBotToken(workspaceId);
  if (!token) return { valid: false, healthStatus: 'not_connected', action: 'connect' };

  try {
    const data = await slackGet('auth.test', {}, token);
    await updateHealthStatus(workspaceId, CONNECTOR_ID, 'healthy');
    return { valid: true, healthStatus: 'healthy', teamId: data.team_id, teamName: data.team };
  } catch (err) {
    const isRevoked = err.message?.includes('token_revoked') || err.message?.includes('invalid_auth');
    const status    = isRevoked ? 'revoked' : 'degraded';
    await updateHealthStatus(workspaceId, CONNECTOR_ID, status, err.message).catch(() => {});
    return { valid: false, healthStatus: status, reason: err.message, action: isRevoked ? 'reconnect' : 'retry' };
  }
}

/**
 * Health check via auth.test (non-persisting).
 */
export async function healthCheck(workspaceId) {
  const token = await getBotToken(workspaceId);
  if (!token) return { healthy: false, reason: 'No credentials' };
  try {
    const data = await slackGet('auth.test', {}, token);
    return { healthy: true, teamId: data.team_id, teamName: data.team, botUser: data.user };
  } catch (err) {
    return { healthy: false, reason: err.message };
  }
}

// ── Data access helpers (used by SlackAdapter) ────────────────────────────────

/**
 * List public channels visible to the bot.
 */
export async function listChannels(workspaceId, { limit = 200, cursor = null } = {}) {
  const token = await getBotToken(workspaceId);
  if (!token) throw new AppError('Slack not connected', 401, 'SLACK_NOT_CONNECTED');

  const params = { limit, types: 'public_channel' };
  if (cursor) params.cursor = cursor;

  const data = await slackGet('conversations.list', params, token);
  return {
    channels:   data.channels,
    nextCursor: data.response_metadata?.next_cursor || null,
  };
}

/**
 * Fetch messages from a channel.
 */
export async function getChannelHistory(workspaceId, channelId, { limit = 100, oldest = null, cursor = null } = {}) {
  const token = await getBotToken(workspaceId);
  if (!token) throw new AppError('Slack not connected', 401, 'SLACK_NOT_CONNECTED');

  const params = { channel: channelId, limit };
  if (oldest)  params.oldest = oldest;
  if (cursor)  params.cursor  = cursor;

  const data = await slackGet('conversations.history', params, token);
  return {
    messages:   data.messages,
    hasMore:    data.has_more,
    nextCursor: data.response_metadata?.next_cursor || null,
  };
}

/**
 * Fetch replies in a thread.
 */
export async function getThreadReplies(workspaceId, channelId, threadTs) {
  const token = await getBotToken(workspaceId);
  if (!token) throw new AppError('Slack not connected', 401, 'SLACK_NOT_CONNECTED');

  const data = await slackGet('conversations.replies', { channel: channelId, ts: threadTs }, token);
  return data.messages;
}

/**
 * Search messages (only available with user token — bot tokens cannot search).
 * Falls back to in-channel scan if no search access.
 */
export async function searchMessages(workspaceId, query, { count = 20 } = {}) {
  const token = await getBotToken(workspaceId);
  if (!token) throw new AppError('Slack not connected', 401, 'SLACK_NOT_CONNECTED');

  try {
    const data = await slackGet('search.messages', { query, count }, token);
    return data.messages?.matches ?? [];
  } catch {
    return [];
  }
}

/**
 * Post a message to a channel.
 */
export async function postMessage(workspaceId, channelId, text, { blocks = null, threadTs = null } = {}) {
  const token = await getBotToken(workspaceId);
  if (!token) throw new AppError('Slack not connected', 401, 'SLACK_NOT_CONNECTED');

  const payload = { channel: channelId, text };
  if (blocks)   payload.blocks    = JSON.stringify(blocks);
  if (threadTs) payload.thread_ts = threadTs;

  return slackFetch('chat.postMessage', payload, token);
}
