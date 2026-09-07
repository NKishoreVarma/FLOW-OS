/**
 * Workspace Replay API — Phase 11.3 Milestone 2.
 *
 * Mounted at /api/replay (JWT + workspace-id). A DVR over the Unified Event
 * Platform — read-only, no duplicate storage.
 *
 *   GET  /api/replay/modes             — available replay modes
 *   POST /api/replay                   — run a replay { mode, scope, bucket }
 *   POST /api/replay/snapshot          — workspace state as-of { at }
 *   POST /api/replay/compare           — diff two instants { t1, t2 }
 *   POST /api/replay/export            — { mode, scope, format: 'json'|'markdown' }
 */

import express from 'express';
import { replay, snapshot, snapshotCompare, exportReplay, MODES } from '../replay/index.js';
import { ValidationError } from '../core/errors/index.js';

const router = express.Router();
const ws = (req) => req.tenantId || req.headers['workspace-id'];

router.get('/modes', (req, res) => {
  res.json({ success: true, modes: Object.entries(MODES).map(([id, m]) => ({ id, ...m })) });
});

router.post('/', async (req, res, next) => {
  if (!ws(req)) return next(new ValidationError('Missing workspace-id header'));
  try {
    const { mode, scope, bucket } = req.body || {};
    const result = await replay(ws(req), { mode, scope: scope || {}, bucket });
    res.json({ success: true, replay: result });
  } catch (err) { next(err); }
});

router.post('/snapshot', async (req, res, next) => {
  if (!ws(req)) return next(new ValidationError('Missing workspace-id header'));
  try {
    const { at } = req.body || {};
    res.json({ success: true, snapshot: await snapshot(ws(req), at || new Date().toISOString()) });
  } catch (err) { next(err); }
});

router.post('/compare', async (req, res, next) => {
  if (!ws(req)) return next(new ValidationError('Missing workspace-id header'));
  const { t1, t2 } = req.body || {};
  if (!t1 || !t2) return next(new ValidationError('t1 and t2 are required'));
  try {
    res.json({ success: true, ...(await snapshotCompare(ws(req), t1, t2)) });
  } catch (err) { next(err); }
});

router.post('/export', async (req, res, next) => {
  if (!ws(req)) return next(new ValidationError('Missing workspace-id header'));
  try {
    const { mode, scope, bucket, format = 'json' } = req.body || {};
    const result = await replay(ws(req), { mode, scope: scope || {}, bucket });
    const out = exportReplay(result, format);
    if (format === 'markdown' || format === 'md') {
      res.setHeader('Content-Type', 'text/markdown');
      return res.send(out);
    }
    res.json({ success: true, replay: JSON.parse(out) });
  } catch (err) { next(err); }
});

export default router;
