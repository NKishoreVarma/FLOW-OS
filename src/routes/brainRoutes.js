import express from 'express';
import { runReasoning }     from '../ai/reasoning/OperationalBrain.js';
import { explain }          from '../explainability/index.js';
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
import { getOperationalTimeline, getEntityContext } from '../services/brainTimelineService.js';
import { getGreeting }    from '../services/conversation/GreetingEngine.js';
import { getJoke }        from '../services/conversation/JokeService.js';
import { getLastContext }  from '../services/conversation/ConversationMemory.js';

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

  const {
    question, pageContext, entityId,
    healthScore, hasIncidents, isInboxZero,
    taskJustDone, deploymentSuccess, sprintCompleted,
  } = req.body;
  if (!question) return next(new ValidationError('question is required'));

  try {
    const result = await answerCopilotQuery(workspaceId, {
      question,
      pageContext,
      entityId,
      role:              req.user?.role || 'EMPLOYEE',
      healthScore,
      hasIncidents:      hasIncidents     ?? false,
      isInboxZero:       isInboxZero      ?? false,
      taskJustDone:      taskJustDone     ?? false,
      deploymentSuccess: deploymentSuccess ?? false,
      sprintCompleted:   sprintCompleted  ?? false,
      userName:          req.user?.fullName || req.user?.name || null,
    });
    const payload = { success: true, ...result };
    if (req.body.explain === true) {
      payload.explanation = await explain(result, { workspaceId, entityId, question });
    }
    // Natural Language Operations: if the response is actionable, include a plan.
    if (!payload.plan) {
      try {
        const { buildPlan } = await import('../execution/actionPlanner.js');
        const text = String(result.response || result.message || '').toLowerCase();
        const ACTIONABLE_PATTERNS = [
          /assign\s+\w+/i, /merge\s+(pr|pull request)/i, /approve\s+\w+/i,
          /create\s+(issue|ticket|pr)/i, /notify\s+\w+/i, /deploy\s+\w+/i,
          /reschedule\s+\w+/i, /review\s+(pr|pull request)/i,
        ];
        const isActionable = ACTIONABLE_PATTERNS.some((p) => p.test(text));
        if (isActionable && result.actions?.length) {
          const steps = result.actions
            .filter((a) => a.connector && a.actionType)
            .map((a) => ({ connector: a.connector, actionType: a.actionType, payload: a.payload || {}, title: a.label || a.title || a.actionType }))
            .slice(0, 3);
          if (steps.length) {
            payload.plan = buildPlan({ title: question, steps });
          }
        }
      } catch { /* NL bridge is best-effort — never breaks the copilot */ }
    }
    res.json(payload);
  } catch (err) {
    next(err);
  }
});

// ── Copilot — token-streamed (perceived speed; "the Brain feels alive") ────────
// SSE. Emits: status (progressive reasoning stages) → actions (ready before the
// prose) → token (true synthesis token stream) → done (full assembled answer +
// explanation). Excluded from the request timeout via the '/stream' suffix.
router.post('/copilot/stream', async (req, res, next) => {
  const workspaceId = req.headers['workspace-id'];
  if (!workspaceId) return next(new ValidationError('Missing workspace-id header'));
  const { question, pageContext, entityId } = req.body;
  if (!question) return next(new ValidationError('question is required'));

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  if (typeof res.flushHeaders === 'function') res.flushHeaders();

  let closed = false;
  req.on('close', () => { closed = true; });
  const send = (obj) => { if (!closed) res.write(`data: ${JSON.stringify(obj)}\n\n`); };

  send({ type: 'status', stage: 'start', message: 'Thinking…' });

  try {
    const brain = await runReasoning(
      workspaceId,
      { question, pageContext, entityId, role: req.user?.role || 'EMPLOYEE' },
      {
        onStatus:  (stage, message) => send({ type: 'status', stage, message }),
        onPartial: (kind, data) => {
          if (kind === 'actions')  send({ type: 'actions', actions: data?.recommended || data?.actions || [] });
          if (kind === 'evidence') send({ type: 'evidence', evidence: data || [] });
        },
        onToken:   (delta) => send({ type: 'token', delta }),
      },
    );

    let explanation = null;
    try { explanation = await explain(brain, { workspaceId, entityId, question }); } catch { /* explanation is optional */ }

    send({
      type: 'done',
      answer: brain.answer || brain.summary || '',
      confidence: brain.confidence?.score ?? brain.confidence ?? null,
      actions: brain.actionPlan?.recommended || brain.recommendedActions || [],
      explanation,
    });
    res.end();
  } catch (err) {
    send({ type: 'error', error: err.message });
    res.end();
  }
});

// ── Greeting (Phase 9.6) ─────────────────────────────────────────────────────
// Returns a personalized greeting for the current user session.
// Deduplicated per 6 hours via Redis. force=true bypasses dedup.

router.get('/greeting', async (req, res, next) => {
  const workspaceId = req.headers['workspace-id'];
  if (!workspaceId) return next(new ValidationError('Missing workspace-id header'));

  try {
    const greeting = await getGreeting({
      workspaceId,
      userId:        req.user?.id,
      userName:      req.user?.fullName || req.user?.name,
      healthScore:   req.query.healthScore ? Number(req.query.healthScore) : undefined,
      forceGenerate: req.query.force === 'true',
    });
    res.json({ success: true, greeting });
  } catch (err) {
    next(err);
  }
});

// ── Continue (Phase 9.7) ─────────────────────────────────────────────────────
// Resolve last conversation context — used when user says "continue" or "keep going".

router.get('/continue', async (req, res, next) => {
  const workspaceId = req.headers['workspace-id'];
  if (!workspaceId) return next(new ValidationError('Missing workspace-id header'));

  try {
    const lastCtx = await getLastContext(workspaceId);
    if (!lastCtx) {
      return res.json({
        success: true,
        hasContext: false,
        answer: "I don't have any recent context to continue from. What would you like to explore?",
      });
    }

    const continueAnswer = `Picking up where we left off.\n\n${lastCtx.summary}\n\nWant me to go deeper on this?`;
    return res.json({
      success:         true,
      hasContext:      true,
      answer:          continueAnswer,
      followUps:       lastCtx.followUps || [],
      followUpQuestion: 'Want me to go deeper on this?',
      domain:          lastCtx.domain || 'general',
      lastQuestion:    lastCtx.question || null,
    });
  } catch (err) {
    next(err);
  }
});

// ── Joke (Phase 9.6) ──────────────────────────────────────────────────────────
// Explicit joke request endpoint. Still blocked during incidents/critical contexts.

router.get('/joke', async (req, res, next) => {
  const workspaceId = req.headers['workspace-id'];
  if (!workspaceId) return next(new ValidationError('Missing workspace-id header'));

  try {
    const joke = await getJoke(workspaceId, {
      hasIncidents: req.query.hasIncidents === 'true',
    });
    res.json({ success: true, joke });
  } catch (err) {
    next(err);
  }
});

// ── Operational Reasoning (Phase 9.1) ────────────────────────────────────────

router.post('/reason', async (req, res, next) => {
  const workspaceId = req.headers['workspace-id'];
  if (!workspaceId) return next(new ValidationError('Missing workspace-id header'));

  const { question, pageContext, entityId, role } = req.body;
  if (!question?.trim()) return next(new ValidationError('question is required'));

  try {
    const result = await runReasoning(workspaceId, {
      question: question.trim(),
      pageContext,
      entityId,
      role: role || req.user?.role || 'EMPLOYEE',
    });
    const payload = { success: true, ...result };
    // Opt-in explanation envelope (adds latency, so off by default).
    if (req.body.explain === true || req.query.explain === 'true') {
      payload.explanation = await explain(result, {
        workspaceId, entityId, domain: result.reasoning?.domain, question: question.trim(),
      });
    }
    res.json(payload);
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

// ── Operational Timeline ─────────────────────────────────────────────────────

router.get('/timeline', async (req, res, next) => {
  const workspaceId = req.headers['workspace-id'];
  if (!workspaceId) return next(new ValidationError('Missing workspace-id header'));

  const hours = parseInt(req.query.hours) || 168;
  const limit = parseInt(req.query.limit) || 50;
  try {
    const timeline = await getOperationalTimeline(workspaceId, { hours, limit });
    res.json({ success: true, timeline });
  } catch (err) {
    next(err);
  }
});

// ── Cross-Capability Entity Context ──────────────────────────────────────────

router.get('/context/:entityId', async (req, res, next) => {
  const workspaceId = req.headers['workspace-id'];
  if (!workspaceId) return next(new ValidationError('Missing workspace-id header'));

  try {
    const context = await getEntityContext(workspaceId, req.params.entityId);
    res.json({ success: true, context });
  } catch (err) {
    next(err);
  }
});

export default router;

