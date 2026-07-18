/**
 * FLOW OS — Permission Evaluator
 *
 * The single authority for permission decisions in FLOW OS.
 * No route handler, adapter, or connector may make its own authorization decision.
 *
 * Sprint 5.3-B: evaluateWithPolicies() is the primary entry point.
 *   1. Loads DB Policy records (cached 60s)
 *   2. DENY beats ALLOW at same priority
 *   3. Falls back to DEFAULT_ROLE_PERMISSIONS if no DB policy matches
 *
 * Returns one of three effects:
 *   ALLOW            — proceed immediately
 *   DENY             — hard block
 *   REQUIRE_APPROVAL — permitted in principle; approvedBy token required
 *
 * Future extension points:
 *   - ABAC: add `conditions` evaluation (timeWindow, ipRange, requireMFA)
 *   - Policy versioning: compare policy.version against active version
 *   - Multi-stage approvals: return approvalChain[] instead of single approvedBy
 */

import {
  Effect,
  DEFAULT_ROLE_PERMISSIONS,
  PLAN_CAPABILITY_GATES,
} from './constants.js';
import { getEffectivePolicies } from './policyStore.js';

// ── DB-first evaluator ────────────────────────────────────────────────────────

/**
 * Evaluate with database Policy records as the primary source.
 * Falls back to the default role matrix if no policy matches.
 *
 * @param {object} context
 * @param {string} context.orgId
 * @param {string} [context.workspaceId]
 * @param {string} context.role         — effective role (workspace role takes precedence)
 * @param {string} [context.userId]
 * @param {string} context.actionType
 * @param {string} [context.capability]
 * @param {string} [context.orgPlan]
 * @param {string} [context.approvedBy]
 * @param {string} [context.connectorId]
 * @returns {Promise<{ effect: string, reason: string, policyId: string|null }>}
 */
export async function evaluateWithPolicies(context) {
  const { orgId, workspaceId } = context;

  // ── 1. DB policy check ───────────────────────────────────────────────────────
  let dbPolicies = [];
  try {
    dbPolicies = await getEffectivePolicies(orgId, workspaceId ?? null);
  } catch (err) {
    // DB failure → fall through to default matrix.
    // Fail open for reads, fail closed for writes in the default matrix below.
    console.error('[PolicyEvaluator] DB policy load failed, using defaults:', err.message);
  }

  const matched = matchPolicy(dbPolicies, context);
  if (matched) {
    const effect = resolveConditions(matched, context);
    return {
      effect,
      reason:   `DB policy "${matched.id}" (priority ${matched.priority}): ${matched.description ?? effect}`,
      policyId: matched.id,
    };
  }

  // ── 2. Default role matrix fallback ──────────────────────────────────────────
  const result = evaluate(context);
  return { ...result, policyId: null };
}

// ── Sync default evaluator (fallback + backward compat) ──────────────────────

/**
 * Evaluate using only the hardcoded DEFAULT_ROLE_PERMISSIONS matrix.
 * Called as a fallback from evaluateWithPolicies.
 * Also exported for lightweight checks (health routes, list routes).
 */
export function evaluate({ role, actionType, capability, orgPlan = 'free', approvedBy }) {
  // ── Plan-tier capability gate ─────────────────────────────────────────────
  const planGate = PLAN_CAPABILITY_GATES[orgPlan] ?? PLAN_CAPABILITY_GATES.free;
  if (
    capability &&
    planGate.capabilities !== 'all' &&
    !planGate.capabilities.includes(capability)
  ) {
    return {
      effect: Effect.DENY,
      reason: `Capability "${capability}" is not available on the "${orgPlan}" plan. Upgrade required.`,
    };
  }

  // ── Role lookup ──────────────────────────────────────────────────────────
  const rolePerms = DEFAULT_ROLE_PERMISSIONS[role];
  if (!rolePerms) {
    return {
      effect: Effect.DENY,
      reason: `Unknown role "${role}". Access denied by default.`,
    };
  }

  // ── Role action gate ─────────────────────────────────────────────────────
  if (!rolePerms.allowed.includes(actionType)) {
    return {
      effect: Effect.DENY,
      reason: `Role "${role}" is not permitted to perform "${actionType}".`,
    };
  }

  // ── Approval gate ────────────────────────────────────────────────────────
  if (rolePerms.requireApproval.includes(actionType)) {
    if (!approvedBy || !String(approvedBy).trim()) {
      return {
        effect: Effect.REQUIRE_APPROVAL,
        reason: `Action "${actionType}" requires explicit human approval for role "${role}". Provide a non-empty approvedBy field.`,
      };
    }
    return { effect: Effect.ALLOW, reason: `Action "${actionType}" approved by "${approvedBy}".` };
  }

  return { effect: Effect.ALLOW, reason: `Role "${role}" is permitted to perform "${actionType}".` };
}

/**
 * Convenience wrapper for read-only route checks.
 */
export function evaluateRead({ role, capability, orgPlan }) {
  return evaluate({ role, actionType: 'read', capability, orgPlan });
}

// ── Policy matching ───────────────────────────────────────────────────────────

/**
 * Find the highest-priority matching policy from an already-sorted list.
 * DENY beats ALLOW/REQUIRE_APPROVAL at the same priority level.
 *
 * Null fields on a policy act as wildcards (match any value).
 */
function matchPolicy(policies, { role, actionType, capability, connectorId, userId }) {
  const matches = policies.filter(p => {
    if (p.subjectRole   && p.subjectRole   !== role)        return false;
    if (p.subjectUserId && p.subjectUserId !== userId)      return false;
    if (p.capability    && p.capability    !== capability)  return false;
    if (p.actionType    && p.actionType    !== actionType)  return false;
    if (p.connectorId   && p.connectorId   !== connectorId) return false;
    return true;
  });

  if (!matches.length) return null;

  // DENY always wins
  const deny = matches.find(p => p.effect === 'DENY');
  if (deny) return deny;

  // Return highest-priority non-DENY policy
  return matches[0];
}

/**
 * Apply `conditions` from a matched Policy to determine the final effect.
 * Currently supports `requireApproval` condition override.
 */
function resolveConditions(policy, { approvedBy }) {
  const cond = policy.conditions ?? {};

  // A REQUIRE_APPROVAL effect (or a condition that forces it) gates on approvedBy.
  const needsApproval =
    policy.effect === 'REQUIRE_APPROVAL' ||
    cond.requireApproval === true;

  if (needsApproval) {
    return approvedBy && String(approvedBy).trim()
      ? Effect.ALLOW
      : Effect.REQUIRE_APPROVAL;
  }

  return policy.effect; // ALLOW or DENY
}
