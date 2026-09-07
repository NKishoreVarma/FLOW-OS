/**
 * FLOW OS — Gmail Adapter (Communication Capability v1)
 *
 * First provider of the Communication Capability.
 * Future providers (Outlook, Exchange, Teams Chat, Slack DM) extend the same
 * BaseAdapter interface — this file is the canonical reference implementation.
 *
 * Every action goes through executeAction() in the Execution Engine:
 *   authenticate → workspace → governance → execute() → audit → timeline
 *
 * This adapter never bypasses the execution engine for writes.
 * Reads are also routed through executeAction() for audit completeness.
 */

import { google } from 'googleapis';
import { BaseAdapter, ConnectorAuthError } from '../BaseAdapter.js';
import { Capability, ActionType, AuthStrategy } from '../capabilities.js';
import { createCommunicationItem, createSearchResult } from '../normalizedTypes.js';
import { loadTokens, saveTokens, clearTokens } from '../../services/google/GoogleTokenManager.js';
import { getAuthUrl } from '../../services/google/GoogleOAuthService.js';
import { AppError, ValidationError } from '../../core/errors/index.js';

// ─── Structured error mapper for googleapis responses ─────────────────────────

function mapGmailError(err) {
  const code = err.code || err.status;
  if (code === 401 || code === 403) return new AppError('Gmail authentication expired. Reconnect required.', 401, 'CONNECTOR_AUTH_EXPIRED');
  if (code === 429 || err.message?.includes('quota')) return new AppError('Gmail API rate limit exceeded.', 429, 'CONNECTOR_RATE_LIMITED');
  if (err.message?.includes('DEADLINE_EXCEEDED') || err.message?.includes('timeout')) return new AppError('Gmail API request timed out.', 504, 'CONNECTOR_TIMEOUT');
  return err;
}

// Gmail OAuth scopes — modify covers read + label changes; send for outbound
const GMAIL_SCOPES = [
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/gmail.send',
  'openid',
  'email',
  'profile',
];

// ─── Module-level helpers ─────────────────────────────────────────────────────

function decodeBase64Url(data) {
  if (!data) return '';
  // Gmail uses base64url (RFC 4648 §5) — replace chars and decode
  const base64 = data.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(base64, 'base64').toString('utf-8');
}

function base64UrlEncode(str) {
  return Buffer.from(str)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function extractHeader(headers = [], name) {
  return headers.find(h => h.name?.toLowerCase() === name.toLowerCase())?.value ?? '';
}

function stripHtml(html) {
  if (!html) return '';
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function parseAddressList(headerValue) {
  if (!headerValue) return [];
  return headerValue.split(',').map(addr => {
    const nameMatch = addr.match(/^"?([^"<]+)"?\s*<([^>]+)>/);
    if (nameMatch) return { name: nameMatch[1].trim(), address: nameMatch[2].trim() };
    const emailOnly = addr.match(/<([^>]+)>|(\S+@\S+)/);
    const email = emailOnly ? (emailOnly[1] || emailOnly[2]).trim() : addr.trim();
    return { name: email, address: email };
  }).filter(r => r.address);
}

/**
 * Recursively walk a MIME payload tree to extract text/plain, text/html, and attachments.
 */
function extractEmailParts(payload) {
  let body = '';
  let bodyHtml = null;
  const attachments = [];

  function walk(part) {
    const mimeType = (part.mimeType || '').toLowerCase();
    const filename  = part.filename || '';

    if (filename) {
      attachments.push({
        name:         filename,
        mimeType:     part.mimeType || 'application/octet-stream',
        sizeBytes:    part.body?.size ?? 0,
        attachmentId: part.body?.attachmentId ?? null,
      });
      return;
    }

    if (mimeType === 'text/plain' && !body) {
      body = decodeBase64Url(part.body?.data);
    } else if (mimeType === 'text/html' && !bodyHtml) {
      bodyHtml = decodeBase64Url(part.body?.data);
    } else if (mimeType.startsWith('multipart/')) {
      (part.parts || []).forEach(walk);
    }
  }

  if (payload?.parts?.length) {
    payload.parts.forEach(walk);
  } else {
    const data = payload?.body?.data ?? '';
    const mt   = (payload?.mimeType || '').toLowerCase();
    if (mt === 'text/html') {
      bodyHtml = decodeBase64Url(data);
      body     = stripHtml(bodyHtml);
    } else {
      body = decodeBase64Url(data);
    }
  }

  // If we got HTML but no plain text, derive it
  if (!body && bodyHtml) body = stripHtml(bodyHtml);

  return { body, bodyHtml, attachments };
}

/**
 * Normalize a raw Gmail message object into a FLOW CommunicationItem.
 */
function normalizeMessage(msg, options = {}) {
  const headers     = msg.payload?.headers || [];
  const labelIds    = msg.labelIds || [];
  const isUnread    = labelIds.includes('UNREAD');
  const isImportant = labelIds.includes('IMPORTANT');

  const folder = labelIds.includes('INBOX') ? 'INBOX'
               : labelIds.includes('SENT')  ? 'SENT'
               : labelIds.includes('DRAFT') ? 'DRAFT'
               : labelIds.includes('TRASH') ? 'TRASH'
               : 'OTHER';

  const { body, bodyHtml, attachments } = options.format === 'metadata'
    ? { body: msg.snippet || '', bodyHtml: null, attachments: [] }
    : extractEmailParts(msg.payload || {});

  const dateStr   = extractHeader(headers, 'date');
  const timestamp = dateStr ? new Date(dateStr).toISOString() : new Date().toISOString();

  return createCommunicationItem({
    id:           msg.id,
    connector:    'gmail',
    title:        extractHeader(headers, 'subject') || '(no subject)',
    sender:       extractHeader(headers, 'from'),
    recipients: [
      ...parseAddressList(extractHeader(headers, 'to')),
      ...parseAddressList(extractHeader(headers, 'cc')),
    ],
    body,
    bodyHtml,
    threadId:     msg.threadId,
    threadLength: options.threadLength || 1,
    labels:       labelIds,
    attachments,
    timestamp,
    priority:     isImportant ? 'P1' : 'P2',
    read:         !isUnread,
    folder,
    metadata: {
      snippet:   msg.snippet || '',
      messageId: extractHeader(headers, 'message-id'),
      inReplyTo: extractHeader(headers, 'in-reply-to'),
      references: extractHeader(headers, 'references'),
      cc:        parseAddressList(extractHeader(headers, 'cc')),
      bcc:       parseAddressList(extractHeader(headers, 'bcc')),
    },
  });
}

/**
 * Build an RFC 2822 MIME email and return a base64url-encoded raw string
 * ready for the Gmail API.
 */
function buildRawEmail({ from, to, cc, bcc, subject, body, bodyHtml, inReplyTo, references }) {
  const toStr  = Array.isArray(to)  ? to.join(', ')  : (to  || '');
  const ccStr  = Array.isArray(cc)  ? cc.join(', ')  : (cc  || '');
  const bccStr = Array.isArray(bcc) ? bcc.join(', ') : (bcc || '');

  const headers = [
    from    ? `From: ${from}`       : null,
    toStr   ? `To: ${toStr}`        : null,
    ccStr   ? `Cc: ${ccStr}`        : null,
    bccStr  ? `Bcc: ${bccStr}`      : null,
    `Subject: ${subject || '(no subject)'}`,
    inReplyTo  ? `In-Reply-To: ${inReplyTo}` : null,
    references ? `References: ${references}`  : null,
    'MIME-Version: 1.0',
  ].filter(Boolean);

  let mimeBody;
  if (bodyHtml) {
    const boundary = `----=_FLOW_${Date.now()}`;
    headers.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);
    mimeBody = [
      `--${boundary}`,
      'Content-Type: text/plain; charset=UTF-8',
      'Content-Transfer-Encoding: base64',
      '',
      Buffer.from(body || stripHtml(bodyHtml)).toString('base64'),
      `--${boundary}`,
      'Content-Type: text/html; charset=UTF-8',
      'Content-Transfer-Encoding: base64',
      '',
      Buffer.from(bodyHtml).toString('base64'),
      `--${boundary}--`,
    ].join('\r\n');
  } else {
    headers.push('Content-Type: text/plain; charset=UTF-8');
    headers.push('Content-Transfer-Encoding: base64');
    mimeBody = Buffer.from(body || '').toString('base64');
  }

  const raw = headers.join('\r\n') + '\r\n\r\n' + mimeBody;
  return base64UrlEncode(raw);
}

// ─── GmailAdapter ─────────────────────────────────────────────────────────────

export class GmailAdapter extends BaseAdapter {
  constructor() {
    super({
      id:               'gmail',
      name:             'Gmail',
      capability:       Capability.COMMUNICATION,
      authStrategy:     AuthStrategy.OAUTH2,
      supportedActions: [
        ActionType.READ,
        ActionType.SEARCH,
        ActionType.SEND,
        ActionType.CREATE,
        ActionType.UPDATE,
        ActionType.SYNC,
      ],
      scopes:  GMAIL_SCOPES,
      version: '1.0.0',
    });
  }

  // ── OAuth: generate consent URL ────────────────────────────────────────────

  async authenticate(workspaceId, { callbackUrl } = {}) {
    const { authUrl } = getAuthUrl(workspaceId, { redirectUri: callbackUrl, scopes: GMAIL_SCOPES });
    return { authUrl, strategy: 'oauth2', connector: this.id };
  }

  // ── OAuth: exchange code for tokens ───────────────────────────────────────

  async handleAuthCallback(workspaceId, code, { callbackUrl } = {}) {
    const oauth2Client = this._getOAuth2Client(callbackUrl);
    try {
      const { tokens } = await oauth2Client.getToken(code);
      await saveTokens(workspaceId, tokens);
      return tokens;
    } catch (err) {
      throw new AppError(
        `Gmail OAuth token exchange failed: ${err.message}`,
        502,
        'OAUTH_EXCHANGE_FAILED'
      );
    }
  }

  // ── Execution dispatch (called by ExecutionEngine) ─────────────────────────

  async execute(workspaceId, actionType, payload = {}, approvedBy) {
    try {
      switch (actionType) {
        case ActionType.READ:
          return await this._read(workspaceId, payload);
        case ActionType.SEARCH:
          return await this._searchMessages(workspaceId, payload.query || '', payload);
        case ActionType.SEND:
          return await this._send(workspaceId, payload, approvedBy);
        case ActionType.CREATE:
          return await this._createDraft(workspaceId, payload);
        case ActionType.UPDATE:
          return await this._update(workspaceId, payload);
        case ActionType.SYNC:
          return await this._syncInbox(workspaceId, payload);
        case ActionType.EXECUTE:
          return await this._execute(workspaceId, payload);
        default:
          throw new AppError(`Gmail adapter does not support action "${actionType}"`, 501, 'UNSUPPORTED_ACTION');
      }
    } catch (err) {
      throw mapGmailError(err);
    }
  }

  // ── EXECUTE sub-actions (schedule_email, follow_up) ───────────────────────

  async _execute(workspaceId, payload) {
    switch (payload.action) {
      case 'schedule_email': return this._scheduleEmail(workspaceId, payload);
      case 'follow_up':      return this._setFollowUp(workspaceId, payload);
      default:
        throw new AppError(`GmailAdapter: unknown execute action "${payload.action}"`, 400, 'UNSUPPORTED_EXECUTE_ACTION');
    }
  }

  async _scheduleEmail(workspaceId, payload) {
    if (!payload.scheduledAt) throw new ValidationError('scheduledAt is required for schedule_email');

    // Create draft — actual delivery at scheduledAt is handled externally (BullMQ delay or Calendar trigger)
    const draft = await this._createDraft(workspaceId, payload);
    return {
      ...draft,
      scheduledAt: payload.scheduledAt,
      status: 'scheduled',
    };
  }

  async _setFollowUp(workspaceId, payload) {
    if (!payload.messageId) throw new ValidationError('messageId is required for follow_up');
    const { gmail } = await this._getClient(workspaceId);

    const addLabelIds = ['STARRED'];
    // Best-effort: look up or create a "Follow-Up" user label
    try {
      const labelsRes = await gmail.users.labels.list({ userId: 'me' });
      const followUpLabel = (labelsRes.data.labels || []).find(
        l => l.name === (payload.followUpLabel || 'Follow-Up')
      );
      if (followUpLabel) addLabelIds.push(followUpLabel.id);
    } catch {
      // Non-fatal — STARRED alone is enough
    }

    await gmail.users.messages.modify({
      userId:      'me',
      id:          payload.messageId,
      requestBody: { addLabelIds },
    });

    return { messageId: payload.messageId, addLabelIds, status: 'follow_up_set' };
  }

  // ── Universal search interface (called by SearchOrchestrator) ─────────────

  async search(workspaceId, query, { limit = 20 } = {}) {
    const results = await this._searchMessages(workspaceId, query, { limit });
    return results.map(item =>
      createSearchResult({
        id:         item.id,
        connector:  'gmail',
        capability: Capability.COMMUNICATION,
        type:       'communication_item',
        title:      item.title,
        excerpt:    (item.body || item.metadata?.snippet || '').slice(0, 250),
        score:      0.85,
        timestamp:  item.timestamp,
        metadata:   { threadId: item.threadId, sender: item.sender, labels: item.labels },
      })
    );
  }

  // ── Health check ───────────────────────────────────────────────────────────

  async healthCheck(workspaceId) {
    const start = Date.now();
    try {
      const { gmail } = await this._getClient(workspaceId);
      const profile   = await gmail.users.getProfile({ userId: 'me' });
      return {
        status:    'HEALTHY',
        latencyMs: Date.now() - start,
        detail: {
          email:          profile.data.emailAddress,
          messagesTotal:  profile.data.messagesTotal,
          threadsTotal:   profile.data.threadsTotal,
        },
      };
    } catch (err) {
      return {
        status:    err.code === 401 ? 'AUTH_REQUIRED' : 'DOWN',
        latencyMs: Date.now() - start,
        detail:    err.message,
      };
    }
  }

  // ── Private: read dispatcher ───────────────────────────────────────────────

  async _read(workspaceId, payload) {
    if (payload.threadId) return this._readThread(workspaceId, payload);
    if (payload.messageId) return this._readMessage(workspaceId, payload);
    if (payload.action === 'list_labels') return this._listLabels(workspaceId);
    return this._readInbox(workspaceId, payload);
  }

  // ── Private: inbox listing (metadata format for speed) ────────────────────

  async _readInbox(workspaceId, { folder = 'INBOX', limit = 20, pageToken, q } = {}) {
    const { gmail } = await this._getClient(workspaceId);
    const limit_   = Math.min(Number(limit) || 20, 50);

    const listRes = await gmail.users.messages.list({
      userId:     'me',
      labelIds:   [folder],
      maxResults: limit_,
      pageToken:  pageToken || undefined,
      q:          q || undefined,
    });

    const msgRefs = listRes.data.messages || [];
    if (!msgRefs.length) return { items: [], nextPageToken: null, total: 0 };

    const items = await Promise.all(
      msgRefs.map(ref =>
        gmail.users.messages.get({
          userId:          'me',
          id:              ref.id,
          format:          'metadata',
          metadataHeaders: ['From', 'To', 'Cc', 'Subject', 'Date', 'Message-ID', 'In-Reply-To'],
        }).then(r => normalizeMessage(r.data, { format: 'metadata' }))
      )
    );

    return {
      items,
      nextPageToken: listRes.data.nextPageToken || null,
      total:         listRes.data.resultSizeEstimate || items.length,
    };
  }

  // ── Private: full thread ───────────────────────────────────────────────────

  async _readThread(workspaceId, { threadId } = {}) {
    if (!threadId) throw new ValidationError('threadId is required');
    const { gmail } = await this._getClient(workspaceId);

    const threadRes = await gmail.users.threads.get({ userId: 'me', id: threadId, format: 'full' });
    const messages  = threadRes.data.messages || [];

    return {
      threadId,
      subject:  messages[0]
        ? extractHeader(messages[0].payload?.headers || [], 'subject')
        : '',
      messages: messages.map((m, i) =>
        normalizeMessage(m, { threadLength: messages.length, format: 'full' })
      ),
    };
  }

  // ── Private: single message (full body) ───────────────────────────────────

  async _readMessage(workspaceId, { messageId } = {}) {
    if (!messageId) throw new ValidationError('messageId is required');
    const { gmail } = await this._getClient(workspaceId);

    const res = await gmail.users.messages.get({ userId: 'me', id: messageId, format: 'full' });
    return normalizeMessage(res.data, { format: 'full' });
  }

  // ── Private: label list ────────────────────────────────────────────────────

  async _listLabels(workspaceId) {
    const { gmail } = await this._getClient(workspaceId);
    const res = await gmail.users.labels.list({ userId: 'me' });
    return (res.data.labels || []).map(l => ({
      id:         l.id,
      name:       l.name,
      type:       l.type,
      messageListVisibility: l.messageListVisibility,
    }));
  }

  // ── Private: send / reply / reply-all / forward ───────────────────────────

  async _send(workspaceId, payload, approvedBy) {
    const { gmail, oauth2Client } = await this._getClient(workspaceId);
    const profile = await gmail.users.getProfile({ userId: 'me' });
    const from    = profile.data.emailAddress;

    if (payload.forward) return this._forward(workspaceId, payload, from, gmail);
    if (payload.inReplyTo) return this._reply(workspaceId, payload, from, gmail);

    // Fresh send
    const raw = buildRawEmail({
      from,
      to:       payload.to,
      cc:       payload.cc,
      bcc:      payload.bcc,
      subject:  payload.subject,
      body:     payload.body,
      bodyHtml: payload.bodyHtml,
    });

    const res = await gmail.users.messages.send({
      userId:      'me',
      requestBody: { raw },
    });

    return { messageId: res.data.id, threadId: res.data.threadId, status: 'sent', approvedBy };
  }

  async _reply(workspaceId, payload, from, gmail) {
    // Fetch original to get References chain and subject
    const original = await gmail.users.messages.get({
      userId: 'me', id: payload.inReplyTo, format: 'metadata',
      metadataHeaders: ['From', 'To', 'Cc', 'Subject', 'Message-ID', 'References'],
    });
    const origHeaders = original.data.payload?.headers || [];

    const origSubject   = extractHeader(origHeaders, 'subject');
    const origMessageId = extractHeader(origHeaders, 'message-id');
    const origRefs      = extractHeader(origHeaders, 'references');
    const origFrom      = extractHeader(origHeaders, 'from');
    const origTo        = extractHeader(origHeaders, 'to');
    const origCc        = extractHeader(origHeaders, 'cc');

    const references = [origRefs, origMessageId].filter(Boolean).join(' ').trim();

    let to = payload.to;
    if (!to) {
      // Default reply: back to the sender
      const sender = parseAddressList(origFrom);
      to = sender.map(a => a.address).join(', ');
    }

    // Reply-all: include original To + Cc, remove self
    let cc = payload.cc;
    if (payload.replyAll && !cc) {
      const allRecipients = [
        ...parseAddressList(origTo),
        ...parseAddressList(origCc),
      ].filter(a => a.address !== from);
      cc = allRecipients.map(a => a.address).join(', ') || undefined;
    }

    const subject = origSubject.startsWith('Re:')
      ? origSubject
      : `Re: ${origSubject}`;

    const raw = buildRawEmail({
      from,
      to,
      cc,
      subject,
      body:       payload.body,
      bodyHtml:   payload.bodyHtml,
      inReplyTo:  origMessageId,
      references,
    });

    const res = await gmail.users.messages.send({
      userId:      'me',
      requestBody: { raw, threadId: original.data.threadId },
    });

    return {
      messageId: res.data.id,
      threadId:  res.data.threadId,
      status:    payload.replyAll ? 'reply_all_sent' : 'reply_sent',
    };
  }

  async _forward(workspaceId, payload, from, gmail) {
    if (!payload.forwardMessageId) throw new ValidationError('forwardMessageId is required');
    if (!payload.to) throw new ValidationError('to is required for forward');

    const original = await gmail.users.messages.get({
      userId: 'me', id: payload.forwardMessageId, format: 'full',
    });
    const origHeaders = original.data.payload?.headers || [];
    const origSubject = extractHeader(origHeaders, 'subject');
    const origFrom    = extractHeader(origHeaders, 'from');
    const origDate    = extractHeader(origHeaders, 'date');
    const { body: origBody } = extractEmailParts(original.data.payload || {});

    const subject = origSubject.startsWith('Fwd:') ? origSubject : `Fwd: ${origSubject}`;
    const forwardedHeader = `\n\n---------- Forwarded message ---------\nFrom: ${origFrom}\nDate: ${origDate}\nSubject: ${origSubject}\n\n`;
    const body = (payload.body || '') + forwardedHeader + origBody;

    const raw = buildRawEmail({ from, to: payload.to, cc: payload.cc, subject, body });

    const res = await gmail.users.messages.send({ userId: 'me', requestBody: { raw } });
    return { messageId: res.data.id, threadId: res.data.threadId, status: 'forwarded' };
  }

  // ── Private: create draft ──────────────────────────────────────────────────

  async _createDraft(workspaceId, payload) {
    const { gmail } = await this._getClient(workspaceId);
    const profile   = await gmail.users.getProfile({ userId: 'me' });
    const from      = profile.data.emailAddress;

    const raw = buildRawEmail({
      from,
      to:       payload.to,
      cc:       payload.cc,
      subject:  payload.subject,
      body:     payload.body,
      bodyHtml: payload.bodyHtml,
    });

    const res = await gmail.users.drafts.create({
      userId:      'me',
      requestBody: { message: { raw } },
    });

    return { draftId: res.data.id, messageId: res.data.message?.id, status: 'draft_created' };
  }

  // ── Private: update (labels, archive, mark read/unread) ───────────────────

  async _update(workspaceId, payload) {
    if (!payload.messageId && !payload.threadId) {
      throw new ValidationError('messageId or threadId is required for update');
    }
    const { gmail } = await this._getClient(workspaceId);

    let addLabelIds    = payload.addLabels    || [];
    let removeLabelIds = payload.removeLabels || [];

    if (payload.action === 'archive') {
      removeLabelIds = [...new Set([...removeLabelIds, 'INBOX'])];
    }
    if (payload.action === 'markRead') {
      removeLabelIds = [...new Set([...removeLabelIds, 'UNREAD'])];
    }
    if (payload.action === 'markUnread') {
      addLabelIds = [...new Set([...addLabelIds, 'UNREAD'])];
    }

    if (payload.threadId) {
      await gmail.users.threads.modify({
        userId:      'me',
        id:          payload.threadId,
        requestBody: { addLabelIds, removeLabelIds },
      });
      return { threadId: payload.threadId, addLabelIds, removeLabelIds, status: 'updated' };
    }

    await gmail.users.messages.modify({
      userId:      'me',
      id:          payload.messageId,
      requestBody: { addLabelIds, removeLabelIds },
    });
    return { messageId: payload.messageId, addLabelIds, removeLabelIds, status: 'updated' };
  }

  // ── Private: search ────────────────────────────────────────────────────────

  async _searchMessages(workspaceId, query, { limit = 20 } = {}) {
    if (!query?.trim()) return [];
    const { gmail } = await this._getClient(workspaceId);
    const limit_    = Math.min(Number(limit) || 20, 50);

    const listRes = await gmail.users.messages.list({
      userId:     'me',
      q:          query,
      maxResults: limit_,
    });

    const msgRefs = listRes.data.messages || [];
    if (!msgRefs.length) return [];

    const items = await Promise.all(
      msgRefs.map(ref =>
        gmail.users.messages.get({
          userId:          'me',
          id:              ref.id,
          format:          'metadata',
          metadataHeaders: ['From', 'To', 'Subject', 'Date'],
        }).then(r => normalizeMessage(r.data, { format: 'metadata' }))
      )
    );

    return items;
  }

  // ── Private: sync inbox to ingestion pipeline ──────────────────────────────

  async _syncInbox(workspaceId, { limit = 25, q = 'is:unread', markRead = false } = {}) {
    const { gmail } = await this._getClient(workspaceId);
    const { ingestionQueue } = await import('../../config/queue.js');
    const { isResourceIdAllowed } = await import('../../core/governance/integrationPermissions/index.js');

    const listRes = await gmail.users.messages.list({
      userId:     'me',
      q,
      maxResults: Math.min(Number(limit) || 25, 50),
    });

    const msgRefs = listRes.data.messages || [];
    let synced = 0;
    let errors = 0;
    let blocked = 0;

    for (const ref of msgRefs) {
      try {
        const msgRes = await gmail.users.messages.get({
          userId: 'me', id: ref.id, format: 'full',
        });

        // Integration Permissions: a message is readable only if one of its Gmail
        // labels is authorized. Blocked messages are dropped before the queue.
        const verdict = await isResourceIdAllowed(
          workspaceId, 'gmail', 'label', msgRes.data.labelIds || [],
        );
        if (!verdict.allowed) {
          blocked++;
          continue;
        }

        const normalized = normalizeMessage(msgRes.data, { format: 'full' });

        await ingestionQueue.add('new-intel', {
          workspaceId,
          platform: 'gmail',
          sender:   normalized.sender,
          channel:  `GMAIL: ${normalized.title}`,
          text:     normalized.body || normalized.metadata?.snippet || '(empty)',
        });

        if (markRead) {
          await gmail.users.messages.modify({
            userId:      'me',
            id:          ref.id,
            requestBody: { removeLabelIds: ['UNREAD'] },
          }).catch(() => {});
        }

        synced++;
      } catch {
        errors++;
      }
    }

    return { synced, errors, blocked, total: msgRefs.length };
  }

  // ── Private: credential resolution + auto-refresh ─────────────────────────

  _getOAuth2Client(redirectUri) {
    const clientId     = process.env.GOOGLE_CLIENT_ID     || process.env.GMAIL_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET || process.env.GMAIL_CLIENT_SECRET;
    const redirect     = redirectUri
      || process.env.GOOGLE_REDIRECT_URI
      || process.env.GMAIL_REDIRECT_URI
      || `${process.env.GOOGLE_REDIRECT_BASE || `http://localhost:${process.env.PORT || 5001}`}/api/communication/oauth/callback`;

    if (!clientId || !clientSecret) {
      throw new AppError(
        'Gmail OAuth is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.',
        503,
        'GMAIL_NOT_CONFIGURED'
      );
    }

    return new google.auth.OAuth2(clientId, clientSecret, redirect);
  }

  async _getClient(workspaceId) {
    const tokens = await loadTokens(workspaceId);
    if (!tokens) {
      throw new ConnectorAuthError(this.id, `No OAuth tokens found for workspace "${workspaceId}". Connect Gmail first.`);
    }

    const oauth2Client = this._getOAuth2Client();
    oauth2Client.setCredentials(tokens);

    // Proactively refresh if access token is expired or will expire in the next 60s.
    const isExpired = !tokens.access_token || (tokens.expiry_date && tokens.expiry_date < Date.now() + 60_000);
    if (isExpired && tokens.refresh_token) {
      try {
        const { credentials } = await oauth2Client.refreshAccessToken();
        const merged = { ...tokens, ...credentials };
        await saveTokens(workspaceId, merged);
        oauth2Client.setCredentials(merged);
      } catch (refreshErr) {
        // Clear broken tokens so workspace-state shows "disconnected" and user sees Connect button
        await clearTokens(workspaceId).catch(() => {});
        const msg = refreshErr.message || '';
        if (msg.includes('invalid_client')) {
          throw new AppError(
            'Google OAuth credentials are misconfigured. Check GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env.',
            503, 'OAUTH_CREDENTIALS_INVALID',
          );
        }
        throw new AppError('Gmail authentication expired. Click Connect to re-authorize.', 401, 'CONNECTOR_AUTH_EXPIRED');
      }
    }

    // Auto-refresh: when googleapis silently gets new tokens mid-request, persist them
    oauth2Client.on('tokens', newTokens => {
      saveTokens(workspaceId, { ...tokens, ...newTokens }).catch(() => {});
    });

    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
    return { gmail, oauth2Client };
  }
}

export default new GmailAdapter();
