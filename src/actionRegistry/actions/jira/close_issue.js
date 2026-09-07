export default {
  id: 'jira.close_issue',
  version: '1.0.0',
  lifecycle: 'ACTIVE',
  connector: 'jira',
  category: 'project',
  displayName: 'Close Jira Issue',
  description: 'Transitions a Jira issue to "Done" status and optionally sets a resolution.',
  icon: 'check-circle',
  tags: ['jira', 'issue', 'close', 'done', 'resolve', 'complete'],
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
    jitterPercent: 10, retryOn: ['RATE_LIMIT', 'TIMEOUT'], noRetryOn: ['ISSUE_NOT_FOUND', 'UNAUTHORIZED'],
  },
  rollbackStrategy: {
    supported: true, type: 'COMPENSATING', compensatingActionId: 'jira.transition_issue',
    description: 'Reopen the issue with transition_issue back to In Progress.', requiresApproval: false,
  },
  verificationStrategy: { type: 'IMMEDIATE', successCondition: '$.status === "Done"' },
  requiredInputs: [
    { name: 'key', type: 'string', description: 'Jira issue key to close', example: 'HPLT-205' },
  ],
  optionalInputs: [
    { name: 'resolution', type: 'string', description: 'Resolution label', example: 'Fixed' },
    { name: 'comment',    type: 'string', maxLength: 4096, description: 'Closing comment added to the issue' },
  ],
  outputSchema: {
    type: 'object',
    description: 'Closed issue',
    properties: {
      key:        { type: 'string', description: 'Issue key' },
      status:     { type: 'string', description: '"Done"' },
      resolution: { type: 'string', description: 'Applied resolution' },
    },
  },
  auditMetadata: {
    resourceType: 'jira_issue', resourceIdField: 'key', actionVerb: 'closed',
    sensitivityLevel: 'INTERNAL', retainForDays: 365, complianceTags: [],
  },
  telemetryMetadata: {
    eventName: 'action.jira.close_issue',
    successMetric: 'flow.action.jira.close_issue.success',
    failureMetric: 'flow.action.jira.close_issue.failure',
    durationMetric: 'flow.action.jira.close_issue.duration_ms',
    dimensions: ['connector', 'workspace_id'],
  },
  relatedActions: ['jira.transition_issue', 'jira.comment_issue'],
};
