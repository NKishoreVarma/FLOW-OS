/**
 * Explainable Intelligence API — Phase 11.2 Milestone 2.
 *
 * Mounted at /api/explain (JWT + workspace-id).
 *   POST /api/explain           — explain an arbitrary AI output, or run a
 *                                 question through the Operational Brain and explain it
 *   POST /api/explain/followup  — answer "why / how / what-evidence / who-said /
 *                                 what-changed / why-now / what-missing /
 *                                 why-recommendation" from an explanation
 */

import express from 'express';
import { explain, explainQuestion, answerFollowUp, FOLLOWUPS } from '../explainability/index.js';
import { ValidationError } from '../core/errors/index.js';

const router = express.Router();

router.post('/', async (req, res, next) => {
  const workspaceId = req.headers['workspace-id'];
  if (!workspaceId) return next(new ValidationError('Missing workspace-id header'));

  const { output, question, entityId, domain } = req.body || {};
  try {
    let explanation;
    if (output) {
      explanation = await explain(output, { workspaceId, entityId, domain, question });
    } else if (question?.trim()) {
      explanation = await explainQuestion(workspaceId, question.trim(), { entityId, role: req.user?.role });
    } else {
      return next(new ValidationError('Provide either "output" (to explain) or "question" (to reason + explain).'));
    }
    res.json({ success: true, explanation });
  } catch (err) { next(err); }
});

router.post('/followup', async (req, res, next) => {
  const workspaceId = req.headers['workspace-id'];
  if (!workspaceId) return next(new ValidationError('Missing workspace-id header'));

  const { explanation, type, question, entityId } = req.body || {};
  if (!type || !FOLLOWUPS.includes(type)) {
    return next(new ValidationError(`"type" must be one of: ${FOLLOWUPS.join(', ')}`));
  }
  try {
    let exp = explanation;
    if (!exp && question?.trim()) exp = await explainQuestion(workspaceId, question.trim(), { entityId, role: req.user?.role });
    if (!exp) return next(new ValidationError('Provide "explanation" (a prior envelope) or "question".'));
    res.json({ success: true, followUp: answerFollowUp(exp, type) });
  } catch (err) { next(err); }
});

router.get('/types', (req, res) => res.json({ success: true, followUpTypes: FOLLOWUPS }));

export default router;
