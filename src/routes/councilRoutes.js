/**
 * FLOW OS — Executive Council Routes (Phase 15)
 *
 * JWT + workspace-id. The council orchestrates existing systems (Operational Brain,
 * Explainability, Prediction, Execution) — it adds no reasoning of its own.
 *
 *   POST /api/council/ask         route → parallel agents → debate → synthesis → one answer
 *   GET  /api/council/agents      list the executive council
 *   POST /api/council/agent/:id   query a single executive agent
 *   GET  /api/council/dashboard   6 domain health cards (Phase 15 M3)
 */

import express from 'express';
import { askCouncil, askAgent, askCouncilStream } from '../council/executiveOrchestrator.js';
import { AGENT_CONFIGS } from '../council/agents/registry.js';
import { getDashboard } from '../council/executiveDashboard.js';
import { ValidationError } from '../core/errors/index.js';

const router = express.Router();

router.use((req, res, next) => {
  if (!req.tenantId) {
    return res.status(400).json({ error: { code: 'MISSING_WORKSPACE', message: 'workspace-id header is required' } });
  }
  next();
});

// ── GET /api/council/agents ────────────────────────────────────────────────────
router.get('/agents', (req, res) => {
  res.json({
    agents: AGENT_CONFIGS.map((a) => ({ id: a.id, title: a.title, capabilities: a.capabilities })),
  });
});

// ── POST /api/council/ask ──────────────────────────────────────────────────────
router.post('/ask', async (req, res, next) => {
  try {
    const question = req.body.question || req.body.query;
    if (!question) throw new ValidationError('question is required');
    const result = await askCouncil(req.tenantId, question, { agents: req.body.agents });
    res.json(result);
  } catch (err) { next(err); }
});

// ── POST /api/council/ask/stream — SSE: agents working → findings → synthesis ──
router.post('/ask/stream', async (req, res, next) => {
  try {
    const question = req.body.question || req.body.query;
    if (!question) throw new ValidationError('question is required');

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    if (typeof res.flushHeaders === 'function') res.flushHeaders();

    let closed = false;
    req.on('close', () => { closed = true; });
    const emit = (obj) => { if (!closed) res.write(`data: ${JSON.stringify(obj)}\n\n`); };

    await askCouncilStream(req.tenantId, question, emit, { agents: req.body.agents });
    res.end();
  } catch (err) {
    if (res.headersSent) { res.write(`data: ${JSON.stringify({ type: 'error', error: err.message })}\n\n`); res.end(); }
    else next(err);
  }
});

// ── POST /api/council/agent/:id ────────────────────────────────────────────────
router.post('/agent/:id', async (req, res, next) => {
  try {
    const question = req.body.question || req.body.query;
    if (!question) throw new ValidationError('question is required');
    const finding = await askAgent(req.tenantId, req.params.id, question);
    res.json({ finding });
  } catch (err) {
    if (/Unknown agent/.test(err.message)) return res.status(404).json({ error: { code: 'UNKNOWN_AGENT', message: err.message } });
    next(err);
  }
});

// ── GET /api/council/dashboard ─────────────────────────────────────────────────
router.get('/dashboard', async (req, res, next) => {
  try {
    res.json(await getDashboard(req.tenantId));
  } catch (err) { next(err); }
});

export default router;
