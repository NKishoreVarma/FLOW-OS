/**
 * FLOW Operational Graph Engine — the company's Digital Twin (public API).
 *
 * Every object is a node; every relationship an edge. The graph is populated in
 * real time by subscribing to the Unified Event Platform (never polled, never
 * rebuilt) and answers relationship questions: why, how, who, what depends on
 * this, what is impacted, what is connected.
 *
 * Storage: the Phase 7 Postgres graph_nodes / graph_edges (extended in v11.1).
 * Traversal: recursive CTE, workspace-scoped, bounded.
 */

import { registerGraphSubscriber } from './graphSubscriber.js';

// ── Write (single writer is the event subscriber; exposed for backfill) ──────
export { applyEvent, applyEvents } from './GraphEngine.js';

// ── Traversal ────────────────────────────────────────────────────────────────
export { neighbors, traverse, shortestPath, dependencyChain, impactPath } from './TraversalEngine.js';

// ── Analysis ─────────────────────────────────────────────────────────────────
export { analyzeImpact } from './ImpactAnalyzer.js';
export { analyzeDependencies, findOrphans, findStale } from './DependencyAnalyzer.js';
export { strength, rankNeighbors, topCollaborators, whoKnows } from './RelationshipScorer.js';

// ── Search / structure / metrics ─────────────────────────────────────────────
export { searchNodes } from './GraphSearch.js';
export { degree, topConnected } from './GraphIndex.js';
export { metrics } from './GraphMetrics.js';
export { getNode } from './NodeManager.js';

// ── Taxonomy ─────────────────────────────────────────────────────────────────
export { NodeType, EdgeType, rawNodeId, nodeKey } from './nodeTypes.js';

// ── Lifecycle ────────────────────────────────────────────────────────────────
export { registerGraphSubscriber };

// Register the graph as an event-platform subscriber on first import (idempotent).
registerGraphSubscriber();
