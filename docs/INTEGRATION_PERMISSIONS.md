# Integration Permissions (Phase 13.1)

> OAuth authenticates. **Integration Permissions decide what FLOW is allowed to understand.**

Connecting Slack to FLOW does not give FLOW your Slack. It gives FLOW the *ability*
to ask. What it may actually read is decided here, per resource, by an administrator.

A resource that is not explicitly allowed is **never ingested** — not queued, not
stored, not embedded, not graphed, not replayed, not predicted, not simulated. It
is refused at the door, before any of those systems can see it.

---

## 1. Model

```
OAuth  →  Connected  →  Integration Permissions  →  Allowed resources
                                                          ↓
                                                      Sync Engine
                                                          ↓
                                                 Unified Event Platform
                                                          ↓
                                                   Operational Brain
```

Two tables (migration: `scripts/migrate-integration-permissions-v13.sql`):

| Table | Purpose |
|---|---|
| `integration_permissions` | One row per discovered resource: `(workspace, connector, resource_type, resource_id)` → `allowed` |
| `integration_permission_settings` | Per workspace+connector: `auto_allow_new`, `dm_policy`, `legacy_grandfathered` |

`workspace_id` is the raw `workspace-id` header value (matching `sync_state` /
`connector_credentials`), not the Workspace cuid.

## 2. Governed connectors

Real API discovery and enforcement exist for the six connectors that have a sync
adapter:

| Connector | Resource types | Discovery source |
|---|---|---|
| Slack | channel · private_channel · group | `conversations.list`, `usergroups.list` |
| GitHub | organization · repository | `/user/orgs`, `/user/repos` (paginated) |
| Gmail | label | `users.labels.list` |
| Google Calendar | calendar | `calendarList.list` |
| Notion | page · database | `/v1/search` (paginated) |
| Jira | project | `/rest/api/3/project/search` |

Teams, SharePoint, OneDrive, Dropbox, Drive and Confluence appear in the UI as
disabled cards. They have no adapter, so **no resources are fabricated for them.**

## 3. Enforcement — every door

There are four ways connector data can enter FLOW. All four are gated.

| Door | File | Gate |
|---|---|---|
| Scheduled/manual sync | `services/sync/SyncEngine.js` | `filterItems()` runs **before dedup**, so a blocked item leaves no trace in the queue, the dedup table, or the vector store |
| Webhooks | `services/webhooks/WebhookProcessor.js` | `isWebhookAllowed()` runs **before persistence** — `webhook_events` stores the raw payload, so gating any later would write a hidden channel's contents to disk |
| Capability sync routes | `GitHubAdapter` · `GmailAdapter` · `GoogleCalendarAdapter` | `isResourceIdAllowed()` — `/api/engineering/sync` on an unauthorized repo returns `403 RESOURCE_NOT_PERMITTED` |
| Legacy Google services | `gmailInboundService.js` · `calendarIntegration.js` | `isResourceIdAllowed()` per message / calendar |

Google Calendar additionally **fans out only over allowed calendars**
(`getAllowedResourceIds`) instead of fetching everything and discarding — the
adapter previously hardcoded `calendarId: 'primary'`.

## 4. Decision order

`core/governance/integrationPermissions/permissionGate.js`:

1. Connector has no sync adapter → **ALLOW** (nothing to govern)
2. Connector is legacy-grandfathered → **ALLOW** (§6)
3. Item maps to no resource → **DENY** (ungovernable ⇒ not ingested)
4. Slack DM → `dmPolicy` (`NEVER` | `BOT_ONLY` | `SELECTED` | `ALL`)
5. Any candidate resource allowed → **ALLOW** (any-of: a Gmail message with both
   `Engineering` and `INBOX` passes if either label is allowed)
6. Resource unknown to the catalog → `autoAllowNew ? ALLOW : DENY`
7. Otherwise → **DENY**

Step 3 matters: failing open on an unattributable item would quietly defeat the
whole feature, so an item FLOW cannot attribute is an item FLOW does not read.

## 5. Adding a connector

Three additions, no changes to existing code:

1. `resourceTypes.js` — add the connector + its resource types
2. `resourceDiscovery.js` — add a discovery function (real API)
3. `resourceKeyExtractor.js` — map its sync item / webhook payload → resource key

## 6. Grandfathering (why the deploy is not breaking)

Deny-by-default applied to an existing installation would stop ingestion for every
already-connected workspace the moment it shipped.

So the migration flags every `(workspace, connector)` with existing sync history as
`legacy_grandfathered`. The gate lets that connector's traffic through untouched,
and the UI marks it **Ungoverned**. The first discovery seeds its catalog as
*allowed* — preserving exactly the access it already had — and clears the flag.
From then on the connector is governed: anything new is hidden by default.

## 7. API

Mounted at `/api/integration-permissions` (JWT + `workspace-id`; mutations ADMIN/OWNER).
Every mutation writes an `AuditLog` row and broadcasts `INTEGRATION_PERMISSIONS_UPDATED`.

| Method | Path | Description |
|---|---|---|
| GET | `/` | All connectors + allowed/hidden counts + `ungoverned` flag |
| GET | `/:connector` | Catalog + settings (filters: `q`, `status`, `type`) |
| POST | `/:connector/discover` | Real provider API → catalog. `409 NOT_CONNECTED` if unauthenticated |
| PUT | `/:connector/resources` | Bulk allow/hide `{ changes: [{resourceType, resourceId, allowed}] }` |
| POST | `/:connector/bulk` | Allow all / hide all (optionally one type) |
| PATCH | `/:connector/settings` | `autoAllowNew`, `dmPolicy` |
| GET | `/:connector/audit` | Permission-change history |

## 8. UI

`/settings/permissions` — overview cards (allowed/total, hidden count, Ungoverned
pill) → per-connector detail with search, All/Allowed/Hidden filters, grouped
collapsible tree, bulk actions, Slack DM policy, auto-allow toggle, and a sticky
save bar (nothing is applied until you save). An unconnected connector shows an
empty state — never invented resources.

## 9. Validation

```bash
node scripts/validate-integration-permissions.js   # 40/40
```

Covers deny-by-default, discovery, explicit allow, batch filtering, re-discovery
preserving decisions, `autoAllowNew`, all four DM policies, per-connector
attribution using the **real item shapes emitted by each sync adapter**, the
webhook door, the capability-route door, and the full grandfathering handoff.
