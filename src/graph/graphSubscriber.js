/**
 * graphSubscriber — the single writer to the Operational Graph.
 *
 * Registers a 'graph' subscriber on the Phase 11.0 Unified Event Platform so that
 * EVERY FLOW event incrementally updates the twin. Durable with retries: a
 * transient DB hiccup is retried, never silently dropped. There is no polling and
 * no rebuild — the graph tracks the event stream in real time.
 */

import { subscribe } from '../events/EventSubscriber.js';
import { applyEvent } from './GraphEngine.js';
import { logger } from '../utils/logger.js';
import { traceStage, STAGES } from '../observability/ingestionTrace.js';

let _registered = false;

async function _graphHandler(event) {
  const res = await applyEvent(event);
  // Safe per-item trace continuation: relationships are extracted here (the single
  // graph writer). Only fires for items carrying a sync correlation id.
  const eventId = event?.metadata?._traceEventId;
  if (eventId && event?.workspaceId) {
    traceStage(STAGES.RELATIONSHIP_EXTRACTED, {
      workspaceId: event.workspaceId, eventId,
      status: 'ok', count: res?.edges ?? 0,
    });
  }
  return res;
}

export function registerGraphSubscriber() {
  if (_registered) return;
  _registered = true;
  subscribe('graph', {}, _graphHandler, { priority: 6, durable: true, retries: 2 });
  logger.rag('[graph] operational graph subscriber registered (single writer)');
}
