import express from 'express';
import { generateBriefing } from '../services/briefingEngine.js';
import { answerCopilotQuery } from '../services/copilotService.js';
import { queryAllMemory, getMemoryStats } from '../services/orgMemoryService.js';
import { getGraphStats, getNeighbors } from '../services/operationalGraphService.js';
import { ValidationError, NotFoundError, AuthorizationError } from '../core/errors/index.js';
import {
  createDecision, listDecisions, updateDecision, fromRecommendation
} from '../services/decisionEngine.js';
import {
  createRule, listRules, listRuns, toggleRule, deleteRule
} from '../services/automationEngine.js';
import {
  createGoal, listGoals, getGoal, updateGoal, addMilestone, completeMilestone, deleteGoal, evaluateGoal
} from '../services/goalTrackingService.js';
import { getProactiveRecommendations, recordRecommendationFeedback } from '../services/operationalIntelligenceService.js';

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

// ── Decisions ──────────────────────────────────────────────────────────────────

router.get('/decisions', async (req, res, next) => {
  const workspaceId = req.headers['workspace-id'];
  if (!workspaceId) return next(new ValidationError('Missing workspace-id header'));

  const hours = parseInt(req.query.hours) || 168;
  const limit = parseInt(req.query.limit) || 20;
  try {
    const decisions = await listDecisions(workspaceId, { hours, limit });
    res.json({ success: true, decisions });
  } catch (err) {
    next(err);
  }
});

router.post('/decisions', async (req, res, next) => {
  const workspaceId = req.headers['workspace-id'];
  if (!workspaceId) return next(new ValidationError('Missing workspace-id header'));

  try {
    const decision = req.body?.recommendation
      ? await fromRecommendation(workspaceId, req.workspace?.orgId, req.body.recommendation)
      : await createDecision(workspaceId, req.workspace?.orgId, req.body || {});
    res.status(201).json({ success: true, decision });
  } catch (err) {
    next(err);
  }
});

router.patch('/decisions/:id', async (req, res, next) => {
  const workspaceId = req.headers['workspace-id'];
  if (!workspaceId) return next(new ValidationError('Missing workspace-id header'));

  try {
    const decision = await updateDecision(workspaceId, req.params.id, req.body || {});
    res.json({ success: true, decision });
  } catch (err) {
    next(err);
  }
});

// ── Recommendations ────────────────────────────────────────────────────────────

router.get('/recommendations', async (req, res, next) => {
  const workspaceId = req.headers['workspace-id'];
  if (!workspaceId) return next(new ValidationError('Missing workspace-id header'));

  try {
    const recommendations = getProactiveRecommendations(workspaceId);
    res.json({ success: true, recommendations });
  } catch (err) {
    next(err);
  }
});

router.post('/recommendations/execute', async (req, res, next) => {
  const workspaceId = req.headers['workspace-id'];
  if (!workspaceId) return next(new ValidationError('Missing workspace-id header'));

  const { recommendation } = req.body || {};
  if (!recommendation) return next(new ValidationError('recommendation is required'));

  try {
    const decision = await fromRecommendation(workspaceId, req.workspace?.orgId, recommendation);
    if (recommendation.id) recordRecommendationFeedback(recommendation.id, 'accept');
    res.status(201).json({ success: true, decision });
  } catch (err) {
    next(err);
  }
});

// ── Automations ────────────────────────────────────────────────────────────────

router.get('/automations', async (req, res, next) => {
  const workspaceId = req.headers['workspace-id'];
  if (!workspaceId) return next(new ValidationError('Missing workspace-id header'));

  try {
    const [rules, runs] = await Promise.all([listRules(workspaceId), listRuns(workspaceId)]);
    res.json({ success: true, rules, runs });
  } catch (err) {
    next(err);
  }
});

router.post('/automations', async (req, res, next) => {
  const workspaceId = req.headers['workspace-id'];
  if (!workspaceId) return next(new ValidationError('Missing workspace-id header'));

  const role = req.workspaceRole;
  if (role !== 'ADMIN' && role !== 'OWNER') {
    return next(new AuthorizationError('Automation management requires ADMIN or OWNER role'));
  }

  const { name, trigger, conditions, actions } = req.body || {};
  if (!name || !trigger || !actions) return next(new ValidationError('name, trigger, and actions are required'));

  try {
    const rule = await createRule(workspaceId, req.workspace?.orgId, { name, trigger, conditions, actions });
    res.status(201).json({ success: true, rule });
  } catch (err) {
    next(err);
  }
});

router.patch('/automations/:id/toggle', async (req, res, next) => {
  const workspaceId = req.headers['workspace-id'];
  if (!workspaceId) return next(new ValidationError('Missing workspace-id header'));

  const role = req.workspaceRole;
  if (role !== 'ADMIN' && role !== 'OWNER') {
    return next(new AuthorizationError('Automation management requires ADMIN or OWNER role'));
  }

  const { enabled } = req.body || {};
  if (typeof enabled !== 'boolean') return next(new ValidationError('enabled must be a boolean'));

  try {
    const rule = await toggleRule(workspaceId, req.params.id, enabled);
    res.json({ success: true, rule });
  } catch (err) {
    next(err);
  }
});

router.delete('/automations/:id', async (req, res, next) => {
  const workspaceId = req.headers['workspace-id'];
  if (!workspaceId) return next(new ValidationError('Missing workspace-id header'));

  const role = req.workspaceRole;
  if (role !== 'ADMIN' && role !== 'OWNER') {
    return next(new AuthorizationError('Automation management requires ADMIN or OWNER role'));
  }

  try {
    await deleteRule(workspaceId, req.params.id);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// ── Goals ──────────────────────────────────────────────────────────────────────

router.get('/goals', async (req, res, next) => {
  const workspaceId = req.headers['workspace-id'];
  if (!workspaceId) return next(new ValidationError('Missing workspace-id header'));

  try {
    const goals = await listGoals(workspaceId, { status: req.query.status });
    res.json({ success: true, goals });
  } catch (err) {
    next(err);
  }
});

router.post('/goals', async (req, res, next) => {
  const workspaceId = req.headers['workspace-id'];
  if (!workspaceId) return next(new ValidationError('Missing workspace-id header'));

  const { title } = req.body || {};
  if (!title) return next(new ValidationError('title is required'));

  try {
    const goal = await createGoal(workspaceId, req.workspace?.orgId, req.body);
    res.status(201).json({ success: true, goal });
  } catch (err) {
    next(err);
  }
});

router.get('/goals/:id', async (req, res, next) => {
  const workspaceId = req.headers['workspace-id'];
  if (!workspaceId) return next(new ValidationError('Missing workspace-id header'));

  try {
    const goal = await getGoal(workspaceId, req.params.id);
    if (!goal) return next(new NotFoundError('Goal'));
    res.json({ success: true, goal });
  } catch (err) {
    next(err);
  }
});

router.patch('/goals/:id', async (req, res, next) => {
  const workspaceId = req.headers['workspace-id'];
  if (!workspaceId) return next(new ValidationError('Missing workspace-id header'));

  try {
    const goal = await updateGoal(workspaceId, req.params.id, req.body || {});
    res.json({ success: true, goal });
  } catch (err) {
    next(err);
  }
});

router.delete('/goals/:id', async (req, res, next) => {
  const workspaceId = req.headers['workspace-id'];
  if (!workspaceId) return next(new ValidationError('Missing workspace-id header'));

  try {
    await deleteGoal(workspaceId, req.params.id);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

router.post('/goals/:id/milestones', async (req, res, next) => {
  const workspaceId = req.headers['workspace-id'];
  if (!workspaceId) return next(new ValidationError('Missing workspace-id header'));

  const { title } = req.body || {};
  if (!title) return next(new ValidationError('title is required'));

  try {
    const milestone = await addMilestone(workspaceId, req.params.id, req.body);
    res.status(201).json({ success: true, milestone });
  } catch (err) {
    next(err);
  }
});

router.patch('/goals/:goalId/milestones/:milestoneId/complete', async (req, res, next) => {
  const workspaceId = req.headers['workspace-id'];
  if (!workspaceId) return next(new ValidationError('Missing workspace-id header'));

  try {
    const goal = await completeMilestone(workspaceId, req.params.goalId, req.params.milestoneId);
    res.json({ success: true, goal });
  } catch (err) {
    next(err);
  }
});

router.get('/goals/:id/evaluate', async (req, res, next) => {
  const workspaceId = req.headers['workspace-id'];
  if (!workspaceId) return next(new ValidationError('Missing workspace-id header'));

  try {
    const evaluation = await evaluateGoal(workspaceId, req.params.id);
    res.json({ success: true, evaluation });
  } catch (err) {
    next(err);
  }
});

export default router;
