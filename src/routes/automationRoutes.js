/**
 * Automation Platform REST API
 *
 * All routes require JWT + workspace-id header (standard FLOW tenant isolation).
 *
 * Event Registry (read-only):
 *   GET  /api/automation/events
 *   GET  /api/automation/events/search?q=
 *   GET  /api/automation/events/:id
 *   GET  /api/automation/events/:id/schema
 *
 * Trigger Registry:
 *   GET    /api/automation/triggers
 *   POST   /api/automation/triggers
 *   GET    /api/automation/triggers/:id
 *   PATCH  /api/automation/triggers/:id
 *   DELETE /api/automation/triggers/:id
 *   POST   /api/automation/triggers/:id/enable
 *   POST   /api/automation/triggers/:id/disable
 *   GET    /api/automation/triggers/:id/stats
 *
 * Execution History (Event Timeline):
 *   GET  /api/automation/history
 *   GET  /api/automation/history/:id
 *
 * Scheduled Jobs:
 *   GET    /api/automation/scheduled
 *   POST   /api/automation/scheduled
 *   DELETE /api/automation/scheduled/:id
 *
 * Platform Info:
 *   GET  /api/automation/status
 */

import { Router }          from 'express';
import { ValidationError } from '../core/errors/index.js';
import { eventRegistry }   from '../automation/eventRegistry/EventRegistry.js';
import {
  createTrigger, getTrigger, listTriggers, updateTrigger, deleteTrigger,
  invalidateTriggerCache,
} from '../automation/triggerRegistry/index.js';
import { listExecutions, getExecution } from '../automation/executionStore.js';
import { scheduleJob, removeScheduledJob } from '../automation/scheduler/Scheduler.js';
import { listJobs } from '../automation/scheduler/ScheduledJobStore.js';
import { getRateLimitStats } from '../automation/eventRouter/RateLimiter.js';
import { cacheStats }        from '../automation/triggerRegistry/TriggerRegistry.js';
import { isRunning }         from '../automation/AutomationEngine.js';

const router = Router();

// ── Event Registry ────────────────────────────────────────────────────────────

router.get('/events', (req, res) => {
  const { connector, category, source, priority } = req.query;
  const events = eventRegistry.list({ connector, category, source, priority });
  res.json({ total: events.length, events });
});

router.get('/events/search', (req, res) => {
  const { q, limit } = req.query;
  if (!q) throw new ValidationError('q is required');
  const results = eventRegistry.search(q, limit ? Number(limit) : 20);
  res.json({ total: results.length, results });
});

router.get('/events/:id', (req, res) => {
  const def = eventRegistry.resolve(req.params.id);   // throws EventNotFoundError (404)
  res.json(def);
});

router.get('/events/:id/schema', (req, res) => {
  const def = eventRegistry.resolve(req.params.id);
  res.json({ id: def.id, schema: def.schema, deduplication: def.deduplication, security: def.security });
});

// ── Trigger Registry ──────────────────────────────────────────────────────────

router.get('/triggers', async (req, res) => {
  const { eventId, enabled, limit, offset } = req.query;
  const workspaceId = req.tenantId;
  const triggers = await listTriggers(workspaceId, {
    eventId,
    enabled: enabled !== undefined ? enabled === 'true' : undefined,
    limit: limit ? Number(limit) : 100,
    offset: offset ? Number(offset) : 0,
  });
  res.json({ total: triggers.length, triggers });
});

router.post('/triggers', async (req, res) => {
  const workspaceId = req.tenantId;
  const { name, description, eventId, workflowId, enabled, conditions, paramMapping, priority, rateLimit } = req.body;
  const trigger = await createTrigger({
    workspaceId, name, description, eventId, workflowId,
    enabled, conditions, paramMapping, priority, rateLimit,
    createdBy: req.user?.id,
  });
  invalidateTriggerCache(eventId);
  res.status(201).json(trigger);
});

router.get('/triggers/:id', async (req, res) => {
  const trigger = await getTrigger(req.params.id, req.tenantId);
  if (!trigger) return res.status(404).json({ error: 'Trigger not found' });
  res.json(trigger);
});

router.patch('/triggers/:id', async (req, res) => {
  const patch = req.body;
  const trigger = await updateTrigger(req.params.id, req.tenantId, patch);
  if (!trigger) return res.status(404).json({ error: 'Trigger not found' });
  invalidateTriggerCache(trigger.eventId);
  res.json(trigger);
});

router.delete('/triggers/:id', async (req, res) => {
  const trigger = await getTrigger(req.params.id, req.tenantId);
  if (!trigger) return res.status(404).json({ error: 'Trigger not found' });
  await deleteTrigger(req.params.id, req.tenantId);
  invalidateTriggerCache(trigger.eventId);
  res.json({ deleted: true, id: req.params.id });
});

router.post('/triggers/:id/enable', async (req, res) => {
  const trigger = await updateTrigger(req.params.id, req.tenantId, { enabled: true });
  if (!trigger) return res.status(404).json({ error: 'Trigger not found' });
  invalidateTriggerCache(trigger.eventId);
  res.json(trigger);
});

router.post('/triggers/:id/disable', async (req, res) => {
  const trigger = await updateTrigger(req.params.id, req.tenantId, { enabled: false });
  if (!trigger) return res.status(404).json({ error: 'Trigger not found' });
  invalidateTriggerCache(trigger.eventId);
  res.json(trigger);
});

router.get('/triggers/:id/stats', async (req, res) => {
  const trigger = await getTrigger(req.params.id, req.tenantId);
  if (!trigger) return res.status(404).json({ error: 'Trigger not found' });
  const [rateLimitStats, recentExecutions] = await Promise.all([
    getRateLimitStats(trigger.id),
    listExecutions(req.tenantId, { triggerId: trigger.id, limit: 10 }),
  ]);
  res.json({ trigger, rateLimitStats, recentExecutions });
});

// ── Execution History ─────────────────────────────────────────────────────────

router.get('/history', async (req, res) => {
  const { triggerId, status, limit, offset } = req.query;
  const executions = await listExecutions(req.tenantId, {
    triggerId, status,
    limit:  limit  ? Number(limit)  : 50,
    offset: offset ? Number(offset) : 0,
  });
  res.json({ total: executions.length, executions });
});

router.get('/history/:id', async (req, res) => {
  const exec = await getExecution(req.params.id, req.tenantId);
  if (!exec) return res.status(404).json({ error: 'Execution not found' });
  res.json(exec);
});

// ── Scheduled Jobs ────────────────────────────────────────────────────────────

router.get('/scheduled', async (req, res) => {
  const { enabled } = req.query;
  const jobs = await listJobs(req.tenantId, {
    enabled: enabled !== undefined ? enabled === 'true' : undefined,
  });
  res.json({ total: jobs.length, jobs });
});

router.post('/scheduled', async (req, res) => {
  const { name, eventId, payload, scheduleType, cronExpression, delayMs, timezone, businessHoursOnly } = req.body;
  const job = await scheduleJob({
    workspaceId: req.tenantId, name, eventId, payload,
    scheduleType, cronExpression, delayMs, timezone, businessHoursOnly,
  });
  res.status(201).json(job);
});

router.delete('/scheduled/:id', async (req, res) => {
  const removed = await removeScheduledJob(req.params.id, req.tenantId);
  if (!removed) return res.status(404).json({ error: 'Scheduled job not found' });
  res.json({ deleted: true, id: req.params.id });
});

// ── Platform Status ───────────────────────────────────────────────────────────

router.get('/status', (req, res) => {
  res.json({
    engineRunning: isRunning(),
    eventRegistry: eventRegistry.stats(),
    triggerCache:  cacheStats(),
    uptime:        process.uptime(),
  });
});

export default router;
