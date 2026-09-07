export default {
  id: 'datadog.mute_monitor',
  version: '1.0.0',
  lifecycle: 'ACTIVE',
  connector: 'datadog',
  category: 'observability',
  displayName: 'Mute Datadog Monitor',
  description: 'Mutes a Datadog monitor to suppress notifications during a known incident or maintenance window. Should be paired with an unmute after resolution.',
  icon: 'bell-off',
  tags: ['datadog', 'monitor', 'mute', 'maintenance', 'incident'],
  riskLevel: 'MEDIUM',
  approvalPolicy: {
    required: false, minimumApprovers: 0, eligibleRoles: ['ADMIN'],
    timeoutHours: 1, selfApprovalAllowed: true, notifyOnCreate: false, notifyOnResolve: false,
  },
  requiredPermissions: ['ADMIN'],
  requiredScopes: ['monitors:write'],
  executionMode: 'SYNC',
  estimatedDurationMs: 2000,
  timeoutMs: 15000,
  retryStrategy: {
    maxAttempts: 2, backoffType: 'FIXED', initialDelayMs: 2000, maxDelayMs: 2000,
    jitterPercent: 0, retryOn: ['TIMEOUT', 'RATE_LIMIT'], noRetryOn: ['MONITOR_NOT_FOUND', 'UNAUTHORIZED'],
  },
  rollbackStrategy: {
    supported: true, type: 'COMPENSATING', compensatingActionId: 'datadog.unmute_monitor',
    description: 'Unmute the monitor to restore alerting.', requiresApproval: false,
  },
  verificationStrategy: { type: 'IMMEDIATE', successCondition: '$.muted == true' },
  requiredInputs: [
    { name: 'monitorId', type: 'string', description: 'Datadog monitor ID to mute' },
  ],
  optionalInputs: [
    { name: 'end',     type: 'number', description: 'Unix timestamp when the mute should automatically expire' },
    { name: 'message', type: 'string', description: 'Reason for muting (stored in Datadog)' },
  ],
  outputSchema: {
    type: 'object',
    properties: {
      muted:     { type: 'boolean' },
      monitorId: { type: 'string' },
      mutedAt:   { type: 'string' },
      end:       { type: 'number' },
    },
  },
  auditMetadata: {
    resourceType: 'datadog_monitor', resourceIdField: 'monitorId', actionVerb: 'muted',
    sensitivityLevel: 'INTERNAL', retainForDays: 365, complianceTags: ['SOC2', 'CHANGE_MGMT'],
  },
  telemetryMetadata: {
    eventName: 'action.datadog.mute_monitor',
    successMetric: 'flow.action.datadog.mute_monitor.success',
    failureMetric: 'flow.action.datadog.mute_monitor.failure',
    durationMetric: 'flow.action.datadog.mute_monitor.duration_ms',
    dimensions: ['connector', 'workspace_id'],
  },
  relatedActions: ['datadog.unmute_monitor', 'datadog.post_event', 'pagerduty.create_incident'],
};
