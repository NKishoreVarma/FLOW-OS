export default {
  id: 'jira.comment_issue',
  version: '1.0.0',
  lifecycle: 'ACTIVE',
  connector: 'jira',
  category: 'project',
  displayName: 'Comment on Jira Issue',
  description: 'Adds a comment to an existing Jira issue for collaboration or status updates.',
  icon: 'message-square',
  tags: ['jira', 'issue', 'comment', 'discuss', 'collaborate', 'note', 'update'],
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
    supported: false, type: 'MANUAL',
    description: 'Delete the comment manually from Jira if posted in error.', requiresApproval: false,
  },
  verificationStrategy: { type: 'IMMEDIATE', successCondition: '$.commentId != null' },
  requiredInputs: [
    { name: 'key',     type: 'string', description: 'Jira issue key to comment on', example: 'HPLT-205' },
    { name: 'comment', type: 'string', maxLength: 32767, description: 'Comment body text' },
  ],
  optionalInputs: [
    { name: 'visibility', type: 'enum', enum: ['all', 'admin', 'internal'], description: 'Who can see the comment', example: 'all' },
  ],
  outputSchema: {
    type: 'object',
    description: 'Created comment',
    properties: {
      commentId: { type: 'string', description: 'Comment ID' },
      key:       { type: 'string', description: 'Issue key the comment was added to' },
      status:    { type: 'string', description: '"commented"' },
    },
  },
  auditMetadata: {
    resourceType: 'jira_issue', resourceIdField: 'key', actionVerb: 'commented',
    sensitivityLevel: 'INTERNAL', retainForDays: 365, complianceTags: [],
  },
  telemetryMetadata: {
    eventName: 'action.jira.comment_issue',
    successMetric: 'flow.action.jira.comment_issue.success',
    failureMetric: 'flow.action.jira.comment_issue.failure',
    durationMetric: 'flow.action.jira.comment_issue.duration_ms',
    dimensions: ['connector', 'workspace_id'],
  },
  relatedActions: ['jira.update_issue', 'jira.transition_issue'],
};
