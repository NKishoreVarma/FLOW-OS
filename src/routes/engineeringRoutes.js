/**
 * FLOW OS — Engineering Capability Routes
 *
 * Provider-agnostic REST API for the Engineering Capability.
 * GitHub is the first provider. Future providers (GitLab, Bitbucket, Azure DevOps)
 * use the same routes via ?provider= query param.
 *
 * All state-changing actions flow through executeAction() → governance → audit → timeline.
 *
 * Route map:
 *   GET  /api/engineering/status                          — GitHub connection status
 *   POST /api/engineering/auth                            — Store PAT token
 *   GET  /api/engineering/repos                           — List repos for authenticated user/org
 *   GET  /api/engineering/repos/:owner/:repo              — Single repo metadata + contributors
 *   GET  /api/engineering/repos/:owner/:repo/branches     — List branches
 *   GET  /api/engineering/repos/:owner/:repo/compare      — Compare two refs (?base=&head=)
 *   GET  /api/engineering/repos/:owner/:repo/commits      — Commit history (?sha=&limit=)
 *   GET  /api/engineering/repos/:owner/:repo/commits/:sha — Single commit with files changed
 *   GET  /api/engineering/repos/:owner/:repo/pulls        — Open/closed PRs (?state=)
 *   GET  /api/engineering/repos/:owner/:repo/pulls/:number — Single PR with merge readiness
 *   GET  /api/engineering/repos/:owner/:repo/pulls/:number/reviews — PR reviews + workload
 *   GET  /api/engineering/repos/:owner/:repo/deployments  — Deployments (?environment=)
 *   GET  /api/engineering/repos/:owner/:repo/contributors — Top contributors
 *   POST /api/engineering/repos/:owner/:repo/branches     — Create branch
 *   POST /api/engineering/repos/:owner/:repo/pulls        — Create pull request
 *   PATCH /api/engineering/repos/:owner/:repo/pulls/:number — Update PR (title/body/state)
 *   POST /api/engineering/repos/:owner/:repo/pulls/:number/approve — Approve PR review
 *   POST /api/engineering/repos/:owner/:repo/pulls/:number/merge   — Merge pull request
 *   POST /api/engineering/search                          — Search code/repos/commits/issues
 *   POST /api/engineering/sync                            — Sync PRs + commits to ingestion pipeline
 */

import express from 'express';
import { executeAction }      from '../connectors/executionEngine.js';
import { getCredentials }     from '../connectors/authManager.js';
import { getConnector }       from '../connectors/registry.js';
import { autoRegisterWebhooks } from '../services/integrations/WebhookAutoRegistrar.js';
import { orchestratePR }        from '../engineering/prOrchestrator.js';
import { ActionType }         from '../connectors/capabilities.js';
import { ValidationError }    from '../core/errors/index.js';

const router = express.Router();

// ── Workspace-id guard ────────────────────────────────────────────────────────
router.use((req, res, next) => {
  const workspaceId = req.headers['workspace-id'] || req.tenantId;
  if (!workspaceId) {
    return res.status(400).json({
      error: { code: 'MISSING_WORKSPACE', message: 'workspace-id header is required' },
    });
  }
  req.workspaceId = workspaceId;
  next();
});

// ── Provider resolution ───────────────────────────────────────────────────────
function resolveProvider(req) {
  return req.query.provider || 'github';
}

// ── executeAction wrapper ─────────────────────────────────────────────────────
async function runAction(req, res, next, { actionType, payload }) {
  try {
    const { result, timelineEvent } = await executeAction({
      workspaceId: req.workspaceId,
      connectorId: resolveProvider(req),
      actionType,
      payload,
      actor:       req.user,
      orgPlan:     req.govContext?.orgPlan ?? 'free',
    });
    // Live connector returned nothing but the workspace has ingested engineering data
    // (certification / imported world) → serve that with provenance instead of empty.
    if (actionType === ActionType.READ && Array.isArray(result) && result.length === 0) {
      const ing = await _ingestedEngineeringFallback(req.workspaceId, payload);
      if (ing) return res.json({ success: true, result: ing, sourceMode: 'certification' });
    }
    res.json({ success: true, result, timelineEvent });
  } catch (err) {
    // The live connector isn't authenticated. Before surfacing "connect GitHub", check
    // for ingested workspace data and serve it (honest provenance) — the same
    // workspace-aware policy the Brain uses. Only for READs; writes still fail honestly.
    if (actionType === ActionType.READ) {
      try {
        const ing = await _ingestedEngineeringFallback(req.workspaceId, payload);
        if (ing) return res.json({ success: true, result: ing, sourceMode: 'certification' });
      } catch { /* fall through to the real error */ }
    }
    next(err);
  }
}

// Map an engineering READ to ingested graph data. Returns null when there's nothing
// ingested (so the caller surfaces the honest "connect" state).
async function _ingestedEngineeringFallback(workspaceId, payload) {
  const { ingestedRepos } = await import('../services/certification/ingestedReads.js');
  const rt = payload?.resourceType;
  if (rt === 'repos') return await ingestedRepos(workspaceId, { limit: payload?.limit || 30 });
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Status & Auth
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/engineering/status
router.get('/status', async (req, res) => {
  const providerId = resolveProvider(req);
  const adapter    = getConnector(providerId);
  const creds      = getCredentials(req.workspaceId, providerId);
  const health     = await adapter.healthCheck(req.workspaceId).catch(err => ({
    status: 'DOWN', detail: err.message,
  }));

  res.json({
    connector:    providerId,
    authenticated: !!creds,
    health,
    credentialType: creds?.strategy || null,
    connectedAt:    creds?.storedAt || null,
  });
});

// POST /api/engineering/auth — store a PAT for this workspace
router.post('/auth', async (req, res, next) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: 'token is required' });

    const adapter = getConnector(resolveProvider(req));
    const result  = await adapter.authenticate(req.workspaceId, { token });

    // Set up real-time webhooks now that GitHub is connected (best-effort; needs
    // WEBHOOK_BASE_URL to be a public url — otherwise the poller stays the source).
    autoRegisterWebhooks(req.workspaceId, resolveProvider(req))
      .catch(err => console.warn('[engineering/auth] webhook auto-register:', err.message));

    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
});

// Manually (re)register real-time webhooks for an already-connected workspace.
// Use this after setting WEBHOOK_BASE_URL (e.g. an ngrok url) without reconnecting.
router.post('/webhooks/register', async (req, res, next) => {
  try {
    const result = await autoRegisterWebhooks(req.workspaceId, resolveProvider(req));
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
});

// AI code review of a diff (base…head), optionally posted to a PR.
// Body: { owner, repo, head, base?, prNumber? }
router.post('/review', async (req, res, next) => {
  const { owner, repo, head, base, prNumber } = req.body;
  if (!owner || !repo || !head) return res.status(400).json({ error: 'owner, repo, and head are required' });
  try {
    const { reviewCode, postReview } = await import('../engineering/codeReviewService.js');
    const review = await reviewCode(req.workspaceId, { owner, repo, head, base: base || 'main' });
    let posted = null;
    if (prNumber) posted = await postReview(req.workspaceId, { owner, repo, number: prNumber, review, actor: req.user || {}, orgId: req.workspace?.orgId || req.user?.orgId, orgPlan: req.workspace?.org?.plan || 'pro' });
    res.json({ success: true, review, posted });
  } catch (err) { next(err); }
});

// Autonomous PR pipeline: analyze diff → AI review → draft PR → suggest reviewers →
// open PR → notify → publish. Stops at merge (human-approved per governance).
// Body: { owner, repo, head, base? }
router.post('/orchestrate-pr', async (req, res, next) => {
  const { owner, repo, head, base } = req.body;
  if (!owner || !repo || !head) return res.status(400).json({ error: 'owner, repo, and head are required' });
  try {
    const result = await orchestratePR(req.workspaceId, {
      owner, repo, head, base: base || 'main',
      actor: req.user || {}, orgId: req.workspace?.orgId || req.user?.orgId,
      orgPlan: req.workspace?.org?.plan || 'pro',
    });
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Repositories
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/engineering/repos — list repos
router.get('/repos', (req, res, next) => runAction(req, res, next, {
  actionType: ActionType.READ,
  payload: {
    resourceType: 'repos',
    owner:  req.query.owner  || null,
    limit:  Number(req.query.limit) || 30,
  },
}));

// GET /api/engineering/repos/:owner/:repo — single repo
router.get('/repos/:owner/:repo', (req, res, next) => runAction(req, res, next, {
  actionType: ActionType.READ,
  payload: {
    resourceType: 'repos',
    owner: req.params.owner,
    repo:  req.params.repo,
  },
}));

// GET /api/engineering/repos/:owner/:repo/contributors
router.get('/repos/:owner/:repo/contributors', (req, res, next) => runAction(req, res, next, {
  actionType: ActionType.READ,
  payload: {
    resourceType: 'contributors',
    owner: req.params.owner,
    repo:  req.params.repo,
    limit: Number(req.query.limit) || 20,
  },
}));

// ─────────────────────────────────────────────────────────────────────────────
// Branches
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/engineering/repos/:owner/:repo/branches
router.get('/repos/:owner/:repo/branches', (req, res, next) => runAction(req, res, next, {
  actionType: ActionType.READ,
  payload: {
    resourceType: 'branches',
    owner: req.params.owner,
    repo:  req.params.repo,
    limit: Number(req.query.limit) || 30,
  },
}));

// GET /api/engineering/repos/:owner/:repo/compare?base=main&head=feature
router.get('/repos/:owner/:repo/compare', (req, res, next) => runAction(req, res, next, {
  actionType: ActionType.READ,
  payload: {
    resourceType: 'branches',
    owner: req.params.owner,
    repo:  req.params.repo,
    base:  req.query.base,
    head:  req.query.head,
  },
}));

// POST /api/engineering/repos/:owner/:repo/branches — create branch
router.post('/repos/:owner/:repo/branches', (req, res, next) => runAction(req, res, next, {
  actionType: ActionType.CREATE,
  payload: {
    resourceType: 'branch',
    owner:      req.params.owner,
    repo:       req.params.repo,
    branchName: req.body.branchName,
    fromSha:    req.body.fromSha    || null,
    fromBranch: req.body.fromBranch || null,
  },
}));

// ─────────────────────────────────────────────────────────────────────────────
// Commits
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/engineering/repos/:owner/:repo/commits
router.get('/repos/:owner/:repo/commits', (req, res, next) => runAction(req, res, next, {
  actionType: ActionType.READ,
  payload: {
    resourceType: 'commits',
    owner: req.params.owner,
    repo:  req.params.repo,
    sha:   req.query.sha  || req.query.branch || null,
    limit: Number(req.query.limit) || 30,
  },
}));

// GET /api/engineering/repos/:owner/:repo/commits/:sha
router.get('/repos/:owner/:repo/commits/:sha', (req, res, next) => runAction(req, res, next, {
  actionType: ActionType.READ,
  payload: {
    resourceType: 'commits',
    owner: req.params.owner,
    repo:  req.params.repo,
    sha:   req.params.sha,
  },
}));

// ─────────────────────────────────────────────────────────────────────────────
// Pull Requests
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/engineering/repos/:owner/:repo/pulls?state=open
router.get('/repos/:owner/:repo/pulls', (req, res, next) => runAction(req, res, next, {
  actionType: ActionType.READ,
  payload: {
    resourceType: 'pulls',
    owner: req.params.owner,
    repo:  req.params.repo,
    state: req.query.state || 'open',
    limit: Number(req.query.limit) || 20,
  },
}));

// GET /api/engineering/repos/:owner/:repo/pulls/:number
router.get('/repos/:owner/:repo/pulls/:number', (req, res, next) => runAction(req, res, next, {
  actionType: ActionType.READ,
  payload: {
    resourceType: 'pulls',
    owner:  req.params.owner,
    repo:   req.params.repo,
    number: Number(req.params.number),
  },
}));

// POST /api/engineering/repos/:owner/:repo/pulls — create PR
router.post('/repos/:owner/:repo/pulls', (req, res, next) => runAction(req, res, next, {
  actionType: ActionType.CREATE,
  payload: {
    resourceType: 'pull',
    owner: req.params.owner,
    repo:  req.params.repo,
    ...req.body,
  },
}));

// PATCH /api/engineering/repos/:owner/:repo/pulls/:number — update PR
router.patch('/repos/:owner/:repo/pulls/:number', (req, res, next) => runAction(req, res, next, {
  actionType: ActionType.UPDATE,
  payload: {
    owner:  req.params.owner,
    repo:   req.params.repo,
    number: Number(req.params.number),
    ...req.body,
  },
}));

// ─────────────────────────────────────────────────────────────────────────────
// Code Reviews
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/engineering/repos/:owner/:repo/pulls/:number/reviews
router.get('/repos/:owner/:repo/pulls/:number/reviews', (req, res, next) => runAction(req, res, next, {
  actionType: ActionType.READ,
  payload: {
    resourceType: 'reviews',
    owner:  req.params.owner,
    repo:   req.params.repo,
    number: Number(req.params.number),
  },
}));

// POST /api/engineering/repos/:owner/:repo/pulls/:number/approve
router.post('/repos/:owner/:repo/pulls/:number/approve', (req, res, next) => runAction(req, res, next, {
  actionType: ActionType.APPROVE,
  payload: {
    owner:  req.params.owner,
    repo:   req.params.repo,
    number: Number(req.params.number),
    event:  req.body.event || 'APPROVE',
    body:   req.body.body  || '',
  },
}));

// POST /api/engineering/repos/:owner/:repo/pulls/:number/merge
// Merges through the governed engine, then FLOW watches CI/deploy on the target
// branch and reports success/failure to the team + dashboard.
router.post('/repos/:owner/:repo/pulls/:number/merge', async (req, res, next) => {
  const { owner, repo } = req.params;
  const number = Number(req.params.number);
  try {
    const adapter = getConnector('github');
    // Resolve the PR's target branch so the CI watcher polls the right one.
    let baseBranch = 'main';
    try {
      const prs = await adapter.read(req.workspaceId, { resourceType: 'pulls', owner, repo, number });
      baseBranch = (Array.isArray(prs) ? prs[0] : prs)?.metadata?.baseBranch || 'main';
    } catch { /* default main */ }

    const { result, timelineEvent } = await executeAction({
      workspaceId: req.workspaceId, connectorId: 'github', actionType: ActionType.EXECUTE,
      payload: { owner, repo, number, mergeMethod: req.body.mergeMethod || 'squash', commitTitle: req.body.commitTitle || null, commitMessage: req.body.commitMessage || null },
      actor: req.user || {}, orgPlan: req.workspace?.org?.plan || 'pro', approvedBy: req.user?.id,
    });

    // On a successful merge, start the (bounded, non-blocking) CI/deploy watcher.
    if (result?.result?.merged || result?.merged) {
      const { watchDeploy } = await import('../engineering/ciWatcher.js');
      watchDeploy(req.workspaceId, { owner, repo, branch: baseBranch, orgId: req.workspace?.orgId || req.user?.orgId, prNumber: number });
    }
    res.json({ success: true, result, timelineEvent });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Deployments
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/engineering/repos/:owner/:repo/deployments?environment=production
router.get('/repos/:owner/:repo/deployments', (req, res, next) => runAction(req, res, next, {
  actionType: ActionType.READ,
  payload: {
    resourceType: 'deployments',
    owner:       req.params.owner,
    repo:        req.params.repo,
    environment: req.query.environment || null,
    limit:       Number(req.query.limit) || 20,
  },
}));

// GET /api/engineering/repos/:owner/:repo/deployments/:id
router.get('/repos/:owner/:repo/deployments/:id', (req, res, next) => runAction(req, res, next, {
  actionType: ActionType.READ,
  payload: {
    resourceType: 'deployments',
    owner: req.params.owner,
    repo:  req.params.repo,
    id:    req.params.id,
  },
}));

// ─────────────────────────────────────────────────────────────────────────────
// Universal Search + Sync
// ─────────────────────────────────────────────────────────────────────────────

// POST /api/engineering/search
router.post('/search', (req, res, next) => runAction(req, res, next, {
  actionType: ActionType.SEARCH,
  payload: {
    query: req.body.query,
    type:  req.body.type  || 'repositories',
    repo:  req.body.repo  || null,
    limit: req.body.limit || 10,
  },
}));

// POST /api/engineering/sync — push PRs + commits into ingestion pipeline
router.post('/sync', (req, res, next) => runAction(req, res, next, {
  actionType: ActionType.SYNC,
  payload: {
    owner: req.body.owner,
    repo:  req.body.repo,
    limit: req.body.limit || 20,
  },
}));

export default router;
