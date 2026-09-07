import { BaseWorkflowPack } from '../../sdk/BaseWorkflowPack.js';

export const COMPLIANCE_PACK_MANIFEST = {
  id:                 'flow.builtin.compliance-pack',
  name:               'Compliance & Audit Pack',
  version:            '1.0.0',
  author:             { name: 'FLOW OS', email: 'platform@flowos.io' },
  description:        'Workflow templates for compliance: SOC 2 evidence collection, access review, vendor risk assessment, policy exception approval, and quarterly security audit.',
  category:           'workflow_pack',
  license:            'FLOW-ENTERPRISE',
  permissions:        ['workflows.register', 'executions.read', 'events.read', 'events.write', 'graph.read', 'memory.read'],
  minimumFlowVersion: '14.0.0',
  dependencies:       {},
  tags:               ['compliance', 'soc2', 'audit', 'security', 'vendor', 'access-review'],
};

export class CompliancePack extends BaseWorkflowPack {
  workflowDefinitions() {
    return [
      {
        definition: {
          id:          'flow.compliance.soc2-evidence-collection',
          version:     '1.0.0',
          name:        'SOC 2 Evidence Collection',
          description: 'Automatically gather evidence for SOC 2 controls: access logs, change control records, and incident reports.',
          connectors:  ['github', 'google-calendar'],
          steps: [
            { id: 'collect_audit_logs',   action: 'flow.audit.list',              connector: 'flow',   params: {} },
            { id: 'collect_pr_records',   action: 'github.pull_requests.list',    connector: 'github', params: { state: 'closed' } },
            { id: 'collect_incidents',    action: 'flow.risks.list',              connector: 'flow',   params: { category: 'security_risk' } },
            { id: 'collect_approvals',    action: 'flow.approvals.list_history',  connector: 'flow',   params: {} },
            { id: 'generate_report',      action: 'flow.executive.brief',         connector: 'flow',   params: { type: 'quarterly' } },
            { id: 'notify_auditor',       action: 'flow.notifications.send',      connector: 'flow',   params: {} },
          ],
        },
      },
      {
        definition: {
          id:          'flow.compliance.access-review',
          version:     '1.0.0',
          name:        'Access Review Cycle',
          description: 'Quarterly review of all system access rights — identify over-privileged accounts and revoke stale access.',
          connectors:  ['github'],
          steps: [
            { id: 'get_all_access',     action: 'flow.graph.query.all_permissions', connector: 'flow',   params: {} },
            { id: 'flag_stale',         action: 'flow.graph.query.inactive_users',  connector: 'flow',   params: { days: 90 } },
            { id: 'request_revocations', action: 'flow.approvals.create',           connector: 'flow',   params: { risk_level: 'MEDIUM' } },
            { id: 'publish_event',      action: 'flow.events.publish',              connector: 'flow',   params: { type: 'ACCESS_REVIEW_COMPLETED' } },
          ],
        },
      },
      {
        definition: {
          id:          'flow.compliance.vendor-risk-assessment',
          version:     '1.0.0',
          name:        'Vendor Risk Assessment',
          description: 'Assess third-party vendor risk by querying integration health, data access scope, and contract status.',
          connectors:  [],
          steps: [
            { id: 'query_integrations', action: 'flow.connectors.health',           connector: 'flow', params: {} },
            { id: 'query_permissions',  action: 'flow.permissions.list',            connector: 'flow', params: {} },
            { id: 'create_risk_task',   action: 'jira.issues.create',               connector: 'jira', params: { labels: ['vendor-risk'] } },
            { id: 'notify_cso',         action: 'flow.notifications.send',          connector: 'flow', params: { role: 'OWNER' } },
          ],
        },
      },
      {
        definition: {
          id:          'flow.compliance.policy-exception',
          version:     '1.0.0',
          name:        'Policy Exception Approval',
          description: 'Route policy exception requests through a two-person CRITICAL approval chain and log to the audit trail.',
          connectors:  [],
          steps: [
            { id: 'create_approval',  action: 'flow.approvals.create',     connector: 'flow', params: { risk_level: 'CRITICAL' } },
            { id: 'publish_event',    action: 'flow.events.publish',        connector: 'flow', params: { type: 'POLICY_EXCEPTION_REQUESTED' } },
            { id: 'log_outcome',      action: 'flow.audit.write',           connector: 'flow', params: {} },
          ],
        },
      },
      {
        definition: {
          id:          'flow.compliance.quarterly-security-audit',
          version:     '1.0.0',
          name:        'Quarterly Security Audit',
          description: 'Full quarterly security sweep: active risks, stale credentials, unresolved incidents, and policy compliance.',
          connectors:  ['github'],
          steps: [
            { id: 'security_risks',   action: 'flow.risks.list',            connector: 'flow',   params: { category: 'security_risk' } },
            { id: 'dependency_scan',  action: 'github.search.code',         connector: 'github', params: {} },
            { id: 'stale_approvals',  action: 'flow.approvals.list_history', connector: 'flow',  params: { status: 'EXPIRED' } },
            { id: 'brief_board',      action: 'flow.executive.brief',       connector: 'flow',   params: { type: 'board' } },
          ],
        },
      },
    ];
  }
}
