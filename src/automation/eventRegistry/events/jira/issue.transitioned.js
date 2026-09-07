export default {
  id: 'jira.issue.transitioned', version: '1.0.0',
  connector: 'jira', category: 'WORK_MANAGEMENT', source: 'webhook',
  displayName: 'Jira Issue Transitioned', description: 'A Jira issue moved to a new status.',
  priority: 'NORMAL',
  schema: {
    'issue.key':                   { type: 'string' },
    'issue.fields.status.name':    { type: 'string' },
    'issue.fields.project.key':    { type: 'string' },
    'transition.transitionName':   { type: 'string' },
    'user.displayName':            { type: 'string' },
  },
  deduplication: { enabled: true, keyFields: ['sourceEventId'], windowMs: 30_000 },
  ordering:      { guaranteed: false },
  retry:         { maxAttempts: 3, backoffMs: 1_000 },
  security:      { signatureRequired: true, signatureHeader: 'x-hub-signature', algorithm: 'hmac-sha256' },
};
