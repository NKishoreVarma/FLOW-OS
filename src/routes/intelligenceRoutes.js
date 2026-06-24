import express from 'express';
import { generateDailyFeed } from '../services/dailyIntelligenceService.js';
import { calculateWorkspaceHealth } from '../services/healthScoreService.js';

const router = express.Router();

/**
 * @route  GET /api/intelligence/health-score
 * @desc   Generate real-time operational health scores for a workspace
 * @access Private
 */
router.get('/health-score', (req, res) => {
  const workspaceId = req.headers['workspace-id'];

  if (!workspaceId) {
    return res.status(400).json({
      error: 'Multi-tenant isolation violation: Missing workspace-id header.'
    });
  }

  try {
    const health = calculateWorkspaceHealth(workspaceId);
    return res.status(200).json(health);
  } catch (error) {
    console.error(`[Intelligence Route] Failed to calculate health score:`, error);
    return res.status(500).json({
      error: 'Failed to calculate health score.',
      details: error.message
    });
  }
});

/**
 * @route  GET /api/intelligence/daily-feed
 * @desc   Generate the daily operational intelligence feed for a workspace
 * @access Private
 */
router.get('/daily-feed', (req, res) => {
  const workspaceId = req.headers['workspace-id'];

  if (!workspaceId) {
    return res.status(400).json({
      error: 'Multi-tenant isolation violation: Missing workspace-id header.'
    });
  }

  try {
    const feed = generateDailyFeed(workspaceId);
    return res.status(200).json({ feed });
  } catch (error) {
    console.error(`[Intelligence Route] Failed to generate daily feed:`, error);
    return res.status(500).json({
      error: 'Failed to generate daily feed.',
      details: error.message
    });
  }
});

export default router;
