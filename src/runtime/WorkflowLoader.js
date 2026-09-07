/**
 * Workflow Definition Registry and Loader.
 *
 * At boot, every workflow registers its definition + planner here.
 * The RuntimeEngine calls loadDefinition() and runPlanner() — it never imports
 * workflow-specific modules directly, so adding a new workflow is zero-runtime-change.
 *
 * Registry shape:
 *   definitions: Map<id, WorkflowDefinition>
 *   planners:    Map<id, async (params, ctx) => ExecutionPlan>
 */

import { ValidationError } from '../core/errors/index.js';

const REQUIRED_DEFINITION_FIELDS = ['id', 'name', 'version', 'connectors', 'steps'];
const SEMVER_RE = /^\d+\.\d+(\.\d+)?$/;

const _definitions = new Map();
const _planners    = new Map();

// ── Registration ──────────────────────────────────────────────────────────────

/**
 * Register a workflow definition and its optional planner.
 * A planner is an async function that converts (params, ctx) into an ExecutionPlan
 * (list of concrete steps with resolved IDs, payloads, etc.).
 *
 * If no planner is provided, the definition's `steps` array is used directly.
 */
export function registerWorkflow(definition, plannerFn = null) {
  validateDefinition(definition);
  _definitions.set(definition.id, Object.freeze({ ...definition }));
  if (plannerFn) _planners.set(definition.id, plannerFn);
}

/** Unregister (used in tests). */
export function unregisterWorkflow(id) {
  _definitions.delete(id);
  _planners.delete(id);
}

// ── Resolution ────────────────────────────────────────────────────────────────

export function loadDefinition(id) {
  const def = _definitions.get(id);
  if (!def) throw new ValidationError(`Workflow definition '${id}' is not registered`);
  return def;
}

export function hasDefinition(id) { return _definitions.has(id); }

export function listDefinitions() {
  return [..._definitions.values()];
}

export function hasPlannerFor(id) { return _planners.has(id); }

/**
 * Build a concrete execution plan for the given workflow.
 * If a planner is registered, it is called with (params, ctx).
 * Otherwise the definition's steps are used as-is.
 */
export async function buildExecutionPlan(workflowId, params, ctx) {
  const definition = loadDefinition(workflowId);
  const planner    = _planners.get(workflowId);

  if (planner) {
    return planner({ workspaceId: ctx.workspaceId, ...params }, ctx);
  }

  // No planner: use definition steps directly (simple workflows)
  return {
    workflowId,
    workflowName: definition.name,
    plannedAt:    new Date().toISOString(),
    params,
    summary:      { totalSteps: definition.steps.length },
    steps:        definition.steps,
  };
}

// ── Validation ────────────────────────────────────────────────────────────────

export function validateDefinition(def) {
  if (!def || typeof def !== 'object') {
    throw new ValidationError('Workflow definition must be an object');
  }
  for (const field of REQUIRED_DEFINITION_FIELDS) {
    if (!def[field]) throw new ValidationError(`Workflow definition missing required field: ${field}`);
  }
  if (!SEMVER_RE.test(def.version)) {
    throw new ValidationError(`Workflow version '${def.version}' must follow semver (e.g. 1.0 or 1.0.0)`);
  }
  if (!Array.isArray(def.connectors)) {
    throw new ValidationError('Workflow definition.connectors must be an array');
  }
  if (!Array.isArray(def.steps) || def.steps.length === 0) {
    throw new ValidationError('Workflow definition.steps must be a non-empty array');
  }
  return true;
}

export function clear() {
  _definitions.clear();
  _planners.clear();
}
