/**
 * EventRouter — the single routing authority for the platform.
 *
 * Given a unified event, it dispatches to every matching subscriber in parallel.
 * Each delivery is fault-isolated and, for durable subscribers, retried with
 * backoff before being marked dead-letter. Every outcome is recorded to the
 * flow_event_deliveries table and reflected in EventMetrics.
 *
 * This replaces BOTH the Phase 9.4 hardcoded pipeline fan-out and the Phase 10.3
 * EventBroadcaster — those consumers are now registered subscribers, not
 * parallel pipelines.
 */

import { matchingSubscribers } from './EventSubscriber.js';
import * as metrics from './EventMetrics.js';
import { recordDelivery } from './EventStore.js';
import { logger } from '../utils/logger.js';

export async function route(event) {
  const subs = matchingSubscribers(event);
  metrics.incr('routed');

  const results = await Promise.allSettled(subs.map((s) => _deliver(s, event)));

  return results.map((r, i) => ({
    subscriber: subs[i].name,
    status:     r.status === 'fulfilled' ? 'delivered' : 'failed',
    error:      r.status === 'rejected' ? r.reason?.message : undefined,
  }));
}

async function _deliver(sub, event) {
  const started = Date.now();
  const maxAttempts = 1 + (sub.opts.retries || 0);
  let lastErr;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await sub.handler(event);
      metrics.incr('delivered');
      await recordDelivery(event.eventId, event.workspaceId, sub.name, 'delivered', {
        attempts: attempt, latencyMs: Date.now() - started,
      });
      return;
    } catch (err) {
      lastErr = err;
      if (attempt < maxAttempts) await _backoff(attempt);
    }
  }

  metrics.incr('failed');
  const status = sub.opts.durable ? 'dead_letter' : 'failed';
  if (sub.opts.durable) metrics.incr('deadLettered');
  await recordDelivery(event.eventId, event.workspaceId, sub.name, status, {
    attempts: maxAttempts, error: lastErr?.message, latencyMs: Date.now() - started,
  });
  logger.rag(`[EventRouter] subscriber ${sub.name} failed after ${maxAttempts} attempt(s): ${lastErr?.message}`);
}

function _backoff(attempt) {
  return new Promise((r) => setTimeout(r, Math.min(2000, 100 * 2 ** attempt)));
}
