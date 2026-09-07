export default {
  id: 'system.workflow.completed', version: '1.0.0',
  connector: 'system', category: 'SYSTEM', source: 'internal',
  displayName: 'Workflow Completed', description: 'A workflow execution completed successfully.',
  priority: 'LOW',
  schema: {
    'executionId':  { type: 'string' },
    'workflowId':   { type: 'string' },
    'workflowName': { type: 'string' },
    'durationMs':   { type: 'number' },
    'triggerId':    { type: 'string' },
  },
  deduplication: { enabled: false },
  ordering:      { guaranteed: false },
  retry:         { maxAttempts: 1, backoffMs: 0 },
  security:      { signatureRequired: false },
};
