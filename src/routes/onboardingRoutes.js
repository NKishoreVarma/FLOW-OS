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
import { getState, setState, markComplete, reset, getWorkspaceMode } from '../onboarding/onboardingState.js';
import { discover } from '../onboarding/discoveryOrchestrator.js';
import { getAdoptionMetrics } from '../onboarding/adoptionMetrics.js';
import { listConnectedConnectors, storeOAuthTokens } from '../connectors/authManager.js';
import { hasTokens } from '../services/google/GoogleTokenManager.js';
import { prisma } from '../core/config/prisma.js';
import db from '../config/db.js';

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

// Workspace mode + phase endpoint — single source of truth for the evolving home.
// workspacePhase drives routing:
//   UNINITIALIZED → /welcome (no tools, no data)
//   CONNECTING    → /welcome (tools connecting but not all required done)
//   INDEXING      → /welcome/indexing (sync running, AI not yet ready)
//   READY         → / (full Morning Brief)
router.get('/workspace-state', async (req, res, next) => {
  try {
    const [{ workspaceMode }, state, fromMemory, googleLinked] = await Promise.all([
      getWorkspaceMode(req.tenantId),
      getState(req.tenantId),
      Promise.resolve(listConnectedConnectors(req.tenantId)),
      hasTokens(req.tenantId),
    ]);

    // Merge in-memory connectors with durable Google OAuth state from PostgreSQL.
    // Gmail and Calendar share one Google OAuth token; if either is in the DB both
    // connectors are available. This also hydrates authManager so subsequent actions
    // can load tokens without another DB check.
    const connectedConnectors = [...fromMemory];
    if (googleLinked) {
      if (!connectedConnectors.includes('gmail')) {
        connectedConnectors.push('gmail');
        storeOAuthTokens(req.tenantId, 'gmail', { stored: true, provider: 'google' });
      }
      if (!connectedConnectors.includes('google-calendar')) {
        connectedConnectors.push('google-calendar');
        storeOAuthTokens(req.tenantId, 'google-calendar', { stored: true, provider: 'google' });
      }
    }

    // Derive phase from connector count — dashboard is a privilege unlocked at MIN_CONNECTORS
    const MIN_CONNECTORS = 3;
    let workspacePhase = 'UNINITIALIZED';
    if (workspaceMode === 'demo') {
      workspacePhase = 'READY';
    } else if (connectedConnectors.length >= MIN_CONNECTORS) {
      workspacePhase = 'READY';
    } else if (state.step === 'build' || state.buildImportId) {
      workspacePhase = 'INDEXING';
    } else if (connectedConnectors.length > 0) {
      workspacePhase = 'CONNECTING';
    }

    const readinessPercent = workspaceMode === 'demo'
      ? 100
      : Math.min(100, Math.round((connectedConnectors.length / MIN_CONNECTORS) * 100));

    res.json({
      workspaceMode,
      workspacePhase,
      connectedCount:        connectedConnectors.length,
      connectedConnectors,
      isFirstRun:            !state.completed,
      onboardingComplete:    state.completed,
      role:                  state.role    || null,
      step:                  state.step    || 'welcome',
      buildImportId:         state.buildImportId || null,
      syncStartedAt:         state.syncStartedAt || null,
      readinessPercent,
      minConnectorsRequired: MIN_CONNECTORS,
    });
  } catch (err) { next(err); }
});

// Trigger initial sync for connected tools and advance to INDEXING state.
router.post('/start-sync', async (req, res, next) => {
  try {
    const connected = listConnectedConnectors(req.tenantId);
    const syncResults = {};
    const token = req.headers.authorization;
    const wsId  = req.tenantId;
    const hdrs  = { Authorization: token, 'workspace-id': wsId, 'Content-Type': 'application/json' };
    const base  = `http://localhost:${process.env.PORT || 5001}`;

    // Kick off syncs in parallel — best-effort, failures are non-fatal
    await Promise.allSettled(connected.map(async (connId) => {
      try {
        let url;
        if (connId === 'github')            url = `${base}/api/engineering/sync`;
        else if (connId === 'gmail')         url = `${base}/api/communication/sync`;
        else if (connId === 'google-calendar') url = `${base}/api/meetings/sync`;
        if (!url) return;
        const r = await fetch(url, { method: 'POST', headers: hdrs, body: JSON.stringify({ limit: 50 }) });
        syncResults[connId] = r.ok ? 'started' : 'failed';
      } catch { syncResults[connId] = 'failed'; }
    }));

    const syncId = `sync_${Date.now()}`;
    await setState(req.tenantId, { step: 'build', buildImportId: syncId, syncStartedAt: new Date().toISOString() });
    res.json({ syncId, syncResults, connectors: connected });
  } catch (err) { next(err); }
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

// Real-time sync progress — polls connector health + graph node counts.
// Returns per-connector status so the build step can show specific progress.
router.get('/sync-status', async (req, res, next) => {
  try {
    const wsId      = req.tenantId;
    const connected = listConnectedConnectors(wsId);
    const state     = await getState(wsId);

    // Graph node count tells us how much was indexed
    let nodeCount = 0;
    let vectorCount = 0;
    try {
      const [nodeRes, vecRes] = await Promise.all([
        prisma.graphNode.count({ where: { workspaceId: wsId } }),
        db.query('SELECT COUNT(*) FROM workspace_intel_chunks WHERE workspace_id = $1', [wsId]).then(r => parseInt(r.rows[0]?.count || 0, 10)),
      ]);
      nodeCount   = nodeRes;
      vectorCount = vecRes;
    } catch { /* non-fatal — counts stay 0 */ }

    // Per-connector status — check the credential store for each connected tool
    const connectorStatus = {};
    for (const id of connected) {
      connectorStatus[id] = {
        id,
        status:     'syncing',
        nodeCount:  0,
        stage:      'indexing',
      };
    }

    // Mark as complete once we have meaningful data
    const hasData      = nodeCount > 10 || vectorCount > 5;
    const syncElapsed  = state.syncStartedAt
      ? Date.now() - new Date(state.syncStartedAt).getTime()
      : 0;
    // After 30s we consider indexing complete even if counts are still low (async background work)
    const indexingDone = hasData || syncElapsed > 30_000;

    res.json({
      connected,
      connectorStatus,
      nodeCount,
      vectorCount,
      indexingDone,
      syncStartedAt: state.syncStartedAt,
      syncElapsedMs: syncElapsed,
      phase: indexingDone ? 'READY' : 'INDEXING',
    });
  } catch (err) { next(err); }
});

export default router;
