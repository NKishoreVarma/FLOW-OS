/**
 * Customer Complaint Resolution Planner
 *
 * Converts a complaint email payload into a concrete ExecutionPlan.
 * All intelligence lives here; the RuntimeEngine stays workflow-agnostic.
 *
 * Plan steps emitted:
 *   read_complaint    (action:gmail:read)
 *   create_jira       (action:jira:create)
 *   assign_owner      (action:jira:update)
 *   notify_slack      (action:slack:send, critical:false)
 *   draft_reply       (action:gmail:create)
 *   approve_reply     (approval gate)
 *   send_reply        (action:gmail:send)
 *   close_jira        (action:jira:execute/close, critical:false)
 */

import { ValidationError } from '../../core/errors/index.js';

const DEFAULT_PROJECT_KEY    = 'HPLT';
const DEFAULT_SLACK_CHANNEL  = process.env.SUPPORT_SLACK_CHANNEL || 'C_SUPPORT';
const DEFAULT_OWNER          = 'Rahul Singh';
const DEFAULT_REPLY_TEMPLATE = `Hi {{name}},

Thank you for reaching out. I've reviewed your message and created an internal ticket to track this issue.

Our team will follow up with a resolution within 24 hours.

Best regards,
The Support Team`;

/**
 * @param {object} params
 * @param {string} params.workspaceId
 * @param {string} params.messageId        — Gmail message ID of the complaint email
 * @param {string} params.subject          — Email subject
 * @param {string} params.customerEmail    — Sender's email address
 * @param {string} [params.customerName]   — Sender's name (for reply body personalisation)
 * @param {string} [params.body]           — Email body text (for Jira description)
 * @param {string} [params.jiraProjectKey] — Jira project to file the ticket in
 * @param {string} [params.ownerName]      — Team member to assign the ticket to
 * @param {string} [params.slackChannelId] — Slack channel for team notification
 * @param {string} [params.draftReplyBody] — Override the reply body
 * @returns {ExecutionPlan}
 */
export function buildCustomerComplaintPlan({
  workspaceId,
  messageId,
  subject,
  customerEmail,
  customerName,
  body       = '',
  jiraProjectKey = DEFAULT_PROJECT_KEY,
  ownerName      = DEFAULT_OWNER,
  slackChannelId = DEFAULT_SLACK_CHANNEL,
  draftReplyBody,
}) {
  if (!workspaceId)    throw new ValidationError('workspaceId is required');
  if (!messageId)      throw new ValidationError('messageId is required');
  if (!subject)        throw new ValidationError('subject is required');
  if (!customerEmail)  throw new ValidationError('customerEmail is required');

  const replyBody = draftReplyBody
    ?? DEFAULT_REPLY_TEMPLATE.replace('{{name}}', customerName || customerEmail.split('@')[0]);

  const steps = [
    {
      id:          'read_complaint',
      type:        'action',
      name:        'Read Complaint Email',
      connectorId: 'gmail',
      actionType:  'read',
      payload:     { messageId },
      retryable:   true,
    },
    {
      id:          'create_jira_ticket',
      type:        'action',
      name:        'Create Jira Support Ticket',
      connectorId: 'jira',
      actionType:  'create',
      payload: {
        projectKey:  jiraProjectKey,
        title:       `Customer Complaint: ${subject}`,
        issueType:   'Bug',
        priority:    'High',
        description: `Customer: ${customerEmail}\nSubject: ${subject}\n\n${body}`,
        labels:      ['customer-reported', 'complaint'],
      },
      verifyField: 'id',
      trackIn:     '_jiraIssue',
      retryable:   true,
    },
    {
      id:          'assign_owner',
      type:        'action',
      name:        `Assign Ticket to ${ownerName}`,
      connectorId: 'jira',
      actionType:  'update',
      buildPayload: (ctx) => ({
        key:      ctx.variables._jiraIssue?.key,
        assignee: ownerName,
      }),
      retryable: true,
    },
    {
      id:          'notify_slack',
      type:        'action',
      name:        'Notify Support Channel',
      connectorId: 'slack',
      actionType:  'send',
      critical:    false,
      buildPayload: (ctx) => ({
        channelId: slackChannelId,
        text: `:warning: *Customer Complaint* from ${customerEmail}\n*Subject:* ${subject}\n*Ticket:* ${ctx.variables._jiraIssue?.key ?? 'N/A'} → assigned to ${ownerName}`,
      }),
    },
    {
      id:          'draft_reply',
      type:        'action',
      name:        'Draft Reply to Customer',
      connectorId: 'gmail',
      actionType:  'create',
      payload: {
        to:      customerEmail,
        subject: subject.startsWith('Re:') ? subject : `Re: ${subject}`,
        body:    replyBody,
      },
      verifyField: 'draftId',
      trackIn:     '_draft',
      retryable:   true,
    },
    {
      id:     'approve_reply',
      type:   'approval',
      name:   'Approve Customer Reply',
      reason: `Review draft reply to ${customerEmail} before sending`,
    },
    {
      id:          'send_reply',
      type:        'action',
      name:        'Send Reply to Customer',
      connectorId: 'gmail',
      actionType:  'send',
      payload: {
        to:      customerEmail,
        subject: subject.startsWith('Re:') ? subject : `Re: ${subject}`,
        body:    replyBody,
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
      critical:    false,
      buildPayload: (ctx) => ({
        resourceType: 'close',
        key:          ctx.variables._jiraIssue?.key,
        resolution:   'Fixed',
        comment:      `Reply sent to customer ${customerEmail} on ${new Date().toISOString()}.`,
      }),
    },
  ];

  return {
    workflowId:   'customer-complaint-resolution',
    workflowName: `Complaint: ${subject}`,
    plannedAt:    new Date().toISOString(),
    params:       { workspaceId, messageId, subject, customerEmail, ownerName, jiraProjectKey, slackChannelId },
    summary: {
      totalSteps:    steps.length,
      customerEmail,
      subject,
      ownerName,
      jiraProjectKey,
    },
    steps,
  };
}
