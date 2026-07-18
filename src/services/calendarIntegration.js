import { google } from 'googleapis';
import { tokenStore } from './gmailInboundService.js';
import { ingestionQueue } from '../config/queue.js';
import { EntityTypes, registerEntity, linkEntities } from './knowledgeGraphService.js';
import { isResourceIdAllowed } from '../core/governance/integrationPermissions/index.js';

export const syncWorkspaceCalendar = async (workspaceId) => {
  console.log(`📅 [Calendar Service] Starting sync for Workspace: ${workspaceId}`);

  const tokens = tokenStore.get(workspaceId);
  if (!tokens) {
    console.warn(`⚠️ [Calendar Service] No tokens found for Workspace: ${workspaceId}. Cannot sync.`);
    return { status: 'NO_TOKENS', ingested: 0 };
  }

  // Integration Permissions: this path reads the primary calendar only.
  const verdict = await isResourceIdAllowed(workspaceId, 'google-calendar', 'calendar', 'primary');
  if (!verdict.allowed) {
    return { status: 'NOT_PERMITTED', ingested: 0 };
  }

  const oauth2Client = new google.auth.OAuth2(
    process.env.GMAIL_CLIENT_ID || 'mock_client_id',
    process.env.GMAIL_CLIENT_SECRET || 'mock_client_secret'
  );
  oauth2Client.setCredentials(tokens);

  const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

  try {
    const now = new Date();
    const nextWeek = new Date();
    nextWeek.setDate(now.getDate() + 7);

    const res = await calendar.events.list({
      calendarId: 'primary',
      timeMin: now.toISOString(),
      timeMax: nextWeek.toISOString(),
      singleEvents: true,
      orderBy: 'startTime'
    });

    const events = res.data.items || [];
    let ingestedCount = 0;

    for (const event of events) {
      const title = event.summary || 'Untitled Event';
      const description = event.description || 'No description provided.';
      const start = event.start?.dateTime || event.start?.date;
      const end = event.end?.dateTime || event.end?.date;
      const attendees = event.attendees || [];
      const eventId = `E_${event.id || Date.now()}`;

      // 1. Knowledge Graph Injection: Event Node
      registerEntity(eventId, EntityTypes.EVENT, title);

      let attendeeListStr = '';
      
      // 2. Knowledge Graph Injection: Attendee Linkage
      if (attendees.length > 0) {
        attendeeListStr = attendees.map(a => a.email).join(', ');
        for (const attendee of attendees) {
          const email = attendee.email;
          if (email) {
            const userId = `U_${email}`;
            // Simplify name to prefix of email if no displayName
            const name = attendee.displayName || email.split('@')[0];
            registerEntity(userId, EntityTypes.USER, name);
            linkEntities(userId, eventId, 'ATTENDING');
          }
        }
      }

      // 3. Queue Injection for Vectorization
      const textPayload = `Calendar Event: ${title}\nStart: ${start}\nEnd: ${end}\nAttendees: ${attendeeListStr}\nDescription: ${description}`;
      
      await ingestionQueue.add('new-intel', {
        workspaceId,
        sender: 'Google Calendar',
        channel: `CALENDAR: ${title}`,
        text: textPayload
      });
      
      ingestedCount++;
    }

    console.log(`✅ [Calendar Service] Sync complete. Indexed ${ingestedCount} events.`);
    return { status: 'SUCCESS', ingested: ingestedCount };
  } catch (err) {
    console.error('❌ [Calendar Service] Sync failed:', err.message);
    throw err;
  }
};
