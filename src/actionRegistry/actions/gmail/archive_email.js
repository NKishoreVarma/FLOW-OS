export default {
  id: 'gmail.archive_email',
  version: '1.0.0',
  lifecycle: 'ACTIVE',
  connector: 'gmail',
  category: 'communication',
  displayName: 'Archive Email',
  description: 'Removes the INBOX label from a message or thread, archiving it without deletion.',
  icon: 'archive',
  tags: ['email', 'gmail', 'archive', 'label', 'inbox', 'organize'],
  riskLevel: 'LOW',
  approvalPolicy: {
    required: false, minimumApprovers: 0, eligibleRoles: ['MEMBER'],
    timeoutHours: 0, selfApprovalAllowed: true, notifyOnCreate: false, notifyOnResolve: false,
  },
  requiredPermissions: ['MEMBER'],
  requiredScopes: ['https://www.googleapis.com/auth/gmail.modify'],
  executionMode: 'SYNC',
  estimatedDurationMs: 600,
  timeoutMs: 8000,
  retryStrategy: {
    maxAttempts: 3, backoffType: 'EXPONENTIAL', initialDelayMs: 300, maxDelayMs: 3000,
    jitterPercent: 10, retryOn: ['RATE_LIMIT', 'TIMEOUT'], noRetryOn: ['MESSAGE_NOT_FOUND', 'UNAUTHORIZED'],
  },
  rollbackStrategy: {
    supported: true, type: 'COMPENSATING', compensatingActionId: 'gmail.label_email',
    description: 'Re-add INBOX label to move message back to inbox.', requiresApproval: false,
  },
  verificationStrategy: { type: 'IMMEDIATE', successCondition: '$.status === "updated"' },
  requiredInputs: [
    { name: 'messageId', type: 'string', description: 'Gmail message ID to archive (or use threadId)' },
  ],
  optionalInputs: [
    { name: 'threadId', type: 'string', description: 'Archive entire thread instead of single message' },
  ],
  outputSchema: {
    type: 'object',
    description: 'Archive operation result',
    properties: {
      messageId:      { type: 'string', description: 'Archived message ID' },
      removeLabelIds: { type: 'array',  description: 'Labels removed (INBOX)' },
      status:         { type: 'string', description: '"updated"' },
    },
  },
  auditMetadata: {
    resourceType: 'email', resourceIdField: 'messageId', actionVerb: 'archived',
    sensitivityLevel: 'INTERNAL', retainForDays: 90, complianceTags: [],
  },
  telemetryMetadata: {
    eventName: 'action.gmail.archive_email',
    successMetric: 'flow.action.gmail.archive_email.success',
    failureMetric: 'flow.action.gmail.archive_email.failure',
    durationMetric: 'flow.action.gmail.archive_email.duration_ms',
    dimensions: ['connector', 'workspace_id'],
  },
  relatedActions: ['gmail.label_email', 'gmail.read_email'],
};
