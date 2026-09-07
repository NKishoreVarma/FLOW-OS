/**
 * ciWatcher — after a merge, FLOW watches the GitHub Actions run for the target
 * branch and reports deploy success/failure to the team and the dashboard.
 *
 * Reuses existing capabilities only: GitHub workflow_runs read, notificationEngine,
 * and the event platform (so the result lands on the live feed / briefing). Runs as
 * a bounded poll (no infinite loop): checks every INTERVAL until the run reaches a
 * conclusion or MAX_WAIT elapses, then reports once.
 */

import { getConnector }       from '../connectors/registry.js';
import { createNotification } from '../notifications/notificationEngine.js';
import { publishFields }      from '../events/index.js';
import { logger }             from '../utils/logger.js';

const INTERVAL_MS = Number(process.env.CI_WATCH_INTERVAL_MS) || 30_000; // 30s
const MAX_WAIT_MS  = Number(process.env.CI_WATCH_MAX_MS) || 15 * 60_000; // 15 min

const active = new Map(); // key → timer, so we never double-watch the same merge

/**
 * Begin watching CI for a branch after a merge. Non-blocking; reports when done.
 * @param {string} workspaceId
 * @param {object} opts { owner, repo, branch='main', orgId, prNumber?, prTitle? }
 */
export function watchDeploy(workspaceId, { owner, repo, branch = 'main', orgId, prNumber = null, prTitle = '' } = {}) {
  if (!owner || !repo) return;
  const key = `${workspaceId}:${owner}/${repo}:${branch}:${prNumber || Date.now()}`;
  if (active.has(key)) return;

  const startedAt = Date.now();
  logger.rag?.(`[CIWatch] watching ${owner}/${repo}@${branch} after merge (PR #${prNumber || '?'})`);

  const tick = async () => {
    try {
      const gh = getConnector('github');
      const runs = await gh.read(workspaceId, { resourceType: 'workflow_runs', owner, repo, limit: 10 });
      // Most recent run on the target branch triggered by the merge.
      const run = (runs || []).find(r => r.branch === branch);

      if (!run) {
        // No Actions configured for this repo — report once and stop.
        if (Date.now() - startedAt > INTERVAL_MS * 2) return _finish(key, 'no_ci', { workspaceId, owner, repo, branch, orgId, prNumber, prTitle });
        return _schedule(key, tick);
      }
      if (run.status !== 'completed') {
        if (Date.now() - startedAt > MAX_WAIT_MS) return _finish(key, 'timeout', { workspaceId, owner, repo, branch, orgId, prNumber, prTitle, run });
        return _schedule(key, tick); // still running
      }
      // Completed — report success/failure once.
      return _finish(key, run.conclusion === 'success' ? 'success' : 'failure', { workspaceId, owner, repo, branch, orgId, prNumber, prTitle, run });
    } catch (err) {
      logger.rag?.(`[CIWatch] error: ${err.message}`);
      if (Date.now() - startedAt > MAX_WAIT_MS) return _finish(key, 'error', { workspaceId, owner, repo, branch, orgId, prNumber, prTitle });
      _schedule(key, tick);
    }
  };

  // First check runs almost immediately (CI often already has a run within seconds);
  // subsequent checks are spaced by INTERVAL_MS.
  const t0 = setTimeout(tick, 1500);
  if (t0.unref) t0.unref();
  active.set(key, t0);
}

function _schedule(key, tick) {
  const t = setTimeout(tick, INTERVAL_MS);
  if (t.unref) t.unref();
  active.set(key, t);
}

async function _finish(key, outcome, ctx) {
  const timer = active.get(key); if (timer) clearTimeout(timer);
  active.delete(key);
  const { workspaceId, owner, repo, branch, orgId, prNumber, prTitle, run } = ctx;

  const MSG = {
    success: { title: `Deploy succeeded: ${repo}`, body: `CI passed on ${owner}/${repo}@${branch}${prNumber ? ` after merging PR #${prNumber}` : ''}${run ? ` — ${run.name}` : ''}.`, priority: 40 },
    failure: { title: `Deploy FAILED: ${repo}`, body: `CI failed on ${owner}/${repo}@${branch}${prNumber ? ` after merging PR #${prNumber}` : ''}${run ? ` — ${run.name} (${run.conclusion})` : ''}. Needs attention.`, priority: 80 },
    timeout: { title: `Deploy still running: ${repo}`, body: `CI on ${owner}/${repo}@${branch} hasn't finished after 15 min — check GitHub Actions.`, priority: 50 },
    no_ci:   { title: `Merged: ${repo}`, body: `Merged into ${branch} on ${owner}/${repo}. No GitHub Actions workflow is configured for this repo.`, priority: 30 },
    error:   { title: `CI status unknown: ${repo}`, body: `Couldn't read GitHub Actions status for ${owner}/${repo}@${branch}.`, priority: 40 },
  }[outcome];

  try {
    await createNotification({
      orgId, workspaceId, type: 'DEPLOY_STATUS', priority: MSG.priority,
      title: MSG.title, body: MSG.body,
      actions: run?.url ? [{ type: 'github.open_run', label: 'View run', params: { url: run.url } }] : [],
      dedupeKey: `deploy-${owner}-${repo}-${branch}-${prNumber || 'na'}`,
    });
  } catch (err) { logger.rag?.(`[CIWatch] notify failed: ${err.message}`); }

  try {
    await publishFields({
      workspaceId, organizationId: orgId,
      source: 'github', type: outcome === 'failure' ? 'incident' : 'deployment',
      title: outcome === 'success' ? `deploy succeeded on ${repo}` : outcome === 'failure' ? `deploy FAILED on ${repo}` : `merge complete on ${repo}`,
      summary: MSG.body, sourceEventId: `deploy-${repo}-${branch}-${prNumber || Date.now()}`,
      priority: outcome === 'failure' ? 'high' : 'medium',
      metadata: { repo, branch, prNumber, conclusion: run?.conclusion || outcome, kind: 'deployment' },
    });
  } catch (err) { logger.rag?.(`[CIWatch] publish failed: ${err.message}`); }

  logger.rag?.(`[CIWatch] ${owner}/${repo}@${branch} → ${outcome}`);
  return { outcome, run: run || null };
}

export default { watchDeploy };
