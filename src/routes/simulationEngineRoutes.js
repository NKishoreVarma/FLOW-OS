/**
 * What-If Simulation API — Phase 11.4 Milestone 2.
 *
 * Mounted at /api/simulation (JWT + workspace-id). Distinct from the legacy
 * /api/test/simulate test harness. Evidence-backed decision-support over the
 * Operational Graph, event history, and memory.
 *
 *   GET  /api/simulation/types    — the 11 scenario types
 *   POST /api/simulation          — run a simulation { type|question, targetEntityId|targetName, params }
 *   POST /api/simulation/compare  — compare two scenarios { a, b }
 */

import express from 'express';
import { simulate, compare, SCENARIO_TYPES } from '../simulation/index.js';
import { ValidationError } from '../core/errors/index.js';

const router = express.Router();
const ws = (req) => req.tenantId || req.headers['workspace-id'];

router.get('/types', (req, res) => {
  res.json({ success: true, types: Object.entries(SCENARIO_TYPES).map(([id, d]) => ({ id, label: d.label, change: d.change, targetType: d.targetType, abstract: !!d.abstract })) });
});

router.post('/', async (req, res, next) => {
  if (!ws(req)) return next(new ValidationError('Missing workspace-id header'));
  const { type, question, targetEntityId, targetName, params, change, persist } = req.body || {};
  if (!type && !question) return next(new ValidationError('Provide a scenario "type" or a "question".'));
  try {
    const result = await simulate(ws(req), { type, question, targetEntityId, targetName, params, change }, { persist: persist !== false });
    res.json({ success: result.ok !== false, simulation: result });
  } catch (err) { next(err); }
});

router.post('/compare', async (req, res, next) => {
  if (!ws(req)) return next(new ValidationError('Missing workspace-id header'));
  const { a, b } = req.body || {};
  if (!a || !b) return next(new ValidationError('Provide two scenarios "a" and "b".'));
  try {
    res.json({ success: true, ...(await compare(ws(req), a, b)) });
  } catch (err) { next(err); }
});

export default router;
