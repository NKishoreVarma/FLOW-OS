import { BaseWorkflowPack } from '../../sdk/BaseWorkflowPack.js';

export const HR_PACK_MANIFEST = {
  id:                 'flow.builtin.hr-pack',
  name:               'HR Operations Pack',
  version:            '1.0.0',
  author:             { name: 'FLOW OS', email: 'platform@flowos.io' },
  description:        'Workflow templates for HR: employee onboarding, offboarding, performance review kickoff, leave approval, and org-chart sync.',
  category:           'workflow_pack',
  license:            'FLOW-ENTERPRISE',
  permissions:        ['workflows.register', 'executions.read', 'events.read', 'graph.read', 'graph.write'],
  minimumFlowVersion: '14.0.0',
  dependencies:       {},
  tags:               ['hr', 'people', 'onboarding', 'offboarding', 'performance'],
};

export class HRPack extends BaseWorkflowPack {
  workflowDefinitions() {
    return [
      {
        definition: {
          id:          'flow.hr.employee-onboarding',
          version:     '1.0.0',
          name:        'Employee Onboarding',
          description: 'Provision accounts, assign buddy, schedule 1:1s, and set up tools for a new hire.',
          connectors:  ['google-calendar', 'slack', 'github'],
          steps: [
            { id: 'create_accounts',    action: 'flow.graph.upsert_node',        connector: 'flow',            params: { type: 'EMPLOYEE' } },
            { id: 'send_welcome',       action: 'gmail.send',                    connector: 'gmail',           params: {} },
            { id: 'schedule_onboarding', action: 'google-calendar.events.create', connector: 'google-calendar', params: {} },
            { id: 'add_to_channels',    action: 'slack.channels.invite',         connector: 'slack',           params: {} },
            { id: 'assign_buddy',       action: 'flow.graph.query.peer_buddy',   connector: 'flow',            params: {} },
          ],
        },
      },
      {
        definition: {
          id:          'flow.hr.employee-offboarding',
          version:     '1.0.0',
          name:        'Employee Offboarding',
          description: 'Revoke access, transfer knowledge, and archive employee graph nodes.',
          connectors:  ['github', 'slack', 'google-calendar'],
          steps: [
            { id: 'revoke_github',   action: 'github.repos.remove_collaborator', connector: 'github',          params: {} },
            { id: 'archive_node',    action: 'flow.graph.set_status',            connector: 'flow',            params: { status: 'offboarded' } },
            { id: 'transfer_issues', action: 'jira.issues.bulk_reassign',        connector: 'jira',            params: {} },
            { id: 'final_meeting',   action: 'google-calendar.events.create',    connector: 'google-calendar', params: { title: 'Exit Interview' } },
          ],
        },
      },
      {
        definition: {
          id:          'flow.hr.performance-review-kickoff',
          version:     '1.0.0',
          name:        'Performance Review Kickoff',
          description: 'Notify employees and managers, create review tasks in Jira, and schedule 1:1 review sessions.',
          connectors:  ['jira', 'google-calendar', 'gmail'],
          steps: [
            { id: 'notify_all',     action: 'gmail.send_bulk',               connector: 'gmail',           params: {} },
            { id: 'create_tasks',   action: 'jira.issues.create_bulk',       connector: 'jira',            params: { type: 'Task', labels: ['performance-review'] } },
            { id: 'schedule_1on1',  action: 'google-calendar.events.create', connector: 'google-calendar', params: {} },
          ],
        },
      },
      {
        definition: {
          id:          'flow.hr.leave-approval',
          version:     '1.0.0',
          name:        'Leave Request Approval',
          description: 'Route leave requests through governance, notify manager, and block calendar.',
          connectors:  ['google-calendar', 'gmail'],
          steps: [
            { id: 'request_approval', action: 'flow.approvals.create',          connector: 'flow',            params: { type: 'leave_request' } },
            { id: 'notify_manager',   action: 'gmail.send',                    connector: 'gmail',           params: {} },
            { id: 'block_calendar',   action: 'google-calendar.events.create', connector: 'google-calendar', params: { status: 'OOO' } },
          ],
        },
      },
    ];
  }
}
