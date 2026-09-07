export default {
  id: 'jira.prioritize_backlog',
  version: '1.0.0',
  lifecycle: 'ACTIVE',
  connector: 'jira',
  category: 'project',
  displayName: 'Prioritize Backlog',
  description: 'Updates the priority field on multiple Jira issues in a single batch to reorder the backlog.',
  icon: 'list-ordered',
  tags: ['jira', 'backlog', 'prioritize', 'reorder', 'rank', 'planning', 'batch'],
  riskLevel: 'MEDIUM',
  approvalPolicy: {
    required: false, minimumApprovers: 0, eligibleRoles: ['MEMBER'],
    timeoutHours: 0, selfApprovalAllowed: true, notifyOnCreate: false, notifyOnResolve: false,
  },
  requiredPermissions: ['MEMBER'],
  requiredScopes: ['write:jira-work'],
  executionMode: 'SYNC',
  estimatedDurationMs: 3000,
  timeoutMs: 20000,
  retryStrategy: {
    maxAttempts: 2, backoffType: 'FIXED', initialDelayMs: 2000, maxDelayMs: 2000,
    jitterPercent: 0, retryOn: ['RATE_LIMIT', 'TIMEOUT'], noRetryOn: ['UNAUTHORIZED'],
  },
  rollbackStrategy: {
    supported: false, type: 'MANUAL',
    description: 'Re-run with previous priority values to revert ranking.', requiresApproval: false,
  },
  verificationStrategy: { type: 'IMMEDIATE', successCondition: '$.updated > 0' },
  requiredInputs: [
    {
      name: 'issues',
      type: 'array',
      description: 'Array of { key, priority } objects to bulk-update',
      items: {
        name: 'issueUpdate',
        type: 'object',
        description: 'Issue key + new priority',
        properties: {
          key:      { name: 'key',      type: 'string', description: 'Jira issue key' },
          priority: { name: 'priority', type: 'string', description: 'New priority level' },
        },
      },
    },
  ],
  optionalInputs: [
    { name: 'projectKey', type: 'string', description: 'Filter updates to this project', example: 'HPLT' },
  ],
  outputSchema: {
    type: 'object',
    description: 'Backlog update summary',
    properties: {
      updated: { type: 'number', description: 'Issues successfully updated' },
      failed:  { type: 'number', description: 'Issues that failed to update' },
      results: { type: 'array',  description: 'Per-issue result details' },
    },
  },
  auditMetadata: {
    resourceType: 'jira_backlog', resourceIdField: 'projectKey', actionVerb: 'prioritized',
    sensitivityLevel: 'INTERNAL', retainForDays: 180, complianceTags: [],
  },
  telemetryMetadata: {
    eventName: 'action.jira.prioritize_backlog',
    successMetric: 'flow.action.jira.prioritize_backlog.success',
    failureMetric: 'flow.action.jira.prioritize_backlog.failure',
    durationMetric: 'flow.action.jira.prioritize_backlog.duration_ms',
    dimensions: ['connector', 'workspace_id'],
  },
  relatedActions: ['jira.create_sprint', 'jira.update_issue'],
};
