export default {
  id: 'datadog.alert.triggered', version: '1.0.0',
  connector: 'datadog', category: 'OPERATIONS', source: 'webhook',
  displayName: 'Datadog Alert Triggered', description: 'A Datadog monitor alert was triggered.',
  priority: 'HIGH',
  schema: {
    'id':           { type: 'string' },
    'title':        { type: 'string' },
    'priority':     { type: 'string' },
    'alert_type':   { type: 'string' },
    'alert_metric': { type: 'string' },
    'org.name':     { type: 'string' },
    'url':          { type: 'string' },
  },
  deduplication: { enabled: true, keyFields: ['sourceEventId'], windowMs: 120_000 },
  ordering:      { guaranteed: false },
  retry:         { maxAttempts: 3, backoffMs: 1_000 },
  security:      { signatureRequired: false },
};
