import { google } from 'googleapis';
import { ingestionQueue } from '../config/queue.js';
import { isResourceIdAllowed } from '../core/governance/integrationPermissions/index.js';

// In-memory token store mapped by workspaceId
// Format: workspaceId -> tokens object
export const tokenStore = new Map();

// Initialize the OAuth2 client
const getOAuth2Client = () => {
  return new google.auth.OAuth2(
    process.env.GMAIL_CLIENT_ID || 'mock_client_id',
    process.env.GMAIL_CLIENT_SECRET || 'mock_client_secret',
    process.env.GMAIL_REDIRECT_URI || 'http://localhost:5001/api/integrations/gmail/callback'
  );
};

export const generateAuthUrl = (workspaceId) => {
  const oauth2Client = getOAuth2Client();
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: [
      'https://www.googleapis.com/auth/gmail.readonly', 
      'https://www.googleapis.com/auth/gmail.modify',
      'https://www.googleapis.com/auth/calendar.readonly'
    ],
    state: workspaceId // Pass the workspaceId back through the state param
  });
  return authUrl;
};

export const handleCallback = async (code, workspaceId) => {
  const oauth2Client = getOAuth2Client();
  const { tokens } = await oauth2Client.getToken(code);
  
  // Store securely against workspace_id
  tokenStore.set(workspaceId, tokens);
  
  return tokens;
};

export const syncGmailInbox = async (workspaceId) => {
  console.log(`📧 [Gmail Service] Starting sync for Workspace: ${workspaceId}`);
  
  const tokens = tokenStore.get(workspaceId);
  if (!tokens) {
    console.warn(`⚠️ [Gmail Service] No tokens found for Workspace: ${workspaceId}. Cannot sync.`);
    return { status: 'NO_TOKENS', ingested: 0 };
  }

  const oauth2Client = getOAuth2Client();
  oauth2Client.setCredentials(tokens);
  
  const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
  
  try {
    const res = await gmail.users.messages.list({
      userId: 'me',
      q: 'is:unread',
      maxResults: 10
    });
    
    const messages = res.data.messages || [];
    let ingestedCount = 0;

    for (const msg of messages) {
      const msgData = await gmail.users.messages.get({
        userId: 'me',
        id: msg.id,
        format: 'full'
      });

      // Integration Permissions: only ingest mail carrying an authorized label.
      const verdict = await isResourceIdAllowed(
        workspaceId, 'gmail', 'label', msgData.data.labelIds || [],
      );
      if (!verdict.allowed) continue;

      const payload = msgData.data.payload;
      const headers = payload.headers;
      
      let sender = 'Unknown Sender';
      let subject = 'No Subject';
      
      for (const header of headers) {
        if (header.name.toLowerCase() === 'from') sender = header.value;
        if (header.name.toLowerCase() === 'subject') subject = header.value;
      }
      
      // Extract body (simplified for prototype, checking plain text parts)
      let text = '';
      if (payload.parts) {
        const textPart = payload.parts.find(p => p.mimeType === 'text/plain');
        if (textPart && textPart.body && textPart.body.data) {
          text = Buffer.from(textPart.body.data, 'base64').toString('utf8');
        }
      } else if (payload.body && payload.body.data) {
        text = Buffer.from(payload.body.data, 'base64').toString('utf8');
      }
      
      if (!text) text = 'No content found.';
      
      // Push directly to bullmq
      await ingestionQueue.add('new-intel', {
        workspaceId,
        sender,
        channel: `GMAIL: ${subject}`,
        text
      });
      
      ingestedCount++;
      
      // Mark as read
      await gmail.users.messages.modify({
        userId: 'me',
        id: msg.id,
        requestBody: {
          removeLabelIds: ['UNREAD']
        }
      });
    }
    
    console.log(`✅ [Gmail Service] Sync complete. Ingested ${ingestedCount} emails.`);
    return { status: 'SUCCESS', ingested: ingestedCount };
  } catch (err) {
    console.error('❌ [Gmail Service] Sync failed:', err.message);
    throw err;
  }
};

export const draftGmailResponse = async (workspaceId, to, subject, bodyText) => {
  console.log(`📧 [Gmail Service] Drafting auto-response for Workspace: ${workspaceId} to ${to}`);
  
  const tokens = tokenStore.get(workspaceId);
  if (!tokens) {
    console.warn(`⚠️ [Gmail Service] No tokens found for Workspace: ${workspaceId}. Cannot draft email.`);
    return { status: 'NO_TOKENS' };
  }

  const oauth2Client = new google.auth.OAuth2(
    process.env.GMAIL_CLIENT_ID || 'mock_client_id',
    process.env.GMAIL_CLIENT_SECRET || 'mock_client_secret'
  );
  oauth2Client.setCredentials(tokens);
  
  const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
  
  const rawMessage = [
    `To: ${to}`,
    `Subject: Re: ${subject}`,
    'Content-Type: text/plain; charset=utf-8',
    'MIME-Version: 1.0',
    '',
    bodyText
  ].join('\n');
  
  const encodedMessage = Buffer.from(rawMessage)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
    
  try {
    const res = await gmail.users.drafts.create({
      userId: 'me',
      requestBody: {
        message: {
          raw: encodedMessage
        }
      }
    });
    console.log(`✅ [Gmail Service] Draft created successfully with ID: ${res.data.id}`);
    return { status: 'SUCCESS', draftId: res.data.id };
  } catch (err) {
    console.error('❌ [Gmail Service] Draft creation failed:', err.message);
    throw err;
  }
};
