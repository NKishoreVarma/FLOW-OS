# FLOW OS — Connectors
**Document:** 13 of 20  
**Status:** Authoritative  
**Last updated:** 2026-07-18

---

## Overview

Connectors are the integrations between FLOW and the tools companies use. Every connector follows the Universal Connector Framework — a standardized interface that makes adding a new integration a matter of writing one adapter file, with zero changes to existing code.

---

## Architecture

### Layers

```
REST API routes (communicationRoutes, engineeringRoutes, meetingRoutes...)
    ↓
ExecutionEngine (governance + audit + timeline + WS broadcast)
    ↓
ConnectorRegistry (resolves adapter by id or capability)
    ↓
Adapter (connector-specific: GmailAdapter, GitHubAdapter...)
    ↓
Provider API (Gmail, GitHub, Google Calendar...)
```

### ConnectorRegistry

Singleton at `src/connectors/registry.js`. All adapters self-register on import via side-effect in `src/connectors/adapters/index.js` (imported once in `server.js`).

```js
registry.register(adapterId, adapterInstance)
registry.resolve(adapterId)         // → adapter or null
registry.resolveByCapability(cap)   // → first adapter for capability
registry.health()                   // → health status for all adapters
```

### BaseAdapter Interface

Every connector must extend `BaseAdapter` and implement:

```js
class BaseAdapter {
  constructor(id, capability)
  
  // Required implementations:
  async executeAction(actionType, params, context) { }
  async healthCheck() { }          // → { status: 'HEALTHY'|'DEGRADED'|'DOWN', ... }
  async search(query, context) { } // → [SearchResult, ...]
  async syncToIngestion(params, context) { }

  // Provided by BaseAdapter:
  get supportedActions() { }       // returns this._supportedActions
  normalizeOutput(raw) { }         // wraps in standard FLOW types
}
```

`_hasGetterOnly` guard prevents BaseAdapter from overwriting a subclass getter — this fixed the SlackAdapter boot crash (see TD Phase 12).

---

## Capabilities

Ten capability categories. Each connector declares which capabilities it supports.

| Capability | Description |
|---|---|
| `COMMUNICATION` | Email, messaging (send, receive, thread, label) |
| `MEETING` | Calendar, scheduling, event management |
| `ENGINEERING` | Code repositories, PRs, deployments, reviews |
| `WORK_MANAGEMENT` | Issue tracking, project management, sprints |
| `KNOWLEDGE` | Documents, wikis, notes, databases |
| `CUSTOMER_INTELLIGENCE` | CRM, deals, contacts, opportunities |
| `WORKFORCE_INTELLIGENCE` | HR, employees, org chart, performance |
| `ANALYTICS` | Metrics, dashboards, reports |
| `INFRASTRUCTURE` | Cloud resources, logs, monitoring |
| `IDENTITY` | SSO, directory, access management |

---

## Connector Catalog

### Tier 1: Production Adapters (fully implemented)

#### GmailAdapter
- **File:** `src/connectors/adapters/GmailAdapter.js`
- **Capability:** COMMUNICATION
- **Auth:** OAuth2 (Google) — consent URL → token exchange → auto-refresh
- **API:** Gmail REST API via `googleapis` package
- **Supported Actions:**
  - `LIST_EMAILS` — inbox listing with label filter, pagination, Gmail query
  - `GET_THREAD` — full thread with all messages, MIME tree walking
  - `GET_MESSAGE` — single message, recursive multipart MIME parsing
  - `LIST_LABELS` — all Gmail labels
  - `SEARCH_EMAILS` — raw Gmail query syntax passthrough
  - `SEND_EMAIL` — RFC 2822 MIME, base64url, multipart/alternative
  - `REPLY_EMAIL` — fetches original for threading headers (In-Reply-To, References)
  - `REPLY_ALL` — same + all recipients
  - `FORWARD_EMAIL` — prepends original body
  - `CREATE_DRAFT` — saves draft to Gmail
  - `MODIFY_LABELS` — per-message and per-thread, named shortcuts (archive, markRead, star, trash)
  - `SYNC_INBOX` — bulk sync to BullMQ ingestion queue
- **Health check:** `gmail.users.getProfile` — 503 if credentials absent
- **Trust Center resources:** Gmail labels (governed per-label)
- **REST routes:** `/api/communication/*` (14 routes)
- **Env vars:** `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`

#### GoogleCalendarAdapter
- **File:** `src/connectors/adapters/GoogleCalendarAdapter.js`
- **Capability:** MEETING
- **Auth:** OAuth2 (Google) — separate token from Gmail, same client credentials
- **API:** Google Calendar REST API via `googleapis`
- **Supported Actions:**
  - `LIST_UPCOMING_EVENTS` — configurable look-ahead days and limit
  - `LIST_PAST_EVENTS` — configurable look-back, most-recent-first
  - `GET_EVENT` — single event with FLOW metadata from `extendedProperties.private`
  - `SEARCH_EVENTS` — full-text across ±90 days
  - `CREATE_EVENT` — attendees, location, Google Meet video conference generation
  - `UPDATE_EVENT` — title, description, times, FLOW metadata
  - `DELETE_EVENT` — removes from calendar
  - `ADD_MEETING_NOTES` — stores as `flow_notes` in `extendedProperties.private`
  - `ADD_ACTION_ITEMS` — stores as `flow_actions` in `extendedProperties.private`
  - `ADD_MEETING_SUMMARY` — stores as `flow_summary` in `extendedProperties.private`
  - `SYNC_EVENTS` — BullMQ ingestion + KG node registration (EVENT + USER entities, ATTENDING edges)
- **Health check:** `calendarList.list` — DEGRADED if unauthenticated
- **Trust Center resources:** Per-calendar governance (allowed calendars, per-calendar sync-token map)
- **REST routes:** `/api/meetings/*` (15 routes)
- **Env vars:** `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`

#### GitHubAdapter
- **File:** `src/connectors/adapters/GitHubAdapter.js`
- **Capability:** ENGINEERING
- **Auth:** Personal Access Token (PAT) — stored via `storeApiKey()` or `GITHUB_TOKEN` env var
- **API:** GitHub REST API via native `fetch` (Node 20+)
- **API Version header:** `X-GitHub-Api-Version: 2022-11-28`
- **Supported Actions:**
  - `LIST_REPOSITORIES` — user/org repos
  - `GET_REPOSITORY` — metadata (language, stars, forks, openIssues, topics)
  - `LIST_CONTRIBUTORS` — top contributors with contribution counts
  - `LIST_BRANCHES` — branch list
  - `COMPARE_REFS` — ahead/behind commits, status
  - `LIST_COMMITS` — history
  - `GET_COMMIT` — single commit with file diffs (filename, status, additions, deletions, patch preview)
  - `LIST_PULL_REQUESTS` — open/draft/closed
  - `GET_PULL_REQUEST` — detail with `mergeReadinessScore` (0–100)
  - `LIST_REVIEWS` — reviews + reviewer workload + `suggestedReviewers`
  - `LIST_DEPLOYMENTS` — by environment
  - `GET_DEPLOYMENT` — single with `riskScore` (0–100)
  - `CREATE_BRANCH` — from SHA or existing branch ref
  - `CREATE_PULL_REQUEST` — title, body, head, base, draft
  - `UPDATE_PULL_REQUEST` — patch title, body, state, base branch
  - `APPROVE_PULL_REQUEST` — submit APPROVE/REQUEST_CHANGES/COMMENT review
  - `MERGE_PULL_REQUEST` — squash/merge/rebase
  - `SEARCH` — code, repositories, commits, issues
  - `SYNC` — pushes open PRs + recent commits to BullMQ; registers PR authors as KG nodes with `authored_by` edges
- **Health check:** `/rate_limit` endpoint — reports remaining quota; DEGRADED if no credentials
- **Trust Center resources:** Per-repository governance
- **REST routes:** `/api/engineering/*` (22 routes)
- **Env vars:** `GITHUB_TOKEN`, `GITHUB_API_URL` (optional, for GitHub Enterprise)

#### HubSpotAdapter
- **File:** `src/connectors/adapters/HubSpotAdapter.js`
- **Capability:** CUSTOMER_INTELLIGENCE
- **Auth:** API Key or OAuth2
- **Status:** Production data when connected; CustomerIntelligence page uses demo fallback
- **REST routes:** `/api/crm/*`

#### WorkdayAdapter
- **File:** `src/connectors/adapters/WorkdayAdapter.js`
- **Capability:** WORKFORCE_INTELLIGENCE
- **Auth:** Service Account + OAuth2
- **Status:** Production data when connected; PeopleIntelligence page uses demo fallback
- **REST routes:** `/api/hr/*`

### Tier 2: Skeleton Adapters (registered, not yet production)

| Adapter | File | Capability | Auth | Status |
|---|---|---|---|---|
| ConfluenceAdapter | `adapters/ConfluenceAdapter.js` | KNOWLEDGE | OAuth2 / API Token | Skeleton |
| GoogleDriveAdapter | `adapters/GoogleDriveAdapter.js` | KNOWLEDGE | OAuth2 | Skeleton |
| NotionAdapter | `adapters/NotionAdapter.js` | KNOWLEDGE | OAuth2 / API Key | Skeleton |
| SalesforceAdapter | `adapters/SalesforceAdapter.js` | CUSTOMER_INTELLIGENCE | OAuth2 | Skeleton |
| BambooHRAdapter | `adapters/BambooHRAdapter.js` | WORKFORCE_INTELLIGENCE | API Key | Skeleton |
| JiraAdapter | `adapters/JiraAdapter.js` | WORK_MANAGEMENT | OAuth2 / API Token | Skeleton |

### Tier 3: Planned (Not Yet Built)

| Connector | Capability | Notes |
|---|---|---|
| Slack | COMMUNICATION | Listed in IntegrationHub, auth flow stub |
| Microsoft Teams | COMMUNICATION | Disabled card in Trust Center |
| SharePoint | KNOWLEDGE | Disabled card |
| Microsoft OneDrive | KNOWLEDGE | Disabled card |
| Dropbox | KNOWLEDGE | Planned |
| Linear | WORK_MANAGEMENT | Planned |
| Asana | WORK_MANAGEMENT | Planned |
| Zendesk | CUSTOMER_INTELLIGENCE | Planned |
| Intercom | CUSTOMER_INTELLIGENCE | Planned |

---

## Adding a New Connector

The Universal Connector Framework ensures adding a connector requires exactly these steps and no others:

**Step 1: Create the adapter file**

```js
// src/connectors/adapters/SlackAdapter.js
import BaseAdapter from '../BaseAdapter.js';
import { Capability } from '../capabilities.js';

export class SlackAdapter extends BaseAdapter {
  constructor() {
    super('slack', Capability.COMMUNICATION);
    this._supportedActions = ['LIST_CHANNELS', 'POST_MESSAGE', 'GET_THREAD', ...];
  }

  async executeAction(actionType, params, context) {
    switch (actionType) {
      case 'POST_MESSAGE': return this._postMessage(params, context);
      // ...
    }
  }

  async healthCheck() {
    // Return { status: 'HEALTHY'|'DEGRADED'|'DOWN', ... }
  }

  async search(query, context) {
    // Return [SearchResult, ...]
  }
}
```

**Step 2: Register the adapter**

```js
// src/connectors/adapters/index.js
import { SlackAdapter } from './SlackAdapter.js';
registry.register('slack', new SlackAdapter());
```

**Step 3: Add Trust Center resource type**

In `src/core/governance/integrationPermissions/resourceTypes.js`:
```js
slack: {
  resourceTypes: ['channel', 'private_channel', 'group'],
  dmPolicy: true,
}
```

**Step 4: Add Integration Hub entry**

In `IntegrationHub.jsx`, add connector metadata to the connector array.

That is all. No route files change. No backend logic changes. The new connector appears in the Trust Center, the connector health dashboard, universal search, and execution pipeline automatically.

---

## AuthManager

Manages credentials for all connectors. Stored encrypted in the database.

```js
// OAuth2 (Google, Slack, GitHub OAuth)
authManager.storeOAuth2Tokens(workspaceId, connectorId, { access_token, refresh_token, expiry_date })
authManager.getOAuth2Tokens(workspaceId, connectorId)
authManager.refreshOAuth2Token(workspaceId, connectorId)

// API Key (GitHub PAT, Jira API Token, Notion Token)
authManager.storeApiKey(workspaceId, connectorId, key)
authManager.getApiKey(workspaceId, connectorId)

// Service Account (Workday, BambooHR)
authManager.storeServiceAccount(workspaceId, connectorId, credentials)
```

Credentials are never logged. All log calls involving credentials run through the `redact()` function from `logger.js`.

---

## Connector Health

`GET /api/connectors/health` returns health status for all registered connectors in the workspace.

```json
{
  "gmail": { "status": "HEALTHY", "latency": 45, "lastChecked": "2026-07-18T07:00:00Z" },
  "google-calendar": { "status": "HEALTHY", "latency": 38 },
  "github": { "status": "DEGRADED", "reason": "Rate limit at 97%", "remaining": 58 },
  "jira": { "status": "DOWN", "reason": "Authentication expired" }
}
```

Status values:
- `HEALTHY` — connector is fully operational
- `DEGRADED` — connector is operational but with limitations (rate limit, partial auth, old sync)
- `DOWN` — connector is not functioning (auth failed, API unreachable)

Health status shown as colored dots in Trust Center and in Integrations sidebar group.

---

## Universal Search

`SearchOrchestrator` fans out a search query to all connected adapters in parallel.

```js
const results = await searchOrchestrator.search(workspaceId, {
  query: 'auth service deployment history',
  connectors: ['github', 'jira', 'slack'], // or omit to search all
  limit: 20,
});
```

Each adapter's `search()` method normalizes results to `createSearchResult()` from `normalizedTypes.js`. Results are merged and ranked by relevance + source authority weight.

Search results are surfaced in:
- Knowledge Explorer
- Brain conversation (when context retrieval needs live connector data)
- CommandPalette brain search
