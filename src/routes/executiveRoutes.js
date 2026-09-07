/**
 * Executive Operations Intelligence API
 *
 * Mounted at /api/executive in server.js (after authenticate + tenantIsolation).
 * All routes require JWT + workspace-id header.
 *
 * GET  /api/executive/brief          — executive brief (?type=morning|daily|weekly|monthly|quarterly|board|investor&role=CTO&llm=true)
 * GET  /api/executive/health         — organization health (?domain=engineering&window=30)
 * GET  /api/executive/kpis           — KPI report (?window=30&kpi=deployment_frequency)
 * GET  /api/executive/risks          — risk report (?window=30&category=security_risk)
 * GET  /api/executive/recommendations — recommendations (?window=30&limit=20)
 * GET  /api/executive/timeline       — operational timeline (?window=30&category=deployments&limit=100)
 */

import { Router }           from 'express';
import { ValidationError }  from '../core/errors/index.js';
import {
  generateBrief,
  BRIEF_TYPES,
  computeHealth,
  computeDomainHealth,
  computeKPIs,
  computeKPI,
  KPI_NAMES,
  detectRisks,
  detectCategoryRisk,
  RISK_CATEGORIES,
  generateRecommendations,
  buildTimeline,
} from '../executive/index.js';

const router = Router();

// Workspace guard
router.use((req, res, next) => {
  const workspaceId = req.headers['workspace-id'] || req.tenantId;
  if (!workspaceId) return res.status(400).json({ error: { code: 'MISSING_WORKSPACE', message: 'workspace-id header is required' } });
  req.workspaceId = workspaceId;
  next();
});

// ── GET /api/executive/brief ──────────────────────────────────────────────────

router.get('/brief', async (req, res, next) => {
  try {
    const {
      type   = 'morning',
      role,
      llm    = 'true',
      window = '30',
    } = req.query;

    if (!BRIEF_TYPES.includes(type)) {
      throw new ValidationError(`Invalid type. Valid values: ${BRIEF_TYPES.join(', ')}`);
    }

    const brief = await generateBrief(req.workspaceId, {
      type,
      role: role || null,
      useLLM: llm !== 'false',
    });

    res.json(brief);
  } catch (err) { next(err); }
});

// ── GET /api/executive/health ─────────────────────────────────────────────────

router.get('/health', async (req, res, next) => {
  try {
    const { domain, window = '30' } = req.query;
    const windowDays = Math.min(Math.max(parseInt(window, 10) || 30, 1), 90);

    const report = domain
      ? await computeDomainHealth(req.workspaceId, domain, { windowDays })
      : await computeHealth(req.workspaceId, { windowDays });

    res.json(report);
  } catch (err) {
    if (err.message?.includes('Unknown domain')) return res.status(400).json({ error: { code: 'INVALID_DOMAIN', message: err.message } });
    next(err);
  }
});

// ── GET /api/executive/kpis ───────────────────────────────────────────────────

router.get('/kpis', async (req, res, next) => {
  try {
    const { kpi, window = '30' } = req.query;
    const windowDays = Math.min(Math.max(parseInt(window, 10) || 30, 1), 90);

    if (kpi) {
      if (!KPI_NAMES.includes(kpi)) {
        throw new ValidationError(`Unknown KPI: ${kpi}. Valid: ${KPI_NAMES.join(', ')}`);
      }
      const result = await computeKPI(req.workspaceId, kpi);
      return res.json({ workspaceId: req.workspaceId, kpi: result });
    }

    const report = await computeKPIs(req.workspaceId, { windowDays });
    res.json(report);
  } catch (err) { next(err); }
});

// ── GET /api/executive/risks ──────────────────────────────────────────────────

router.get('/risks', async (req, res, next) => {
  try {
    const { category, window = '30', predictions = 'true' } = req.query;
    const windowDays = Math.min(Math.max(parseInt(window, 10) || 30, 1), 90);

    if (category) {
      if (!RISK_CATEGORIES.includes(category)) {
        throw new ValidationError(`Unknown category: ${category}. Valid: ${RISK_CATEGORIES.join(', ')}`);
      }
      const risks = await detectCategoryRisk(req.workspaceId, category);
      return res.json({ workspaceId: req.workspaceId, category, risks });
    }

    const report = await detectRisks(req.workspaceId, {
      windowDays,
      includePredictions: predictions !== 'false',
    });
    res.json(report);
  } catch (err) { next(err); }
});

// ── GET /api/executive/recommendations ───────────────────────────────────────

router.get('/recommendations', async (req, res, next) => {
  try {
    const { window = '30', limit = '20' } = req.query;
    const windowDays = Math.min(Math.max(parseInt(window, 10) || 30, 1), 90);
    const limitN     = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 50);

    const report = await generateRecommendations(req.workspaceId, { windowDays, limit: limitN });
    res.json(report);
  } catch (err) { next(err); }
});

// ── GET /api/executive/timeline ───────────────────────────────────────────────

router.get('/timeline', async (req, res, next) => {
  try {
    const { window = '30', category, limit = '100' } = req.query;
    const windowDays = Math.min(Math.max(parseInt(window, 10) || 30, 1), 90);
    const limitN     = Math.min(Math.max(parseInt(limit, 10) || 100, 1), 500);

    const report = await buildTimeline(req.workspaceId, {
      windowDays,
      limit: limitN,
      category: category || null,
    });
    res.json(report);
  } catch (err) { next(err); }
});

export default router;
