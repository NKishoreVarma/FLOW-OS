/**
 * Enterprise Knowledge Graph — JSDoc type definitions.
 *
 * These serve as the TypeScript-style interfaces for the KG system.
 * All KG modules reference these via @type / @param annotations.
 */

/**
 * @typedef {object} KGNode
 * @property {string}  id            — Primary key: `${workspaceId}:${entityType}:${source}:${externalId}`
 * @property {string}  workspace_id
 * @property {string}  entity_type   — One of EntityType values
 * @property {string}  external_id   — ID in the source system
 * @property {string|null} canonical_id — Points to the canonical node if this is an alias
 * @property {string}  name
 * @property {string|null} display_name
 * @property {string|null} description
 * @property {Record<string,unknown>} properties — Entity-specific payload
 * @property {string|null} source     — Source system (github, jira, slack, ...)
 * @property {number}  confidence     — 0–1 confidence that this entity is correct
 * @property {Date}    created_at
 * @property {Date}    updated_at
 * @property {Date}    last_seen_at
 */

/**
 * @typedef {object} KGEdge
 * @property {string}  id
 * @property {string}  workspace_id
 * @property {string}  source_id        — Source node ID
 * @property {string}  target_id        — Target node ID
 * @property {string}  relationship_type — One of RelationshipType values
 * @property {Record<string,unknown>} properties
 * @property {number}  confidence        — 0–1
 * @property {number}  weight            — Traversal weight (default 1.0)
 * @property {number}  observation_count — Incremented on each upsert
 * @property {string|null} source_system — Which integration produced this edge
 * @property {Date}    created_at
 * @property {Date}    updated_at
 * @property {Date}    last_observed_at
 */

/**
 * @typedef {object} KGNodeInput
 * @property {string}  entityType
 * @property {string}  externalId
 * @property {string}  name
 * @property {string}  [displayName]
 * @property {string}  [description]
 * @property {Record<string,unknown>} [properties]
 * @property {string}  [source]
 * @property {number}  [confidence]
 */

/**
 * @typedef {object} KGEdgeInput
 * @property {string}  sourceId
 * @property {string}  targetId
 * @property {string}  relationshipType
 * @property {Record<string,unknown>} [properties]
 * @property {number}  [confidence]
 * @property {number}  [weight]
 * @property {string}  [sourceSystem]
 */

/**
 * @typedef {object} TraversalResult
 * @property {KGNode}  node
 * @property {number}  depth          — Hop count from start
 * @property {string}  via            — Parent node ID
 * @property {string}  edgeType       — Relationship type used to reach this node
 * @property {number}  pathConfidence — Product of edge confidences along path
 */

/**
 * @typedef {object} ImpactResult
 * @property {KGNode}  node
 * @property {string}  impactType      — 'direct' | 'indirect'
 * @property {number}  depth
 * @property {number}  impactScore     — 0–100
 * @property {string}  reason          — Human-readable impact reason
 */

/**
 * @typedef {object} DependencyResult
 * @property {KGNode}  node
 * @property {string}  direction       — 'upstream' | 'downstream'
 * @property {number}  depth
 * @property {boolean} isCritical      — On the critical path
 */

/**
 * @typedef {object} ApprovalChain
 * @property {KGNode[]} approvers      — Ordered list of people/roles who must approve
 * @property {string}   rationale      — Why this chain was resolved
 * @property {number}   confidence
 */

/**
 * @typedef {object} OrgNode
 * @property {KGNode}   person
 * @property {KGNode[]} reports        — Direct reports
 * @property {KGNode[]} teams          — Team memberships
 */

/**
 * @typedef {object} ExecutiveSummary
 * @property {number}  totalNodes
 * @property {number}  totalEdges
 * @property {Record<string,number>} nodesByType
 * @property {KGNode[]} topInfluencers   — Highest-centrality people
 * @property {KGNode[]} atRiskProjects
 * @property {KGNode[]} blockedProjects
 * @property {KGNode[]} criticalServices
 * @property {Date}    generatedAt
 */

// This file is type-only — no runtime exports beyond documentation.
export const _TYPES_ONLY = true;
