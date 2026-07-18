/**
 * FLOW OS — Connector Authentication Manager
 *
 * Central credential store for all connector strategies:
 *   OAuth2, API Key, Service Account, Webhook Secret.
 *
 * Storage is in-memory (same pattern as existing tokenStore in gmailInboundService).
 * Replace with encrypted PostgreSQL table to fix TD-01 in a future sprint.
 *
 * Key format: `{workspaceId}:{connectorId}`
 */

import { AppError } from '../core/errors/index.js';
import { AuthStrategy } from './capabilities.js';

// Credential store: `workspaceId:connectorId` → credential object
const credentialStore = new Map();

// Per-workspace connector status cache
const statusCache = new Map();

function storeKey(workspaceId, connectorId) {
  return `${workspaceId}:${connectorId}`;
}

/**
 * Store OAuth2 tokens after a successful callback.
 */
export function storeOAuthTokens(workspaceId, connectorId, tokens) {
  const key = storeKey(workspaceId, connectorId);
  credentialStore.set(key, {
    strategy: AuthStrategy.OAUTH2,
    tokens,
    storedAt: new Date().toISOString(),
  });
  statusCache.delete(key);
}

/**
 * Store an API key credential.
 */
export function storeApiKey(workspaceId, connectorId, apiKey, meta = {}) {
  if (!apiKey || typeof apiKey !== 'string' || apiKey.trim().length < 8) {
    throw new AppError('API key must be at least 8 characters', 400, 'INVALID_API_KEY');
  }
  const key = storeKey(workspaceId, connectorId);
  credentialStore.set(key, {
    strategy: AuthStrategy.API_KEY,
    apiKey: apiKey.trim(),
    meta,
    storedAt: new Date().toISOString(),
  });
  statusCache.delete(key);
}

/**
 * Store a service account credential (JSON key file content).
 */
export function storeServiceAccount(workspaceId, connectorId, keyJson) {
  const key = storeKey(workspaceId, connectorId);
  credentialStore.set(key, {
    strategy: AuthStrategy.SERVICE_ACCOUNT,
    keyJson,
    storedAt: new Date().toISOString(),
  });
  statusCache.delete(key);
}

/**
 * Store a webhook secret for inbound webhook validation.
 */
export function storeWebhookSecret(workspaceId, connectorId, secret) {
  const key = storeKey(workspaceId, connectorId);
  credentialStore.set(key, {
    strategy: AuthStrategy.WEBHOOK_SECRET,
    secret,
    storedAt: new Date().toISOString(),
  });
  statusCache.delete(key);
}

/**
 * Retrieve credentials. Returns null if not found.
 */
export function getCredentials(workspaceId, connectorId) {
  return credentialStore.get(storeKey(workspaceId, connectorId)) ?? null;
}

/**
 * Check whether a workspace has credentials for a connector.
 */
export function hasCredentials(workspaceId, connectorId) {
  return credentialStore.has(storeKey(workspaceId, connectorId));
}

/**
 * Revoke all credentials for a workspace + connector.
 */
export function revokeCredentials(workspaceId, connectorId) {
  const key = storeKey(workspaceId, connectorId);
  credentialStore.delete(key);
  statusCache.delete(key);
}

/**
 * Validate that stored OAuth tokens include the required scopes.
 * Scope comparison is best-effort (string includes check).
 */
export function validateScopes(workspaceId, connectorId, requiredScopes = []) {
  const cred = getCredentials(workspaceId, connectorId);
  if (!cred) return { valid: false, missing: requiredScopes };

  if (cred.strategy !== AuthStrategy.OAUTH2 || !requiredScopes.length) {
    return { valid: true, missing: [] };
  }

  const grantedScopes = cred.tokens?.scope
    ? cred.tokens.scope.split(/\s+/)
    : [];

  const missing = requiredScopes.filter(
    s => !grantedScopes.some(g => g.includes(s))
  );

  return { valid: missing.length === 0, missing };
}

/**
 * Update OAuth tokens in-place (used after token refresh).
 */
export function refreshOAuthTokens(workspaceId, connectorId, newTokens) {
  const key = storeKey(workspaceId, connectorId);
  const existing = credentialStore.get(key);
  if (!existing || existing.strategy !== AuthStrategy.OAUTH2) return;
  credentialStore.set(key, {
    ...existing,
    tokens: { ...existing.tokens, ...newTokens },
    refreshedAt: new Date().toISOString(),
  });
}

/**
 * List all connectors that have credentials for a workspace.
 */
export function listConnectedConnectors(workspaceId) {
  const connected = [];
  for (const [key] of credentialStore) {
    const [wid, cid] = key.split(':');
    if (wid === workspaceId) connected.push(cid);
  }
  return connected;
}

/**
 * Return a redacted credential summary (safe to expose in API responses).
 */
export function describeCredentials(workspaceId, connectorId) {
  const cred = getCredentials(workspaceId, connectorId);
  if (!cred) return null;
  return {
    strategy:   cred.strategy,
    storedAt:   cred.storedAt,
    refreshedAt: cred.refreshedAt || null,
    connected:  true,
  };
}
