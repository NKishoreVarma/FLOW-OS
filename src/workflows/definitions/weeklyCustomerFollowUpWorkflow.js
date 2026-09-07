/**
 * Weekly Customer Follow-Up Workflow
 *
 * Every week, search Gmail for threads that have been waiting more than
 * 7 days for a response. For each matching thread, draft a follow-up email.
 * Collect all drafts, wait for human approval, then send all approved emails
 * and create a Jira tracking task to record the outreach.
 *
 * This workflow uses a loop step to iterate over search results.
 * Connectors: gmail, jira, slack
 */

export const WEEKLY_CUSTOMER_FOLLOW_UP_WORKFLOW = {
  id:          'weekly-customer-followup',
  version:     '1.0.0',
  name:        'Weekly Customer Follow-Up',
  description: 'Searches Gmail for waiting customer threads, drafts follow-up emails for each, collects approval, sends them, and logs outreach in Jira.',
  connectors:  ['gmail', 'jira', 'slack'],

  steps: [
    {
      id:          'search_waiting_threads',
      type:        'action',
      name:        'Search Waiting Customer Threads',
      connectorId: 'gmail',
      actionType:  'search',
      payload: {
        query: '{{params.searchQuery}}',
        limit: 20,
      },
      verifyField: 'items',
      trackIn:     '_waitingThreads',
      retryable:   true,
    },
    {
      id:   'check_results',
      type: 'conditional',
      name: 'Check if any threads found',
      condition: '{{_waitingThreads.total}} > 0',
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
            const thread = ctx.variables.thread;
            const subject = thread?.subject || thread?.title || 'Following up';
            const reSubject = subject.startsWith('Re:') ? subject : `Re: ${subject}`;
            return {
              to:      thread?.sender || ctx.variables.params?.defaultRecipient || '',
              subject: reSubject,
              body:    ctx.variables.params?.followUpTemplate
                ?.replace('{{subject}}', subject)
                ?.replace('{{threadId}}', thread?.threadId || thread?.id || '')
                ?? `Hi,\n\nJust checking in on our previous conversation regarding "${subject}".\n\nLet us know if you have any questions or need further assistance.\n\nBest regards,\nThe Team`,
              threadId: thread?.threadId || thread?.id,
            };
          },
          trackIn: '_drafts',
          critical: false,
        },
      },
      else: {
        id:      'no_threads_skip',
        type:    'skip',
        name:    'No waiting threads found — skipping follow-up',
        reasons: ['Gmail search returned 0 matching threads'],
      },
    },
    {
      id:     'approve_follow_ups',
      type:   'approval',
      name:   'Approve Follow-up Batch',
      reason: 'Review all drafted follow-up emails before sending to customers',
    },
    {
      id:   'send_loop',
      type: 'loop',
      name: 'Send all approved follow-up emails',
      over: '_waitingThreads.items',
      as:   'thread',
      body: {
        id:          'send_followup',
        type:        'action',
        name:        'Send Follow-up Email',
        connectorId: 'gmail',
        actionType:  'send',
        buildPayload: (ctx) => {
          const thread = ctx.variables.thread;
          const subject = thread?.subject || thread?.title || 'Following up';
          const reSubject = subject.startsWith('Re:') ? subject : `Re: ${subject}`;
          return {
            to:       thread?.sender || ctx.variables.params?.defaultRecipient || '',
            subject:  reSubject,
            body:     ctx.variables.params?.followUpTemplate
              ?.replace('{{subject}}', subject)
              ?.replace('{{threadId}}', thread?.threadId || thread?.id || '')
              ?? `Hi,\n\nJust checking in on our previous conversation.\n\nBest regards,\nThe Team`,
            inReplyTo: thread?.id,
          };
        },
        trackIn: '_sentEmails',
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
      buildPayload: (ctx) => ({
        projectKey:  ctx.variables.params?.jiraProjectKey || 'HPLT',
        title:       `Weekly Customer Follow-Up — ${new Date().toISOString().slice(0, 10)}`,
        issueType:   'Task',
        priority:    'Low',
        description: `Weekly follow-up batch completed.\n\nThreads found: ${(ctx.variables._waitingThreads?.items || []).length}\nEmails sent: ${(ctx.variables._sentEmails || []).length}\n\nQuery: ${ctx.variables.params?.searchQuery || 'N/A'}`,
        labels:      ['weekly-followup', 'automated'],
      }),
    },
    {
      id:          'notify_completion',
      type:        'action',
      name:        'Notify Team of Completion',
      connectorId: 'slack',
      actionType:  'send',
      critical:    false,
      buildPayload: (ctx) => ({
        channelId: ctx.variables.params?.slackChannelId || '',
        text:      `:white_check_mark: Weekly follow-up complete. ${(ctx.variables._sentEmails || []).length} emails sent to waiting customers.`,
      }),
    },
  ],
};
