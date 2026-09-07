/**
 * Engineering Bug Intake Planner
 *
 * Converts a bug-report email into a concrete ExecutionPlan.
 * Infers issue priority from keyword signals in subject/body.
 *
 * Plan steps emitted:
 *   read_bug_email          (action:gmail:read)
 *   label_processing        (action:gmail:update, critical:false)
 *   create_bug_ticket       (action:jira:create)
 *   assign_engineer         (action:jira:update)
 *   add_source_comment      (action:jira:execute/comment, critical:false)
 *   notify_engineering      (action:slack:send, critical:false)
 *   archive_email           (action:gmail:update, critical:false)
 */

import { ValidationError } from '../../core/errors/index.js';

const DEFAULT_PROJECT_KEY   = 'HPLT';
const DEFAULT_SLACK_CHANNEL = process.env.ENGINEERING_SLACK_CHANNEL || 'C_ENGINEERING';
const DEFAULT_ENGINEER      = 'Kishore Varma';

/** Infer Jira priority from email signal words. */
function inferPriority(subject = '', body = '') {
  const text = `${subject} ${body}`.toLowerCase();
  if (/critical|outage|down|production|sev1|p0/.test(text))   return 'Highest';
  if (/urgent|blocker|crash|regression|p1/.test(text))        return 'High';
  if (/issue|bug|broken|fail|error/.test(text))               return 'Medium';
  return 'Low';
}

/**
 * @param {object} params
 * @param {string} params.workspaceId
 * @param {string} params.messageId       — Gmail message ID
 * @param {string} params.bugTitle        — Issue summary
 * @param {string} params.reporterEmail   — Who reported the bug
 * @param {string} [params.bugDescription]
 * @param {string} [params.assigneeEngineer]
 * @param {string} [params.jiraProjectKey]
 * @param {string} [params.slackChannelId]
 * @param {string} [params.priority]      — Override auto-inferred priority
 */
export function buildEngineeringBugIntakePlan({
  workspaceId,
  messageId,
  bugTitle,
  reporterEmail,
  bugDescription = '',
  assigneeEngineer = DEFAULT_ENGINEER,
  jiraProjectKey   = DEFAULT_PROJECT_KEY,
  slackChannelId   = DEFAULT_SLACK_CHANNEL,
  priority,
}) {
  if (!workspaceId)   throw new ValidationError('workspaceId is required');
  if (!messageId)     throw new ValidationError('messageId is required');
  if (!bugTitle)      throw new ValidationError('bugTitle is required');
  if (!reporterEmail) throw new ValidationError('reporterEmail is required');

  const resolvedPriority = priority ?? inferPriority(bugTitle, bugDescription);

  const steps = [
    {
      id:          'read_bug_email',
      type:        'action',
      name:        'Read Bug Report Email',
      connectorId: 'gmail',
      actionType:  'read',
      payload:     { messageId },
      verifyField: 'id',
      trackIn:     '_email',
      retryable:   true,
    },
    {
      id:          'label_processing',
      type:        'action',
      name:        'Label Email as Processing',
      connectorId: 'gmail',
      actionType:  'update',
      critical:    false,
      payload: {
        messageId,
        addLabels: ['STARRED'],
      },
    },
    {
      id:          'create_bug_ticket',
      type:        'action',
      name:        `Create Bug Ticket — ${resolvedPriority}`,
      connectorId: 'jira',
      actionType:  'create',
      payload: {
        projectKey:  jiraProjectKey,
        title:       bugTitle,
        issueType:   'Bug',
        priority:    resolvedPriority,
        description: `Reported by: ${reporterEmail}\nEmail ID: ${messageId}\n\n${bugDescription}`,
        labels:      ['email-reported', 'needs-triage'],
      },
      verifyField: 'id',
      trackIn:     '_bugTicket',
      retryable:   true,
    },
    {
      id:          'assign_engineer',
      type:        'action',
      name:        `Assign to ${assigneeEngineer}`,
      connectorId: 'jira',
      actionType:  'update',
      buildPayload: (ctx) => ({
        key:      ctx.variables._bugTicket?.key,
        assignee: assigneeEngineer,
      }),
      retryable: true,
    },
    {
      id:          'add_source_comment',
      type:        'action',
      name:        'Add Source Context Comment',
      connectorId: 'jira',
      actionType:  'execute',
      critical:    false,
      buildPayload: (ctx) => ({
        resourceType: 'comment',
        key:          ctx.variables._bugTicket?.key,
        comment:      `Bug reported via email from ${reporterEmail}.\nGmail message ID: ${messageId}\nAuto-priority: ${resolvedPriority}`,
      }),
    },
    {
      id:          'notify_engineering',
      type:        'action',
      name:        'Notify Engineering Channel',
      connectorId: 'slack',
      actionType:  'send',
      critical:    false,
      buildPayload: (ctx) => ({
        channelId: slackChannelId,
        text: `:bug: *Bug Intake* — ${resolvedPriority}\n*Title:* ${bugTitle}\n*Ticket:* ${ctx.variables._bugTicket?.key ?? 'N/A'}\n*Assignee:* ${assigneeEngineer}\n*Reported by:* ${reporterEmail}`,
      }),
    },
    {
      id:          'archive_email',
      type:        'action',
      name:        'Archive Processed Email',
      connectorId: 'gmail',
      actionType:  'update',
      critical:    false,
      payload: {
        messageId,
        action: 'archive',
      },
    },
  ];

  return {
    workflowId:   'engineering-bug-intake',
    workflowName: `Bug Intake: ${bugTitle}`,
    plannedAt:    new Date().toISOString(),
    params:       { workspaceId, messageId, bugTitle, reporterEmail, assigneeEngineer, jiraProjectKey, slackChannelId, priority: resolvedPriority },
    summary: {
      totalSteps:      steps.length,
      bugTitle,
      reporterEmail,
      inferredPriority: resolvedPriority,
      assigneeEngineer,
      jiraProjectKey,
    },
    steps,
  };
}
