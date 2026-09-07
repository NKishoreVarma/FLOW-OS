/**
 * MemoryHandler — stores important webhook events in org operational memory.
 *
 * Only high-urgency events and explicit lifecycle events (deployments, releases,
 * sprint completions) are persisted to avoid polluting operational memory with
 * routine feed noise. Uses saveMemory from orgMemoryService.
 */

import { saveMemory } from '../../orgMemoryService.js';
import db             from '../../../config/db.js';

async function resolveOrgId(workspaceId) {
  try {
    const { rows } = await db.query(
      'SELECT "orgId" FROM "Workspace" WHERE id = $1 LIMIT 1',
      [workspaceId],
    );
    return rows[0]?.orgId ?? null;
  } catch { return null; }
}

// Events worth preserving in long-term operational memory
const MEMORY_WORTHY_TYPES = new Set([
  'deployment.failed',
  'deployment.succeeded',
  'ci.failed',
  'release.published',
  'pr.merged',
  'sprint.completed',
  'sprint.started',
  'issue.opened',
  'issue.status_changed',
  'calendar.invite_received',
]);

// Map to orgMemoryService memory types
const MEMORY_TYPE_MAP = {
  'deployment.failed':        'incident',
  'deployment.succeeded':     'event',
  'ci.failed':                'incident',
  'release.published':        'event',
  'pr.merged':                'event',
  'sprint.completed':         'event',
  'sprint.started':           'event',
  'issue.opened':             'event',
  'issue.status_changed':     'event',
  'calendar.invite_received': 'event',
};

export async function handle(event) {
  // Only high-urgency or known memory-worthy events
  if (event.urgency === 'low' && !MEMORY_WORTHY_TYPES.has(event.eventType)) return;
  if (!MEMORY_WORTHY_TYPES.has(event.eventType)) return;

  const memoryType = MEMORY_TYPE_MAP[event.eventType] || 'event';

  try {
    const orgId = await resolveOrgId(event.workspaceId);
    if (!orgId) return;

    await saveMemory(event.workspaceId, orgId, memoryType.toUpperCase(), {
      title:      event.summary,
      body:       JSON.stringify({
        eventId:     event.eventId,
        connectorId: event.connectorId,
        eventType:   event.eventType,
        resourceId:  event.resourceId,
        actor:       event.actor,
        metadata:    event.metadata,
      }),
      author:     event.actor?.name || event.connectorId,
      source:     `webhook:${event.connectorId}`,
      importance: event.urgency === 'high' ? 0.9 : event.urgency === 'medium' ? 0.6 : 0.3,
      metadata:   {
        eventId:     event.eventId,
        connectorId: event.connectorId,
        eventType:   event.eventType,
        urgency:     event.urgency,
        receivedAt:  event.receivedAt,
      },
    });
  } catch { /* non-fatal — memory persistence failure should not break webhook pipeline */ }
}
