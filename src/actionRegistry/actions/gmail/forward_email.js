export default {
  id: 'gmail.forward_email',
  version: '1.0.0',
  lifecycle: 'ACTIVE',
  connector: 'gmail',
  category: 'communication',
  displayName: 'Forward Email',
  description: 'Forwards an existing Gmail message to one or more recipients, with an optional introduction.',
  icon: 'forward',
  tags: ['email', 'gmail', 'forward', 'route', 'delegate', 'communication'],
  riskLevel: 'MEDIUM',
  approvalPolicy: {
    required: false, minimumApprovers: 0, eligibleRoles: ['MEMBER'],
    timeoutHours: 0, selfApprovalAllowed: true, notifyOnCreate: false, notifyOnResolve: false,
  },
  requiredPermissions: ['MEMBER'],
  requiredScopes: ['https://www.googleapis.com/auth/gmail.send'],
  executionMode: 'SYNC',
  estimatedDurationMs: 2000,
  timeoutMs: 15000,
  retryStrategy: {
    maxAttempts: 2, backoffType: 'FIXED', initialDelayMs: 2000, maxDelayMs: 2000,
    jitterPercent: 0, retryOn: ['TIMEOUT', 'RATE_LIMIT'], noRetryOn: ['MESSAGE_NOT_FOUND', 'UNAUTHORIZED'],
  },
  rollbackStrategy: {
    supported: false, type: 'NONE', description: 'Forwarded emails cannot be recalled.', requiresApproval: false,
  },
  verificationStrategy: { type: 'IMMEDIATE', successCondition: '$.messageId != null' },
  requiredInputs: [
    { name: 'forwardMessageId', type: 'string', description: 'Gmail message ID to forward' },
    { name: 'to', type: 'string', description: 'Forward-to address(es), comma-separated', example: 'support-team@company.com' },
  ],
  optionalInputs: [
    { name: 'body', type: 'string', maxLength: 4096, description: 'Introduction text prepended before the forwarded email body' },
    { name: 'cc',   type: 'string', description: 'CC addresses, comma-separated' },
  ],
  outputSchema: {
    type: 'object',
    description: 'Forward confirmation',
    properties: {
      messageId: { type: 'string', description: 'Gmail message ID of the forwarded message' },
      threadId:  { type: 'string', description: 'Thread ID' },
      status:    { type: 'string', description: '"forwarded"' },
    },
  },
  auditMetadata: {
    resourceType: 'email', resourceIdField: 'forwardMessageId', actionVerb: 'forwarded',
    sensitivityLevel: 'CONFIDENTIAL', retainForDays: 365, complianceTags: ['SOC2'],
  },
  telemetryMetadata: {
    eventName: 'action.gmail.forward_email',
    successMetric: 'flow.action.gmail.forward_email.success',
    failureMetric: 'flow.action.gmail.forward_email.failure',
    durationMetric: 'flow.action.gmail.forward_email.duration_ms',
    dimensions: ['connector', 'workspace_id'],
  },
  relatedActions: ['gmail.reply_email', 'gmail.send_email'],
};
