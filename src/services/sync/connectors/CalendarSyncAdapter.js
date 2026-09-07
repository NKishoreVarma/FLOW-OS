/**
 * CalendarSyncAdapter — incremental sync for Google Calendar resource types.
 *
 * Resource types:  events | invites
 * Auth:            Google OAuth via GoogleOAuthService.getOAuth2Client()
 * Cursor format:   Google Calendar sync token (returned by list API)
 *                  Falls back to timeMin window when sync token is expired/missing.
 * ETag:            event etag from the API
 */

import { google }         from 'googleapis';
import { getOAuth2Client } from '../../google/GoogleOAuthService.js';
import { getAllowedResourceIds } from '../../../core/governance/integrationPermissions/permissionGate.js';

const MAX_RESULTS = 100;

async function _calendar(workspaceId) {
  const auth = await getOAuth2Client(workspaceId);
  if (!auth) throw new Error('Google Calendar not connected for this workspace');
  return google.calendar({ version: 'v3', auth });
}

// ── Calendar selection + cursor ───────────────────────────────────────────────

/**
 * Which calendars this workspace has authorized FLOW to read.
 *
 * Returns ['primary'] when the connector is not yet governed (legacy), preserving
 * the previous behaviour. An empty array means the admin has allowed no calendars
 * — we then fetch nothing at all rather than fetching and discarding.
 */
async function _targetCalendars(workspaceId) {
  const allowed = await getAllowedResourceIds(workspaceId, 'google-calendar', 'calendar');
  if (allowed === null) return ['primary'];
  return allowed;
}

/**
 * Cursor is a per-calendar sync-token map, serialized as JSON.
 * Legacy cursors were a bare token/ISO string for the primary calendar.
 */
function _parseCursor(cursor) {
  if (!cursor) return {};
  if (cursor.startsWith('{')) {
    try { return JSON.parse(cursor); } catch { return {}; }
  }
  return { primary: cursor };
}

// ── Events ────────────────────────────────────────────────────────────────────

async function syncEvents(workspaceId, cursor) {
  const cal        = await _calendar(workspaceId);
  const calendars  = await _targetCalendars(workspaceId);
  const cursorMap  = _parseCursor(cursor);
  const nextCursor = { ...cursorMap };
  const items      = [];

  for (const calendarId of calendars) {
    const calCursor = cursorMap[calendarId] || null;

    try {
      items.push(...await _syncOneCalendar(cal, calendarId, calCursor, nextCursor));
    } catch (err) {
      // One inaccessible calendar (revoked share, deleted) must not fail the run.
      if (err.code === 404 || err.code === 403) continue;
      throw err;
    }
  }

  return { items: items.filter(Boolean), newCursor: JSON.stringify(nextCursor) };
}

async function _syncOneCalendar(cal, calendarId, cursor, nextCursor) {
  const items = [];
  let pageToken;
  let newSyncToken = cursor;

  // Try incremental sync with existing sync token
  if (cursor && !cursor.includes('T')) { // sync tokens don't contain 'T'; ISO dates do
    try {
      do {
        const { data } = await cal.events.list({
          calendarId,
          syncToken:  cursor,
          maxResults: MAX_RESULTS,
          pageToken,
        });

        for (const event of data.items || []) {
          if (event.status === 'cancelled') continue;
          items.push(_eventToItem(event, calendarId));
        }

        newSyncToken = data.nextSyncToken || newSyncToken;
        pageToken    = data.nextPageToken;
      } while (pageToken);

      nextCursor[calendarId] = newSyncToken;
      return items;
    } catch (err) {
      if (err.code !== 410) throw err; // 410 Gone = sync token expired, fall through
    }
  }

  // Initial or expired: fetch events from timeMin window
  const timeMin = cursor?.includes('T')
    ? cursor
    : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const timeMax = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();

  do {
    const { data } = await cal.events.list({
      calendarId,
      timeMin,
      timeMax,
      maxResults:   MAX_RESULTS,
      singleEvents: true,
      orderBy:      'updated',
      pageToken,
    });

    for (const event of data.items || []) {
      if (event.status === 'cancelled') continue;
      items.push(_eventToItem(event, calendarId));
    }

    newSyncToken = data.nextSyncToken || newSyncToken;
    pageToken    = data.nextPageToken;
  } while (pageToken && items.length < 500);

  nextCursor[calendarId] = newSyncToken || new Date().toISOString();
  return items;
}

function _eventToItem(event, calendarId = 'primary') {
  if (!event?.id) return null;

  const start     = event.start?.dateTime || event.start?.date || '';
  const end       = event.end?.dateTime   || event.end?.date   || '';
  const attendees = (event.attendees || []).map(a => a.email).join(', ');
  const organizer = event.organizer?.email || event.creator?.email || 'unknown';
  const location  = event.location || '';

  return {
    externalId: event.id,
    etag:       event.etag,
    platform:   'google-calendar',
    sender:     organizer,
    channel:    'calendar',
    text:       [
      `[Calendar Event] ${event.summary || '(no title)'}`,
      `Start: ${start} | End: ${end}`,
      attendees  ? `Attendees: ${attendees}` : '',
      location   ? `Location: ${location}` : '',
      event.description ? event.description.slice(0, 400) : '',
    ].filter(Boolean).join('\n'),
    metadata: {
      eventId:     event.id,
      calendarId,
      title:       event.summary,
      start,
      end,
      organizer,
      attendees:   event.attendees || [],
      location,
      videoUrl:    event.hangoutLink || event.conferenceData?.entryPoints?.[0]?.uri,
      htmlLink:    event.htmlLink,
      status:      event.status,
      recurrence:  event.recurrence,
      etag:        event.etag,
    },
  };
}

// ── Invites (events where self is invited but hasn't responded) ───────────────

async function syncInvites(workspaceId, _cursor) {
  const cal       = await _calendar(workspaceId);
  const calendars = await _targetCalendars(workspaceId);
  const items     = [];
  const timeMin   = new Date(Date.now() - 7  * 24 * 60 * 60 * 1000).toISOString();
  const timeMax   = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  for (const calendarId of calendars) {
    let pageToken;

    try {
      do {
        const { data } = await cal.events.list({
          calendarId,
          timeMin,
          timeMax,
          maxResults:   MAX_RESULTS,
          singleEvents: true,
          pageToken,
        });

        for (const event of data.items || []) {
          if (event.status === 'cancelled') continue;
          const selfAttendee = (event.attendees || []).find(a => a.self);
          if (!selfAttendee) continue;
          if (selfAttendee.responseStatus !== 'needsAction') continue; // only unanswered invites

          const item = _eventToItem(event, calendarId);
          if (item) {
            item.channel = 'invites';
            item.text    = `[Calendar Invite — needs response] ${event.summary || '(no title)'} — ${event.start?.dateTime || event.start?.date}`;
            items.push(item);
          }
        }

        pageToken = data.nextPageToken;
      } while (pageToken && items.length < 100);
    } catch (err) {
      if (err.code === 404 || err.code === 403) continue;
      throw err;
    }
  }

  return { items, newCursor: new Date().toISOString() };
}

// ── Public API ────────────────────────────────────────────────────────────────

export const RESOURCE_TYPES = ['events', 'invites'];

export async function sync(workspaceId, resourceType, cursor, _opts = {}) {
  switch (resourceType) {
    case 'events':  return syncEvents(workspaceId, cursor);
    case 'invites': return syncInvites(workspaceId, cursor);
    default:
      throw new Error(`CalendarSyncAdapter: unknown resourceType "${resourceType}"`);
  }
}
