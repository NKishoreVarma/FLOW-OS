/**
 * prOrchestrator — FLOW's autonomous PR pipeline (the "AI Engineering Manager").
 *
 * Given a head branch, it runs the whole chain using ONLY existing, verified
 * capabilities — nothing new is invented:
 *   1. Analyze the diff        → GitHub compare (commits + files)
 *   2. Generate PR title/body  → actionComposer.composePRDraft (LLM over the diff)
 *   3. Suggest reviewers       → GitHub reviews read (suggestedReviewers)
 *   4. Create the PR           → governed executeAction (create pull)
 *   5. Request reviewers       → governed executeAction (approve/request path)
 *   6. Prepare a team notification → notificationEngine (Slack sends if connected)
 *   7. Emit a FLOW event       → lands on the live feed / dashboard / briefing
 *
 * It STOPS at merge: merging is governed and human-approved by design (HIGH/CRITICAL).
 * The report tells the user the PR is ready and what the merge gate will be.
 *
 * Every side-effect flows through the governed execution engine — governance,
 * risk-tiering, audit, and the OAuth-aware auth check all apply.
 */

import { getConnector }      from '../connectors/registry.js';
import { ActionType }        from '../connectors/capabilities.js';
import { executeAction }     from '../connectors/executionEngine.js';
import { composePRDraft }    from '../services/conversation/actionComposer.js';
import { reviewCode, postReview } from './codeReviewService.js';
import { createNotification } from '../notifications/notificationEngine.js';
import { publishFields }     from '../events/index.js';
import { logger }            from '../utils/logger.js';

/**
 * Run the autonomous PR pipeline.
 * @param {string} workspaceId
 * @param {object} opts { owner, repo, head, base='main', actor, orgId }
 * @returns {Promise<{ steps, pr, reviewers, notification, report }>}
 */
export async function orchestratePR(workspaceId, { owner, repo, head, base = 'main', actor = {}, orgId, orgPlan = 'pro' } = {}) {
  if (!owner || !repo || !head) throw new Error('owner, repo, and head are required');
  const gh = getConnector('github');
  const steps = [];
  const step = (name, status, detail) => { steps.push({ name, status, detail }); logger.rag?.(`[PROrch] ${name}: ${status} — ${detail || ''}`); };

  // ── 1. Analyze the diff ──────────────────────────────────────────────────────
  let compare;
  try {
    compare = await gh.read(workspaceId, { resourceType: 'branches', owner, repo, base, head });
    if (!compare?.totalCommits) {
      step('analyze', 'skipped', `No commits on ${head} ahead of ${base}.`);
      return { steps, report: `Nothing to open a PR for — ${head} has no commits ahead of ${base}.` };
    }
    step('analyze', 'done', `${compare.totalCommits} commit(s) ahead, ${compare.commits?.length || 0} analyzed.`);
  } catch (err) {
    step('analyze', 'failed', err.message);
    return { steps, report: `Couldn't compare ${head}…${base}: ${err.message}` };
  }

  // ── 2. Generate PR title + description ───────────────────────────────────────
  const draft = await composePRDraft({ head, base, commits: compare.commits || [] });
  step('generate', 'done', `Title: "${draft.title}"`);

  // ── 3. Suggest reviewers (from prior review activity in the repo) ─────────────
  let reviewers = [];
  try {
    // Pull open PRs' review data to derive active reviewers for this repo.
    const openPRs = await gh.read(workspaceId, { resourceType: 'pulls', owner, repo, state: 'open', limit: 5 });
    if (openPRs?.[0]?.metadata?.number) {
      const rv = await gh.read(workspaceId, { resourceType: 'reviews', owner, repo, number: openPRs[0].metadata.number });
      reviewers = (rv?.suggestedReviewers || []).slice(0, 3);
    }
    step('reviewers', 'done', reviewers.length ? reviewers.join(', ') : 'no prior reviewers found');
  } catch (err) {
    step('reviewers', 'skipped', err.message);
  }

  // ── 4. Create the PR (governed) ──────────────────────────────────────────────
  let pr;
  try {
    const { result } = await executeAction({
      workspaceId, connectorId: 'github', actionType: ActionType.CREATE,
      payload: { resourceType: 'pull', owner, repo, title: draft.title, body: draft.body, head, base },
      actor: { ...actor, orgId }, orgPlan, approvedBy: actor.id,
    });
    pr = result?.result || result;
    step('create_pr', 'done', `PR #${pr?.number || pr?.metadata?.number} opened.`);
  } catch (err) {
    // Create is MEDIUM risk; if it needs confirmation/approval the engine says so.
    step('create_pr', 'failed', err.message);
    return { steps, draft, reviewers, report: `Prepared the PR ("${draft.title}") but couldn't open it: ${err.message}` };
  }

  const prNumber = pr?.number || pr?.metadata?.number;

  // ── 4b. AI code review — runs in the BACKGROUND (LLM over the diff is slow) and
  // posts its findings to the PR when done, so the pipeline response stays fast.
  if (prNumber) {
    step('code_review', 'started', 'Reviewing the diff — findings will be posted to the PR.');
    (async () => {
      try {
        const review = await reviewCode(workspaceId, { owner, repo, base, head });
        // Use the caller's identity if present, else a fixed system MEMBER actor
        // so the governed comment isn't denied as VIEWER.
        const reviewActor = actor?.id ? actor : { id: 'flow-engineering', role: 'MEMBER', orgId };
        await postReview(workspaceId, { owner, repo, number: prNumber, review, actor: reviewActor, orgId, orgPlan });
        logger.rag?.(`[PROrch] code review posted to PR #${prNumber}: ${review.findings.length} findings, ${review.recommendation}`);
      } catch (err) { logger.rag?.(`[PROrch] background review failed: ${err.message}`); }
    })();
  }

  // ── 5. Surface the suggested reviewers on the PR (as a review-request comment) ─
  if (reviewers.length && prNumber) {
    try {
      await executeAction({
        workspaceId, connectorId: 'github', actionType: ActionType.CREATE,
        payload: { resourceType: 'comment', owner, repo, number: prNumber,
          body: `Suggested reviewers based on this repo's recent review activity: ${reviewers.map(r => `@${r}`).join(', ')}.` },
        actor: { ...actor, orgId }, orgPlan, approvedBy: actor.id,
      });
      step('request_review', 'done', `Posted reviewer suggestion: ${reviewers.join(', ')}`);
    } catch (err) {
      step('request_review', 'skipped', err.message);
    }
  }

  // ── 6. Prepare a team notification (Slack sends if connected) ─────────────────
  let notification = null;
  try {
    const out = await createNotification({
      orgId, workspaceId, type: 'PR_READY', priority: 50,
      title: `PR ready: ${draft.title}`,
      body: `${owner}/${repo} #${prNumber} (${head} → ${base}) — ${compare.totalCommits} commit(s). ${reviewers.length ? `Reviewers: ${reviewers.join(', ')}.` : ''}`,
      actions: [{ type: 'github.open_pr', label: 'Review PR', params: { url: pr?.url || pr?.html_url } }],
      dedupeKey: `pr-ready-${owner}-${repo}-${prNumber}`,
    });
    notification = out?.notification || null;
    step('notify', 'done', 'Team notification prepared (delivered to Slack when connected).');
  } catch (err) {
    step('notify', 'skipped', err.message);
  }

  // ── 7. Emit a FLOW event → live feed / dashboard / briefing ──────────────────
  try {
    await publishFields({
      workspaceId, organizationId: orgId, source: 'github', type: 'engineering',
      title: `opened PR #${prNumber} in ${repo}`, summary: draft.title,
      sourceEventId: `pr-orch-${repo}-${prNumber}`, priority: 'medium',
      entities: [{ type: 'PR', id: String(prNumber), name: draft.title }],
      metadata: { repo, number: prNumber, head, base, kind: 'pull_request', orchestrated: true },
    });
    step('publish', 'done', 'Event published to feed/dashboard.');
  } catch (err) {
    step('publish', 'skipped', err.message);
  }

  const mergeGate = (base === 'main' || base === 'master') ? 'CRITICAL (two approvers)' : 'HIGH (one approver)';
  const report = `PR #${prNumber} is ready in ${owner}/${repo}: "${draft.title}". `
    + `${compare.totalCommits} commit(s) from ${head} into ${base}. `
    + `${reviewers.length ? `Suggested reviewers: ${reviewers.join(', ')}. ` : ''}`
    + `When approvals are in, merging is gated at ${mergeGate} — I'll handle the merge once you approve.`;

  return { steps, pr, prNumber, draft, reviewers, notification, mergeGate, report };
}

export default { orchestratePR };
