/**
 * FLOW OS — Autonomous Operations Routes (Phase 19)
 *
 *   GET /api/autonomous/chief-of-staff    Top-5 NOW items + greeting
 *   GET /api/autonomous/templates         Available workflow templates
 *
 * Weekly-review and efficiency routes are added in Tasks 9 and 10.
 * All routes require JWT + workspace-id header (tenant isolation via
 * authenticate → tenantIsolation middleware chain in server.js).
 */

import express from 'express';
import { getChiefOfStaffBriefing } from '../autonomous/chiefOfStaffService.js';
import { listTemplates }            from '../autonomous/workflowTemplates.js';
import { getWeeklyReview }          from '../autonomous/weeklyReviewService.js';
import { getEfficiencyMetrics }     from '../analytics/pilotMetrics.js';

const router = express.Router();

// Tenant isolation guard — tenantIsolation middleware sets req.tenantId
router.use((req, res, next) => {
  if (!req.tenantId) {
    return res.status(400).json({ error: { code: 'MISSING_WORKSPACE', message: 'workspace-id header is required' } });
  }
  next();
});

const userOf = (req) => ({
  id: req.user?.id,
  email: req.user?.email,
  fullName: req.user?.fullName,
  role: req.workspaceRole || req.user?.role,
});

// ── GET /api/autonomous/chief-of-staff ────────────────────────────────────────
// Returns the top-5 NOW + NEXT work items as ActionCards + a greeting + summary.
router.get('/chief-of-staff', async (req, res, next) => {
  try {
    res.json(await getChiefOfStaffBriefing(req.tenantId, userOf(req)));
  } catch (err) {
    next(err);
  }
});

// ── GET /api/autonomous/templates ─────────────────────────────────────────────
// Returns the list of available workflow templates for the client to render.
router.get('/templates', (req, res) => {
  res.json({ templates: listTemplates() });
});

// ── GET /api/autonomous/weekly-review ─────────────────────────────────────────
// Returns the weekly executive review: velocity, execution success, risks, priorities.
router.get('/weekly-review', async (req, res, next) => {
  try {
    const days = Math.min(30, Math.max(1, Number(req.query.days) || 7));
    res.json(await getWeeklyReview(req.tenantId, { days }));
  } catch (err) { next(err); }
});

// ── GET /api/autonomous/efficiency ────────────────────────────────────────────
// Returns FLOW efficiency metrics: action acceptance rate, workflow completion,
// and execution success rate over the requested window (default 7 days, max 30).
router.get('/efficiency', async (req, res, next) => {
  try {
    const days = Math.min(30, Math.max(1, Number(req.query.days) || 7));
    res.json(await getEfficiencyMetrics(req.tenantId, days));
  } catch (err) { next(err); }
});

export default router;
