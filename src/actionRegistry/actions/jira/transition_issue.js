export default {
  id: 'jira.transition_issue',
  version: '1.0.0',
  lifecycle: 'ACTIVE',
  connector: 'jira',
  category: 'project',
  displayName: 'Transition Jira Issue',
  description: 'Moves a Jira issue through a workflow transition (e.g. "To Do" → "In Progress" → "Done").',
  icon: 'arrow-right-circle',
  tags: ['jira', 'issue', 'transition', 'workflow', 'status', 'state', 'move'],
  riskLevel: 'LOW',
  approvalPolicy: {
    required: false, minimumApprovers: 0, eligibleRoles: ['MEMBER'],
    timeoutHours: 0, selfApprovalAllowed: true, notifyOnCreate: false, notifyOnResolve: false,
  },
  requiredPermissions: ['MEMBER'],
  requiredScopes: ['write:jira-work'],
  executionMode: 'SYNC',
  estimatedDurationMs: 1000,
  timeoutMs: 10000,
  retryStrategy: {
    maxAttempts: 3, backoffType: 'EXPONENTIAL', initialDelayMs: 500, maxDelayMs: 4000,
    jitterPercent: 10, retryOn: ['RATE_LIMIT', 'TIMEOUT'], noRetryOn: ['ISSUE_NOT_FOUND', 'INVALID_TRANSITION', 'UNAUTHORIZED'],
  },
  rollbackStrategy: {
    supported: true, type: 'COMPENSATING', compensatingActionId: 'jira.transition_issue',
    description: 'Transition back to the prior status.', requiresApproval: false,
  },
  verificationStrategy: { type: 'IMMEDIATE', successCondition: '$.status != null' },
  requiredInputs: [
    { name: 'key',    type: 'string', description: 'Jira issue key', example: 'HPLT-205' },
    { name: 'status', type: 'string', description: 'Target status name', example: 'In Progress' },
  ],
  optionalInputs: [
    { name: 'resolution', type: 'string', description: 'Resolution to set when closing', example: 'Fixed' },
  ],
  outputSchema: {
    type: 'object',
    description: 'Transitioned issue',
    properties: {
      key:    { type: 'string', description: 'Issue key' },
      status: { type: 'string', description: 'New status after transition' },
    },
  },
  auditMetadata: {
    resourceType: 'jira_issue', resourceIdField: 'key', actionVerb: 'transitioned',
    sensitivityLevel: 'INTERNAL', retainForDays: 365, complianceTags: [],
  },
  telemetryMetadata: {
    eventName: 'action.jira.transition_issue',
    successMetric: 'flow.action.jira.transition_issue.success',
    failureMetric: 'flow.action.jira.transition_issue.failure',
    durationMetric: 'flow.action.jira.transition_issue.duration_ms',
    dimensions: ['connector', 'workspace_id', 'status'],
  },
  relatedActions: ['jira.close_issue', 'jira.update_issue'],
};
