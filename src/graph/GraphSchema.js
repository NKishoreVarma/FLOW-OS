/**
 * GraphSchema — derives graph nodes + edges from a unified FLOW Event.
 *
 * This is the heart of the Digital Twin: the deterministic rules that turn every
 * event into the objects and relationships it implies. Downstream managers upsert
 * whatever this returns; there is no provider-specific graph code anywhere else.
 *
 * Every event yields a TIMELINE_EVENT node (keyed by eventId) plus a domain node
 * (PR / Incident / Customer / …). The event node is what causation chains link,
 * so `causationId` (an eventId) reliably connects to the right event node —
 * enabling "which PR caused this incident?" style traversals.
 */

import { NodeType, EdgeType, rawNodeId } from './nodeTypes.js';

// Canonical event type → primary domain node type.
const PRIMARY_TYPE = {
  incident:       NodeType.INCIDENT,
  security:       NodeType.INCIDENT,
  deployment:     NodeType.DEPLOYMENT,
  meeting:        NodeType.MEETING,
  customer:       NodeType.CUSTOMER,
  knowledge:      NodeType.DOCUMENT,
  approval:       NodeType.DECISION,
  task:           NodeType.TASK,
  recommendation: NodeType.RECOMMENDATION,
  memory:         NodeType.MEMORY,
};

// entity.type hints (from connectors) → node type, for engineering/comms events.
const ENTITY_TYPE = {
  PR: NodeType.PULL_REQUEST, PULL_REQUEST: NodeType.PULL_REQUEST,
  COMMIT: NodeType.COMMIT, ISSUE: NodeType.ISSUE, REPO: NodeType.REPOSITORY,
  CHANNEL: NodeType.SLACK_THREAD, EVENT: NodeType.MEETING,
  DOCUMENT: NodeType.DOCUMENT, CUSTOMER: NodeType.CUSTOMER, EMPLOYEE: NodeType.EMPLOYEE,
};

function primaryNodeType(event) {
  if (PRIMARY_TYPE[event.eventType]) return PRIMARY_TYPE[event.eventType];
  const et = event.entity?.type && ENTITY_TYPE[event.entity.type];
  if (et) return et;
  if (event.eventType === 'communication') return event.connector === 'slack' ? NodeType.SLACK_THREAD : NodeType.EMAIL;
  if (event.eventType === 'engineering')  return NodeType.ISSUE;
  return NodeType.TIMELINE_EVENT;
}

/**
 * @param {object} event unified FLOW Event
 * @returns {{ nodes: Array, edges: Array }} rawId-based nodes/edges
 */
export function deriveGraph(event) {
  const nodes = [];
  const edges = [];
  const connector = event.connector || 'flow';
  const seen = new Set();

  // People and customers are the same entity across connectors — namespace them
  // connector-agnostically so identity unifies ("if Rahul leaves, what disappears?"
  // needs one Rahul). Connector-native objects (PRs, repos, incidents) keep the
  // connector in their key.
  const UNIFIED = { [NodeType.EMPLOYEE]: 'people', [NodeType.CUSTOMER]: 'customer' };
  const addNode = (type, key, name, metadata = {}) => {
    const rawId = rawNodeId(type, UNIFIED[type] || connector, key);
    if (!seen.has(rawId)) { seen.add(rawId); nodes.push({ rawId, type, name: name || key || type, metadata }); }
    return rawId;
  };
  const addEdge = (sourceRawId, targetRawId, type, weight = 1.0) => {
    if (sourceRawId && targetRawId && sourceRawId !== targetRawId) {
      edges.push({ sourceRawId, targetRawId, type, weight });
    }
  };

  // ── Event node (causation anchor) ──────────────────────────────────────────
  const eventNode = addNode(NodeType.TIMELINE_EVENT, event.eventId, event.title || event.eventType, {
    eventType: event.eventType, priority: event.priority, ts: event.timestamp,
  });

  // ── Integration node ───────────────────────────────────────────────────────
  const integration = addNode(NodeType.INTEGRATION, connector, connector, {});

  // ── Actors → Employees ─────────────────────────────────────────────────────
  const actors = (event.actors?.length ? event.actors : (event.actor ? [event.actor] : []))
    .filter(a => a && (a.id || a.name));
  const employeeIds = actors.map(a =>
    addNode(NodeType.EMPLOYEE, a.id || a.name, a.name || a.id, { actorType: a.type }));

  // Co-actors collaborate.
  for (let i = 0; i < employeeIds.length; i++)
    for (let j = i + 1; j < employeeIds.length; j++)
      addEdge(employeeIds[i], employeeIds[j], EdgeType.WORKS_WITH);

  // ── Primary domain node ────────────────────────────────────────────────────
  const pType = primaryNodeType(event);
  const primaryKey = event.entity?.id || event.eventId;
  const primary = addNode(pType, primaryKey, event.entity?.name || event.title, {
    eventType: event.eventType, summary: (event.summary || '').slice(0, 300), url: event.entity?.url,
  });

  // Integration generated it; event references it.
  addEdge(integration, primary, EdgeType.GENERATED);
  if (primary !== eventNode) addEdge(eventNode, primary, EdgeType.REFERENCES);

  // Actor → primary: verb depends on event.
  const verb = pType === NodeType.MEETING ? EdgeType.ATTENDED
    : (pType === NodeType.INCIDENT && event.resolvedAt) ? EdgeType.RESOLVED
    : /review/i.test(event.title + ' ' + (event.metadata?.action || '')) ? EdgeType.REVIEWED
    : EdgeType.CREATED;
  for (const emp of employeeIds) addEdge(emp, primary, verb, 1.0 + (event.importance || 0));

  // ── Repository / Project membership ────────────────────────────────────────
  const repo = event.metadata?.repo || event.metadata?.repository;
  if (repo) {
    const repoId = addNode(NodeType.REPOSITORY, repo, String(repo), {});
    addEdge(primary, repoId, EdgeType.BELONGS_TO);
  }
  for (const proj of (event.affectedProjects || []).filter(Boolean)) {
    const projId = addNode(NodeType.PROJECT, proj, String(proj), {});
    addEdge(primary, projId, EdgeType.BELONGS_TO);
  }

  // ── Customers affected ─────────────────────────────────────────────────────
  for (const cust of (event.affectedCustomers || []).filter(Boolean)) {
    const custId = addNode(NodeType.CUSTOMER, cust, String(cust), {});
    addEdge(primary, custId, EdgeType.AFFECTED, 1.0 + (event.businessImpact || 0));
  }

  // ── Communication mentions ─────────────────────────────────────────────────
  if (event.eventType === 'communication') {
    for (const ent of (event.entities || []).slice(0, 5)) {
      if (!ent?.id || ent.id === primaryKey) continue;
      const mId = addNode(ENTITY_TYPE[ent.type] || NodeType.DOCUMENT, ent.id, ent.name, {});
      addEdge(mId, primary, EdgeType.MENTIONED_IN);
    }
  }

  // ── Causation chain (event ← CAUSED ← causeEvent) ──────────────────────────
  if (event.causationId) {
    const cause = addNode(NodeType.TIMELINE_EVENT, event.causationId, 'cause', {});
    addEdge(cause, eventNode, EdgeType.CAUSED);
  }

  return { nodes, edges };
}
