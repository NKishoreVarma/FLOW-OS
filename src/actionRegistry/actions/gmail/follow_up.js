export default {
  id: 'gmail.follow_up',
  version: '1.0.0',
  lifecycle: 'ACTIVE',
  connector: 'gmail',
  category: 'communication',
  displayName: 'Flag for Follow-up',
  description: 'Stars a Gmail message and applies a follow-up label so the sender knows a response is pending.',
  icon: 'star',
  tags: ['email', 'gmail', 'follow-up', 'star', 'reminder', 'pending', 'snooze'],
  riskLevel: 'LOW',
  approvalPolicy: {
    required: false, minimumApprovers: 0, eligibleRoles: ['MEMBER'],
    timeoutHours: 0, selfApprovalAllowed: true, notifyOnCreate: false, notifyOnResolve: false,
  },
  requiredPermissions: ['MEMBER'],
  requiredScopes: ['https://www.googleapis.com/auth/gmail.modify'],
  executionMode: 'SYNC',
  estimatedDurationMs: 700,
  timeoutMs: 8000,
  retryStrategy: {
    maxAttempts: 3, backoffType: 'EXPONENTIAL', initialDelayMs: 300, maxDelayMs: 3000,
    jitterPercent: 10, retryOn: ['RATE_LIMIT', 'TIMEOUT'], noRetryOn: ['MESSAGE_NOT_FOUND', 'UNAUTHORIZED'],
  },
  rollbackStrategy: {
    supported: true, type: 'COMPENSATING', compensatingActionId: 'gmail.label_email',
    description: 'Remove STARRED and follow-up labels to undo.', requiresApproval: false,
  },
  verificationStrategy: { type: 'IMMEDIATE', successCondition: '$.status === "follow_up_set"' },
  requiredInputs: [
    { name: 'messageId', type: 'string', description: 'Gmail message ID to flag for follow-up' },
  ],
  optionalInputs: [
    { name: 'followUpLabel', type: 'string', description: 'Label to apply (defaults to "Follow-Up")', example: 'Follow-Up' },
    { name: 'note',         type: 'string', maxLength: 512, description: 'Internal follow-up note stored in metadata' },
  ],
  outputSchema: {
    type: 'object',
    description: 'Follow-up flag result',
    properties: {
      messageId:    { type: 'string', description: 'Message ID' },
      addLabelIds:  { type: 'array',  description: 'Labels applied' },
      status:       { type: 'string', description: '"follow_up_set"' },
    },
  },
  auditMetadata: {
    resourceType: 'email', resourceIdField: 'messageId', actionVerb: 'flagged_for_followup',
    sensitivityLevel: 'INTERNAL', retainForDays: 90, complianceTags: [],
  },
  telemetryMetadata: {
    eventName: 'action.gmail.follow_up',
    successMetric: 'flow.action.gmail.follow_up.success',
    failureMetric: 'flow.action.gmail.follow_up.failure',
    durationMetric: 'flow.action.gmail.follow_up.duration_ms',
    dimensions: ['connector', 'workspace_id'],
  },
  relatedActions: ['gmail.label_email', 'gmail.reply_email'],
};
