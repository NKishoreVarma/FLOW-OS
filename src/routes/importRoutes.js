/**
 * FLOW OS — Universal Company Import Engine Routes
 */

import express from 'express';
import { executeImport, importHistory, validateImportPayload } from '../services/importEngineService.js';

const router = express.Router();

// Enforce workspace-id header check
router.use((req, res, next) => {
  const workspaceId = req.headers['workspace-id'] || req.headers['x-workspace-id'];
  if (!workspaceId) {
    return res.status(400).json({ error: 'Missing required workspace-id header for tenant isolation.' });
  }
  req.workspaceId = workspaceId;
  next();
});

/**
 * @route  POST /api/import
 * @desc   Trigger universal workspace bootstrap importing for a corporate tenant
 * @access Private
 */
router.post('/', async (req, res) => {
  const { payload } = req.body;

  if (!payload) {
    return res.status(400).json({ error: 'Missing import payload parameters.' });
  }

  try {
    const report = await executeImport(req.workspaceId, payload);
    res.json({ success: true, ...report });
  } catch (error) {
    console.error(`[Import Route] Ingestion error:`, error);
    res.status(500).json({ error: 'Universal import pipeline failed.', details: error.message });
  }
});

/**
 * @route  POST /api/import/validate
 * @desc   Dry-run payload check without performing database writes
 * @access Private
 */
router.post('/validate', (req, res) => {
  const { payload } = req.body;
  if (!payload) return res.status(400).json({ error: 'Payload parameter is required.' });

  const report = validateImportPayload(payload);
  res.json({ success: true, ...report });
});

/**
 * @route  GET /api/import/history
 * @desc   Retrieve execution history logs for workspace audits
 * @access Private
 */
router.get('/history', (req, res) => {
  const filtered = importHistory.filter(h => h.workspaceId === req.workspaceId);
  res.json({ success: true, history: filtered });
});

export default router;
