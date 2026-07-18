/**
 * NotionSyncAdapter — incremental sync for Notion resource types.
 *
 * Resource types:  pages | databases
 * Auth:            Access token via NotionOAuthService.getAccessToken()
 * Cursor format:   ISO-8601 timestamp (last_edited_time > cursor)
 * ETag:            last_edited_time (ISO string from Notion)
 *
 * Notion search API supports filtering by last_edited_time, making
 * true incremental sync possible without storing all page IDs.
 */

import { getAccessToken } from '../../integrations/NotionOAuthService.js';

const NOTION_API  = 'https://api.notion.com/v1';
const NOTION_VER  = '2022-06-28';
const PAGE_SIZE   = 50;

async function _headers(workspaceId) {
  const token = await getAccessToken(workspaceId);
  if (!token) throw new Error('Notion not connected for this workspace');
  return {
    Authorization:      `Bearer ${token}`,
    'Notion-Version':   NOTION_VER,
    'Content-Type':     'application/json',
  };
}

async function _post(path, headers, body) {
  const res = await fetch(`${NOTION_API}${path}`, {
    method:  'POST',
    headers,
    body:    JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Notion ${path} ${res.status}: ${err.message || res.statusText}`);
  }
  return res.json();
}

async function _get(path, headers) {
  const res = await fetch(`${NOTION_API}${path}`, { headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Notion ${path} ${res.status}: ${err.message || res.statusText}`);
  }
  return res.json();
}

function _extractTitle(page) {
  for (const prop of Object.values(page.properties || {})) {
    if (prop.type === 'title' && prop.title?.length) {
      return prop.title.map(t => t.plain_text).join('');
    }
  }
  return page.title?.map?.(t => t.plain_text)?.join('') || '(Untitled)';
}

// ── Pages ─────────────────────────────────────────────────────────────────────

async function syncPages(workspaceId, cursor) {
  const headers = await _headers(workspaceId);
  const items   = [];
  let startCursor;

  // Notion search sorts by last_edited_time descending
  const filter = cursor
    ? { property: 'last_edited_time', date: { after: cursor } }
    : undefined;

  do {
    const body = {
      filter:      filter,
      sort:        { direction: 'descending', timestamp: 'last_edited_time' },
      page_size:   PAGE_SIZE,
      start_cursor: startCursor,
    };

    const data = await _post('/search', headers, body);

    for (const page of (data.results || []).filter(r => r.object === 'page')) {
      const title = _extractTitle(page);
      items.push({
        externalId: page.id,
        etag:       page.last_edited_time,
        platform:   'notion',
        sender:     page.last_edited_by?.id || 'notion',
        channel:    'pages',
        text:       `[Notion Page] ${title}${page.url ? ' — ' + page.url : ''}`,
        metadata:   {
          pageId:        page.id,
          title,
          url:           page.url,
          createdTime:   page.created_time,
          lastEditedTime: page.last_edited_time,
          archived:      page.archived,
          parentType:    page.parent?.type,
        },
      });
    }

    startCursor = data.has_more ? data.next_cursor : null;
  } while (startCursor && items.length < 500);

  return { items, newCursor: new Date().toISOString() };
}

// ── Databases ─────────────────────────────────────────────────────────────────

async function syncDatabases(workspaceId, cursor) {
  const headers = await _headers(workspaceId);
  const items   = [];
  let startCursor;

  const filter = cursor
    ? { property: 'last_edited_time', date: { after: cursor } }
    : undefined;

  // First: list databases
  do {
    const body = {
      filter:       { ...(filter || {}), value: 'database', property: 'object' },
      sort:         { direction: 'descending', timestamp: 'last_edited_time' },
      page_size:    PAGE_SIZE,
      start_cursor: startCursor,
    };

    // Notion search with object=database
    const searchBody = {
      filter:       { value: 'database', property: 'object' },
      sort:         { direction: 'descending', timestamp: 'last_edited_time' },
      page_size:    PAGE_SIZE,
      start_cursor: startCursor,
    };

    const data = await _post('/search', headers, searchBody);

    for (const db of data.results || []) {
      if (cursor && new Date(db.last_edited_time) <= new Date(cursor)) break;

      const title = db.title?.map(t => t.plain_text).join('') || '(Untitled Database)';
      const propNames = Object.keys(db.properties || {}).slice(0, 10).join(', ');

      items.push({
        externalId: db.id,
        etag:       db.last_edited_time,
        platform:   'notion',
        sender:     db.last_edited_by?.id || 'notion',
        channel:    'databases',
        text:       `[Notion Database] ${title}${propNames ? ' — Properties: ' + propNames : ''}`,
        metadata:   {
          databaseId:     db.id,
          title,
          url:            db.url,
          properties:     Object.keys(db.properties || {}),
          lastEditedTime: db.last_edited_time,
        },
      });

      // Also sync the database entries (rows) — up to 50 most recent
      try {
        const rows = await _syncDatabaseEntries(db.id, cursor, headers);
        items.push(...rows);
      } catch { /* skip if no access */ }
    }

    startCursor = data.has_more ? data.next_cursor : null;
  } while (startCursor && items.length < 500);

  return { items, newCursor: new Date().toISOString() };
}

async function _syncDatabaseEntries(databaseId, cursor, headers) {
  const items = [];
  const filter = cursor
    ? { timestamp: 'last_edited_time', last_edited_time: { after: cursor } }
    : undefined;

  const body = {
    sorts:     [{ timestamp: 'last_edited_time', direction: 'descending' }],
    filter,
    page_size: 20,
  };

  const data = await _post(`/databases/${databaseId}/query`, headers, body);

  for (const page of data.results || []) {
    const title = _extractTitle(page);
    items.push({
      externalId: page.id,
      etag:       page.last_edited_time,
      platform:   'notion',
      sender:     page.last_edited_by?.id || 'notion',
      channel:    `database:${databaseId}`,
      text:       `[Notion DB Row] ${title}`,
      metadata:   {
        pageId:        page.id,
        databaseId,
        title,
        url:           page.url,
        lastEditedTime: page.last_edited_time,
      },
    });
  }

  return items;
}

// ── Public API ────────────────────────────────────────────────────────────────

export const RESOURCE_TYPES = ['pages', 'databases'];

export async function sync(workspaceId, resourceType, cursor, _opts = {}) {
  switch (resourceType) {
    case 'pages':     return syncPages(workspaceId, cursor);
    case 'databases': return syncDatabases(workspaceId, cursor);
    default:
      throw new Error(`NotionSyncAdapter: unknown resourceType "${resourceType}"`);
  }
}
