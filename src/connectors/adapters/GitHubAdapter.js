/**
 * FLOW OS — GitHub Adapter
 *
 * Engineering Capability — first provider.
 * Future providers (GitLab, Bitbucket, Azure DevOps) extend the same route surface.
 *
 * All engineering objects are normalized to createEngineeringTask() before
 * leaving this file. No GitHub-specific fields are returned to callers.
 *
 * Auth: GitHub Personal Access Token (PAT) stored via storeApiKey(),
 *       or GITHUB_TOKEN env var as workspace-level fallback.
 *
 * Resource types dispatched by payload.resourceType in read():
 *   repos        — list user/org repos, or single repo with contributors
 *   branches     — list branches or compare two refs
 *   commits      — list commit history or fetch single commit with files
 *   pulls        — list PRs or fetch single PR with merge readiness score
 *   reviews      — list reviews + reviewer workload for a PR
 *   deployments  — list deployments or fetch single with risk score
 */

import { BaseAdapter }                           from '../BaseAdapter.js';
import { Capability, ActionType, AuthStrategy }  from '../capabilities.js';
import { createEngineeringTask, createSearchResult } from '../normalizedTypes.js';
import { getCredentials, storeApiKey }           from '../authManager.js';
import { AppError, ValidationError }             from '../../core/errors/index.js';
import { EntityTypes, registerEntity, linkEntities } from '../../services/knowledgeGraphService.js';

const GITHUB_API = process.env.GITHUB_API_URL || 'https://api.github.com';
const GITHUB_ACCEPT = 'application/vnd.github+json';
const GITHUB_API_VERSION = '2022-11-28';

// ─── GitHub REST helper ───────────────────────────────────────────────────────

function buildHeaders(token) {
  return {
    Authorization:          `Bearer ${token}`,
    Accept:                 GITHUB_ACCEPT,
    'X-GitHub-Api-Version': GITHUB_API_VERSION,
    'User-Agent':           'FLOW-OS/1.0',
  };
}

async function ghFetch(path, token, options = {}) {
  const url = path.startsWith('https://') ? path : `${GITHUB_API}${path}`;
  const res  = await fetch(url, { ...options, headers: buildHeaders(token) });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new AppError(
      body.message || `GitHub API error: ${res.status}`,
      res.status === 404 ? 404 : res.status === 403 ? 403 : 502,
      'GITHUB_API_ERROR',
    );
  }
  return res.json();
}

// ─── Normalizers ──────────────────────────────────────────────────────────────

function normalizeRepo(repo) {
  return createEngineeringTask({
    id:          String(repo.id),
    connector:   'github',
    type:        'pipeline',
    title:       repo.full_name,
    description: repo.description || '',
    status:      repo.archived ? 'archived' : 'active',
    priority:    'P2',
    author:      repo.owner?.login || null,
    url:         repo.html_url,
    repo:        repo.full_name,
    branch:      repo.default_branch || 'main',
    timestamp:   repo.updated_at || repo.created_at,
    metadata: {
      language:         repo.language,
      stars:            repo.stargazers_count,
      forks:            repo.forks_count,
      openIssues:       repo.open_issues_count,
      visibility:       repo.visibility,
      defaultBranch:    repo.default_branch,
      topics:           repo.topics || [],
      cloneUrl:         repo.clone_url,
      pushedAt:         repo.pushed_at,
    },
  });
}

function normalizePR(pr, repo) {
  const reviewStatus = computePRReviewStatus(pr);
  const mergeReadinessScore = computeMergeReadiness(pr);

  return createEngineeringTask({
    id:          String(pr.id),
    connector:   'github',
    type:        'pr',
    title:       pr.title,
    description: pr.body || '',
    status:      pr.state === 'open' ? (pr.draft ? 'draft' : 'open') : pr.state,
    priority:    pr.labels?.some(l => l.name.toLowerCase().includes('urgent') || l.name.toLowerCase().includes('critical')) ? 'P0' : 'P2',
    assignee:    pr.assignee?.login || pr.assignees?.[0]?.login || null,
    author:      pr.user?.login || null,
    labels:      (pr.labels || []).map(l => l.name),
    url:         pr.html_url,
    repo,
    branch:      pr.head?.ref || null,
    timestamp:   pr.updated_at || pr.created_at,
    metadata: {
      number:             pr.number,
      baseBranch:         pr.base?.ref,
      headBranch:         pr.head?.ref,
      headSha:            pr.head?.sha,
      draft:              pr.draft,
      merged:             pr.merged,
      mergeable:          pr.mergeable,
      mergeReadinessScore,
      reviewStatus,
      reviewers:          (pr.requested_reviewers || []).map(r => r.login),
      additions:          pr.additions,
      deletions:          pr.deletions,
      changedFiles:       pr.changed_files,
      commitsCount:       pr.commits,
      createdAt:          pr.created_at,
      closedAt:           pr.closed_at,
      mergedAt:           pr.merged_at,
      mergedBy:           pr.merged_by?.login || null,
      aiReviewSummary:    null,
    },
  });
}

function normalizeCommit(commit, repo) {
  return createEngineeringTask({
    id:          commit.sha,
    connector:   'github',
    type:        'pipeline',
    title:       commit.commit?.message?.split('\n')[0] || commit.sha.slice(0, 7),
    description: commit.commit?.message || '',
    status:      'merged',
    author:      commit.author?.login || commit.commit?.author?.name || null,
    url:         commit.html_url,
    repo,
    branch:      null,
    timestamp:   commit.commit?.author?.date || commit.commit?.committer?.date,
    metadata: {
      sha:           commit.sha,
      shortSha:      commit.sha.slice(0, 7),
      authorName:    commit.commit?.author?.name,
      authorEmail:   commit.commit?.author?.email,
      committerDate: commit.commit?.committer?.date,
      additions:     commit.stats?.additions,
      deletions:     commit.stats?.deletions,
      total:         commit.stats?.total,
      filesChanged:  (commit.files || []).map(f => ({
        filename:  f.filename,
        status:    f.status,
        additions: f.additions,
        deletions: f.deletions,
        patch:     f.patch ? f.patch.slice(0, 500) : null,
      })),
      parents:       (commit.parents || []).map(p => p.sha),
      aiSummary:     null,
    },
  });
}

function normalizeDeployment(dep, repo) {
  const riskScore = computeDeploymentRisk(dep);

  return createEngineeringTask({
    id:          String(dep.id),
    connector:   'github',
    type:        'deployment',
    title:       `Deploy ${dep.ref || dep.sha?.slice(0, 7) || 'unknown'} to ${dep.environment || 'unknown'}`,
    description: dep.description || '',
    status:      dep.statuses_url ? dep.task || 'deploy' : 'unknown',
    author:      dep.creator?.login || null,
    url:         dep.url,
    repo,
    branch:      dep.ref || null,
    timestamp:   dep.updated_at || dep.created_at,
    metadata: {
      environment:  dep.environment,
      task:         dep.task,
      sha:          dep.sha,
      ref:          dep.ref,
      payload:      dep.payload,
      riskScore,
      createdAt:    dep.created_at,
    },
  });
}

function normalizeBranch(branch, repo) {
  return createEngineeringTask({
    id:          `${repo}:${branch.name}`,
    connector:   'github',
    type:        'pipeline',
    title:       branch.name,
    description: '',
    status:      'active',
    url:         null,
    repo,
    branch:      branch.name,
    timestamp:   new Date().toISOString(),
    metadata: {
      sha:       branch.commit?.sha,
      protected: branch.protected,
    },
  });
}

// ─── Score helpers ────────────────────────────────────────────────────────────

function computePRReviewStatus(pr) {
  if (pr.draft) return 'draft';
  if (!pr.requested_reviewers?.length && !pr.reviews?.length) return 'pending';
  const approvals = (pr.reviews || []).filter(r => r.state === 'APPROVED').length;
  const changes   = (pr.reviews || []).filter(r => r.state === 'CHANGES_REQUESTED').length;
  if (changes > 0) return 'changes_requested';
  if (approvals > 0) return 'approved';
  return 'pending';
}

function computeMergeReadiness(pr) {
  let score = 50;

  if (pr.draft)    score -= 30;
  if (pr.mergeable === false) score -= 40;

  const approvals = (pr.reviews || []).filter(r => r.state === 'APPROVED').length;
  const changes   = (pr.reviews || []).filter(r => r.state === 'CHANGES_REQUESTED').length;
  score += approvals * 15;
  score -= changes  * 20;

  if (pr.checks_passed) score += 20;

  const ageDays = pr.created_at
    ? (Date.now() - new Date(pr.created_at).getTime()) / 86400000
    : 0;
  if (ageDays > 14) score -= 10;

  return Math.max(0, Math.min(100, score));
}

function computeDeploymentRisk(dep) {
  let risk = 30;

  const env = (dep.environment || '').toLowerCase();
  if (env === 'production' || env === 'prod') risk += 30;
  if (env === 'staging')                       risk += 10;

  const hour = new Date().getHours();
  if (hour < 9 || hour > 18) risk += 15;

  const day = new Date().getDay();
  if (day === 0 || day === 5 || day === 6) risk += 15;

  return Math.max(0, Math.min(100, risk));
}

// ─── Adapter ──────────────────────────────────────────────────────────────────

class GitHubAdapter extends BaseAdapter {
  constructor() {
    super({
      id:               'github',
      name:             'GitHub',
      capability:       Capability.ENGINEERING,
      authStrategy:     AuthStrategy.API_KEY,
      supportedActions: [
        ActionType.READ,
        ActionType.SEARCH,
        ActionType.CREATE,
        ActionType.UPDATE,
        ActionType.APPROVE,
        ActionType.EXECUTE,
        ActionType.SYNC,
      ],
      version: '1.0.0',
    });
  }

  _getToken(workspaceId) {
    const cred = getCredentials(workspaceId, 'github');
    if (cred?.strategy === 'api_key' && cred.apiKey) return cred.apiKey;
    if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN;
    throw new AppError(
      'GitHub credentials not configured. Set GITHUB_TOKEN or authenticate via /api/engineering/auth.',
      503,
      'GITHUB_NOT_CONFIGURED',
    );
  }

  // ── authenticate ────────────────────────────────────────────────────────────

  async authenticate(workspaceId, params) {
    const { token } = params || {};
    if (!token) throw new ValidationError('token is required');

    // Validate by fetching the authenticated user
    const user = await ghFetch('/user', token);
    storeApiKey(workspaceId, 'github', token, { githubLogin: user.login });

    return { authenticated: true, login: user.login, name: user.name };
  }

  // ── healthCheck ─────────────────────────────────────────────────────────────

  async healthCheck(workspaceId) {
    const start = Date.now();
    try {
      const token = this._getToken(workspaceId);
      const user  = await ghFetch('/rate_limit', token);
      return {
        status:    'HEALTHY',
        latencyMs: Date.now() - start,
        detail:    `Rate limit: ${user.rate?.remaining}/${user.rate?.limit} remaining`,
      };
    } catch (err) {
      if (err.code === 'GITHUB_NOT_CONFIGURED') {
        return { status: 'DEGRADED', latencyMs: 0, detail: 'No credentials. Set GITHUB_TOKEN.' };
      }
      return { status: 'DOWN', latencyMs: Date.now() - start, detail: err.message };
    }
  }

  // ── read ────────────────────────────────────────────────────────────────────

  async read(workspaceId, options = {}) {
    const token = this._getToken(workspaceId);
    const { resourceType, owner, repo, sha, number, base, head, id, limit = 30, state = 'open', environment } = options;

    switch (resourceType) {
      case 'repos':         return this._readRepos(token, owner, repo, limit);
      case 'branches':      return this._readBranches(token, owner, repo, base, head, limit);
      case 'commits':       return this._readCommits(token, owner, repo, sha, limit);
      case 'pulls':         return this._readPulls(token, owner, repo, number, state, limit);
      case 'reviews':       return this._readReviews(token, owner, repo, number);
      case 'deployments':   return this._readDeployments(token, owner, repo, id, environment, limit);
      case 'contributors':  return this._readContributors(token, owner, repo, limit);
      default:
        throw new ValidationError(`Unknown resourceType: ${resourceType}. Use repos|branches|commits|pulls|reviews|deployments|contributors`);
    }
  }

  async _readRepos(token, owner, repo, limit) {
    if (repo && owner) {
      const r = await ghFetch(`/repos/${owner}/${repo}`, token);
      return [normalizeRepo(r)];
    }
    const path = owner ? `/users/${owner}/repos?per_page=${limit}` : `/user/repos?per_page=${limit}&sort=updated`;
    const data  = await ghFetch(path, token);
    return data.map(normalizeRepo);
  }

  async _readBranches(token, owner, repo, base, head, limit) {
    if (!owner || !repo) throw new ValidationError('owner and repo are required for branches');

    if (base && head) {
      const cmp = await ghFetch(`/repos/${owner}/${repo}/compare/${base}...${head}`, token);
      return {
        aheadBy:     cmp.ahead_by,
        behindBy:    cmp.behind_by,
        status:      cmp.status,
        totalCommits: cmp.total_commits,
        commits:     cmp.commits.map(c => normalizeCommit(c, `${owner}/${repo}`)),
        permalink:   cmp.permalink_url,
      };
    }

    const data = await ghFetch(`/repos/${owner}/${repo}/branches?per_page=${limit}`, token);
    return data.map(b => normalizeBranch(b, `${owner}/${repo}`));
  }

  async _readCommits(token, owner, repo, sha, limit) {
    if (!owner || !repo) throw new ValidationError('owner and repo are required for commits');

    if (sha && sha.length === 40) {
      const c = await ghFetch(`/repos/${owner}/${repo}/commits/${sha}`, token);
      return [normalizeCommit(c, `${owner}/${repo}`)];
    }

    const qs = sha ? `?sha=${sha}&per_page=${limit}` : `?per_page=${limit}`;
    const data = await ghFetch(`/repos/${owner}/${repo}/commits${qs}`, token);
    return data.map(c => normalizeCommit(c, `${owner}/${repo}`));
  }

  async _readPulls(token, owner, repo, number, state, limit) {
    if (!owner || !repo) throw new ValidationError('owner and repo are required for pulls');

    if (number) {
      const pr      = await ghFetch(`/repos/${owner}/${repo}/pulls/${number}`, token);
      const reviews = await ghFetch(`/repos/${owner}/${repo}/pulls/${number}/reviews`, token).catch(() => []);
      pr.reviews    = reviews;
      const normalized = normalizePR(pr, `${owner}/${repo}`);
      normalized.metadata.aiReviewSummary = this._buildPRSummary(pr, reviews);
      return [normalized];
    }

    const data = await ghFetch(`/repos/${owner}/${repo}/pulls?state=${state}&per_page=${limit}`, token);
    return data.map(pr => normalizePR(pr, `${owner}/${repo}`));
  }

  _buildPRSummary(pr, reviews) {
    const approvals = reviews.filter(r => r.state === 'APPROVED').map(r => r.user?.login).join(', ');
    const changes   = reviews.filter(r => r.state === 'CHANGES_REQUESTED').map(r => r.user?.login).join(', ');
    const lines     = [`PR #${pr.number}: ${pr.title}`];
    if (pr.body) lines.push(pr.body.slice(0, 200));
    if (approvals) lines.push(`Approved by: ${approvals}`);
    if (changes)   lines.push(`Changes requested by: ${changes}`);
    if (pr.mergeable === false) lines.push('⚠ Merge conflicts detected');
    return lines.join('\n');
  }

  async _readReviews(token, owner, repo, number) {
    if (!owner || !repo || !number) throw new ValidationError('owner, repo, and number are required for reviews');

    const [reviews, requestedReviewers] = await Promise.all([
      ghFetch(`/repos/${owner}/${repo}/pulls/${number}/reviews`, token),
      ghFetch(`/repos/${owner}/${repo}/pulls/${number}/requested_reviewers`, token),
    ]);

    const workload = {};
    for (const r of reviews) {
      const login = r.user?.login;
      if (!login) continue;
      if (!workload[login]) workload[login] = { approved: 0, changesRequested: 0, commented: 0 };
      if (r.state === 'APPROVED')            workload[login].approved++;
      if (r.state === 'CHANGES_REQUESTED')   workload[login].changesRequested++;
      if (r.state === 'COMMENTED')           workload[login].commented++;
    }

    return {
      reviews: reviews.map(r => ({
        id:          r.id,
        reviewer:    r.user?.login,
        state:       r.state,
        body:        r.body?.slice(0, 300) || '',
        submittedAt: r.submitted_at,
      })),
      requestedReviewers: (requestedReviewers.users || []).map(u => u.login),
      reviewerWorkload:   Object.entries(workload).map(([login, stats]) => ({ login, ...stats })),
      suggestedReviewers: this._suggestReviewers(reviews, requestedReviewers),
    };
  }

  _suggestReviewers(reviews, requested) {
    const seen = new Set((requested.users || []).map(u => u.login));
    const active = reviews
      .filter(r => r.user?.login && !seen.has(r.user.login))
      .map(r => r.user.login);
    return [...new Set(active)].slice(0, 3);
  }

  async _readDeployments(token, owner, repo, id, environment, limit) {
    if (!owner || !repo) throw new ValidationError('owner and repo are required for deployments');

    if (id) {
      const dep = await ghFetch(`/repos/${owner}/${repo}/deployments/${id}`, token);
      const statuses = await ghFetch(`/repos/${owner}/${repo}/deployments/${id}/statuses`, token).catch(() => []);
      dep.latestStatus = statuses[0] || null;
      return [normalizeDeployment(dep, `${owner}/${repo}`)];
    }

    const qs   = environment ? `?environment=${encodeURIComponent(environment)}&per_page=${limit}` : `?per_page=${limit}`;
    const data = await ghFetch(`/repos/${owner}/${repo}/deployments${qs}`, token);

    const enriched = await Promise.all(data.map(async dep => {
      try {
        const statuses = await ghFetch(`${dep.statuses_url}`, token);
        dep.latestStatus = statuses[0] || null;
      } catch { dep.latestStatus = null; }
      return dep;
    }));

    return enriched.map(d => normalizeDeployment(d, `${owner}/${repo}`));
  }

  async _readContributors(token, owner, repo, limit) {
    if (!owner || !repo) throw new ValidationError('owner and repo are required for contributors');
    const data = await ghFetch(`/repos/${owner}/${repo}/contributors?per_page=${limit}`, token);
    return data.map(c => ({
      login:         c.login,
      avatarUrl:     c.avatar_url,
      contributions: c.contributions,
      url:           c.html_url,
    }));
  }

  // ── create ──────────────────────────────────────────────────────────────────

  async create(workspaceId, payload = {}) {
    const token = this._getToken(workspaceId);
    const { resourceType, owner, repo } = payload;

    if (!owner || !repo) throw new ValidationError('owner and repo are required');

    if (resourceType === 'branch') {
      const { branchName, fromSha, fromBranch } = payload;
      if (!branchName) throw new ValidationError('branchName is required');

      let sha = fromSha;
      if (!sha && fromBranch) {
        const ref = await ghFetch(`/repos/${owner}/${repo}/git/ref/heads/${fromBranch}`, token);
        sha = ref.object?.sha;
      }
      if (!sha) throw new ValidationError('fromSha or fromBranch is required to create a branch');

      await ghFetch(`/repos/${owner}/${repo}/git/refs`, token, {
        method: 'POST',
        body: JSON.stringify({ ref: `refs/heads/${branchName}`, sha }),
        headers: buildHeaders(token),
      });

      return normalizeBranch({ name: branchName, commit: { sha }, protected: false }, `${owner}/${repo}`);
    }

    if (resourceType === 'pull') {
      const { title, body, head, base, draft = false } = payload;
      if (!title || !head || !base) throw new ValidationError('title, head, and base are required');

      const pr = await ghFetch(`/repos/${owner}/${repo}/pulls`, token, {
        method: 'POST',
        body: JSON.stringify({ title, body, head, base, draft }),
        headers: buildHeaders(token),
      });
      return normalizePR(pr, `${owner}/${repo}`);
    }

    throw new ValidationError(`Cannot create resourceType: ${resourceType}. Use branch|pull`);
  }

  // ── update ──────────────────────────────────────────────────────────────────

  async update(workspaceId, id, patch = {}) {
    const token = this._getToken(workspaceId);
    const { owner, repo, number } = patch;

    if (!owner || !repo || !number) throw new ValidationError('owner, repo, and number are required');

    const allowed = {};
    if (patch.title !== undefined) allowed.title = patch.title;
    if (patch.body  !== undefined) allowed.body  = patch.body;
    if (patch.state !== undefined) allowed.state = patch.state;
    if (patch.base  !== undefined) allowed.base  = patch.base;

    const pr = await ghFetch(`/repos/${owner}/${repo}/pulls/${number}`, token, {
      method: 'PATCH',
      body:   JSON.stringify(allowed),
      headers: buildHeaders(token),
    });
    return normalizePR(pr, `${owner}/${repo}`);
  }

  // ── approve (PR review) ─────────────────────────────────────────────────────

  async execute(workspaceId, actionType, payload = {}) {
    const token = this._getToken(workspaceId);
    const { owner, repo, number, event: reviewEvent = 'APPROVE', body = '' } = payload;

    if (!owner || !repo || !number) throw new ValidationError('owner, repo, and number are required');

    if (actionType === ActionType.APPROVE) {
      const review = await ghFetch(`/repos/${owner}/${repo}/pulls/${number}/reviews`, token, {
        method: 'POST',
        body:   JSON.stringify({ event: reviewEvent, body }),
        headers: buildHeaders(token),
      });
      return { reviewId: review.id, state: review.state, reviewer: review.user?.login };
    }

    if (actionType === ActionType.EXECUTE) {
      const { mergeMethod = 'squash', commitTitle, commitMessage } = payload;
      const mergeBody = { merge_method: mergeMethod };
      if (commitTitle)   mergeBody.commit_title   = commitTitle;
      if (commitMessage) mergeBody.commit_message = commitMessage;

      const result = await ghFetch(`/repos/${owner}/${repo}/pulls/${number}/merge`, token, {
        method: 'PUT',
        body:   JSON.stringify(mergeBody),
        headers: buildHeaders(token),
      });
      return { merged: result.merged, sha: result.sha, message: result.message };
    }

    throw new ValidationError(`Unsupported execute actionType: ${actionType}`);
  }

  // ── search ──────────────────────────────────────────────────────────────────

  async search(workspaceId, query, options = {}) {
    const token = this._getToken(workspaceId);
    const { type = 'code', limit = 10 } = options;

    const qualifiers = options.repo ? `+repo:${options.repo}` : '';
    const q = encodeURIComponent(`${query}${qualifiers}`);

    const endpoints = {
      code:         `/search/code?q=${q}&per_page=${limit}`,
      repositories: `/search/repositories?q=${q}&per_page=${limit}`,
      commits:      `/search/commits?q=${q}&per_page=${limit}`,
      issues:       `/search/issues?q=${q}+is:open+is:pr&per_page=${limit}`,
    };

    const path = endpoints[type] || endpoints.repositories;
    const data = await ghFetch(path, token);

    return (data.items || []).map(item => createSearchResult({
      id:        String(item.id || item.sha || item.number),
      connector: 'github',
      title:     item.name || item.full_name || item.title || item.path || '',
      excerpt:   item.description || item.body?.slice(0, 200) || item.message?.slice(0, 200) || '',
      url:       item.html_url || item.url,
      score:     item.score || 1,
      timestamp: item.updated_at || item.committed_date || item.created_at || null,
      metadata:  { type, raw: item },
    }));
  }

  // ── sync ────────────────────────────────────────────────────────────────────

  async sync(workspaceId, options = {}) {
    const token = this._getToken(workspaceId);
    const { owner, repo, limit = 20 } = options;

    if (!owner || !repo) throw new ValidationError('owner and repo are required for sync');

    // Integration Permissions: a repository the workspace has not authorized is
    // never read, no matter which route asked for it.
    const { isResourceIdAllowed } = await import('../../core/governance/integrationPermissions/index.js');
    const verdict = await isResourceIdAllowed(workspaceId, 'github', 'repository', `${owner}/${repo}`);
    if (!verdict.allowed) {
      throw new AppError(
        `Repository ${owner}/${repo} is not authorized for this workspace. ` +
        'Allow it in Settings → Integration Permissions.',
        403,
        'RESOURCE_NOT_PERMITTED',
      );
    }

    const { ingestionQueue } = await import('../../config/queue.js');

    let synced = 0;
    let errors = 0;

    // Sync open PRs
    try {
      const prs = await this._readPulls(token, owner, repo, null, 'open', Math.min(limit, 10));
      for (const pr of prs) {
        const text = [
          `Pull Request: ${pr.title}`,
          `Repository: ${pr.repo}`,
          `Branch: ${pr.metadata?.headBranch} → ${pr.metadata?.baseBranch}`,
          `Author: ${pr.author}`,
          `Status: ${pr.status}`,
          `Merge Readiness: ${pr.metadata?.mergeReadinessScore}/100`,
          pr.description ? `Description: ${pr.description.slice(0, 500)}` : '',
        ].filter(Boolean).join('\n');

        await ingestionQueue.add('new-intel', {
          workspaceId,
          platform: 'github',
          channelId: `pr-${pr.metadata?.number}`,
          text,
          sender: pr.author || 'github',
        });

        // Knowledge Graph: PR author as engineer entity
        if (pr.author) {
          const engineerId = `user:github:${pr.author}`;
          registerEntity(engineerId, 'user', pr.author);
          const prId = `pr:${pr.repo}:${pr.metadata?.number}`;
          registerEntity(prId, 'resource', pr.title);
          linkEntities(prId, engineerId, 'authored_by');
        }

        synced++;
      }
    } catch { errors++; }

    // Sync recent commits
    try {
      const commits = await this._readCommits(token, owner, repo, null, Math.min(limit, 10));
      for (const commit of commits) {
        const text = [
          `Commit: ${commit.title}`,
          `Repository: ${commit.repo}`,
          `Author: ${commit.author}`,
          commit.metadata?.filesChanged?.length
            ? `Files changed: ${commit.metadata.filesChanged.map(f => f.filename).join(', ')}`
            : '',
          `+${commit.metadata?.additions || 0} -${commit.metadata?.deletions || 0}`,
        ].filter(Boolean).join('\n');

        await ingestionQueue.add('new-intel', {
          workspaceId,
          platform: 'github',
          channelId: `commits`,
          text,
          sender: commit.author || 'github',
        });

        if (commit.author) {
          registerEntity(`user:github:${commit.author}`, 'user', commit.author);
        }

        synced++;
      }
    } catch { errors++; }

    return { synced, errors };
  }
}

export default new GitHubAdapter();
