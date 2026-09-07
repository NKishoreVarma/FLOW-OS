/**
 * GitHubSyncAdapter — incremental sync for all GitHub resource types.
 *
 * Resource types:  repositories | pull_requests | issues | commits | releases
 * Auth:            PAT or OAuth App token via GitHubOAuthService.getAccessToken()
 * Cursor format:   ISO-8601 timestamp (updated_at > cursor)
 * ETag:            SHA or updated_at string (prevents re-ingesting unchanged items)
 *
 * All pages are fetched internally; the adapter returns the full batch for
 * one sync window so SyncEngine can dedup and ingest in one pass.
 */

import { getAccessToken } from '../../integrations/GitHubOAuthService.js';

const GITHUB_API = process.env.GITHUB_API_URL || 'https://api.github.com';
const PER_PAGE   = 50;

// ── Auth helper ───────────────────────────────────────────────────────────────

async function _headers(workspaceId) {
  const token = await getAccessToken(workspaceId);
  if (!token) throw new Error('GitHub not connected for this workspace');
  return {
    Authorization:          `Bearer ${token}`,
    Accept:                 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent':           'FLOW-OS/10.2',
  };
}

async function _get(url, headers) {
  const res = await fetch(url, { headers });
  if (res.status === 304) return null;                      // ETag-based unchanged
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`GitHub ${res.status}: ${url} — ${body.slice(0, 200)}`);
  }
  return res.json();
}

// ── Paginated fetch following Link: next headers ──────────────────────────────

async function _paginate(startUrl, headers, { maxPages = 5, sinceDate = null } = {}) {
  const items  = [];
  let url      = startUrl;
  let page     = 0;

  while (url && page < maxPages) {
    const res = await fetch(url, { headers });
    if (!res.ok) break;
    const data = await res.json();
    const batch = Array.isArray(data) ? data : (data.items || []);

    for (const item of batch) {
      if (sinceDate && item.updated_at && new Date(item.updated_at) <= new Date(sinceDate)) {
        return items; // sorted by updated DESC — stop when we hit items older than cursor
      }
      items.push(item);
    }

    // GitHub Link header: <url>; rel="next"
    const link = res.headers.get('Link') || '';
    const next = link.match(/<([^>]+)>;\s*rel="next"/)?.[1];
    url  = next || null;
    page++;
  }

  return items;
}

// ── Repo list (top-50 by last push, refreshed every sync) ────────────────────

async function _listRepos(headers) {
  const data = await _paginate(
    `${GITHUB_API}/user/repos?sort=pushed&direction=desc&per_page=${PER_PAGE}`,
    headers,
    { maxPages: 2 },
  );
  return data;
}

// ── Resource sync functions ───────────────────────────────────────────────────

async function syncRepositories(workspaceId, cursor, headers) {
  const repos = await _listRepos(headers);
  const since = cursor ? new Date(cursor) : null;

  const filtered = since
    ? repos.filter(r => new Date(r.pushed_at || r.updated_at) > since)
    : repos;

  return filtered.map(r => ({
    externalId: String(r.id),
    etag:       r.pushed_at || r.updated_at,
    platform:   'github',
    sender:     r.owner?.login || 'github',
    channel:    `repos:${r.full_name}`,
    text:       `[GitHub Repo] ${r.full_name}: ${r.description || 'No description'} (${r.language || 'unknown language'}, ${r.open_issues_count} open issues, ${r.stargazers_count} stars)`,
    metadata:   {
      repoId:      r.id,
      fullName:    r.full_name,
      private:     r.private,
      language:    r.language,
      stars:       r.stargazers_count,
      forks:       r.forks_count,
      openIssues:  r.open_issues_count,
      defaultBranch: r.default_branch,
      url:         r.html_url,
      pushedAt:    r.pushed_at,
    },
  }));
}

async function syncPullRequests(workspaceId, cursor, headers) {
  const repos = await _listRepos(headers);
  const since = cursor || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const items = [];

  for (const repo of repos.slice(0, 10)) {
    try {
      const prs = await _paginate(
        `${GITHUB_API}/repos/${repo.full_name}/pulls?state=all&sort=updated&direction=desc&per_page=${PER_PAGE}`,
        headers,
        { maxPages: 3, sinceDate: since },
      );
      for (const pr of prs) {
        const reviewState = pr.draft ? 'draft' : (pr.merged_at ? 'merged' : pr.state);
        items.push({
          externalId: String(pr.id),
          etag:       pr.updated_at,
          platform:   'github',
          sender:     pr.user?.login || 'github',
          channel:    `pulls:${repo.full_name}`,
          text:       `[PR #${pr.number}] ${pr.title} — ${repo.full_name} (${reviewState})${pr.body ? ': ' + pr.body.slice(0, 300) : ''}`,
          metadata:   {
            prNumber:    pr.number,
            repo:        repo.full_name,
            state:       reviewState,
            draft:       pr.draft,
            merged:      !!pr.merged_at,
            author:      pr.user?.login,
            url:         pr.html_url,
            labels:      pr.labels?.map(l => l.name),
            updatedAt:   pr.updated_at,
          },
        });
      }
    } catch { /* skip repos we can't access */ }
  }
  return items;
}

async function syncIssues(workspaceId, cursor, headers) {
  const repos = await _listRepos(headers);
  const since = cursor || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const items = [];

  for (const repo of repos.slice(0, 10)) {
    try {
      const issues = await _paginate(
        `${GITHUB_API}/repos/${repo.full_name}/issues?state=all&sort=updated&direction=desc&since=${since}&per_page=${PER_PAGE}`,
        headers,
        { maxPages: 3 },
      );
      for (const issue of issues.filter(i => !i.pull_request)) { // exclude PRs
        items.push({
          externalId: String(issue.id),
          etag:       issue.updated_at,
          platform:   'github',
          sender:     issue.user?.login || 'github',
          channel:    `issues:${repo.full_name}`,
          text:       `[Issue #${issue.number}] ${issue.title} — ${repo.full_name} (${issue.state})${issue.body ? ': ' + issue.body.slice(0, 300) : ''}`,
          metadata:   {
            issueNumber: issue.number,
            repo:        repo.full_name,
            state:       issue.state,
            author:      issue.user?.login,
            assignee:    issue.assignee?.login,
            labels:      issue.labels?.map(l => l.name),
            url:         issue.html_url,
            updatedAt:   issue.updated_at,
          },
        });
      }
    } catch { /* skip */ }
  }
  return items;
}

async function syncCommits(workspaceId, cursor, headers) {
  const repos = await _listRepos(headers);
  const since = cursor || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const items = [];

  for (const repo of repos.slice(0, 10)) {
    try {
      const commits = await _paginate(
        `${GITHUB_API}/repos/${repo.full_name}/commits?since=${since}&per_page=${PER_PAGE}`,
        headers,
        { maxPages: 2 },
      );
      for (const commit of commits) {
        const msg = commit.commit?.message || '';
        items.push({
          externalId: commit.sha,
          etag:       commit.sha,           // SHA is immutable
          platform:   'github',
          sender:     commit.commit?.author?.name || commit.author?.login || 'github',
          channel:    `commits:${repo.full_name}`,
          text:       `[Commit] ${repo.full_name} — ${msg.split('\n')[0]}${msg.includes('\n') ? '\n' + msg.split('\n').slice(1).join('\n').slice(0, 200) : ''}`,
          metadata:   {
            sha:         commit.sha,
            shortSha:    commit.sha.slice(0, 7),
            repo:        repo.full_name,
            author:      commit.commit?.author?.name,
            email:       commit.commit?.author?.email,
            authoredAt:  commit.commit?.author?.date,
            url:         commit.html_url,
          },
        });
      }
    } catch { /* skip */ }
  }
  return items;
}

async function syncReleases(workspaceId, cursor, headers) {
  const repos = await _listRepos(headers);
  const since = cursor ? new Date(cursor) : null;
  const items = [];

  for (const repo of repos.slice(0, 10)) {
    try {
      const releases = await _paginate(
        `${GITHUB_API}/repos/${repo.full_name}/releases?per_page=20`,
        headers,
        { maxPages: 1 },
      );
      for (const release of releases) {
        if (since && new Date(release.published_at) <= since) continue;
        items.push({
          externalId: String(release.id),
          etag:       release.published_at,
          platform:   'github',
          sender:     release.author?.login || 'github',
          channel:    `releases:${repo.full_name}`,
          text:       `[Release] ${repo.full_name} ${release.tag_name}: ${release.name || release.tag_name}${release.body ? '\n' + release.body.slice(0, 400) : ''}`,
          metadata:   {
            releaseId:    release.id,
            tagName:      release.tag_name,
            releaseName:  release.name,
            repo:         repo.full_name,
            prerelease:   release.prerelease,
            draft:        release.draft,
            url:          release.html_url,
            publishedAt:  release.published_at,
          },
        });
      }
    } catch { /* skip */ }
  }
  return items;
}

// ── Public API ────────────────────────────────────────────────────────────────

export const RESOURCE_TYPES = ['repositories', 'pull_requests', 'issues', 'commits', 'releases'];

/**
 * Run a sync for the given resource type.
 *
 * @param {string} workspaceId
 * @param {string} resourceType  — one of RESOURCE_TYPES
 * @param {string|null} cursor   — last sync cursor (ISO timestamp or null for initial sync)
 * @param {object} opts          — { webhookPayload? } for webhook-triggered narrow syncs
 * @returns {Promise<{ items: object[], newCursor: string }>}
 */
export async function sync(workspaceId, resourceType, cursor, opts = {}) {
  const headers = await _headers(workspaceId);

  // Webhook-triggered: narrow sync for a single item if payload provides identity
  if (opts.webhookPayload) {
    return _handleWebhookPayload(workspaceId, resourceType, opts.webhookPayload, headers);
  }

  let items;
  switch (resourceType) {
    case 'repositories': items = await syncRepositories(workspaceId, cursor, headers); break;
    case 'pull_requests': items = await syncPullRequests(workspaceId, cursor, headers); break;
    case 'issues':        items = await syncIssues(workspaceId, cursor, headers); break;
    case 'commits':       items = await syncCommits(workspaceId, cursor, headers); break;
    case 'releases':      items = await syncReleases(workspaceId, cursor, headers); break;
    default:
      throw new Error(`GitHubSyncAdapter: unknown resourceType "${resourceType}"`);
  }

  return { items, newCursor: new Date().toISOString() };
}

async function _handleWebhookPayload(workspaceId, resourceType, payload, headers) {
  const items = [];

  if (resourceType === 'pull_requests' && payload.pull_request) {
    const pr   = payload.pull_request;
    const repo = payload.repository?.full_name || 'unknown';
    items.push({
      externalId: String(pr.id),
      etag:       pr.updated_at,
      platform:   'github',
      sender:     pr.user?.login || 'github',
      channel:    `pulls:${repo}`,
      text:       `[PR #${pr.number}] ${pr.title} — ${repo} (${pr.state})`,
      metadata:   { prNumber: pr.number, repo, action: payload.action, url: pr.html_url },
    });
  } else if (resourceType === 'issues' && payload.issue) {
    const issue = payload.issue;
    const repo  = payload.repository?.full_name || 'unknown';
    items.push({
      externalId: String(issue.id),
      etag:       issue.updated_at,
      platform:   'github',
      sender:     issue.user?.login || 'github',
      channel:    `issues:${repo}`,
      text:       `[Issue #${issue.number}] ${issue.title} — ${repo} (${issue.state})`,
      metadata:   { issueNumber: issue.number, repo, action: payload.action, url: issue.html_url },
    });
  } else if (resourceType === 'commits' && payload.commits) {
    const repo = payload.repository?.full_name || 'unknown';
    for (const commit of payload.commits) {
      items.push({
        externalId: commit.id,
        etag:       commit.id,
        platform:   'github',
        sender:     commit.author?.name || 'github',
        channel:    `commits:${repo}`,
        text:       `[Commit] ${repo} — ${(commit.message || '').split('\n')[0]}`,
        metadata:   { sha: commit.id, repo, url: commit.url },
      });
    }
  }

  return { items, newCursor: new Date().toISOString() };
}
