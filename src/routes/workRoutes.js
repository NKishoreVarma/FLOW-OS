/**
 * FLOW OS — Work Management Capability Routes
 *
 * Provider-agnostic REST API for the Work Management Capability.
 * Jira is the first provider. Future providers (Linear, Asana)
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
  return req.query.provider || 'jira';
}

// ── executeAction wrapper ─────────────────────────────────────────────────────
async function runAction(req, res, next, { actionType, payload }) {
  if (String(actionType).toLowerCase() === 'read') {
    try {
      const { ingestedWork } = await import('../services/certification/ingestedReads.js');
      const ing = await ingestedWork(req.workspaceId, { resource: payload?.resourceType || 'issues', limit: payload?.limit || 60 });
      if (ing) return res.json({ success: true, result: ing, sourceMode: 'certification' });
    } catch { /* fall through to the preview provider */ }
  }
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

// GET /api/work/status
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

// POST /api/work/auth — store API Key / Token for this workspace
router.post('/auth', async (req, res, next) => {
  try {
    const { token, email } = req.body;
    if (!token) return res.status(400).json({ error: 'token is required' });
    if (!email) return res.status(400).json({ error: 'email is required' });

    const adapter = getConnector(resolveProvider(req));
    const result  = await adapter.authenticate(req.workspaceId, { token, email });
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Projects
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/work/projects — list projects
router.get('/projects', (req, res, next) => runAction(req, res, next, {
  actionType: ActionType.READ,
  payload: { resourceType: 'projects' },
}));

// GET /api/work/projects/:key — single project
router.get('/projects/:key', (req, res, next) => runAction(req, res, next, {
  actionType: ActionType.READ,
  payload: { resourceType: 'project', key: req.params.key },
}));

// ─────────────────────────────────────────────────────────────────────────────
// Issues
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/work/issues — list issues (optional filter ?projectKey=)
router.get('/issues', (req, res, next) => runAction(req, res, next, {
  actionType: ActionType.READ,
  payload: {
    resourceType: 'issues',
    projectKey: req.query.projectKey || null,
  },
}));

// GET /api/work/issues/:key — get single issue
router.get('/issues/:key', (req, res, next) => runAction(req, res, next, {
  actionType: ActionType.READ,
  payload: { resourceType: 'issue', key: req.params.key },
}));

// POST /api/work/issues — create issue
router.post('/issues', (req, res, next) => runAction(req, res, next, {
  actionType: ActionType.CREATE,
  payload: {
    projectKey:  req.body.projectKey,
    title:       req.body.title,
    description: req.body.description || '',
    status:      req.body.status || 'To Do',
    priority:    req.body.priority || 'P2',
    assignee:    req.body.assignee || null,
    parent:      req.body.parent || null,
  },
}));

// PATCH /api/work/issues/:key — update issue
router.patch('/issues/:key', (req, res, next) => runAction(req, res, next, {
  actionType: ActionType.UPDATE,
  payload: {
    key:         req.params.key,
    ...req.body
  },
}));

// DELETE /api/work/issues/:key — delete issue
router.delete('/issues/:key', (req, res, next) => runAction(req, res, next, {
  actionType: ActionType.DELETE,
  payload: { key: req.params.key },
}));

// ─────────────────────────────────────────────────────────────────────────────
// Workflow transitions & Actions
// ─────────────────────────────────────────────────────────────────────────────

// POST /api/work/issues/:key/transition — change issue workflow status
router.post('/issues/:key/transition', (req, res, next) => runAction(req, res, next, {
  actionType: ActionType.EXECUTE,
  payload: {
    resourceType: 'workflow',
    key: req.params.key,
    status: req.body.status,
  },
}));

// POST /api/work/link — link two issues together
router.post('/link', (req, res, next) => runAction(req, res, next, {
  actionType: ActionType.EXECUTE,
  payload: {
    resourceType: 'link',
    sourceKey: req.body.sourceKey,
    targetKey: req.body.targetKey,
  },
}));

// ─────────────────────────────────────────────────────────────────────────────
// Sprints
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/work/sprints — list sprints
router.get('/sprints', (req, res, next) => runAction(req, res, next, {
  actionType: ActionType.READ,
  payload: { resourceType: 'sprints' },
}));

// ─────────────────────────────────────────────────────────────────────────────
// Search & Sync
// ─────────────────────────────────────────────────────────────────────────────

// POST /api/work/search — search issues
router.post('/search', (req, res, next) => runAction(req, res, next, {
  actionType: ActionType.SEARCH,
  payload: { query: req.body.query, limit: Number(req.body.limit) || 10 },
}));

// POST /api/work/sync — sync issues to knowledge graph and cache
router.post('/sync', (req, res, next) => runAction(req, res, next, {
  actionType: ActionType.SYNC,
  payload: {},
}));

export default router;
