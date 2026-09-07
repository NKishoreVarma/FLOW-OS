/**
 * EventSchemaRegistry — the single source of truth for the unified FLOW Event.
 *
 * After Phase 11.0 there are no "GitHub events" or "Slack events" — only FLOW
 * Events. Every producer normalizes into this schema; every consumer reads it.
 *
 * Canonical event shape (18 fields):
 *   eventId, eventType, connector, workspaceId, organizationId, actor, entity,
 *   timestamp, payload, metadata, importance, confidence, correlationId,
 *   causationId, parentEvent, version  (+ title/summary for search/display)
 *
 * The unified event is a SUPERSET of the Phase 9.4 CompanyEvent so that the
 * validated 9.4 intelligence engines consume it unchanged.
 */

export const SCHEMA_VERSION = '1.0';

// ── Canonical event type taxonomy ───────────────────────────────────────────
// Every current and future connector maps into exactly one of these.
export const EventType = Object.freeze({
  ENGINEERING:    'engineering',
  MEETING:        'meeting',
  COMMUNICATION:  'communication',
  CUSTOMER:       'customer',
  KNOWLEDGE:      'knowledge',
  INCIDENT:       'incident',
  APPROVAL:       'approval',
  DEPLOYMENT:     'deployment',
  TASK:           'task',
  SECURITY:       'security',
  AUTHENTICATION: 'authentication',
  INTEGRATION:    'integration',
  RECOMMENDATION: 'recommendation',
  AI:             'ai',
  MEMORY:         'memory',
  TIMELINE:       'timeline',
  // Extended types inherited from Phase 9.4 — still first-class.
  AUTOMATION:     'automation',
  FINANCE:        'finance',
  HR:             'hr',
  COMPLIANCE:     'compliance',
  CUSTOM:         'custom',
});

const VALID_TYPES = new Set(Object.values(EventType));
const VALID_PRIORITIES = new Set(['critical', 'high', 'medium', 'low']);
const REQUIRED_FIELDS = ['eventId', 'eventType', 'workspaceId', 'timestamp', 'version'];

export const SUPPORTED_TYPES = Object.freeze([...VALID_TYPES]);

export function isValidType(type) {
  return VALID_TYPES.has(type);
}

/**
 * Structural validation of a unified FLOW Event.
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validate(event) {
  const errors = [];
  if (!event || typeof event !== 'object') {
    return { valid: false, errors: ['event is not an object'] };
  }
  for (const field of REQUIRED_FIELDS) {
    if (event[field] === undefined || event[field] === null || event[field] === '') {
      errors.push(`missing required field: ${field}`);
    }
  }
  if (event.eventType && !VALID_TYPES.has(event.eventType)) {
    errors.push(`invalid eventType: ${event.eventType}`);
  }
  if (event.priority && !VALID_PRIORITIES.has(event.priority)) {
    errors.push(`invalid priority: ${event.priority}`);
  }
  if (event.importance != null && (event.importance < 0 || event.importance > 1)) {
    errors.push(`importance out of range [0,1]: ${event.importance}`);
  }
  if (event.confidence != null && (event.confidence < 0 || event.confidence > 100)) {
    errors.push(`confidence out of range [0,100]: ${event.confidence}`);
  }
  return { valid: errors.length === 0, errors };
}

export function assertValid(event) {
  const { valid, errors } = validate(event);
  if (!valid) throw new Error(`Invalid FLOW event: ${errors.join('; ')}`);
  return event;
}

// ── Schema migration registry (used by EventVersioning) ─────────────────────
// Maps a fromVersion → upcaster function that returns the event at the next version.
const _migrations = new Map();

export function registerMigration(fromVersion, upcaster) {
  _migrations.set(fromVersion, upcaster);
}

export function getMigration(fromVersion) {
  return _migrations.get(fromVersion);
}
