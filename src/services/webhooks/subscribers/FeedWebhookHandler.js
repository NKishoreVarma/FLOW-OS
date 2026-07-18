/**
 * FeedWebhookHandler — pushes normalized webhook events to the workspace feed.
 *
 * Broadcasts WEBHOOK_FEED_ITEM over WebSocket so the DailyWorkfeed updates
 * in real time without a page refresh. The client-side Recommendation Engine
 * picks up these items and scores them alongside scheduled briefing items.
 */

import { broadcastToWorkspace } from '../../socketService.js';

// Map FLOW event types to workfeed card categories
const CATEGORY_MAP = {
  'pr.opened':               'engineering',
  'pr.updated':              'engineering',
  'pr.merged':               'engineering',
  'pr.reviewed':             'engineering',
  'pr.review_requested':     'engineering',
  'pr.closed':               'engineering',
  'commit.pushed':           'engineering',
  'deployment.created':      'engineering',
  'deployment.succeeded':    'engineering',
  'deployment.failed':       'engineering',
  'ci.started':              'engineering',
  'ci.completed':            'engineering',
  'ci.failed':               'engineering',
  'release.published':       'engineering',
  'issue.opened':            'work',
  'issue.updated':           'work',
  'issue.closed':            'work',
  'issue.assigned':          'work',
  'issue.status_changed':    'work',
  'comment.added':           'work',
  'sprint.started':          'work',
  'sprint.completed':        'work',
  'message.posted':          'communication',
  'thread.replied':          'communication',
  'reaction.added':          'communication',
  'channel.created':         'communication',
  'calendar.event_created':  'calendar',
  'calendar.event_updated':  'calendar',
  'calendar.event_deleted':  'calendar',
  'calendar.invite_received':'calendar',
  'gmail.message_received':  'communication',
  'page.created':            'knowledge',
  'page.updated':            'knowledge',
  'database.updated':        'knowledge',
};

export async function handle(event) {
  const category = CATEGORY_MAP[event.eventType] || 'general';

  broadcastToWorkspace(event.workspaceId, 'WEBHOOK_FEED_ITEM', {
    eventId:      event.eventId,
    connectorId:  event.connectorId,
    eventType:    event.eventType,
    category,
    title:        event.summary,
    urgency:      event.urgency,
    actor:        event.actor,
    resourceId:   event.resourceId,
    resourceType: event.resourceType,
    metadata:     event.metadata,
    receivedAt:   event.receivedAt,
  });
}
