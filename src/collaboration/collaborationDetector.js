/**
 * FLOW OS — Smart Collaboration Detector (Phase 14 M2)
 *
 * Scans the workspace's open pull requests for collaboration friction and suggests a
 * next action for each. Deterministic signals only (no LLM): blocked PRs, long waits,
 * stale branches, changes-requested, large risky PRs, and repeated ownership
 * collisions between the same people.
 */

import { analyzePR, blockedHours } from './mergeConflictDetector.js';

const WAIT_THRESHOLD_H  = 48;
const STALE_THRESHOLD_H = 14 * 24;
const LARGE_FILES       = 20;
const LARGE_LINES       = 500;

export const SignalType = Object.freeze({
  BLOCKED:           'BLOCKED_PR',
  WAITING:           'WAITING_TOO_LONG',
  STALE:             'STALE_BRANCH',
  CHANGES_REQUESTED: 'CHANGES_REQUESTED',
  LARGE_PR:          'LARGE_RISKY_PR',
  REPEAT_COLLISION:  'REPEATED_COLLISION',
});

function sig(type, pr, message, severity, extra = {}) {
  const md = pr.metadata || pr;
  return {
    type, severity,
    repo: pr.repo || md.repo, number: md.number, title: pr.title,
    author: pr.author || md.author, message,
    suggestedActions: extra.actions || defaultActions(pr, md),
    ...extra,
  };
}

function defaultActions(pr, md) {
  return [
    { label: 'Open PR', kind: 'open_pr', payload: { number: md.number, repo: pr.repo || md.repo } },
    { label: 'Open Diff', kind: 'open_diff', payload: { number: md.number, repo: pr.repo || md.repo } },
  ];
}

/**
 * @param {Array} prs normalized PRs
 * @returns {Array} signals sorted by severity
 */
export function detectSignals(prs = []) {
  const signals = [];

  for (const pr of prs) {
    const md = pr.metadata || pr;
    const a = analyzePR(pr);
    const hrs = blockedHours(pr);

    if (a.blocked) {
      signals.push(sig(SignalType.BLOCKED, pr, `PR #${md.number} is blocked: ${a.reasons[0]}`, a.severity));
    }
    if (hrs != null && hrs > WAIT_THRESHOLD_H && (md.status === 'open' || pr.status === 'open')) {
      signals.push(sig(SignalType.WAITING, pr, `PR #${md.number} has been waiting ${Math.round(hrs / 24)}d (> 48h).`, 'medium', {
        actions: [{ label: 'Nudge reviewer', kind: 'message', payload: { connector: 'slack', to: md.reviewers?.[0] } }],
      }));
    }
    if (hrs != null && hrs > STALE_THRESHOLD_H) {
      signals.push(sig(SignalType.STALE, pr, `Branch for PR #${md.number} is stale (${Math.round(hrs / 24)}d without update).`, 'low'));
    }
    if (md.reviewStatus === 'changes_requested') {
      signals.push(sig(SignalType.CHANGES_REQUESTED, pr, `PR #${md.number} has changes requested — author action needed.`, 'medium'));
    }
    const files = md.changedFiles ?? md.changed_files ?? 0;
    const lines = (md.additions ?? 0) + (md.deletions ?? 0);
    if (files > LARGE_FILES || lines > LARGE_LINES) {
      signals.push(sig(SignalType.LARGE_PR, pr, `PR #${md.number} is large (${files} files, ${lines} lines) — higher merge risk.`, 'medium', {
        actions: [{ label: 'Suggest splitting', kind: 'comment', payload: { number: md.number } }],
      }));
    }
  }

  // Repeated ownership collisions between the same pair of people.
  const repeat = detectRepeatCollisions(prs);
  signals.push(...repeat);

  const rank = { high: 0, medium: 1, low: 2, none: 3 };
  return signals.sort((x, y) => (rank[x.severity] ?? 3) - (rank[y.severity] ?? 3));
}

/**
 * @param {Array} collisions [{ owners: [a,b], repo, number }]  from ownership analysis
 * @returns {Array} REPEAT_COLLISION signals for pairs colliding more than once
 */
export function detectRepeatCollisions(collisions = []) {
  const pairCounts = new Map();
  for (const c of collisions) {
    const owners = c.owners || [];
    for (let i = 0; i < owners.length; i++) {
      for (let j = i + 1; j < owners.length; j++) {
        const key = [owners[i], owners[j]].sort().join(' + ');
        pairCounts.set(key, (pairCounts.get(key) || 0) + 1);
      }
    }
  }
  const out = [];
  for (const [pair, count] of pairCounts) {
    if (count >= 2) {
      out.push({
        type: SignalType.REPEAT_COLLISION, severity: 'high', pair, count,
        message: `${pair} have collided on ${count} pull requests — consider dividing ownership.`,
        suggestedActions: [{ label: 'Create Meeting', kind: 'create_meeting', payload: { attendees: pair.split(' + ') } }],
      });
    }
  }
  return out;
}

export default { SignalType, detectSignals, detectRepeatCollisions };
