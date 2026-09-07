/**
 * Per-execution runtime context.
 *
 * Holds ALL mutable state for a single workflow execution:
 *   variables   — workflow-level variables, writable by steps via outputAs/trackIn
 *   stepResults — stepId → last output (success path only)
 *   retryCount  — stepId → attempt count so far
 *   rollbackStack — ordered list of completed step IDs (newest-last)
 *   approvalState — pause state when governance requires human approval
 *
 * The context is serialised as JSON and stored in workflow_runtime_checkpoints
 * after each step so recovery can reconstruct it on server restart.
 */

export function createRuntimeContext({ executionId, workspaceId, workflowId, params = {} }) {
  return {
    executionId,
    workspaceId,
    workflowId,
    params,
    variables:    { ...params },   // params are pre-seeded as variables
    stepResults:  {},
    retryCount:   {},
    rollbackStack: [],
    approvalState: { state: 'NONE', approvalId: null, pendingStepId: null },
    metrics: {
      stepsRun:     0,
      stepsFailed:  0,
      stepsSkipped: 0,
      startedAt:    Date.now(),
    },
  };
}

export function setVariable(ctx, key, value) {
  ctx.variables[key] = value;
}

export function getVariable(ctx, key) {
  return ctx.variables[key];
}

export function recordStepResult(ctx, stepId, output) {
  ctx.stepResults[stepId] = output;
}

export function getStepResult(ctx, stepId) {
  return ctx.stepResults[stepId] ?? null;
}

export function incrementRetry(ctx, stepId) {
  ctx.retryCount[stepId] = (ctx.retryCount[stepId] ?? 0) + 1;
}

export function getRetryCount(ctx, stepId) {
  return ctx.retryCount[stepId] ?? 0;
}

export function pushRollback(ctx, stepId) {
  ctx.rollbackStack.push(stepId);
}

export function setApprovalWaiting(ctx, stepId, approvalId) {
  ctx.approvalState = { state: 'WAITING', approvalId: approvalId ?? null, pendingStepId: stepId };
}

export function clearApproval(ctx) {
  ctx.approvalState = { state: 'NONE', approvalId: null, pendingStepId: null };
}

export function trackStepOutput(ctx, step, output) {
  if (!step.trackIn) return;
  const arr = ctx.variables[step.trackIn] ?? [];
  arr.push({ ...(step.trackItem ?? {}), ...output });
  ctx.variables[step.trackIn] = arr;
}

export function trackStepFailure(ctx, step, err) {
  if (!step.failTrackIn) return;
  const arr = ctx.variables[step.failTrackIn] ?? [];
  arr.push({ ...(step.trackItem ?? {}), error: err?.message ?? String(err) });
  ctx.variables[step.failTrackIn] = arr;
}

// ── Expression/variable resolution ───────────────────────────────────────────

/**
 * Resolve a dotted path against the runtime context.
 * Supports: "variables.foo", "stepResults.stepId.field", bare "varName".
 */
export function resolvePath(path, ctx) {
  if (!path || typeof path !== 'string') return undefined;
  const parts = path.split('.');
  let cursor = parts[0] === 'variables' || parts[0] === 'stepResults' || parts[0] === 'params'
    ? ctx
    : { [parts[0]]: ctx.variables[parts[0]] };
  for (const part of parts) {
    if (cursor == null) return undefined;
    cursor = cursor[part];
  }
  return cursor;
}

/**
 * Interpolate `{{path}}` references in a string or object.
 * Replaces each `{{dotted.path}}` with its resolved value from runtimeCtx.
 */
export function interpolate(value, ctx) {
  if (value == null) return value;
  if (typeof value === 'function') return value(ctx);
  if (typeof value === 'string') {
    return value.replace(/\{\{([^}]+)\}\}/g, (_, path) => {
      const resolved = resolvePath(path.trim(), ctx);
      return resolved != null ? String(resolved) : '';
    });
  }
  if (Array.isArray(value)) return value.map(v => interpolate(v, ctx));
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, interpolate(v, ctx)])
    );
  }
  return value;
}

/**
 * Evaluate a simple condition expression against runtimeCtx.
 * Supports string expressions: "variables.x >= 70", "stepResults.step1.merged === true".
 * Also accepts plain booleans or functions (ctx) => boolean.
 */
export function evaluateCondition(expr, ctx) {
  if (expr == null) return true;
  if (typeof expr === 'boolean') return expr;
  if (typeof expr === 'function') return expr(ctx);

  const match = String(expr).match(/^(.+?)\s*(===|!==|>=|<=|>|<|==)\s*(.+)$/);
  if (!match) return !!resolvePath(expr.trim(), ctx);

  const [, lhs, op, rhs] = match;
  const left  = resolvePath(lhs.trim(), ctx) ?? lhs.trim();

  // Parse right-hand side as literal or path
  let right;
  const rTrimmed = rhs.trim();
  if (rTrimmed === 'true')  right = true;
  else if (rTrimmed === 'false') right = false;
  else if (rTrimmed === 'null')  right = null;
  else if (/^-?\d+(\.\d+)?$/.test(rTrimmed)) right = Number(rTrimmed);
  else if (/^['"](.*)['"]$/.test(rTrimmed)) right = rTrimmed.slice(1, -1);
  else right = resolvePath(rTrimmed, ctx) ?? rTrimmed;

  switch (op) {
    case '===': case '==': return left === right;
    case '!==':            return left !== right;
    case '>=':             return Number(left) >= Number(right);
    case '<=':             return Number(left) <= Number(right);
    case '>':              return Number(left) >  Number(right);
    case '<':              return Number(left) <  Number(right);
  }
  return false;
}

/** Serialise for checkpoint storage (strips functions). */
export function serializeContext(ctx) {
  return JSON.parse(JSON.stringify(ctx));
}

/** Restore from checkpoint JSON. */
export function deserializeContext(raw) {
  return raw;
}
