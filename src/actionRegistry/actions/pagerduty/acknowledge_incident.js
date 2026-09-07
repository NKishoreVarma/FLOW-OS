export default {
  id: 'pagerduty.acknowledge_incident',
  version: '1.0.0',
  lifecycle: 'ACTIVE',
  connector: 'pagerduty',
  category: 'incident',
  displayName: 'Acknowledge PagerDuty Incident',
  description: 'Acknowledges a PagerDuty incident to suppress re-notifications while the on-call engineer investigates. Used as an intermediate step before resolution.',
  icon: 'eye',
  tags: ['pagerduty', 'incident', 'acknowledge', 'oncall'],
  riskLevel: 'LOW',
  approvalPolicy: {
    required: false, minimumApprovers: 0, eligibleRoles: ['MEMBER'],
    timeoutHours: 0, selfApprovalAllowed: true, notifyOnCreate: false, notifyOnResolve: false,
  },
  requiredPermissions: ['MEMBER'],
  requiredScopes: ['incidents:write'],
  executionMode: 'SYNC',
  estimatedDurationMs: 2000,
  timeoutMs: 15000,
  retryStrategy: {
    maxAttempts: 3, backoffType: 'EXPONENTIAL', initialDelayMs: 1000, maxDelayMs: 8000,
    jitterPercent: 10, retryOn: ['TIMEOUT', 'RATE_LIMIT'], noRetryOn: ['UNAUTHORIZED', 'INCIDENT_NOT_FOUND'],
  },
  rollbackStrategy: { supported: false, type: 'NONE', description: 'Acknowledgment is informational — re-trigger or resolve to change status.', requiresApproval: false },
  verificationStrategy: { type: 'IMMEDIATE', successCondition: '$.status == "acknowledged"' },
  requiredInputs: [
    { name: 'incidentId', type: 'string', description: 'PagerDuty incident ID' },
  ],
  optionalInputs: [
    { name: 'fromEmail', type: 'string', description: 'From email for PagerDuty API' },
  ],
  outputSchema: {
    type: 'object',
    properties: {
      incidentId: { type: 'string' },
      status:     { type: 'string' },
      updatedAt:  { type: 'string' },
    },
  },
  auditMetadata: {
    resourceType: 'pagerduty_incident', resourceIdField: 'incidentId', actionVerb: 'acknowledged',
    sensitivityLevel: 'INTERNAL', retainForDays: 365, complianceTags: ['SOC2', 'INCIDENT'],
  },
  telemetryMetadata: {
    eventName: 'action.pagerduty.acknowledge_incident',
    successMetric: 'flow.action.pagerduty.acknowledge_incident.success',
    failureMetric: 'flow.action.pagerduty.acknowledge_incident.failure',
    durationMetric: 'flow.action.pagerduty.acknowledge_incident.duration_ms',
    dimensions: ['connector', 'workspace_id'],
  },
  relatedActions: ['pagerduty.resolve_incident', 'pagerduty.add_note'],
};
