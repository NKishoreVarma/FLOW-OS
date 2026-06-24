import express from 'express';
import { runSystemTest } from '../services/simulationService.js';

const router = express.Router();

/**
 * @route  POST /api/test/simulate
 * @desc   Trigger the full end-to-end cognitive pipeline simulation for a workspace
 * @access Local testing only — remove or guard behind auth in production
 *
 * Request headers:
 *   workspace-id: <id>          (optional — falls back to body)
 *
 * Request body:
 *   { workspaceId: string|number, channelName?: string }
 *
 * Response:
 *   { workspaceId, timestamp, totalPayloads, passed, failed, allPassed, totalDurationMs, results[] }
 */
router.post('/', async (req, res) => {
  // Accept workspaceId from either the multi-tenant header or the request body
  const headerWorkspaceId =
    req.headers['workspace-id'] ||
    req.headers['x-workspace-id'] ||
    req.headers['workspace_id'];

  const { workspaceId: bodyWorkspaceId, channelName } = req.body;
  const workspaceId = headerWorkspaceId ?? bodyWorkspaceId;

  if (!workspaceId) {
    return res.status(400).json({
      error: 'Missing workspaceId — provide it via the workspace-id header or request body.'
    });
  }

  console.log(`\n🧪 [Simulation Route] Received test trigger for Workspace ${workspaceId}`);

  try {
    const report = await runSystemTest(workspaceId, channelName);
    return res.status(200).json(report);
  } catch (err) {
    console.error(`[Simulation Route] Suite execution failure:`, err);
    return res.status(500).json({
      error:   'Simulation suite execution failed.',
      details: err.message
    });
  }
});

export default router;
