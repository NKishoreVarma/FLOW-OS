/**
 * EventVersioning — stamps every event with the current schema version and
 * upcasts older stored events to the current shape on read (replay, search).
 *
 * Migrations register in EventSchemaRegistry; this module chains them so an
 * event at any historical version can be brought forward to SCHEMA_VERSION.
 */

import { SCHEMA_VERSION, getMigration } from './EventSchemaRegistry.js';

export function stampVersion(event) {
  if (!event.version) event.version = SCHEMA_VERSION;
  return event;
}

export function isCurrent(event) {
  return event.version === SCHEMA_VERSION;
}

/**
 * Bring an event forward to the current schema by chaining registered migrations.
 * If no migration path exists, the event is returned unchanged (best-effort).
 */
export function migrate(event) {
  let current = event;
  let guard = 0;
  while (current.version && current.version !== SCHEMA_VERSION && guard++ < 20) {
    const upcaster = getMigration(current.version);
    if (!upcaster) break;
    current = upcaster(current);
  }
  return current;
}
