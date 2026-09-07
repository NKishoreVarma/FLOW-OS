/**
 * Universal Action Registry REST API
 *
 * GET  /api/registry/actions              — list all (filter: connector, category, riskLevel)
 * GET  /api/registry/actions/search?q=   — full-text + tag search
 * GET  /api/registry/actions/:id         — single action definition
 * GET  /api/registry/actions/:id/schema  — input/output schema only
 * GET  /api/registry/stats               — registry statistics
 * POST /api/registry/validate            — validate inputs against a definition (dry-run)
 */

import { Router }          from 'express';
import { actionRegistry }  from '../actionRegistry/index.js';
import { ValidationError } from '../core/errors/index.js';

const router = Router();

router.get('/actions', (req, res) => {
  const { connector, category, riskLevel, lifecycle } = req.query;
  const actions = actionRegistry.list({ connector, category, riskLevel, lifecycle });
  res.json({ total: actions.length, actions });
});

router.get('/actions/search', (req, res) => {
  const { q, limit } = req.query;
  if (!q) throw new ValidationError('q is required');
  const results = actionRegistry.search(q, limit ? Number(limit) : 20);
  res.json({ total: results.length, results });
});

router.get('/actions/:id', (req, res) => {
  const definition = actionRegistry.resolve(req.params.id);
  res.json(definition);
});

router.get('/actions/:id/schema', (req, res) => {
  const def = actionRegistry.resolve(req.params.id);
  res.json({
    id:             def.id,
    requiredInputs: def.requiredInputs,
    optionalInputs: def.optionalInputs,
    outputSchema:   def.outputSchema,
  });
});

router.get('/stats', (req, res) => {
  res.json(actionRegistry.stats());
});

router.post('/validate', (req, res) => {
  const { actionId, inputs } = req.body;
  if (!actionId) throw new ValidationError('actionId is required');
  const result = actionRegistry.validateInputs(actionId, inputs ?? {});
  res.json(result);
});

export default router;
