export default {
  id: 'kubernetes.restart_pod',
  version: '1.0.0',
  lifecycle: 'ACTIVE',
  connector: 'kubernetes',
  category: 'infrastructure',
  displayName: 'Restart Kubernetes Pod',
  description: 'Deletes a pod by name so the controller restarts it. Used during incident response to recover a stuck or crashing container.',
  icon: 'refresh-cw',
  tags: ['kubernetes', 'pod', 'restart', 'incident', 'ops'],
  riskLevel: 'HIGH',
  approvalPolicy: {
    required: true, minimumApprovers: 1, eligibleRoles: ['ADMIN', 'OWNER'],
    timeoutHours: 2, selfApprovalAllowed: false, notifyOnCreate: true, notifyOnResolve: true,
  },
  requiredPermissions: ['ADMIN'],
  requiredScopes: ['pods:delete'],
  executionMode: 'SYNC',
  estimatedDurationMs: 3000,
  timeoutMs: 30000,
  retryStrategy: {
    maxAttempts: 2, backoffType: 'FIXED', initialDelayMs: 2000, maxDelayMs: 2000,
    jitterPercent: 0, retryOn: ['TIMEOUT'], noRetryOn: ['POD_NOT_FOUND', 'UNAUTHORIZED'],
  },
  rollbackStrategy: {
    supported: false, type: 'NONE',
    description: 'Pod deletion is self-healing — the controller automatically creates a replacement.',
    requiresApproval: false,
  },
  verificationStrategy: { type: 'POLLING', pollIntervalMs: 3000, maxPollAttempts: 10, successCondition: '$.restarted == true' },
  requiredInputs: [
    { name: 'namespace', type: 'string', description: 'Kubernetes namespace', example: 'production' },
    { name: 'podName',   type: 'string', description: 'Full pod name', example: 'api-server-7d8f4b9c6-xk2pq' },
  ],
  optionalInputs: [
    { name: 'gracePeriodSeconds', type: 'number', description: 'Termination grace period override' },
  ],
  outputSchema: {
    type: 'object',
    properties: {
      restarted:  { type: 'boolean' },
      podName:    { type: 'string' },
      namespace:  { type: 'string' },
      restartedAt: { type: 'string' },
    },
  },
  auditMetadata: {
    resourceType: 'kubernetes_pod', resourceIdField: 'podName', actionVerb: 'restarted',
    sensitivityLevel: 'CONFIDENTIAL', retainForDays: 730, complianceTags: ['SOC2', 'CHANGE_MGMT'],
  },
  telemetryMetadata: {
    eventName: 'action.kubernetes.restart_pod',
    successMetric: 'flow.action.kubernetes.restart_pod.success',
    failureMetric: 'flow.action.kubernetes.restart_pod.failure',
    durationMetric: 'flow.action.kubernetes.restart_pod.duration_ms',
    dimensions: ['connector', 'workspace_id', 'namespace'],
  },
  relatedActions: ['kubernetes.get_pod_status', 'kubernetes.get_pod_logs', 'pagerduty.create_incident'],
};
