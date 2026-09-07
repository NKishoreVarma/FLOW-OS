/**
 * FLOW OS — Governance Constants
 *
 * Effect enum, default role-action matrix, and plan-tier capability gates.
 * These are the canonical defaults. Explicit Policy records (Sprint 5.3-B)
 * will override these at org/workspace granularity without touching this file.
 */

/**
 * The three possible outcomes of a governance evaluation.
 * REQUIRE_APPROVAL means the action is permitted in principle but needs
 * an out-of-band human sign-off before execution can proceed.
 */
export const Effect = Object.freeze({
  ALLOW:            'ALLOW',
  DENY:             'DENY',
  REQUIRE_APPROVAL: 'REQUIRE_APPROVAL',
});

/**
 * Actions that mutate external state.
 * These always require an explicit approvedBy token for MEMBER role.
 * OWNER self-approves. ADMIN requires approval only for DELETE.
 */
export const SIDE_EFFECTFUL_ACTIONS = Object.freeze([
  'send', 'create', 'update', 'delete', 'execute', 'approve', 'reject',
]);

/**
 * Actions that are always read-only and never require approval.
 */
export const READ_ONLY_ACTIONS = Object.freeze([
  'read', 'search', 'health', 'audit', 'sync', 'webhook',
]);

/**
 * Default role → permission contract.
 *
 * allowed:         which ActionType values this role may invoke
 * requireApproval: subset of allowed that gate on an explicit approvedBy token
 *
 * Sprint 5.3-B: explicit Policy records will override these per connector/workspace.
 */
export const DEFAULT_ROLE_PERMISSIONS = Object.freeze({
  OWNER: {
    allowed:        [...SIDE_EFFECTFUL_ACTIONS, ...READ_ONLY_ACTIONS],
    requireApproval: [],
  },
  ADMIN: {
    allowed:        [...SIDE_EFFECTFUL_ACTIONS, ...READ_ONLY_ACTIONS],
    requireApproval: ['delete'],
  },
  MEMBER: {
    allowed:        [...SIDE_EFFECTFUL_ACTIONS, ...READ_ONLY_ACTIONS],
    requireApproval: [...SIDE_EFFECTFUL_ACTIONS],
  },
  VIEWER: {
    allowed:        [...READ_ONLY_ACTIONS],
    requireApproval: [],
  },
});

/**
 * Org plan → unlocked capabilities and connector ceiling.
 *
 * capabilities: string[] or 'all'
 * maxConnectors: number of connectors allowed to be authenticated simultaneously
 */
export const PLAN_CAPABILITY_GATES = Object.freeze({
  free: {
    capabilities:  ['knowledge', 'communication'],
    maxConnectors: 2,
  },
  starter: {
    capabilities:  ['knowledge', 'communication', 'meetings', 'engineering'],
    maxConnectors: 5,
  },
  pro: {
    capabilities:  ['knowledge', 'communication', 'meetings', 'engineering', 'crm', 'hr', 'operations'],
    maxConnectors: 20,
  },
  enterprise: {
    capabilities:  'all',
    maxConnectors: Infinity,
  },
});
