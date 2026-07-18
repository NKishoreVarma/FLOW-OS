/**
 * FLOW OS — Universal Connector Framework Routes
 *
 * REST API surface for connector management, search, and execution.
 * All routes require JWT auth + workspace-id header (enforced by global middleware).
 *
 * Route map:
 *   GET  /api/connectors                         — list all registered connectors + auth status
 *   GET  /api/connectors/capabilities            — capability → [connectorIds] map
 *   GET  /api/connectors/health                  — health check all connectors for workspace
 *   GET  /api/connectors/timeline                — workspace action timeline
 *   GET  /api/connectors/audit                   — workspace audit log
 *   GET  /api/connectors/:id                     — single connector detail
 *   GET  /api/connectors/:id/health              — single connector health
 *   POST /api/connectors/:id/auth/initiate       — start auth flow (OAuth URL or API key)
 *   POST /api/connectors/:id/auth/callback       — OAuth callback exchange
 *   POST /api/connectors/:id/auth/revoke         — revoke credentials
 *   POST /api/connectors/execute                 — execute a connector action
 *   POST /api/connectors/search                  — universal cross-connector search
 */

import express from 'express';
import {
  listConnectors, getConnector, getCapabilityMap,
  checkAllHealth, isRegistered,
} from '../connectors/registry.js';
import {
  storeApiKey, revokeCredentials, storeOAuthTokens,
  describeCredentials,
} from '../connectors/authManager.js';
import { executeAction, getAuditLog, getTimeline } from '../connectors/executionEngine.js';
import { universalSearch } from '../connectors/searchOrchestrator.js';
import { ValidationError, NotFoundError } from '../core/errors/index.js';

const router = express.Router();

// ── Workspace-id guard (applied to every route in this file) ─────────────────
router.use((req, res, next) => {
  const workspaceId = req.headers['workspace-id'];
  if (!workspaceId) {
    return res.status(400).json({
      error: { code: 'MISSING_WORKSPACE', message: 'workspace-id header is required' }
    });
  }
  req.workspaceId = workspaceId;
  next();
});

// ── GET /api/connectors ───────────────────────────────────────────────────────
router.get('/', (req, res) => {
  const connectors = listConnectors(req.workspaceId);
  res.json({ connectors, total: connectors.length });
});

// ── GET /api/connectors/capabilities ─────────────────────────────────────────
router.get('/capabilities', (_req, res) => {
  res.json(getCapabilityMap());
});

// ── GET /api/connectors/health ────────────────────────────────────────────────
router.get('/health', async (req, res, next) => {
  try {
    const health = await checkAllHealth(req.workspaceId);
    res.json(health);
  } catch (err) {
    next(err);
  }
});

// ── GET /api/connectors/timeline ─────────────────────────────────────────────
router.get('/timeline', (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const events = getTimeline(req.workspaceId, { limit });
  res.json({ events, total: events.length });
});

// ── GET /api/connectors/audit ─────────────────────────────────────────────────
router.get('/audit', async (req, res, next) => {
  try {
    const limit       = Math.min(Number(req.query.limit) || 50, 500);
    const connectorId = req.query.connectorId || undefined;
    const actionType  = req.query.actionType  || undefined;
    const events = await getAuditLog(req.workspaceId, {
      limit,
      connectorId,
      actionType,
      orgId: req.user?.orgId,
    });
    res.json({ events, total: events.length });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/connectors/search ───────────────────────────────────────────────
router.post('/search', async (req, res, next) => {
  try {
    const { query, capabilities, limit, total } = req.body;
    if (!query || typeof query !== 'string' || !query.trim()) {
      throw new ValidationError('query must be a non-empty string');
    }

    const result = await universalSearch(req.workspaceId, query.trim(), {
      capabilities: Array.isArray(capabilities) ? capabilities : [],
      limit:  Math.min(Number(limit)  || 20, 50),
      total:  Math.min(Number(total)  || 60, 100),
    });

    res.json(result);
  } catch (err) {
    next(err);
  }
});

// ── POST /api/connectors/execute ──────────────────────────────────────────────
router.post('/execute', async (req, res, next) => {
  try {
    const { connectorId, actionType, payload, approvedBy } = req.body;

    if (!connectorId) throw new ValidationError('connectorId is required');
    if (!actionType)  throw new ValidationError('actionType is required');

    const { result, timelineEvent } = await executeAction({
      workspaceId: req.workspaceId,
      connectorId,
      actionType,
      payload:     payload || {},
      approvedBy,
      actor:       req.user,
      orgPlan:     req.govContext?.orgPlan ?? 'free',
    });

    res.json({ success: true, result, timelineEvent });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/connectors/:id ───────────────────────────────────────────────────
router.get('/:id', (req, res, next) => {
  try {
    const adapter = getConnector(req.params.id); // throws NotFoundError
    const auth    = describeCredentials(req.workspaceId, adapter.id);
    res.json({ ...adapter.describe(), auth, connected: !!auth });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/connectors/:id/health ────────────────────────────────────────────
router.get('/:id/health', async (req, res, next) => {
  try {
    if (!isRegistered(req.params.id)) throw new NotFoundError(`Connector "${req.params.id}"`);
    const adapter = getConnector(req.params.id);
    const health  = await adapter.healthCheck(req.workspaceId);
    res.json(health);
  } catch (err) {
    next(err);
  }
});

// ── POST /api/connectors/:id/auth/initiate ────────────────────────────────────
router.post('/:id/auth/initiate', async (req, res, next) => {
  try {
    if (!isRegistered(req.params.id)) throw new NotFoundError(`Connector "${req.params.id}"`);
    const adapter = getConnector(req.params.id);

    // API key strategy: store directly
    if (adapter.authStrategy === 'api_key') {
      const { apiKey, meta } = req.body;
      if (!apiKey) throw new ValidationError('apiKey is required for this connector');
      storeApiKey(req.workspaceId, adapter.id, apiKey, meta);
      return res.json({ strategy: 'api_key', connected: true });
    }

    // OAuth2: delegate to the adapter for the consent URL
    const result = await adapter.authenticate(req.workspaceId, {
      ...req.body,
      callbackUrl: req.body.callbackUrl,
    });

    res.json(result);
  } catch (err) {
    next(err);
  }
});

// ── POST /api/connectors/:id/auth/callback ────────────────────────────────────
router.post('/:id/auth/callback', async (req, res, next) => {
  try {
    if (!isRegistered(req.params.id)) throw new NotFoundError(`Connector "${req.params.id}"`);
    const adapter = getConnector(req.params.id);

    const { code, state } = req.body;
    if (!code) throw new ValidationError('OAuth code is required');

    const tokens = await adapter.handleAuthCallback(req.workspaceId, code, { state });
    storeOAuthTokens(req.workspaceId, adapter.id, tokens);

    res.json({ connected: true, connectorId: adapter.id });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/connectors/:id/auth/revoke ─────────────────────────────────────
router.post('/:id/auth/revoke', (req, res, next) => {
  try {
    if (!isRegistered(req.params.id)) throw new NotFoundError(`Connector "${req.params.id}"`);
    revokeCredentials(req.workspaceId, req.params.id);
    res.json({ revoked: true, connectorId: req.params.id });
  } catch (err) {
    next(err);
  }
});

export default router;
