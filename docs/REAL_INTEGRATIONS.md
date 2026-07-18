# FLOW OS — Real Integration Platform
> Phase 10.0 Reference · Last updated 2026-07-08

---

## 1. Overview

Phase 10.0 connects FLOW OS to real company data through production-grade OAuth 2.0 integrations with GitHub, Slack, Notion, Jira, Gmail, and Google Calendar. Every connector:

- Uses **OAuth 2.0** (or a PAT/API-token fallback for dev environments)
- Stores credentials **encrypted at rest** (AES-256-GCM, key derived from `JWT_SECRET`)
- Supports **incremental sync** with per-workspace cursors (resumes from last position on restart)
- Verifies **webhook HMAC signatures** before processing any inbound event
- Streams sync progress over **WebSocket** and persists a durable audit trail in PostgreSQL

---

## 2. Architecture

```
External platform
        │  OAuth callback / PAT store
        ▼
 OAuth Service               (src/services/integrations/{Connector}OAuthService.js)
        │  encrypt + save
        ▼
 ConnectorCredentialStore    (src/services/integrations/ConnectorCredentialStore.js)
        │  AES-256-GCM, PostgreSQL connector_credentials table
        │
        ├── BullMQ syncQueue ──► SyncWorker ──► SyncStateManager (cursors, history)
        │                                           │
        │                                           ▼
        │                                    ingestionQueue ──► 9-stage pipeline
        │
        └── Webhook intake   ──► WebhookManager ──► HMAC verify ──► ingestionQueue
```

### Key files

| File | Purpose |
|------|---------|
| `src/services/integrations/ConnectorCredentialStore.js` | AES-256-GCM credential store (PostgreSQL) |
| `src/services/integrations/SyncStateManager.js` | Incremental sync cursors + audit history |
| `src/services/integrations/WebhookManager.js` | HMAC registration + validation (GitHub/Slack/Jira) |
| `src/services/integrations/GitHubOAuthService.js` | GitHub OAuth App + PAT fallback |
| `src/services/integrations/SlackOAuthService.js` | Slack OAuth v2, bot scopes, data helpers |
| `src/services/integrations/NotionOAuthService.js` | Notion OAuth + internal integration token |
| `src/services/integrations/JiraOAuthService.js` | Jira Cloud OAuth 3LO + API token, auto-refresh |
| `src/config/syncQueue.js` | BullMQ `connector-sync` queue (deduplication by jobId) |
| `src/workers/syncWorker.js` | Per-connector sync implementations (incremental, retry) |
| `src/connectors/adapters/SlackAdapter.js` | Slack Communication Capability adapter |
| `src/routes/integrationsAdminRoutes.js` | Admin REST API at `/api/integrations-hub/*` |
| `src/routes/webhookRoutes.js` | Public webhook intake at `/api/webhooks/*` |
| `scripts/migrate-integrations-v10.sql` | DB migration (idempotent, safe to re-run) |

---

## 3. Database Migration

Run once against your PostgreSQL instance:

```bash
psql "$DATABASE_URL" -f scripts/migrate-integrations-v10.sql
```

Creates four tables (idempotent — safe to re-run):

| Table | Purpose |
|-------|---------|
| `connector_credentials` | Encrypted OAuth tokens / PATs / API keys per workspace+connector |
| `sync_state` | Incremental sync cursor + next-sync schedule per workspace+connector+resource |
| `sync_records` | Per-run audit log (status, items synced, duration, error) |
| `webhook_registrations` | HMAC secret (encrypted) + endpoint URL + event types per workspace+connector |

---

## 4. Environment Variables

### Required (platform boots without these, but connectors are inactive)

```bash
# Google (Gmail + Calendar) — same credentials for both
GOOGLE_CLIENT_ID=<google oauth client id>
GOOGLE_CLIENT_SECRET=<google oauth client secret>
FRONTEND_URL=http://localhost:3000          # OAuth redirect origin

# GitHub OAuth App (optional — PAT still works without this)
GITHUB_CLIENT_ID=<github oauth app client id>
GITHUB_CLIENT_SECRET=<github oauth app client secret>

# Slack OAuth v2
SLACK_CLIENT_ID=<slack app client id>
SLACK_CLIENT_SECRET=<slack app client secret>

# Notion OAuth (optional — integration token still works without this)
NOTION_CLIENT_ID=<notion oauth client id>
NOTION_CLIENT_SECRET=<notion oauth client secret>

# Jira Cloud OAuth 3LO (optional — API token still works without this)
JIRA_CLIENT_ID=<jira oauth client id>
JIRA_CLIENT_SECRET=<jira oauth client secret>
```

### Fallback / dev credentials (no OAuth app registration required)

```bash
# GitHub — single-user PAT (store via POST /api/integrations-hub/github/pat)
GITHUB_TOKEN=ghp_your_personal_access_token

# Notion — internal integration token
NOTION_API_KEY=secret_your_integration_token

# Jira — API token
JIRA_EMAIL=you@company.com
JIRA_API_TOKEN=ATATT...
JIRA_DOMAIN=yourcompany.atlassian.net
```

### Webhook configuration

```bash
# Public URL that external platforms can POST to (required in production)
WEBHOOK_BASE_URL=https://api.yourcompany.com
```

---

## 5. OAuth Flows

### 5.1 GitHub

**OAuth App flow** (multi-user):

```
1. GET  /api/integrations-hub/github/auth
        → returns { authUrl: "https://github.com/login/oauth/authorize?..." }
2. User opens authUrl in browser, authorizes your app
3. GitHub redirects to GET /api/integrations-hub/github/callback?code=&state=
4. Server exchanges code → access_token, saves encrypted, redirects to frontend
```

**PAT flow** (dev / single user):

```bash
curl -X POST http://localhost:5001/api/integrations-hub/github/pat \
  -H "Authorization: Bearer <jwt>" \
  -H "workspace-id: <workspaceId>" \
  -H "Content-Type: application/json" \
  -d '{"token":"ghp_..."}'
```

Required scopes: `repo`, `read:user`, `read:org`

### 5.2 Slack

**OAuth v2 flow** (workspace installation):

```
1. GET  /api/integrations-hub/slack/auth
        → returns { authUrl: "https://slack.com/oauth/v2/authorize?..." }
2. User opens authUrl, installs app to their workspace
3. Slack redirects to GET /api/integrations-hub/slack/callback?code=&state=
4. Server exchanges code → bot_token + team_id, saves encrypted
```

Bot scopes requested: `channels:history`, `channels:read`, `chat:write`, `files:read`, `groups:history`, `groups:read`, `im:history`, `im:read`, `mpim:history`, `mpim:read`, `reactions:read`, `search:read`, `users:read`

### 5.3 Notion

**OAuth flow**:

```
1. GET  /api/integrations-hub/notion/auth
        → returns { authUrl: "https://api.notion.com/v1/oauth/authorize?..." }
2. User opens authUrl, selects pages to share
3. Notion redirects to GET /api/integrations-hub/notion/callback?code=&state=
4. Server exchanges code → access_token, saves encrypted
```

**Integration token flow** (simpler, for self-contained workspaces):

```bash
curl -X POST http://localhost:5001/api/integrations-hub/notion/token \
  -H "Authorization: Bearer <jwt>" \
  -H "workspace-id: <workspaceId>" \
  -H "Content-Type: application/json" \
  -d '{"token":"secret_..."}'
```

### 5.4 Jira Cloud

**OAuth 3LO flow** (recommended):

```
1. GET  /api/integrations-hub/jira/auth
        → returns { authUrl: "https://auth.atlassian.com/authorize?..." }
2. User opens authUrl, authorizes FLOW for their Jira cloud
3. Atlassian redirects to GET /api/integrations-hub/jira/callback?code=&state=
4. Server exchanges code → access_token + refresh_token + cloudId, saves encrypted
5. Tokens auto-refresh (expires after 1 hour; refresh token valid 90 days)
```

Required OAuth scopes: `read:jira-work`, `read:jira-user`, `write:jira-work`, `offline_access`

**API token flow** (no app registration required):

```bash
curl -X POST http://localhost:5001/api/integrations-hub/jira/token \
  -H "Authorization: Bearer <jwt>" \
  -H "workspace-id: <workspaceId>" \
  -H "Content-Type: application/json" \
  -d '{"email":"you@company.com","apiToken":"ATATT...","domain":"yourcompany.atlassian.net"}'
```

### 5.5 Gmail + Google Calendar

Uses the unified Google OAuth flow already in place:

```
1. GET  /api/google/auth
        → returns { authUrl: "https://accounts.google.com/o/oauth2/v2/auth?..." }
2. User opens authUrl
3. Google redirects to GET /api/google/callback?code=&state=
4. Server saves tokens; Gmail + Calendar capabilities activate automatically
```

---

## 6. Background Sync

### Sync intervals (per connector)

| Connector | Interval | Resource types |
|-----------|----------|----------------|
| GitHub    | 15 min   | pulls, commits |
| Slack     | 10 min   | messages       |
| Jira      | 20 min   | issues         |
| Notion    | 30 min   | pages          |
| Gmail     | 15 min   | messages       |
| Calendar  | 30 min   | events         |

### How incremental sync works

Each sync run:
1. Reads the cursor for `workspaceId + connectorId + resourceType` from `sync_state`
2. Fetches only items created/updated **after** the cursor timestamp
3. Pushes each item to `ingestion-queue` (BullMQ) for the 9-stage pipeline
4. On success, writes a new cursor and a `sync_records` row
5. Schedules the next sync via `next_sync_at` in `sync_state`

Cursors survive process restarts — syncs never re-ingest already-processed data.

### Manual sync trigger

```bash
curl -X POST http://localhost:5001/api/integrations-hub/github/sync \
  -H "Authorization: Bearer <jwt>" \
  -H "workspace-id: <workspaceId>"
```

Returns `{ queued: true }` immediately; actual sync runs in the BullMQ worker.

### Sync history

```bash
curl "http://localhost:5001/api/integrations-hub/github/sync/history?limit=10" \
  -H "Authorization: Bearer <jwt>" \
  -H "workspace-id: <workspaceId>"
```

---

## 7. Webhooks

### Registering a webhook

```bash
curl -X POST http://localhost:5001/api/integrations-hub/github/webhook \
  -H "Authorization: Bearer <jwt>" \
  -H "workspace-id: <workspaceId>"
```

Response:
```json
{
  "success": true,
  "endpointUrl": "https://api.yourcompany.com/api/webhooks/github?workspace=<workspaceId>",
  "eventTypes": ["push", "pull_request", "pull_request_review", "issues", "deployment", "deployment_status", "workflow_run"],
  "note": "Register this URL and the secret with your provider. The secret is shown only once.",
  "secret": "whsec_..."
}
```

Copy the `endpointUrl` and `secret` into your provider's webhook settings. The secret is shown **once only** and cannot be retrieved again.

### Webhook public endpoints

| Path | Provider | Verification |
|------|----------|-------------|
| `POST /api/webhooks/github` | GitHub App / OAuth App | `X-Hub-Signature-256: sha256=<HMAC-SHA256(body)>` |
| `POST /api/webhooks/slack`  | Slack Events API | `X-Slack-Signature: v0=<HMAC-SHA256("v0:ts:body")>` + 5-min replay window |
| `POST /api/webhooks/jira`   | Jira Connect | `X-Hub-Signature: sha256=<HMAC-SHA256(body)>` |

All endpoints are **public** (no JWT required) — HMAC verification is the security gate.

The `workspaceId` must be included in the registered URL:
```
https://api.yourcompany.com/api/webhooks/github?workspace=workspace_corp_alpha
```

Or via the `X-Flow-Workspace` header.

---

## 8. Admin REST API Reference

All routes at `/api/integrations-hub/*` require JWT + `workspace-id` header (except OAuth callbacks).

### Status endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/integrations-hub/status` | Status for all 6 connectors + sync stats + webhook info |
| GET | `/api/integrations-hub/:id/status` | Single connector status |
| GET | `/api/integrations-hub/:id/health` | Live health check (real API call) |

### Auth endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/integrations-hub/:id/auth` | Initiate OAuth flow (returns `{ authUrl }`) |
| GET | `/api/integrations-hub/github/callback` | GitHub OAuth callback |
| GET | `/api/integrations-hub/slack/callback` | Slack OAuth callback |
| GET | `/api/integrations-hub/notion/callback` | Notion OAuth callback |
| GET | `/api/integrations-hub/jira/callback` | Jira OAuth callback |
| POST | `/api/integrations-hub/github/pat` | Store GitHub PAT |
| POST | `/api/integrations-hub/notion/token` | Store Notion integration token |
| POST | `/api/integrations-hub/jira/token` | Store Jira API token |
| POST | `/api/integrations-hub/:id/disconnect` | Revoke credentials (soft delete) |

### Sync endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/integrations-hub/:id/sync` | Trigger manual sync (enqueues BullMQ job) |
| GET | `/api/integrations-hub/:id/sync/history` | Last N sync runs (`?limit=20`) |
| GET | `/api/integrations-hub/:id/sync/stats` | Aggregate stats (total items, success rate, avg duration) |

### Webhook endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/integrations-hub/:id/webhook` | Get webhook registration info |
| POST | `/api/integrations-hub/:id/webhook` | Register webhook (returns secret once) |
| DELETE | `/api/integrations-hub/:id/webhook` | Deactivate webhook |

---

## 9. Security Model

### Credential encryption

All credentials are encrypted with **AES-256-GCM** before storage:

- Encryption key: `crypto.scryptSync(JWT_SECRET, 'flow-connector-creds-v10', 32)`
- Stored format: `iv:authTag:ciphertext` (hex-encoded, colon-separated)
- The raw credential never leaves process memory unencrypted

### OAuth CSRF protection

Every OAuth state parameter is HMAC-signed to prevent CSRF:

```
state = base64url({ workspaceId, nonce: randomBytes(16), sig: HMAC-SHA256(JWT_SECRET, "${prefix}:${workspaceId}:${nonce}") })
```

On callback, the signature is verified with `crypto.timingSafeEqual` before the code is exchanged.

### Webhook signature verification

Each connector uses its platform's native HMAC scheme:

- **GitHub**: `X-Hub-Signature-256: sha256=<HMAC-SHA256(secret, body)>`
- **Slack**: `X-Slack-Signature: v0=<HMAC-SHA256(secret, "v0:${ts}:${body}")>` with 5-minute timestamp freshness check
- **Jira**: `X-Hub-Signature: sha256=<HMAC-SHA256(secret, body)>`

Webhook secrets are stored encrypted in `webhook_registrations.encrypted_secret`. A hash (`secret_hash`) is also stored for quick lookup without decryption.

### Credential lifecycle

- `revokeCredentials()` — sets `revoked_at` (soft delete, audit trail preserved)
- `deleteCredentials()` — hard DELETE from database (for GDPR erasure requests)
- Revoked credentials are treated as absent — `loadCredentials()` returns `null`

---

## 10. Integration Hub UI

`flow-os-frontend/src/components/platform/IntegrationHub.jsx`

Features per connector card:
- **Connection status** with health indicator (Connected / Degraded / Not connected)
- **Sync statistics**: total items synced, success rate, average duration, sync interval
- **OAuth / Token form**: inline credential entry with validation
- **Sync now** button: POST to `/api/integrations-hub/:id/sync`
- **Sync history** panel: last 8 runs with status, item count, duration
- **Webhook panel**: register/deactivate, endpoint URL, event types, last event time, one-time secret display
- **Disconnect** button with confirmation

Route: `/platform/integrations` (existing route, component swapped)

---

## 11. Adding a New Connector

1. **Create `src/services/integrations/MyConnectorOAuthService.js`** — implement `getAuthUrl`, `handleCallback`, `getAccessToken`, `getStatus`, `disconnect`, `healthCheck`
2. **Add `my-connector` case to `getOAuthService()`** in `integrationsAdminRoutes.js`
3. **Create `src/connectors/adapters/MyConnectorAdapter.js`** — extend `BaseAdapter`, implement `read/write/search/sync/execute`
4. **Register** in `src/connectors/adapters/index.js`
5. **Add webhook route** in `src/routes/webhookRoutes.js` if the platform supports webhooks
6. **Add sync function** in `src/workers/syncWorker.js` with an entry in `SYNC_FNS`
7. **Add connector definition** to the `CONNECTORS` array in `IntegrationHub.jsx`

No other files need to change.

---

*Phase 10.0 — Real Integration Platform. All connectors use provider-agnostic interfaces — adding a new source requires only the steps above.*
