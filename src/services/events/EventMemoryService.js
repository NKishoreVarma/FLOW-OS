/**
 * EventMemoryService — persists important events to Org Memory and the Knowledge Graph.
 *
 * Only events with priority high/critical are worth storing durably.
 * Links each memory record to:
 *   - Affected projects (via affectedProjects field)
 *   - Actors (GraphNode USER edges)
 *   - Customer entities (GraphNode CUSTOMER edges)
 *   - Correlation group (via metadata)
 *
 * Emits on eventBus so copilotService and briefingEngine pick up new context.
 */

import { saveMemory }  from '../orgMemoryService.js';
import { eventBus }    from '../../core/events/eventBus.js';
import { EventType }   from './EventNormalizer.js';
import { logger }      from '../../utils/logger.js';

const MEMORY_TYPES = {
  [EventType.INCIDENT]:     'INCIDENT',
  [EventType.SECURITY]:     'INCIDENT',
  [EventType.DEPLOYMENT]:   'INCIDENT',     // failures only
  [EventType.CUSTOMER]:     'CUSTOMER_EVENT',
  [EventType.ENGINEERING]:  'PROJECT_EVENT',
  [EventType.HR]:           'PROJECT_EVENT',
  [EventType.KNOWLEDGE]:    'KNOWLEDGE_UPDATE',
  [EventType.AUTOMATION]:   'PROJECT_EVENT',
  [EventType.APPROVAL]:     'DECISION',
  [EventType.COMPLIANCE]:   'INCIDENT',
};

const WORTH_STORING = new Set(['critical', 'high']);

/**
 * Persist an event to org memory and the knowledge graph.
 * No-ops for low/medium priority events.
 *
 * @param {import('./EventNormalizer.js').CompanyEvent} event
 * @param {string} orgId
 */
export async function persistEventToMemory(event, orgId) {
  if (!WORTH_STORING.has(event.priority)) return;

  // Deployment — only store failures
  if (event.type === EventType.DEPLOYMENT && !/fail|error|rollback/i.test(event.title + event.summary)) return;

  const memType = MEMORY_TYPES[event.type] || 'PROJECT_EVENT';

  try {
    const record = await saveMemory(event.workspaceId, orgId, memType, {
      title:      event.title,
      body:       _buildMemoryBody(event),
      author:     event.actors?.[0]?.name || 'System',
      source:     event.source,
      tags:       _buildTags(event),
      importance: _importanceFromPriority(event.priority, event.severity),
      metadata: {
        eventId:            event.id,
        eventType:          event.type,
        correlationGroupId: event.correlationGroupId,
        affectedTeams:      event.affectedTeams,
        affectedCustomers:  event.affectedCustomers,
        sourceEventId:      event.sourceEventId,
      },
    });

    // Graph population is owned by the Operational Graph Engine's event
    // subscriber (src/graph) — the single graph writer. Not done here anymore.

    // Emit so dependent services (copilot, briefingEngine) can react
    eventBus.emit('COMPANY_EVENT_STORED', {
      workspaceId: event.workspaceId,
      eventId:     event.id,
      memoryId:    record?.id,
      type:        event.type,
      priority:    event.priority,
    });

    logger.rag(`[EventMemory] Stored ${event.type}/${event.priority}: ${event.title.slice(0, 60)}`);
  } catch (err) {
    logger.rag(`[EventMemory] Error storing event: ${err.message}`);
  }
}

// ── Internal ──────────────────────────────────────────────────────────────────

function _buildMemoryBody(event) {
  const lines = [
    `**${event.title}**`,
    event.summary || '',
  ];

  if (event.actors?.length) {
    lines.push(`\nActors: ${event.actors.map(a => a.name).join(', ')}`);
  }
  if (event.affectedTeams?.length) {
    lines.push(`Affected teams: ${event.affectedTeams.join(', ')}`);
  }
  if (event.affectedCustomers?.length) {
    lines.push(`Affected customers: ${event.affectedCustomers.join(', ')}`);
  }
  if (event.correlationGroupId) {
    lines.push(`\nPart of correlation group: ${event.correlationGroupId}`);
  }

  return lines.filter(Boolean).join('\n');
}

function _buildTags(event) {
  const tags = [event.type, event.priority, event.source];
  for (const team of (event.affectedTeams || [])) {
    tags.push(team);
  }
  for (const entity of (event.entities || []).slice(0, 3)) {
    if (entity.name) tags.push(entity.name.toLowerCase().replace(/\s+/g, '_'));
  }
  return tags.filter(Boolean);
}

function _importanceFromPriority(priority, severity) {
  if (priority === 'critical') return Math.max(0.9, severity);
  if (priority === 'high')     return Math.max(0.7, severity);
  return 0.5;
}
