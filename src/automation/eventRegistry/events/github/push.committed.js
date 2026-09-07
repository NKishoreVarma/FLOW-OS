export default {
  id: 'github.push.committed', version: '1.0.0',
  connector: 'github', category: 'ENGINEERING', source: 'webhook',
  displayName: 'Code Pushed', description: 'Commits were pushed to a GitHub branch.',
  priority: 'NORMAL',
  schema: {
    'ref':                    { type: 'string', description: 'refs/heads/branch-name' },
    'after':                  { type: 'string', description: 'Head commit SHA' },
    'commits':                { type: 'array' },
    'repository.name':        { type: 'string' },
    'repository.owner.login': { type: 'string' },
    'pusher.name':            { type: 'string' },
  },
  deduplication: { enabled: true, keyFields: ['sourceEventId'], windowMs: 30_000 },
  ordering:      { guaranteed: true },
  retry:         { maxAttempts: 2, backoffMs: 500 },
  security:      { signatureRequired: true, signatureHeader: 'x-hub-signature-256', algorithm: 'hmac-sha256' },
};
