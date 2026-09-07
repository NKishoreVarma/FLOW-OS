export default {
  id: 'system.scheduler.fired', version: '1.0.0',
  connector: 'system', category: 'SYSTEM', source: 'scheduler',
  displayName: 'Scheduled Job Fired', description: 'A scheduled automation job fired.',
  priority: 'NORMAL',
  schema: {
    'jobId':       { type: 'string' },
    'jobName':     { type: 'string' },
    'schedule':    { type: 'string' },
    'targetEventId': { type: 'string' },
    'payload':     { type: 'object' },
  },
  deduplication: { enabled: false },
  ordering:      { guaranteed: false },
  retry:         { maxAttempts: 1, backoffMs: 0 },
  security:      { signatureRequired: false },
};
