import express from 'express';
import jwt from 'jsonwebtoken';
import { authorize } from '../core/middleware/authorize.js';
import { trackEvent } from '../analytics/pilotTracker.js';
import { getMetrics } from '../analytics/pilotMetrics.js';
import { buildDigest } from '../analytics/digestService.js';
import { addClient, removeClient } from '../analytics/sseClients.js';

const router = express.Router();

router.use((req, res, next) => {
  if (!req.tenantId) {
    return res.status(400).json({ error: { code: 'MISSING_WORKSPACE', message: 'workspace-id header is required' } });
  }
  next();
});

router.post('/event', async (req, res, next) => {
  try {
    const { event, properties } = req.body ?? {};
    if (!event || typeof event !== 'string') {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'event (string) is required' } });
    }
    await trackEvent(req.tenantId, req.user?.id ?? null, event, properties ?? {});
    res.json({ ok: true });
  } catch (err) { next(err); }
});

router.get('/summary', authorize('ADMIN', 'OWNER'), async (req, res, next) => {
  try {
    const days = Math.min(90, Math.max(1, Number(req.query.days) || 14));
    res.json(await getMetrics(req.tenantId, days));
  } catch (err) { next(err); }
});

router.get('/digest', authorize('ADMIN', 'OWNER'), async (req, res, next) => {
  try {
    res.json(await buildDigest(req.tenantId));
  } catch (err) { next(err); }
});

// SSE — dev only. Accepts ?token=<jwt>&wsId=<workspaceId> for EventSource compat.
router.get('/live', (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Not available in production' } });
  }
  let workspaceId = req.tenantId;
  // Fall back to query-param auth for EventSource (cannot send Authorization header)
  if (!req.user) {
    const { token, wsId } = req.query;
    if (!token) return res.status(401).json({ error: { code: 'AUTHENTICATION_REQUIRED', message: 'Missing token' } });
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.user = decoded;
      if (wsId) workspaceId = wsId;
    } catch {
      return res.status(401).json({ error: { code: 'AUTHENTICATION_REQUIRED', message: 'Invalid token' } });
    }
  }
  if (!req.user?.role || !['ADMIN', 'OWNER'].includes(req.user.role)) {
    return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'ADMIN or OWNER required' } });
  }
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders();
  res.write('data: {"type":"connected"}\n\n');
  addClient(workspaceId, res);
  req.on('close', () => removeClient(workspaceId, res));
});

export default router;
