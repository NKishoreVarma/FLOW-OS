/**
 * FLOW OS — Google Calendar Adapter
 *
 * Meeting Capability — first provider.
 * Future providers (Outlook Calendar, Zoom, Teams) extend the same route surface.
 *
 * All meeting data is normalized to createMeeting() before leaving this file.
 * FLOW metadata (notes, action items, AI summary) is stored in
 * event.extendedProperties.private so it persists on the calendar event.
 */

import { google }                           from 'googleapis';
import { BaseAdapter }                       from '../BaseAdapter.js';
import { Capability, ActionType, AuthStrategy } from '../capabilities.js';
import { createMeeting, createSearchResult } from '../normalizedTypes.js';
import { loadTokens, saveTokens } from '../../services/google/GoogleTokenManager.js';
import { getAuthUrl } from '../../services/google/GoogleOAuthService.js';
import { AppError, ValidationError }         from '../../core/errors/index.js';
import { EntityTypes, registerEntity, linkEntities } from '../../services/knowledgeGraphService.js';

const CALENDAR_SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.readonly',
];

// ─── Normalizer ───────────────────────────────────────────────────────────────

function computeDurationMinutes(start, end) {
  if (!start || !end) return null;
  const s = new Date(start.dateTime || start.date).getTime();
  const e = new Date(end.dateTime || end.date).getTime();
  return Math.round((e - s) / 60000);
}

function normalizeEvent(event) {
  const priv = event.extendedProperties?.private || {};

  let actions = [];
  try { if (priv.flow_actions) actions = JSON.parse(priv.flow_actions); } catch {}

  return createMeeting({
    id:           event.id,
    connector:    'google-calendar',
    title:        event.summary || 'Untitled',
    organizer:    event.organizer?.email || '',
    participants: (event.attendees || []).map(a => ({
      name:  a.displayName || a.email?.split('@')[0] || a.email,
      email: a.email,
      rsvp:  a.responseStatus || 'needsAction',
    })),
    startTime:  event.start?.dateTime || event.start?.date || null,
    endTime:    event.end?.dateTime   || event.end?.date   || null,
    duration:   computeDurationMinutes(event.start, event.end),
    location:   event.location || event.hangoutLink || null,
    agenda:     event.description || null,
    notes:      priv.flow_notes  || null,
    videoUrl:   event.hangoutLink
              || event.conferenceData?.entryPoints?.[0]?.uri
              || null,
    timestamp: event.created || new Date().toISOString(),
    metadata: {
      htmlLink:          event.htmlLink,
      status:            event.status,
      created:           event.created,
      updated:           event.updated,
      recurringEventId:  event.recurringEventId || null,
      actions,
      meetingSummary:    priv.flow_summary || null,
    },
  });
}

// ─── Adapter ──────────────────────────────────────────────────────────────────

class GoogleCalendarAdapter extends BaseAdapter {
  constructor() {
    super({
      id:               'google-calendar',
      name:             'Google Calendar',
      capability:       Capability.MEETINGS,
      authStrategy:     AuthStrategy.OAUTH2,
      supportedActions: [
        ActionType.READ,
        ActionType.SEARCH,
        ActionType.CREATE,
        ActionType.UPDATE,
        ActionType.DELETE,
        ActionType.SYNC,
      ],
      scopes:  CALENDAR_SCOPES,
      version: '1.0.0',
    });
  }

  // ── OAuth ─────────────────────────────────────────────────────────────────

  async authenticate(workspaceId, { callbackUrl }) {
    const { authUrl } = getAuthUrl(workspaceId, { redirectUri: callbackUrl, scopes: CALENDAR_SCOPES });
    return { authUrl };
  }

  async handleAuthCallback(workspaceId, code, { callbackUrl } = {}) {
    const oauth2Client = this._getOAuth2Client(callbackUrl);
    const { tokens } = await oauth2Client.getToken(code);
    await saveTokens(workspaceId, tokens);
    return tokens;
  }

  // ── Execution Engine dispatch ──────────────────────────────────────────────

  async execute(workspaceId, actionType, payload = {}) {
    switch (actionType) {
      case ActionType.READ:   return this._read(workspaceId, payload);
      case ActionType.SEARCH: return this._searchEvents(workspaceId, payload.query || '', { limit: payload.limit });
      case ActionType.CREATE: return this._createEvent(workspaceId, payload);
      case ActionType.UPDATE: return this._updateEvent(workspaceId, payload);
      case ActionType.DELETE: return this._deleteEvent(workspaceId, payload);
      case ActionType.SYNC:   return this._syncEvents(workspaceId, payload);
      default:
        throw new AppError(`GoogleCalendarAdapter: unknown action "${actionType}"`, 400);
    }
  }

  // ── SearchOrchestrator integration ────────────────────────────────────────

  async search(workspaceId, query, { limit = 10 } = {}) {
    const events = await this._searchEvents(workspaceId, query, { limit });
    return events.map(event => createSearchResult({
      id:         event.id,
      connector:  this.id,
      capability: this.capability,
      type:       'meeting',
      title:      event.title,
      excerpt:    [
        event.organizer,
        event.startTime ? new Date(event.startTime).toLocaleDateString() : '',
      ].filter(Boolean).join(' · '),
      score:     0.8,
      timestamp: event.startTime,
      url:       event.metadata?.htmlLink || null,
      metadata:  { participantCount: event.participants?.length || 0 },
    }));
  }

  async healthCheck(workspaceId) {
    const clientId     = process.env.GOOGLE_CLIENT_ID     || process.env.GMAIL_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET || process.env.GMAIL_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      return { status: 'DOWN', detail: 'GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET not configured' };
    }
    try {
      const { calendar } = await this._getClient(workspaceId);
      const t0 = Date.now();
      await calendar.calendarList.list({ maxResults: 1 });
      return { status: 'HEALTHY', latencyMs: Date.now() - t0 };
    } catch (err) {
      if (err.code === 'CONNECTOR_AUTH_ERROR' || err.statusCode === 401) {
        return { status: 'DEGRADED', detail: 'Calendar not authenticated for this workspace' };
      }
      return { status: 'DOWN', detail: err.message };
    }
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  _getOAuth2Client(redirectUri) {
    const clientId     = process.env.GOOGLE_CLIENT_ID     || process.env.GMAIL_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET || process.env.GMAIL_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      throw new AppError(
        'Google Calendar is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.',
        503,
        'GOOGLE_CALENDAR_NOT_CONFIGURED'
      );
    }
    return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
  }

  async _getClient(workspaceId) {
    const tokens = await loadTokens(workspaceId);
    if (!tokens) {
      throw new AppError(
        `Google Calendar not authenticated for workspace "${workspaceId}". Connect Google at /api/google/auth.`,
        401,
        'CONNECTOR_AUTH_ERROR'
      );
    }
    const oauth2Client = this._getOAuth2Client();
    oauth2Client.setCredentials(tokens);
    oauth2Client.on('tokens', newTokens => {
      saveTokens(workspaceId, { ...tokens, ...newTokens }).catch(() => {});
    });
    return { calendar: google.calendar({ version: 'v3', auth: oauth2Client }), oauth2Client };
  }

  async _read(workspaceId, payload) {
    if (payload.eventId) return this._readEvent(workspaceId, payload);
    if (payload.past)    return this._readPast(workspaceId, payload);
    return this._readUpcoming(workspaceId, payload);
  }

  async _readUpcoming(workspaceId, { days = 7, limit = 20 } = {}) {
    const { calendar } = await this._getClient(workspaceId);
    const now    = new Date();
    const future = new Date(now.getTime() + days * 24 * 3600 * 1000);
    const res = await calendar.events.list({
      calendarId:   'primary',
      timeMin:      now.toISOString(),
      timeMax:      future.toISOString(),
      maxResults:   limit,
      singleEvents: true,
      orderBy:      'startTime',
    });
    return (res.data.items || []).map(normalizeEvent);
  }

  async _readPast(workspaceId, { days = 30, limit = 20 } = {}) {
    const { calendar } = await this._getClient(workspaceId);
    const now  = new Date();
    const past = new Date(now.getTime() - days * 24 * 3600 * 1000);
    const res = await calendar.events.list({
      calendarId:   'primary',
      timeMax:      now.toISOString(),
      timeMin:      past.toISOString(),
      maxResults:   limit,
      singleEvents: true,
      orderBy:      'startTime',
    });
    // Most-recent first
    return (res.data.items || []).reverse().map(normalizeEvent);
  }

  async _readEvent(workspaceId, { eventId }) {
    const { calendar } = await this._getClient(workspaceId);
    const res = await calendar.events.get({ calendarId: 'primary', eventId });
    return normalizeEvent(res.data);
  }

  async _createEvent(workspaceId, payload) {
    const { calendar } = await this._getClient(workspaceId);
    const { title, startTime, endTime, description, attendees = [], location, videoConference } = payload;

    if (!title)     throw new ValidationError('title is required');
    if (!startTime) throw new ValidationError('startTime is required');
    if (!endTime)   throw new ValidationError('endTime is required');

    const body = {
      summary:     title,
      description: description || '',
      start:       { dateTime: new Date(startTime).toISOString() },
      end:         { dateTime: new Date(endTime).toISOString()   },
      attendees:   attendees.map(a => ({ email: typeof a === 'string' ? a : a.email })),
    };
    if (location)       body.location = location;
    if (videoConference) {
      body.conferenceData = {
        createRequest: {
          requestId:             `flow-${Date.now()}`,
          conferenceSolutionKey: { type: 'hangoutsMeet' },
        },
      };
    }

    const res = await calendar.events.insert({
      calendarId:            'primary',
      resource:              body,
      conferenceDataVersion: videoConference ? 1 : 0,
    });
    return normalizeEvent(res.data);
  }

  async _updateEvent(workspaceId, payload) {
    const { calendar } = await this._getClient(workspaceId);
    const { eventId, title, description, notes, actions, meetingSummary, startTime, endTime } = payload;
    if (!eventId) throw new ValidationError('eventId is required');

    const current = await calendar.events.get({ calendarId: 'primary', eventId });
    const existingPriv = current.data.extendedProperties?.private || {};

    const patch = {};
    if (title       !== undefined) patch.summary     = title;
    if (description !== undefined) patch.description = description;
    if (startTime   !== undefined) patch.start       = { dateTime: new Date(startTime).toISOString() };
    if (endTime     !== undefined) patch.end         = { dateTime: new Date(endTime).toISOString()   };

    const newPriv = { ...existingPriv };
    if (notes          !== undefined) newPriv.flow_notes   = notes;
    if (actions        !== undefined) newPriv.flow_actions  = JSON.stringify(actions);
    if (meetingSummary !== undefined) newPriv.flow_summary  = meetingSummary;

    if (Object.keys(newPriv).length) {
      patch.extendedProperties = {
        private: newPriv,
        shared:  current.data.extendedProperties?.shared || {},
      };
    }

    const res = await calendar.events.patch({ calendarId: 'primary', eventId, resource: patch });
    return normalizeEvent(res.data);
  }

  async _deleteEvent(workspaceId, { eventId }) {
    if (!eventId) throw new ValidationError('eventId is required');
    const { calendar } = await this._getClient(workspaceId);
    await calendar.events.delete({ calendarId: 'primary', eventId });
    return { deleted: true, eventId };
  }

  async _searchEvents(workspaceId, query, { limit = 20 } = {}) {
    const { calendar } = await this._getClient(workspaceId);
    const now     = new Date();
    const timeMin = new Date(now.getTime() - 90 * 24 * 3600 * 1000).toISOString();
    const timeMax = new Date(now.getTime() + 90 * 24 * 3600 * 1000).toISOString();
    const res = await calendar.events.list({
      calendarId:   'primary',
      q:            query,
      timeMin,
      timeMax,
      maxResults:   limit,
      singleEvents: true,
      orderBy:      'startTime',
    });
    return (res.data.items || []).map(normalizeEvent);
  }

  async _syncEvents(workspaceId, { days = 7, limit = 50 } = {}) {
    // Integration Permissions: this adapter reads the primary calendar only, so
    // one check governs the whole sync.
    const { isResourceIdAllowed } = await import('../../core/governance/integrationPermissions/index.js');
    const verdict = await isResourceIdAllowed(workspaceId, 'google-calendar', 'calendar', 'primary');
    if (!verdict.allowed) {
      return { synced: 0, errors: 0, blocked: true };
    }

    const events = await this._readUpcoming(workspaceId, { days, limit });
    // Lazy import avoids circular dep between adapters and queue
    const { ingestionQueue } = await import('../../config/queue.js');
    let synced = 0;
    let errors = 0;

    for (const event of events) {
      try {
        const attendeeList = event.participants.map(p => p.email).filter(Boolean).join(', ');
        const text = [
          `Calendar Event: ${event.title}`,
          event.startTime ? `Start: ${new Date(event.startTime).toLocaleString()}` : '',
          event.endTime   ? `End: ${new Date(event.endTime).toLocaleString()}`   : '',
          attendeeList    ? `Attendees: ${attendeeList}` : '',
          event.agenda    ? `Agenda: ${event.agenda}`    : '',
          event.location  ? `Location: ${event.location}` : '',
        ].filter(Boolean).join('\n');

        // Register in Knowledge Graph
        registerEntity(`E_${event.id}`, EntityTypes.EVENT, event.title);
        for (const p of event.participants) {
          if (p.email) {
            const uid = `U_${p.email}`;
            registerEntity(uid, EntityTypes.USER, p.name || p.email);
            linkEntities(uid, `E_${event.id}`, 'ATTENDING');
          }
        }

        await ingestionQueue.add('new-intel', {
          workspaceId,
          platform: 'google-calendar',
          sender:   event.organizer || 'Google Calendar',
          channel:  `CALENDAR: ${event.title}`,
          text,
        });
        synced++;
      } catch (err) {
        console.error(`[GoogleCalendarAdapter] Sync error for event ${event.id}:`, err.message);
        errors++;
      }
    }

    return { synced, errors };
  }
}

export default new GoogleCalendarAdapter();
