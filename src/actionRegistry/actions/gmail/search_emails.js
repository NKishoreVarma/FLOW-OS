export default {
  id: 'gmail.search_emails',
  version: '1.0.0',
  lifecycle: 'ACTIVE',
  connector: 'gmail',
  category: 'communication',
  displayName: 'Search Emails',
  description: 'Searches Gmail using Gmail query syntax and returns matching messages.',
  icon: 'search',
  tags: ['email', 'gmail', 'search', 'query', 'filter', 'find'],
  riskLevel: 'LOW',
  approvalPolicy: {
    required: false, minimumApprovers: 0, eligibleRoles: ['MEMBER'],
    timeoutHours: 0, selfApprovalAllowed: true, notifyOnCreate: false, notifyOnResolve: false,
  },
  requiredPermissions: ['MEMBER'],
  requiredScopes: ['https://www.googleapis.com/auth/gmail.readonly'],
  executionMode: 'SYNC',
  estimatedDurationMs: 1200,
  timeoutMs: 15000,
  retryStrategy: {
    maxAttempts: 3, backoffType: 'EXPONENTIAL', initialDelayMs: 500, maxDelayMs: 4000,
    jitterPercent: 10, retryOn: ['RATE_LIMIT', 'TIMEOUT'], noRetryOn: ['UNAUTHORIZED'],
  },
  rollbackStrategy: {
    supported: false, type: 'NONE', description: 'Search is read-only.', requiresApproval: false,
  },
  verificationStrategy: { type: 'IMMEDIATE', successCondition: '$.items != null' },
  requiredInputs: [
    { name: 'query', type: 'string', description: 'Gmail search query', example: 'from:customer@acme.corp subject:complaint is:unread' },
  ],
  optionalInputs: [
    { name: 'limit', type: 'number', description: 'Max results (1–50, default 20)', minimum: 1, maximum: 50, example: 20 },
  ],
  outputSchema: {
    type: 'object',
    description: 'Search results',
    properties: {
      items: { type: 'array', description: 'Matching messages (normalized)' },
      total: { type: 'number', description: 'Estimated result count' },
    },
  },
  auditMetadata: {
    resourceType: 'email', resourceIdField: 'query', actionVerb: 'searched',
    sensitivityLevel: 'INTERNAL', retainForDays: 30, complianceTags: [],
  },
  telemetryMetadata: {
    eventName: 'action.gmail.search_emails',
    successMetric: 'flow.action.gmail.search_emails.success',
    failureMetric: 'flow.action.gmail.search_emails.failure',
    durationMetric: 'flow.action.gmail.search_emails.duration_ms',
    dimensions: ['connector', 'workspace_id'],
  },
  relatedActions: ['gmail.read_email', 'gmail.archive_email'],
};
