/**
 * SlackSyncAdapter — incremental sync for Slack resource types.
 *
 * Resource types:  channels | messages | threads
 * Auth:            Bot token via SlackOAuthService.getBotToken()
 * Cursor format:
 *   channels:  ISO timestamp (re-list periodically)
 *   messages:  Unix timestamp string (Slack ts format, e.g. "1720396800.000000")
 *   threads:   Unix timestamp of parent message
 * ETag:            message ts (immutable Slack identifier)
 */

import { getBotToken, listChannels, getChannelHistory, getThreadReplies } from '../../integrations/SlackOAuthService.js';

const SLACK_API   = 'https://slack.com/api';
const MAX_RESULTS = 100;
const MAX_CHANNELS = 20;

async function _slackFetch(endpoint, token, params = {}) {
  const url = new URL(`${SLACK_API}/${endpoint}`);
  Object.entries(params).forEach(([k, v]) => v != null && url.searchParams.set(k, v));
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error(`Slack API ${endpoint} returned ${res.status}`);
  const data = await res.json();
  if (!data.ok) throw new Error(`Slack API ${endpoint} error: ${data.error}`);
  return data;
}

// ── Channels ──────────────────────────────────────────────────────────────────

async function syncChannels(workspaceId, _cursor) {
  const token = await getBotToken(workspaceId);
  if (!token) throw new Error('Slack not connected');

  const { channels } = await listChannels(workspaceId, { limit: 200 });
  const items = (channels || []).map(ch => ({
    externalId: ch.id,
    etag:       ch.id + ':' + (ch.updated || ''),
    platform:   'slack',
    sender:     'slack',
    channel:    'channels',
    text:       `[Slack Channel] #${ch.name}${ch.topic?.value ? ' — ' + ch.topic.value : ''}${ch.purpose?.value ? ' | ' + ch.purpose.value : ''} (${ch.num_members || 0} members)`,
    metadata:   {
      channelId:  ch.id,
      name:       ch.name,
      isPrivate:  ch.is_private,
      topic:      ch.topic?.value,
      purpose:    ch.purpose?.value,
      numMembers: ch.num_members,
    },
  }));

  return { items, newCursor: new Date().toISOString() };
}

// ── Messages (per channel) ────────────────────────────────────────────────────

async function syncMessages(workspaceId, cursor) {
  const token = await getBotToken(workspaceId);
  if (!token) throw new Error('Slack not connected');

  // Convert cursor to Slack unix ts (seconds since epoch, 6 decimal places)
  const oldest = cursor
    ? (isNaN(cursor)
        ? String(Math.floor(new Date(cursor).getTime() / 1000))
        : cursor)
    : String(Math.floor((Date.now() - 24 * 60 * 60 * 1000) / 1000));

  const { channels } = await listChannels(workspaceId, { limit: 200 });
  const visibleChannels = (channels || []).slice(0, MAX_CHANNELS);
  const items = [];
  let latestTs = oldest;

  for (const ch of visibleChannels) {
    try {
      const { messages } = await getChannelHistory(workspaceId, ch.id, {
        limit: MAX_RESULTS,
        oldest,
      });

      for (const msg of (messages || []).filter(m => m.type === 'message' && m.text)) {
        // Track latest ts for cursor advancement
        if (msg.ts > latestTs) latestTs = msg.ts;

        items.push({
          externalId: `${ch.id}:${msg.ts}`,
          etag:       msg.ts,
          platform:   'slack',
          sender:     msg.username || msg.user || 'slack',
          channel:    ch.name || ch.id,
          text:       `[Slack #${ch.name}] ${msg.text}${msg.files?.length ? ` [${msg.files.length} attachment(s)]` : ''}`.slice(0, 800),
          metadata:   {
            ts:        msg.ts,
            channelId: ch.id,
            channelName: ch.name,
            userId:    msg.user,
            threadTs:  msg.thread_ts,
            replyCount: msg.reply_count,
            reactions: msg.reactions,
          },
        });
      }
    } catch { /* skip channels the bot can't read */ }
  }

  return { items, newCursor: latestTs };
}

// ── Threads (replies to top-level messages) ───────────────────────────────────

async function syncThreads(workspaceId, cursor) {
  const token = await getBotToken(workspaceId);
  if (!token) throw new Error('Slack not connected');

  const oldest = cursor
    ? String(Math.floor(new Date(isNaN(cursor) ? cursor : parseInt(cursor) * 1000).getTime() / 1000))
    : String(Math.floor((Date.now() - 24 * 60 * 60 * 1000) / 1000));

  const { channels } = await listChannels(workspaceId, { limit: 200 });
  const visibleChannels = (channels || []).slice(0, MAX_CHANNELS);
  const items = [];
  let latestTs = oldest;

  for (const ch of visibleChannels) {
    try {
      // First fetch top-level messages that have threads
      const { messages } = await getChannelHistory(workspaceId, ch.id, {
        limit: 50,
        oldest,
      });

      const threaded = (messages || []).filter(m => m.thread_ts && m.reply_count > 0);

      for (const parent of threaded.slice(0, 10)) {
        try {
          const replies = await getThreadReplies(workspaceId, ch.id, parent.thread_ts);
          for (const reply of (replies || []).filter(r => r.ts !== parent.ts)) {
            if (reply.ts > latestTs) latestTs = reply.ts;
            items.push({
              externalId: `${ch.id}:${parent.thread_ts}:${reply.ts}`,
              etag:       reply.ts,
              platform:   'slack',
              sender:     reply.username || reply.user || 'slack',
              channel:    ch.name || ch.id,
              text:       `[Slack Thread #${ch.name}] ${reply.text}`.slice(0, 800),
              metadata:   {
                ts:         reply.ts,
                threadTs:   parent.thread_ts,
                channelId:  ch.id,
                channelName: ch.name,
                userId:     reply.user,
                parentText: parent.text?.slice(0, 200),
              },
            });
          }
        } catch { /* thread may be inaccessible */ }
      }
    } catch { /* skip channels */ }
  }

  return { items, newCursor: latestTs };
}

// ── Public API ────────────────────────────────────────────────────────────────

export const RESOURCE_TYPES = ['channels', 'messages', 'threads'];

export async function sync(workspaceId, resourceType, cursor, _opts = {}) {
  switch (resourceType) {
    case 'channels': return syncChannels(workspaceId, cursor);
    case 'messages': return syncMessages(workspaceId, cursor);
    case 'threads':  return syncThreads(workspaceId, cursor);
    default:
      throw new Error(`SlackSyncAdapter: unknown resourceType "${resourceType}"`);
  }
}
