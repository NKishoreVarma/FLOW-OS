import express from 'express';
import { retrieveContext } from '../services/retrievalService.js';
import { evaluateContext } from '../services/agents/CriticAgent.js';
import { synthesize } from '../services/agents/ExecutiveSynthesisAgent.js';
import { broadcastToWorkspace } from '../services/socketService.js';
import { 
  generateQueryTraceId, 
  startQueryTrace, 
  updateQueryTrace, 
  liveMetrics 
} from '../services/observabilityService.js';
import { routeQuery } from '../services/agents/RouterAgent.js';

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
  const workspaceId = req.headers['workspace-id'] || req.headers['x-workspace-id'];
  const { queryText } = req.body;
  const queryTraceId = generateQueryTraceId();

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

  // Initialize Query trace
  startQueryTrace(queryTraceId, workspaceId, queryText);

  try {
    // 1. Router Agent Stage
    updateQueryTrace(queryTraceId, 'Router Agent', 'START', { input: queryText });
    const routerResult = routeQuery(queryText);
    updateQueryTrace(queryTraceId, 'Router Agent', 'SUCCESS', {
      input: queryText,
      output: routerResult,
      metadata: { primaryDomain: routerResult.primaryDomain }
    });

    // 2. Retrieval Context (Traces Embedding Query, Vector Search, Reranker, and KG Expansion internally)
    const results = await retrieveContext(workspaceId, queryText, queryTraceId);

    // Normalize results for CriticAgent (expects .text property)
    const normalizedContext = results.map(r => ({
      ...r,
      text: r.content || r.markdown,
      source: r.source || r.platform
    }));

    // 3. Critic Agent Stage
    updateQueryTrace(queryTraceId, 'Critic Agent', 'START', { input: normalizedContext });
    const { validatedChunks, contradictions, criticSummary } = evaluateContext(normalizedContext, queryText);
    
    // Memory Boost calculations (Simulated increase in score for high authority/importance chunks)
    updateQueryTrace(queryTraceId, 'Memory Boost', 'START', { input: validatedChunks });
    const boostedChunks = validatedChunks.map(c => {
      const boost = (c.authorityCoeff >= 1.5) ? 0.15 : 0;
      return {
        ...c,
        boostVal: boost,
        finalScore: (c.weightedScore || c.score) + boost
      };
    });
    updateQueryTrace(queryTraceId, 'Memory Boost', 'SUCCESS', {
      input: validatedChunks,
      output: boostedChunks
    });

    updateQueryTrace(queryTraceId, 'Critic Agent', 'SUCCESS', {
      input: normalizedContext,
      output: { validatedChunks: boostedChunks, contradictions, criticSummary },
      metadata: { contradictionsCount: contradictions.length, deprecatedCount: normalizedContext.length - validatedChunks.filter(c => !c.deprecated).length }
    });

    // 4. LLM synthesis & Executive Synthesis Agent Stage
    updateQueryTrace(queryTraceId, 'Executive Synthesis', 'START', { input: { queryText, boostedChunks, routerResult, criticSummary } });
    const synthesisResult = await synthesize(queryText, boostedChunks, routerResult, criticSummary);
    updateQueryTrace(queryTraceId, 'Executive Synthesis', 'SUCCESS', {
      input: { queryText, boostedChunks, routerResult, criticSummary },
      output: synthesisResult,
      metadata: { modelUsed: synthesisResult.modelUsed, tokensConsumed: synthesisResult.tokensConsumed }
    });

    // 5. Final Answer & Validation
    updateQueryTrace(queryTraceId, 'Final Answer', 'START', { input: synthesisResult.answer });
    updateQueryTrace(queryTraceId, 'Final Answer', 'SUCCESS', {
      input: synthesisResult.answer,
      output: synthesisResult.answer
    });

    // Broadcast the final synthesis brief via WebSocket
    broadcastToWorkspace(String(workspaceId), 'EXECUTIVE_SYNTHESIS_READY', {
      workspaceId,
      modelUsed: synthesisResult.modelUsed,
      brief: synthesisResult.answer,
      queryTraceId
    });

    return res.status(200).json({
      query:          queryText,
      workspaceId:    workspaceId,
      queryTraceId:   queryTraceId,
      totalResults:   results.length,
      results:        boostedChunks,
      synthesisBrief: synthesisResult.answer
    });
  } catch (error) {
    updateQueryTrace(queryTraceId, 'Final Answer', 'FAILED', {
      error: error.message
    });
    console.error(`[Query Route] Retrieval failure for Workspace ${workspaceId}:`, error);
    return res.status(500).json({
      error:   'Context retrieval failed.',
      details: error.message,
      queryTraceId
    });
  }
});

export default router;
