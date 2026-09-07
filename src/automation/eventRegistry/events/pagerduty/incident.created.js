export default {
  id: 'pagerduty.incident.created', version: '1.0.0',
  connector: 'pagerduty', category: 'OPERATIONS', source: 'webhook',
  displayName: 'PagerDuty Incident Created', description: 'A new PagerDuty incident was triggered.',
  priority: 'CRITICAL',
  schema: {
    'incident.id':                { type: 'string' },
    'incident.incident_number':   { type: 'number' },
    'incident.title':             { type: 'string' },
    'incident.urgency':           { type: 'string', enum: ['high', 'low'] },
    'incident.priority.name':     { type: 'string' },
    'incident.service.summary':   { type: 'string' },
    'incident.html_url':          { type: 'string' },
  },
  deduplication: { enabled: true, keyFields: ['sourceEventId'], windowMs: 300_000 },
  ordering:      { guaranteed: false },
  retry:         { maxAttempts: 5, backoffMs: 1_000 },
  security:      { signatureRequired: true, signatureHeader: 'x-pagerduty-signature', algorithm: 'hmac-sha256' },
};
