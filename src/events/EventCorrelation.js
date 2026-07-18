/**
 * EventCorrelation — wraps the validated Phase 9.4 correlation engine and adds
 * the enterprise causation chain (causationId / parentEvent).
 *
 * The 9.4 EventCorrelationEngine groups related events (causal chains, entity
 * overlap, time window) in Redis and mutates the event's correlationGroupId. We
 * mirror that onto the canonical correlationId and derive causationId from the
 * group's ordering when the caller hasn't set an explicit cause.
 */

import {
  correlateEvent,
  getEventGroup,
  getGroupEventIds,
} from '../services/events/EventCorrelationEngine.js';

export async function correlate(event) {
  try {
    // Mutates event.correlationGroupId + event.correlatedEventIds in place.
    await correlateEvent(event);
    event.correlationId = event.correlationGroupId || event.correlationId || null;

    // Derive causation: the previous event in the same group is the likely cause.
    if (!event.causationId && event.correlatedEventIds?.length > 1) {
      const others = event.correlatedEventIds.filter((id) => id !== event.eventId);
      if (others.length) event.causationId = others[others.length - 1];
    }
  } catch {
    // Correlation is best-effort — never block publication.
  }
  return event;
}

export { getEventGroup, getGroupEventIds };
