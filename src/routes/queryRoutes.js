import express from 'express';
import { retrieveContext } from '../services/retrievalService.js';
import { evaluateContext } from '../services/agents/CriticAgent.js';
import { synthesize } from '../services/agents/ExecutiveSynthesisAgent.js';
import { broadcastToWorkspace } from '../services/socketService.js';

const router = express.Router();

/**
 * @route  POST /api/query
 * @desc   Authority-weighted RAG context retrieval for a workspace tenant
 * @access Private — enforces strict workspace_id header isolation
 *
 * Request headers:
 *   workspace-id: <workspaceId>   (required — tenant isolation gate)
 *
 * Request body:
 *   { queryText: string }
 *
 * Response:
 *   { query: string, results: Array<ContextBlock>, synthesisBrief: string }
 */
router.post('/', async (req, res) => {
  const workspaceId = req.headers['workspace-id'];
  const { queryText } = req.body;

  if (!workspaceId) {
    return res.status(400).json({
      error: 'Multi-tenant isolation violation: Missing workspace-id header.'
    });
  }

  if (!queryText || String(queryText).trim() === '') {
    return res.status(400).json({
      error: 'Missing required field: queryText must be a non-empty string.'
    });
  }

  try {
    // 1. Retrieve hybrid fused context nodes
    const results = await retrieveContext(workspaceId, queryText);

    // Normalize results for CriticAgent (expects .text property)
    const normalizedContext = results.map(r => ({
      ...r,
      text: r.content || r.markdown,
      source: r.source || r.platform
    }));

    // 2. Pass through CriticAgent
    const { validatedChunks, contradictions, criticSummary } = evaluateContext(normalizedContext, queryText);

    // Mock a basic routerResult since RouterAgent isn't wired directly in this endpoint yet
    const mockRouterResult = {
      primaryDomain: 'corporate_intelligence',
      intentFlags: { isUrgent: false, isComparison: false, isTimeBound: false }
    };

    // 3. Pass through ExecutiveSynthesisAgent
    const synthesisResult = await synthesize(queryText, validatedChunks, mockRouterResult, criticSummary);

    // 4. Broadcast the final synthesis brief via WebSocket
    broadcastToWorkspace(String(workspaceId), 'EXECUTIVE_SYNTHESIS_READY', {
      workspaceId,
      modelUsed: synthesisResult.modelUsed,
      brief: synthesisResult.answer
    });

    return res.status(200).json({
      query:          queryText,
      workspaceId:    workspaceId,
      totalResults:   results.length,
      results:        normalizedContext,
      synthesisBrief: synthesisResult.answer
    });
  } catch (error) {
    console.error(`[Query Route] Retrieval failure for Workspace ${workspaceId}:`, error);
    return res.status(500).json({
      error:   'Context retrieval failed.',
      details: error.message
    });
  }
});

export default router;
