/**
 * pushPipeline — the real-time trigger for FLOW's engineering pipeline.
 *
 * Subscribes to GitHub push events on the unified event bus. When a developer
 * pushes to a FEATURE branch, FLOW:
 *   • finds an open PR for that branch → runs the AI code review and posts it
 *   • no PR yet → surfaces a "ready to open a PR" nudge (notification + event)
 * Pushes to the default branch (main) trigger the CI/deploy watcher instead.
 *
 * Safe by design: it never auto-CREATES a PR (that stays a human/orchestrator call)
 * and never auto-merges. It analyzes + reviews + nudges — the reversible, additive
 * parts of the pipeline. Best-effort throughout; a failure never blocks the bus.
 *
 * Loop-prevention: ignores pushes that FLOW itself produced (metadata.orchestrated /
 * origin === 'ingestion') and de-dupes per (repo, ref, head sha) within a window.
 */

import { getConnector }       from '../connectors/registry.js';
import { ActionType }         from '../connectors/capabilities.js';
import { reviewCode, postReview } from './codeReviewService.js';
import { watchDeploy }        from './ciWatcher.js';
import { createNotification } from '../notifications/notificationEngine.js';
import { logger }             from '../utils/logger.js';

const seen = new Map(); // key → ts, dedupe pushes
const SEEN_TTL = 10 * 60_000;

function _dedupe(key) {
  const now = Date.now();
  for (const [k, t] of seen) if (now - t > SEEN_TTL) seen.delete(k);
  if (seen.has(key)) return false;
  seen.set(key, now);
  return true;
}

// Only react to real GitHub push events (not FLOW-originated ones). A webhook push
// is canonicalized to eventType 'engineering'; the original type survives in
// metadata.webhookEventType and the pushed ref in metadata.ref.
export function isPushEvent(event) {
  if (!event) return false;
  const connector = (event.connector || event.source || '').toLowerCase();
  if (connector !== 'github') return false;
  const md = event.metadata || {};
  if (md.orchestrated || md.origin === 'ingestion' || md.replayed) return false;
  const t = event.eventType || event.rawType || '';
  const wt = md.webhookEventType || '';
  return /commit\.pushed|push/i.test(t) || /commit\.pushed|push/i.test(wt)
    || md.kind === 'commit' || /^refs\/heads\//.test(md.ref || '');
}

/**
 * Handle one push event. Wired as a bus subscriber.
 */
export async function handlePush(event) {
  try {
    const md = event.metadata || {};
    const repoFull = md.repo || event.entity?.name;         // "owner/name"
    const ref = md.ref || '';                                // "refs/heads/feature-x"
    const head = md.head || md.sha || null;
    if (!repoFull || !repoFull.includes('/')) return;
    const [owner, repo] = repoFull.split('/');
    const branch = ref.replace(/^refs\/heads\//, '') || md.branch;
    if (!branch) return;

    const workspaceId = event.workspaceId;
    const orgId = event.organizationId || event.orgId;
    if (!_dedupe(`${workspaceId}:${repoFull}:${branch}:${head || ''}`)) return;

    const gh = getConnector('github');

    // Resolve the repo's default branch to distinguish feature push vs main push.
    let defaultBranch = 'main';
    try {
      const r = await gh.read(workspaceId, { resourceType: 'repos', owner, repo });
      defaultBranch = (Array.isArray(r) ? r[0] : r)?.branch || (Array.isArray(r) ? r[0] : r)?.metadata?.defaultBranch || 'main';
    } catch { /* default main */ }

    // ── Push to the default branch → watch CI/deploy ─────────────────────────
    if (branch === defaultBranch) {
      watchDeploy(workspaceId, { owner, repo, branch, orgId });
      logger.rag?.(`[PushPipeline] push to default ${owner}/${repo}@${branch} → CI watch`);
      return;
    }

    // ── Push to a feature branch → find an open PR and review it ──────────────
    let pr = null;
    try {
      const openPRs = await gh.read(workspaceId, { resourceType: 'pulls', owner, repo, state: 'open', limit: 20 });
      pr = (openPRs || []).find(p => (p.metadata?.headBranch || p.branch) === branch) || null;
    } catch { /* best-effort */ }

    if (pr) {
      const number = pr.number || pr.metadata?.number;
      const base = pr.metadata?.baseBranch || defaultBranch;
      // Re-review the updated diff and post it to the PR (LLM is slow → background).
      (async () => {
        try {
          const review = await reviewCode(workspaceId, { owner, repo, base, head: branch });
          // Autonomous action: run as a fixed system MEMBER (same pattern as the
          // automation engine) — VIEWER default would be denied by governance.
          await postReview(workspaceId, { owner, repo, number, review, actor: { id: 'flow-engineering', role: 'MEMBER', orgId }, orgId });
          logger.rag?.(`[PushPipeline] re-reviewed PR #${number} after push (${review.findings.length} findings)`);
        } catch (err) { logger.rag?.(`[PushPipeline] review failed: ${err.message}`); }
      })();
      logger.rag?.(`[PushPipeline] push to ${branch} → reviewing open PR #${number}`);
    } else {
      // No PR yet — nudge that the branch is ready to open one.
      try {
        await createNotification({
          orgId, workspaceId, type: 'PR_SUGGESTED', priority: 40,
          title: `Ready to open a PR: ${repo}`,
          body: `New commits on \`${branch}\` in ${owner}/${repo} aren't in a pull request yet. Want FLOW to open one?`,
          dedupeKey: `pr-suggest-${owner}-${repo}-${branch}`,
        });
      } catch { /* best-effort */ }
      logger.rag?.(`[PushPipeline] push to ${branch} → no PR, nudged`);
    }
  } catch (err) {
    logger.rag?.(`[PushPipeline] error: ${err.message}`);
  }
}

export default { isPushEvent, handlePush };
