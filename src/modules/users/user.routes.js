/**
 * FLOW OS — User Management Routes
 */

import { Router } from 'express';
import { authorize } from '../../core/middleware/index.js';
import * as userService from './user.service.js';

const router = Router();

/**
 * GET /api/users
 * List all users in the org.
 */
router.get('/', async (req, res, next) => {
  try {
    const users = await userService.listUsers(req.user.orgId);
    res.json(users);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/users/:id
 * Get a specific user.
 */
router.get('/:id', async (req, res, next) => {
  try {
    const user = await userService.getUser(req.user.orgId, req.params.id);
    res.json(user);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/users/invite
 * Invite a new user to the org. OWNER/ADMIN only.
 */
router.post('/invite', authorize('OWNER', 'ADMIN'), async (req, res, next) => {
  try {
    const user = await userService.inviteUser(req.user.orgId, req.body);
    res.status(201).json(user);
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/users/:id
 * Update a user's role/status. OWNER/ADMIN only.
 */
router.patch('/:id', authorize('OWNER', 'ADMIN'), async (req, res, next) => {
  try {
    const user = await userService.updateUser(req.user.orgId, req.params.id, req.body);
    res.json(user);
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/users/:id
 * Remove a user from the org. OWNER only.
 */
router.delete('/:id', authorize('OWNER'), async (req, res, next) => {
  try {
    await userService.removeUser(req.user.orgId, req.params.id);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

export default { routes: router, prefix: '/api/users' };
