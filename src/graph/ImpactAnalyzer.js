/**
 * ImpactAnalyzer — "what breaks / who is affected if this node fails?"
 *
 * Propagates along impact edges and scores the blast radius, weighting
 * business-critical node types (customers, revenue-bearing) higher.
 */

import { impactPath } from './TraversalEngine.js';

const TYPE_WEIGHT = {
  CUSTOMER: 5, DEPLOYMENT: 3, INCIDENT: 3, PROJECT: 2, REPOSITORY: 2,
  EMPLOYEE: 1.5, PULL_REQUEST: 1, ISSUE: 1, DOCUMENT: 0.5,
};

export async function analyzeImpact(workspaceId, nodeId, maxDepth = 3) {
  const impacted = await impactPath(workspaceId, nodeId, maxDepth);

  const byType = {};
  let score = 0;
  for (const n of impacted) {
    byType[n.type] = (byType[n.type] || 0) + 1;
    // Closer impact counts more; critical types weigh more.
    score += (TYPE_WEIGHT[n.type] || 1) * (1 / (n.depth || 1));
  }

  const customers = impacted.filter(n => n.type === 'CUSTOMER');
  return {
    nodeId,
    impactedCount: impacted.length,
    impactScore: +score.toFixed(2),
    affectedCustomers: customers.map(c => ({ id: c.id, name: c.name, depth: c.depth })),
    byType,
    impacted: impacted.slice(0, 100),
  };
}
