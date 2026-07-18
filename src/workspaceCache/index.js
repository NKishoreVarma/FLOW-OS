/**
 * FLOW OS — Workspace Intelligence Cache (Phase 16.1) — public API + lifecycle.
 *
 * `startWorkspaceCache()` wires the background machinery: the event-bus subscriber
 * (event-driven refresh), the boot warm, and the 5-minute scheduled refresh. Called
 * once from server boot. All heavy work is background; the UI reads via
 * snapshotStore / /api/workspace/*.
 */

import { registerWicSubscriber, warmActiveWorkspaces } from './refreshCoordinator.js';
import { logger } from '../utils/logger.js';

let interval = null;

export function startWorkspaceCache() {
  registerWicSubscriber();

  // Warm active workspaces shortly after boot (let the app finish starting first).
  setTimeout(() => { warmActiveWorkspaces().catch(() => {}); }, 4000);

  // Scheduled refresh every 5 minutes (WIC_CRON_MS override).
  const everyMs = Number(process.env.WIC_CRON_MS) || 5 * 60 * 1000;
  interval = setInterval(() => { warmActiveWorkspaces().catch(() => {}); }, everyMs);
  if (interval.unref) interval.unref();

  logger.rag?.(`[WIC] Workspace Intelligence Cache started (refresh every ${Math.round(everyMs / 1000)}s)`);
}

export function stopWorkspaceCache() {
  if (interval) { clearInterval(interval); interval = null; }
}

export { buildSnapshot } from './snapshotBuilder.js';
export { getSnapshot, peekSnapshot, setSnapshot } from './snapshotStore.js';
export { refresh, scheduleRefresh, ensureFresh, warmActiveWorkspaces } from './refreshCoordinator.js';

export default { startWorkspaceCache, stopWorkspaceCache };
