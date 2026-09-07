export default {
  id: 'aws.get_instance_health',
  version: '1.0.0',
  lifecycle: 'ACTIVE',
  connector: 'aws',
  category: 'infrastructure',
  displayName: 'Get EC2 Instance Health',
  description: 'Returns system and instance status for one or more EC2 instances. Used for health verification in deployment workflows.',
  icon: 'heart',
  tags: ['aws', 'ec2', 'health', 'status', 'monitoring'],
  riskLevel: 'LOW',
  approvalPolicy: {
    required: false, minimumApprovers: 0, eligibleRoles: ['MEMBER'],
    timeoutHours: 0, selfApprovalAllowed: true, notifyOnCreate: false, notifyOnResolve: false,
  },
  requiredPermissions: ['MEMBER'],
  requiredScopes: ['ec2:DescribeInstanceStatus'],
  executionMode: 'SYNC',
  estimatedDurationMs: 2000,
  timeoutMs: 15000,
  retryStrategy: {
    maxAttempts: 3, backoffType: 'EXPONENTIAL', initialDelayMs: 1000, maxDelayMs: 8000,
    jitterPercent: 10, retryOn: ['TIMEOUT', 'RATE_LIMIT'], noRetryOn: ['UNAUTHORIZED'],
  },
  rollbackStrategy: { supported: false, type: 'NONE', description: 'Read-only — no rollback needed.', requiresApproval: false },
  verificationStrategy: { type: 'IMMEDIATE', successCondition: '$.instances != null' },
  requiredInputs: [
    { name: 'instanceIds', type: 'array', items: { name: 'instanceId', type: 'string', description: 'EC2 instance ID' }, description: 'List of EC2 instance IDs' },
  ],
  optionalInputs: [],
  outputSchema: {
    type: 'object',
    properties: {
      instances: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            instanceId:       { type: 'string' },
            state:            { type: 'string' },
            systemStatus:     { type: 'string' },
            instanceStatus:   { type: 'string' },
            availabilityZone: { type: 'string' },
          },
        },
      },
    },
  },
  auditMetadata: {
    resourceType: 'aws_ec2_instance', resourceIdField: 'instanceIds', actionVerb: 'read',
    sensitivityLevel: 'INTERNAL', retainForDays: 90, complianceTags: ['SOC2'],
  },
  telemetryMetadata: {
    eventName: 'action.aws.get_instance_health',
    successMetric: 'flow.action.aws.get_instance_health.success',
    failureMetric: 'flow.action.aws.get_instance_health.failure',
    durationMetric: 'flow.action.aws.get_instance_health.duration_ms',
    dimensions: ['connector', 'workspace_id'],
  },
  relatedActions: ['aws.describe_instances', 'aws.update_ecs_service'],
};
