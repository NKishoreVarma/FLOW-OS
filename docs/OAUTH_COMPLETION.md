# FLOW OS — OAuth Completion Reference
> Phase 10.1 · Last updated 2026-07-08

---

## 1. Overview

Phase 10.1 completes the OAuth lifecycle for all six connectors. Every connector implements the full set: authorize → callback → token storage → health validation → disconnect → reconnect. Two connectors (GitHub, Jira) add PKCE for defense-in-depth against authorization code interception.

### Connector matrix

| Connector | Auth modes | PKCE | Refresh tokens | Token expiry |
|-----------|-----------|------|---------------|-------------|
| Google (Gmail + Calendar) | OAuth 2.0 | Via googleapis | ✅ auto-refresh | 1 hour (refresh token: indefinite) |
| GitHub | OAuth App, PAT | ✅ S256 | ✗ (tokens don't expire) | No expiry unless revoked |
| Slack | OAuth v2 (bot) | ✗ (not supported) | ✗ (tokens don't expire) | No expiry unless revoked |
| Jira | OAuth 3LO, API token | ✅ S256 | ✅ auto-refresh | 1 hour (refresh token: 90 days) |
| Notion | OAuth, Integration token | ✗ (not supported) | ✗ (tokens don't expire) | No expiry unless revoked |

---

## 2. Security Model

### CSRF protection (all connectors)

Every OAuth authorization URL includes a **HMAC-SHA256 signed state parameter**:

```
state = base64url({
  workspaceId: "ws_abc123",
  nonce:       "c4f2e8d1a3b7...",   // 32 random hex chars
  ts:          1720396800000,        // issue timestamp (ms)
  cv:          "abc123...",          // PKCE verifier — only present for github/jira
  sig:         "e9f1a2b3..."         // HMAC-SHA256(JWT_SECRET, "${prefix}:${workspaceId}:${nonce}:${ts}:${cv||''}")
})
```

On callback:
1. Base64url-decode and JSON-parse the state
2. Reject if `Date.now() - ts > 600_000` (10-minute window — prevents state replay)
3. Recompute HMAC; compare with `crypto.timingSafeEqual` (prevents timing attacks)
4. Extract `workspaceId` from the verified payload — never from the query string

**Shared implementation**: `src/services/integrations/oauthHelpers.js` — `signState()` and `verifyState()`.

### PKCE (GitHub and Jira)

Both GitHub and Jira support PKCE S256. The code verifier is embedded in the signed state (no server-side storage needed):

```
codeVerifier  = base64url(randomBytes(32))      // 43 URL-safe chars
codeChallenge = base64url(sha256(verifier))      // S256 method
```

The `code_challenge` and `code_challenge_method=S256` are sent in the authorization URL. The `code_verifier` is recovered from the verified state in the callback and sent with the token exchange request.

**Slack** and **Notion** do not support PKCE — CSRF-signed state is the sole protection for those connectors.

### Credential encryption

All credentials are stored encrypted with AES-256-GCM:

```
key       = scryptSync(JWT_SECRET, 'flow-connector-creds-v10', 32)
encrypted = iv:authTag:ciphertext   (all hex-encoded, colon-separated)
```

Google uses a separate salt (`'flow-google-oauth-v1'`) and table (`google_oauth_tokens`). All other connectors use `connector_credentials`.

---

## 3. OAuth Flows

### 3.1 Google (Gmail + Calendar)

**Setup**: `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` in `.env`.  
**Redirect URI**: `http://localhost:5001/api/google/callback` (set in Google Cloud Console).

```
GET  /api/google/auth                → { authUrl }  — redirect user here
GET  /api/google/callback?code=&state=  — public; Google redirects here
POST /api/google/disconnect          → revoke tokens + delete from DB
POST /api/google/reconnect           → revoke + clear + return new authUrl
GET  /api/google/validate            → probe userinfo API, persist health
GET  /api/google/status              → { connected, email, scopes, healthStatus }
GET  /api/google/health              → live probe (non-persisting)
```

Scopes: `openid email profile gmail.modify gmail.send calendar.events calendar.readonly drive.readonly`

### 3.2 GitHub

**Setup** (OAuth App): `GITHUB_CLIENT_ID` + `GITHUB_CLIENT_SECRET`.  
**Fallback** (PAT): `POST /api/integrations-hub/github/pat` with `{ token: "ghp_..." }`.  
**Redirect URI**: `http://localhost:5001/api/integrations-hub/github/callback`.

```
GET  /api/integrations-hub/github/auth          → { authUrl } — includes PKCE challenge
GET  /api/integrations-hub/github/callback      — public; exchanges code + verifier
POST /api/integrations-hub/github/pat           — store and validate a PAT
POST /api/integrations-hub/github/disconnect    → revoke via /applications/:id/token + soft-delete
POST /api/integrations-hub/github/reconnect     → revoke + return new authUrl
GET  /api/integrations-hub/github/validate      → probe /rate_limit, persist health
GET  /api/integrations-hub/github/status        → { connected, login, healthStatus, ... }
GET  /api/integrations-hub/github/health        → live probe (non-persisting)
```

Scopes: `repo read:user read:org notifications`

**PKCE token exchange** (sent by server in handleCallback, transparent to client):
```
POST https://github.com/login/oauth/access_token
  { client_id, client_secret, code, redirect_uri, code_verifier }
```

### 3.3 Slack

**Setup**: `SLACK_CLIENT_ID` + `SLACK_CLIENT_SECRET`.  
**Redirect URI**: `http://localhost:5001/api/integrations-hub/slack/callback`.

```
GET  /api/integrations-hub/slack/auth           → { authUrl }
GET  /api/integrations-hub/slack/callback       — public; stores bot token
POST /api/integrations-hub/slack/disconnect     → auth.revoke + soft-delete
POST /api/integrations-hub/slack/reconnect      → revoke + return new authUrl
GET  /api/integrations-hub/slack/validate       → probe auth.test, persist health
GET  /api/integrations-hub/slack/status         → { connected, teamName, healthStatus }
GET  /api/integrations-hub/slack/health         → live probe (non-persisting)
```

Bot scopes: `channels:history channels:read chat:write files:read groups:history groups:read im:history im:read mpim:history mpim:read reactions:read team:read users:read users:read.email`

Slack bot tokens **do not expire** — revocation happens when the user removes the app from their Slack workspace.

### 3.4 Jira

**Setup** (OAuth 3LO): `JIRA_CLIENT_ID` + `JIRA_CLIENT_SECRET`.  
**Fallback** (API token): `POST /api/integrations-hub/jira/token` with `{ email, apiToken, domain }`.  
**Redirect URI**: `http://localhost:5001/api/integrations-hub/jira/callback`.

```
GET  /api/integrations-hub/jira/auth            → { authUrl } — includes PKCE challenge
GET  /api/integrations-hub/jira/callback        — public; discovers cloudId + stores tokens
POST /api/integrations-hub/jira/token           — store and validate API token
POST /api/integrations-hub/jira/disconnect      → soft-delete
POST /api/integrations-hub/jira/reconnect       → revoke + return new authUrl
GET  /api/integrations-hub/jira/validate        → probe /myself, persist health
GET  /api/integrations-hub/jira/status          → { connected, cloudName, healthStatus }
GET  /api/integrations-hub/jira/health          → live probe (non-persisting)
```

Scopes: `read:jira-work write:jira-work read:jira-user offline_access`

**Token refresh**: Jira access tokens expire in ~1 hour. `getAccessToken()` auto-refreshes using the stored `refresh_token`. If the refresh token itself expires (90-day limit), the health status is set to `expired` and `action: 'reconnect'` is returned.

**Cloud ID discovery**: After token exchange, Atlassian `/oauth/token/accessible-resources` is called to get the `cloudId`. All Jira API calls use `https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3/...`. If the user has access to multiple Jira sites, `resources[0]` is used. All available sites are stored in `availableSites` for future multi-site support.

### 3.5 Notion

**Setup** (OAuth): `NOTION_CLIENT_ID` + `NOTION_CLIENT_SECRET`.  
**Fallback** (Integration token): `POST /api/integrations-hub/notion/token` with `{ token: "secret_..." }`.  
**Redirect URI**: `http://localhost:5001/api/integrations-hub/notion/callback`.

```
GET  /api/integrations-hub/notion/auth          → { authUrl }
GET  /api/integrations-hub/notion/callback      — public; stores access token
POST /api/integrations-hub/notion/token         — store and validate integration token
POST /api/integrations-hub/notion/disconnect    → soft-delete
POST /api/integrations-hub/notion/reconnect     → revoke + return new authUrl
GET  /api/integrations-hub/notion/validate      → probe /users/me, persist health
GET  /api/integrations-hub/notion/status        → { connected, workspaceName, healthStatus }
GET  /api/integrations-hub/notion/health        → live probe (non-persisting)
```

Notion tokens **do not expire** and there is no programmatic revocation endpoint. `disconnect()` performs a local soft-delete only.

---

## 4. Lifecycle Operations

### Connect

```
1. Client: GET /api/integrations-hub/:id/auth
   → { authUrl: "https://provider.com/oauth/authorize?..." }
2. Client: window.open(authUrl)
3. User authenticates and grants permissions
4. Provider redirects to: GET /api/integrations-hub/:id/callback?code=&state=
5. Server: verifyState() → token exchange → saveCredentials() → updateHealthStatus('healthy')
6. Server: redirect to ${FRONTEND_URL}/platform/integrations?connected=:id
```

### Disconnect

```
1. Client: POST /api/integrations-hub/:id/disconnect
2. Server: provider token revocation API (where available)
3. Server: revokeCredentials() — sets revoked_at, preserves audit trail
```

| Connector | Token revocation method |
|-----------|------------------------|
| GitHub | `DELETE /applications/:clientId/token` |
| Slack | `GET /api/auth.revoke` |
| Google | `oauth2Client.revokeCredentials()` |
| Jira | Local revocation only (no Atlassian API endpoint) |
| Notion | Local revocation only (no API endpoint) |

### Reconnect

```
1. Client: POST /api/integrations-hub/:id/reconnect
   → { authUrl: "https://provider.com/..." }
2. Client: window.open(authUrl)
3. Flow continues as Connect above, overwriting previous credentials
```

The reconnect flow revokes the existing token first (same as disconnect), then generates a fresh authorization URL. The user re-authorizes, and new credentials overwrite the old ones via `saveCredentials()` upsert.

### Validate (probes upstream API)

```
GET /api/integrations-hub/:id/validate
→ { valid: true/false, healthStatus, action? }
```

`validateCredentials()` calls a lightweight upstream endpoint (GitHub `/rate_limit`, Slack `auth.test`, Jira `/myself`, Notion `/users/me`, Google userinfo) and persists the result in the `meta` JSONB column. The `healthStatus` and `needsReconnect` fields are then reflected in `/status` responses without additional API calls.

Health status values: `healthy` | `degraded` | `revoked` | `expired` | `invalid` | `not_connected` | `unknown`

---

## 5. Failure Scenarios

### Expired token (Jira, Google)

On `getAccessToken()`, if `cred.expiresAt - 60s < now`, an automatic refresh is attempted:
- **Success**: new access token saved, request proceeds transparently
- **Failure (refresh_token expired)**: `healthStatus = 'expired'`, `needsReconnect = true`, `action = 'reconnect'`
- **Failure (other)**: returns existing token — may still be valid

Google's googleapis library handles expiry detection and refresh automatically via the `'tokens'` event on `OAuth2Client`.

### Revoked token

Detected when the upstream API returns HTTP 401. Each `validateCredentials()` call:
1. Detects 401 → sets `healthStatus = 'revoked'`, `needsReconnect = true`
2. Returns `{ valid: false, action: 'reconnect' }`

The credential is NOT automatically deleted on revocation detection — only `validateCredentials()` or `disconnect()` mutate the credential row. This preserves the audit trail.

### Invalid token (PAT with wrong scopes, expired API key)

Same detection path as revoked. The API returns 401 or 403. `validateCredentials()` sets `healthStatus = 'invalid'`, `needsReconnect = true`.

For GitHub PATs: `storePAT()` validates the token against `/user` before saving. An invalid token is rejected at store time.

### CSRF attempt

`verifyState()` throws `AppError(400, 'CSRF_DETECTED')` if the HMAC does not match. The OAuth callback redirects to `FRONTEND_URL/platform/integrations?error=...` with no credentials stored.

### Expired state (> 10 minutes)

`verifyState()` throws `AppError(400, 'OAUTH_STATE_EXPIRED')`. The user must restart the authorization flow.

---

## 6. Multiple Workspaces and Users

Each credential row is keyed by `(workspace_id, connector_id)`:

```sql
UNIQUE (workspace_id, connector_id)
```

- **Multiple workspaces**: each workspace has independent credentials for each connector. One workspace connecting to GitHub does not affect any other workspace.
- **Multiple users**: credentials are workspace-scoped, not user-scoped. All FLOW users in a workspace share the workspace's connector credentials. This is intentional — enterprise connectors typically use a single integration account (bot token, service account) shared across the team.
- **Multiple Google accounts**: if a workspace needs to switch the connected Google account, `POST /reconnect` clears the existing token and initiates a fresh OAuth flow.

---

## 7. API Route Reference

### Shared routes (all non-Google connectors)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/integrations-hub/status` | JWT + workspace-id | All connector statuses |
| GET | `/api/integrations-hub/:id/status` | JWT + workspace-id | Single connector status |
| GET | `/api/integrations-hub/:id/health` | JWT + workspace-id | Live health probe (non-persisting) |
| GET | `/api/integrations-hub/:id/auth` | JWT + workspace-id | Start OAuth flow → `{ authUrl }` |
| GET | `/api/integrations-hub/github/callback` | None (public) | GitHub OAuth callback |
| GET | `/api/integrations-hub/slack/callback` | None (public) | Slack OAuth callback |
| GET | `/api/integrations-hub/notion/callback` | None (public) | Notion OAuth callback |
| GET | `/api/integrations-hub/jira/callback` | None (public) | Jira OAuth callback |
| POST | `/api/integrations-hub/github/pat` | JWT + workspace-id | Store GitHub PAT |
| POST | `/api/integrations-hub/notion/token` | JWT + workspace-id | Store Notion integration token |
| POST | `/api/integrations-hub/jira/token` | JWT + workspace-id | Store Jira API token |
| POST | `/api/integrations-hub/:id/disconnect` | JWT + workspace-id | Revoke credentials |
| POST | `/api/integrations-hub/:id/reconnect` | JWT + workspace-id | Revoke + return new authUrl |
| GET | `/api/integrations-hub/:id/validate` | JWT + workspace-id | Probe upstream + persist health |
| POST | `/api/integrations-hub/:id/sync` | JWT + workspace-id | Trigger manual sync |
| GET | `/api/integrations-hub/:id/sync/history` | JWT + workspace-id | Last N sync runs |
| GET | `/api/integrations-hub/:id/sync/stats` | JWT + workspace-id | Aggregate sync stats |
| GET | `/api/integrations-hub/:id/webhook` | JWT + workspace-id | Webhook info |
| POST | `/api/integrations-hub/:id/webhook` | JWT + workspace-id | Register webhook |
| DELETE | `/api/integrations-hub/:id/webhook` | JWT + workspace-id | Deactivate webhook |

### Google routes

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/google/auth` | JWT + workspace-id | Start OAuth flow |
| GET | `/api/google/callback` | None (public) | Google OAuth callback |
| GET | `/api/google/status` | JWT + workspace-id | Connection status |
| POST | `/api/google/disconnect` | JWT + workspace-id | Revoke + delete tokens |
| POST | `/api/google/reconnect` | JWT + workspace-id | Revoke + return new authUrl |
| GET | `/api/google/validate` | JWT + workspace-id | Probe userinfo + persist health |
| GET | `/api/google/health` | JWT + workspace-id | Live health probe |
| GET | `/api/google/services` | JWT + workspace-id | List available Google services |

---

## 8. Key Files

| File | Purpose |
|------|---------|
| `src/services/integrations/oauthHelpers.js` | Shared CSRF state and PKCE helpers |
| `src/services/integrations/ConnectorCredentialStore.js` | AES-256-GCM credential storage; `updateHealthStatus()` |
| `src/services/integrations/GitHubOAuthService.js` | GitHub OAuth + PAT; PKCE S256; reconnect; validate |
| `src/services/integrations/SlackOAuthService.js` | Slack OAuth v2; reconnect; validate |
| `src/services/integrations/JiraOAuthService.js` | Jira OAuth 3LO; PKCE S256; auto-refresh; reconnect; validate |
| `src/services/integrations/NotionOAuthService.js` | Notion OAuth + integration token; reconnect; validate |
| `src/services/google/GoogleOAuthService.js` | Google OAuth; auto-refresh; reconnect (async fixed); validate |
| `src/services/google/GoogleTokenManager.js` | Google token AES-256-GCM storage |
| `src/routes/integrationsAdminRoutes.js` | Admin hub: `/reconnect`, `/validate` added |
| `src/routes/googleRoutes.js` | Google routes: reconnect async bug fixed, `/validate` added |
| `scripts/migrate-oauth-completion-v10-1.sql` | Supplement migration: meta column on google_oauth_tokens |

---

## 9. Setup Checklist

### Google (Gmail + Calendar)
1. [Create OAuth credentials](https://console.cloud.google.com/apis/credentials) — Web application type
2. Add authorized redirect URI: `http://localhost:5001/api/google/callback` (dev) / `https://api.yourdomain.com/api/google/callback` (prod)
3. Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in `.env`
4. Enable: Gmail API, Google Calendar API, People API in Cloud Console
5. Navigate to `/api/google/auth` while authenticated to initiate

### GitHub
**OAuth App** (multi-user):
1. [Register an OAuth App](https://github.com/settings/developers) → Callback URL: `http://localhost:5001/api/integrations-hub/github/callback`
2. Set `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` in `.env`

**PAT** (single user, dev):
1. Generate at [github.com/settings/tokens](https://github.com/settings/tokens) with scopes: `repo read:user read:org notifications`
2. `POST /api/integrations-hub/github/pat` with `{ "token": "ghp_..." }`

### Slack
1. [Create a Slack app](https://api.slack.com/apps) → OAuth & Permissions
2. Add Redirect URL: `http://localhost:5001/api/integrations-hub/slack/callback`
3. Add Bot Token Scopes (see §3.3 above)
4. Set `SLACK_CLIENT_ID` and `SLACK_CLIENT_SECRET` in `.env`
5. Install to workspace via `/api/integrations-hub/slack/auth`

### Jira
**OAuth 3LO** (recommended):
1. [Create an app at developer.atlassian.com](https://developer.atlassian.com/console/myapps/)
2. Add OAuth 2.0 (3LO), set callback: `http://localhost:5001/api/integrations-hub/jira/callback`
3. Add API scopes (see §3.4)
4. Set `JIRA_CLIENT_ID` and `JIRA_CLIENT_SECRET` in `.env`

**API Token** (simpler, no app registration):
1. Generate at [id.atlassian.com/manage-profile/security/api-tokens](https://id.atlassian.com/manage-profile/security/api-tokens)
2. `POST /api/integrations-hub/jira/token` with `{ "email": "...", "apiToken": "ATATT...", "domain": "yourcompany.atlassian.net" }`

### Notion
**OAuth** (recommended):
1. [Create a public integration at notion.so/my-integrations](https://www.notion.so/my-integrations)
2. Set OAuth redirect URI: `http://localhost:5001/api/integrations-hub/notion/callback`
3. Set `NOTION_CLIENT_ID` and `NOTION_CLIENT_SECRET` in `.env`

**Integration token** (simpler):
1. Create an internal integration at [notion.so/my-integrations](https://www.notion.so/my-integrations) and share relevant pages with it
2. `POST /api/integrations-hub/notion/token` with `{ "token": "secret_..." }`

---

## 10. Migration

```bash
# Run after Phase 10.0 migration (adds meta column to google_oauth_tokens)
psql "$DATABASE_URL" -f scripts/migrate-oauth-completion-v10-1.sql
```

---

*Phase 10.1 — OAuth Completion. No mock OAuth anywhere in this implementation.*
