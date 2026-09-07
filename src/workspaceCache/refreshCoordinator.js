/**
 * FLOW OS — Workspace Intelligence Cache · Refresh Coordinator (Phase 16.1)
 *
 * Keeps the cache warm. Rebuilds a workspace snapshot when relevant events fire
 * (debounced to coalesce bursts), on a cold read, on boot (active workspaces), and via
 * the 5-minute scheduled worker. The heavy build runs here in the background so reads
 * stay instant.
 */

import { buildSnapshot } from './snapshotBuilder.js';
import { setSnapshot, hasSnapshot } from './snapshotStore.js';
import { subscribe } from '../events/index.js';
import { prisma } from '../core/config/prisma.js';
import { logger } from '../utils/logger.js';

const DEBOUNCE_MS = Number(process.env.WIC_DEBOUNCE_MS) || 10000;
const timers = new Map();   // ws → timeout
const inflight = new Map(); // ws → Promise (dedupe concurrent builds)

// Event types that meaningfully change the workspace snapshot.
const REFRESH_ON = /MERGE_CONFLICT|CI_FAILED|PR_BLOCKED|EXECUTION_COMPLETED|EXECUTION_APPROVAL_REQUIRED|APPROVAL|NOTIFICATION|PREDICTION|INCIDENT|DEPLOY|MEETING|DECISION/i;

/** Rebuild now (deduped) and store. */
export async function refresh(workspaceId) {
  if (!workspaceId) return null;
  if (inflight.has(workspaceId)) return inflight.get(workspaceId);
  const p = (async () => {
    try {
      const snap = await buildSnapshot(workspaceId);
      await setSnapshot(workspaceId, snap);
      return snap;
    } catch (err) {
      logger.rag?.(`[WIC] refresh failed for ${workspaceId}: ${err.message}`);
      return null;
    } finally { inflight.delete(workspaceId); }
  })();
  inflight.set(workspaceId, p);
  return p;
}

/** Debounced refresh — coalesces a burst of events into one rebuild. */
export function scheduleRefresh(workspaceId) {
  if (!workspaceId) return;
  clearTimeout(timers.get(workspaceId));
  timers.set(workspaceId, setTimeout(() => { timers.delete(workspaceId); refresh(workspaceId); }, DEBOUNCE_MS));
}

/** For cold reads: if nothing is cached yet, kick off an async build (never blocks the read). */
export function ensureFresh(workspaceId) {
  if (workspaceId && !hasSnapshot(workspaceId) && !inflight.has(workspaceId)) refresh(workspaceId);
}

/** Register the event-bus subscriber that marks workspaces dirty. */
export function registerWicSubscriber() {
  subscribe('wic', {}, (event) => {
    const type = event.eventType || event.rawType || event.type || '';
    if (REFRESH_ON.test(type)) scheduleRefresh(event.workspaceId || event.payload?.workspaceId);
  }, { priority: 6 });
  logger.rag?.('[WIC] refresh subscriber registered');
}

/** Warm the cache for workspaces with recent activity (called on boot + by the cron). */
export async function warmActiveWorkspaces(limit = 25) {
  try {
    const rows = await prisma.$queryRawUnsafe(
      `SELECT DISTINCT workspace_id FROM (
         (SELECT workspace_id FROM notifications ORDER BY created_at DESC LIMIT 200)
         UNION SELECT workspace_id FROM pending_approvals
         UNION SELECT workspace_id FROM execution_records
       ) s LIMIT ${Math.min(limit, 100)}`,
    );
    const ids = (rows || []).map((r) => r.workspace_id).filter(Boolean);
    await Promise.allSettled(ids.map((ws) => refresh(ws)));
    logger.rag?.(`[WIC] warmed ${ids.length} active workspace(s)`);
    return ids;
  } catch (err) {
    logger.rag?.(`[WIC] warm skipped: ${err.message}`);
    return [];
  }
}

export default { refresh, scheduleRefresh, ensureFresh, registerWicSubscriber, warmActiveWorkspaces };
