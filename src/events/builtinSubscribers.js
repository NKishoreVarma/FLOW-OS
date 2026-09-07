/**
 * builtinSubscribers — registers FLOW's core consumers on the single event bus.
 *
 * This is the consolidation seam. The validated Phase 9.4 intelligence engines
 * (timeline, memory, feed, notification) are registered here as independent
 * subscribers instead of being hardcoded into a private pipeline. The two unique
 * behaviors from the Phase 10.3 webhook handlers — pushing urgent events into the
 * ingestion/RAG pipeline (brain) and emitting a recommendation nudge — are
 * preserved as canonical subscribers driven by unified fields, not provider types.
 *
 * The redundant Phase 10.3 feed/timeline/notification handlers are NOT registered:
 * the 9.4 engines already own those concerns durably. That removes the duplicate
 * routing the phase set out to eliminate.
 *
 * Loop-prevention invariant: the brain subscriber never re-enqueues an event that
 * originated from the ingestion worker (metadata.origin === 'ingestion') or a
 * replay (metadata.replayed), so publish → ingestion → publish cannot cycle.
 */

import { subscribe } from './EventSubscriber.js';
import { appendToTimeline }     from '../services/events/WorkspaceTimelineEngine.js';
import { pushToFeed }           from '../services/events/LiveFeedEngine.js';
import { evaluateAndNotify }    from '../services/events/RealtimeNotificationEngine.js';
import { persistEventToMemory } from '../services/events/EventMemoryService.js';
import { handleEvent as notifyFromEvent } from '../notifications/notificationEngine.js';
import { logger } from '../utils/logger.js';

let _registered = false;

export function registerBuiltinSubscribers() {
  if (_registered) return;
  _registered = true;

  // ── Durable intelligence engines (Phase 9.4, unchanged) ────────────────────
  subscribe('timeline', {}, (e) => appendToTimeline(e), { priority: 2 });
  subscribe('feed',     {}, (e) => pushToFeed(e),       { priority: 2 });
  subscribe('memory',   {}, (e) => persistEventToMemory(e, e.organizationId), { priority: 3, durable: true, retries: 2 });
  subscribe('notify',   {}, (e) => evaluateAndNotify(e), { priority: 4 });

  // Phase 14 — durable, targeted Workspace Notification Engine (execution / merge conflicts / approvals)
  subscribe('flowNotify', {}, (e) => notifyFromEvent(e), { priority: 4 });

  // ── Brain: push urgent events into ingestion/RAG (canonical form) ──────────
  subscribe('brain', { predicate: _isUrgent }, _brainSubscriber, { priority: 5 });

  // ── Recommendations: nudge on high-importance events (canonical form) ──────
  subscribe('recommendation', { predicate: (e) => (e.importance ?? 0) >= 0.70 }, _recommendationSubscriber, { priority: 5 });

  logger.rag('[events] built-in subscribers registered (timeline, feed, memory, notify, flowNotify, brain, recommendation)');
}

// ── Subscriber implementations ──────────────────────────────────────────────

function _isUrgent(event) {
  if (event.metadata?.origin === 'ingestion' || event.metadata?.replayed) return false;
  return event.priority === 'critical' || event.priority === 'high';
}

async function _brainSubscriber(event) {
  const { ingestionQueue } = await import('../config/queue.js');
  await ingestionQueue.add('event-intel', {
    workspaceId: event.workspaceId,
    platform:    event.connector,
    sender:      event.actor?.name || event.connector,
    channel:     `event:${event.eventType}`,
    text:        `[${String(event.priority).toUpperCase()}] ${event.title}${event.summary ? ' — ' + event.summary : ''}`,
    metadata: {
      origin:     'event-platform',
      eventId:    event.eventId,
      eventType:  event.eventType,
      resourceId: event.entity?.id,
      priority:   event.priority,
      ...event.metadata,
    },
  });
}

async function _recommendationSubscriber(event) {
  const { broadcastToWorkspace } = await import('../services/socketService.js');
  broadcastToWorkspace(event.workspaceId, 'RECOMMENDATION_SIGNAL', {
    connectorId:  event.connector,
    eventType:    event.eventType,
    resourceType: event.entity?.type || null,
    resourceId:   event.entity?.id || event.sourceEventId || null,
    weight:       +(event.importance ?? 0).toFixed(2),
    urgency:      event.priority,
    summary:      event.summary || event.title,
    receivedAt:   event.timestamp,
  });
}
