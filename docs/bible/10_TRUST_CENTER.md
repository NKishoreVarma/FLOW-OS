# FLOW OS — Trust Center
**Document:** 10 of 20  
**Status:** Authoritative  
**Last updated:** 2026-07-18

---

## Mission

The Trust Center is not a settings page. It is a trust declaration.

FLOW never reads a calendar, repository, channel, document, or email without explicit permission. The Trust Center makes this contract visible and controllable at all times.

> "What FLOW can see. What FLOW cannot see. What FLOW is allowed to reason about."

This is the central promise of FLOW's enterprise trust model. Every decision the AI makes is grounded in data you have explicitly permitted it to access. A resource that is not explicitly allowed is never ingested — not queued, not stored, not embedded, not graphed, not replayed, not predicted. It is refused at the door.

---

## Architecture

### Two Concepts

**OAuth** — proves you own the account (GitHub, Slack, Gmail, etc.)  
**Integration Permissions** — decides what within that account FLOW may read

These are independent. Authenticating with OAuth does not grant FLOW access to everything. OAuth only unlocks the resource discovery flow. The user must then explicitly allow each resource.

### Deny-by-Default

When a connector is first connected:
- All resources are in the "FLOW CANNOT SEE" state
- Nothing is ingested, nothing is vectorized, nothing is graphed
- The user sees the full resource catalog and makes explicit selections

This is not the typical SaaS approach ("allow everything, let users opt out"). FLOW reverses it: deny everything, require explicit allow.

### Enforcement Points

The Trust Center is not cosmetic. The deny-by-default gate is enforced at every ingestion door:

| Door | Where enforced | Note |
|---|---|---|
| Sync | `SyncEngine.runSync` → `filterItems()` | Runs **before dedup** — blocked items leave no trace |
| Webhooks | `WebhookProcessor.processWebhookRequest` | Gate runs **before persistence** |
| Gmail sync | `GmailAdapter.syncInbox()` | Per-label permission check |
| Calendar sync | `GoogleCalendarAdapter.syncCalendar()` | Per-calendar, per-sync-token |
| GitHub sync | `GitHubAdapter.syncPRsAndCommits()` | Per-repository |
| Capability routes | `communicationRoutes`, `meetingRoutes`, `engineeringRoutes` | 403 RESOURCE_NOT_PERMITTED |

A resource excluded in the Trust Center never enters the pipeline. Not via webhook, not via manual sync, not via capability API.

---

## Route

**Primary:** `/integrations`  
**Trust tab active:** `/integrations/trust` (same page, Trust tab active by default)  
**Sync status tab:** `/integrations/sync`

The route `/settings/permissions` redirects to `/integrations` permanently.

The Trust Center must be accessible from:
- Sidebar: "Integrations" → "Trust Center" (first sub-item under Integrations group)
- ⌘K: typing "trust" or "permissions" → "Trust Center"
- Onboarding step 3 (Permissions step)
- First-run flow

---

## Page Structure

### Overview (Landing View)

```
FLOW TRUST CENTER
──────────────────────────────────────────────────────────────────

These are the sources FLOW is allowed to reason about.
You are in full control of what enters the Operational Brain.

Nothing is ingested, stored, or analyzed without your explicit
permission for each source and each resource within that source.

──────────────────────────────────────────────────────────────────
Connected Sources

● Google Calendar    🟢 Connected     4 of 9 calendars included
● GitHub             🟢 Connected     6 of 8 repositories included
● Gmail              🟢 Connected     3 of 12 labels included
● Slack              🟢 Connected     12 of 31 channels included
● Notion             🟢 Connected     2 of 7 workspaces included
● Jira               🟢 Connected     3 of 4 projects included

──────────────────────────────────────────────────────────────────
Not Connected

○ Google Drive
○ Microsoft Teams
○ Confluence
○ Salesforce
○ HubSpot
○ Workday
○ BambooHR

[+ Add Integration]
──────────────────────────────────────────────────────────────────

PRIVACY PRINCIPLE
Nothing enters the FLOW Operational Brain without your explicit
approval. Personal, private, and DM content is never ingested
regardless of permission settings.
```

Each connected connector row is clickable. Clicking opens the `ConnectorPanel` for that connector.

### Connector Health Indicator

Each connector row shows:
- Status dot: green (connected), gray (disconnected), orange (warning/error)
- Last synced: "Synced 2 minutes ago" or "Last sync failed 4 hours ago"
- Resource ratio: "X of Y [resource type] included"

The status dot is derived from the connector's health check (`GET /api/connectors/health`).

---

## ConnectorPanel — Per-Connector Resource Governance

When the user clicks a connected connector, the ConnectorPanel opens as a full-width panel replacing the overview (or as a right-side slide-in on wide viewports).

### Layout

```
← Trust Center    Google Calendar    🟢 Connected · Synced 2 minutes ago

──────────────────────────────────────────────────────────────────────
FLOW CAN SEE (4)                    FLOW CANNOT SEE (5)
──────────────────────────────────────────────────────────────────────
🟢 Engineering Team      ↔          ⚪ Personal
🟢 Product Planning      ↔          ⚪ Family
🟢 Company Holidays      ↔          ⚪ Birthdays
🟢 Customer Meetings     ↔          ⚪ Private
                                    ⚪ Travel
──────────────────────────────────────────────────────────────────────

[Include All]   [Exclude All]   [Rediscover Resources]   [Disconnect]

──────────────────────────────────────────────────────────────────────
PRIVACY ASSURANCE
Disabled resources are never ingested, indexed, summarized,
or referenced — not now, not in future syncs. Enabling a
resource will only affect data from the next sync forward.
──────────────────────────────────────────────────────────────────────
```

### The ↔ Toggle

Each resource row has a toggle that moves the resource from left column to right column and vice versa. Toggling is instant in the UI. The API call (`PUT /api/integration-permissions/:connector/resources`) fires immediately. If it fails, the toggle reverts and an inline error appears.

### ResourceToggle Component (per row)

```
🟢 Engineering Team              [●●●○] ON    Last synced: 2m ago
⚪ Personal                       [○○○●] OFF   (never ingested)
```

Fields per row:
- Status icon (green dot / white dot)
- Resource name
- Resource type (for Slack: "channel" / "private_channel" / "group")
- Toggle control
- Last sync timestamp (only for included resources)
- Source label

---

## Per-Connector Resource Types

### Gmail

```
Resource type: Label
Governed resources: All Gmail labels
Examples: Work, Important, Unread, Custom labels, All Mail
Special: INBOX, SENT, DRAFT are system labels — always excluded from sync context
DM policy: N/A (Gmail has no DM concept)
```

### Google Calendar

```
Resource type: Calendar
Governed resources: All calendars in the Google account
Examples: Primary, Engineering Team, Company Holidays, Personal, Family
Special: Primary calendar is a named resource — user can exclude it
```

### GitHub

```
Resource type: Repository
Governed resources: All repositories the authenticated user has access to
Examples: flow-os-backend, flow-os-frontend, company/infrastructure
Special: Private repos require explicit include; organization repos require org-level auth
```

### Slack

```
Resource type: Channel, Private Channel, Group
Governed resources: All channels the bot is a member of
Examples: #engineering, #general, #random, #security-incidents
DM policy: Configurable toggle (4 options):
  - INCLUDE — DMs are ingested (not recommended)
  - EXCLUDE — DMs are never ingested (default)
  - NAMED_ONLY — Only DMs with users named in the workspace
  - ASK — Each DM asks for permission (not implemented in v1)
Special: DM policy applies globally; per-user DM control is future
```

### Notion

```
Resource type: Page, Database
Governed resources: Pages and databases the integration has access to
Examples: Engineering Handbook, Product Roadmap, Team Wiki, OKRs Database
Special: Nested pages inherit parent's permission unless individually overridden
```

### Jira

```
Resource type: Project
Governed resources: All Jira projects the API key has access to
Examples: FLOW, ENG, SUPPORT, INFRA
Special: Jira comments carry the project field for permission attribution
```

---

## Not-Connected Connectors

Teams, SharePoint, OneDrive, Confluence, Salesforce, HubSpot, Workday, BambooHR appear as grayed-out cards in the overview with "Not connected" status and a "Connect" button.

These render with:
- Grayed status dot
- "Not connected" label
- "Connect →" button that initiates the OAuth/auth flow
- No fabricated resources (do not show "0 channels included")

---

## Grandfathering (Migration Safety)

When an enterprise deploys FLOW and connects a connector for the first time after an existing sync history, all resources with historical sync records are flagged `legacy_grandfathered = true`. The Trust Center shows these as:

```
⚠️ Ungoverned (legacy) — 15 resources
These were synced before Trust Center governance was introduced.
[Review and govern] → opens discovery + explicit selection
```

The first discovery run seeds the catalog as "allowed" (preserving existing access) and clears the grandfathered flag. From that point, deny-by-default applies.

---

## Sync Status Tab (`/integrations/sync`)

Shows per-connector sync health:

```
CONNECTOR           LAST SYNC      STATUS          NEXT SYNC
Google Calendar     2m ago         ✓ Success       8m
GitHub              4m ago         ✓ Success       6m
Gmail               12m ago        ✓ Success       18m
Slack               3h ago         ✗ Failed        Retrying
Jira                6m ago         ✓ Success       4m
Notion              1h ago         ✓ Success       30m
```

Failed sync row:
- Shows error message: "Authentication expired. Re-authenticate to resume sync."
- Shows `[Re-authenticate]` button
- Shows last successful sync time

---

## Trust Center Governance

Changes to resource permissions are audited:

| Action | Audit record |
|---|---|
| Resource allowed | `type: PERMISSION_CHANGED, action: ALLOW, resource: X, connector: Y` |
| Resource excluded | `type: PERMISSION_CHANGED, action: EXCLUDE, resource: X, connector: Y` |
| Bulk include all | `type: PERMISSION_CHANGED, action: BULK_ALLOW, connector: Y, count: N` |
| Bulk exclude all | `type: PERMISSION_CHANGED, action: BULK_EXCLUDE, connector: Y, count: N` |
| Connector disconnected | `type: CONNECTOR_DISCONNECTED, connector: Y` |
| Credentials revoked | `type: CREDENTIALS_REVOKED, connector: Y` |

All permission changes are visible in the Audit Logs at `/settings/audit`.

Role requirements:
- Viewing Trust Center: any authenticated workspace member
- Toggling resources: ADMIN or OWNER
- Bulk actions: ADMIN or OWNER
- Disconnecting a connector: OWNER only
- Governing DM policy: OWNER only

---

## Trust Summary Widget

A compact trust summary appears on the Home page and can appear on any page where trust context is relevant. It shows:

```
6 sources connected · 30 resources included
[Manage permissions]
```

Clicking "Manage permissions" navigates to `/integrations`.

This widget communicates, at a glance, that FLOW's intelligence is grounded in explicitly permitted data — reinforcing the trust model to users who may have forgotten their permission selections.
