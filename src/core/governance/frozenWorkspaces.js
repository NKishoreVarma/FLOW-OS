/**
 * frozenWorkspaces — the single source of truth for workspaces that must never be
 * mutated by background/proactive workers (frozen certification/regression fixtures).
 *
 * Reads happen freely; only WRITES from autonomous paths (prediction history,
 * proactive scans, etc.) are suppressed so the fixture's row counts stay stable.
 *
 * Config:
 *   FROZEN_WORKSPACES     — comma-separated externalIds (default: workspace_helios_test)
 *   FREEZE_GUARD_DISABLED — 'true' kills the guard entirely (escape hatch)
 *
 * Default-on for the known Helios cert fixture — protecting the certification
 * dataset is the safe default, not opt-in.
 */

const DEFAULT_FROZEN = ['workspace_helios_test'];

let _cache = null;
function frozenSet() {
  if (_cache) return _cache;
  const fromEnv = (process.env.FROZEN_WORKSPACES || '')
    .split(',').map(s => s.trim()).filter(Boolean);
  _cache = new Set(fromEnv.length ? fromEnv : DEFAULT_FROZEN);
  return _cache;
}

/** Is this workspace a frozen fixture that background writers must not mutate? */
export function isFrozenWorkspace(workspaceId) {
  if (process.env.FREEZE_GUARD_DISABLED === 'true') return false;
  if (!workspaceId) return false;
  return frozenSet().has(String(workspaceId));
}

/** The current frozen set (for logging / filtering active-workspace scans). */
export function getFrozenWorkspaces() {
  return [...frozenSet()];
}
