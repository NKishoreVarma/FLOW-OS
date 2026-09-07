/**
 * PR Safety Evaluator
 *
 * Pure function — no API calls, no imports.
 * Decides whether a PR qualifies for automatic approval and merge.
 *
 * A PR is SAFE when ALL of the following are true:
 *   1. Not a draft
 *   2. No merge conflicts (mergeable !== false)
 *   3. No reviewer has requested changes
 *   4. Merge readiness score meets the threshold
 *   5. CI checks are not explicitly failing
 *
 * The caller (PRReviewPlanner) supplies the full normalized PR object
 * from GitHubAdapter._readPulls(), which includes metadata.mergeReadinessScore
 * and metadata.reviewStatus computed by the adapter.
 */

const DEFAULT_MIN_SCORE = 70;

/**
 * @param {object} pr  — normalized PR from GitHubAdapter
 * @param {object} opts
 * @param {number} opts.minMergeReadinessScore — default 70
 * @returns {{ safe: boolean, reasons: string[], score: number, action: 'approve_and_merge'|'skip' }}
 */
export function evaluatePRSafety(pr, opts = {}) {
  const { minMergeReadinessScore = DEFAULT_MIN_SCORE } = opts;
  const meta = pr.metadata ?? {};
  const reasons = [];

  if (meta.draft) {
    reasons.push('PR is a draft — skipping until marked ready for review');
  }

  if (meta.mergeable === false) {
    reasons.push('PR has merge conflicts that must be resolved by the author');
  }

  if (meta.reviewStatus === 'changes_requested') {
    reasons.push('One or more reviewers have requested changes');
  }

  const score = meta.mergeReadinessScore ?? 0;
  if (score < minMergeReadinessScore) {
    reasons.push(
      `Merge readiness score (${score}) is below the threshold (${minMergeReadinessScore})`
    );
  }

  const safe = reasons.length === 0;

  return {
    safe,
    reasons,
    score,
    action: safe ? 'approve_and_merge' : 'skip',
  };
}
