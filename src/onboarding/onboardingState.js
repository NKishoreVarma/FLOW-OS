/**
 * FLOW OS — Onboarding State (Phase 17)
 *
 * Per-workspace first-time-setup progress. Persisted in the shared Redis (reuse — no new
 * store, no schema migration). Losing it only re-shows onboarding, so Redis durability is
 * the right trade for a pilot. Drives the first-run gate: an incomplete workspace routes
 * to /welcome instead of the Morning Brief.
 */

import redis from '../config/redis.js';

const KEY = (ws) => `onboarding:state:${ws}`;

export const STEPS = ['welcome', 'discover', 'permissions', 'build', 'ready'];

function defaultState() {
  return { step: 'welcome', mode: null, connectors: {}, discovery: null, permissionsConfigured: false, buildImportId: null, completed: false, startedAt: new Date().toISOString(), completedAt: null };
}

export async function getState(workspaceId) {
  if (!workspaceId) throw new Error('workspaceId required');
  const raw = await redis.get(KEY(workspaceId));
  if (!raw) return defaultState();
  try { return { ...defaultState(), ...JSON.parse(raw) }; } catch { return defaultState(); }
}

export async function setState(workspaceId, patch = {}) {
  const cur = await getState(workspaceId);
  const next = { ...cur, ...patch, updatedAt: new Date().toISOString() };
  await redis.set(KEY(workspaceId), JSON.stringify(next));
  return next;
}

export async function markComplete(workspaceId) {
  return setState(workspaceId, { step: 'ready', completed: true, completedAt: new Date().toISOString() });
}

export async function reset(workspaceId) {
  await redis.del(KEY(workspaceId));
  return defaultState();
}

/**
 * Derive the workspace data mode from onboarding state.
 * 'demo' when the user picked the demo path during onboarding; 'real' otherwise.
 */
export async function getWorkspaceMode(workspaceId) {
  const state = await getState(workspaceId);
  const workspaceMode = state.mode === 'demo' ? 'demo' : 'real';
  return { workspaceMode, onboardingMode: state.mode };
}

export default { STEPS, getState, setState, markComplete, reset, getWorkspaceMode };
