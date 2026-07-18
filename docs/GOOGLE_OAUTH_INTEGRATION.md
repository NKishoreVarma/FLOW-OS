# Google Workspace OAuth Integration

> One Google account connection unlocks all 6 Google APIs for a workspace.

---

## Overview

Phase 9.1 replaces the in-memory OAuth token store (TD-01) with an encrypted, persistent PostgreSQL table. Tokens survive server restarts. Auto-refresh is wired to re-persist updated tokens automatically.

**Google APIs enabled:**
- Gmail (Communication Capability)
- Google Calendar (Meeting Capability)
- Google Drive (file search, sync)
- Google Docs (document intelligence)
- Google Sheets (spreadsheet data)
- Google People API (contacts, directory)

---

## Architecture

```
User clicks "Connect Google"
        │
        ▼
GET /api/google/auth
  → GoogleOAuthService.getAuthUrl()
  → Signed HMAC state (CSRF-safe, stateless)
  → Returns { authUrl }
        │
        ▼ (browser redirects to Google)
        │
        ▼
GET /api/google/callback?code=...&state=...
  → GoogleOAuthService.handleCallback()
  → Verify HMAC state (CSRF check)
  → OAuth2Client.getToken(code) → tokens
  → Resolve email from id_token
  → GoogleTokenManager.saveTokens() → AES-256-GCM encrypt → PostgreSQL
  → Redirect to frontend /platform/integrations?googleConnected=true
        │
        ▼
GmailAdapter / GoogleCalendarAdapter
  → _getClient(workspaceId)
  → GoogleTokenManager.loadTokens() → decrypt → setCredentials()
  → googleapis auto-refresh → on('tokens') → saveTokens() → update DB
```

---

## Files

| File | Role |
|------|------|
| `src/services/google/GoogleTokenManager.js` | AES-256-GCM encrypt/decrypt + `google_oauth_tokens` table CRUD |
| `src/services/google/GoogleOAuthService.js` | Consent URL, callback, CSRF state, revocation |
| `src/services/google/GoogleServiceLayer.js` | Factory functions for all 6 Google API clients |
| `src/routes/googleRoutes.js` | Unified `/api/google/*` REST API |
| `scripts/migrate-google-oauth.sql` | Creates `google_oauth_tokens` table (idempotent) |
| `flow-os-frontend/src/components/platform/GoogleConnect.jsx` | Connect/Disconnect UI |

---

## Setup

### 1. Google Cloud Console

1. Go to [Google Cloud Console](https://console.cloud.google.com) → APIs & Services → Credentials
2. Create an OAuth 2.0 Client ID (Web application type)
3. Add **Authorized redirect URIs**:
   ```
   http://localhost:5001/api/google/callback
   http://localhost:5001/api/communication/oauth/callback
   http://localhost:5001/api/meetings/oauth/callback
   ```
4. Enable the following APIs in API Library:
   - Gmail API
   - Google Calendar API
   - Google Drive API
   - Google Docs API
   - Google Sheets API
   - People API

### 2. Environment Variables

```bash
# .env
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-xxxxxxxxxxxxxxxxxxxxxxxx
GOOGLE_REDIRECT_URI=http://localhost:5001/api/google/callback
FRONTEND_URL=http://localhost:3000
```

### 3. Run Database Migration

```bash
psql $DATABASE_URL -f scripts/migrate-google-oauth.sql
```

---

## REST API

All routes (except `/callback`) require `Authorization: Bearer <jwt>` and `workspace-id` header.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/google/status` | Connection status (connected, email, scopes) |
| GET | `/api/google/auth` | Generate OAuth consent URL |
| GET | `/api/google/callback` | OAuth redirect handler (no auth) |
| POST | `/api/google/disconnect` | Revoke tokens + delete from DB |
| POST | `/api/google/reconnect` | Clear tokens + return new consent URL |
| GET | `/api/google/services` | List which Google services are available |
| GET | `/api/google/health` | Live connectivity test via People API |

---

## Security

| Mechanism | Implementation |
|-----------|---------------|
| CSRF protection | HMAC-SHA256 signed state (JWT_SECRET). Stateless — no Redis session needed. |
| Token encryption | AES-256-GCM. Key derived from JWT_SECRET via scrypt. IV and auth tag stored with ciphertext. |
| Secret isolation | `GOOGLE_CLIENT_SECRET` lives in `.env` only. Never in code or logs. |
| Least privilege | Scopes match the minimum required for each API (modify, not full access). |
| Auto-refresh | `googleapis` refreshes access tokens silently; `on('tokens')` event re-saves to DB. |
| Revocation | `/api/google/disconnect` calls `oauth2.revokeCredentials()` before clearing DB. |

---

## Token Storage Schema

```sql
google_oauth_tokens (
  id                TEXT PRIMARY KEY,
  workspace_id      TEXT UNIQUE NOT NULL,    -- externalId (workspace-id header)
  encrypted_tokens  TEXT NOT NULL,           -- AES-256-GCM: iv:tag:ciphertext
  email             TEXT,                    -- Google account email
  scopes            TEXT,                    -- Space-separated granted scopes
  connected_at      TIMESTAMPTZ,
  last_refreshed_at TIMESTAMPTZ
)
```

---

## Adapter Integration

Both `GmailAdapter` and `GoogleCalendarAdapter` now use `GoogleTokenManager`:

```
Before: getCredentials(workspaceId, 'gmail') → authManager (in-memory, lost on restart)
After:  loadTokens(workspaceId)              → PostgreSQL (encrypted, persistent)
```

Token refresh flow:
```
googleapis calls Google → gets new access_token
   → fires oauth2Client.on('tokens', newTokens)
      → saveTokens(workspaceId, { ...oldTokens, ...newTokens })
         → AES-256-GCM encrypt → UPDATE google_oauth_tokens
```

---

## Frontend

`GoogleConnect.jsx` is a self-contained component:

```jsx
import GoogleConnect from '@/components/platform/GoogleConnect';

// Embed anywhere
<GoogleConnect />
```

Features:
- Connection status (email, date connected)
- Service grid showing all 6 Google APIs
- Connect → opens Google OAuth consent
- Re-authenticate → clears old tokens + new consent
- Disconnect → revokes tokens + confirms with user

---

*Last updated: 2026-07-07 — Phase 9.1 Google Workspace OAuth Integration*
