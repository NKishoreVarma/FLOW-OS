/**
 * Operational Graph API — the Digital Twin query surface.
 *
 * Mounted at /api/graph. All routes require JWT + workspace-id (req.tenantId);
 * every query is workspace-scoped by the engine. Node ids may be passed raw
 * (e.g. "employee:people:alice") or fully-namespaced.
 */

import { Router } from 'express';
import {
  getNode, neighbors, traverse, shortestPath,
  analyzeImpact, analyzeDependencies, findOrphans, findStale,
  strength, rankNeighbors, topCollaborators, whoKnows,
  searchNodes, degree, topConnected, metrics,
} from '../graph/index.js';

const router = Router();
const int = (v, d) => Math.max(1, Math.min(parseInt(v, 10) || d, 10));

// ── Structure / metrics ──────────────────────────────────────────────────────
router.get('/metrics', async (req, res, next) => { try { res.json(await metrics(req.tenantId)); } catch (e) { next(e); } });
router.get('/hubs',    async (req, res, next) => { try { res.json(await topConnected(req.tenantId, int(req.query.limit, 20))); } catch (e) { next(e); } });
router.get('/search',  async (req, res, next) => {
  try { res.json(await searchNodes(req.tenantId, { text: req.query.q, type: req.query.type, limit: parseInt(req.query.limit, 10) || 30 })); }
  catch (e) { next(e); }
});

// ── Node-centric ─────────────────────────────────────────────────────────────
router.get('/node/:id', async (req, res, next) => {
  try {
    const node = await getNode(req.tenantId, req.params.id);
    if (!node) return res.status(404).json({ error: 'Node not found' });
    res.json({ node, degree: await degree(req.tenantId, req.params.id), neighbors: await neighbors(req.tenantId, req.params.id) });
  } catch (e) { next(e); }
});
router.get('/neighbors/:id', async (req, res, next) => { try { res.json(await neighbors(req.tenantId, req.params.id)); } catch (e) { next(e); } });
router.get('/rank/:id',      async (req, res, next) => { try { res.json(await rankNeighbors(req.tenantId, req.params.id, int(req.query.limit, 25))); } catch (e) { next(e); } });

// ── Traversal ────────────────────────────────────────────────────────────────
router.get('/traverse/:id', async (req, res, next) => {
  try { res.json(await traverse(req.tenantId, req.params.id, { hops: int(req.query.hops, 2) })); } catch (e) { next(e); }
});
router.get('/path', async (req, res, next) => {
  try {
    if (!req.query.from || !req.query.to) return res.status(400).json({ error: 'from and to required' });
    const path = await shortestPath(req.tenantId, req.query.from, req.query.to, int(req.query.maxDepth, 4));
    res.json({ path, found: !!path, hops: path ? path.length - 1 : null });
  } catch (e) { next(e); }
});

// ── Impact / dependency ──────────────────────────────────────────────────────
router.get('/impact/:id',       async (req, res, next) => { try { res.json(await analyzeImpact(req.tenantId, req.params.id, int(req.query.depth, 3))); } catch (e) { next(e); } });
router.get('/dependencies/:id',  async (req, res, next) => { try { res.json(await analyzeDependencies(req.tenantId, req.params.id, int(req.query.depth, 3))); } catch (e) { next(e); } });
router.get('/orphans',           async (req, res, next) => {
  try { if (!req.query.type) return res.status(400).json({ error: 'type required' }); res.json(await findOrphans(req.tenantId, req.query.type)); } catch (e) { next(e); }
});
router.get('/stale', async (req, res, next) => {
  try { res.json(await findStale(req.tenantId, { type: req.query.type || null, days: parseInt(req.query.days, 10) || 90 })); } catch (e) { next(e); }
});

// ── Relationship intelligence ────────────────────────────────────────────────
router.get('/related', async (req, res, next) => {
  try {
    if (!req.query.a || !req.query.b) return res.status(400).json({ error: 'a and b required' });
    res.json(await strength(req.tenantId, req.query.a, req.query.b));
  } catch (e) { next(e); }
});
router.get('/collaborators', async (req, res, next) => { try { res.json(await topCollaborators(req.tenantId, int(req.query.limit, 20))); } catch (e) { next(e); } });
router.get('/who-knows',     async (req, res, next) => {
  try { if (!req.query.topic) return res.status(400).json({ error: 'topic required' }); res.json(await whoKnows(req.tenantId, req.query.topic, int(req.query.limit, 15))); } catch (e) { next(e); }
});

export default router;
