import { BaseWorkflowPack } from '../../sdk/BaseWorkflowPack.js';

export const ENGINEERING_PACK_MANIFEST = {
  id:                 'flow.builtin.engineering-pack',
  name:               'Engineering Intelligence Pack',
  version:            '1.0.0',
  author:             { name: 'FLOW OS', email: 'platform@flowos.io' },
  description:        'Workflow templates for software engineering teams: code review, release coordination, on-call handoff, incident retrospective, and sprint planning.',
  category:           'workflow_pack',
  license:            'FLOW-ENTERPRISE',
  permissions:        ['workflows.register', 'executions.read', 'events.read', 'graph.read'],
  minimumFlowVersion: '14.0.0',
  dependencies:       {},
  tags:               ['engineering', 'devops', 'github', 'code-review', 'release'],
};

export class EngineeringPack extends BaseWorkflowPack {
  workflowDefinitions() {
    return [
      {
        definition: {
          id:          'flow.engineering.code-review-assignment',
          version:     '1.0.0',
          name:        'Code Review Assignment',
          description: 'Assign pull request reviewers based on file ownership and availability from the graph.',
          connectors:  ['github'],
          steps: [
            { id: 'get_pr',       action: 'github.pull_requests.get',            connector: 'github', params: {} },
            { id: 'find_owners',  action: 'graph.query.file_owners',             connector: 'graph',  params: {} },
            { id: 'assign',       action: 'github.pull_requests.request_review', connector: 'github', params: {} },
            { id: 'notify',       action: 'flow.notifications.send',             connector: 'flow',   params: {} },
          ],
        },
      },
      {
        definition: {
          id:          'flow.engineering.release-checklist',
          version:     '1.0.0',
          name:        'Release Readiness Checklist',
          description: 'Validate open PRs, pending reviews, failing CI, and approval status before a release.',
          connectors:  ['github'],
          steps: [
            { id: 'check_prs',     action: 'github.pull_requests.list',     connector: 'github', params: { state: 'open' } },
            { id: 'check_ci',      action: 'github.deployments.list',       connector: 'github', params: {} },
            { id: 'check_approvals', action: 'flow.approvals.list_pending', connector: 'flow',   params: {} },
            { id: 'generate_report', action: 'flow.executive.brief',        connector: 'flow',   params: { type: 'daily' } },
          ],
        },
      },
      {
        definition: {
          id:          'flow.engineering.incident-response',
          version:     '1.0.0',
          name:        'Incident Response Playbook',
          description: 'Page on-call, create incident channel, assign DRI, and begin retrospective automatically.',
          connectors:  ['github', 'slack'],
          steps: [
            { id: 'page_oncall',    action: 'flow.notifications.send',      connector: 'flow',   params: { priority: 'critical' } },
            { id: 'create_channel', action: 'slack.channels.create',        connector: 'slack',  params: {} },
            { id: 'assign_dri',     action: 'graph.query.team_oncall',      connector: 'graph',  params: {} },
            { id: 'open_issue',     action: 'github.issues.create',         connector: 'github', params: { labels: ['incident'] } },
          ],
        },
      },
      {
        definition: {
          id:          'flow.engineering.on-call-handoff',
          version:     '1.0.0',
          name:        'On-Call Handoff',
          description: 'Generate a handoff summary from recent incidents, open PRs, and pending approvals.',
          connectors:  ['github'],
          steps: [
            { id: 'gather_incidents', action: 'flow.risks.list',            connector: 'flow',   params: { category: 'infrastructure_risk' } },
            { id: 'gather_prs',       action: 'github.pull_requests.list',  connector: 'github', params: { state: 'open' } },
            { id: 'generate_brief',   action: 'flow.executive.brief',       connector: 'flow',   params: { type: 'daily' } },
            { id: 'send_summary',     action: 'flow.notifications.send',    connector: 'flow',   params: {} },
          ],
        },
      },
      {
        definition: {
          id:          'flow.engineering.sprint-kickoff',
          version:     '1.0.0',
          name:        'Sprint Kickoff',
          description: 'Pull backlog items, assign to team members based on graph workload, and create a sprint summary.',
          connectors:  ['jira', 'github'],
          steps: [
            { id: 'get_backlog',  action: 'jira.issues.list',       connector: 'jira',   params: { status: 'backlog' } },
            { id: 'get_workload', action: 'graph.query.team_load',   connector: 'graph',  params: {} },
            { id: 'assign_tasks', action: 'jira.issues.bulk_update', connector: 'jira',   params: {} },
            { id: 'send_brief',   action: 'flow.executive.brief',    connector: 'flow',   params: { type: 'weekly' } },
          ],
        },
      },
    ];
  }
}
