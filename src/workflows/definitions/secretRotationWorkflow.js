/**
 * Secret Rotation Workflow
 *
 * Rotates a Secrets Manager secret and ensures all dependent services
 * pick up the new credential before the old one is removed.
 *
 * Flow:
 *   1. Approve rotation (CRITICAL — requires 2 distinct ADMIN/OWNER approvers)
 *   2. Rotate the secret in AWS Secrets Manager
 *   3. Update the ECS service (forces task replacement, pulling new secret)
 *   4. Rollback Kubernetes pods that also reference the secret (rolling restart)
 *   5. Wait for ECS service to stabilize
 *   6. Verify Kubernetes pods are all Running
 *   7. Annotate Datadog — rotation complete
 *   8. Audit: post confirmation event with rotation metadata
 *
 * Compensation: if any step fails after rotation, alert PagerDuty immediately
 * because services may be holding stale credentials.
 */

export const SECRET_ROTATION_WORKFLOW = {
  id:          'secret-rotation',
  version:     '1.0.0',
  name:        'Secret Rotation',
  description: 'Rotates an AWS Secrets Manager secret and restarts all dependent ECS services and Kubernetes pods. Requires 2-person approval.',
  connectors:  ['aws', 'kubernetes', 'datadog', 'pagerduty'],
  steps: [
    {
      id:          'approve_rotation',
      name:        'Approve secret rotation (requires 2 ADMIN/OWNER)',
      type:        'approval',
      requiredRole:       'ADMIN',
      minimumApprovers:   2,
      selfApprovalAllowed: false,
      timeoutHours: 4,
      prompt:      'Approve rotation of secret {{context.secretId}}? All dependent services will be restarted.',
    },
    {
      id:          'rotate_secret',
      name:        'Rotate secret in AWS Secrets Manager',
      type:        'action',
      connectorId: 'aws',
      actionType:  'execute',
      payload: {
        operation:          'rotate_secret',
        secretId:           '{{context.secretId}}',
        rotationLambdaARN:  '{{context.rotationLambdaARN}}',
      },
      sideEffects: true,
      dependsOn:   ['approve_rotation'],
    },
    {
      id:          'update_ecs_service',
      name:        'Force ECS service task replacement (pick up new secret)',
      type:        'action',
      connectorId: 'aws',
      actionType:  'execute',
      payload: {
        operation: 'update_ecs_service',
        cluster:   '{{context.cluster}}',
        service:   '{{context.ecsService}}',
      },
      sideEffects: true,
      dependsOn:   ['rotate_secret'],
    },
    {
      id:          'rollback_k8s_pods',
      name:        'Rolling restart Kubernetes pods (pick up new secret)',
      type:        'action',
      connectorId: 'kubernetes',
      actionType:  'execute',
      payload: {
        operation:  'rollback_deployment',
        namespace:  '{{context.namespace}}',
        deployment: '{{context.k8sDeployment}}',
        reason:     'Secret rotation — forcing pod replacement to pick up new credentials',
      },
      sideEffects: true,
      dependsOn:   ['rotate_secret'],
    },
    {
      id:          'verify_ecs_stable',
      name:        'Verify ECS service is stable',
      type:        'action',
      connectorId: 'aws',
      actionType:  'execute',
      payload: {
        operation:   'get_instance_health',
        instanceIds: '{{context.ecsInstanceIds}}',
      },
      sideEffects: false,
      dependsOn:   ['update_ecs_service'],
      retry:       { maxAttempts: 8, delayMs: 15000 },
      successCondition: 'result.instances.every(i => i.instanceStatus === "ok")',
    },
    {
      id:          'verify_k8s_pods',
      name:        'Verify Kubernetes pods are Running',
      type:        'action',
      connectorId: 'kubernetes',
      actionType:  'execute',
      payload: {
        operation: 'get_pod_status',
        namespace: '{{context.namespace}}',
        podName:   '{{context.podName}}',
      },
      sideEffects: false,
      dependsOn:   ['rollback_k8s_pods'],
      retry:       { maxAttempts: 8, delayMs: 10000 },
      successCondition: 'result.phase === "Running"',
    },
    {
      id:          'annotate_rotation_complete',
      name:        'Annotate Datadog — rotation complete',
      type:        'action',
      connectorId: 'datadog',
      actionType:  'execute',
      payload: {
        operation: 'post_event',
        title:     'FLOW: Secret rotation complete — {{context.secretId}}',
        alertType: 'success',
        tags:      ['flow:secret-rotation', 'env:production', 'security:rotation'],
      },
      sideEffects: true,
      dependsOn:   ['verify_ecs_stable', 'verify_k8s_pods'],
    },
    {
      id:          'audit_complete',
      name:        'Post rotation audit event',
      type:        'action',
      connectorId: 'datadog',
      actionType:  'execute',
      payload: {
        operation: 'post_event',
        title:     'FLOW AUDIT: Secret {{context.secretId}} rotated by {{context.actor}} at {{context.rotatedAt}}',
        alertType: 'info',
        tags:      ['flow:audit', 'security:rotation', 'compliance'],
      },
      sideEffects: true,
      dependsOn:   ['annotate_rotation_complete'],
    },
  ],
  compensation: {
    onFailure: 'alert_rotation_failure',
    steps: [
      {
        id:          'create_incident_on_failure',
        name:        'Create PagerDuty incident — secret rotation failed',
        type:        'action',
        connectorId: 'pagerduty',
        actionType:  'execute',
        payload: {
          operation: 'create_incident',
          title:     'CRITICAL: Secret rotation FAILED — {{context.secretId}} — services may have stale credentials',
          serviceId: '{{context.pagerdutyServiceId}}',
          urgency:   'high',
          details:   'FLOW automated secret rotation failed. Services that depend on {{context.secretId}} may be holding expired credentials. Immediate manual intervention required.',
        },
      },
      {
        id:          'annotate_rotation_failure',
        name:        'Annotate Datadog — rotation failed',
        type:        'action',
        connectorId: 'datadog',
        actionType:  'execute',
        payload: {
          operation: 'post_event',
          title:     'FLOW: Secret rotation FAILED — {{context.secretId}} — manual intervention required',
          alertType: 'error',
          tags:      ['flow:secret-rotation', 'env:production', 'flow:failure', 'security:alert'],
        },
      },
    ],
  },
};
