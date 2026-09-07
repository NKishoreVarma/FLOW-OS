import express from 'express';
import { authorize } from '../core/middleware/authorize.js';
import {
  listPartners, getPartner, createPartner, updatePartner,
  addWeeklyReview, getPortfolioSummary,
} from '../partners/partnerService.js';

const router = express.Router();

router.get('/portfolio', authorize('ADMIN', 'OWNER'), async (req, res, next) => {
  try { res.json(await getPortfolioSummary()); } catch (e) { next(e); }
});

router.get('/', authorize('ADMIN', 'OWNER'), async (req, res, next) => {
  try {
    const { status } = req.query;
    res.json({ partners: await listPartners(status ? { status } : {}) });
  } catch (e) { next(e); }
});

router.get('/:id', authorize('ADMIN', 'OWNER'), async (req, res, next) => {
  try {
    const p = await getPartner(req.params.id);
    if (!p) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Partner not found' } });
    res.json(p);
  } catch (e) { next(e); }
});

router.post('/', authorize('ADMIN', 'OWNER'), async (req, res, next) => {
  try {
    if (!req.body?.companyName) {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'companyName is required' } });
    }
    res.status(201).json(await createPartner(req.body));
  } catch (e) { next(e); }
});

router.patch('/:id', authorize('ADMIN', 'OWNER'), async (req, res, next) => {
  try {
    const p = await updatePartner(req.params.id, req.body);
    if (!p) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Partner not found' } });
    res.json(p);
  } catch (e) { next(e); }
});

router.post('/:id/review', authorize('ADMIN', 'OWNER'), async (req, res, next) => {
  try {
    res.status(201).json(await addWeeklyReview(req.params.id, req.body));
  } catch (e) { next(e); }
});

export default router;
