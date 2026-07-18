/**
 * FLOW OS — Living Workspace Simulator · REST (Sprint 5)
 *
 * Dev-only control surface for the Living Workspace Simulator: seed 6 months of
 * coherent history + current work, fire one live beat, inspect status, reset.
 *
 * Security posture matches the other internal engines: 404 in production; every route
 * requires an OWNER/ADMIN JWT and a workspace-id header. The authenticated caller
 * becomes the approval requester (a real User FK), and the target workspace is the
 * caller's own — the simulator brings YOUR workspace to life.
 */

import express from 'express';
import jwt from 'jsonwebtoken';
import db from '../config/db.js';
import { prisma } from '../core/config/prisma.js';
import { seedHistory, tick, start } from '../simulator/simulatorEngine.js';

const router = express.Router();

router.use((req, res, next) => { if (process.env.NODE_ENV === 'production') return res.status(404).end(); next(); });
router.use(express.json({ limit: '1mb' }));
router.use((req, res, next) => {
  const h = req.headers.authorization;
  if (!h?.startsWith('Bearer ')) return res.status(401).json({ error: 'Bearer token required' });
  try {
    const d = jwt.verify(h.split(' ')[1], process.env.JWT_SECRET);
    if (!['OWNER', 'ADMIN'].includes(d.role)) return res.status(403).json({ error: 'Owner or Admin role required' });
    if (!req.headers['workspace-id']) return res.status(400).json({ error: 'workspace-id header required' });
    req.ctx = { ws: req.headers['workspace-id'], orgId: d.orgId, requesterId: d.userId, userEmail: d.email };
    next();
  } catch { return res.status(401).json({ error: 'Invalid or expired token' }); }
});

const ok = (fn) => async (req, res) => { try { res.json(await fn(req)); } catch (e) { res.status(500).json({ error: e.message }); } };

// POST /seed  { days? }  → backfill history + plant current work
router.post('/seed', ok(async (req) => {
  const totals = await seedHistory(req.ctx, { days: Number(req.body?.days) || 180 });
  return { ok: true, workspaceId: req.ctx.ws, ...totals };
}));

// POST /tick  → one fresh live beat
router.post('/tick', ok(async (req) => ({ ok: true, ...(await tick(req.ctx)) })));

// GET /status  → what the simulator has produced in this workspace
router.get('/status', ok(async (req) => {
  const ws = req.ctx.ws;
  const [{ rows: [ev] }, notifications, approvals] = await Promise.all([
    db.query('SELECT count(*)::int AS c, max(ts) AS latest FROM flow_events WHERE workspace_id = $1', [ws]),
    prisma.notification.count({ where: { workspaceId: ws } }),
    prisma.pendingApproval.count({ where: { workspaceId: ws, status: 'PENDING' } }),
  ]);
  return {
    workspaceId: ws, enabled: process.env.SIMULATOR_ENABLED === 'true',
    events: ev?.c ?? 0, latestEvent: ev?.latest ?? null,
    notifications, pendingApprovals: approvals,
  };
}));

// POST /reset  → remove all simulated data for this workspace
router.post('/reset', ok(async (req) => {
  const ws = req.ctx.ws;
  const [ev, del, notif, appr] = await Promise.all([
    db.query('DELETE FROM flow_events WHERE workspace_id = $1', [ws]),
    db.query('DELETE FROM flow_event_deliveries WHERE workspace_id = $1', [ws]).catch(() => ({ rowCount: 0 })),
    prisma.notification.deleteMany({ where: { workspaceId: ws } }),
    prisma.pendingApproval.deleteMany({ where: { workspaceId: ws } }),
  ]);
  return { ok: true, workspaceId: ws, deleted: { events: ev.rowCount, deliveries: del.rowCount, notifications: notif.count, approvals: appr.count } };
}));

export default router;
export { start as startSimulator };
