/**
 * FLOW OS — Workforce Intelligence Capability Routes
 *
 * Provider-agnostic REST API for the Workforce Intelligence (HR) Capability.
 * Workday is the first provider. Future providers (BambooHR, Rippling)
 * use the same routes via ?provider= query param.
 */

import express from 'express';
import { executeAction } from '../connectors/executionEngine.js';
import { getCredentials } from '../connectors/authManager.js';
import { getConnector } from '../connectors/registry.js';
import { ActionType } from '../connectors/capabilities.js';

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
  return req.query.provider || 'workday';
}

// ── executeAction wrapper ─────────────────────────────────────────────────────
async function runAction(req, res, next, { actionType, payload }) {
  if (String(actionType).toLowerCase() === 'read') {
    try {
      const { ingestedEmployees } = await import('../services/certification/ingestedReads.js');
      const ing = await ingestedEmployees(req.workspaceId, { limit: payload?.limit || 60 });
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

// GET /api/hr/status
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

// POST /api/hr/auth — store API Key / Access Token
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
// Employees (Directory & Profiles)
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/hr/employees — list employees (optional department filter)
router.get('/employees', (req, res, next) => runAction(req, res, next, {
  actionType: ActionType.READ,
  payload: { resourceType: 'employees' },
}));

// GET /api/hr/employees/:id — get employee detailed profile with direct reports
router.get('/employees/:id', (req, res, next) => runAction(req, res, next, {
  actionType: ActionType.READ,
  payload: { resourceType: 'employee', id: req.params.id },
}));

// POST /api/hr/employees — create employee
router.post('/employees', (req, res, next) => runAction(req, res, next, {
  actionType: ActionType.CREATE,
  payload: {
    name:       req.body.name,
    email:      req.body.email,
    role:       req.body.role || '',
    department: req.body.department || '',
    managerId:  req.body.managerId || null
  },
}));

// PATCH /api/hr/employees/:id — update employee details
router.patch('/employees/:id', (req, res, next) => runAction(req, res, next, {
  actionType: ActionType.UPDATE,
  payload: {
    id: req.params.id,
    ...req.body
  },
}));

// ─────────────────────────────────────────────────────────────────────────────
// Teams & Skills & Availability
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/hr/teams — list all structural teams
router.get('/teams', (req, res, next) => runAction(req, res, next, {
  actionType: ActionType.READ,
  payload: { resourceType: 'teams' },
}));

// GET /api/hr/skills — list all tech & domain skills
router.get('/skills', (req, res, next) => runAction(req, res, next, {
  actionType: ActionType.READ,
  payload: { resourceType: 'skills' },
}));

// GET /api/hr/availability — list time-offs and PTO schedules
router.get('/availability', (req, res, next) => runAction(req, res, next, {
  actionType: ActionType.READ,
  payload: { resourceType: 'availability' },
}));

// ─────────────────────────────────────────────────────────────────────────────
// Search & Sync
// ─────────────────────────────────────────────────────────────────────────────

// POST /api/hr/search — search employees
router.post('/search', (req, res, next) => runAction(req, res, next, {
  actionType: ActionType.SEARCH,
  payload: { query: req.body.query, limit: Number(req.body.limit) || 10 },
}));

// POST /api/hr/sync — sync workforce nodes to knowledge graph
router.post('/sync', (req, res, next) => runAction(req, res, next, {
  actionType: ActionType.SYNC,
  payload: {},
}));

export default router;
