/**
 * Engineering Bug Intake Workflow
 *
 * Triggered when a bug report arrives via email. Extracts bug details,
 * creates a Jira bug ticket, assigns it to the relevant engineer, and
 * notifies the engineering channel.
 *
 * Connectors: gmail, jira, slack
 */

export const ENGINEERING_BUG_INTAKE_WORKFLOW = {
  id:          'engineering-bug-intake',
  version:     '1.0.0',
  name:        'Engineering Bug Intake',
  description: 'Reads a bug-report email, creates a Jira bug ticket, assigns it to an engineer, and notifies the team channel.',
  connectors:  ['gmail', 'jira', 'slack'],

  steps: [
    {
      id:          'read_bug_email',
      type:        'action',
      name:        'Read Bug Report Email',
      connectorId: 'gmail',
      actionType:  'read',
      payload:     { messageId: '{{params.messageId}}' },
      verifyField: 'id',
      trackIn:     '_email',
      retryable:   true,
    },
    {
      id:          'label_email_processing',
      type:        'action',
      name:        'Label Email as Processing',
      connectorId: 'gmail',
      actionType:  'update',
      critical:    false,
      payload: {
        messageId:  '{{params.messageId}}',
        addLabels:  ['STARRED'],
      },
    },
    {
      id:          'create_bug_ticket',
      type:        'action',
      name:        'Create Jira Bug Ticket',
      connectorId: 'jira',
      actionType:  'create',
      payload: {
        projectKey:  '{{params.jiraProjectKey}}',
        title:       '{{params.bugTitle}}',
        issueType:   'Bug',
        priority:    '{{params.priority}}',
        description: '{{params.bugDescription}}',
        labels:      ['email-reported', 'needs-triage'],
      },
      verifyField: 'id',
      trackIn:     '_bugTicket',
      retryable:   true,
    },
    {
      id:          'assign_engineer',
      type:        'action',
      name:        'Assign to Engineer',
      connectorId: 'jira',
      actionType:  'update',
      payload: {
        key:      '{{_bugTicket.key}}',
        assignee: '{{params.assigneeEngineer}}',
      },
      retryable: true,
    },
    {
      id:          'add_comment',
      type:        'action',
      name:        'Add Source Context Comment',
      connectorId: 'jira',
      actionType:  'execute',
      payload: {
        resourceType: 'comment',
        key:          '{{_bugTicket.key}}',
        comment:      'Bug reported via email from {{params.reporterEmail}}. Original email message ID: {{params.messageId}}',
      },
      critical: false,
    },
    {
      id:          'notify_engineering',
      type:        'action',
      name:        'Notify Engineering Channel',
      connectorId: 'slack',
      actionType:  'send',
      critical:    false,
      payload: {
        channelId: '{{params.slackChannelId}}',
        text:      ':bug: New bug reported: *{{params.bugTitle}}* → {{_bugTicket.key}} ({{params.priority}}) assigned to {{params.assigneeEngineer}}',
      },
    },
    {
      id:          'archive_email',
      type:        'action',
      name:        'Archive Processed Email',
      connectorId: 'gmail',
      actionType:  'update',
      critical:    false,
      payload: {
        messageId: '{{params.messageId}}',
        action:    'archive',
      },
    },
  ],
};
