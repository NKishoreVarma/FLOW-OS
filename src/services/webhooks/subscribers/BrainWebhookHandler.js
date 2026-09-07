/**
 * BrainWebhookHandler — routes normalized webhook events to the Operational Brain.
 *
 * High-urgency events trigger an immediate briefing cache invalidation so the
 * next /api/brain/briefing request reflects real-time state.
 * All events are emitted on the eventBus for brain services to subscribe to.
 */

import { eventBus }  from '../../../core/events/eventBus.js';
import { ingestionQueue } from '../../../config/queue.js';

// Events that warrant immediate brain update (cache bust + ingestion)
const HIGH_PRIORITY_TYPES = new Set([
  'deployment.failed', 'ci.failed', 'issue.opened', 'pr.merged', 'release.published',
  'sprint.completed', 'issue.status_changed', 'calendar.invite_received',
]);

export async function handle(event) {
  // Always emit on eventBus — brain services subscribe to 'WEBHOOK_EVENT'
  eventBus.emit('WEBHOOK_EVENT', {
    workspaceId:  event.workspaceId,
    connectorId:  event.connectorId,
    eventType:    event.eventType,
    resourceType: event.resourceType,
    resourceId:   event.resourceId,
    actor:        event.actor,
    summary:      event.summary,
    urgency:      event.urgency,
    metadata:     event.metadata,
  });

  // High-priority events also go through the ingestion pipeline so they land
  // in the vector store and influence RAG responses immediately.
  if (HIGH_PRIORITY_TYPES.has(event.eventType) || event.urgency === 'high') {
    await ingestionQueue.add('webhook-intel', {
      workspaceId: event.workspaceId,
      platform:    event.connectorId,
      sender:      event.actor?.name || event.connectorId,
      channel:     `webhook:${event.eventType}`,
      text:        `[URGENT] ${event.summary}`,
      metadata:    {
        eventId:     event.eventId,
        eventType:   event.eventType,
        resourceId:  event.resourceId,
        urgency:     event.urgency,
        ...event.metadata,
      },
    }).catch(() => {}); // non-fatal
  }

  // Emit specific brain lifecycle events for high-priority
  if (event.urgency === 'high') {
    eventBus.emit('BRAIN_CONTEXT_UPDATE', {
      workspaceId: event.workspaceId,
      trigger:     'webhook',
      eventType:   event.eventType,
      urgency:     event.urgency,
    });
  }
}
