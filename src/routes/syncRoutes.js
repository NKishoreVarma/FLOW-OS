/**
 * Sync Management Routes — Phase 10.2
 *
 * Mounted at /api/sync (JWT + workspace-id required).
 *
 * Route map:
 *   POST /api/sync/:connectorId/start           — trigger immediate sync (all resource types)
 *   POST /api/sync/:connectorId/:resourceType/start — trigger narrow sync
 *   GET  /api/sync/:connectorId/status          — current sync state per resource type
 *   GET  /api/sync/history                      — sync history for workspace
 *   GET  /api/sync/schedules                    — list active schedules
 *   POST /api/sync/schedules/:connectorId       — activate schedules for a connector
 *   DELETE /api/sync/schedules/:connectorId     — deactivate schedules for a connector
 *   GET  /api/sync/dead-letters                 — list DLQ entries
 *   POST /api/sync/dead-letters/:id/retry       — re-enqueue a DLQ entry
 *   POST /api/sync/dead-letters/:id/dismiss     — dismiss a DLQ entry
 *   GET  /api/sync/conflicts                    — list sync conflicts
 *   GET  /api/sync/stats                        — aggregate stats for all connectors
 */

import express              from 'express';
import { AppError }         from '../core/errors/index.js';
import { enqueueSyncJob }   from '../config/syncQueue.js';
import {
  getSyncHistory,
  getSyncStats,
  listSyncedConnectors,
  getCursor,
}                           from '../services/integrations/SyncStateManager.js';
import {
  activateConnector,
  deactivateConnector,
  getSchedules,
}                           from '../services/sync/SyncScheduler.js';
import {
  listDeadLetters,
  retryDeadLetter,
  resolveDeadLetter,
  getDLQSummary,
}                           from '../services/sync/DeadLetterService.js';
import { listConflicts }    from '../services/sync/ConflictResolver.js';
import { DEFAULT_RESOURCE_TYPES } from '../services/sync/SyncEngine.js';

const router = express.Router();

// ── Workspace guard ───────────────────────────────────────────────────────────

router.use((req, res, next) => {
  const workspaceId = req.headers['workspace-id'] || req.tenantId;
  if (!workspaceId) {
    return res.status(400).json({ error: { code: 'MISSING_WORKSPACE', message: 'workspace-id header required' } });
  }
  req.workspaceId = workspaceId;
  next();
});

const SUPPORTED_CONNECTORS = new Set(['github', 'gmail', 'google-calendar', 'slack', 'notion', 'jira']);

function requireConnector(req, res, next) {
  const { connectorId } = req.params;
  if (!SUPPORTED_CONNECTORS.has(connectorId)) {
    return next(new AppError(`Unknown connector: ${connectorId}`, 400, 'UNKNOWN_CONNECTOR'));
  }
  next();
}

// ── POST /api/sync/:connectorId/start ────────────────────────────────────────

router.post('/:connectorId/start', requireConnector, async (req, res, next) => {
  try {
    const { connectorId } = req.params;
    const { workspaceId } = req;
    const types           = DEFAULT_RESOURCE_TYPES[connectorId] || ['default'];

    const jobs = await Promise.all(
      types.map(rt => enqueueSyncJob(workspaceId, connectorId, rt, { trigger: 'manual' })),
    );

    res.json({
      success: true,
      queued:  jobs.length,
      resourceTypes: types,
      message: `Sync started for ${connectorId} (${types.length} resource types)`,
    });
  } catch (err) { next(err); }
});

// ── POST /api/sync/:connectorId/:resourceType/start ──────────────────────────

router.post('/:connectorId/:resourceType/start', requireConnector, async (req, res, next) => {
  try {
    const { connectorId, resourceType } = req.params;
    await enqueueSyncJob(req.workspaceId, connectorId, resourceType, { trigger: 'manual' });
    res.json({ success: true, queued: true, connectorId, resourceType });
  } catch (err) { next(err); }
});

// ── GET /api/sync/:connectorId/status ─────────────────────────────────────────

router.get('/:connectorId/status', requireConnector, async (req, res, next) => {
  try {
    const { connectorId } = req.params;
    const { workspaceId } = req;
    const types = DEFAULT_RESOURCE_TYPES[connectorId] || ['default'];

    const statuses = await Promise.all(
      types.map(async rt => {
        const state = await getCursor(workspaceId, connectorId, rt);
        const stats = await getSyncStats(workspaceId, connectorId).catch(() => null);
        return { resourceType: rt, ...state, ...stats };
      }),
    );

    res.json({ success: true, connectorId, statuses });
  } catch (err) { next(err); }
});

// ── GET /api/sync/history ─────────────────────────────────────────────────────

router.get('/history', async (req, res, next) => {
  try {
    const connectorId    = req.query.connector   || null;
    const resourceType   = req.query.resourceType || null;
    const limit          = Math.min(parseInt(req.query.limit, 10) || 50, 200);

    if (!connectorId) {
      // All connectors for this workspace
      const connectors = await listSyncedConnectors(req.workspaceId);
      const histories  = await Promise.all(
        connectors.map(c => getSyncHistory(req.workspaceId, c.connector_id, { limit: 10 })),
      );
      const flat = histories.flat().sort((a, b) => new Date(b.started_at) - new Date(a.started_at));
      return res.json({ success: true, history: flat.slice(0, limit) });
    }

    const history = await getSyncHistory(req.workspaceId, connectorId, { limit, resourceType });
    res.json({ success: true, history });
  } catch (err) { next(err); }
});

// ── GET /api/sync/stats ───────────────────────────────────────────────────────

router.get('/stats', async (req, res, next) => {
  try {
    const connectors = await listSyncedConnectors(req.workspaceId);
    const dlqSummary = await getDLQSummary(req.workspaceId);
    const dlqMap     = Object.fromEntries(dlqSummary.map(r => [r.connector_id, r]));

    const stats = await Promise.all(
      connectors.map(async c => ({
        connectorId: c.connector_id,
        lastSyncAt:  c.last_sync_at,
        ...(await getSyncStats(req.workspaceId, c.connector_id) || {}),
        dlq: dlqMap[c.connector_id] || { pending: 0, retrying: 0 },
      })),
    );

    res.json({ success: true, stats });
  } catch (err) { next(err); }
});

// ── GET /api/sync/schedules ───────────────────────────────────────────────────

router.get('/schedules', async (req, res, next) => {
  try {
    const schedules = await getSchedules(req.workspaceId);
    res.json({ success: true, schedules });
  } catch (err) { next(err); }
});

// ── POST /api/sync/schedules/:connectorId ─────────────────────────────────────

router.post('/schedules/:connectorId', requireConnector, async (req, res, next) => {
  try {
    const { connectorId } = req.params;
    const intervalMs      = req.body?.intervalMs || null; // null = use default
    const result          = await activateConnector(req.workspaceId, connectorId, intervalMs);
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
});

// ── DELETE /api/sync/schedules/:connectorId ───────────────────────────────────

router.delete('/schedules/:connectorId', requireConnector, async (req, res, next) => {
  try {
    const result = await deactivateConnector(req.workspaceId, req.params.connectorId);
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
});

// ── GET /api/sync/dead-letters ────────────────────────────────────────────────

router.get('/dead-letters', async (req, res, next) => {
  try {
    const entries = await listDeadLetters(req.workspaceId, {
      limit:       parseInt(req.query.limit, 10) || 50,
      connectorId: req.query.connector || null,
    });
    res.json({ success: true, entries });
  } catch (err) { next(err); }
});

// ── POST /api/sync/dead-letters/:id/retry ────────────────────────────────────

router.post('/dead-letters/:id/retry', async (req, res, next) => {
  try {
    const result = await retryDeadLetter(req.workspaceId, req.params.id);
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
});

// ── POST /api/sync/dead-letters/:id/dismiss ──────────────────────────────────

router.post('/dead-letters/:id/dismiss', async (req, res, next) => {
  try {
    await resolveDeadLetter(req.workspaceId, req.params.id, 'dismissed');
    res.json({ success: true, dismissed: true });
  } catch (err) { next(err); }
});

// ── GET /api/sync/conflicts ───────────────────────────────────────────────────

router.get('/conflicts', async (req, res, next) => {
  try {
    const conflicts = await listConflicts(req.workspaceId, {
      limit:       parseInt(req.query.limit, 10) || 50,
      connectorId: req.query.connector || null,
    });
    res.json({ success: true, conflicts });
  } catch (err) { next(err); }
});

export default router;
