/**
 * FLOW OS — Onboarding Routes (Phase 17)
 *
 * The first-time-setup control surface. JWT + workspace-id (mounted after global auth, so
 * req.tenantId is the resolved workspace). Thin orchestration over existing systems:
 * discovery (Integration Permissions), permission selections (persisted for the setup
 * flow), and the completion flag that drives the first-run gate. No new engine.
 *
 *   GET  /api/onboarding/state         current progress
 *   POST /api/onboarding/discover      { mode:'demo'|'live', connectors? } → discovery
 *   POST /api/onboarding/permissions   { selections } → persist allow/hide choices
 *   POST /api/onboarding/complete      flip the first-run gate
 *   POST /api/onboarding/reset         clear (dev / re-run setup)
 */

import express from 'express';
import { getState, setState, markComplete, reset } from '../onboarding/onboardingState.js';
import { discover } from '../onboarding/discoveryOrchestrator.js';
import { getAdoptionMetrics } from '../onboarding/adoptionMetrics.js';

const router = express.Router();

router.use((req, res, next) => {
  if (!req.tenantId) return res.status(400).json({ error: { code: 'MISSING_WORKSPACE', message: 'workspace-id header is required' } });
  next();
});

router.get('/state', async (req, res, next) => {
  try { res.json(await getState(req.tenantId)); } catch (err) { next(err); }
});

// Track 10 — measure outcomes: time-to-value + work completed inside FLOW.
router.get('/metrics', async (req, res, next) => {
  try { res.json(await getAdoptionMetrics(req.tenantId)); } catch (err) { next(err); }
});

router.post('/discover', async (req, res, next) => {
  try {
    const mode = req.body?.mode === 'live' ? 'live' : 'demo';
    const result = await discover(req.tenantId, { mode, connectors: req.body?.connectors });
    await setState(req.tenantId, { step: 'permissions', mode, discovery: result });
    res.json(result);
  } catch (err) { next(err); }
});

router.post('/permissions', async (req, res, next) => {
  try {
    // Persist the admin's allow/hide choices for the setup flow. The real deny-by-default
    // gate (Phase 13.1) enforces these once data flows; here we record the intent + advance.
    const selections = req.body?.selections ?? {};
    const state = await setState(req.tenantId, { step: 'build', permissionsConfigured: true, connectors: selections });
    res.json(state);
  } catch (err) { next(err); }
});

router.post('/complete', async (req, res, next) => {
  try {
    if (req.body?.buildImportId) await setState(req.tenantId, { buildImportId: req.body.buildImportId });
    res.json(await markComplete(req.tenantId));
  } catch (err) { next(err); }
});

router.post('/reset', async (req, res, next) => {
  try { res.json(await reset(req.tenantId)); } catch (err) { next(err); }
});

export default router;
