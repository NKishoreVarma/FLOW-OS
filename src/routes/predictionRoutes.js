/**
 * Predictive Workspace Intelligence API — Phase 11.5 Milestone 2.
 *
 * Mounted at /api/predictions (JWT + workspace-id). Deterministic, explainable
 * forecasts across engineering, people, customers, and operations.
 *
 *   GET /api/predictions/types    — available prediction types + domains
 *   GET /api/predictions          — run predictions (?domain= or ?types=a,b)
 *   GET /api/predictions/history  — prior prediction runs (Prediction History)
 *   GET /api/predictions/:type    — a single prediction
 */

import express from 'express';
import { predict, predictOne, getHistory, allTypes, DOMAINS, modelsByDomain } from '../predictions/index.js';
import { MODELS } from '../predictions/PredictionModels.js';
import { ValidationError } from '../core/errors/index.js';

const router = express.Router();
const ws = (req) => req.tenantId || req.headers['workspace-id'];

router.get('/types', (req, res) => {
  res.json({ success: true, domains: DOMAINS, types: allTypes().map(t => ({ id: t, domain: MODELS[t].domain, label: MODELS[t].label })) });
});

router.get('/history', async (req, res, next) => {
  if (!ws(req)) return next(new ValidationError('Missing workspace-id header'));
  try { res.json({ success: true, history: await getHistory(ws(req), parseInt(req.query.limit, 10) || 20) }); }
  catch (err) { next(err); }
});

router.get('/', async (req, res, next) => {
  if (!ws(req)) return next(new ValidationError('Missing workspace-id header'));
  try {
    const opts = { persist: req.query.persist !== 'false' };
    if (req.query.domain) opts.domain = req.query.domain;
    if (req.query.types) opts.types = String(req.query.types).split(',').map(s => s.trim());
    res.json({ success: true, ...(await predict(ws(req), opts)) });
  } catch (err) { next(err); }
});

router.get('/:type', async (req, res, next) => {
  if (!ws(req)) return next(new ValidationError('Missing workspace-id header'));
  const type = req.params.type.toUpperCase();
  if (!modelsByDomain && !allTypes().includes(type)) return next(new ValidationError(`Unknown prediction type: ${type}`));
  if (!allTypes().includes(type)) return next(new ValidationError(`Unknown prediction type: ${type}`));
  try { res.json({ success: true, prediction: await predictOne(ws(req), type) }); }
  catch (err) { next(err); }
});

export default router;
