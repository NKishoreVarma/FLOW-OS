export default {
  id: 'kubernetes.rollback_deployment',
  version: '1.0.0',
  lifecycle: 'ACTIVE',
  connector: 'kubernetes',
  category: 'infrastructure',
  displayName: 'Rollback Kubernetes Deployment',
  description: 'Forces a rolling restart of all pods in a Deployment by patching the restartedAt annotation. Used in blue-green deployment failure rollback.',
  icon: 'rotate-ccw',
  tags: ['kubernetes', 'deployment', 'rollback', 'ops', 'blue-green'],
  riskLevel: 'CRITICAL',
  approvalPolicy: {
    required: true, minimumApprovers: 2, eligibleRoles: ['ADMIN', 'OWNER'],
    timeoutHours: 1, selfApprovalAllowed: false, notifyOnCreate: true, notifyOnResolve: true,
  },
  requiredPermissions: ['ADMIN'],
  requiredScopes: ['deployments:patch'],
  executionMode: 'ASYNC',
  estimatedDurationMs: 30000,
  timeoutMs: 300000,
  retryStrategy: {
    maxAttempts: 1, backoffType: 'NONE', initialDelayMs: 0, maxDelayMs: 0,
    jitterPercent: 0, retryOn: [], noRetryOn: ['UNAUTHORIZED', 'DEPLOYMENT_NOT_FOUND'],
  },
  rollbackStrategy: {
    supported: false, type: 'NONE',
    description: 'A rollback cannot itself be rolled back — re-deploy the intended version instead.',
    requiresApproval: false,
  },
  verificationStrategy: { type: 'POLLING', pollIntervalMs: 10000, maxPollAttempts: 18, successCondition: '$.rolledBack == true' },
  requiredInputs: [
    { name: 'namespace',  type: 'string', description: 'Kubernetes namespace' },
    { name: 'deployment', type: 'string', description: 'Deployment name' },
  ],
  optionalInputs: [
    { name: 'reason', type: 'string', description: 'Human-readable reason for rollback (appended to audit trail)' },
  ],
  outputSchema: {
    type: 'object',
    properties: {
      rolledBack:   { type: 'boolean' },
      deployment:   { type: 'string' },
      namespace:    { type: 'string' },
      rolledBackAt: { type: 'string' },
    },
  },
  auditMetadata: {
    resourceType: 'kubernetes_deployment', resourceIdField: 'deployment', actionVerb: 'rolled-back',
    sensitivityLevel: 'RESTRICTED', retainForDays: 2190, complianceTags: ['SOC2', 'CHANGE_MGMT', 'INCIDENT'],
  },
  telemetryMetadata: {
    eventName: 'action.kubernetes.rollback_deployment',
    successMetric: 'flow.action.kubernetes.rollback_deployment.success',
    failureMetric: 'flow.action.kubernetes.rollback_deployment.failure',
    durationMetric: 'flow.action.kubernetes.rollback_deployment.duration_ms',
    dimensions: ['connector', 'workspace_id', 'namespace'],
  },
  relatedActions: ['kubernetes.get_deployment_status', 'pagerduty.create_incident'],
};
