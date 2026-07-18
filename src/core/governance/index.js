/**
 * FLOW OS — Governance Module
 *
 * Public API for the enterprise governance layer.
 *
 * Sprint 5.3-A: Role-action matrix, plan-tier gates, workspace ownership validation,
 *               ALLOW/DENY/REQUIRE_APPROVAL evaluator, PostgreSQL audit persistence.
 *
 * Sprint 5.3-B: DB-first policy evaluation (evaluateWithPolicies), WorkspaceMember
 *               model, Policy CRUD (policyStore), persistent approval lifecycle
 *               (approvalStore), event subscribers, audit improvements.
 *
 * Sprint 5.3-C (next): approval notifications, analytics persistence, policy
 *                      versioning, multi-stage approval chains.
 */

export {
  Effect,
  DEFAULT_ROLE_PERMISSIONS,
  PLAN_CAPABILITY_GATES,
  SIDE_EFFECTFUL_ACTIONS,
  READ_ONLY_ACTIONS,
} from './constants.js';

export { evaluate, evaluateRead, evaluateWithPolicies } from './permissionEvaluator.js';
export { governanceMiddleware }                         from './governanceMiddleware.js';
export { persistConnectorAudit }                        from './auditPersistence.js';
export {
  getEffectivePolicies,
  listPolicies,
  getPolicy,
  createPolicy,
  updatePolicy,
  deletePolicy,
  togglePolicy,
} from './policyStore.js';
export {
  createPendingApproval,
  getApproval,
  listApprovals,
  approveRequest,
  rejectRequest,
  markExecuted,
  expireStaleApprovals,
} from './approvalStore.js';
export {
  initGovernanceSubscribers,
  getConnectorMetrics,
  getAllConnectorMetrics,
} from './eventSubscribers.js';
