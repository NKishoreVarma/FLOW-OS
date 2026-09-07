export default {
  id: 'gmail.email.sent', version: '1.0.0',
  connector: 'gmail', category: 'COMMUNICATION', source: 'connector',
  displayName: 'Email Sent', description: 'An email was sent via Gmail.',
  priority: 'LOW',
  schema: {
    'message.id':  { type: 'string' },
    'to':          { type: 'string' },
    'subject':     { type: 'string' },
    'threadId':    { type: 'string' },
  },
  deduplication: { enabled: true, keyFields: ['sourceEventId'], windowMs: 60_000 },
  ordering:      { guaranteed: false },
  retry:         { maxAttempts: 2, backoffMs: 1_000 },
  security:      { signatureRequired: false },
};
