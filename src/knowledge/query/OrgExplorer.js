/**
 * OrgExplorer — queries about organizational structure.
 *
 * Answers:
 *   "Who owns this service?"
 *   "Who does Alice report to?"
 *   "Who are Bob's direct reports?"
 *   "What teams does this person belong to?"
 *   "Who should review this PR?" (reviewer suggestion)
 */

import { traverse, kHop }     from './TraversalEngine.js';
import { getNode, listNodes, getNeighbors, searchNodes } from '../storage/GraphStore.js';
import { EntityType }          from '../schema/EntityTypes.js';
import { RelationshipType }    from '../schema/RelationshipTypes.js';

// ── Ownership ─────────────────────────────────────────────────────────────────

/**
 * Find who owns a given node (service, repository, project, etc.).
 * Follows 'owns' edges inbound (i.e., someone owns the target).
 *
 * @param {string} workspaceId
 * @param {string} nodeId
 * @returns {Promise<import('../types.js').KGNode[]>}
 */
export async function findOwners(workspaceId, nodeId) {
  const neighbors = await getNeighbors(workspaceId, nodeId, {
    direction:         'inbound',
    relationshipTypes: [RelationshipType.OWNS],
  });
  return neighbors;
}

/**
 * Find all nodes owned by a person or team.
 *
 * @param {string} workspaceId
 * @param {string} ownerNodeId
 * @param {{ entityTypes? }} [opts]
 */
export async function findOwned(workspaceId, ownerNodeId, opts = {}) {
  return getNeighbors(workspaceId, ownerNodeId, {
    direction:         'outbound',
    relationshipTypes: [RelationshipType.OWNS],
    entityTypes:       opts.entityTypes ?? null,
  });
}

// ── Reporting hierarchy ───────────────────────────────────────────────────────

/**
 * Get the manager chain for a person (reports_to, upward).
 * @param {string} workspaceId
 * @param {string} personNodeId
 * @param {number} [maxDepth=6]
 */
export async function getManagementChain(workspaceId, personNodeId, maxDepth = 6) {
  return traverse(workspaceId, [personNodeId], {
    maxDepth,
    direction:         'outbound',
    relationshipTypes: [RelationshipType.REPORTS_TO],
    entityTypes:       [EntityType.PERSON],
  });
}

/**
 * Get direct reports of a manager.
 * @param {string} workspaceId
 * @param {string} managerNodeId
 */
export async function getDirectReports(workspaceId, managerNodeId) {
  return getNeighbors(workspaceId, managerNodeId, {
    direction:         'inbound',
    relationshipTypes: [RelationshipType.REPORTS_TO],
    entityTypes:       [EntityType.PERSON],
  });
}

/**
 * Get all direct + indirect reports (org subtree rooted at a manager).
 * @param {string} workspaceId
 * @param {string} managerNodeId
 * @param {number} [maxDepth=5]
 */
export async function getOrgSubtree(workspaceId, managerNodeId, maxDepth = 5) {
  return traverse(workspaceId, [managerNodeId], {
    maxDepth,
    direction:         'inbound',
    relationshipTypes: [RelationshipType.REPORTS_TO],
    entityTypes:       [EntityType.PERSON],
  });
}

// ── Team membership ───────────────────────────────────────────────────────────

/**
 * Get teams a person belongs to.
 * @param {string} workspaceId
 * @param {string} personNodeId
 */
export async function getTeamMemberships(workspaceId, personNodeId) {
  return getNeighbors(workspaceId, personNodeId, {
    direction:         'outbound',
    relationshipTypes: [RelationshipType.MEMBER_OF],
    entityTypes:       [EntityType.TEAM, EntityType.DEPARTMENT],
  });
}

/**
 * Get all members of a team.
 * @param {string} workspaceId
 * @param {string} teamNodeId
 */
export async function getTeamMembers(workspaceId, teamNodeId) {
  return getNeighbors(workspaceId, teamNodeId, {
    direction:         'inbound',
    relationshipTypes: [RelationshipType.MEMBER_OF],
    entityTypes:       [EntityType.PERSON],
  });
}

// ── PR reviewer suggestion ────────────────────────────────────────────────────

/**
 * Suggest reviewers for a pull request node.
 *
 * Strategy:
 *   1. People who own the repository
 *   2. People who reviewed recent PRs in the same repo (reviewed_by edges on sibling PRs)
 *   3. People who are members of the team that owns the repo
 *
 * Returns deduped list sorted by confidence (highest first).
 *
 * @param {string} workspaceId
 * @param {string} prNodeId
 * @returns {Promise<Array<import('../types.js').KGNode & { reason: string }>>}
 */
export async function suggestReviewers(workspaceId, prNodeId) {
  const candidates = new Map(); // personNodeId → { node, reasons: Set }

  const addCandidate = (node, reason) => {
    if (!node) return;
    const existing = candidates.get(node.id);
    if (existing) {
      existing.reasons.add(reason);
    } else {
      candidates.set(node.id, { node, reasons: new Set([reason]) });
    }
  };

  // 1. Owner of the PR itself
  const prOwners = await getNeighbors(workspaceId, prNodeId, {
    direction:         'inbound',
    relationshipTypes: [RelationshipType.OWNS],
    entityTypes:       [EntityType.PERSON],
  });
  prOwners.forEach(n => addCandidate(n, 'owns this PR'));

  // 2. People who reviewed the PR (reviewed_by)
  const reviewers = await getNeighbors(workspaceId, prNodeId, {
    direction:         'outbound',
    relationshipTypes: [RelationshipType.REVIEWED_BY],
    entityTypes:       [EntityType.PERSON],
  });
  reviewers.forEach(n => addCandidate(n, 'reviewed this PR'));

  // 3. Repo owners — traverse PR → belongs_to → REPOSITORY → owners
  const repos = await getNeighbors(workspaceId, prNodeId, {
    direction:         'outbound',
    relationshipTypes: [RelationshipType.BELONGS_TO],
    entityTypes:       [EntityType.REPOSITORY],
  });
  for (const repo of repos) {
    const repoOwners = await findOwners(workspaceId, repo.id);
    repoOwners.forEach(n => addCandidate(n, `owns repository ${repo.name}`));

    // 4. Team members of teams that own the repo
    const repoTeams = await getNeighbors(workspaceId, repo.id, {
      direction:         'inbound',
      relationshipTypes: [RelationshipType.OWNS],
      entityTypes:       [EntityType.TEAM],
    });
    for (const team of repoTeams) {
      const members = await getTeamMembers(workspaceId, team.id);
      members.forEach(n => addCandidate(n, `member of team ${team.name}`));
    }
  }

  return [...candidates.values()].map(({ node, reasons }) => ({
    ...node,
    reason:    [...reasons].join('; '),
    confidence: node.confidence,
  })).sort((a, b) => b.confidence - a.confidence);
}

// ── Approval chain resolution ─────────────────────────────────────────────────

/**
 * Resolve the approval chain for a given node (action, approval, or project).
 *
 * Strategy:
 *   1. Find explicit 'approves' relationships on the node
 *   2. Walk the owner chain: node → owned_by → person/team → reports_to → manager
 *   3. Apply policy overrides from POLICY nodes that reference the node
 *
 * @param {string} workspaceId
 * @param {string} nodeId
 * @returns {Promise<import('../types.js').ApprovalChain>}
 */
export async function resolveApprovalChain(workspaceId, nodeId) {
  const approvers = new Map();

  // 1. Explicit approves edges
  const explicit = await getNeighbors(workspaceId, nodeId, {
    direction:         'inbound',
    relationshipTypes: [RelationshipType.APPROVES],
    entityTypes:       [EntityType.PERSON, EntityType.TEAM],
  });
  for (const n of explicit) {
    approvers.set(n.id, { node: n, role: 'explicit_approver', order: approvers.size });
  }

  // 2. Owners → their managers
  const owners = await findOwners(workspaceId, nodeId);
  for (const owner of owners) {
    approvers.set(owner.id, { node: owner, role: 'owner', order: approvers.size });
    // Escalate to manager
    const mgrs = await getManagementChain(workspaceId, owner.id, 2);
    for (const mgr of mgrs.slice(0, 2)) {
      if (!approvers.has(mgr.node.id)) {
        approvers.set(mgr.node.id, { node: mgr.node, role: 'management_chain', order: approvers.size });
      }
    }
  }

  const chain = [...approvers.values()]
    .sort((a, b) => a.order - b.order)
    .map(e => e.node);

  const confidence = chain.length > 0
    ? Math.min(1, chain.reduce((s, n) => s + n.confidence, 0) / chain.length)
    : 0.5;

  const rationale = chain.length > 0
    ? `Resolved via: explicit approvals (${explicit.length}), owner chain (${owners.length}), manager escalation`
    : 'No direct approvers found — defaulting to workspace admin';

  return { approvers: chain, rationale, confidence };
}

// ── Customer impact ───────────────────────────────────────────────────────────

/**
 * Find customers affected by a given node (incident, service outage, deployment, etc.).
 *
 * @param {string} workspaceId
 * @param {string} nodeId
 * @returns {Promise<import('../types.js').KGNode[]>}
 */
export async function findAffectedCustomers(workspaceId, nodeId) {
  const all = await traverse(workspaceId, [nodeId], {
    maxDepth:          4,
    direction:         'outbound',
    relationshipTypes: ['affects', 'serves', 'supports'],
    entityTypes:       [EntityType.CUSTOMER],
  });
  return all.map(r => r.node);
}
