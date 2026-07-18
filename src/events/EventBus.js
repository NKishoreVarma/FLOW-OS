/**
 * EventBus — THE single event pipeline inside FLOW.
 *
 * Publishing a normalized unified event runs, in order:
 *   1. version stamp + schema validation   (invalid → dropped, counted)
 *   2. correlation (sets correlationId / causationId)
 *   3. durable append to the EventStore     (duplicate → skipped, counted)
 *   4. route to all matching subscribers    (fault-isolated, retried)
 *   5. mirror to the legacy in-process EventEmitter for existing on() listeners
 *
 * There is no second bus. The legacy core/events/eventBus EventEmitter remains
 * only as the low-level in-process primitive this bus emits through.
 */

import { eventBus as legacyBus } from '../core/events/eventBus.js';
import { assertValid } from './EventSchemaRegistry.js';
import { stampVersion } from './EventVersioning.js';
import { correlate } from './EventCorrelation.js';
import { append } from './EventStore.js';
import { route } from './EventRouter.js';
import * as metrics from './EventMetrics.js';
import { logger } from '../utils/logger.js';

/**
 * Publish a fully-normalized unified FLOW Event through the single pipeline.
 * @returns {Promise<{published:boolean, eventId?:string, duplicate?:boolean, delivery?:Array, reason?:string}>}
 */
export async function publish(event) {
  const started = Date.now();

  stampVersion(event);
  try {
    assertValid(event);
  } catch (err) {
    metrics.incr('dropped');
    logger.rag(`[EventBus] dropped invalid event: ${err.message}`);
    return { published: false, reason: err.message };
  }

  metrics.incr('published');
  metrics.recordType(event.eventType);
  metrics.recordConnector(event.connector);
  metrics.tickThroughput();

  await correlate(event);

  const stored = await append(event);
  if (stored.stored) metrics.incr('stored');
  if (stored.duplicate) {
    metrics.incr('duplicates');
    return { published: false, duplicate: true, eventId: event.eventId };
  }

  const delivery = await route(event);

  // Mirror to the legacy in-process bus so existing eventBus.on() listeners fire.
  try {
    legacyBus.emit(`flow.${event.eventType}`, event);
    legacyBus.emit('flow.event', event);
  } catch { /* legacy emit is best-effort */ }

  metrics.recordLatency(Date.now() - started);
  return { published: true, eventId: event.eventId, delivery };
}
