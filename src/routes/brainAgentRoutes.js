/**
 * Brain Agent Routes — REST API for the Multi-Agent Cognitive Brain (Phase 11).
 *
 * Mounted at /api/brain/agents in server.js (after existing /api/brain routes).
 * All routes require JWT + workspace-id header.
 *
 * POST /api/brain/agents/reason
 *   Full 8-stage pipeline: intent → agent selection → parallel reasoning → consensus → decision
 *   Body: { question, options?: { forceAgentIds?, pageContext?, entityId? } }
 *
 * POST /api/brain/agents/:id/reason
 *   Single-agent reasoning (targeted query to one domain agent)
 *   Body: { question }
 *
 * GET  /api/brain/agents
 *   List all registered agents with definitions
 *
 * GET  /api/brain/agents/:id
 *   Single agent definition
 *
 * GET  /api/brain/agents/routing
 *   Explain agent routing for a given question (no LLM call)
 *   Query: ?question=...
 *
 * GET  /api/brain/agents/sessions
 *   List recent reasoning sessions for this workspace
 *
 * GET  /api/brain/agents/sessions/:sessionId
 *   Get session state (poll for async results)
 *
 * GET  /api/brain/agents/stats
 *   Agent registry statistics + active session count
 */

import { Router }           from 'express';
import { ValidationError }  from '../core/errors/index.js';
import {
  listAgents,
  getAgentDefinition,
  agentCount,
  routeToAgents,
  explainRouting,
  runCognitivePipeline,
  runSingleAgent,
  getSession,
  listSessions,
  activeChannels,
}                           from '../brain/index.js';
import { analyzeIntent }    from '../ai/reasoning/IntentAnalyzer.js';

const router = Router();

// Workspace guard — all brain agent routes require workspace-id
router.use((req, res, next) => {
  const workspaceId = req.headers['workspace-id'] || req.tenantId;
  if (!workspaceId) {
    return res.status(400).json({ error: { code: 'MISSING_WORKSPACE', message: 'workspace-id header is required' } });
  }
  req.workspaceId = workspaceId;
  next();
});

// ── Agent registry ────────────────────────────────────────────────────────────

router.get('/', (req, res) => {
  res.json({ agents: listAgents(), total: agentCount() });
});

router.get('/stats', (req, res) => {
  res.json({
    registeredAgents: agentCount(),
    activeChannels:   activeChannels(),
    agentIds:         listAgents().map(a => a.id),
  });
});

router.get('/routing', async (req, res, next) => {
  try {
    const { question } = req.query;
    if (!question) throw new ValidationError('question query param is required');
    const intent  = await analyzeIntent(question);
    const routing = explainRouting(intent);
    const selected = routeToAgents(intent);
    res.json({ question, intent, selected, routing });
  } catch (err) { next(err); }
});

// ── Sessions ──────────────────────────────────────────────────────────────────

router.get('/sessions', (req, res) => {
  const sessions = listSessions(req.workspaceId, Math.min(Number(req.query.limit) || 20, 50));
  res.json({ sessions, total: sessions.length });
});

router.get('/sessions/:sessionId', (req, res) => {
  const session = getSession(req.params.sessionId, req.workspaceId);
  if (!session) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Session not found' } });
  res.json({ session });
});

// ── Full pipeline reasoning ───────────────────────────────────────────────────

/**
 * POST /api/brain/agents/reason
 *
 * Launches the full 8-stage pipeline. This is intentionally synchronous:
 * the pipeline runs and returns once complete. For long-running use cases
 * (>30s), clients can poll /sessions/:id after receiving a 202.
 */
router.post('/reason', async (req, res, next) => {
  try {
    const { question, options = {} } = req.body;
    if (!question || typeof question !== 'string') {
      throw new ValidationError('question is required and must be a string');
    }
    if (question.trim().length < 3) {
      throw new ValidationError('question must be at least 3 characters');
    }

    const orgId = req.user?.orgId;

    const result = await runCognitivePipeline(
      req.workspaceId,
      orgId,
      question.trim(),
      options
    );

    res.json({ result });
  } catch (err) { next(err); }
});

// ── Single-agent reasoning ────────────────────────────────────────────────────

router.post('/:id/reason', async (req, res, next) => {
  try {
    const { id }      = req.params;
    const { question } = req.body;

    if (!question) throw new ValidationError('question is required');

    const def = getAgentDefinition(id);
    if (!def)  return res.status(404).json({ error: { code: 'NOT_FOUND', message: `Agent '${id}' not found` } });

    if (id === 'chief-of-staff') {
      return res.status(400).json({ error: { code: 'INVALID_TARGET', message: 'Chief of Staff cannot be invoked directly — use /reason for the full pipeline' } });
    }

    const orgId = req.user?.orgId;
    const output = await runSingleAgent(id, req.workspaceId, orgId, question.trim());

    res.json({ agentId: id, output });
  } catch (err) { next(err); }
});

// ── Agent definition ──────────────────────────────────────────────────────────

// Must come after /stats, /routing, /sessions routes to avoid :id capturing them
router.get('/:id', (req, res) => {
  const def = getAgentDefinition(req.params.id);
  if (!def) return res.status(404).json({ error: { code: 'NOT_FOUND', message: `Agent '${req.params.id}' not found` } });
  res.json({ agent: def });
});

export default router;
