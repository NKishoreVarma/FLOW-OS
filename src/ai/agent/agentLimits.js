/**
 * Execution limits — controlled by FLOW, never by the model.
 *
 * Callers may LOWER a limit (a cheaper run), but never raise it above the hard
 * ceiling. `resolveLimits()` clamps every field, so a value that leaks in from a
 * tool result or a model-proposed plan can never widen the budget.
 */

const num = (v, d) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : d;
};

// Conservative PoC defaults (read-only single loop, no subagents).
export const DEFAULT_LIMITS = Object.freeze({
  maxIterations:         num(process.env.AGENT_MAX_ITERATIONS, 6),
  maxToolCalls:          num(process.env.AGENT_MAX_TOOL_CALLS, 10),
  executionTimeoutMs:    num(process.env.AGENT_TIMEOUT_MS, 30_000),
  perToolTimeoutMs:      num(process.env.AGENT_TOOL_TIMEOUT_MS, 12_000),
  maxConsecutiveFailures: num(process.env.AGENT_MAX_CONSEC_FAILURES, 3),
});

// Absolute ceilings. The model / plan / tool output can never exceed these.
export const HARD_CEILINGS = Object.freeze({
  maxIterations:         num(process.env.AGENT_HARD_MAX_ITERATIONS, 12),
  maxToolCalls:          num(process.env.AGENT_HARD_MAX_TOOL_CALLS, 24),
  executionTimeoutMs:    num(process.env.AGENT_HARD_TIMEOUT_MS, 120_000),
  perToolTimeoutMs:      num(process.env.AGENT_HARD_TOOL_TIMEOUT_MS, 30_000),
  maxConsecutiveFailures: num(process.env.AGENT_HARD_MAX_CONSEC_FAILURES, 5),
});

/**
 * Merge caller overrides with defaults, then clamp to the hard ceilings.
 * @param {Partial<typeof DEFAULT_LIMITS>} [overrides]
 */
export function resolveLimits(overrides = {}) {
  const clamp = (key) => {
    const wanted = num(overrides[key], DEFAULT_LIMITS[key]);
    return Math.min(wanted, HARD_CEILINGS[key]);
  };
  return Object.freeze({
    maxIterations:          Math.max(1, clamp('maxIterations')),
    maxToolCalls:           Math.max(1, clamp('maxToolCalls')),
    executionTimeoutMs:     clamp('executionTimeoutMs'),
    perToolTimeoutMs:       clamp('perToolTimeoutMs'),
    maxConsecutiveFailures: Math.max(1, clamp('maxConsecutiveFailures')),
    // Subagents are OFF in the PoC and cannot be enabled via overrides.
    maxSubagentDepth: 0,
  });
}
