/**
 * FLOW OS — Merge Conflict Detector (Phase 14 M2)
 *
 * Reads the signals GitHub already returns (mergeable / mergeable_state / review
 * state / merge-readiness / checks) and turns a blocked pull request into a
 * structured operational finding. Detection is poll-on-sync + on-view — no webhook
 * required — and pure/deterministic so it is explainable and testable.
 *
 * Consumed by the ownership analyzer (who's involved) and the notification engine
 * (who to tell). Emits FLOW events so the timeline/graph/notifications react.
 */

import { publish } from '../events/index.js';

export const ConflictType = Object.freeze({
  MERGE_CONFLICT: 'MERGE_CONFLICT',
  PR_BLOCKED:     'PR_BLOCKED',
  CI_FAILED:      'CI_FAILED',
  CHANGES_REQUESTED: 'CHANGES_REQUESTED',
});

/**
 * Classify a single normalized PR (as returned by GitHubAdapter).
 * @returns {{ number, repo, findings: string[], reasons: string[], blocked: boolean, severity }}
 */
export function analyzePR(pr = {}) {
  const md = pr.metadata || pr;
  const findings = [];
  const reasons = [];

  const mergeable      = md.mergeable;
  const reviewStatus   = md.reviewStatus;
  const readiness      = md.mergeReadinessScore;
  const checksPassed   = md.checksPassed ?? md.checks_passed;
  const mergeableState = md.mergeableState ?? md.mergeable_state;

  if (mergeable === false || mergeableState === 'dirty') {
    findings.push(ConflictType.MERGE_CONFLICT);
    reasons.push('GitHub reports the branch cannot be merged cleanly (conflict).');
  }
  if (checksPassed === false || mergeableState === 'unstable' || mergeableState === 'blocked') {
    findings.push(ConflictType.CI_FAILED);
    reasons.push('Required checks / CI have not passed.');
  }
  if (reviewStatus === 'changes_requested') {
    findings.push(ConflictType.CHANGES_REQUESTED);
    reasons.push('A reviewer requested changes.');
  }
  if (typeof readiness === 'number' && readiness < 50 && !findings.length) {
    findings.push(ConflictType.PR_BLOCKED);
    reasons.push(`Merge readiness is low (${readiness}/100).`);
  }

  const blocked = findings.length > 0;
  const severity = findings.includes(ConflictType.MERGE_CONFLICT) ? 'high'
    : findings.includes(ConflictType.CI_FAILED) ? 'medium'
    : blocked ? 'low' : 'none';

  return {
    number: md.number ?? pr.number,
    repo:   pr.repo || md.repo,
    title:  pr.title,
    findings,
    reasons,
    blocked,
    severity,
  };
}

/** Hours a PR has been open/waiting (from updated_at, falling back to created_at). */
export function blockedHours(pr = {}) {
  const md = pr.metadata || pr;
  const ts = md.updatedAt || md.updated_at || md.createdAt || md.created_at || pr.timestamp;
  if (!ts) return null;
  return Math.max(0, Math.round((Date.now() - new Date(ts).getTime()) / 3_600_000));
}

/**
 * Analyze a set of PRs; emit a FLOW event per blocked PR. Returns the blocked findings.
 * Pure aside from event emission — pass emit:false to skip publishing.
 */
export async function detectFromPRs(workspaceId, prs = [], { orgId, emit = true } = {}) {
  const blocked = [];
  for (const pr of prs) {
    const a = analyzePR(pr);
    if (!a.blocked) continue;
    a.blockedHours = blockedHours(pr);
    blocked.push(a);

    if (emit) {
      const primaryType = a.findings[0];
      await publish('github', primaryType, {
        workspaceId, repo: a.repo, number: a.number, title: a.title,
        findings: a.findings, reasons: a.reasons, severity: a.severity, blockedHours: a.blockedHours,
      }, { workspaceId, organizationId: orgId });
    }
  }
  return blocked;
}

export default { ConflictType, analyzePR, blockedHours, detectFromPRs };
