/**
 * RecommendationHandler — feeds webhook events into the recommendation engine.
 *
 * Emits RECOMMENDATION_SIGNAL on the eventBus. The client-side Recommendation
 * Engine (DailyWorkfeed/RecommendationEngine.jsx) picks up live signals via
 * the WEBHOOK_FEED_ITEM WebSocket event (handled by FeedWebhookHandler).
 * This handler extends that by emitting a backend signal for server-side
 * scoring and surfacing via /api/intelligence/daily-feed.
 */

import { broadcastToWorkspace } from '../../socketService.js';
import { eventBus }             from '../../../core/events/eventBus.js';

// Recommendation signal weights by event type
const SIGNAL_WEIGHTS = {
  'deployment.failed':        0.95,
  'ci.failed':                0.90,
  'pr.merged':                0.80,
  'release.published':        0.85,
  'issue.opened':             0.70,
  'issue.status_changed':     0.60,
  'sprint.completed':         0.75,
  'sprint.started':           0.65,
  'pr.review_requested':      0.70,
  'calendar.invite_received': 0.65,
  'deployment.succeeded':     0.55,
  'pr.opened':                0.60,
  'message.posted':           0.30,
  'thread.replied':           0.25,
};

export async function handle(event) {
  const weight = SIGNAL_WEIGHTS[event.eventType] ?? 0.20;

  // Emit on eventBus for any server-side recommendation subscribers
  eventBus.emit('RECOMMENDATION_SIGNAL', {
    workspaceId:  event.workspaceId,
    connectorId:  event.connectorId,
    eventType:    event.eventType,
    resourceType: event.resourceType,
    resourceId:   event.resourceId,
    urgency:      event.urgency,
    weight,
    actor:        event.actor,
    summary:      event.summary,
    metadata:     event.metadata,
    receivedAt:   event.receivedAt,
  });

  // For high-weight signals, broadcast a recommendation nudge over WebSocket
  if (weight >= 0.70) {
    broadcastToWorkspace(event.workspaceId, 'RECOMMENDATION_SIGNAL', {
      connectorId:  event.connectorId,
      eventType:    event.eventType,
      resourceType: event.resourceType,
      resourceId:   event.resourceId,
      weight,
      urgency:      event.urgency,
      summary:      event.summary,
      receivedAt:   event.receivedAt,
    });
  }
}
