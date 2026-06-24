/**
 * FLOW OS — Organization Routes
 */

import { Router } from 'express';
import { authorize } from '../../core/middleware/index.js';
import * as orgService from './org.service.js';

const router = Router();

/**
 * GET /api/org
 * Returns the authenticated user's organization.
 */
router.get('/', async (req, res, next) => {
  try {
    const org = await orgService.getOrganization(req.user.orgId);
    res.json(org);
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/org
 * Update org metadata. OWNER/ADMIN only.
 */
router.patch('/', authorize('OWNER', 'ADMIN'), async (req, res, next) => {
  try {
    const org = await orgService.updateOrganization(req.user.orgId, req.body);
    res.json(org);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/org/workspaces
 * List all workspaces in the org.
 */
router.get('/workspaces', async (req, res, next) => {
  try {
    const workspaces = await orgService.listWorkspaces(req.user.orgId);
    res.json(workspaces);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/org/workspaces
 * Create a new workspace. OWNER/ADMIN only.
 */
router.post('/workspaces', authorize('OWNER', 'ADMIN'), async (req, res, next) => {
  try {
    const workspace = await orgService.createWorkspace(req.user.orgId, req.body);
    res.status(201).json(workspace);
  } catch (err) {
    next(err);
  }
});

export default { routes: router, prefix: '/api/org' };
