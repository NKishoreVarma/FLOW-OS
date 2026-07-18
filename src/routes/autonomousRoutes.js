/**
 * Autonomous Workspace Routes — REST API for FLOW's proactive intelligence.
 *
 * All routes require JWT + workspace-id header (tenant isolation).
 * Mounted at /api/workspace in server.js.
 */

import { Router } from 'express';
import { getMorningBrief, compileMorningBrief } from '../services/autonomous/MorningBriefService.js';
import { getDigest }                           from '../services/autonomous/WorkspaceDigestService.js';
import { getInsights }                         from '../services/autonomous/WorkspaceInsightService.js';
import { getDailyPlan }                        from '../services/autonomous/DailyPlanningEngine.js';
import { generateProactiveRecommendations }    from '../services/autonomous/ProactiveRecommendationEngine.js';
import { triggerAnalysis }                     from '../services/autonomous/BackgroundAnalysisScheduler.js';
import { dispatchCapabilities }                from '../ai/reasoning/CapabilityDispatcher.js';
import { buildPlanForAll }                     from '../ai/reasoning/CapabilityPlanner.js';
import { AppError }                            from '../core/errors/index.js';

const router = Router();

// ── GET /api/workspace/brief ──────────────────────────────────────────────────
// Return today's compiled morning brief. Compiles on-demand if not available.
router.get('/brief', async (req, res, next) => {
  try {
    const wsId  = req.tenantId;
    const orgId = req.user.orgId;

    let brief = await getMorningBrief(wsId);
    if (!brief) {
      brief = await compileMorningBrief(wsId, orgId);
    }

    res.json({ success: true, brief });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/workspace/digest ─────────────────────────────────────────────────
// Return the live workspace event digest (last N entries).
router.get('/digest', async (req, res, next) => {
  try {
    const limit  = Math.min(parseInt(req.query.limit, 10) || 30, 50);
    const digest = await getDigest(req.tenantId, limit);
    res.json({ success: true, digest, count: digest.length });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/workspace/insights ───────────────────────────────────────────────
// Return the latest workspace insights (trends, anomalies, alerts).
router.get('/insights', async (req, res, next) => {
  try {
    const insights = await getInsights(req.tenantId);
    res.json({ success: true, insights, count: insights.length });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/workspace/plan ───────────────────────────────────────────────────
// Return today's generated daily plan.
router.get('/plan', async (req, res, next) => {
  try {
    const plan = await getDailyPlan(req.tenantId);
    if (!plan) {
      return res.json({ success: true, plan: null, message: 'No plan generated yet for today. Trigger /api/workspace/trigger to generate one.' });
    }
    res.json({ success: true, plan });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/workspace/recommendations ───────────────────────────────────────
// Return fresh proactive recommendations based on live capability data.
router.get('/recommendations', async (req, res, next) => {
  try {
    const wsId = req.tenantId;
    const plan = buildPlanForAll();
    const caps = await dispatchCapabilities(wsId, plan, { domain: 'general', question: 'recommendations' });
    const recs = await generateProactiveRecommendations(wsId, caps);
    res.json({ success: true, recommendations: recs, count: recs.length });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/workspace/trigger ───────────────────────────────────────────────
// Manually trigger an analysis cycle for this workspace.
router.post('/trigger', async (req, res, next) => {
  try {
    const wsId  = req.tenantId;
    const orgId = req.user.orgId;
    await triggerAnalysis(wsId, orgId);
    res.json({ success: true, message: 'Analysis cycle queued. Results will stream via WebSocket.' });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/workspace/status ─────────────────────────────────────────────────
// Quick status: what autonomous data is available for this workspace right now.
router.get('/status', async (req, res, next) => {
  try {
    const wsId = req.tenantId;

    const [brief, digest, insights, plan] = await Promise.all([
      getMorningBrief(wsId),
      getDigest(wsId, 1),
      getInsights(wsId),
      getDailyPlan(wsId),
    ]);

    res.json({
      success: true,
      status: {
        morningBriefReady:    Boolean(brief),
        morningBriefAt:       brief?.generatedAt || null,
        digestEntries:        digest.length > 0,
        insightCount:         insights.length,
        dailyPlanReady:       Boolean(plan),
        dailyPlanDate:        plan?.date || null,
      },
    });
  } catch (err) {
    next(err);
  }
});

export default router;
