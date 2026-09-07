/**
 * FLOW OS — Workspace Intelligence Cache Routes (Phase 16.1)
 *
 * The instant read layer. These endpoints NEVER invoke expensive reasoning — they read
 * the pre-built snapshot from the cache (sub-ms in memory). On a cold miss they return
 * a lightweight `status:'building'` doc and kick off an async build; the next read is
 * warm. Target: <100ms.
 *
 *   GET /api/workspace/snapshot   full snapshot (overall + 6 domain cards + counts)
 *   GET /api/workspace/health     overall health + per-domain status
 *   GET /api/workspace/summary    overall { health, priority, summary, topActions }
 *   GET /api/workspace/actions    top cross-domain actions
 */

import express from 'express';
import { getSnapshot } from '../workspaceCache/snapshotStore.js';
import { ensureFresh, refresh } from '../workspaceCache/refreshCoordinator.js';

const router = express.Router();

router.use((req, res, next) => {
  if (!req.tenantId) return res.status(400).json({ error: { code: 'MISSING_WORKSPACE', message: 'workspace-id header is required' } });
  next();
});

async function loadOrBuilding(req) {
  const snap = await getSnapshot(req.tenantId);
  if (snap) return { snap, building: false };
  ensureFresh(req.tenantId); // async build; do not block the read
  return { snap: { workspaceId: req.tenantId, status: 'building', generatedAt: null, overall: null, domains: null, counts: null }, building: true };
}

router.get('/snapshot', async (req, res, next) => {
  try {
    if (req.query.force === 'true') return res.json(await refresh(req.tenantId));
    const { snap } = await loadOrBuilding(req);
    res.json(snap);
  } catch (err) { next(err); }
});

router.get('/health', async (req, res, next) => {
  try {
    const { snap, building } = await loadOrBuilding(req);
    if (building) return res.json({ status: 'building' });
    const domainStatus = Object.fromEntries(Object.entries(snap.domains || {}).map(([k, v]) => [k, { status: v.status, score: v.score }]));
    res.json({ health: snap.overall?.health, priority: snap.overall?.priority, domains: domainStatus, generatedAt: snap.generatedAt });
  } catch (err) { next(err); }
});

router.get('/summary', async (req, res, next) => {
  try {
    const { snap, building } = await loadOrBuilding(req);
    res.json(building ? { status: 'building' } : { ...snap.overall, generatedAt: snap.generatedAt, counts: snap.counts });
  } catch (err) { next(err); }
});

router.get('/actions', async (req, res, next) => {
  try {
    const { snap, building } = await loadOrBuilding(req);
    if (building) return res.json({ status: 'building', actions: [] });
    const perDomain = Object.entries(snap.domains || {}).flatMap(([d, v]) => (v.recommendedActions || []).map((a) => ({ domain: d, action: a })));
    res.json({ top: snap.overall?.topActions || [], byDomain: perDomain.slice(0, 12) });
  } catch (err) { next(err); }
});

export default router;
