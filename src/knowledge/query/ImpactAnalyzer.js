/**
 * ImpactAnalyzer — "what breaks if X changes?"
 *
 * Computes a blast-radius impact score (0–100) for each affected node.
 * Combines graph traversal depth, relationship type weights, and node type criticality.
 */

import { impactPath } from './TraversalEngine.js';
import { EntityType } from '../schema/EntityTypes.js';

// Relative criticality of each entity type in an impact scenario
export const CRITICALITY = {
  [EntityType.SERVICE]:       1.0,
  [EntityType.ENVIRONMENT]:   0.95,
  [EntityType.CUSTOMER]:      0.95,
  [EntityType.INCIDENT]:      0.90,
  [EntityType.DEPLOYMENT]:    0.85,
  [EntityType.PROJECT]:       0.80,
  [EntityType.BUSINESS_GOAL]: 0.80,
  [EntityType.KPI]:           0.75,
  [EntityType.REPOSITORY]:    0.70,
  [EntityType.JIRA_ISSUE]:    0.65,
  [EntityType.PULL_REQUEST]:  0.60,
  [EntityType.PERSON]:        0.70,
  [EntityType.TEAM]:          0.65,
  [EntityType.RISK]:          0.85,
  DEFAULT:                    0.50,
};

// Relationship type contribution to impact score
const EDGE_WEIGHT = {
  'affects':         1.0,
  'blocks':          0.95,
  'serves':          0.90,
  'supports':        0.85,
  'depends_on':      0.90,
  'owns':            0.70,
  'related_to':      0.40,
  'linked_to':       0.35,
  DEFAULT:           0.50,
};

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Compute the blast radius for a given node.
 *
 * @param {string} workspaceId
 * @param {string} nodeId
 * @param {{ maxDepth?, minImpactScore? }} [opts]
 * @returns {Promise<{
 *   sourceNodeId: string,
 *   totalAffected: number,
 *   criticalCount: number,
 *   impacts: import('../types.js').ImpactResult[]
 * }>}
 */
export async function analyzeImpact(workspaceId, nodeId, opts = {}) {
  const { maxDepth = 4, minImpactScore = 0 } = opts;

  const traversal = await impactPath(workspaceId, nodeId, { maxDepth });

  const impacts = traversal.map(r => {
    const typeCriticality = CRITICALITY[r.node.entity_type] ?? CRITICALITY.DEFAULT;
    const edgeScore       = EDGE_WEIGHT[r.edgeType] ?? EDGE_WEIGHT.DEFAULT;

    // Score formula: path confidence × edge weight × type criticality × depth decay
    const depthDecay  = 1 / r.depth;
    const rawScore    = r.pathConfidence * edgeScore * typeCriticality * depthDecay;
    const impactScore = Math.round(Math.min(100, rawScore * 100));

    const impactType = r.depth === 1 ? 'direct' : 'indirect';
    const reason     = _buildImpactReason(r.node, r.edgeType, r.depth);

    return {
      node:        r.node,
      impactType,
      depth:       r.depth,
      impactScore,
      reason,
      edgeType:    r.edgeType,
      pathConfidence: r.pathConfidence,
    };
  }).filter(i => i.impactScore >= minImpactScore);

  // Sort by impactScore descending
  impacts.sort((a, b) => b.impactScore - a.impactScore);

  const criticalCount = impacts.filter(i => i.impactScore >= 70).length;

  return {
    sourceNodeId:  nodeId,
    totalAffected: impacts.length,
    criticalCount,
    impacts,
  };
}

/**
 * Fast version — only returns scores, no traversal details.
 * Used by executive insights to rank nodes by blast radius.
 *
 * @param {string}   workspaceId
 * @param {string[]} nodeIds
 * @returns {Promise<Array<{ nodeId: string, blastRadius: number }>>}
 */
export async function rankByBlastRadius(workspaceId, nodeIds) {
  const results = await Promise.all(
    nodeIds.map(async id => {
      try {
        const { totalAffected, criticalCount } = await analyzeImpact(workspaceId, id, { maxDepth: 3 });
        return { nodeId: id, blastRadius: totalAffected + criticalCount * 2 };
      } catch {
        return { nodeId: id, blastRadius: 0 };
      }
    })
  );
  return results.sort((a, b) => b.blastRadius - a.blastRadius);
}

// ── Internal ──────────────────────────────────────────────────────────────────

function _buildImpactReason(node, edgeType, depth) {
  const entity = node.entity_type?.toLowerCase().replace('_', ' ') ?? 'node';
  const name   = node.display_name ?? node.name ?? node.id;

  if (depth === 1) {
    return `${name} is directly ${edgeType?.replace('_', ' ') ?? 'connected'} and will be immediately affected`;
  }
  return `${name} is ${depth} hops away via ${edgeType?.replace('_', ' ') ?? 'relationships'} and may be indirectly affected`;
}
