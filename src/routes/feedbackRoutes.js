import express from 'express';
import { authorize } from '../core/middleware/authorize.js';
import { submitFeedback, getFeedback } from '../feedback/feedbackStore.js';

const router = express.Router();

router.use((req, res, next) => {
  if (!req.tenantId) {
    return res.status(400).json({ error: { code: 'MISSING_WORKSPACE', message: 'workspace-id header is required' } });
  }
  next();
});

router.post('/', async (req, res, next) => {
  try {
    const { thumbs, text, context } = req.body ?? {};
    if (!thumbs || !['up', 'down'].includes(thumbs)) {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'thumbs must be "up" or "down"' } });
    }
    const fb = await submitFeedback(req.tenantId, req.user?.id ?? null, { thumbs, text, context });
    res.json({ ok: true, id: fb.id });
  } catch (err) { next(err); }
});

router.get('/', authorize('ADMIN', 'OWNER'), async (req, res, next) => {
  try {
    const limit = Math.min(100, Number(req.query.limit) || 20);
    res.json({ feedback: await getFeedback(req.tenantId, { limit }) });
  } catch (err) { next(err); }
});

export default router;
