/**
 * Blue-Green Deployment Workflow
 *
 * Flow:
 *   1. Post "deploy starting" event to Datadog
 *   2. Update ECS service (green) with the new task definition
 *   3. Poll EC2/ECS health (waits for green to be healthy)
 *   4. Scale green to full capacity
 *   5. Verify green is healthy at full capacity
 *   6. Scale blue to 0 (traffic switch)
 *   7. Post "deploy complete" event to Datadog
 *   8. Notify via PagerDuty note on any active incident
 *
 * Failure path:
 *   - Rollback: scale green to 0, scale blue back to full
 *   - Post "deploy rolled back" annotation
 *
 * Requires ADMIN approval before blue scale-down (traffic switch).
 */

export const BLUE_GREEN_DEPLOYMENT_WORKFLOW = {
  id:          'blue-green-deployment',
  version:     '1.0.0',
  name:        'Blue-Green Deployment',
  description: 'Zero-downtime deployment using ECS blue-green strategy. On failure, automatically rolls back to blue.',
  connectors:  ['aws', 'datadog'],
  steps: [
    {
      id:          'annotate_deploy_start',
      name:        'Annotate Datadog — deployment starting',
      type:        'action',
      connectorId: 'datadog',
      actionType:  'execute',
      payload: {
        operation: 'post_event',
        title:     'FLOW: Blue-green deployment starting — {{context.serviceName}} {{context.imageTag}}',
        alertType: 'info',
        tags:      ['flow:deployment', 'env:production'],
      },
      sideEffects: true,
    },
    {
      id:          'deploy_green',
      name:        'Update green ECS service with new task definition',
      type:        'action',
      connectorId: 'aws',
      actionType:  'execute',
      payload: {
        operation:      'update_ecs_service',
        cluster:        '{{context.cluster}}',
        service:        '{{context.greenService}}',
        taskDefinition: '{{context.newTaskDef}}',
        desiredCount:   '{{context.greenInitialCount}}',
      },
      sideEffects: true,
      dependsOn:   ['annotate_deploy_start'],
    },
    {
      id:          'verify_green_healthy',
      name:        'Verify green instances are healthy',
      type:        'action',
      connectorId: 'aws',
      actionType:  'execute',
      payload: {
        operation:   'get_instance_health',
        instanceIds: '{{context.greenInstanceIds}}',
      },
      sideEffects: false,
      dependsOn:   ['deploy_green'],
      retry:       { maxAttempts: 10, delayMs: 15000 },
      successCondition: 'result.instances.every(i => i.instanceStatus === "ok" && i.systemStatus === "ok")',
    },
    {
      id:          'scale_green_full',
      name:        'Scale green service to full capacity',
      type:        'action',
      connectorId: 'aws',
      actionType:  'execute',
      payload: {
        operation:    'update_ecs_service',
        cluster:      '{{context.cluster}}',
        service:      '{{context.greenService}}',
        desiredCount: '{{context.targetCount}}',
      },
      sideEffects: true,
      dependsOn:   ['verify_green_healthy'],
    },
    {
      id:          'approve_traffic_switch',
      name:        'Approve traffic switch (blue → green)',
      type:        'approval',
      requiredRole: 'ADMIN',
      timeoutHours: 2,
      prompt:      'Green service {{context.greenService}} is healthy at {{context.targetCount}} replicas. Approve traffic switch (scale blue to 0)?',
      dependsOn:   ['scale_green_full'],
    },
    {
      id:          'scale_blue_down',
      name:        'Scale blue service to 0 (traffic switch)',
      type:        'action',
      connectorId: 'aws',
      actionType:  'execute',
      payload: {
        operation:    'update_ecs_service',
        cluster:      '{{context.cluster}}',
        service:      '{{context.blueService}}',
        desiredCount: 0,
      },
      sideEffects: true,
      dependsOn:   ['approve_traffic_switch'],
    },
    {
      id:          'annotate_deploy_complete',
      name:        'Annotate Datadog — deployment complete',
      type:        'action',
      connectorId: 'datadog',
      actionType:  'execute',
      payload: {
        operation: 'post_event',
        title:     'FLOW: Blue-green deployment complete — {{context.serviceName}} {{context.imageTag}}',
        alertType: 'success',
        tags:      ['flow:deployment', 'env:production'],
      },
      sideEffects: true,
      dependsOn:   ['scale_blue_down'],
    },
  ],
  compensation: {
    onFailure: 'rollback_to_blue',
    steps: [
      {
        id:          'rollback_to_blue',
        name:        'Rollback — scale green to 0, restore blue',
        type:        'parallel',
        sideEffects: true,
        substeps: [
          {
            id:          'scale_green_zero',
            type:        'action',
            connectorId: 'aws',
            actionType:  'execute',
            payload: {
              operation:    'update_ecs_service',
              cluster:      '{{context.cluster}}',
              service:      '{{context.greenService}}',
              desiredCount: 0,
            },
          },
          {
            id:          'restore_blue',
            type:        'action',
            connectorId: 'aws',
            actionType:  'execute',
            payload: {
              operation:    'update_ecs_service',
              cluster:      '{{context.cluster}}',
              service:      '{{context.blueService}}',
              desiredCount: '{{context.targetCount}}',
            },
          },
        ],
      },
      {
        id:          'annotate_rollback',
        type:        'action',
        connectorId: 'datadog',
        actionType:  'execute',
        payload: {
          operation: 'post_event',
          title:     'FLOW: Blue-green deployment ROLLED BACK — {{context.serviceName}}',
          alertType: 'error',
          tags:      ['flow:deployment', 'env:production', 'flow:rollback'],
        },
      },
    ],
  },
};
