export default {
  id: 'slack.message.received', version: '1.0.0',
  connector: 'slack', category: 'COMMUNICATION', source: 'webhook',
  displayName: 'Slack Message Received', description: 'A message was posted in a Slack channel.',
  priority: 'NORMAL',
  schema: {
    'event.type':          { type: 'string' },
    'event.text':          { type: 'string' },
    'event.user':          { type: 'string' },
    'event.channel':       { type: 'string' },
    'event.ts':            { type: 'string' },
    'event.thread_ts':     { type: 'string' },
    'team_id':             { type: 'string' },
  },
  deduplication: { enabled: true, keyFields: ['sourceEventId'], windowMs: 60_000 },
  ordering:      { guaranteed: false },
  retry:         { maxAttempts: 3, backoffMs: 1_000 },
  security:      { signatureRequired: true, signatureHeader: 'x-slack-signature', algorithm: 'hmac-sha256' },
};
