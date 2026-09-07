import express from 'express';
import { getAllProviders } from '../ai/AIProviderFactory.js';
import { AIConfig } from '../ai/AIConfig.js';
import { ask, embed, stream, request as platformRequest } from '../ai/AIPlatform.js';
import { TaskType } from '../ai/types.js';
import { ValidationError } from '../core/errors/index.js';
import { getAllStats, getCostTrend } from '../ai/health/metricsCollector.js';
import { evaluate as evalProviders, abTest } from '../ai/evaluation/modelEval.js';
import { getRecentTraces, getActiveTraces }  from '../ai/observability/requestTracer.js';
import { getUsage as getRateLimitUsage }      from '../ai/model/rateLimiter.js';
import {
  getPrompt, createVersion, activate, deactivate, rollback,
  listVersions, listPromptNames,
} from '../ai/prompts/promptStore.js';

const router = express.Router();

// ── Provider health ────────────────────────────────────────────────────────────

/**
 * GET /api/ai/providers
 * Returns health status, latency, and available models for all providers.
 */
router.get('/providers', async (req, res, next) => {
  try {
    const providers = getAllProviders();
    const healths   = await Promise.all(providers.map(p => p.health()));
    res.json({
      success:         true,
      defaultProvider: AIConfig.defaultProvider,
      fallback:        AIConfig.fallbackProvider,
      routingStrategy: AIConfig.routingStrategy,
      taskRouting:     AIConfig.taskRouting,
      providers:       healths,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/ai/providers/:name
 * Health check for a single provider.
 */
router.get('/providers/:name', async (req, res, next) => {
  try {
    const all      = getAllProviders();
    const provider = all.find(p => p.name === req.params.name.toLowerCase());
    if (!provider) return res.status(404).json({ error: `Provider "${req.params.name}" not found` });
    const health = await provider.health();
    res.json({ success: true, ...health });
  } catch (err) {
    next(err);
  }
});

// ── Direct inference ───────────────────────────────────────────────────────────

/**
 * POST /api/ai/chat
 * Direct chat endpoint for testing the provider layer.
 */
router.post('/chat', async (req, res, next) => {
  const { prompt, taskType = TaskType.CHAT, provider: providerHint, maxTokens, temperature } = req.body;
  if (!prompt) return next(new ValidationError('prompt is required'));
  try {
    const result = await ask({
      taskType, messages: [{ role: 'user', content: prompt }],
      providerHint, maxTokens: maxTokens ?? 512, temperature: temperature ?? 0.3,
      workspaceId: req.headers['workspace-id'],
    });
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/ai/embed
 * Test embedding through the provider layer.
 */
router.post('/embed', async (req, res, next) => {
  const { text } = req.body;
  if (!text) return next(new ValidationError('text is required'));
  try {
    const result = await embed(text);
    res.json({ success: true, provider: result.provider, model: result.model,
      dim: result.values.length, preview: result.values.slice(0, 5), latencyMs: result.latencyMs });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/ai/stream
 * Server-sent events stream.
 */
router.post('/stream', async (req, res, next) => {
  const { prompt, taskType = TaskType.CHAT } = req.body;
  if (!prompt) return next(new ValidationError('prompt is required'));

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  try {
    for await (const delta of stream({ taskType, messages: [{ role: 'user', content: prompt }] })) {
      res.write(`data: ${JSON.stringify({ delta })}\n\n`);
    }
    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  } catch (err) {
    res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
    res.end();
  }
});

// ── Metrics ───────────────────────────────────────────────────────────────────

/**
 * GET /api/ai/metrics
 * Returns rolling metrics for all providers. Optional ?minutes=60.
 */
router.get('/metrics', async (req, res, next) => {
  try {
    const minutes = Number(req.query.minutes ?? 60);
    const stats   = getAllStats({ minutes });
    const trend   = await getCostTrend({ hours: 24 });
    res.json({ success: true, windowMinutes: minutes, providers: stats, costTrend: trend });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/ai/metrics/:provider
 * Metrics for a single provider.
 */
router.get('/metrics/:provider', async (req, res, next) => {
  try {
    const { getStats } = await import('../ai/health/metricsCollector.js');
    const minutes      = Number(req.query.minutes ?? 60);
    const stats        = getStats(req.params.provider.toLowerCase(), { minutes });
    res.json({ success: true, ...stats });
  } catch (err) {
    next(err);
  }
});

// ── Evaluation ────────────────────────────────────────────────────────────────

/**
 * POST /api/ai/evaluate
 * Run the same prompt through multiple providers and compare.
 * Body: { prompt, taskType?, providers?: string[], temperature? }
 */
router.post('/evaluate', async (req, res, next) => {
  const { prompt, taskType = TaskType.CHAT, providers, temperature = 0.3 } = req.body;
  if (!prompt) return next(new ValidationError('prompt is required'));
  try {
    const request    = { taskType, messages: [{ role: 'user', content: prompt }], temperature };
    const workspaceId = req.headers['workspace-id'];
    const result     = await evalProviders(request, { providers, workspaceId });
    res.json({ success: true, prompt, taskType, ...result });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/ai/evaluate/ab
 * A/B test two prompt variants against the same provider.
 * Body: { promptA, promptB, provider?, taskType?, runs? }
 */
router.post('/evaluate/ab', async (req, res, next) => {
  const { promptA, promptB, provider, taskType, runs } = req.body;
  if (!promptA || !promptB) return next(new ValidationError('promptA and promptB are required'));
  try {
    const result = await abTest(promptA, promptB, {
      provider, taskType, runs: runs ?? 3, workspaceId: req.headers['workspace-id'],
    });
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
});

// ── Prompt management ─────────────────────────────────────────────────────────

/**
 * GET /api/ai/prompts
 * List all prompt names with active version count.
 */
router.get('/prompts', async (req, res, next) => {
  try {
    const names = await listPromptNames();
    res.json({ success: true, prompts: names });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/ai/prompts/:name
 * List all versions for a prompt.
 */
router.get('/prompts/:name', async (req, res, next) => {
  try {
    const versions = await listVersions(req.params.name);
    if (versions.length === 0) return res.status(404).json({ error: `No prompt named "${req.params.name}"` });
    res.json({ success: true, name: req.params.name, versions });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/ai/prompts/:name/active
 * Retrieve the active prompt for a name (with optional variable interpolation).
 * Body: { variables: {} }
 */
router.post('/prompts/:name/render', async (req, res, next) => {
  try {
    const result = await getPrompt(req.params.name, req.body.variables ?? {});
    if (!result) return res.status(404).json({ error: `No active prompt for "${req.params.name}"` });
    res.json({ success: true, name: req.params.name, ...result });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/ai/prompts/:name/versions
 * Create a new version of a prompt (not active until activate() is called).
 */
router.post('/prompts/:name/versions', async (req, res, next) => {
  const { content, description, tags, abWeight } = req.body;
  if (!content) return next(new ValidationError('content is required'));
  try {
    const version = await createVersion(req.params.name, content, {
      description, tags, abWeight, createdBy: req.user?.id,
    });
    res.json({ success: true, ...version });
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/ai/prompts/:name/versions/:version/activate
 * Activate a specific version. ?exclusive=true deactivates all others first.
 */
router.patch('/prompts/:name/versions/:version/activate', async (req, res, next) => {
  try {
    const exclusive = req.query.exclusive === 'true';
    await activate(req.params.name, Number(req.params.version), { exclusive });
    res.json({ success: true, name: req.params.name, version: Number(req.params.version), active: true });
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/ai/prompts/:name/versions/:version/deactivate
 */
router.patch('/prompts/:name/versions/:version/deactivate', async (req, res, next) => {
  try {
    await deactivate(req.params.name, Number(req.params.version));
    res.json({ success: true, name: req.params.name, version: Number(req.params.version), active: false });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/ai/prompts/:name/rollback
 * Roll back to the previous inactive version.
 */
router.post('/prompts/:name/rollback', async (req, res, next) => {
  try {
    const version = await rollback(req.params.name);
    res.json({ success: true, name: req.params.name, rolledBackTo: version });
  } catch (err) {
    next(err);
  }
});

// ── Full platform request ─────────────────────────────────────────────────────

/**
 * POST /api/ai/request
 * Full 9-layer platform request. Use this for production AI calls that need
 * guardrails, context assembly, memory, and observability.
 */
router.post('/request', async (req, res, next) => {
  const { prompt, taskType, temperature, maxTokens, entityId, pageContext,
    providerHint, tools, skipGuardrails, skipContext, skipMemory } = req.body;
  if (!prompt && !req.body.messages) return next(new ValidationError('prompt or messages is required'));
  try {
    const result = await platformRequest({
      taskType:      taskType ?? TaskType.CHAT,
      prompt,
      messages:      req.body.messages,
      workspaceId:   req.headers['workspace-id'],
      userId:        req.user?.id,
      userRole:      req.workspaceRole ?? req.user?.role,
      temperature,
      maxTokens,
      entityId,
      pageContext,
      providerHint,
      tools,
      skipGuardrails: skipGuardrails === true,
      skipContext:    skipContext === true,
      skipMemory:     skipMemory === true,
    });
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
});

// ── Observability ─────────────────────────────────────────────────────────────

/**
 * GET /api/ai/traces
 * Recent completed request traces (last 200).
 */
router.get('/traces', (_req, res) => {
  res.json({ success: true, traces: getRecentTraces() });
});

/**
 * GET /api/ai/traces/active
 * Currently in-flight requests.
 */
router.get('/traces/active', (_req, res) => {
  res.json({ success: true, traces: getActiveTraces() });
});

/**
 * GET /api/ai/rate-limits
 * Current rate limit usage for the authenticated workspace.
 */
router.get('/rate-limits', async (req, res, next) => {
  const workspaceId = req.headers['workspace-id'];
  if (!workspaceId) return next(new ValidationError('workspace-id header required'));
  try {
    const usage = await getRateLimitUsage(workspaceId);
    res.json({ success: true, workspaceId, usage });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/ai/tools
 * List all registered tools (for UI and LLM system prompt generation).
 */
router.get('/tools', async (_req, res, next) => {
  try {
    const { getAllTools } = await import('../ai/tools/toolRegistry.js');
    res.json({ success: true, tools: getAllTools() });
  } catch (err) {
    next(err);
  }
});

export default router;
