/**
 * FLOW OS — Knowledge Capability Routes
 *
 * Provider-agnostic REST API for the Knowledge Capability.
 * Notion is the first provider. Future providers (Confluence, Drive)
 * use the same routes via ?provider= query param.
 */

import express from 'express';
import { executeAction } from '../connectors/executionEngine.js';
import { getCredentials } from '../connectors/authManager.js';
import { getConnector } from '../connectors/registry.js';
import { ActionType } from '../connectors/capabilities.js';
import { ValidationError } from '../core/errors/index.js';

const router = express.Router();

// ── Workspace-id guard ────────────────────────────────────────────────────────
router.use((req, res, next) => {
  const workspaceId = req.headers['workspace-id'] || req.tenantId;
  if (!workspaceId) {
    return res.status(400).json({
      error: { code: 'MISSING_WORKSPACE', message: 'workspace-id header is required' },
    });
  }
  req.workspaceId = workspaceId;
  next();
});

// ── Provider resolution ───────────────────────────────────────────────────────
function resolveProvider(req) {
  return req.query.provider || 'notion';
}

// ── executeAction wrapper ─────────────────────────────────────────────────────
async function runAction(req, res, next, { actionType, payload }) {
  try {
    const { result, timelineEvent } = await executeAction({
      workspaceId: req.workspaceId,
      connectorId: resolveProvider(req),
      actionType,
      payload,
      actor:       req.user,
      orgPlan:     req.govContext?.orgPlan ?? 'free',
    });
    res.json({ success: true, result, timelineEvent });
  } catch (err) {
    next(err);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Status & Auth
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/knowledge/status
router.get('/status', async (req, res) => {
  const providerId = resolveProvider(req);
  const adapter    = getConnector(providerId);
  const creds      = getCredentials(req.workspaceId, providerId);
  const health     = await adapter.healthCheck(req.workspaceId).catch(err => ({
    status: 'DOWN', detail: err.message,
  }));

  res.json({
    connector:      providerId,
    authenticated:  !!creds,
    health,
    credentialType: creds?.strategy || null,
    connectedAt:    creds?.storedAt || null,
  });
});

// POST /api/knowledge/auth — store API Key for Notion/Confluence/GoogleDrive
router.post('/auth', async (req, res, next) => {
  try {
    const { apiKey } = req.body;
    if (!apiKey) return res.status(400).json({ error: 'apiKey is required' });

    const adapter = getConnector(resolveProvider(req));
    const result  = await adapter.authenticate(req.workspaceId, { apiKey });
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Documents
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/knowledge/documents — list documents
router.get('/documents', (req, res, next) => runAction(req, res, next, {
  actionType: ActionType.READ,
  payload: { resourceType: 'documents' },
}));

// GET /api/knowledge/documents/:id — single document details with AI insights
router.get('/documents/:id', (req, res, next) => runAction(req, res, next, {
  actionType: ActionType.READ,
  payload: { resourceType: 'document', id: req.params.id },
}));

// POST /api/knowledge/documents — create document
router.post('/documents', (req, res, next) => runAction(req, res, next, {
  actionType: ActionType.CREATE,
  payload: {
    title:   req.body.title,
    content: req.body.content || '',
    space:   req.body.space || 'General',
    author:  req.body.author || 'FLOW User',
    tags:    req.body.tags || [],
  },
}));

// PATCH /api/knowledge/documents/:id — update document
router.patch('/documents/:id', (req, res, next) => runAction(req, res, next, {
  actionType: ActionType.UPDATE,
  payload: {
    id: req.params.id,
    ...req.body
  },
}));

// DELETE /api/knowledge/documents/:id — archive document
router.delete('/documents/:id', (req, res, next) => runAction(req, res, next, {
  actionType: ActionType.DELETE,
  payload: { id: req.params.id },
}));

// ─────────────────────────────────────────────────────────────────────────────
// Search & Sync
// ─────────────────────────────────────────────────────────────────────────────

// POST /api/knowledge/search — search documents
router.post('/search', (req, res, next) => runAction(req, res, next, {
  actionType: ActionType.SEARCH,
  payload: { query: req.body.query, limit: Number(req.body.limit) || 10 },
}));

// POST /api/knowledge/sync — sync documents to knowledge graph and cache
router.post('/sync', (req, res, next) => runAction(req, res, next, {
  actionType: ActionType.SYNC,
  payload: {},
}));

export default router;
