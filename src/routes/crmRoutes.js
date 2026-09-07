/**
 * FLOW OS — Customer Intelligence Capability Routes
 *
 * Provider-agnostic REST API for the Customer Intelligence (CRM) Capability.
 * HubSpot is the first provider. Future providers (Salesforce, Zoho)
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
  return req.query.provider || 'hubspot';
}

// ── executeAction wrapper ─────────────────────────────────────────────────────
async function runAction(req, res, next, { actionType, payload }) {
  // Certification workspace: serve the REAL ingested Helios customers, not the
  // preview provider's generic sample rows. `ingestedCustomers` returns null for any
  // non-certification workspace, so dev/prod keep the labeled preview behavior below.
  // READ only — writes still go through the governed pipeline (preview → refused).
  if (String(actionType).toLowerCase() === 'read') {
    try {
      const { ingestedCustomers } = await import('../services/certification/ingestedReads.js');
      const ing = await ingestedCustomers(req.workspaceId, { limit: payload?.limit || 50 });
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

// GET /api/crm/status
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

// POST /api/crm/auth — store API Key / Access Token
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
// Accounts
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/crm/accounts — list accounts
router.get('/accounts', (req, res, next) => runAction(req, res, next, {
  actionType: ActionType.READ,
  payload: { resourceType: 'accounts' },
}));

// GET /api/crm/accounts/:id — get account detail with contacts, deals, activities
router.get('/accounts/:id', (req, res, next) => runAction(req, res, next, {
  actionType: ActionType.READ,
  payload: { resourceType: 'account', id: req.params.id },
}));

// POST /api/crm/accounts — create account
router.post('/accounts', (req, res, next) => runAction(req, res, next, {
  actionType: ActionType.CREATE,
  payload: {
    name:          req.body.name,
    domain:        req.body.domain || '',
    industry:      req.body.industry || '',
    annualRevenue: req.body.annualRevenue || null,
    stage:         req.body.stage || 'Prospect',
    owner:         req.body.owner || null,
  },
}));

// PATCH /api/crm/accounts/:id — update account
router.patch('/accounts/:id', (req, res, next) => runAction(req, res, next, {
  actionType: ActionType.UPDATE,
  payload: {
    id: req.params.id,
    ...req.body
  },
}));

// DELETE /api/crm/accounts/:id — delete account
router.delete('/accounts/:id', (req, res, next) => runAction(req, res, next, {
  actionType: ActionType.DELETE,
  payload: { id: req.params.id },
}));

// ─────────────────────────────────────────────────────────────────────────────
// Contacts
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/crm/contacts — list contacts
router.get('/contacts', (req, res, next) => runAction(req, res, next, {
  actionType: ActionType.READ,
  payload: { resourceType: 'contacts' },
}));

// ─────────────────────────────────────────────────────────────────────────────
// Opportunities (Deals)
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/crm/opportunities — list opportunities
router.get('/opportunities', (req, res, next) => runAction(req, res, next, {
  actionType: ActionType.READ,
  payload: { resourceType: 'opportunities' },
}));

// ─────────────────────────────────────────────────────────────────────────────
// Activities (Calls/Meetings/Emails/Notes)
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/crm/activities — list activities
router.get('/activities', (req, res, next) => runAction(req, res, next, {
  actionType: ActionType.READ,
  payload: { resourceType: 'activities' },
}));

// ─────────────────────────────────────────────────────────────────────────────
// Search & Sync
// ─────────────────────────────────────────────────────────────────────────────

// POST /api/crm/search — search accounts
router.post('/search', (req, res, next) => runAction(req, res, next, {
  actionType: ActionType.SEARCH,
  payload: { query: req.body.query, limit: Number(req.body.limit) || 10 },
}));

// POST /api/crm/sync — sync crm nodes to knowledge graph
router.post('/sync', (req, res, next) => runAction(req, res, next, {
  actionType: ActionType.SYNC,
  payload: {},
}));

export default router;
