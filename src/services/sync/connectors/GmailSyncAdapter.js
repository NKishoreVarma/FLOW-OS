/**
 * GmailSyncAdapter — incremental sync for Gmail resource types.
 *
 * Resource types:  threads | messages | labels
 * Auth:            Google OAuth via GoogleOAuthService.getOAuth2Client()
 * Cursor format:
 *   threads/messages: Gmail historyId (integer string) — supports incremental history API
 *   labels:           ISO timestamp (labels rarely change; re-fetch weekly)
 * ETag:              thread/message historyId or label id
 */

import { google }        from 'googleapis';
import { getOAuth2Client } from '../../google/GoogleOAuthService.js';

const MAX_RESULTS = 50;

async function _gmail(workspaceId) {
  const auth = await getOAuth2Client(workspaceId);
  if (!auth) throw new Error('Gmail not connected for this workspace');
  return google.gmail({ version: 'v1', auth });
}

// ── Labels ────────────────────────────────────────────────────────────────────

async function syncLabels(workspaceId) {
  const gmail = await _gmail(workspaceId);
  const { data } = await gmail.users.labels.list({ userId: 'me' });
  const labels = data.labels || [];

  return {
    items: labels.map(label => ({
      externalId: label.id,
      etag:       label.id,     // labels don't have updatedAt; id is stable
      platform:   'gmail',
      sender:     'system',
      channel:    'labels',
      text:       `[Gmail Label] ${label.name} (${label.type || 'user'})`,
      metadata:   { labelId: label.id, name: label.name, type: label.type },
    })),
    newCursor: new Date().toISOString(),
  };
}

// ── Threads (incremental via historyId) ──────────────────────────────────────

async function syncThreads(workspaceId, cursor) {
  const gmail = await _gmail(workspaceId);
  const items = [];

  if (cursor) {
    // Incremental: use history API — only fetch changes since historyId
    try {
      let pageToken;
      let newHistoryId = cursor;

      do {
        const { data } = await gmail.users.history.list({
          userId:         'me',
          startHistoryId: cursor,
          historyTypes:   ['messageAdded', 'labelAdded', 'labelRemoved'],
          maxResults:     MAX_RESULTS,
          pageToken,
        });

        newHistoryId = data.historyId || newHistoryId;

        for (const record of data.history || []) {
          const threadIds = new Set([
            ...(record.messagesAdded || []).map(m => m.message?.threadId),
            ...(record.labelsAdded   || []).map(m => m.message?.threadId),
          ].filter(Boolean));

          for (const threadId of threadIds) {
            try {
              const { data: thread } = await gmail.users.threads.get({
                userId: 'me', id: threadId, format: 'metadata',
                metadataHeaders: ['Subject', 'From', 'Date', 'To'],
              });
              const item = _threadToItem(thread);
              if (item) items.push(item);
            } catch { /* thread may be deleted */ }
          }
        }

        pageToken = data.nextPageToken;
      } while (pageToken);

      return { items, newCursor: newHistoryId };
    } catch (err) {
      if (err.code === 404 || err.message?.includes('Invalid historyId')) {
        // historyId expired (> 7 days old) — fall through to full list
      } else {
        throw err;
      }
    }
  }

  // Initial or expired cursor: list recent threads
  let pageToken;
  let historyId;

  do {
    const { data } = await gmail.users.threads.list({
      userId:     'me',
      maxResults: MAX_RESULTS,
      q:          'in:inbox OR in:sent',
      pageToken,
    });

    historyId = data.nextPageToken ? historyId : data.nextPageToken;

    for (const stub of data.threads || []) {
      try {
        const { data: thread } = await gmail.users.threads.get({
          userId: 'me', id: stub.id, format: 'metadata',
          metadataHeaders: ['Subject', 'From', 'Date', 'To'],
        });
        const item = _threadToItem(thread);
        if (item) items.push(item);
      } catch { /* skip */ }
    }

    pageToken = data.nextPageToken;
  } while (pageToken && items.length < 200);

  // Get current historyId for the next incremental sync
  const { data: profile } = await gmail.users.getProfile({ userId: 'me' });
  return { items, newCursor: profile.historyId || new Date().toISOString() };
}

function _threadToItem(thread) {
  if (!thread?.messages?.length) return null;
  const first = thread.messages[0];
  const last  = thread.messages[thread.messages.length - 1];
  const headers = Object.fromEntries(
    (last.payload?.headers || []).map(h => [h.name.toLowerCase(), h.value])
  );

  const subject = headers.subject || '(no subject)';
  const from    = headers.from    || 'unknown';
  const to      = headers.to      || '';

  // Union of every message's labels. Integration Permissions attributes a thread
  // to the Gmail labels that govern it; without this the thread is ungovernable
  // and the permission gate has no basis on which to admit it.
  const labels = [...new Set(thread.messages.flatMap(m => m.labelIds || []))];

  return {
    externalId: thread.id,
    etag:       String(thread.historyId),
    platform:   'gmail',
    sender:     from,
    channel:    'inbox',
    text:       `[Gmail Thread] ${subject} — From: ${from} To: ${to} (${thread.messages.length} messages)`,
    metadata:   {
      threadId:      thread.id,
      subject,
      from,
      to,
      labels,
      messageCount:  thread.messages.length,
      snippet:       last.snippet,
      historyId:     thread.historyId,
    },
  };
}

// ── Messages (individual, for detailed content) ───────────────────────────────

async function syncMessages(workspaceId, cursor) {
  const gmail = await _gmail(workspaceId);
  const since = cursor
    ? new Date(isNaN(cursor) ? cursor : Date.now() - 24 * 60 * 60 * 1000).toISOString()
    : new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const afterDate = Math.floor(new Date(since).getTime() / 1000);
  const items = [];
  let pageToken;

  do {
    const { data } = await gmail.users.messages.list({
      userId:     'me',
      maxResults: MAX_RESULTS,
      q:          `after:${afterDate}`,
      pageToken,
    });

    for (const stub of data.messages || []) {
      try {
        const { data: msg } = await gmail.users.messages.get({
          userId: 'me', id: stub.id, format: 'metadata',
          metadataHeaders: ['Subject', 'From', 'Date', 'To', 'Cc'],
        });

        const headers = Object.fromEntries(
          (msg.payload?.headers || []).map(h => [h.name.toLowerCase(), h.value])
        );

        items.push({
          externalId: msg.id,
          etag:       String(msg.historyId),
          platform:   'gmail',
          sender:     headers.from || 'unknown',
          channel:    msg.labelIds?.includes('SENT') ? 'sent' : 'inbox',
          text:       `[Gmail] ${headers.subject || '(no subject)'} — From: ${headers.from || ''} (${new Date(parseInt(msg.internalDate, 10)).toLocaleDateString()}) ${msg.snippet || ''}`.slice(0, 800),
          metadata:   {
            messageId:   msg.id,
            threadId:    msg.threadId,
            subject:     headers.subject,
            from:        headers.from,
            to:          headers.to,
            cc:          headers.cc,
            labels:      msg.labelIds,
            internalDate: msg.internalDate,
            snippet:     msg.snippet,
          },
        });
      } catch { /* skip deleted messages */ }
    }

    pageToken = data.nextPageToken;
  } while (pageToken && items.length < 200);

  const { data: profile } = await gmail.users.getProfile({ userId: 'me' });
  return { items, newCursor: profile.historyId || new Date().toISOString() };
}

// ── Public API ────────────────────────────────────────────────────────────────

export const RESOURCE_TYPES = ['threads', 'messages', 'labels'];

export async function sync(workspaceId, resourceType, cursor, _opts = {}) {
  switch (resourceType) {
    case 'threads':  return syncThreads(workspaceId, cursor);
    case 'messages': return syncMessages(workspaceId, cursor);
    case 'labels':   return syncLabels(workspaceId);
    default:
      throw new Error(`GmailSyncAdapter: unknown resourceType "${resourceType}"`);
  }
}
