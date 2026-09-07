/**
 * /api/autonomy — Phase 13 Autonomous Enterprise Engine REST API
 *
 * 12 endpoints:
 *   GET    /status                      — engine health + per-workspace status
 *   POST   /start                       — start engine for this workspace
 *   POST   /stop                        — stop engine for this workspace
 *   POST   /pause                       — pause engine for this workspace
 *   POST   /resume                      — resume engine for this workspace
 *   POST   /cycle                       — trigger one-shot planning cycle
 *   GET    /runs                        — list recent autonomy runs
 *   GET    /metrics                     — collect 13 metric types
 *   GET    /goals                       — list goals
 *   POST   /goals                       — create a goal
 *   GET    /opportunities               — list opportunities
 *   GET    /policies                    — list autonomy policies
 *   POST   /policies                    — create / upsert an autonomy policy
 *   GET    /queue                       — dry-run planning cycle (read-only)
 *   GET    /executions                  — monitor status of autonomous executions
 *   POST   /executions/:id/pause        — pause one execution
 *   POST   /executions/:id/resume       — resume one execution
 *   POST   /executions/:id/cancel       — cancel one execution
 */

import { Router }                 from 'express';
import {
  startEngine, stopEngine,
  pauseEngine, resumeEngine,
  triggerCycle, getHealth, getMetrics, listRuns,
}                                 from '../autonomy/AutonomyEngine.js';
import {
  createGoal, listGoals,
}                                 from '../autonomy/GoalEngine.js';
import {
  listOpportunities,
}                                 from '../autonomy/OpportunityEngine.js';
import {
  createPolicy, listPolicies,
}                                 from '../autonomy/AutonomyPolicyEngine.js';
import {
  getMonitorStatus,
  pauseAutonomousExecution,
  resumeAutonomousExecution,
  cancelAutonomousExecution,
}                                 from '../autonomy/ExecutionMonitor.js';
import { AppError }               from '../core/errors/index.js';

const router = Router();

// All routes require authenticated workspace context (set by tenantIsolation)
const ws  = req => req.headers['workspace-id'];
const oid = req => req.workspace?.org?.id ?? req.user?.orgId ?? '';

// ── Engine lifecycle ──────────────────────────────────────────────────────────

router.get('/status', async (req, res, next) => {
  try {
    res.json(getHealth());
  } catch (err) { next(err); }
});

router.post('/start', async (req, res, next) => {
  try {
    const result = await startEngine(ws(req), oid(req));
    res.json(result);
  } catch (err) { next(err); }
});

router.post('/stop', async (req, res, next) => {
  try {
    const result = await stopEngine(ws(req));
    res.json(result);
  } catch (err) { next(err); }
});

router.post('/pause', async (req, res, next) => {
  try {
    const result = await pauseEngine(ws(req));
    res.json(result);
  } catch (err) { next(err); }
});

router.post('/resume', async (req, res, next) => {
  try {
    const result = await resumeEngine(ws(req));
    res.json(result);
  } catch (err) { next(err); }
});

// ── Planning ──────────────────────────────────────────────────────────────────

router.post('/cycle', async (req, res, next) => {
  try {
    const { dryRun = false } = req.body ?? {};
    const result = await triggerCycle(ws(req), oid(req), { dryRun });
    res.json(result);
  } catch (err) { next(err); }
});

router.get('/queue', async (req, res, next) => {
  try {
    const result = await triggerCycle(ws(req), oid(req), { dryRun: true });
    res.json(result);
  } catch (err) { next(err); }
});

// ── Runs & Metrics ────────────────────────────────────────────────────────────

router.get('/runs', async (req, res, next) => {
  try {
    const limit = Math.min(Number(req.query.limit ?? 20), 100);
    const runs  = await listRuns(ws(req), { limit });
    res.json({ runs });
  } catch (err) { next(err); }
});

router.get('/metrics', async (req, res, next) => {
  try {
    const days = Math.min(Number(req.query.days ?? 30), 90);
    const metrics = await getMetrics(ws(req), { days });
    res.json(metrics);
  } catch (err) { next(err); }
});

// ── Goals ─────────────────────────────────────────────────────────────────────

router.get('/goals', async (req, res, next) => {
  try {
    const { status, category, priority } = req.query;
    const goals = await listGoals(ws(req), { status, category, priority });
    res.json({ goals });
  } catch (err) { next(err); }
});

router.post('/goals', async (req, res, next) => {
  try {
    const goal = await createGoal(ws(req), oid(req), req.body);
    res.status(201).json(goal);
  } catch (err) { next(err); }
});

// ── Opportunities ─────────────────────────────────────────────────────────────

router.get('/opportunities', async (req, res, next) => {
  try {
    const { status, category } = req.query;
    const limit = Math.min(Number(req.query.limit ?? 50), 200);
    const opportunities = await listOpportunities(ws(req), { status, category, limit });
    res.json({ opportunities });
  } catch (err) { next(err); }
});

// ── Policies ──────────────────────────────────────────────────────────────────

router.get('/policies', async (req, res, next) => {
  try {
    const policies = await listPolicies(ws(req));
    res.json({ policies });
  } catch (err) { next(err); }
});

router.post('/policies', async (req, res, next) => {
  try {
    const policy = await createPolicy(ws(req), req.body);
    res.status(201).json(policy);
  } catch (err) { next(err); }
});

// ── Execution Monitor ─────────────────────────────────────────────────────────

router.get('/executions', async (req, res, next) => {
  try {
    const status = await getMonitorStatus(ws(req));
    res.json(status);
  } catch (err) { next(err); }
});

router.post('/executions/:id/pause', async (req, res, next) => {
  try {
    const result = await pauseAutonomousExecution(ws(req), req.params.id);
    res.json(result);
  } catch (err) { next(err); }
});

router.post('/executions/:id/resume', async (req, res, next) => {
  try {
    const result = await resumeAutonomousExecution(ws(req), req.params.id);
    res.json(result);
  } catch (err) { next(err); }
});

router.post('/executions/:id/cancel', async (req, res, next) => {
  try {
    const result = await cancelAutonomousExecution(ws(req), req.params.id);
    res.json(result);
  } catch (err) { next(err); }
});

export default router;
