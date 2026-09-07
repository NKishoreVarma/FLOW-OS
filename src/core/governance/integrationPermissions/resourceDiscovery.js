/**
 * FLOW OS — Resource Discovery (Phase 13.1)
 *
 * Asks each provider what it actually holds. Real API calls only — every resource
 * shown in the Permissions Center comes from the connector's own API, never from
 * a hardcoded list. A connector that is not authenticated returns NOT_CONNECTED;
 * it does not return placeholder data.
 *
 * Auth is reused from the services the sync adapters already use, so there is one
 * credential path per connector, not two.
 */

import { google } from 'googleapis';

import { getBotToken, listChannels }  from '../../../services/integrations/SlackOAuthService.js';
import { getAccessToken as getGitHubToken } from '../../../services/integrations/GitHubOAuthService.js';
import { getAccessToken as getNotionToken } from '../../../services/integrations/NotionOAuthService.js';
import { getJiraConfig }              from '../../../services/integrations/JiraOAuthService.js';
import { getOAuth2Client }            from '../../../services/google/GoogleOAuthService.js';

export class NotConnectedError extends Error {
  constructor(connector) {
    super(`${connector} is not connected for this workspace`);
    this.code = 'NOT_CONNECTED';
    this.connector = connector;
  }
}

/**
 * Resolve a credential, treating any failure to obtain one as "not connected".
 *
 * A missing token and an unreadable credential store are the same thing from the
 * caller's point of view: FLOW cannot talk to this provider. Surfacing that as
 * NOT_CONNECTED gives the UI an honest empty state instead of a raw driver error.
 */
async function credential(connector, resolve) {
  let value;
  try {
    value = await resolve();
  } catch {
    throw new NotConnectedError(connector);
  }
  if (!value) throw new NotConnectedError(connector);
  return value;
}

function resource(resourceType, resourceId, resourceName, { parentId = null, ...metadata } = {}) {
  return { resourceType, resourceId: String(resourceId), resourceName, parentId, metadata };
}

// ── Slack: channels, private channels, groups ────────────────────────────────

async function discoverSlack(workspaceId) {
  const token = await credential('slack', () => getBotToken(workspaceId));

  const out = [];

  // listChannels already pages the conversations.list API for us.
  const { channels } = await listChannels(workspaceId, { limit: 1000 });

  for (const ch of channels || []) {
    const type = ch.is_private ? 'private_channel' : 'channel';
    out.push(resource(type, ch.id, `#${ch.name}`, {
      topic:      ch.topic?.value || null,
      purpose:    ch.purpose?.value || null,
      memberCount: ch.num_members ?? null,
      isArchived: !!ch.is_archived,
    }));
  }

  // User groups are a separate Slack primitive (spec: "Groups").
  try {
    const res  = await fetch('https://slack.com/api/usergroups.list', {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    for (const g of (data.ok && data.usergroups) || []) {
      out.push(resource('group', g.id, g.name, {
        handle:      g.handle,
        description: g.description || null,
        userCount:   g.user_count ?? null,
      }));
    }
  } catch {
    // usergroups:read is an optional scope — its absence must not fail discovery.
  }

  return out;
}

// ── GitHub: organizations + repositories ─────────────────────────────────────

async function discoverGitHub(workspaceId) {
  const token = await credential('github', () => getGitHubToken(workspaceId));

  const headers = {
    Authorization:          `Bearer ${token}`,
    Accept:                 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };

  const out = [];

  const orgRes = await fetch('https://api.github.com/user/orgs?per_page=100', { headers });
  if (orgRes.ok) {
    for (const org of await orgRes.json()) {
      out.push(resource('organization', org.login, org.login, {
        description: org.description || null,
        avatarUrl:   org.avatar_url,
      }));
    }
  }

  // Paginate repos — a real org can hold far more than one page.
  let url = 'https://api.github.com/user/repos?sort=pushed&direction=desc&per_page=100';
  let pages = 0;

  while (url && pages < 10) {
    const res = await fetch(url, { headers });
    if (!res.ok) break;

    for (const r of await res.json()) {
      out.push(resource('repository', r.full_name, r.full_name, {
        parentId:    r.owner?.type === 'Organization' ? r.owner.login : null,
        private:     r.private,
        language:    r.language,
        description: r.description || null,
        archived:    r.archived,
        pushedAt:    r.pushed_at,
        url:         r.html_url,
      }));
    }

    const link = res.headers.get('Link') || '';
    const next = link.split(',').find(p => p.includes('rel="next"'));
    url = next ? next.match(/<([^>]+)>/)?.[1] : null;
    pages++;
  }

  return out;
}

// ── Gmail: labels ────────────────────────────────────────────────────────────

async function discoverGmail(workspaceId) {
  const auth = await credential('gmail', () => getOAuth2Client(workspaceId));

  const gmail    = google.gmail({ version: 'v1', auth });
  const { data } = await gmail.users.labels.list({ userId: 'me' });

  return (data.labels || []).map(l =>
    resource('label', l.id, l.name, {
      labelType: l.type,               // 'system' (INBOX, SENT) | 'user'
      messagesTotal: l.messagesTotal ?? null,
    }),
  );
}

// ── Google Calendar: calendars ───────────────────────────────────────────────

async function discoverCalendar(workspaceId) {
  const auth = await credential('google-calendar', () => getOAuth2Client(workspaceId));

  const cal      = google.calendar({ version: 'v3', auth });
  const { data } = await cal.calendarList.list({ maxResults: 250 });

  return (data.items || []).map(c =>
    resource('calendar', c.id, c.summary || c.id, {
      description: c.description || null,
      primary:     !!c.primary,
      accessRole:  c.accessRole,
      timeZone:    c.timeZone,
    }),
  );
}

// ── Notion: pages + databases ────────────────────────────────────────────────

function notionTitle(obj) {
  for (const prop of Object.values(obj.properties || {})) {
    if (prop.type === 'title' && prop.title?.length) {
      return prop.title.map(t => t.plain_text).join('');
    }
  }
  return obj.title?.map?.(t => t.plain_text)?.join('') || '(Untitled)';
}

async function discoverNotion(workspaceId) {
  const token = await credential('notion', () => getNotionToken(workspaceId));

  const headers = {
    Authorization:    `Bearer ${token}`,
    'Notion-Version': '2022-06-28',
    'Content-Type':   'application/json',
  };

  const out = [];

  for (const objectType of ['page', 'database']) {
    let startCursor;
    let pages = 0;

    do {
      const res = await fetch('https://api.notion.com/v1/search', {
        method:  'POST',
        headers,
        body: JSON.stringify({
          filter:       { value: objectType, property: 'object' },
          page_size:    100,
          start_cursor: startCursor,
        }),
      });
      if (!res.ok) break;

      const data = await res.json();

      for (const obj of data.results || []) {
        out.push(resource(objectType, obj.id, notionTitle(obj), {
          parentId:   obj.parent?.database_id || obj.parent?.page_id || null,
          parentType: obj.parent?.type || null,
          url:        obj.url,
          archived:   obj.archived,
        }));
      }

      startCursor = data.has_more ? data.next_cursor : null;
      pages++;
    } while (startCursor && pages < 10);
  }

  return out;
}

// ── Jira: projects ───────────────────────────────────────────────────────────

async function discoverJira(workspaceId) {
  const config = await credential('jira', () => getJiraConfig(workspaceId));

  const out = [];
  let startAt = 0;
  let total   = Infinity;

  while (startAt < total && out.length < 500) {
    const res = await fetch(
      `${config.baseUrl}/rest/api/3/project/search?startAt=${startAt}&maxResults=50&expand=description,lead`,
      { headers: { Authorization: config.authHeader, Accept: 'application/json' } },
    );
    if (!res.ok) break;

    const data = await res.json();
    total = data.total ?? 0;

    for (const p of data.values || []) {
      // resourceId is the project KEY: issues and comments are attributed by key,
      // not by numeric id, so the catalog must key on what the gate will see.
      out.push(resource('project', p.key, `${p.key} — ${p.name}`, {
        projectId:   p.id,
        projectType: p.projectTypeKey,
        lead:        p.lead?.displayName || null,
        description: p.description || null,
      }));
    }

    startAt += 50;
    if (!data.values?.length) break;
  }

  return out;
}

const DISCOVERERS = {
  slack:             discoverSlack,
  github:            discoverGitHub,
  gmail:             discoverGmail,
  'google-calendar': discoverCalendar,
  notion:            discoverNotion,
  jira:              discoverJira,
};

/**
 * Discover every resource a connector exposes for this workspace.
 * @throws {NotConnectedError} when the connector has no credentials
 * @returns {Promise<Array<{resourceType,resourceId,resourceName,parentId,metadata}>>}
 */
export async function discoverResources(workspaceId, connector) {
  const fn = DISCOVERERS[connector];
  if (!fn) throw new Error(`No resource discovery for connector "${connector}"`);
  return fn(workspaceId);
}

export function isDiscoverable(connector) {
  return Boolean(DISCOVERERS[connector]);
}
