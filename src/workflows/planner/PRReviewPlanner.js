/**
 * PR Review Planner
 *
 * Converts the user's intent ("merge all safe PRs in owner/repo") into a
 * concrete ExecutionPlan using generic RuntimeEngine step types:
 *   action  — connector action via executeAction()
 *   skip    — no-op with reasons
 *
 * The plan is workflow-specific; the executor (RuntimeEngine / StepExecutor) is not.
 *
 * Steps emitted:
 *   skip    (type:'skip')                     — for each unsafe PR
 *   approve (type:'action', connectorId:'github', actionType:'approve')
 *   merge   (type:'action', connectorId:'github', actionType:'execute', verifyField:'merged')
 *   notify  (type:'action', connectorId:'slack',  actionType:'send', critical:false, buildPayload)
 *
 * All PR-specific aggregation (mergedPRs, skippedPRs, failedPRs) is handled
 * inside the notify step's buildPayload closure — the runtime never knows it's
 * working with pull requests.
 */

import { getConnector }     from '../../connectors/registry.js';
import { evaluatePRSafety } from '../PRSafetyEvaluator.js';
import { ValidationError }  from '../../core/errors/index.js';
import { ingestedPulls }    from '../../services/certification/ingestedReads.js';

/**
 * Workspace-aware open-PR read. Live GitHub connector first; if it is unavailable
 * (no credentials → throws) OR returns nothing, fall back to the workspace's
 * ALREADY-INGESTED PRs. `ingestedPulls` is itself gated to the certification
 * workspace and returns null everywhere else, so a development workspace with an
 * expired/absent connector gets the honest empty set — never substituted Helios data.
 * Fail-closed: the ingested path only ever activates for the certification workspace.
 */
async function readOpenPulls(workspaceId, { owner, repo, state, limit }) {
  let prs = null;
  try {
    prs = await getConnector('github').read(workspaceId, { resourceType: 'pulls', owner, repo, state, limit });
  } catch { prs = null; }                       // live connector unavailable
  if (Array.isArray(prs) && prs.length) return { prs, source: 'live' };
  const ingested = await ingestedPulls(workspaceId, { state, limit });   // null unless certification ws
  if (Array.isArray(ingested) && ingested.length) return { prs: ingested, source: 'certification' };
  return { prs: [], source: prs === null ? 'connector_unavailable' : 'live' };
}

/**
 * @param {object} params
 * @param {string} params.workspaceId
 * @param {string} params.owner            — GitHub org or user
 * @param {string} params.repo             — repository name
 * @param {string} params.slackChannelId   — target Slack channel ID
 * @param {string} [params.mergeMethod]    — squash|merge|rebase (default: squash)
 * @param {number} [params.minMergeReadinessScore] — default 70
 * @param {number} [params.maxPRs]         — safety cap (default: 10)
 * @returns {Promise<ExecutionPlan>}
 */
export async function buildPRReviewPlan({
  workspaceId,
  owner,
  repo,
  slackChannelId,
  mergeMethod = 'squash',
  minMergeReadinessScore = 70,
  maxPRs = 10,
}) {
  if (!workspaceId)    throw new ValidationError('workspaceId is required');
  if (!owner)          throw new ValidationError('owner is required');
  if (!repo)           throw new ValidationError('repo is required');
  if (!slackChannelId) throw new ValidationError('slackChannelId is required');

  const { prs, source: prSource } = await readOpenPulls(workspaceId, {
    owner, repo, state: 'open', limit: Math.min(maxPRs, 50),
  });

  const safetyResults = prs.map(pr => ({
    pr,
    safety: evaluatePRSafety(pr, { minMergeReadinessScore }),
  }));

  const safePRs   = safetyResults.filter(r => r.safety.safe);
  const unsafePRs = safetyResults.filter(r => !r.safety.safe);

  // ── Generic skip steps for unsafe PRs ────────────────────────────────────
  const skipSteps = unsafePRs.map(({ pr, safety }) => ({
    id:      `skip_pr_${pr.metadata?.number}`,
    type:    'skip',                        // ← generic
    name:    `Skip PR #${pr.metadata?.number}: ${pr.title}`,
    reasons: safety.reasons,
    trackIn: '_skippedPRs',                 // runtime appends to this var on skip
    trackItem: {
      number: pr.metadata?.number,
      title:  pr.title,
      url:    pr.url,
      score:  safety.score,
      reasons: safety.reasons,
    },
  }));

  // ── Generic action steps for safe PRs ────────────────────────────────────
  const perPRSteps = safePRs.map(({ pr }) => {
    const num = pr.metadata?.number;
    const prMeta = {
      number: num,
      title:  pr.title,
      url:    pr.url,
      author: pr.author,
      score:  pr.metadata?.mergeReadinessScore,
    };
    return [
      {
        id:          `approve_pr_${num}`,
        type:        'action',              // ← generic
        name:        `Approve PR #${num}: ${pr.title}`,
        connectorId: 'github',
        actionType:  'approve',
        payload: {
          owner,
          repo,
          number: num,
          event:  'APPROVE',
          body:   'Approved by FLOW automated PR review workflow.',
        },
        retryable: true,
        // metadata — transparent to runtime, used by buildPayload below
        _meta: prMeta,
        _isMerge: false,
      },
      {
        id:          `merge_pr_${num}`,
        type:        'action',              // ← generic
        name:        `Merge PR #${num}: ${pr.title}`,
        connectorId: 'github',
        actionType:  'execute',
        payload: {
          owner,
          repo,
          number:      num,
          mergeMethod,
          commitTitle: `${pr.title} (#${num})`,
        },
        verifyField: 'merged',
        retryable:   true,
        trackIn:     '_mergedPRs',          // runtime appends to this var on success
        trackItem:   prMeta,
        failTrackIn: '_failedPRs',          // runtime appends to this var on failure
        _meta:   prMeta,
        _isMerge: true,
      },
    ];
  }).flat();

  // ── All steps in plan order ───────────────────────────────────────────────
  const allPRSteps = [...skipSteps, ...perPRSteps];

  const notifyStep = {
    id:          'notify_slack',
    type:        'action',                  // ← generic
    name:        'Notify Engineering channel',
    connectorId: 'slack',
    actionType:  'send',
    critical:    false,                     // notification failure does not fail the workflow
    buildPayload: (runtimeCtx) => ({
      channelId: slackChannelId,
      text: _buildSlackMessage({
        workflowName: `PR Review: ${owner}/${repo}`,
        mergedPRs:   runtimeCtx.variables._mergedPRs  ?? [],
        skippedPRs:  runtimeCtx.variables._skippedPRs ?? [],
        failedPRs:   runtimeCtx.variables._failedPRs  ?? [],
        totalPRs:    prs.length,
      }),
    }),
  };

  return {
    workflowId:   'pr-review',
    workflowName: `PR Review: ${owner}/${repo}`,
    plannedAt:    new Date().toISOString(),
    params:       { owner, repo, slackChannelId, mergeMethod, minMergeReadinessScore },
    summary: {
      totalPRs:    prs.length,
      safePRs:     safePRs.length,
      unsafePRs:   unsafePRs.length,
      prSource:    prSource,          // 'live' | 'certification' | 'connector_unavailable'
      repoOwner:   owner,
      repoName:    repo,
      mergeMethod,
      minMergeReadinessScore,
      safePRList:   safePRs.map(r => ({ number: r.pr.metadata?.number, title: r.pr.title, score: r.safety.score })),
      unsafePRList: unsafePRs.map(r => ({ number: r.pr.metadata?.number, title: r.pr.title, reasons: r.safety.reasons })),
    },
    steps: [...allPRSteps, notifyStep],
  };
}

// ── Slack message builder (stays in the planner — runtime-agnostic) ───────────

function _buildSlackMessage({ workflowName, mergedPRs, skippedPRs, failedPRs, totalPRs }) {
  const lines = [
    `*${workflowName}* — completed`,
    '',
    `*${totalPRs} pull request${totalPRs === 1 ? '' : 's'}* reviewed`,
  ];

  if (mergedPRs.length > 0) {
    lines.push('', `✅ *Merged (${mergedPRs.length}):*`);
    for (const pr of mergedPRs) {
      const link = pr.url ? `<${pr.url}|#${pr.number} ${pr.title}>` : `#${pr.number} ${pr.title}`;
      lines.push(`  • ${link}`);
    }
  }

  if (skippedPRs.length > 0) {
    lines.push('', `⏭ *Skipped (${skippedPRs.length}):*`);
    for (const pr of skippedPRs) {
      const reason = (pr.reasons ?? [])[0] ?? 'did not meet safety threshold';
      lines.push(`  • #${pr.number} ${pr.title} — _${reason}_`);
    }
  }

  if (failedPRs.length > 0) {
    lines.push('', `❌ *Failed (${failedPRs.length}):*`);
    for (const pr of failedPRs) {
      lines.push(`  • #${pr.number} ${pr.title} — _${pr.error ?? 'unknown error'}_`);
    }
  }

  return lines.join('\n');
}
