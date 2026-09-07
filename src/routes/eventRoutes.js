/**
 * Event Intelligence Routes — REST API for real-time company event intelligence.
 *
 * Mounted at /api/events in server.js.
 * All routes require JWT + workspace-id header.
 */

import { Router } from 'express';
import { getTimeline, getTimelineStats, resolveTimelineEvent } from '../services/events/WorkspaceTimelineEngine.js';
import { getFeed }                      from '../services/events/LiveFeedEngine.js';
import {
  publish, search as searchEvents, replay as replayEvents,
  getEvent, getMetrics, getCorrelationGroup,
} from '../events/index.js';

const router = Router();

// ── GET /api/events/feed ──────────────────────────────────────────────────────
// Live workspace feed (latest N events, formatted for display)
router.get('/feed', async (req, res, next) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 100);
    const feed  = await getFeed(req.tenantId, limit);
    res.json({ success: true, feed, count: feed.length });
  } catch (err) { next(err); }
});

// ── GET /api/events/timeline ──────────────────────────────────────────────────
// Full chronological operational timeline
router.get('/timeline', async (req, res, next) => {
  try {
    const limit     = Math.min(parseInt(req.query.limit, 10) || 50, 200);
    const hoursBack = Math.min(parseInt(req.query.hours, 10) || 24, 168);
    const type      = req.query.type || undefined;
    const priority  = req.query.priority || undefined;

    const events = await getTimeline(req.tenantId, { limit, hoursBack, type, priority });
    res.json({ success: true, events, count: events.length });
  } catch (err) { next(err); }
});

// ── GET /api/events/recent ────────────────────────────────────────────────────
// Recent high-priority events only (last 2 hours)
router.get('/recent', async (req, res, next) => {
  try {
    const events = await getTimeline(req.tenantId, { limit: 20, hoursBack: 2 });
    const high   = events.filter(e => ['critical', 'high'].includes(e.priority));
    res.json({ success: true, events: high, count: high.length });
  } catch (err) { next(err); }
});

// ── GET /api/events/stats ─────────────────────────────────────────────────────
// Event stats: counts by type and priority
router.get('/stats', async (req, res, next) => {
  try {
    const stats = await getTimelineStats(req.tenantId);
    res.json({ success: true, stats });
  } catch (err) { next(err); }
});

// ── GET /api/events/correlations/:groupId ─────────────────────────────────────
// Get a specific correlation group
router.get('/correlations/:groupId', async (req, res, next) => {
  try {
    const group = await getCorrelationGroup(req.tenantId, req.params.groupId);
    if (!group) return res.status(404).json({ error: 'Correlation group not found' });
    res.json({ success: true, group });
  } catch (err) { next(err); }
});

// ── POST /api/events/resolve/:eventId ────────────────────────────────────────
// Mark a timeline event as resolved
router.post('/resolve/:eventId', async (req, res, next) => {
  try {
    const updated = await resolveTimelineEvent(req.tenantId, req.params.eventId);
    if (!updated) return res.status(404).json({ error: 'Event not found in timeline' });
    res.json({ success: true, event: updated });
  } catch (err) { next(err); }
});

// ── POST /api/events/ingest ───────────────────────────────────────────────────
// Manually inject a raw event into the pipeline (for testing / custom integrations)
router.post('/ingest', async (req, res, next) => {
  try {
    const { source, type: rawType, payload } = req.body;
    if (!source || !payload) {
      return res.status(400).json({ error: 'source and payload are required' });
    }

    const result = await publish(source, rawType || 'custom', payload, { workspaceId: req.tenantId });
    res.json({ success: true, message: 'Event published to platform', ...result });
  } catch (err) { next(err); }
});

// ── GET /api/events/metrics ───────────────────────────────────────────────────
// Platform observability snapshot (throughput, latency, counters, per-type/connector).
router.get('/metrics', (req, res) => {
  res.json({ success: true, metrics: getMetrics() });
});

// ── GET /api/events/search ────────────────────────────────────────────────────
// Tenant-scoped structured + text search over the durable event store.
router.get('/search', async (req, res, next) => {
  try {
    const events = await searchEvents({
      workspaceId: req.tenantId,
      text:        req.query.q || undefined,
      eventType:   req.query.type || undefined,
      connector:   req.query.connector || undefined,
      limit:       Math.min(parseInt(req.query.limit, 10) || 50, 200),
    });
    res.json({ success: true, events, count: events.length });
  } catch (err) { next(err); }
});

// ── GET /api/events/event/:eventId ────────────────────────────────────────────
router.get('/event/:eventId', async (req, res, next) => {
  try {
    const event = await getEvent(req.tenantId, req.params.eventId);
    if (!event) return res.status(404).json({ error: 'Event not found' });
    res.json({ success: true, event });
  } catch (err) { next(err); }
});

// ── POST /api/events/replay ───────────────────────────────────────────────────
// Re-deliver stored events to subscribers (debugging / simulation). ADMIN+ only.
router.post('/replay', async (req, res, next) => {
  try {
    if (!['OWNER', 'ADMIN'].includes(req.workspaceRole)) {
      return res.status(403).json({ error: 'ADMIN or OWNER role required for replay' });
    }
    const { range, connector, eventType, actorId, correlationId, limit } = req.body || {};
    const result = await replayEvents({
      workspaceId: req.tenantId, range, connector, eventType, actorId, correlationId, limit,
    });
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
});

// ── GET /api/events/stream ────────────────────────────────────────────────────
// SSE endpoint for clients that can't use WebSocket
router.get('/stream', (req, res) => {
  const wsId = req.tenantId;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  // Send a heartbeat every 30s to keep the connection alive
  const heartbeat = setInterval(() => {
    res.write(`data: ${JSON.stringify({ type: 'heartbeat', ts: new Date().toISOString() })}\n\n`);
  }, 30_000);

  // Import socketService lazily to avoid circular deps
  let unsubscribe = null;
  import('../services/socketService.js').then(({ subscribeToWorkspace }) => {
    if (typeof subscribeToWorkspace === 'function') {
      unsubscribe = subscribeToWorkspace(wsId, (eventType, data) => {
        res.write(`data: ${JSON.stringify({ eventType, data })}\n\n`);
      });
    }
  }).catch(() => {});

  req.on('close', () => {
    clearInterval(heartbeat);
    if (unsubscribe) unsubscribe();
  });
});

export default router;
