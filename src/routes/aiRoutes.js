import express from 'express';
import { getAllProviders, getDefaultProvider, getFallbackProvider } from '../ai/AIProviderFactory.js';
import { AIConfig } from '../ai/AIConfig.js';
import { ask, embed, stream } from '../ai/BrainRouter.js';
import { TaskType } from '../ai/types.js';
import { ValidationError } from '../core/errors/index.js';

const router = express.Router();

/**
 * GET /api/ai/providers
 * Returns health status, latency, and available models for all providers.
 * No workspace-id required — this is infrastructure health, not workspace data.
 */
router.get('/providers', async (req, res, next) => {
  try {
    const providers = getAllProviders();
    const healths   = await Promise.all(providers.map(p => p.health()));
    res.json({
      success:         true,
      defaultProvider: AIConfig.defaultProvider,
      fallback:        AIConfig.fallbackProvider,
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
    const { getAllProviders: gp } = await import('../ai/AIProviderFactory.js');
    const all      = gp();
    const provider = all.find(p => p.name === req.params.name.toLowerCase());
    if (!provider) return res.status(404).json({ error: `Provider "${req.params.name}" not found` });
    const health = await provider.health();
    res.json({ success: true, ...health });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/ai/chat
 * Direct chat endpoint for testing the provider layer.
 * Respects AI_PROVIDER env var. Requires JWT (handled by authenticate middleware).
 */
router.post('/chat', async (req, res, next) => {
  const { prompt, taskType = TaskType.CHAT, provider: providerHint, maxTokens, temperature } = req.body;
  if (!prompt) return next(new ValidationError('prompt is required'));
  try {
    const result = await ask({
      taskType,
      messages: [{ role: 'user', content: prompt }],
      providerHint,
      maxTokens:   maxTokens   ?? 512,
      temperature: temperature ?? 0.3,
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
    res.json({
      success:  true,
      provider: result.provider,
      model:    result.model,
      dim:      result.values.length,
      preview:  result.values.slice(0, 5),
      latencyMs: result.latencyMs,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/ai/stream
 * Server-sent events stream for testing streaming responses.
 */
router.post('/stream', async (req, res, next) => {
  const { prompt, taskType = TaskType.CHAT } = req.body;
  if (!prompt) return next(new ValidationError('prompt is required'));

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  try {
    for await (const delta of stream({
      taskType,
      messages: [{ role: 'user', content: prompt }],
    })) {
      res.write(`data: ${JSON.stringify({ delta })}\n\n`);
    }
    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  } catch (err) {
    res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
    res.end();
  }
});

export default router;
