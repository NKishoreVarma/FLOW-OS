/**
 * FLOW OS — Observability & AI Evaluation Routes
 */

import { Router } from 'express';
import { 
  logEvaluationOutcome, getRecommendationMetrics, getCopilotPerformance, getExplainabilityTrace 
} from '../services/aiEvaluationService.js';

const router = Router();

/**
 * GET /api/evaluation/metrics
 * Returns recommendation statistics, productivity saves, and learning loop tags weights.
 */
router.get('/metrics', async (req, res, next) => {
  try {
    const workspaceId = req.headers['workspace-id'] || 'unknown';
    const recMetrics = await getRecommendationMetrics(workspaceId);
    const copilotMetrics = await getCopilotPerformance(workspaceId);
    res.json({
      recommendations: recMetrics,
      copilot: copilotMetrics
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/evaluation/explainability/:recommendationId
 * Returns the supporting evidence nodes, authority coefficients, and reasoning stages.
 */
router.get('/explainability/:recommendationId', async (req, res, next) => {
  try {
    const trace = await getExplainabilityTrace(req.params.recommendationId);
    res.json(trace);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/evaluation/feedback/:recommendationId
 * Logs user outcome feedback (accept, reject, ignore) to trigger learning weights adaptations.
 */
router.post('/feedback/:recommendationId', async (req, res, next) => {
  try {
    const result = await logEvaluationOutcome(req.params.recommendationId, req.body.feedback);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

export default { routes: router, prefix: '/api/evaluation' };
