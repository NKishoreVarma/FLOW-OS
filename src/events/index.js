/**
 * FLOW Unified Event Platform — public API.
 *
 * The single canonical surface for events in FLOW. After Phase 11.0 every
 * producer publishes here and every consumer subscribes here. There are no
 * "GitHub events" or "Slack events" downstream — only FLOW Events.
 *
 *   Producers:  publish(source, rawType, payload, ctx)  ·  publishFields(fields)
 *   Consumers:  subscribe(name, filter, handler, opts)
 *   History:    replay(filter, opts)  ·  search(filter)  ·  getEvent()  ·  queryEvents()
 *   Ops:        getMetrics()  ·  pruneEvents()  ·  getCorrelationGroup()
 *
 * Adding a new connector requires only: OAuth → Sync → normalize (publish here).
 * Timeline, Brain, Memory, KG, Recommendations, Notifications, Feed, Analytics,
 * Audit, and Search all work automatically because they subscribe to this bus.
 */

import { registerBuiltinSubscribers } from './builtinSubscribers.js';

// ── Producers ────────────────────────────────────────────────────────────────
export { publish, publishFields, publishWebhook } from './EventPublisher.js';

// ── Consumers ────────────────────────────────────────────────────────────────
export { subscribe, unsubscribe, getSubscribers } from './EventSubscriber.js';

// ── History / query ──────────────────────────────────────────────────────────
export { replay } from './EventReplay.js';
export { search } from './EventSearch.js';
export { getById as getEvent, query as queryEvents, count as countEvents } from './EventStore.js';
export { getEventGroup as getCorrelationGroup, getGroupEventIds } from './EventCorrelation.js';

// ── Ops / observability ──────────────────────────────────────────────────────
export { snapshot as getMetrics, resetWindow as resetMetricsWindow } from './EventMetrics.js';
export { prune as pruneEvents, RETENTION_DAYS } from './EventRetention.js';

// ── Schema ───────────────────────────────────────────────────────────────────
export { EventType, SUPPORTED_TYPES, SCHEMA_VERSION, validate, isValidType } from './EventSchemaRegistry.js';

// ── Lifecycle ────────────────────────────────────────────────────────────────
export { registerBuiltinSubscribers };

// Register FLOW's core consumers on first import of the platform (idempotent).
registerBuiltinSubscribers();
