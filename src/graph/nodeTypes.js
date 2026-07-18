/**
 * nodeTypes — the taxonomy of the Operational Graph (Digital Twin).
 *
 * 21 node types, 19 edge types. Every object in FLOW is one node; every
 * relationship is one edge. Node ids are namespaced by workspace so tenant
 * isolation holds at the identity level and matches the Phase 7
 * operationalGraphService scheme (`${workspaceId}:${rawId}`).
 */

export const NodeType = Object.freeze({
  EMPLOYEE:       'EMPLOYEE',
  DEPARTMENT:     'DEPARTMENT',
  REPOSITORY:     'REPOSITORY',
  PULL_REQUEST:   'PULL_REQUEST',
  COMMIT:         'COMMIT',
  ISSUE:          'ISSUE',
  MEETING:        'MEETING',
  DECISION:       'DECISION',
  PROJECT:        'PROJECT',
  CUSTOMER:       'CUSTOMER',
  VENDOR:         'VENDOR',
  DOCUMENT:       'DOCUMENT',
  EMAIL:          'EMAIL',
  SLACK_THREAD:   'SLACK_THREAD',
  INCIDENT:       'INCIDENT',
  DEPLOYMENT:     'DEPLOYMENT',
  TASK:           'TASK',
  RECOMMENDATION: 'RECOMMENDATION',
  MEMORY:         'MEMORY',
  TIMELINE_EVENT: 'TIMELINE_EVENT',
  INTEGRATION:    'INTEGRATION',
});

export const EdgeType = Object.freeze({
  OWNS:         'OWNS',
  CREATED:      'CREATED',
  ASSIGNED_TO:  'ASSIGNED_TO',
  REVIEWED:     'REVIEWED',
  DEPENDS_ON:   'DEPENDS_ON',
  BLOCKED_BY:   'BLOCKED_BY',
  MENTIONED_IN: 'MENTIONED_IN',
  DISCUSSED_IN: 'DISCUSSED_IN',
  AFFECTED:     'AFFECTED',
  CAUSED:       'CAUSED',
  RESOLVED:     'RESOLVED',
  ATTENDED:     'ATTENDED',
  WORKS_WITH:   'WORKS_WITH',
  REPORTS_TO:   'REPORTS_TO',
  BELONGS_TO:   'BELONGS_TO',
  CONNECTED_TO: 'CONNECTED_TO',
  GENERATED:    'GENERATED',
  RELATED_TO:   'RELATED_TO',
  REFERENCES:   'REFERENCES',
});

const NODE_TYPES = new Set(Object.values(NodeType));
const EDGE_TYPES = new Set(Object.values(EdgeType));

// Edge types whose direction expresses a dependency/impact flow (source needs target).
export const DEPENDENCY_EDGES = Object.freeze([
  EdgeType.DEPENDS_ON, EdgeType.BLOCKED_BY, EdgeType.BELONGS_TO, EdgeType.ASSIGNED_TO,
]);
// Edge types along which failure/impact propagates.
export const IMPACT_EDGES = Object.freeze([
  EdgeType.DEPENDS_ON, EdgeType.AFFECTED, EdgeType.CAUSED, EdgeType.CONNECTED_TO, EdgeType.BELONGS_TO,
]);

export function isNodeType(t) { return NODE_TYPES.has(t); }
export function isEdgeType(t) { return EDGE_TYPES.has(t); }

/** Slugify a natural key so ids are stable and safe. */
export function slug(v) {
  return String(v ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'unknown';
}

/** Raw (workspace-agnostic) node id: `type:connector:naturalKey`, all lowercased. */
export function rawNodeId(type, connector, naturalKey) {
  return `${slug(type)}:${slug(connector || 'flow')}:${slug(naturalKey)}`;
}

/** Full, tenant-namespaced node id used as the GraphNode primary key. */
export function nodeKey(workspaceId, rawId) {
  return `${String(workspaceId)}:${rawId}`;
}
