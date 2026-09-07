/**
 * EventPublisher — the ONE entry point every producer uses.
 *
 * A new connector wires up with exactly: OAuth → Sync → normalize here.
 * Everything downstream (store, correlation, timeline, brain, memory, KG,
 * recommendations, notifications, feed, analytics, audit, search) happens
 * automatically because they all subscribe to the single bus.
 *
 *   publish(source, rawType, payload, ctx)  — raw connector payload
 *   publishFields(fields)                   — internal producers (AI, memory, ...)
 */

import { normalize, fromFields, fromWebhookEvent } from './EventNormalizer.js';
import { publish as busPublish } from './EventBus.js';
import { resolveOrgId } from './orgResolver.js';

export async function publish(source, rawType, payload = {}, ctx = {}) {
  const workspaceId = ctx.workspaceId || payload.workspaceId;
  if (!workspaceId) return { published: false, reason: 'workspaceId required' };

  const organizationId = ctx.organizationId || await resolveOrgId(workspaceId);
  const event = normalize(source, rawType, payload, { ...ctx, workspaceId, organizationId });
  return busPublish(event);
}

export async function publishFields(fields = {}) {
  const workspaceId = fields.workspaceId;
  if (!workspaceId) return { published: false, reason: 'workspaceId required' };

  const organizationId = fields.organizationId || await resolveOrgId(workspaceId);
  const event = fromFields({ ...fields, organizationId });
  return busPublish(event);
}

/**
 * Publish a Phase 10.3 webhook-normalized event through the single bus.
 * Used by the webhook worker so raw provider webhooks reuse validated 10.3
 * parsing while still flowing through the one canonical pipeline.
 */
export async function publishWebhook(whEvent = {}) {
  const workspaceId = whEvent.workspaceId;
  if (!workspaceId) return { published: false, reason: 'workspaceId required' };

  const organizationId = await resolveOrgId(workspaceId);
  const event = fromWebhookEvent(whEvent, { organizationId });
  return busPublish(event);
}
