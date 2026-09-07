/**
 * Customer Complaint Resolution Workflow
 *
 * End-to-end pipeline triggered when a customer complaint email arrives.
 * The planner reads the complaint, creates a Jira ticket, assigns an owner,
 * notifies Slack, drafts a reply, waits for human approval, then sends the email.
 *
 * Connectors: gmail, jira, slack
 * Adapters required: GmailAdapter, JiraAdapter (SlackAdapter optional)
 */

export const CUSTOMER_COMPLAINT_WORKFLOW = {
  id:          'customer-complaint-resolution',
  version:     '1.0.0',
  name:        'Customer Complaint Resolution',
  description: 'Reads a complaint email, opens a Jira ticket, assigns an owner, notifies the team, drafts a reply, and sends it after approval.',
  connectors:  ['gmail', 'jira', 'slack'],

  // Static steps (used when no planner is registered or params don't require dynamic resolution)
  steps: [
    {
      id:          'read_complaint',
      type:        'action',
      name:        'Read Complaint Email',
      connectorId: 'gmail',
      actionType:  'read',
      payload:     { messageId: '{{params.messageId}}' },
      retryable:   true,
    },
    {
      id:          'create_jira_ticket',
      type:        'action',
      name:        'Create Jira Support Ticket',
      connectorId: 'jira',
      actionType:  'create',
      payload: {
        projectKey: '{{params.jiraProjectKey}}',
        title:      'Customer Complaint: {{params.subject}}',
        issueType:  'Bug',
        priority:   'High',
        description: '{{params.body}}',
      },
      verifyField: 'id',
      trackIn:     '_jiraIssue',
      retryable:   true,
    },
    {
      id:          'assign_owner',
      type:        'action',
      name:        'Assign Issue Owner',
      connectorId: 'jira',
      actionType:  'update',
      payload: {
        key:      '{{_jiraIssue.key}}',
        assignee: '{{params.ownerName}}',
      },
      retryable: true,
    },
    {
      id:          'notify_slack',
      type:        'action',
      name:        'Notify Support Channel',
      connectorId: 'slack',
      actionType:  'send',
      critical:    false,
      payload: {
        channelId: '{{params.slackChannelId}}',
        text:      ':warning: New customer complaint: *{{params.subject}}* → <{{_jiraIssue.url}}|{{_jiraIssue.key}}> assigned to {{params.ownerName}}',
      },
    },
    {
      id:          'draft_reply',
      type:        'action',
      name:        'Draft Reply Email',
      connectorId: 'gmail',
      actionType:  'create',
      payload: {
        to:      '{{params.customerEmail}}',
        subject: 'Re: {{params.subject}}',
        body:    '{{params.draftReplyBody}}',
      },
      verifyField: 'draftId',
      trackIn:     '_draft',
      retryable:   true,
    },
    {
      id:     'approve_reply',
      type:   'approval',
      name:   'Approve Customer Reply',
      reason: 'Review draft reply before sending to customer',
    },
    {
      id:          'send_reply',
      type:        'action',
      name:        'Send Reply to Customer',
      connectorId: 'gmail',
      actionType:  'send',
      payload: {
        to:      '{{params.customerEmail}}',
        subject: 'Re: {{params.subject}}',
        body:    '{{params.draftReplyBody}}',
      },
      verifyField: 'messageId',
      retryable:   true,
    },
    {
      id:          'close_jira_issue',
      type:        'action',
      name:        'Close Jira Ticket',
      connectorId: 'jira',
      actionType:  'execute',
      payload: {
        resourceType: 'close',
        key:          '{{_jiraIssue.key}}',
        resolution:   'Fixed',
        comment:      'Reply sent to customer. Closing ticket.',
      },
      critical: false,
    },
  ],
};
