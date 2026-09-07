/**
 * Consequence API — proactive, cross-tool risk detection ("FLOW DETECTED").
 * GET /api/consequences — what FLOW connected across tools that needs attention.
 */

import express from 'express';
import { detectConsequences } from '../consequence/consequenceEngine.js';
import { prepareResolution } from '../consequence/resolutionPlanner.js';
import { ValidationError } from '../core/errors/index.js';

const router = express.Router();

router.get('/', async (req, res, next) => {
  const workspaceId = req.headers['workspace-id'];
  if (!workspaceId) return next(new ValidationError('Missing workspace-id header'));

  try {
    const minProbability = req.query.minProbability ? Number(req.query.minProbability) : undefined;
    const consequences = await detectConsequences(workspaceId, { minProbability });
    res.json({
      success: true,
      count: consequences.length,
      crossToolCount: consequences.filter(c => c.crossTool).length,
      consequences,
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

// Prepare a reviewable, executable resolution for a consequence (Layer 5).
// Returns a drafted preview + an executable recommendation for /api/execution/execute.
// Never sends — the human approves in the UI.
router.post('/resolve', async (req, res, next) => {
  const workspaceId = req.headers['workspace-id'];
  if (!workspaceId) return next(new ValidationError('Missing workspace-id header'));
  const { consequence } = req.body;
  if (!consequence) return next(new ValidationError('consequence is required'));

  try {
    const resolution = await prepareResolution(workspaceId, consequence);
    res.json({ success: true, ...resolution });
  } catch (err) {
    next(err);
  }
});

export default router;
