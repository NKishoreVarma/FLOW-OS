/**
 * KGEventSubscriber — subscribes to the FLOW Unified Event Platform (Phase 11)
 * and incrementally updates the Enterprise Knowledge Graph as events arrive.
 *
 * This is the "graph subscriber" mentioned in the Phase 11.1 architecture.
 * It is the SINGLE WRITER to the KG from live events.
 *
 * Invariants:
 *   - Never publishes events (no loop)
 *   - Errors are non-fatal (logged and swallowed) — KG sync is best-effort
 *   - Re-plays (replayed: true) are accepted — upsert semantics are idempotent
 */

import { logger }        from '../../utils/logger.js';
import { getAdapter }    from './ConnectorAdapters.js';
import { syncEntities }  from './SyncEngine.js';
import { EntityType }    from '../schema/EntityTypes.js';

// ── Subscriber registration ───────────────────────────────────────────────────

let _subscriptionId = null;

/**
 * Register the KG event subscriber on the FLOW event bus.
 * Called once at boot by startKnowledgeGraph().
 */
export async function registerKGSubscriber() {
  try {
    const { subscribe } = await import('../../events/index.js');
    _subscriptionId = subscribe(
      'knowledge-graph-writer',
      {},   // no pre-filter — we handle all events and route internally
      _handleEvent,
      { priority: 3, durable: false },
    );
    logger.info('[KGEventSubscriber] Subscribed to FLOW event bus');
  } catch (err) {
    // Event platform may not be available (e.g., in test mode)
    logger.warn(`[KGEventSubscriber] Could not subscribe to event bus: ${err.message}`);
  }
}

export async function unregisterKGSubscriber() {
  if (!_subscriptionId) return;
  try {
    const { unsubscribe } = await import('../../events/index.js');
    unsubscribe(_subscriptionId);
    _subscriptionId = null;
  } catch { /* ignore */ }
}

// ── Event handler ─────────────────────────────────────────────────────────────

async function _handleEvent(event) {
  const { workspaceId, source, type: eventType, payload = {}, metadata = {} } = event;
  if (!workspaceId || !source) return;

  // Loop prevention: don't re-process KNOWLEDGE_GRAPH_SYNCED events
  if (eventType === 'KNOWLEDGE_GRAPH_SYNCED') return;

  try {
    await _routeEvent(workspaceId, source, eventType, payload, metadata);
  } catch (err) {
    logger.error(`[KGEventSubscriber] Error handling ${eventType} from ${source}: ${err.message}`);
    // Never re-throw — must not crash the event bus dispatch loop
  }
}

async function _routeEvent(workspaceId, source, eventType, payload, metadata) {
  const adapter = getAdapter(source);
  if (!adapter) return; // Source not yet adapted — silently skip

  const eventTypeLower = eventType.toLowerCase();

  // ── GitHub events ──────────────────────────────────────────────────────────
  if (source === 'github') {
    if (eventTypeLower.includes('pull_request') || eventTypeLower.includes('pr')) {
      const { nodes, edges } = adapter(workspaceId, {
        pullRequest: payload.pullRequest ?? payload.pull_request ?? payload,
        repo:        payload.repository ?? null,
      });
      await syncEntities(workspaceId, 'github', EntityType.PULL_REQUEST, { nodes, edges });
    }
    else if (eventTypeLower.includes('push') || eventTypeLower.includes('commit')) {
      const { nodes, edges } = adapter(workspaceId, { repo: payload.repository });
      if (nodes.length) await syncEntities(workspaceId, 'github', EntityType.REPOSITORY, { nodes, edges });
    }
    else if (eventTypeLower.includes('deploy')) {
      const { nodes, edges } = adapter(workspaceId, { deployment: payload });
      if (nodes.length) await syncEntities(workspaceId, 'github', EntityType.DEPLOYMENT, { nodes, edges });
    }
  }

  // ── Jira events ────────────────────────────────────────────────────────────
  else if (source === 'jira') {
    if (eventTypeLower.includes('issue')) {
      const { nodes, edges } = adapter(workspaceId, { issue: payload });
      if (nodes.length) await syncEntities(workspaceId, 'jira', EntityType.JIRA_ISSUE, { nodes, edges });
    }
  }

  // ── Gmail events ───────────────────────────────────────────────────────────
  else if (source === 'gmail') {
    if (eventTypeLower.includes('email') || eventTypeLower.includes('message')) {
      const { nodes, edges } = adapter(workspaceId, { message: payload });
      if (nodes.length) await syncEntities(workspaceId, 'gmail', EntityType.EMAIL, { nodes, edges });
    }
  }

  // ── Calendar events ────────────────────────────────────────────────────────
  else if (source === 'google-calendar') {
    if (eventTypeLower.includes('event') || eventTypeLower.includes('meeting')) {
      const { nodes, edges } = adapter(workspaceId, { event: payload });
      if (nodes.length) await syncEntities(workspaceId, 'google-calendar', EntityType.MEETING, { nodes, edges });
    }
  }

  // ── HubSpot / Salesforce ───────────────────────────────────────────────────
  else if (source === 'hubspot' || source === 'salesforce') {
    if (eventTypeLower.includes('contact') || eventTypeLower.includes('customer')) {
      const { nodes, edges } = adapter(workspaceId, { contact: payload });
      if (nodes.length) await syncEntities(workspaceId, source, EntityType.CUSTOMER, { nodes, edges });
    }
    if (eventTypeLower.includes('company') || eventTypeLower.includes('account')) {
      const { nodes, edges } = adapter(workspaceId, { company: payload });
      if (nodes.length) await syncEntities(workspaceId, source, EntityType.CUSTOMER, { nodes, edges });
    }
  }

  // ── Slack events ───────────────────────────────────────────────────────────
  else if (source === 'slack') {
    if (eventTypeLower.includes('channel')) {
      const { nodes, edges } = adapter(workspaceId, { channel: payload });
      if (nodes.length) await syncEntities(workspaceId, 'slack', EntityType.SLACK_CHANNEL, { nodes, edges });
    }
  }

  // ── FLOW internal events (ingestion, workflow, etc.) ───────────────────────
  else if (source === 'flow' || source === 'internal') {
    if (eventTypeLower.includes('incident')) {
      // Build INCIDENT node from FLOW's internal incident format
      if (payload.id && payload.description) {
        await syncEntities(workspaceId, 'flow', EntityType.INCIDENT, {
          nodes: [{
            entityType:  EntityType.INCIDENT,
            externalId:  String(payload.id),
            name:        payload.title ?? payload.description?.slice(0, 80),
            source:      'flow',
            properties: {
              severity:   payload.severity,
              status:     payload.status,
              detectedAt: payload.detectedAt ?? new Date().toISOString(),
            },
          }],
          edges: [],
        });
      }
    }
  }
}
