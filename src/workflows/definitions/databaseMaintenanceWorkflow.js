/**
 * Database Maintenance Workflow
 *
 * Scheduled maintenance pipeline:
 *   1. Redis BGSAVE (persist cache before DB work)
 *   2. PostgreSQL structural backup (safety snapshot)
 *   3. Run pending database migration (requires ADMIN × 2 approval — CRITICAL)
 *   4. Verify migration (check_connection + table stats)
 *   5. VACUUM ANALYZE (reclaim dead tuples, refresh planner stats)
 *   6. Fetch Redis memory info (validate cache is within bounds)
 *   7. Post completion event to Datadog
 *
 * All state-changing steps use the `action` step type so they flow
 * through executeAction() → governance → audit → timeline → WebSocket.
 */

export const DATABASE_MAINTENANCE_WORKFLOW = {
  id:          'database-maintenance',
  version:     '1.0.0',
  name:        'Database Maintenance',
  description: 'Scheduled database maintenance: backup → migrate → verify → vacuum → metrics → notify.',
  connectors:  ['postgres', 'redis-infra', 'datadog'],
  steps: [
    {
      id:          'redis_bgsave',
      name:        'Persist Redis cache to disk',
      type:        'action',
      connectorId: 'redis-infra',
      actionType:  'execute',
      payload: {
        operation: 'trigger_bgsave',
      },
      sideEffects: true,
    },
    {
      id:          'postgres_backup',
      name:        'Capture PostgreSQL structural snapshot',
      type:        'action',
      connectorId: 'postgres',
      actionType:  'execute',
      payload: {
        operation: 'backup_database',
        schema:    '{{context.schema ?? "public"}}',
        format:    'sql',
      },
      sideEffects: false,
      dependsOn:   ['redis_bgsave'],
    },
    {
      id:          'approve_migration',
      name:        'Approve database migration (requires 2 ADMIN/OWNER)',
      type:        'approval',
      requiredRole:       'ADMIN',
      minimumApprovers:   2,
      selfApprovalAllowed: false,
      timeoutHours: 4,
      prompt:      'Database backup complete ({{result.postgres_backup.tableCount}} tables, {{result.postgres_backup.totalSize}}). Approve running migration {{context.migrationId}}?',
      dependsOn:   ['postgres_backup'],
    },
    {
      id:          'run_migration',
      name:        'Execute database migration in transaction',
      type:        'action',
      connectorId: 'postgres',
      actionType:  'execute',
      payload: {
        operation:   'run_migration',
        sql:         '{{context.migrationSql}}',
        migrationId: '{{context.migrationId}}',
        dryRun:      false,
      },
      sideEffects: true,
      dependsOn:   ['approve_migration'],
    },
    {
      id:          'verify_migration',
      name:        'Verify database is healthy after migration',
      type:        'action',
      connectorId: 'postgres',
      actionType:  'execute',
      payload: {
        operation: 'check_connection',
      },
      sideEffects: false,
      dependsOn:   ['run_migration'],
      successCondition: 'result.connected === true',
    },
    {
      id:          'vacuum_analyze',
      name:        'VACUUM ANALYZE — reclaim storage and update planner stats',
      type:        'action',
      connectorId: 'postgres',
      actionType:  'execute',
      payload: {
        operation: 'vacuum_analyze',
        schema:    '{{context.schema ?? "public"}}',
        full:      false,
      },
      sideEffects: true,
      dependsOn:   ['verify_migration'],
    },
    {
      id:          'get_redis_memory',
      name:        'Fetch Redis memory metrics post-maintenance',
      type:        'action',
      connectorId: 'redis-infra',
      actionType:  'execute',
      payload: {
        operation: 'get_memory_info',
      },
      sideEffects: false,
      dependsOn:   ['vacuum_analyze'],
    },
    {
      id:          'notify_complete',
      name:        'Annotate Datadog — maintenance complete',
      type:        'action',
      connectorId: 'datadog',
      actionType:  'execute',
      payload: {
        operation: 'post_event',
        title:     'FLOW: Database maintenance complete — {{context.migrationId}}',
        alertType: 'success',
        tags:      ['flow:maintenance', 'env:production', 'db:postgres'],
      },
      sideEffects: true,
      dependsOn:   ['get_redis_memory'],
    },
  ],
  compensation: {
    onFailure: 'notify_failure',
    steps: [
      {
        id:          'notify_failure',
        name:        'Annotate Datadog — maintenance failed',
        type:        'action',
        connectorId: 'datadog',
        actionType:  'execute',
        payload: {
          operation: 'post_event',
          title:     'FLOW: Database maintenance FAILED — {{context.migrationId}} — manual intervention required',
          alertType: 'error',
          tags:      ['flow:maintenance', 'env:production', 'flow:failure'],
        },
      },
    ],
  },
};
