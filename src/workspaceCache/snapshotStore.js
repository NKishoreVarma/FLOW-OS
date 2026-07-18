/**
 * FLOW OS — Workspace Intelligence Cache · Store (Phase 16.1)
 *
 * Sub-millisecond in-memory reads (so the UI is <100ms), write-through to Redis
 * (`wic:snapshot:{ws}`, TTL) for durability across restarts and sharing across
 * instances. Reads NEVER trigger a synchronous build — a cold miss returns null and
 * the caller schedules an async refresh.
 */

import redis from '../config/redis.js';
import { logger } from '../utils/logger.js';

const mem = new Map(); // workspaceId → snapshot
const TTL_SECONDS = Number(process.env.WIC_TTL_SECONDS) || 3600; // 1h; the 5-min cron keeps it fresh
const key = (ws) => `wic:snapshot:${ws}`;

/** Fast read: memory first, then Redis (hydrating memory). Returns null on a cold miss. */
export async function getSnapshot(workspaceId) {
  const hit = mem.get(workspaceId);
  if (hit) return hit;
  try {
    const raw = await redis.get(key(workspaceId));
    if (raw) { const snap = JSON.parse(raw); mem.set(workspaceId, snap); return snap; }
  } catch { /* Redis optional — memory is the source of truth */ }
  return null;
}

/** Synchronous memory-only read (guaranteed no I/O) — for the hottest paths. */
export function peekSnapshot(workspaceId) {
  return mem.get(workspaceId) || null;
}

/** Write-through: memory + Redis. */
export async function setSnapshot(workspaceId, snapshot) {
  mem.set(workspaceId, snapshot);
  try { await redis.set(key(workspaceId), JSON.stringify(snapshot), 'EX', TTL_SECONDS); }
  catch (err) { logger.rag?.(`[WIC] Redis write skipped: ${err.message}`); }
  return snapshot;
}

export function hasSnapshot(workspaceId) {
  return mem.has(workspaceId);
}

export function clearSnapshot(workspaceId) {
  if (workspaceId) { mem.delete(workspaceId); redis.del?.(key(workspaceId)).catch(() => {}); }
  else mem.clear();
}

export function cachedWorkspaceIds() {
  return [...mem.keys()];
}

export default { getSnapshot, peekSnapshot, setSnapshot, hasSnapshot, clearSnapshot, cachedWorkspaceIds };
