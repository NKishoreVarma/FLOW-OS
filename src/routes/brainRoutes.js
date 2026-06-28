import express from 'express';
import { generateBriefing } from '../services/briefingEngine.js';
import { answerCopilotQuery } from '../services/copilotService.js';
import { queryAllMemory, getMemoryStats } from '../services/orgMemoryService.js';
import { getGraphStats, getNeighbors } from '../services/operationalGraphService.js';
import { ValidationError } from '../core/errors/index.js';

const router = express.Router();

// ── Briefing ─────────────────────────────────────────────────────────────────

router.get('/briefing', async (req, res, next) => {
  const workspaceId = req.headers['workspace-id'];
  if (!workspaceId) return next(new ValidationError('Missing workspace-id header'));

  const role = (req.query.role || 'EMPLOYEE').toUpperCase();
  try {
    const briefing = await generateBriefing(workspaceId, req.workspace?.orgId, role);
    res.json({ success: true, briefing });
  } catch (err) {
    next(err);
  }
});

// ── Copilot ───────────────────────────────────────────────────────────────────

router.post('/copilot', async (req, res, next) => {
  const workspaceId = req.headers['workspace-id'];
  if (!workspaceId) return next(new ValidationError('Missing workspace-id header'));

  const { question, pageContext, entityId } = req.body;
  if (!question) return next(new ValidationError('question is required'));

  try {
    const result = await answerCopilotQuery(workspaceId, { question, pageContext, entityId });
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
});

// ── Organizational Memory ─────────────────────────────────────────────────────

router.get('/memory', async (req, res, next) => {
  const workspaceId = req.headers['workspace-id'];
  if (!workspaceId) return next(new ValidationError('Missing workspace-id header'));

  const hours = parseInt(req.query.hours) || 168;
  try {
    const [records, stats] = await Promise.all([
      queryAllMemory(workspaceId, { hours, limit: 50 }),
      getMemoryStats(workspaceId)
    ]);
    res.json({ success: true, records, stats });
  } catch (err) {
    next(err);
  }
});

// ── Operational Graph ─────────────────────────────────────────────────────────

router.get('/graph', async (req, res, next) => {
  const workspaceId = req.headers['workspace-id'];
  if (!workspaceId) return next(new ValidationError('Missing workspace-id header'));

  const entityId = req.query.entityId;
  try {
    const [stats, neighbors] = await Promise.all([
      getGraphStats(workspaceId),
      entityId ? getNeighbors(workspaceId, entityId) : Promise.resolve([])
    ]);
    res.json({ success: true, stats, neighbors });
  } catch (err) {
    next(err);
  }
});

export default router;
