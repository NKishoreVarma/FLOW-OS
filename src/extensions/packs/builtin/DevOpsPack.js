import { BaseWorkflowPack } from '../../sdk/BaseWorkflowPack.js';

export const DEVOPS_PACK_MANIFEST = {
  id:                 'flow.builtin.devops-pack',
  name:               'DevOps Automation Pack',
  version:            '1.0.0',
  author:             { name: 'FLOW OS', email: 'platform@flowos.io' },
  description:        'Workflow templates for DevOps: deployment pipeline, rollback, capacity alert response, cost anomaly, and security patch coordination.',
  category:           'workflow_pack',
  license:            'FLOW-ENTERPRISE',
  permissions:        ['workflows.register', 'executions.read', 'events.read', 'events.write', 'graph.read'],
  minimumFlowVersion: '14.0.0',
  dependencies:       {},
  tags:               ['devops', 'deployment', 'infrastructure', 'rollback', 'security', 'cost'],
};

export class DevOpsPack extends BaseWorkflowPack {
  workflowDefinitions() {
    return [
      {
        definition: {
          id:          'flow.devops.deployment-gate',
          version:     '1.0.0',
          name:        'Deployment Gate',
          description: 'Enforce pre-deployment checks: open critical issues, PR review status, and CRITICAL approval before production deploy.',
          connectors:  ['github'],
          steps: [
            { id: 'check_critical_issues', action: 'github.issues.list',          connector: 'github', params: { labels: ['critical'], state: 'open' } },
            { id: 'check_pr_status',       action: 'github.pull_requests.list',   connector: 'github', params: { state: 'open' } },
            { id: 'request_approval',      action: 'flow.approvals.create',       connector: 'flow',   params: { risk_level: 'CRITICAL' } },
            { id: 'trigger_deploy',        action: 'github.deployments.create',   connector: 'github', params: {} },
            { id: 'notify_channel',        action: 'flow.notifications.send',     connector: 'flow',   params: { priority: 'high' } },
          ],
        },
      },
      {
        definition: {
          id:          'flow.devops.emergency-rollback',
          version:     '1.0.0',
          name:        'Emergency Rollback',
          description: 'Immediately roll back a deployment and page the on-call team when error rate spikes.',
          connectors:  ['github'],
          steps: [
            { id: 'approve_rollback', action: 'flow.approvals.create',            connector: 'flow',   params: { risk_level: 'HIGH' } },
            { id: 'rollback',         action: 'github.deployments.create',        connector: 'github', params: { environment: 'production', description: 'ROLLBACK' } },
            { id: 'page_oncall',      action: 'flow.notifications.send',          connector: 'flow',   params: { priority: 'critical' } },
            { id: 'create_issue',     action: 'github.issues.create',             connector: 'github', params: { labels: ['incident', 'rollback'] } },
          ],
        },
      },
      {
        definition: {
          id:          'flow.devops.capacity-alert-response',
          version:     '1.0.0',
          name:        'Capacity Alert Response',
          description: 'Respond to infrastructure capacity alerts by identifying affected services and creating scale-up tasks.',
          connectors:  ['github'],
          steps: [
            { id: 'identify_services', action: 'graph.query.impacted_services',   connector: 'flow',   params: {} },
            { id: 'create_task',       action: 'jira.issues.create',              connector: 'jira',   params: { labels: ['infra', 'capacity'] } },
            { id: 'notify_team',       action: 'flow.notifications.send',         connector: 'flow',   params: {} },
          ],
        },
      },
      {
        definition: {
          id:          'flow.devops.security-patch',
          version:     '1.0.0',
          name:        'Security Patch Coordination',
          description: 'Coordinate security patch deployment across repositories with change control and compliance tracking.',
          connectors:  ['github'],
          steps: [
            { id: 'audit_repos',     action: 'github.search.code',              connector: 'github', params: {} },
            { id: 'create_prs',      action: 'github.pull_requests.create',     connector: 'github', params: {} },
            { id: 'approve_patches', action: 'flow.approvals.create',           connector: 'flow',   params: { risk_level: 'HIGH' } },
            { id: 'track_compliance', action: 'flow.events.publish',            connector: 'flow',   params: { type: 'SECURITY_PATCH_APPLIED' } },
          ],
        },
      },
    ];
  }
}
