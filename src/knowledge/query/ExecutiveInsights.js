/**
 * ExecutiveInsights — high-level organizational intelligence queries.
 *
 * Answers questions like:
 *   "What projects block Release 3.2?"
 *   "What customers are at risk?"
 *   "Who are the most critical people?"
 *   "What are our top service risks?"
 *
 * All computations read from the KG — no LLM calls here.
 * LLM narration is the responsibility of the caller (e.g., briefingEngine.js).
 */

import { pool }                from '../../config/db.js';
import { EntityType }          from '../schema/EntityTypes.js';
import { RelationshipType }    from '../schema/RelationshipTypes.js';
import { listNodes, graphStats, getNeighbors, searchNodes } from '../storage/GraphStore.js';
import { analyzeImpact, rankByBlastRadius } from './ImpactAnalyzer.js';
import { traverse }            from './TraversalEngine.js';

// ── Summary ───────────────────────────────────────────────────────────────────

/**
 * Generate an executive summary of the knowledge graph state.
 * @param {string} workspaceId
 * @returns {Promise<import('../types.js').ExecutiveSummary>}
 */
export async function executiveSummary(workspaceId) {
  const [stats, blockedProjects, atRiskProjects, criticalServices] = await Promise.all([
    graphStats(workspaceId),
    findBlockedProjects(workspaceId),
    findAtRiskProjects(workspaceId),
    findCriticalServices(workspaceId),
  ]);

  // Top influencers = people with most outbound edges (highest centrality proxy)
  const topInfluencers = await findTopInfluencers(workspaceId);

  return {
    totalNodes:      stats.totalNodes,
    totalEdges:      stats.totalEdges,
    nodesByType:     stats.nodesByType,
    topInfluencers:  topInfluencers.slice(0, 5),
    atRiskProjects:  atRiskProjects.slice(0, 5),
    blockedProjects: blockedProjects.slice(0, 5),
    criticalServices: criticalServices.slice(0, 5),
    generatedAt:     new Date(),
  };
}

// ── Projects ──────────────────────────────────────────────────────────────────

/**
 * Find projects that block a target project or business goal.
 * Follows 'blocks' edges inbound to the target.
 *
 * @param {string} workspaceId
 * @param {string} [targetNodeId] — if omitted, finds ALL blocking relationships
 * @returns {Promise<Array<{ blocker: KGNode, blocks: KGNode, depth: number }>>}
 */
export async function findBlockedProjects(workspaceId, targetNodeId = null) {
  if (targetNodeId) {
    const blockers = await getNeighbors(workspaceId, targetNodeId, {
      direction:         'inbound',
      relationshipTypes: [RelationshipType.BLOCKS],
    });
    return blockers.map(b => ({ blocker: b, blocksId: targetNodeId }));
  }

  // Global: find all active blocking relationships
  const { rows } = await pool.query(
    `SELECT
       s.id AS blocker_id, s.name AS blocker_name, s.entity_type AS blocker_type, s.properties AS blocker_props,
       t.id AS blocked_id,  t.name AS blocked_name,  t.entity_type AS blocked_type,  t.properties AS blocked_props,
       e.confidence
     FROM kg_edges e
     JOIN kg_nodes s ON s.id = e.source_id
     JOIN kg_nodes t ON t.id = e.target_id
     WHERE e.workspace_id = $1 AND e.relationship_type = 'blocks'
     ORDER BY e.confidence DESC LIMIT 50`,
    [workspaceId]
  );
  return rows.map(r => ({
    blocker: { id: r.blocker_id, name: r.blocker_name, entity_type: r.blocker_type, properties: r.blocker_props },
    blocked: { id: r.blocked_id, name: r.blocked_name, entity_type: r.blocked_type, properties: r.blocked_props },
    confidence: r.confidence,
  }));
}

/**
 * Find projects at risk: those with high-priority incidents or risks linked to them.
 * @param {string} workspaceId
 */
export async function findAtRiskProjects(workspaceId) {
  const { rows } = await pool.query(
    `SELECT DISTINCT p.*
     FROM kg_nodes p
     JOIN kg_edges e ON e.source_id = p.id OR e.target_id = p.id
     JOIN kg_nodes r ON r.id = CASE WHEN e.source_id = p.id THEN e.target_id ELSE e.source_id END
     WHERE p.workspace_id = $1
       AND p.entity_type = 'PROJECT'
       AND r.entity_type IN ('INCIDENT','RISK')
       AND e.workspace_id = $1
       AND e.relationship_type IN ('affects','linked_to','related_to')
     ORDER BY p.confidence DESC LIMIT 20`,
    [workspaceId]
  );
  return rows;
}

// ── Services ──────────────────────────────────────────────────────────────────

/**
 * Find services with the highest blast radius (most downstream dependents).
 * @param {string} workspaceId
 */
export async function findCriticalServices(workspaceId) {
  const serviceNodes = await listNodes(workspaceId, {
    entityType: EntityType.SERVICE,
    limit: 30,
  });
  if (!serviceNodes.length) return [];

  const ranked = await rankByBlastRadius(workspaceId, serviceNodes.map(n => n.id));
  const nodeMap = Object.fromEntries(serviceNodes.map(n => [n.id, n]));

  return ranked.slice(0, 10).map(r => ({
    ...nodeMap[r.nodeId],
    blastRadius: r.blastRadius,
  })).filter(n => n.id);
}

/**
 * "What systems depend on X?"
 * @param {string} workspaceId
 * @param {string} serviceNodeId
 */
export async function findDependents(workspaceId, serviceNodeId) {
  return traverse(workspaceId, [serviceNodeId], {
    direction:         'inbound',
    relationshipTypes: [RelationshipType.DEPENDS_ON],
    maxDepth:          4,
  });
}

// ── Customers ─────────────────────────────────────────────────────────────────

/**
 * Find customers affected by an incident or service outage.
 * @param {string} workspaceId
 * @param {string} incidentOrServiceNodeId
 */
export async function findCustomerImpact(workspaceId, incidentOrServiceNodeId) {
  const affected = await traverse(workspaceId, [incidentOrServiceNodeId], {
    direction:         'outbound',
    relationshipTypes: ['affects', 'serves', 'supports'],
    entityTypes:       [EntityType.CUSTOMER],
    maxDepth:          4,
  });
  return {
    affectedCustomers:  affected.map(r => r.node),
    directCount:        affected.filter(r => r.depth === 1).length,
    indirectCount:      affected.filter(r => r.depth > 1).length,
  };
}

// ── People ────────────────────────────────────────────────────────────────────

/**
 * Find people with the highest centrality (most connections = most influential).
 * Uses a simple degree count as a centrality proxy.
 * @param {string} workspaceId
 * @param {number} [limit=10]
 */
export async function findTopInfluencers(workspaceId, limit = 10) {
  const { rows } = await pool.query(
    `SELECT n.*,
            COUNT(e.id) AS edge_count
     FROM kg_nodes n
     JOIN kg_edges e ON (e.source_id = n.id OR e.target_id = n.id)
       AND e.workspace_id = $1
     WHERE n.workspace_id = $1
       AND n.entity_type = 'PERSON'
     GROUP BY n.id
     ORDER BY edge_count DESC
     LIMIT $2`,
    [workspaceId, Math.min(limit, 50)]
  );
  return rows;
}

/**
 * Find people who are "bus factors" — sole owner/assignee of critical assets.
 * These are people whose departure would leave assets unowned.
 * @param {string} workspaceId
 */
export async function findBusFactors(workspaceId) {
  const { rows } = await pool.query(
    `SELECT
       p.id AS person_id, p.name AS person_name,
       array_agg(a.id)   AS asset_ids,
       array_agg(a.name) AS asset_names,
       array_agg(a.entity_type) AS asset_types,
       COUNT(a.id) AS exclusive_count
     FROM kg_nodes p
     JOIN kg_edges e ON e.source_id = p.id AND e.relationship_type = 'owns' AND e.workspace_id = $1
     JOIN kg_nodes a ON a.id = e.target_id AND a.workspace_id = $1
     WHERE p.workspace_id = $1 AND p.entity_type = 'PERSON'
       AND NOT EXISTS (
         SELECT 1 FROM kg_edges e2
         WHERE e2.workspace_id = $1
           AND e2.target_id = a.id
           AND e2.relationship_type = 'owns'
           AND e2.source_id <> p.id
       )
     GROUP BY p.id, p.name
     HAVING COUNT(a.id) >= 1
     ORDER BY exclusive_count DESC LIMIT 20`,
    [workspaceId]
  );
  return rows;
}

// ── Approvals ─────────────────────────────────────────────────────────────────

/**
 * Find open approvals and their pending approvers.
 * @param {string} workspaceId
 */
export async function findOpenApprovals(workspaceId) {
  const approvalNodes = await listNodes(workspaceId, {
    entityType: EntityType.APPROVAL,
    limit: 50,
  });

  const withApprovers = await Promise.all(
    approvalNodes
      .filter(n => n.properties?.status === 'PENDING')
      .map(async n => ({
        ...n,
        pendingApprovers: await getNeighbors(workspaceId, n.id, {
          direction:         'inbound',
          relationshipTypes: [RelationshipType.APPROVES],
          entityTypes:       [EntityType.PERSON],
        }),
      }))
  );
  return withApprovers;
}
