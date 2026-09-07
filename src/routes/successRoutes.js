/**
 * FLOW OS — Success / Value Dashboard Routes (Phase 17)
 *
 * The personal ROI surface. JWT + workspace-id (mounted after global auth, so req.tenantId
 * is the resolved workspace). Read-only; reuses existing records — no new store.
 *
 *   GET /api/success/summary?days=7   hybrid ROI summary (measured counts + labeled estimates)
 *   GET /api/success/model            the transparent estimate basis
 */

import express from 'express';
import { getWeeklySummary } from '../success/successMetrics.js';
import { VALUE_MODEL } from '../success/valueModel.js';

const router = express.Router();

router.use((req, res, next) => {
  if (!req.tenantId) return res.status(400).json({ error: { code: 'MISSING_WORKSPACE', message: 'workspace-id header is required' } });
  next();
});

router.get('/summary', async (req, res, next) => {
  try {
    const days = Math.min(90, Math.max(1, Number(req.query.days) || 7));
    res.json(await getWeeklySummary(req.tenantId, { sinceDays: days }));
  } catch (err) { next(err); }
});

router.get('/model', (req, res) => res.json(VALUE_MODEL));

export default router;
