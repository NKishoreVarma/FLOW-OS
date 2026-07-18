/**
 * JiraSyncAdapter — incremental sync for Jira resource types.
 *
 * Resource types:  projects | issues | comments
 * Auth:            OAuth 3LO or API token via JiraOAuthService.getJiraConfig()
 * Cursor format:
 *   projects:  ISO timestamp (re-list weekly — projects rarely change)
 *   issues:    ISO timestamp — JQL: `updated >= "cursor-date" ORDER BY updated ASC`
 *   comments:  ISO timestamp — checks comments on updated issues
 * ETag:            issue.updated or comment.updated
 */

import { getJiraConfig } from '../../integrations/JiraOAuthService.js';

const MAX_RESULTS = 50;

async function _jiraFetch(config, path, { method = 'GET', body } = {}) {
  const url = `${config.baseUrl}${path}`;
  const opts = {
    method,
    headers: { Authorization: config.authHeader, Accept: 'application/json', 'Content-Type': 'application/json' },
  };
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(url, opts);
  if (res.status === 401) throw new Error('JIRA_UNAUTHORIZED');
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Jira ${path} ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

// ── Projects ──────────────────────────────────────────────────────────────────

async function syncProjects(workspaceId, cursor) {
  const config = await getJiraConfig(workspaceId);
  if (!config) throw new Error('Jira not connected');

  const data  = await _jiraFetch(config, '/rest/api/3/project/search?orderBy=key&maxResults=50&expand=description,lead');
  const since = cursor ? new Date(cursor) : null;

  const items = (data.values || []).map(proj => ({
    externalId: proj.id,
    etag:       proj.id + ':' + (proj.avatarUrls?.['16x16'] || ''),
    platform:   'jira',
    sender:     proj.lead?.displayName || 'jira',
    channel:    'projects',
    text:       `[Jira Project] ${proj.key}: ${proj.name}${proj.description ? ' — ' + proj.description.slice(0, 200) : ''} (${proj.projectTypeKey})`,
    metadata:   {
      projectId:   proj.id,
      key:         proj.key,
      name:        proj.name,
      type:        proj.projectTypeKey,
      lead:        proj.lead?.displayName,
      url:         `${config.baseUrl.replace('/rest/api/3', '')}/browse/${proj.key}`,
    },
  }));

  return { items, newCursor: new Date().toISOString() };
}

// ── Issues (JQL incremental) ──────────────────────────────────────────────────

async function syncIssues(workspaceId, cursor) {
  const config = await getJiraConfig(workspaceId);
  if (!config) throw new Error('Jira not connected');

  const since = cursor
    ? new Date(cursor).toISOString().split('T')[0]
    : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  const jql  = `updated >= "${since}" ORDER BY updated ASC`;
  const items = [];
  let startAt = 0;
  let total   = Infinity;

  while (startAt < total && items.length < 500) {
    const data = await _jiraFetch(config, '/rest/api/3/search', {
      method: 'POST',
      body: {
        jql,
        startAt,
        maxResults: MAX_RESULTS,
        fields: ['summary', 'status', 'assignee', 'reporter', 'priority', 'updated',
                 'created', 'description', 'labels', 'issuetype', 'project', 'comment'],
      },
    });

    total = data.total || 0;

    for (const issue of data.issues || []) {
      const desc = issue.fields.description
        ? _extractAdfText(issue.fields.description)
        : '';

      items.push({
        externalId: issue.id,
        etag:       issue.fields.updated,
        platform:   'jira',
        sender:     issue.fields.assignee?.displayName || issue.fields.reporter?.displayName || 'jira',
        channel:    `issues:${issue.fields.project?.key || 'unknown'}`,
        text:       [
          `[Jira ${issue.key}] ${issue.fields.summary}`,
          `Status: ${issue.fields.status?.name} | Priority: ${issue.fields.priority?.name || 'None'}`,
          `Assignee: ${issue.fields.assignee?.displayName || 'Unassigned'}`,
          desc ? desc.slice(0, 400) : '',
        ].filter(Boolean).join('\n'),
        metadata:   {
          issueId:   issue.id,
          key:       issue.key,
          summary:   issue.fields.summary,
          status:    issue.fields.status?.name,
          priority:  issue.fields.priority?.name,
          assignee:  issue.fields.assignee?.displayName,
          reporter:  issue.fields.reporter?.displayName,
          labels:    issue.fields.labels,
          type:      issue.fields.issuetype?.name,
          project:   issue.fields.project?.key,
          updated:   issue.fields.updated,
          created:   issue.fields.created,
          url:       `${config.baseUrl.replace('/rest/api/3', '')}/browse/${issue.key}`,
        },
      });
    }

    startAt += data.issues?.length || MAX_RESULTS;
    if (!data.issues?.length) break;
  }

  return { items, newCursor: new Date().toISOString() };
}

// ── Comments (on recently updated issues) ─────────────────────────────────────

async function syncComments(workspaceId, cursor) {
  const config = await getJiraConfig(workspaceId);
  if (!config) throw new Error('Jira not connected');

  const since  = cursor
    ? new Date(cursor).toISOString().split('T')[0]
    : new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  const jql  = `updated >= "${since}" ORDER BY updated DESC`;
  const items = [];

  // Get recently updated issues to check their comments
  const search = await _jiraFetch(config, '/rest/api/3/search', {
    method: 'POST',
    body: { jql, maxResults: 20, fields: ['summary', 'project', 'comment', 'updated'] },
  });

  for (const issue of search.issues || []) {
    const comments = issue.fields.comment?.comments || [];
    const recentComments = comments.filter(c =>
      cursor ? new Date(c.updated) > new Date(cursor) : true
    );

    for (const comment of recentComments) {
      const body = _extractAdfText(comment.body);
      items.push({
        externalId: comment.id,
        etag:       comment.updated,
        platform:   'jira',
        sender:     comment.author?.displayName || 'jira',
        channel:    `comments:${issue.fields.project?.key || 'unknown'}`,
        text:       `[Jira Comment on ${issue.key}] ${body.slice(0, 600)}`,
        metadata:   {
          commentId:   comment.id,
          issueKey:    issue.key,
          issueSummary: issue.fields.summary,
          project:     issue.fields.project?.key,
          author:      comment.author?.displayName,
          created:     comment.created,
          updated:     comment.updated,
          url:         `${config.baseUrl.replace('/rest/api/3', '')}/browse/${issue.key}?focusedCommentId=${comment.id}`,
        },
      });
    }
  }

  return { items, newCursor: new Date().toISOString() };
}

// ── Atlassian Document Format (ADF) → plain text ─────────────────────────────

function _extractAdfText(node) {
  if (!node) return '';
  if (typeof node === 'string') return node;
  if (node.type === 'text') return node.text || '';
  if (Array.isArray(node.content)) {
    return node.content.map(_extractAdfText).filter(Boolean).join(' ');
  }
  return '';
}

// ── Public API ────────────────────────────────────────────────────────────────

export const RESOURCE_TYPES = ['projects', 'issues', 'comments'];

export async function sync(workspaceId, resourceType, cursor, opts = {}) {
  // Webhook-triggered narrow sync: re-fetch just the affected issue
  if (opts.webhookPayload?.issue) {
    return _syncWebhookIssue(workspaceId, opts.webhookPayload, await getJiraConfig(workspaceId));
  }

  switch (resourceType) {
    case 'projects': return syncProjects(workspaceId, cursor);
    case 'issues':   return syncIssues(workspaceId, cursor);
    case 'comments': return syncComments(workspaceId, cursor);
    default:
      throw new Error(`JiraSyncAdapter: unknown resourceType "${resourceType}"`);
  }
}

async function _syncWebhookIssue(workspaceId, payload, config) {
  if (!config) return { items: [], newCursor: new Date().toISOString() };
  const issue = payload.issue;
  const desc  = issue.fields?.description ? _extractAdfText(issue.fields.description) : '';

  return {
    items: [{
      externalId: issue.id,
      etag:       issue.fields?.updated || new Date().toISOString(),
      platform:   'jira',
      sender:     issue.fields?.assignee?.displayName || 'jira',
      channel:    `issues:${issue.fields?.project?.key || 'unknown'}`,
      text:       `[Jira ${issue.key}] ${issue.fields?.summary} (${issue.fields?.status?.name}) ${desc.slice(0, 400)}`,
      metadata:   {
        issueId:  issue.id,
        key:      issue.key,
        summary:  issue.fields?.summary,
        status:   issue.fields?.status?.name,
        action:   payload.webhookEvent,
        url:      `${config.baseUrl.replace('/rest/api/3', '')}/browse/${issue.key}`,
      },
    }],
    newCursor: new Date().toISOString(),
  };
}
