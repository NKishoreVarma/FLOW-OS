/**
 * RecommendationGenerator — preventive actions per prediction type, grounded in
 * the prediction's own drivers/target. These are what turn a forecast into a
 * "warn before it happens" — concrete steps to lower the probability.
 */

const BY_TYPE = {
  INCIDENT_PROBABILITY: (p) => ['Add pre-deploy checks and canary/rollback for high-risk services', 'Review the resources with recurring incidents'],
  DEPLOYMENT_RISK: (p) => ['Gate the next deployment behind extra review + staging soak', 'Rehearse the rollback path'],
  SPRINT_DELAY: (p) => ['Re-scope or re-sequence the critical path now', 'Unblock the slowest work item before it compounds'],
  PR_BOTTLENECK: (p) => ['Rebalance review load / add reviewers', 'Set a WIP limit on open PRs'],
  REVIEW_DELAY: (p) => ['Assign default reviewers and an SLA', 'Flag PRs waiting > 24h'],
  CODE_OWNERSHIP_RISK: (p) => [`Assign explicit owners to unowned repositories`, 'Add CODEOWNERS and cross-train a second maintainer'],
  BUS_FACTOR: (p) => [`Cross-train a backup for ${p.target?.name || 'the top contributor'}`, 'Document and distribute critical knowledge'],
  KNOWLEDGE_LOSS: (p) => [`Run a knowledge-transfer plan for ${p.target?.name || 'the key person'}`, 'Assign backup owners to their sole-owned assets'],
  EMPLOYEE_DEPENDENCY: (p) => ['Spread ownership beyond the top 2 contributors', 'Introduce pairing/rotation'],
  BURNOUT_RISK: (p) => [`Rebalance ${p.target?.name || 'the overloaded person'}'s workload and meetings`, 'Protect focus time'],
  MEETING_OVERLOAD: (p) => [`Audit and trim ${p.target?.name || 'their'} recurring meetings`, 'Introduce no-meeting focus blocks'],
  PRODUCTIVITY_TREND: (p) => ['Identify and remove the top recurring blocker', 'Check for hidden dependencies slowing delivery'],
  CHURN_RISK: (p) => [`Executive outreach to ${p.target?.name || 'the at-risk account'}`, 'Root-cause the churn signal (incidents, support, product)'],
  CUSTOMER_HEALTH: (p) => ['Prioritize a health review of declining accounts', 'Proactively address the top complaint theme'],
  RENEWAL_RISK: (p) => ['Start the renewal conversation early with a value recap', 'Resolve open escalations before renewal'],
  SUPPORT_ESCALATION: (p) => ['Staff up support for the escalation surge', 'Fast-track the underlying defect'],
  EXPANSION_OPPORTUNITY: (p) => ['Route positive-signal accounts to the growth team', 'Package a tailored expansion offer'],
  OPERATIONAL_HEALTH: (p) => ['Address the top incident driver', 'Review capacity and on-call coverage'],
  CAPACITY_RISK: (p) => ['Add capacity or defer non-critical work', 'Rebalance load across contributors'],
  SECURITY_DRIFT: (p) => ['Run a security review and patch cycle', 'Tighten alerting on the drifting area'],
  INTEGRATION_FAILURE: (p) => ['Add ret/health-check monitoring on the connector', 'Prepare a manual fallback path'],
  POLICY_VIOLATION: (p) => ['Review and tighten the affected policy', 'Add a preventive guardrail in the workflow'],
};

export function generatePreventiveActions(prediction) {
  if (prediction.insufficient) return [{ title: 'Gather more signal before acting', why: 'Not enough evidence to recommend a preventive step yet.', priority: 'low' }];
  const fn = BY_TYPE[prediction.type] || (() => ['Review the drivers and monitor the trend']);
  const priority = prediction.riskLevel === 'critical' ? 'high' : prediction.riskLevel === 'high' ? 'high' : 'medium';
  return fn(prediction).map((title) => ({ title, why: prediction.drivers?.[0] || 'Preventive step for this risk.', priority }));
}
