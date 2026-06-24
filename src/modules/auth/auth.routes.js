/**
 * FLOW OS — Authentication Routes
 */

import { Router } from 'express';
import * as authService from './auth.service.js';

const router = Router();

/**
 * POST /api/auth/signup
 * Body: { email, password, fullName, orgName }
 */
router.post('/signup', async (req, res, next) => {
  try {
    const result = await authService.signup(req.body);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/auth/login
 * Body: { email, password }
 */
router.post('/login', async (req, res, next) => {
  try {
    const result = await authService.login(req.body);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

export default { routes: router, prefix: '/api/auth' };
