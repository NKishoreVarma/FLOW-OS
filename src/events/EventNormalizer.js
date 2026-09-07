/**
 * EventNormalizer (canonical) — the single translation boundary in FLOW.
 *
 * This module does NOT reimplement per-source normalization. It WRAPS the
 * validated Phase 9.4 normalizer (services/events/EventNormalizer) and maps its
 * CompanyEvent onto the unified FLOW Event schema, adding the enterprise fields
 * (organizationId, causationId, parentEvent, correlationId, version, canonical
 * eventType). The unified event is a superset of CompanyEvent, so the existing
 * 9.4 intelligence engines keep consuming it unchanged.
 *
 * There is exactly one normalizer surface for the platform: this one.
 */

import {
  normalizeEvent as normalizeCompanyEvent,
  createCompanyEvent,
} from '../services/events/EventNormalizer.js';
import { scoreEvent } from '../services/events/EventPriorityEngine.js';
import { EventType, SCHEMA_VERSION } from './EventSchemaRegistry.js';

// Phase 9.4 CompanyEvent.type → canonical unified eventType (mostly 1:1).
const TYPE_ALIAS = {
  engineering:   EventType.ENGINEERING,
  meeting:       EventType.MEETING,
  deployment:    EventType.DEPLOYMENT,
  incident:      EventType.INCIDENT,
  approval:      EventType.APPROVAL,
  customer:      EventType.CUSTOMER,
  knowledge:     EventType.KNOWLEDGE,
  automation:    EventType.AUTOMATION,
  security:      EventType.SECURITY,
  finance:       EventType.FINANCE,
  hr:            EventType.HR,
  communication: EventType.COMMUNICATION,
  compliance:    EventType.COMPLIANCE,
  custom:        EventType.CUSTOM,
};

function priorityToImportance(priority, businessImpact = 0.5) {
  const base = { critical: 0.95, high: 0.8, medium: 0.5, low: 0.25 }[priority] ?? 0.5;
  return Math.max(base, businessImpact ?? 0);
}

/**
 * Convert a Phase 9.4 CompanyEvent into a unified FLOW Event.
 * Preserves every CompanyEvent field (pipeline compatibility) and adds the
 * canonical enterprise fields on top.
 */
export function toFlowEvent(companyEvent, ctx = {}) {
  const ce = companyEvent;
  return {
    // ── Canonical FLOW Event fields ──────────────────────────────────────────
    eventId:        ce.id,
    eventType:      TYPE_ALIAS[ce.type] || ce.type || EventType.CUSTOM,
    connector:      ce.source || ctx.connector || 'unknown',
    workspaceId:    String(ce.workspaceId),
    organizationId: ctx.organizationId ?? null,
    actor:          (ce.actors && ce.actors[0]) || null,
    entity:         (ce.entities && ce.entities[0]) || null,
    title:          ce.title || '',
    summary:        ce.summary || '',
    timestamp:      ce.ts || new Date().toISOString(),
    payload:        ctx.rawPayload ?? ce.metadata ?? {},
    metadata:       { ...(ce.metadata || {}), ...(ctx.metadata || {}) },
    importance:     priorityToImportance(ce.priority, ce.businessImpact),
    confidence:     ce.confidence ?? 70,
    correlationId:  ce.correlationGroupId ?? null,
    causationId:    ctx.causationId ?? null,
    parentEvent:    ctx.parentEvent ?? null,
    sourceEventId:  ce.sourceEventId ?? null,
    version:        SCHEMA_VERSION,

    // ── Preserved CompanyEvent fields (Phase 9.4 engine compatibility) ───────
    id:                 ce.id,
    type:               ce.type,
    source:             ce.source,
    icon:               ce.icon,
    actors:             ce.actors || [],
    entities:           ce.entities || [],
    priority:           ce.priority,
    severity:           ce.severity,
    urgency:            ce.urgency,
    businessImpact:     ce.businessImpact,
    affectedTeams:      ce.affectedTeams || [],
    affectedCustomers:  ce.affectedCustomers || [],
    affectedProjects:   ce.affectedProjects || [],
    correlatedEventIds: ce.correlatedEventIds || [],
    correlationGroupId: ce.correlationGroupId ?? null,
    ts:                 ce.ts,
    resolvedAt:         ce.resolvedAt ?? null,
  };
}

/**
 * Normalize a RAW connector payload straight into a unified FLOW Event.
 *
 * @param {string} source  — connector id (github, slack, jira, gmail, ...)
 * @param {string} rawType — source-native event type
 * @param {Object} payload — raw connector payload
 * @param {Object} ctx     — { workspaceId, organizationId, causationId, parentEvent }
 */
export function normalize(source, rawType, payload = {}, ctx = {}) {
  const workspaceId = ctx.workspaceId || payload.workspaceId;
  const companyEvent = normalizeCompanyEvent(workspaceId, source, rawType, payload);
  // Refine priority/severity/urgency BEFORE conversion so the stored event and
  // every subscriber (memory persistence is priority-gated) see the final score.
  scoreEvent(companyEvent);
  return toFlowEvent(companyEvent, { ...ctx, connector: source, rawPayload: payload });
}

/**
 * Build a unified FLOW Event from explicit fields — used by internal producers
 * (AI reasoning, memory writes, recommendations) that don't have a raw payload.
 */
export function fromFields(fields = {}) {
  const companyEvent = createCompanyEvent(fields);
  return toFlowEvent(companyEvent, {
    rawPayload:     fields.payload,
    organizationId: fields.organizationId,
    causationId:    fields.causationId,
    parentEvent:    fields.parentEvent,
    connector:      fields.source || fields.connector,
    metadata:       fields.metadata,
  });
}

// Map a Phase 10.3 dotted webhook type → canonical Phase 9.4 CompanyEvent type.
const WEBHOOK_TYPE_PREFIX = {
  deployment: 'deployment',
  release:    'deployment',
  incident:   'incident',
  alert:      'incident',
  page:       'incident',
  security:   'security',
  message:    'communication',
  thread:     'communication',
  email:      'communication',
  calendar:   'meeting',
  meeting:    'meeting',
  document:   'knowledge',
  doc:        'knowledge',
  wiki:       'knowledge',
  customer:   'customer',
  deal:       'customer',
  approval:   'approval',
};

const URGENCY_TO_PRIORITY = { high: 'high', medium: 'medium', low: 'low' };

function _webhookTypeToCanonical(dotted = '', connectorId = '') {
  const prefix = String(dotted).split('.')[0].toLowerCase();
  if (WEBHOOK_TYPE_PREFIX[prefix]) return WEBHOOK_TYPE_PREFIX[prefix];
  // pr / pull_request / push / commit / branch / ci / build / issue / sprint → engineering
  if (/^(pr|pull_request|push|commit|branch|ci|build|issue|sprint|repo)/.test(prefix)) return 'engineering';
  return 'custom';
}

/**
 * Bridge a Phase 10.3 webhook-normalized event into a unified FLOW Event.
 *
 * The 10.3 EventNormalizer already performed the provider→FLOW translation for
 * raw webhook envelopes (which have a different shape than adapter objects). We
 * reuse that validated parsing and funnel it into the single canonical bus —
 * the 10.3 normalizer becomes an internal normalizer, not a parallel pipeline.
 */
export function fromWebhookEvent(wh = {}, ctx = {}) {
  const fields = {
    workspaceId:   wh.workspaceId,
    source:        wh.connectorId || wh.connector || 'webhook',
    type:          _webhookTypeToCanonical(wh.eventType, wh.connectorId),
    title:         wh.summary || wh.eventType || 'Webhook event',
    summary:       wh.summary || '',
    sourceEventId: wh.resourceId || wh.deliveryId || wh.eventId || null,
    actors:        wh.actor ? [{ type: 'USER', id: wh.actor.email || wh.actor.name, name: wh.actor.name }] : [],
    entities:      wh.resourceId ? [{ type: wh.resourceType || 'RESOURCE', id: String(wh.resourceId), name: wh.summary || '' }] : [],
    priority:      URGENCY_TO_PRIORITY[wh.urgency] || 'medium',
    organizationId: ctx.organizationId,
    metadata: {
      ...(wh.metadata || {}),
      origin:           'webhook',
      webhookEventType: wh.eventType,
      deliveryId:       wh.deliveryId,
      sequence:         wh.sequence,
    },
  };
  return fromFields(fields);
}
