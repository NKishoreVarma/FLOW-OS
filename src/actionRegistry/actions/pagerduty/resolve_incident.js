export default {
  id: 'pagerduty.resolve_incident',
  version: '1.0.0',
  lifecycle: 'ACTIVE',
  connector: 'pagerduty',
  category: 'incident',
  displayName: 'Resolve PagerDuty Incident',
  description: 'Marks a PagerDuty incident as resolved. Final step in incident response workflows after the root cause has been fixed and service is confirmed healthy.',
  icon: 'check-circle',
  tags: ['pagerduty', 'incident', 'resolve', 'ops'],
  riskLevel: 'LOW',
  approvalPolicy: {
    required: false, minimumApprovers: 0, eligibleRoles: ['ADMIN'],
    timeoutHours: 0, selfApprovalAllowed: true, notifyOnCreate: false, notifyOnResolve: false,
  },
  requiredPermissions: ['ADMIN'],
  requiredScopes: ['incidents:write'],
  executionMode: 'SYNC',
  estimatedDurationMs: 2000,
  timeoutMs: 15000,
  retryStrategy: {
    maxAttempts: 3, backoffType: 'EXPONENTIAL', initialDelayMs: 1000, maxDelayMs: 8000,
    jitterPercent: 10, retryOn: ['TIMEOUT', 'RATE_LIMIT'], noRetryOn: ['UNAUTHORIZED', 'INCIDENT_NOT_FOUND', 'ALREADY_RESOLVED'],
  },
  rollbackStrategy: { supported: false, type: 'NONE', description: 'A resolved incident cannot be re-opened via API — create a new incident if needed.', requiresApproval: false },
  verificationStrategy: { type: 'IMMEDIATE', successCondition: '$.status == "resolved"' },
  requiredInputs: [
    { name: 'incidentId', type: 'string', description: 'PagerDuty incident ID', example: 'PT4KHLK' },
  ],
  optionalInputs: [
    { name: 'resolution', type: 'string', description: 'Resolution notes' },
    { name: 'fromEmail',  type: 'string', description: 'From email for PagerDuty API' },
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
    resourceType: 'pagerduty_incident', resourceIdField: 'incidentId', actionVerb: 'resolved',
    sensitivityLevel: 'INTERNAL', retainForDays: 730, complianceTags: ['SOC2', 'INCIDENT'],
  },
  telemetryMetadata: {
    eventName: 'action.pagerduty.resolve_incident',
    successMetric: 'flow.action.pagerduty.resolve_incident.success',
    failureMetric: 'flow.action.pagerduty.resolve_incident.failure',
    durationMetric: 'flow.action.pagerduty.resolve_incident.duration_ms',
    dimensions: ['connector', 'workspace_id'],
  },
  relatedActions: ['pagerduty.add_note', 'datadog.post_event'],
};
