/**
 * GoogleServiceLayer — typed Google API client factory.
 *
 * All clients share the same OAuth2Client (one Google account per workspace).
 * Callers never touch OAuth2 directly — they call getGmailClient(),
 * getCalendarClient(), etc. and get a ready-to-use googleapis client.
 *
 * If the workspace has not completed OAuth, all functions throw
 * AppError(401, 'GOOGLE_NOT_AUTHENTICATED').
 */

import { google }        from 'googleapis';
import { getOAuth2Client } from './GoogleOAuthService.js';
import { AppError }       from '../../core/errors/index.js';

const NOT_AUTH_ERR = workspaceId =>
  new AppError(
    `Google account not connected for workspace "${workspaceId}". Complete OAuth at /api/google/auth.`,
    401,
    'GOOGLE_NOT_AUTHENTICATED',
  );

async function _auth(workspaceId) {
  const oauth2 = await getOAuth2Client(workspaceId);
  if (!oauth2) throw NOT_AUTH_ERR(workspaceId);
  return oauth2;
}

/** @returns {Promise<import('googleapis').gmail_v1.Gmail>} */
export async function getGmailClient(workspaceId) {
  return google.gmail({ version: 'v1', auth: await _auth(workspaceId) });
}

/** @returns {Promise<import('googleapis').calendar_v3.Calendar>} */
export async function getCalendarClient(workspaceId) {
  return google.calendar({ version: 'v3', auth: await _auth(workspaceId) });
}

/** @returns {Promise<import('googleapis').drive_v3.Drive>} */
export async function getDriveClient(workspaceId) {
  return google.drive({ version: 'v3', auth: await _auth(workspaceId) });
}

/** @returns {Promise<import('googleapis').docs_v1.Docs>} */
export async function getDocsClient(workspaceId) {
  return google.docs({ version: 'v1', auth: await _auth(workspaceId) });
}

/** @returns {Promise<import('googleapis').sheets_v4.Sheets>} */
export async function getSheetsClient(workspaceId) {
  return google.sheets({ version: 'v4', auth: await _auth(workspaceId) });
}

/** @returns {Promise<import('googleapis').people_v1.People>} */
export async function getPeopleClient(workspaceId) {
  return google.people({ version: 'v1', auth: await _auth(workspaceId) });
}

/**
 * Convenience: return all six clients at once.
 * Throws if not authenticated.
 */
export async function getAllClients(workspaceId) {
  const auth = await _auth(workspaceId);
  return {
    gmail:    google.gmail    ({ version: 'v1', auth }),
    calendar: google.calendar ({ version: 'v3', auth }),
    drive:    google.drive    ({ version: 'v3', auth }),
    docs:     google.docs     ({ version: 'v1', auth }),
    sheets:   google.sheets   ({ version: 'v4', auth }),
    people:   google.people   ({ version: 'v1', auth }),
  };
}

/**
 * Quick connectivity test — calls the People API /me profile.
 * Returns HEALTHY / DEGRADED / DOWN with latency.
 */
export async function healthCheck(workspaceId) {
  const t0 = Date.now();
  try {
    const people = await getPeopleClient(workspaceId);
    const res    = await people.people.get({
      resourceName: 'people/me',
      personFields: 'emailAddresses,names',
    });
    const displayName = res.data.names?.[0]?.displayName ?? null;
    const email       = res.data.emailAddresses?.[0]?.value ?? null;
    return { status: 'HEALTHY', latencyMs: Date.now() - t0, email, displayName };
  } catch (err) {
    if (err.code === 'GOOGLE_NOT_AUTHENTICATED') {
      return { status: 'DEGRADED', detail: 'Google account not connected', latencyMs: Date.now() - t0 };
    }
    return { status: 'DOWN', detail: err.message, latencyMs: Date.now() - t0 };
  }
}
