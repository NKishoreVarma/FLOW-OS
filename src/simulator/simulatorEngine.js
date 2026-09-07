/**
 * FLOW OS — Living Workspace Simulator · Engine (Sprint 5)
 *
 * Makes a workspace feel alive so FLOW always has meaningful, coherent work to reason
 * about. It does NOT invent a new data path — it drives the existing Event Platform,
 * Governance, and Notification engines with causally-linked scenarios.
 *
 *   seedHistory(ws, ctx, { days })  → backfills ~6 months of past-dated causal chains,
 *                                     then plants the CURRENT pending work (approvals +
 *                                     notifications) that lights up Workday / Morning / Inbox.
 *   tick(ws, ctx)                   → one fresh live beat (new activity + signal).
 *   start() / stop()                → dev-only background heartbeat, gated by SIMULATOR_ENABLED.
 *
 * Dev-only. Never enabled in production.
 */

import { HISTORY_SCENARIOS, LIVE_SCENARIOS } from './scenarios.js';
import { pick } from './personas.js';
import { logger } from '../utils/logger.js';

const DAY_MS = 24 * 60 * 60 * 1000;

// Deterministic-ish PRNG so a re-seed is reproducible per workspace (debuggable demos).
function makeRng(seedStr) {
  let h = 2166136261;
  for (const c of String(seedStr)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
  return () => { h += 0x6d2b79f5; let t = h; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/**
 * Backfill history + plant current work.
 * ctx = { ws, orgId, requesterId, userEmail }
 */
export async function seedHistory(ctx, { days = 180 } = {}) {
  const rnd = makeRng(ctx.ws);
  const now = Date.now();
  const totals = { events: 0, approvals: 0, notifications: 0, chains: 0 };

  // Denser near the present, sparser in the deep past — a real company's memory shape.
  for (let d = days; d >= 1; d--) {
    const recency = 1 - d / days;                 // 0 (oldest) → 1 (yesterday)
    const chance = 0.18 + recency * 0.55;         // more chains as we approach today
    if (rnd() > chance) continue;
    const scenario = pick(HISTORY_SCENARIOS, rnd);
    const baseTs = now - d * DAY_MS + Math.floor(rnd() * 8 * 3600) * 1000; // random hour that day
    try {
      const r = await scenario({ ...ctx, rnd, baseTs, live: false });
      totals.events += r.events; totals.chains += 1;
    } catch (e) { logger.warn?.('simulator', `history chain failed: ${e.message}`); }
  }

  // The present: plant the actual open work a CTO would walk into this morning.
  const liveBase = now - 3 * 3600 * 1000;         // "this happened over the last few hours"
  for (const scenario of LIVE_SCENARIOS) {
    try {
      const r = await scenario({ ...ctx, rnd, baseTs: liveBase, live: true });
      totals.events += r.events; totals.approvals += r.approvals; totals.notifications += r.notifications; totals.chains += 1;
    } catch (e) { logger.warn?.('simulator', `live chain failed: ${e.message}`); }
  }

  logger.info?.('simulator', `seeded ${ctx.ws}: ${totals.chains} chains, ${totals.events} events, ${totals.approvals} approvals, ${totals.notifications} notifications`);
  return totals;
}

/** One live beat — fresh activity at "now" (with a real signal ~half the time). */
export async function tick(ctx) {
  const rnd = makeRng(`${ctx.ws}:${Date.now()}`);
  const scenario = pick(LIVE_SCENARIOS, rnd);
  const r = await scenario({ ...ctx, rnd, baseTs: Date.now(), live: rnd() > 0.5 });
  logger.info?.('simulator', `tick ${ctx.ws}: ${scenario.name} (+${r.events} events)`);
  return { scenario: scenario.name, ...r };
}

let timer = null;
/** Dev-only background heartbeat. `resolveCtx()` supplies the target workspace context. */
export function start(resolveCtx, { intervalMs = Number(process.env.SIM_TICK_MS) || 5 * 60 * 1000 } = {}) {
  if (process.env.SIMULATOR_ENABLED !== 'true' || process.env.NODE_ENV === 'production') return null;
  if (timer) return timer;
  logger.info?.('simulator', `background heartbeat every ${Math.round(intervalMs / 1000)}s`);
  timer = setInterval(async () => {
    try { const ctx = await resolveCtx(); if (ctx) await tick(ctx); }
    catch (e) { logger.warn?.('simulator', `tick failed: ${e.message}`); }
  }, intervalMs);
  timer.unref?.();
  return timer;
}

export function stop() { if (timer) { clearInterval(timer); timer = null; } }

export default { seedHistory, tick, start, stop };
