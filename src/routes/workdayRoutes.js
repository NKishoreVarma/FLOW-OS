/**
 * FLOW OS — Adaptive Workday Engine Routes (Sprint 2.2)
 *
 * "What is the single most valuable thing this person should do right now?"
 * JWT + workspace-id. The queue is recomputed on every read from current state, so it
 * is inherently adaptive — completing work reorders the next read. Reuses the Governance
 * approvals, Notification Engine, and Prediction Engine — no new reasoning.
 *
 *   GET /api/workday/queue   Today's Work Queue (NOW / NEXT / LATER / FYI)
 *   GET /api/workday/next    the single most important thing right now
 */

import express from 'express';
import { getWorkQueue, getNext } from '../workday/workdayEngine.js';

const router = express.Router();

router.use((req, res, next) => {
  if (!req.tenantId) return res.status(400).json({ error: { code: 'MISSING_WORKSPACE', message: 'workspace-id header is required' } });
  next();
});

const userOf = (req) => ({ id: req.user?.id, email: req.user?.email, fullName: req.user?.fullName, role: req.workspaceRole || req.user?.role });

router.get('/queue', async (req, res, next) => {
  try { res.json(await getWorkQueue(req.tenantId, userOf(req))); } catch (err) { next(err); }
});

router.get('/next', async (req, res, next) => {
  try { res.json({ next: await getNext(req.tenantId, userOf(req)) }); } catch (err) { next(err); }
});

export default router;
