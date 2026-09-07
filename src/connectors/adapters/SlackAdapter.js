/**
 * FLOW OS — Slack Adapter (Communication Capability — Slack provider)
 *
 * Implements the Communication Capability for Slack:
 *   READ   — list channels, fetch channel history, thread replies
 *   SEND   — post message, reply to thread
 *   SEARCH — full-text message search (best-effort; requires user token for true search)
 *   SYNC   — push recent messages into the BullMQ ingestion pipeline
 *
 * Auth: Slack OAuth v2 bot token managed by SlackOAuthService.
 * All state-changing actions route through executeAction() (governance + audit + WS).
 *
 * Provider-agnostic: all responses use createCommunicationItem() from normalizedTypes.
 * Add a Microsoft Teams provider by creating TeamsAdapter with the same interface.
 */

import { BaseAdapter, ConnectorAuthError } from '../BaseAdapter.js';
import { Capability, ActionType, AuthStrategy } from '../capabilities.js';
import { createCommunicationItem, createSearchResult } from '../normalizedTypes.js';
import {
  getAuthUrl,
  handleCallback,
  getBotToken,
  healthCheck as slackHealthCheck,
  listChannels,
  getChannelHistory,
  getThreadReplies,
  searchMessages,
  postMessage,
} from '../../services/integrations/SlackOAuthService.js';
import { AppError, ValidationError } from '../../core/errors/index.js';

function normalizeMessage(msg, channelName = '') {
  return createCommunicationItem({
    id:          msg.ts || msg.client_msg_id || '',
    connector:   'slack',
    type:        msg.thread_ts && msg.thread_ts !== msg.ts ? 'reply' : 'message',
    subject:     msg.text?.substring(0, 80) || '(no text)',
    body:        msg.text || '',
    from:        { name: msg.username || msg.user || 'unknown', address: msg.user || '' },
    to:          [{ name: channelName, address: channelName }],
    timestamp:   msg.ts ? new Date(parseFloat(msg.ts) * 1000).toISOString() : new Date().toISOString(),
    threadId:    msg.thread_ts || msg.ts,
    labels:      msg.reactions?.map(r => r.name) || [],
    metadata: {
      channelId:  msg.channel || '',
      channelName,
      threadTs:   msg.thread_ts,
      replyCount: msg.reply_count || 0,
      reactions:  msg.reactions || [],
      botId:      msg.bot_id || null,
      files:      (msg.files || []).map(f => ({ name: f.name, type: f.mimetype, url: f.url_private })),
    },
  });
}

class SlackAdapter extends BaseAdapter {
  constructor() {
    super({
      id:           'slack',
      name:         'Slack',
      description:  'Slack messaging platform — channels, threads, search, notifications',
      capability:   Capability.COMMUNICATION,
      authStrategy: AuthStrategy.OAUTH2,
      version:      '1.0.0',
      supportedActions: [
        ActionType.READ,
        ActionType.SEARCH,
        ActionType.SEND,
        ActionType.SYNC,
      ],
    });
  }

  async authenticate(workspaceId, params = {}) {
    if (params.code && params.state) {
      return handleCallback(params.code, params.state);
    }
    return getAuthUrl(workspaceId);
  }

  async healthCheck(workspaceId) {
    const result = await slackHealthCheck(workspaceId);
    return {
      status:  result.healthy ? 'healthy' : 'degraded',
      details: result,
    };
  }

  async read(workspaceId, options = {}) {
    const token = await getBotToken(workspaceId);
    if (!token) throw new ConnectorAuthError('slack', 'Slack not connected for this workspace');

    const { resourceType, channelId, threadTs, limit = 50, cursor = null } = options;

    switch (resourceType || 'messages') {
      case 'channels': {
        const { channels, nextCursor } = await listChannels(workspaceId, { limit, cursor });
        return {
          channels: (channels || []).map(c => ({
            id:          c.id,
            name:        c.name,
            topic:       c.topic?.value || '',
            purpose:     c.purpose?.value || '',
            memberCount: c.num_members || 0,
            isPrivate:   c.is_private,
            isArchived:  c.is_archived,
          })),
          nextCursor,
        };
      }

      case 'messages': {
        if (!channelId) throw new ValidationError('channelId is required for messages resourceType');
        const { messages, hasMore, nextCursor } = await getChannelHistory(workspaceId, channelId, { limit, cursor });
        return {
          messages:   (messages || []).map(m => normalizeMessage(m)),
          hasMore,
          nextCursor,
        };
      }

      case 'thread': {
        if (!channelId || !threadTs) throw new ValidationError('channelId and threadTs are required for thread resourceType');
        const replies = await getThreadReplies(workspaceId, channelId, threadTs);
        return { messages: (replies || []).map(m => normalizeMessage(m)) };
      }

      default:
        throw new AppError(`Unknown Slack resourceType: ${resourceType}`, 400, 'INVALID_RESOURCE_TYPE');
    }
  }

  async send(workspaceId, options = {}) {
    const { channelId, text, blocks, threadTs } = options;
    if (!channelId) throw new ValidationError('channelId is required');
    if (!text)      throw new ValidationError('text is required');

    return postMessage(workspaceId, channelId, text, { blocks, threadTs });
  }

  async search(workspaceId, query, { limit = 20 } = {}) {
    const matches = await searchMessages(workspaceId, query, { count: limit });
    return (matches || []).map(m => createSearchResult({
      id:        m.ts || '',
      connector: 'slack',
      type:      'message',
      title:     m.text?.substring(0, 80) || '(no text)',
      excerpt:   m.text || '',
      url:       m.permalink || '',
      timestamp: m.ts ? new Date(parseFloat(m.ts) * 1000).toISOString() : null,
      score:     1.0,
      metadata:  { channel: m.channel?.name || m.channel, user: m.username },
    }));
  }

  async sync(workspaceId, options = {}) {
    const { enqueueSyncJob } = await import('../../config/syncQueue.js');
    await enqueueSyncJob(workspaceId, 'slack', 'messages', { trigger: 'manual', ...options });
    return { queued: true, connector: 'slack' };
  }

  async execute(workspaceId, actionType, payload = {}) {
    switch (actionType) {
      case ActionType.READ:   return this.read(workspaceId, payload);
      case ActionType.SEND:   return this.send(workspaceId, payload);
      case ActionType.SEARCH: return this.search(workspaceId, payload.query || '', payload);
      case ActionType.SYNC:   return this.sync(workspaceId, payload);
      default:
        throw new AppError(`Unsupported Slack action: ${actionType}`, 400, 'UNSUPPORTED_ACTION');
    }
  }
}

export default new SlackAdapter();
