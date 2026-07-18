/**
 * EventNormalizer — transforms raw connector payloads into FLOW native events.
 *
 * FLOW native event shape:
 * {
 *   eventId:        string  — FLOW-generated UUID
 *   deliveryId:     string  — provider's idempotency key
 *   connectorId:    string  — 'github' | 'slack' | 'jira' | 'google' | 'notion'
 *   workspaceId:    string
 *   eventType:      string  — FLOW canonical type (pr.opened, message.posted, etc.)
 *   resourceType:   string  — aligns with sync resource types
 *   resourceId:     string  — provider's stable resource ID
 *   action:         string  — provider action verb (opened, closed, merged, etc.)
 *   actor: { id, name, email }
 *   summary:        string  — one-line human-readable summary
 *   urgency:        'high' | 'medium' | 'low'
 *   metadata:       object  — provider-specific extra fields
 *   receivedAt:     ISO
 * }
 *
 * Canonical event type taxonomy:
 *   pr.opened | pr.updated | pr.merged | pr.closed | pr.reviewed | pr.review_requested
 *   issue.opened | issue.updated | issue.closed | issue.assigned | issue.status_changed
 *   commit.pushed | deployment.created | deployment.succeeded | deployment.failed
 *   ci.started | ci.completed | ci.failed | release.published
 *   message.posted | thread.replied | reaction.added | channel.created
 *   calendar.event_created | calendar.event_updated | calendar.invite_received
 *   gmail.message_received | gmail.thread_updated
 *   page.created | page.updated | database.updated
 *   comment.added | sprint.started | sprint.completed
 */

import crypto from 'crypto';

// ── Urgency scoring ────────────────────────────────────────────────────────────

const HIGH_URGENCY_TYPES = new Set([
  'deployment.failed', 'ci.failed', 'release.published',
  'pr.merged', 'issue.opened', 'issue.assigned',
  'calendar.invite_received',
]);

const MEDIUM_URGENCY_TYPES = new Set([
  'pr.opened', 'pr.updated', 'pr.reviewed', 'pr.review_requested',
  'issue.updated', 'issue.status_changed',
  'deployment.created', 'deployment.succeeded', 'ci.started', 'ci.completed',
  'message.posted', 'thread.replied',
  'calendar.event_created', 'calendar.event_updated',
  'comment.added', 'sprint.started', 'sprint.completed',
]);

function _urgency(eventType, metadata = {}) {
  if (HIGH_URGENCY_TYPES.has(eventType)) return 'high';
  if (MEDIUM_URGENCY_TYPES.has(eventType)) return 'medium';
  // Escalate based on priority/labels
  const priority = metadata.priority?.toLowerCase?.() || '';
  if (['p0', 'p1', 'critical', 'blocker', 'high'].includes(priority)) return 'high';
  if (['p2', 'medium', 'major'].includes(priority)) return 'medium';
  return 'low';
}

// ── GitHub ────────────────────────────────────────────────────────────────────

function normalizeGitHub(rawEventType, payload) {
  const action = payload.action || '';
  const repo   = payload.repository?.full_name || 'unknown/repo';

  switch (rawEventType) {
    case 'pull_request': {
      const pr = payload.pull_request || {};
      const eventType = pr.merged
        ? 'pr.merged'
        : action === 'opened'
          ? 'pr.opened'
          : action === 'closed'
            ? 'pr.closed'
            : 'pr.updated';
      return {
        eventType,
        resourceType: 'pull_request',
        resourceId:   String(pr.id || pr.number),
        action,
        actor:        { id: pr.user?.login, name: pr.user?.login, email: null },
        summary:      `PR #${pr.number} ${action}: "${pr.title}" — ${repo}`,
        metadata:     { prNumber: pr.number, repo, draft: pr.draft, base: pr.base?.ref, head: pr.head?.ref },
      };
    }
    case 'pull_request_review': {
      const pr  = payload.pull_request || {};
      const rev = payload.review || {};
      return {
        eventType:    'pr.reviewed',
        resourceType: 'pull_request',
        resourceId:   String(pr.id || pr.number),
        action:       rev.state,
        actor:        { id: rev.user?.login, name: rev.user?.login, email: null },
        summary:      `${rev.user?.login} ${rev.state} PR #${pr.number} — ${repo}`,
        metadata:     { prNumber: pr.number, repo, reviewState: rev.state },
      };
    }
    case 'issues': {
      const issue = payload.issue || {};
      const eventType = action === 'opened'
        ? 'issue.opened'
        : action === 'closed'
          ? 'issue.closed'
          : action === 'assigned'
            ? 'issue.assigned'
            : 'issue.updated';
      return {
        eventType,
        resourceType: 'issue',
        resourceId:   String(issue.id || issue.number),
        action,
        actor:        { id: issue.user?.login, name: issue.user?.login, email: null },
        summary:      `Issue #${issue.number} ${action}: "${issue.title}" — ${repo}`,
        metadata:     { issueNumber: issue.number, repo, labels: issue.labels?.map(l => l.name), priority: issue.labels?.find(l => /p[0-3]|critical|blocker/i.test(l.name))?.name },
      };
    }
    case 'push': {
      const commits = payload.commits || [];
      const pusher  = payload.pusher || {};
      return {
        eventType:    'commit.pushed',
        resourceType: 'commits',
        resourceId:   payload.after || crypto.randomUUID(),
        action:       'pushed',
        actor:        { id: pusher.name, name: pusher.name, email: pusher.email },
        summary:      `${pusher.name} pushed ${commits.length} commit(s) to ${payload.ref} — ${repo}`,
        metadata:     { repo, ref: payload.ref, commitCount: commits.length, head: payload.after },
      };
    }
    case 'deployment': {
      const dep = payload.deployment || {};
      return {
        eventType:    'deployment.created',
        resourceType: 'deployment',
        resourceId:   String(dep.id),
        action:       'created',
        actor:        { id: dep.creator?.login, name: dep.creator?.login, email: null },
        summary:      `Deployment to ${dep.environment} triggered — ${repo}`,
        metadata:     { repo, environment: dep.environment, sha: dep.sha, task: dep.task },
      };
    }
    case 'deployment_status': {
      const dep    = payload.deployment || {};
      const status = payload.deployment_status || {};
      const state  = status.state;
      const eventType = state === 'success' ? 'deployment.succeeded' : state === 'failure' ? 'deployment.failed' : 'deployment.created';
      return {
        eventType,
        resourceType: 'deployment',
        resourceId:   String(dep.id),
        action:       state,
        actor:        { id: status.creator?.login, name: status.creator?.login, email: null },
        summary:      `Deployment ${state}: ${dep.environment} — ${repo}`,
        metadata:     { repo, environment: dep.environment, state, description: status.description },
      };
    }
    case 'workflow_run': {
      const wf     = payload.workflow_run || {};
      const state  = wf.conclusion || wf.status;
      const eventType = wf.status === 'in_progress' ? 'ci.started' : wf.conclusion === 'failure' ? 'ci.failed' : 'ci.completed';
      return {
        eventType,
        resourceType: 'ci',
        resourceId:   String(wf.id),
        action:       state,
        actor:        { id: wf.actor?.login, name: wf.actor?.login, email: null },
        summary:      `CI ${wf.name}: ${state} — ${repo}`,
        metadata:     { repo, workflowName: wf.name, branch: wf.head_branch, conclusion: wf.conclusion },
      };
    }
    case 'release': {
      const rel = payload.release || {};
      return {
        eventType:    'release.published',
        resourceType: 'release',
        resourceId:   String(rel.id),
        action:       action,
        actor:        { id: rel.author?.login, name: rel.author?.login, email: null },
        summary:      `${repo} released ${rel.tag_name}: ${rel.name || rel.tag_name}`,
        metadata:     { repo, tagName: rel.tag_name, releaseName: rel.name, prerelease: rel.prerelease },
      };
    }
    default:
      return {
        eventType:    `github.${rawEventType}`,
        resourceType: 'unknown',
        resourceId:   crypto.randomUUID(),
        action,
        actor:        { id: payload.sender?.login, name: payload.sender?.login, email: null },
        summary:      `GitHub ${rawEventType}${action ? ' (' + action + ')' : ''} — ${repo}`,
        metadata:     { repo, rawEventType },
      };
  }
}

// ── Slack ─────────────────────────────────────────────────────────────────────

function normalizeSlack(payload) {
  const event     = payload.event || {};
  const eventType = event.type || 'unknown';
  const teamId    = payload.team_id || '';

  switch (eventType) {
    case 'message': {
      const isThread = !!event.thread_ts && event.thread_ts !== event.ts;
      return {
        eventType:    isThread ? 'thread.replied' : 'message.posted',
        resourceType: 'message',
        resourceId:   event.ts || crypto.randomUUID(),
        action:       event.subtype || 'posted',
        actor:        { id: event.user, name: event.username || event.user, email: null },
        summary:      `Message in ${event.channel}: ${(event.text || '').slice(0, 100)}`,
        metadata:     { channel: event.channel, ts: event.ts, threadTs: event.thread_ts, teamId },
      };
    }
    case 'reaction_added':
      return {
        eventType:    'reaction.added',
        resourceType: 'reaction',
        resourceId:   `${event.item?.channel}:${event.item?.ts}:${event.reaction}`,
        action:       'added',
        actor:        { id: event.user, name: event.user, email: null },
        summary:      `:${event.reaction}: added in ${event.item?.channel}`,
        metadata:     { channel: event.item?.channel, ts: event.item?.ts, reaction: event.reaction, teamId },
      };
    case 'channel_created':
      return {
        eventType:    'channel.created',
        resourceType: 'channel',
        resourceId:   event.channel?.id || crypto.randomUUID(),
        action:       'created',
        actor:        { id: event.channel?.creator, name: event.channel?.creator, email: null },
        summary:      `Channel #${event.channel?.name} created`,
        metadata:     { channelId: event.channel?.id, channelName: event.channel?.name, teamId },
      };
    default:
      return {
        eventType:    `slack.${eventType}`,
        resourceType: 'unknown',
        resourceId:   event.ts || crypto.randomUUID(),
        action:       eventType,
        actor:        { id: event.user, name: event.user, email: null },
        summary:      `Slack ${eventType}`,
        metadata:     { teamId, rawEventType: eventType },
      };
  }
}

// ── Google (Calendar push + Gmail push notifications) ────────────────────────

function normalizeGoogle(headers, payload) {
  const resourceState  = headers['x-goog-resource-state'] || 'unknown';
  const resourceUri    = headers['x-goog-resource-uri']   || '';
  const channelId      = headers['x-goog-channel-id']     || '';

  const isCalendar = resourceUri.includes('calendar');
  const isGmail    = resourceUri.includes('gmail');

  if (isCalendar) {
    return {
      eventType:    resourceState === 'sync'   ? 'calendar.event_created'
                 : resourceState === 'exists'  ? 'calendar.event_updated'
                 : resourceState === 'deleted' ? 'calendar.event_deleted'
                 : 'calendar.event_updated',
      resourceType: 'calendar_event',
      resourceId:   channelId,
      action:       resourceState,
      actor:        { id: null, name: null, email: null },
      summary:      `Calendar event ${resourceState}`,
      metadata:     { channelId, resourceUri, resourceState },
    };
  }

  if (isGmail) {
    return {
      eventType:    'gmail.message_received',
      resourceType: 'message',
      resourceId:   channelId,
      action:       resourceState,
      actor:        { id: null, name: null, email: null },
      summary:      `Gmail notification: ${resourceState}`,
      metadata:     { channelId, resourceUri, resourceState },
    };
  }

  return {
    eventType:    'google.notification',
    resourceType: 'unknown',
    resourceId:   channelId,
    action:       resourceState,
    actor:        { id: null, name: null, email: null },
    summary:      `Google notification: ${resourceState}`,
    metadata:     { channelId, resourceUri, resourceState },
  };
}

// ── Notion ────────────────────────────────────────────────────────────────────

function normalizeNotion(payload) {
  const type      = payload.type || 'unknown';
  const pageId    = payload.page?.id || payload.database?.id || crypto.randomUUID();
  const editedBy  = payload.last_edited_by?.name || payload.created_by?.name || 'notion';

  switch (type) {
    case 'page':
      return {
        eventType:    payload.created_time === payload.last_edited_time ? 'page.created' : 'page.updated',
        resourceType: 'page',
        resourceId:   pageId,
        action:       payload.created_time === payload.last_edited_time ? 'created' : 'updated',
        actor:        { id: null, name: editedBy, email: null },
        summary:      `Notion page ${payload.created_time === payload.last_edited_time ? 'created' : 'updated'}: ${payload.page?.url || pageId}`,
        metadata:     { pageId, url: payload.page?.url, editedBy },
      };
    case 'database':
      return {
        eventType:    'database.updated',
        resourceType: 'database',
        resourceId:   pageId,
        action:       'updated',
        actor:        { id: null, name: editedBy, email: null },
        summary:      `Notion database updated: ${payload.database?.url || pageId}`,
        metadata:     { databaseId: pageId, url: payload.database?.url, editedBy },
      };
    default:
      return {
        eventType:    `notion.${type}`,
        resourceType: 'unknown',
        resourceId:   pageId,
        action:       type,
        actor:        { id: null, name: editedBy, email: null },
        summary:      `Notion ${type} event`,
        metadata:     { type },
      };
  }
}

// ── Jira ──────────────────────────────────────────────────────────────────────

function normalizeJira(payload) {
  const webhookEvent = payload.webhookEvent || '';
  const issue        = payload.issue        || {};
  const comment      = payload.comment      || {};
  const sprint       = payload.sprint       || {};
  const user         = payload.user         || {};

  if (webhookEvent.startsWith('jira:issue')) {
    const action = webhookEvent.replace('jira:issue_', '');
    const isStatusChange = payload.changelog?.items?.some(i => i.field === 'status');
    const eventType = isStatusChange
      ? 'issue.status_changed'
      : action === 'created'
        ? 'issue.opened'
        : action === 'deleted'
          ? 'issue.closed'
          : 'issue.updated';

    return {
      eventType,
      resourceType: 'issue',
      resourceId:   issue.id || issue.key,
      action,
      actor:        { id: user.accountId, name: user.displayName, email: user.emailAddress },
      summary:      `[${issue.key}] ${action}: ${issue.fields?.summary || ''}`,
      metadata:     {
        key:       issue.key,
        status:    issue.fields?.status?.name,
        priority:  issue.fields?.priority?.name,
        assignee:  issue.fields?.assignee?.displayName,
        project:   issue.fields?.project?.key,
        changelog: payload.changelog?.items,
      },
    };
  }

  if (webhookEvent.includes('comment')) {
    return {
      eventType:    'comment.added',
      resourceType: 'comment',
      resourceId:   comment.id || crypto.randomUUID(),
      action:       'added',
      actor:        { id: user.accountId, name: user.displayName, email: user.emailAddress },
      summary:      `Comment on ${issue.key}: ${(comment.body || '').slice(0, 100)}`,
      metadata:     { key: issue.key, commentId: comment.id },
    };
  }

  if (webhookEvent.includes('sprint')) {
    const action     = webhookEvent.includes('started') ? 'started' : 'completed';
    const eventType  = `sprint.${action}`;
    return {
      eventType,
      resourceType: 'sprint',
      resourceId:   String(sprint.id || crypto.randomUUID()),
      action,
      actor:        { id: user.accountId, name: user.displayName, email: user.emailAddress },
      summary:      `Sprint ${action}: ${sprint.name}`,
      metadata:     { sprintId: sprint.id, sprintName: sprint.name },
    };
  }

  return {
    eventType:    `jira.${webhookEvent}`,
    resourceType: 'unknown',
    resourceId:   issue.key || crypto.randomUUID(),
    action:       webhookEvent,
    actor:        { id: user.accountId, name: user.displayName, email: user.emailAddress },
    summary:      `Jira ${webhookEvent}`,
    metadata:     { webhookEvent, key: issue.key },
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Normalize a raw connector webhook payload to a FLOW native event.
 *
 * @param {string} connectorId  — connector identifier
 * @param {object} headers      — raw request headers (lowercase)
 * @param {object} body         — parsed JSON payload
 * @param {string} deliveryId   — resolved delivery ID
 * @param {string} workspaceId
 * @returns {object}  FLOW native event
 */
export function normalize(connectorId, headers, body, deliveryId, workspaceId) {
  let partial;

  switch (connectorId) {
    case 'github':
      partial = normalizeGitHub(headers['x-github-event'] || 'unknown', body);
      break;
    case 'slack':
      partial = normalizeSlack(body);
      break;
    case 'google':
    case 'gmail':
    case 'google-calendar':
      partial = normalizeGoogle(headers, body);
      break;
    case 'notion':
      partial = normalizeNotion(body);
      break;
    case 'jira':
      partial = normalizeJira(body);
      break;
    default:
      partial = {
        eventType:    `${connectorId}.event`,
        resourceType: 'unknown',
        resourceId:   crypto.randomUUID(),
        action:       'unknown',
        actor:        { id: null, name: null, email: null },
        summary:      `${connectorId} webhook event`,
        metadata:     {},
      };
  }

  return {
    eventId:       crypto.randomUUID(),
    deliveryId:    deliveryId || crypto.randomUUID(),
    connectorId,
    workspaceId,
    receivedAt:    new Date().toISOString(),
    urgency:       _urgency(partial.eventType, partial.metadata),
    ...partial,
  };
}
