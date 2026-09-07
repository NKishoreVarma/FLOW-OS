/**
 * Weekly Customer Follow-Up Planner
 *
 * Generates a follow-up plan for customer threads that have been waiting
 * more than N days for a response.
 *
 * Plan steps emitted:
 *   search_threads    (action:gmail:search)
 *   check_results     (conditional — short-circuits if no threads found)
 *     ↳ draft_loop    (loop over items)
 *         ↳ draft_followup (action:gmail:create)
 *   approve_batch     (approval gate)
 *   send_loop         (loop over items)
 *     ↳ send_followup (action:gmail:send)
 *   create_tracking   (action:jira:create, critical:false)
 *   notify_completion (action:slack:send, critical:false)
 */

import { ValidationError } from '../../core/errors/index.js';

const DEFAULT_PROJECT_KEY   = 'HPLT';
const DEFAULT_SLACK_CHANNEL = process.env.SUPPORT_SLACK_CHANNEL || 'C_SUPPORT';
const DEFAULT_FOLLOW_UP_DAYS = 7;

const DEFAULT_FOLLOW_UP_TEMPLATE = (subject, senderName = 'there') =>
  `Hi ${senderName},\n\nI wanted to follow up on our previous conversation about "${subject}".\n\nIs there anything else we can help you with, or has this been resolved?\n\nBest regards,\nThe Support Team`;

/**
 * @param {object} params
 * @param {string}  params.workspaceId
 * @param {number}  [params.waitDays=7]          — Min days a thread has been waiting
 * @param {string}  [params.searchQuery]         — Override Gmail query (defaults to older_than:{N}d)
 * @param {string}  [params.followUpTemplate]    — Override the body template string (use {{subject}} placeholder)
 * @param {string}  [params.jiraProjectKey]
 * @param {string}  [params.slackChannelId]
 * @param {string}  [params.defaultRecipient]    — Fallback recipient if thread has no clear sender
 */
export function buildWeeklyCustomerFollowUpPlan({
  workspaceId,
  waitDays       = DEFAULT_FOLLOW_UP_DAYS,
  searchQuery,
  followUpTemplate,
  jiraProjectKey   = DEFAULT_PROJECT_KEY,
  slackChannelId   = DEFAULT_SLACK_CHANNEL,
  defaultRecipient = '',
}) {
  if (!workspaceId) throw new ValidationError('workspaceId is required');

  const resolvedQuery = searchQuery
    ?? `label:customer is:unread older_than:${waitDays}d -label:follow-up-sent`;

  const resolvedTemplate = followUpTemplate
    ?? '{{subject}}';  // planner passes the template; buildPayload closure renders it at execution time

  const steps = [
    {
      id:          'search_waiting_threads',
      type:        'action',
      name:        `Search Customer Threads Waiting >${waitDays} Days`,
      connectorId: 'gmail',
      actionType:  'search',
      payload:     { query: resolvedQuery, limit: 20 },
      trackIn:     '_waitingThreads',
      retryable:   true,
    },
    {
      id:        'check_results',
      type:      'conditional',
      name:      'Any waiting threads?',
      condition: '_waitingThreads.total > 0',
      then: {
        id:   'draft_loop',
        type: 'loop',
        name: 'Draft follow-up for each thread',
        over: '_waitingThreads.items',
        as:   'thread',
        body: {
          id:          'draft_followup',
          type:        'action',
          name:        'Draft Follow-up Email',
          connectorId: 'gmail',
          actionType:  'create',
          buildPayload: (ctx) => {
            const thread   = ctx.variables.thread ?? {};
            const subject  = thread.subject ?? thread.title ?? 'Our conversation';
            const sender   = thread.sender ?? defaultRecipient;
            const name     = sender.split('@')[0].replace(/[._-]/g, ' ');
            const body     = DEFAULT_FOLLOW_UP_TEMPLATE(subject, name);
            const reSubject = subject.startsWith('Re:') ? subject : `Re: ${subject}`;
            return {
              to:      sender,
              subject: reSubject,
              body,
              threadId: thread.threadId ?? thread.id,
            };
          },
          trackIn:  '_drafts',
          critical: false,
        },
      },
      else: {
        id:      'no_threads',
        type:    'skip',
        name:    'No waiting customer threads found',
        reasons: [`Gmail query "${resolvedQuery}" returned no results`],
      },
    },
    {
      id:     'approve_batch',
      type:   'approval',
      name:   'Approve Follow-up Batch',
      reason: 'Review all follow-up drafts before sending to customers',
    },
    {
      id:   'send_loop',
      type: 'loop',
      name: 'Send approved follow-up emails',
      over: '_waitingThreads.items',
      as:   'thread',
      body: {
        id:          'send_followup',
        type:        'action',
        name:        'Send Follow-up Email',
        connectorId: 'gmail',
        actionType:  'send',
        buildPayload: (ctx) => {
          const thread  = ctx.variables.thread ?? {};
          const subject = thread.subject ?? thread.title ?? 'Our conversation';
          const sender  = thread.sender ?? defaultRecipient;
          const name    = sender.split('@')[0].replace(/[._-]/g, ' ');
          const reSubject = subject.startsWith('Re:') ? subject : `Re: ${subject}`;
          return {
            to:       sender,
            subject:  reSubject,
            body:     DEFAULT_FOLLOW_UP_TEMPLATE(subject, name),
            inReplyTo: thread.id,
          };
        },
        trackIn:  '_sentEmails',
        critical: false,
      },
    },
    {
      id:          'label_sent_threads',
      type:        'loop',
      name:        'Label sent threads as follow-up-sent',
      over:        '_waitingThreads.items',
      as:          'thread',
      body: {
        id:          'label_thread',
        type:        'action',
        name:        'Label Thread',
        connectorId: 'gmail',
        actionType:  'update',
        buildPayload: (ctx) => ({
          threadId:   ctx.variables.thread?.threadId ?? ctx.variables.thread?.id,
          addLabels:  ['follow-up-sent'],
        }),
        critical: false,
      },
    },
    {
      id:          'create_tracking_ticket',
      type:        'action',
      name:        'Create Jira Outreach Tracking Ticket',
      connectorId: 'jira',
      actionType:  'create',
      critical:    false,
      buildPayload: (ctx) => {
        const found = (ctx.variables._waitingThreads?.items ?? []).length;
        const sent  = (ctx.variables._sentEmails ?? []).length;
        return {
          projectKey:  jiraProjectKey,
          title:       `Weekly Follow-Up Outreach — ${new Date().toISOString().slice(0, 10)}`,
          issueType:   'Task',
          priority:    'Low',
          description: `Weekly follow-up batch.\n\nQuery: ${resolvedQuery}\nThreads found: ${found}\nEmails sent: ${sent}`,
          labels:      ['weekly-followup', 'automated'],
        };
      },
    },
    {
      id:          'notify_completion',
      type:        'action',
      name:        'Notify Team of Completion',
      connectorId: 'slack',
      actionType:  'send',
      critical:    false,
      buildPayload: (ctx) => {
        const sent = (ctx.variables._sentEmails ?? []).length;
        return {
          channelId: slackChannelId,
          text:      `:white_check_mark: *Weekly Follow-Up Complete* — ${sent} follow-up email${sent === 1 ? '' : 's'} sent to waiting customers.`,
        };
      },
    },
  ];

  return {
    workflowId:   'weekly-customer-followup',
    workflowName: `Weekly Customer Follow-Up (${waitDays}d wait threshold)`,
    plannedAt:    new Date().toISOString(),
    params:       { workspaceId, waitDays, searchQuery: resolvedQuery, jiraProjectKey, slackChannelId },
    summary: {
      totalSteps:    steps.length,
      searchQuery:   resolvedQuery,
      waitDays,
      jiraProjectKey,
      slackChannelId,
    },
    steps,
  };
}
