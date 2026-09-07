export default {
  id: 'postgres.run_migration',
  version: '1.0.0',
  lifecycle: 'ACTIVE',
  connector: 'postgres',
  category: 'database',
  displayName: 'Run Database Migration',
  description: 'Executes a SQL migration inside a transaction. Rolls back automatically if any statement fails. For DDL migrations in production this requires ADMIN approval.',
  icon: 'git-merge',
  tags: ['postgres', 'migration', 'database', 'ddl', 'schema'],
  riskLevel: 'CRITICAL',
  approvalPolicy: {
    required: true, minimumApprovers: 2, eligibleRoles: ['ADMIN', 'OWNER'],
    timeoutHours: 4, selfApprovalAllowed: false, notifyOnCreate: true, notifyOnResolve: true,
  },
  requiredPermissions: ['ADMIN'],
  requiredScopes: ['pg:execute'],
  executionMode: 'SYNC',
  estimatedDurationMs: 15000,
  timeoutMs: 300000,
  retryStrategy: {
    maxAttempts: 1, backoffType: 'NONE', initialDelayMs: 0, maxDelayMs: 0,
    jitterPercent: 0, retryOn: [], noRetryOn: ['UNAUTHORIZED', 'MIGRATION_FAILED', 'CONNECTION_FAILED'],
  },
  rollbackStrategy: {
    supported: true, type: 'AUTOMATIC',
    description: 'All statements execute inside a BEGIN/COMMIT block; any error triggers ROLLBACK automatically.',
    requiresApproval: false,
  },
  verificationStrategy: { type: 'IMMEDIATE', successCondition: '$.migrated == true' },
  requiredInputs: [
    { name: 'sql', type: 'string', description: 'SQL migration script (may contain multiple statements separated by semicolons)', example: 'ALTER TABLE users ADD COLUMN preferences jsonb;' },
  ],
  optionalInputs: [
    { name: 'migrationId', type: 'string', description: 'Unique migration identifier for tracking', example: '20260720_add_user_preferences' },
    { name: 'dryRun',      type: 'boolean', description: 'Validate without executing' },
  ],
  outputSchema: {
    type: 'object',
    properties: {
      migrated:    { type: 'boolean' },
      migrationId: { type: 'string' },
      migratedAt:  { type: 'string' },
      statements:  { type: 'number' },
    },
  },
  auditMetadata: {
    resourceType: 'postgres_migration', resourceIdField: 'migrationId', actionVerb: 'executed',
    sensitivityLevel: 'RESTRICTED', retainForDays: 2190, complianceTags: ['SOC2', 'CHANGE_MGMT', 'COMPLIANCE'],
  },
  telemetryMetadata: {
    eventName: 'action.postgres.run_migration',
    successMetric: 'flow.action.postgres.run_migration.success',
    failureMetric: 'flow.action.postgres.run_migration.failure',
    durationMetric: 'flow.action.postgres.run_migration.duration_ms',
    dimensions: ['connector', 'workspace_id'],
  },
  relatedActions: ['postgres.backup_database', 'postgres.vacuum_analyze', 'pagerduty.create_incident'],
};
