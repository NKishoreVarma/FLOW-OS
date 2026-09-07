/**
 * FLOW OS — Autonomous Operations · Memory Personalizer (Phase 19)
 *
 * Reads real FLOW records to derive workspace-level preferences.
 * Pure reads — no writes, no new tables. Reuses prisma + pg.Pool.
 * Used by actionCardService to personalize "Assign to Alice" suggestions.
 */

import { prisma } from '../core/config/prisma.js';

/**
 * @param {string} workspaceId
 * @returns {{ preferredReviewers, frequentDelegatees, approvalHabits, recentlyBlockedConnectors }}
 */
export async function getPreferences(workspaceId) {
  const since = new Date(Date.now() - 30 * 24 * 3_600_000); // last 30 days

  const [executions, failedApprovals] = await Promise.allSettled([
    prisma.executionRecord.findMany({
      where: { workspaceId, status: 'EXECUTED', createdAt: { gte: since } },
      select: { connector: true, actionType: true, executedById: true, requestedById: true },
      take: 200,
    }),
    prisma.pendingApproval.findMany({
      where: { workspaceId, status: 'PENDING', createdAt: { gte: since } },
      select: { connectorId: true, riskLevel: true },
      take: 50,
    }),
  ]);

  const execs = executions.status === 'fulfilled' ? executions.value : [];
  const blocked = failedApprovals.status === 'fulfilled' ? failedApprovals.value : [];

  // Who has been executing (approving/completing) most? → preferred reviewers
  const reviewerCounts = {};
  for (const e of execs) {
    if (e.executedById) reviewerCounts[e.executedById] = (reviewerCounts[e.executedById] || 0) + 1;
  }
  const preferredReviewers = Object.entries(reviewerCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([id]) => id);

  // Who has been requested to act most? → frequent delegatees
  const delegateCounts = {};
  for (const e of execs) {
    if (e.requestedById && e.requestedById !== e.executedById) {
      delegateCounts[e.requestedById] = (delegateCounts[e.requestedById] || 0) + 1;
    }
  }
  const frequentDelegatees = Object.entries(delegateCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([id]) => id);

  // What connectors currently have pending high-risk approvals? → recently blocked
  const recentlyBlockedConnectors = [...new Set(
    blocked
      .filter((a) => a.riskLevel === 'HIGH' || a.riskLevel === 'CRITICAL')
      .map((a) => a.connectorId)
  )];

  // Approval habits: what risk level do they typically approve?
  const riskCounts = {};
  for (const e of execs) {
    const r = e.actionType?.includes('APPROVE') ? 'HIGH' : 'LOW';
    riskCounts[r] = (riskCounts[r] || 0) + 1;
  }
  const avgRiskLevel = (riskCounts['HIGH'] || 0) > (riskCounts['LOW'] || 0) ? 'HIGH' : 'LOW';

  return {
    preferredReviewers,
    frequentDelegatees,
    approvalHabits: { avgRiskLevel },
    recentlyBlockedConnectors,
  };
}

