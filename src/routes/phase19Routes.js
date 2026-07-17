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

export default router;
