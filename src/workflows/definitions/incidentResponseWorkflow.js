/**
 * Production Incident Response Workflow
 *
 * Trigger: Datadog alert fires (datadog.alert.triggered event)
 * Flow:
 *   1. Get alert details from Datadog
 *   2. Acknowledge PagerDuty incident (planner provides incidentId)
 *   3. Mute the noisy Datadog monitor during remediation
 *   4. Approve restart (requires ADMIN — HIGH risk action)
 *   5. Restart the failing Kubernetes pod
 *   6. Verify pod is Running (polls pod status)
 *   7. Post "resolved" annotation to Datadog event stream
 *   8. Resolve the PagerDuty incident
 *
 * All state-changing steps use the `action` step type so they flow
 * through executeAction() → governance → audit → timeline → WebSocket.
 */

export const INCIDENT_RESPONSE_WORKFLOW = {
  id:          'production-incident-response',
  version:     '1.0.0',
  name:        'Production Incident Response',
  description: 'Automated P1/P2 incident remediation: detect → acknowledge → remediate → verify → resolve.',
  connectors:  ['datadog', 'pagerduty', 'kubernetes'],
  trigger: {
    type:      'event',
    eventType: 'incident',
    filter:    { 'metadata.kind': 'datadog.alert.triggered' },
  },
  steps: [
    {
      id:          'get_alert_details',
      name:        'Get Datadog alert details',
      type:        'action',
      connectorId: 'datadog',
      actionType:  'execute',
      payload: {
        operation: 'get_alert_details',
        monitorId: '{{trigger.payload.monitorId}}',
      },
      sideEffects: false,
    },
    {
      id:          'acknowledge_incident',
      name:        'Acknowledge PagerDuty incident',
      type:        'action',
      connectorId: 'pagerduty',
      actionType:  'execute',
      payload: {
        operation:  'acknowledge_incident',
        incidentId: '{{context.pagerdutyIncidentId}}',
      },
      sideEffects: true,
      dependsOn:   ['get_alert_details'],
    },
    {
      id:          'mute_monitor',
      name:        'Mute alerting Datadog monitor',
      type:        'action',
      connectorId: 'datadog',
      actionType:  'execute',
      payload: {
        operation: 'mute_monitor',
        monitorId: '{{trigger.payload.monitorId}}',
        message:   'FLOW incident response in progress — muted during remediation',
      },
      sideEffects: true,
      dependsOn:   ['acknowledge_incident'],
    },
    {
      id:          'approve_restart',
      name:        'Request ADMIN approval to restart pod',
      type:        'approval',
      requiredRole: 'ADMIN',
      timeoutHours: 1,
      prompt:      'Approve Kubernetes pod restart for incident {{trigger.payload.monitorId}}?',
      dependsOn:   ['mute_monitor'],
    },
    {
      id:          'restart_pod',
      name:        'Restart failing Kubernetes pod',
      type:        'action',
      connectorId: 'kubernetes',
      actionType:  'execute',
      payload: {
        operation: 'restart_pod',
        namespace: '{{context.namespace}}',
        podName:   '{{context.podName}}',
      },
      sideEffects: true,
      dependsOn:   ['approve_restart'],
    },
    {
      id:          'verify_pod_running',
      name:        'Verify pod is Running',
      type:        'action',
      connectorId: 'kubernetes',
      actionType:  'execute',
      payload: {
        operation: 'get_pod_status',
        namespace: '{{context.namespace}}',
        podName:   '{{context.podName}}',
      },
      sideEffects: false,
      dependsOn:   ['restart_pod'],
      retry: { maxAttempts: 5, delayMs: 6000 },
      successCondition: 'result.phase === "Running"',
    },
    {
      id:          'post_resolution_event',
      name:        'Annotate Datadog timeline — resolved',
      type:        'action',
      connectorId: 'datadog',
      actionType:  'execute',
      payload: {
        operation: 'post_event',
        title:     'FLOW: Incident resolved — pod restarted and healthy',
        alertType: 'success',
        tags:      ['flow:incident-response', 'env:production'],
      },
      sideEffects: true,
      dependsOn:   ['verify_pod_running'],
    },
    {
      id:          'resolve_incident',
      name:        'Resolve PagerDuty incident',
      type:        'action',
      connectorId: 'pagerduty',
      actionType:  'execute',
      payload: {
        operation:  'resolve_incident',
        incidentId: '{{context.pagerdutyIncidentId}}',
        resolution: 'FLOW automated remediation: Kubernetes pod restarted and verified healthy.',
      },
      sideEffects: true,
      dependsOn:   ['post_resolution_event'],
    },
  ],
  compensation: {
    onFailure: 'unmute_monitor_on_failure',
    steps: [
      {
        id:          'unmute_monitor_on_failure',
        name:        'Unmute Datadog monitor (failure path)',
        type:        'action',
        connectorId: 'datadog',
        actionType:  'execute',
        payload: {
          operation: 'unmute_monitor',
          monitorId: '{{trigger.payload.monitorId}}',
        },
      },
    ],
  },
};
