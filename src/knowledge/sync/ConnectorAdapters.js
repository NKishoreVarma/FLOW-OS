/**
 * ConnectorAdapters — maps connector-native data shapes to KG node/edge inputs.
 *
 * Each adapter is a pure function: (workspaceId, connectorData) → { nodes, edges }
 *
 * These are called by the FLOW event subscriber (KGEventSubscriber) and by
 * REST sync endpoints. No connector APIs are called here.
 *
 * Adding a new connector adapter:
 *   1. Create adapt<ConnectorName>(workspaceId, data) below
 *   2. Register it in ADAPTERS at the bottom
 *   3. Done — no other file changes needed
 */

import { EntityType }       from '../schema/EntityTypes.js';
import { RelationshipType } from '../schema/RelationshipTypes.js';

// ── GitHub adapter ────────────────────────────────────────────────────────────

export function adaptGitHub(workspaceId, data) {
  const nodes = [];
  const edges = [];

  // Repository
  if (data.repo) {
    const r = data.repo;
    nodes.push({
      entityType:  EntityType.REPOSITORY,
      externalId:  String(r.id ?? r.name),
      name:        r.full_name ?? r.name,
      displayName: r.name,
      description: r.description ?? null,
      source:      'github',
      properties: {
        url:          r.html_url,
        language:     r.language,
        stars:        r.stargazers_count,
        forks:        r.forks_count,
        openIssues:   r.open_issues_count,
        defaultBranch: r.default_branch,
        isPrivate:    r.private,
        topics:       r.topics ?? [],
      },
    });
  }

  // Pull request
  if (data.pullRequest) {
    const pr = data.pullRequest;
    nodes.push({
      entityType:  EntityType.PULL_REQUEST,
      externalId:  String(pr.id ?? pr.number),
      name:        pr.title ?? `PR #${pr.number}`,
      source:      'github',
      properties: {
        number:   pr.number,
        state:    pr.state,
        url:      pr.html_url,
        draft:    pr.draft ?? false,
        merged:   pr.merged ?? false,
        mergedAt: pr.merged_at,
        labels:   pr.labels?.map(l => l.name) ?? [],
        additions: pr.additions ?? 0,
        deletions: pr.deletions ?? 0,
      },
    });

    // PR → repository edge
    if (data.repo) {
      const repoId = `${workspaceId}:${EntityType.REPOSITORY}:github:${data.repo.id ?? data.repo.name}`;
      const prId   = `${workspaceId}:${EntityType.PULL_REQUEST}:github:${pr.id ?? pr.number}`;
      edges.push({ sourceId: prId, targetId: repoId, relationshipType: RelationshipType.BELONGS_TO, sourceSystem: 'github' });
    }

    // PR author → created_by
    if (pr.user?.login) {
      nodes.push({
        entityType:  EntityType.PERSON,
        externalId:  pr.user.login,
        name:        pr.user.name ?? pr.user.login,
        source:      'github',
        properties: { githubLogin: pr.user.login, avatarUrl: pr.user.avatar_url },
      });
      const authorId = `${workspaceId}:${EntityType.PERSON}:github:${pr.user.login}`;
      const prId     = `${workspaceId}:${EntityType.PULL_REQUEST}:github:${pr.id ?? pr.number}`;
      edges.push({ sourceId: prId, targetId: authorId, relationshipType: RelationshipType.CREATED_BY, sourceSystem: 'github' });
    }

    // Reviewers → reviewed_by
    for (const reviewer of pr.requested_reviewers ?? []) {
      nodes.push({
        entityType:  EntityType.PERSON,
        externalId:  reviewer.login,
        name:        reviewer.name ?? reviewer.login,
        source:      'github',
        properties: { githubLogin: reviewer.login },
      });
      const reviewerId = `${workspaceId}:${EntityType.PERSON}:github:${reviewer.login}`;
      const prId       = `${workspaceId}:${EntityType.PULL_REQUEST}:github:${pr.id ?? pr.number}`;
      edges.push({ sourceId: prId, targetId: reviewerId, relationshipType: RelationshipType.REVIEWED_BY, sourceSystem: 'github' });
    }
  }

  // Deployment
  if (data.deployment) {
    const d = data.deployment;
    nodes.push({
      entityType:  EntityType.DEPLOYMENT,
      externalId:  String(d.id),
      name:        `Deploy ${d.sha?.slice(0, 7) ?? d.id} → ${d.environment}`,
      source:      'github',
      properties: {
        environment: d.environment,
        sha:         d.sha,
        ref:         d.ref,
        task:        d.task,
        createdAt:   d.created_at,
        status:      d.statuses?.[0]?.state ?? 'unknown',
      },
    });

    if (d.environment) {
      nodes.push({
        entityType:  EntityType.ENVIRONMENT,
        externalId:  d.environment,
        name:        d.environment,
        source:      'github',
        properties: { name: d.environment },
      });
      const deployId = `${workspaceId}:${EntityType.DEPLOYMENT}:github:${d.id}`;
      const envId    = `${workspaceId}:${EntityType.ENVIRONMENT}:github:${d.environment}`;
      edges.push({ sourceId: deployId, targetId: envId, relationshipType: RelationshipType.BELONGS_TO, sourceSystem: 'github' });
    }
  }

  return { nodes, edges };
}

// ── Jira adapter ──────────────────────────────────────────────────────────────

export function adaptJira(workspaceId, data) {
  const nodes = [];
  const edges = [];

  if (data.issue) {
    const i = data.issue;
    nodes.push({
      entityType:  EntityType.JIRA_ISSUE,
      externalId:  i.key ?? String(i.id),
      name:        `${i.key}: ${i.fields?.summary ?? 'Untitled'}`,
      source:      'jira',
      properties: {
        key:        i.key,
        status:     i.fields?.status?.name,
        priority:   i.fields?.priority?.name,
        issueType:  i.fields?.issuetype?.name,
        project:    i.fields?.project?.key,
        url:        `https://jira.atlassian.com/browse/${i.key}`,
        labels:     i.fields?.labels ?? [],
        storyPoints: i.fields?.story_points,
        sprint:     i.fields?.sprint?.name,
      },
    });

    // Assignee
    if (i.fields?.assignee) {
      const a = i.fields.assignee;
      nodes.push({
        entityType:  EntityType.PERSON,
        externalId:  a.accountId ?? a.emailAddress,
        name:        a.displayName,
        source:      'jira',
        properties: { email: a.emailAddress, jiraAccountId: a.accountId },
      });
      const personId = `${workspaceId}:${EntityType.PERSON}:jira:${a.accountId ?? a.emailAddress}`;
      const issueId  = `${workspaceId}:${EntityType.JIRA_ISSUE}:jira:${i.key ?? i.id}`;
      edges.push({ sourceId: issueId, targetId: personId, relationshipType: RelationshipType.ASSIGNED_TO, sourceSystem: 'jira' });
    }

    // Epic / parent
    if (i.fields?.parent?.key) {
      const parentId = `${workspaceId}:${EntityType.JIRA_ISSUE}:jira:${i.fields.parent.key}`;
      const issueId  = `${workspaceId}:${EntityType.JIRA_ISSUE}:jira:${i.key ?? i.id}`;
      edges.push({ sourceId: issueId, targetId: parentId, relationshipType: RelationshipType.BELONGS_TO, sourceSystem: 'jira' });
    }

    // Issue links
    for (const link of i.fields?.issuelinks ?? []) {
      const linkedKey = link.outwardIssue?.key ?? link.inwardIssue?.key;
      const linkType  = link.type?.outward ?? link.type?.name ?? 'linked_to';
      if (!linkedKey) continue;

      const relType = _jiraLinkTypeToRel(linkType);
      const linkedId = `${workspaceId}:${EntityType.JIRA_ISSUE}:jira:${linkedKey}`;
      const issueId  = `${workspaceId}:${EntityType.JIRA_ISSUE}:jira:${i.key ?? i.id}`;
      edges.push({ sourceId: issueId, targetId: linkedId, relationshipType: relType, sourceSystem: 'jira' });
    }
  }

  // Project
  if (data.project) {
    const p = data.project;
    nodes.push({
      entityType:  EntityType.PROJECT,
      externalId:  p.key ?? String(p.id),
      name:        p.name,
      source:      'jira',
      properties: { key: p.key, description: p.description },
    });
  }

  return { nodes, edges };
}

// ── Gmail adapter ─────────────────────────────────────────────────────────────

export function adaptGmail(workspaceId, data) {
  const nodes = [];
  const edges = [];

  if (data.message) {
    const m = data.message;
    const subject = m.payload?.headers?.find(h => h.name === 'Subject')?.value ?? 'No Subject';
    const from    = m.payload?.headers?.find(h => h.name === 'From')?.value;
    const to      = m.payload?.headers?.find(h => h.name === 'To')?.value;

    nodes.push({
      entityType:  EntityType.EMAIL,
      externalId:  m.id,
      name:        subject,
      source:      'gmail',
      properties: {
        threadId:  m.threadId,
        from,
        to,
        snippet:   m.snippet,
        labelIds:  m.labelIds,
        date:      m.internalDate,
      },
    });

    // From person
    if (from) {
      const email = _extractEmail(from);
      if (email) {
        nodes.push({
          entityType:  EntityType.PERSON,
          externalId:  email,
          name:        _extractName(from) ?? email,
          source:      'gmail',
          properties: { email },
        });
        const personId = `${workspaceId}:${EntityType.PERSON}:gmail:${email}`;
        const emailId  = `${workspaceId}:${EntityType.EMAIL}:gmail:${m.id}`;
        edges.push({ sourceId: emailId, targetId: personId, relationshipType: RelationshipType.CREATED_BY, sourceSystem: 'gmail' });
      }
    }
  }

  return { nodes, edges };
}

// ── Calendar adapter ──────────────────────────────────────────────────────────

export function adaptGoogleCalendar(workspaceId, data) {
  const nodes = [];
  const edges = [];

  if (data.event) {
    const e = data.event;
    nodes.push({
      entityType:  EntityType.MEETING,
      externalId:  e.id,
      name:        e.summary ?? 'Untitled Meeting',
      source:      'google-calendar',
      properties: {
        start:       e.start?.dateTime ?? e.start?.date,
        end:         e.end?.dateTime ?? e.end?.date,
        location:    e.location,
        videoUrl:    e.hangoutLink,
        status:      e.status,
        organizer:   e.organizer?.email,
        attendeeCount: e.attendees?.length ?? 0,
        recurring:   !!e.recurringEventId,
      },
    });

    // Attendees
    for (const attendee of e.attendees ?? []) {
      if (!attendee.email) continue;
      nodes.push({
        entityType:  EntityType.PERSON,
        externalId:  attendee.email,
        name:        attendee.displayName ?? attendee.email,
        source:      'google-calendar',
        properties: { email: attendee.email, responseStatus: attendee.responseStatus },
      });
      const personId  = `${workspaceId}:${EntityType.PERSON}:google-calendar:${attendee.email}`;
      const meetingId = `${workspaceId}:${EntityType.MEETING}:google-calendar:${e.id}`;
      edges.push({ sourceId: personId, targetId: meetingId, relationshipType: RelationshipType.PARTICIPATES_IN, sourceSystem: 'google-calendar' });
    }
  }

  return { nodes, edges };
}

// ── HubSpot adapter ───────────────────────────────────────────────────────────

export function adaptHubSpot(workspaceId, data) {
  const nodes = [];
  const edges = [];

  if (data.contact) {
    const c = data.contact;
    const props = c.properties ?? {};
    nodes.push({
      entityType:  EntityType.CUSTOMER,
      externalId:  String(c.id),
      name:        `${props.firstname ?? ''} ${props.lastname ?? ''}`.trim() || props.email || String(c.id),
      source:      'hubspot',
      properties: {
        email:     props.email,
        company:   props.company,
        phone:     props.phone,
        lifecycle: props.lifecyclestage,
        dealIds:   data.dealIds ?? [],
      },
    });
  }

  if (data.company) {
    const c = data.company;
    const props = c.properties ?? {};
    nodes.push({
      entityType:  EntityType.CUSTOMER,
      externalId:  `company:${c.id}`,
      name:        props.name ?? `Company ${c.id}`,
      source:      'hubspot',
      properties: {
        industry: props.industry,
        domain:   props.domain,
        arr:      props.annualrevenue,
        tier:     props.customer_tier,
      },
    });
  }

  return { nodes, edges };
}

// ── Slack adapter ─────────────────────────────────────────────────────────────

export function adaptSlack(workspaceId, data) {
  const nodes = [];
  const edges = [];

  if (data.channel) {
    const c = data.channel;
    nodes.push({
      entityType:  EntityType.SLACK_CHANNEL,
      externalId:  c.id,
      name:        `#${c.name}`,
      source:      'slack',
      properties: {
        purpose:    c.purpose?.value,
        topic:      c.topic?.value,
        memberCount: c.num_members ?? 0,
        isPrivate:  c.is_private ?? false,
      },
    });
  }

  if (data.member && data.channelId) {
    const m       = data.member;
    const profile = m.profile ?? {};
    nodes.push({
      entityType:  EntityType.PERSON,
      externalId:  m.id,
      name:        profile.display_name || profile.real_name || m.id,
      source:      'slack',
      properties: { email: profile.email, title: profile.title, slackId: m.id },
    });
    const personId  = `${workspaceId}:${EntityType.PERSON}:slack:${m.id}`;
    const channelId = `${workspaceId}:${EntityType.SLACK_CHANNEL}:slack:${data.channelId}`;
    edges.push({ sourceId: personId, targetId: channelId, relationshipType: RelationshipType.MEMBER_OF, sourceSystem: 'slack' });
  }

  return { nodes, edges };
}

// ── Registry ──────────────────────────────────────────────────────────────────

export const ADAPTERS = {
  github:           adaptGitHub,
  jira:             adaptJira,
  gmail:            adaptGmail,
  'google-calendar': adaptGoogleCalendar,
  hubspot:          adaptHubSpot,
  salesforce:       adaptHubSpot,  // compatible shape
  slack:            adaptSlack,
};

/**
 * Get the adapter for a given source system.
 * @param {string} source
 * @returns {Function|null}
 */
export function getAdapter(source) {
  return ADAPTERS[source?.toLowerCase()] ?? null;
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function _extractEmail(str) {
  const m = str.match(/<([^>]+)>/);
  return m ? m[1].toLowerCase() : (str.includes('@') ? str.trim().toLowerCase() : null);
}

function _extractName(str) {
  const m = str.match(/^([^<]+)</);
  return m ? m[1].trim().replace(/^"|"$/g, '') : null;
}

function _jiraLinkTypeToRel(linkType) {
  const lower = (linkType ?? '').toLowerCase();
  if (lower.includes('block'))   return RelationshipType.BLOCKS;
  if (lower.includes('depend'))  return RelationshipType.DEPENDS_ON;
  if (lower.includes('cloned'))  return RelationshipType.RELATED_TO;
  if (lower.includes('related')) return RelationshipType.RELATED_TO;
  return RelationshipType.LINKED_TO;
}
