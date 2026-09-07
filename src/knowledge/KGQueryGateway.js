/**
 * KGQueryGateway — the single read-only interface for planners and external consumers.
 *
 * Planners and brain services import ONLY from this gateway — never from
 * individual query modules. This keeps the query API stable even if
 * internal implementations change.
 *
 * Mutation invariant: this module has zero write operations.
 * All writes go through SyncEngine or registered Action Registry actions.
 */

import { getNode, listNodes, searchNodes, graphStats, getNeighbors, getEdgesForNode } from './storage/GraphStore.js';
import { getCanonicalNode, getAliases }          from './storage/EntityResolver.js';
import { traverse, shortestPath, dependencyChain, impactPath, kHop } from './query/TraversalEngine.js';
import { analyzeImpact, rankByBlastRadius }       from './query/ImpactAnalyzer.js';
import { analyzeDependencies, buildServiceDependencyMap, findOrphans, findStaleDependencies } from './query/DependencyAnalyzer.js';
import {
  findOwners, findOwned, getManagementChain, getDirectReports, getOrgSubtree,
  getTeamMemberships, getTeamMembers, suggestReviewers,
  resolveApprovalChain, findAffectedCustomers,
} from './query/OrgExplorer.js';
import {
  executiveSummary, findBlockedProjects, findAtRiskProjects,
  findCriticalServices, findDependents, findCustomerImpact,
  findTopInfluencers, findBusFactors, findOpenApprovals,
} from './query/ExecutiveInsights.js';
import { EntityType, entityTypeLabel, ALL_ENTITY_TYPES } from './schema/EntityTypes.js';
import { RelationshipType, ALL_RELATIONSHIP_TYPES }      from './schema/RelationshipTypes.js';

// ── Node access ────────────────────────────────────────────────────────────────

export {
  getNode,
  listNodes,
  searchNodes,
  graphStats,
  getNeighbors,
  getEdgesForNode,
  getCanonicalNode,
  getAliases,
};

// ── Traversal ─────────────────────────────────────────────────────────────────

export {
  traverse,
  shortestPath,
  dependencyChain,
  impactPath,
  kHop,
};

// ── Impact analysis ───────────────────────────────────────────────────────────

export {
  analyzeImpact,
  rankByBlastRadius,
};

// ── Dependency analysis ────────────────────────────────────────────────────────

export {
  analyzeDependencies,
  buildServiceDependencyMap,
  findOrphans,
  findStaleDependencies,
};

// ── Org explorer ───────────────────────────────────────────────────────────────

export {
  findOwners,
  findOwned,
  getManagementChain,
  getDirectReports,
  getOrgSubtree,
  getTeamMemberships,
  getTeamMembers,
  suggestReviewers,
  resolveApprovalChain,
  findAffectedCustomers,
};

// ── Executive insights ────────────────────────────────────────────────────────

export {
  executiveSummary,
  findBlockedProjects,
  findAtRiskProjects,
  findCriticalServices,
  findDependents,
  findCustomerImpact,
  findTopInfluencers,
  findBusFactors,
  findOpenApprovals,
};

// ── Schema exports (for route handlers and UI) ────────────────────────────────

export {
  EntityType,
  entityTypeLabel,
  ALL_ENTITY_TYPES,
  RelationshipType,
  ALL_RELATIONSHIP_TYPES,
};

// ── Compound query helpers ────────────────────────────────────────────────────

/**
 * Answer "Who owns this?" for any node ID.
 * Returns owners with their role (person/team) and confidence.
 *
 * @param {string} workspaceId
 * @param {string} nodeId
 */
export async function whoOwns(workspaceId, nodeId) {
  const owners = await findOwners(workspaceId, nodeId);
  if (!owners.length) {
    // Walk up the graph: find what the node belongs_to and who owns THAT
    const parents = await getNeighbors(workspaceId, nodeId, {
      direction:         'outbound',
      relationshipTypes: ['belongs_to'],
    });
    if (parents.length) {
      const parentOwners = await findOwners(workspaceId, parents[0].id);
      return parentOwners.map(o => ({ ...o, ownershipPath: `via ${parents[0].name}` }));
    }
  }
  return owners;
}

/**
 * Answer "What systems depend on X?"
 * @param {string} workspaceId
 * @param {string} nodeId
 */
export async function whatDependsOn(workspaceId, nodeId) {
  return findDependents(workspaceId, nodeId);
}

/**
 * Answer "Who should review this PR?"
 * @param {string} workspaceId
 * @param {string} prNodeId
 */
export async function prReviewers(workspaceId, prNodeId) {
  return suggestReviewers(workspaceId, prNodeId);
}

/**
 * Answer "What customers are affected by this?"
 * @param {string} workspaceId
 * @param {string} incidentOrServiceId
 */
export async function customerImpact(workspaceId, incidentOrServiceId) {
  return findCustomerImpact(workspaceId, incidentOrServiceId);
}

/**
 * Answer "What projects block X?"
 * @param {string} workspaceId
 * @param {string} targetNodeId
 */
export async function blockers(workspaceId, targetNodeId) {
  return findBlockedProjects(workspaceId, targetNodeId);
}

/**
 * Answer "Show the approval chain for this action/project."
 * @param {string} workspaceId
 * @param {string} nodeId
 */
export async function approvalChain(workspaceId, nodeId) {
  return resolveApprovalChain(workspaceId, nodeId);
}
