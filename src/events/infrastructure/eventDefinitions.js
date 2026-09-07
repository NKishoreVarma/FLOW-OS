/**
 * Infrastructure Event Definitions — Phase 10
 *
 * Canonical event type constants and helper for infrastructure connectors.
 * All helpers call publish() from the Unified Event Platform (src/events/index.js)
 * so every event flows through the same correlation → durable → route → subscribers pipeline.
 *
 * Event type mapping (all map to canonical EventType from EventSchemaRegistry):
 *   datadog.alert.triggered         → EventType.INCIDENT
 *   datadog.monitor.muted           → EventType.INCIDENT
 *   kubernetes.pod.failed           → EventType.INCIDENT
 *   kubernetes.pod.restarted        → EventType.DEPLOYMENT
 *   kubernetes.deployment.scaled    → EventType.DEPLOYMENT
 *   kubernetes.deployment.rolledback → EventType.DEPLOYMENT
 *   aws.deployment.completed        → EventType.DEPLOYMENT
 *   aws.secret.rotated              → EventType.SECURITY
 *   postgres.backup.completed       → EventType.COMPLIANCE
 *   postgres.migration.completed    → EventType.DEPLOYMENT
 *   postgres.vacuum.completed       → EventType.TIMELINE
 *   redis.memory.high               → EventType.INCIDENT
 *   redis.cache.flushed             → EventType.TIMELINE
 *   redis.bgsave.completed          → EventType.TIMELINE
 *   pagerduty.incident.created      → EventType.INCIDENT
 *   pagerduty.incident.resolved     → EventType.INCIDENT
 *   pagerduty.incident.acknowledged → EventType.INCIDENT
 */

import { publish }    from '../index.js';
import { EventType }  from '../EventSchemaRegistry.js';

// ── Event type constants ──────────────────────────────────────────────────────

export const INFRA_EVENTS = Object.freeze({
  // Datadog
  DATADOG_ALERT_TRIGGERED:     'datadog.alert.triggered',
  DATADOG_MONITOR_MUTED:       'datadog.monitor.muted',
  DATADOG_MONITOR_UNMUTED:     'datadog.monitor.unmuted',
  DATADOG_EVENT_POSTED:        'datadog.event.posted',
  DATADOG_METRICS_FETCHED:     'datadog.metrics.fetched',

  // Kubernetes
  KUBERNETES_POD_FAILED:       'kubernetes.pod.failed',
  KUBERNETES_POD_RESTARTED:    'kubernetes.pod.restarted',
  KUBERNETES_DEPLOYMENT_SCALED:    'kubernetes.deployment.scaled',
  KUBERNETES_DEPLOYMENT_ROLLEDBACK: 'kubernetes.deployment.rolledback',
  KUBERNETES_MANIFEST_APPLIED: 'kubernetes.manifest.applied',

  // AWS
  AWS_DEPLOYMENT_COMPLETED:    'aws.deployment.completed',
  AWS_DEPLOYMENT_FAILED:       'aws.deployment.failed',
  AWS_SECRET_ROTATED:          'aws.secret.rotated',
  AWS_INSTANCE_UNHEALTHY:      'aws.instance.unhealthy',
  AWS_SNAPSHOT_CREATED:        'aws.snapshot.created',

  // PostgreSQL
  POSTGRES_BACKUP_COMPLETED:   'postgres.backup.completed',
  POSTGRES_MIGRATION_COMPLETED: 'postgres.migration.completed',
  POSTGRES_MIGRATION_FAILED:   'postgres.migration.failed',
  POSTGRES_VACUUM_COMPLETED:   'postgres.vacuum.completed',

  // Redis
  REDIS_MEMORY_HIGH:           'redis.memory.high',
  REDIS_CACHE_FLUSHED:         'redis.cache.flushed',
  REDIS_BGSAVE_COMPLETED:      'redis.bgsave.completed',
  REDIS_CONNECTED:             'redis.connected',

  // PagerDuty
  PAGERDUTY_INCIDENT_CREATED:      'pagerduty.incident.created',
  PAGERDUTY_INCIDENT_RESOLVED:     'pagerduty.incident.resolved',
  PAGERDUTY_INCIDENT_ACKNOWLEDGED: 'pagerduty.incident.acknowledged',
});

// ── Type to canonical EventType mapping ──────────────────────────────────────

const _typeMap = {
  [INFRA_EVENTS.DATADOG_ALERT_TRIGGERED]:         EventType.INCIDENT,
  [INFRA_EVENTS.DATADOG_MONITOR_MUTED]:           EventType.INCIDENT,
  [INFRA_EVENTS.DATADOG_MONITOR_UNMUTED]:         EventType.INCIDENT,
  [INFRA_EVENTS.DATADOG_EVENT_POSTED]:            EventType.TIMELINE,
  [INFRA_EVENTS.DATADOG_METRICS_FETCHED]:         EventType.TIMELINE,
  [INFRA_EVENTS.KUBERNETES_POD_FAILED]:           EventType.INCIDENT,
  [INFRA_EVENTS.KUBERNETES_POD_RESTARTED]:        EventType.DEPLOYMENT,
  [INFRA_EVENTS.KUBERNETES_DEPLOYMENT_SCALED]:    EventType.DEPLOYMENT,
  [INFRA_EVENTS.KUBERNETES_DEPLOYMENT_ROLLEDBACK]: EventType.DEPLOYMENT,
  [INFRA_EVENTS.KUBERNETES_MANIFEST_APPLIED]:     EventType.DEPLOYMENT,
  [INFRA_EVENTS.AWS_DEPLOYMENT_COMPLETED]:        EventType.DEPLOYMENT,
  [INFRA_EVENTS.AWS_DEPLOYMENT_FAILED]:           EventType.INCIDENT,
  [INFRA_EVENTS.AWS_SECRET_ROTATED]:              EventType.SECURITY,
  [INFRA_EVENTS.AWS_INSTANCE_UNHEALTHY]:          EventType.INCIDENT,
  [INFRA_EVENTS.AWS_SNAPSHOT_CREATED]:            EventType.COMPLIANCE,
  [INFRA_EVENTS.POSTGRES_BACKUP_COMPLETED]:       EventType.COMPLIANCE,
  [INFRA_EVENTS.POSTGRES_MIGRATION_COMPLETED]:    EventType.DEPLOYMENT,
  [INFRA_EVENTS.POSTGRES_MIGRATION_FAILED]:       EventType.INCIDENT,
  [INFRA_EVENTS.POSTGRES_VACUUM_COMPLETED]:       EventType.TIMELINE,
  [INFRA_EVENTS.REDIS_MEMORY_HIGH]:               EventType.INCIDENT,
  [INFRA_EVENTS.REDIS_CACHE_FLUSHED]:             EventType.TIMELINE,
  [INFRA_EVENTS.REDIS_BGSAVE_COMPLETED]:          EventType.TIMELINE,
  [INFRA_EVENTS.REDIS_CONNECTED]:                 EventType.INTEGRATION,
  [INFRA_EVENTS.PAGERDUTY_INCIDENT_CREATED]:      EventType.INCIDENT,
  [INFRA_EVENTS.PAGERDUTY_INCIDENT_RESOLVED]:     EventType.INCIDENT,
  [INFRA_EVENTS.PAGERDUTY_INCIDENT_ACKNOWLEDGED]: EventType.INCIDENT,
};

/**
 * Publish a structured infrastructure event to the Unified Event Platform.
 *
 * @param {string} rawType  — one of the INFRA_EVENTS constants
 * @param {object} payload  — connector-specific event payload
 * @param {object} ctx      — { workspaceId, actor?, correlationId?, importance? }
 */
export function publishInfraEvent(rawType, payload, ctx) {
  const canonicalType = _typeMap[rawType] ?? EventType.CUSTOM;
  return publish(
    rawType.split('.')[0],
    canonicalType,
    { ...payload, infraEventType: rawType },
    {
      ...ctx,
      metadata: {
        ...(ctx.metadata ?? {}),
        kind:      rawType,
        connector: rawType.split('.')[0],
        source:    'infrastructure',
      },
    }
  );
}
