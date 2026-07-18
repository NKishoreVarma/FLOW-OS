/**
 * FLOW OS — Policy Management Routes
 *
 * CRUD for governance Policy records.
 * Writing policies (create/update/delete) is restricted to OWNER.
 * Reading policies is available to OWNER and ADMIN.
 *
 * Route map:
 *   GET    /api/policies          — list policies for org+workspace
 *   POST   /api/policies          — create a new policy (OWNER only)
 *   GET    /api/policies/:id      — get a single policy
 *   PUT    /api/policies/:id      — update a policy (OWNER only)
 *   PATCH  /api/policies/:id/toggle — enable/disable (OWNER only)
 *   DELETE /api/policies/:id      — delete a policy (OWNER only)
 */

import express from 'express';
import { authorize }        from '../core/middleware/index.js';
import {
  listPolicies,
  getPolicy,
  createPolicy,
  updatePolicy,
  deletePolicy,
  togglePolicy,
} from '../core/governance/policyStore.js';
import { ValidationError }  from '../core/errors/index.js';

const router = express.Router();

// ── GET /api/policies ─────────────────────────────────────────────────────────
router.get('/', authorize('OWNER', 'ADMIN'), async (req, res, next) => {
  try {
    const includeDisabled = req.query.includeDisabled === 'true';
    const workspaceId     = req.tenantId || undefined;

    const policies = await listPolicies({
      orgId: req.user.orgId,
      workspaceId,
      includeDisabled,
    });

    res.json({ policies, total: policies.length });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/policies ────────────────────────────────────────────────────────
router.post('/', authorize('OWNER'), async (req, res, next) => {
  try {
    const {
      workspaceId,
      connectorId,
      capability,
      actionType,
      subjectRole,
      subjectUserId,
      effect,
      conditions,
      priority,
      description,
    } = req.body;

    if (!effect) throw new ValidationError('effect is required (ALLOW | DENY | REQUIRE_APPROVAL)');

    const policy = await createPolicy({
      orgId:         req.user.orgId,
      workspaceId:   workspaceId   ?? req.tenantId ?? null,
      connectorId,
      capability,
      actionType,
      subjectRole,
      subjectUserId,
      effect,
      conditions:    conditions    ?? {},
      priority:      priority      ?? 100,
      description,
      createdBy:     req.user.id,
    });

    res.status(201).json(policy);
  } catch (err) {
    next(err);
  }
});

// ── GET /api/policies/:id ─────────────────────────────────────────────────────
router.get('/:id', authorize('OWNER', 'ADMIN'), async (req, res, next) => {
  try {
    const policy = await getPolicy(req.params.id, req.user.orgId);
    res.json(policy);
  } catch (err) {
    next(err);
  }
});

// ── PUT /api/policies/:id ─────────────────────────────────────────────────────
router.put('/:id', authorize('OWNER'), async (req, res, next) => {
  try {
    const policy = await updatePolicy(req.params.id, req.user.orgId, req.body);
    res.json(policy);
  } catch (err) {
    next(err);
  }
});

// ── PATCH /api/policies/:id/toggle ────────────────────────────────────────────
router.patch('/:id/toggle', authorize('OWNER'), async (req, res, next) => {
  try {
    const { enabled } = req.body;
    if (typeof enabled !== 'boolean') {
      throw new ValidationError('enabled must be a boolean');
    }
    const policy = await togglePolicy(req.params.id, req.user.orgId, enabled);
    res.json(policy);
  } catch (err) {
    next(err);
  }
});

// ── DELETE /api/policies/:id ──────────────────────────────────────────────────
router.delete('/:id', authorize('OWNER'), async (req, res, next) => {
  try {
    await deletePolicy(req.params.id, req.user.orgId);
    res.json({ deleted: true, id: req.params.id });
  } catch (err) {
    next(err);
  }
});

export default router;
