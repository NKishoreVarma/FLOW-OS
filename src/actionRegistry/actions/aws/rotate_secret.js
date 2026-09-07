export default {
  id: 'aws.rotate_secret',
  version: '1.0.0',
  lifecycle: 'ACTIVE',
  connector: 'aws',
  category: 'security',
  displayName: 'Rotate AWS Secret',
  description: 'Triggers rotation for a Secrets Manager secret. Used in automated secret rotation workflows to minimize credential exposure.',
  icon: 'key',
  tags: ['aws', 'secrets', 'rotation', 'security', 'compliance'],
  riskLevel: 'CRITICAL',
  approvalPolicy: {
    required: true, minimumApprovers: 2, eligibleRoles: ['ADMIN', 'OWNER'],
    timeoutHours: 4, selfApprovalAllowed: false, notifyOnCreate: true, notifyOnResolve: true,
  },
  requiredPermissions: ['ADMIN'],
  requiredScopes: ['secretsmanager:RotateSecret'],
  executionMode: 'ASYNC',
  estimatedDurationMs: 10000,
  timeoutMs: 120000,
  retryStrategy: {
    maxAttempts: 1, backoffType: 'NONE', initialDelayMs: 0, maxDelayMs: 0,
    jitterPercent: 0, retryOn: [], noRetryOn: ['SECRET_NOT_FOUND', 'UNAUTHORIZED', 'ROTATION_NOT_CONFIGURED'],
  },
  rollbackStrategy: {
    supported: false, type: 'NONE',
    description: 'Secret rotation cannot be reversed. Restore from the previous version using AWSPREVIOUS stage if available.',
    requiresApproval: false,
  },
  verificationStrategy: { type: 'POLLING', pollIntervalMs: 5000, maxPollAttempts: 12, successCondition: '$.rotationToken != null' },
  requiredInputs: [
    { name: 'secretId', type: 'string', description: 'Secret name or ARN', example: 'prod/api/database-password' },
  ],
  optionalInputs: [
    { name: 'rotationLambdaARN', type: 'string', description: 'Override rotation Lambda ARN' },
  ],
  outputSchema: {
    type: 'object',
    properties: {
      secretId:      { type: 'string' },
      rotationToken: { type: 'string' },
      rotatedAt:     { type: 'string' },
    },
  },
  auditMetadata: {
    resourceType: 'aws_secret', resourceIdField: 'secretId', actionVerb: 'rotated',
    sensitivityLevel: 'RESTRICTED', retainForDays: 2190, complianceTags: ['SOC2', 'PCI', 'COMPLIANCE'],
  },
  telemetryMetadata: {
    eventName: 'action.aws.rotate_secret',
    successMetric: 'flow.action.aws.rotate_secret.success',
    failureMetric: 'flow.action.aws.rotate_secret.failure',
    durationMetric: 'flow.action.aws.rotate_secret.duration_ms',
    dimensions: ['connector', 'workspace_id'],
  },
  relatedActions: ['kubernetes.restart_pod', 'aws.update_ecs_service'],
};
