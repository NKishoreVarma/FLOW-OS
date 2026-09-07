/**
 * ingestionTraceRoutes — read-only, tenant-scoped view of the SAFE per-item
 * ingestion trace (metadata only; no content ever stored or returned).
 *
 * Mounted at /api/observability/ingestion-trace (JWT + workspace-id).
 */
import express from 'express';
import { getTrace, listItems, listRecent, stagesSeen, STAGE_ORDER } from '../observability/ingestionTrace.js';

const router = express.Router();

router.use((req, res, next) => {
  const workspaceId = req.headers['workspace-id'] || req.tenantId;
  if (!workspaceId) {
    return res.status(400).json({ error: { code: 'MISSING_WORKSPACE', message: 'workspace-id header is required' } });
  }
  req.wsId = workspaceId;
  next();
});

// Recent items with their observed stage progress.
router.get('/', (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  res.json({ success: true, stages: STAGE_ORDER, items: listItems(req.wsId, { limit }) });
});

// Raw recent stage entries (safe metadata only).
router.get('/recent', (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 200, 1000);
  res.json({ success: true, entries: listRecent(req.wsId, { limit }) });
});

// Full ordered trace for one item.
router.get('/:eventId', (req, res) => {
  const eventId = decodeURIComponent(req.params.eventId);
  const trace = getTrace(req.wsId, eventId);
  res.json({
    success: true,
    eventId,
    stagesSeen: stagesSeen(req.wsId, eventId),
    complete: stagesSeen(req.wsId, eventId).length === STAGE_ORDER.length,
    trace,
  });
});

export default router;
