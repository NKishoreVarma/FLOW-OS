# Blueprint: Trust Center — `/integrations`
**Document:** BP-12  
**Last updated:** 2026-07-18  
**Status:** Authoritative

---

## Purpose

Answer one question: **"What is FLOW allowed to see, and why?"**

The Trust Center is where users control the exact boundary of FLOW's knowledge. It is NOT a connector management page — OAuth handles connection. Trust Center handles **what** FLOW may read from each connected system. Its primary action is toggling resource access (allow/hide).

---

## Target User

**Primary:** OWNER, ADMIN  
**Secondary:** CTO managing compliance  
**Frequency:** During setup; when a new repository/channel is added; when auditing what FLOW knows

---

## Entry Points

| Source | How |
|---|---|
| Sidebar | Platform group → "Integrations" → "Trust Center" |
| `⌘K` → "Trust Center" | CommandPalette |
| Onboarding flow | Step 3 (Permissions) |
| Success Dashboard | "Manage permissions" link |
| Direct URL | `/integrations` |

---

## Layout Hierarchy

```
┌─────────────────────────────────────────────────────────────────┐
│ Sidebar (220px)                                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  PageHeader: Trust Center                                       │
│  "Control exactly what FLOW is allowed to understand."          │
│  ──────────────────────────────────────────────────────────     │
│                                                                 │
│  TrustBar (reusable) — connected systems + health               │
│  ──────────────────────────────────────────────────────────     │
│                                                                 │
│  ConnectorGrid (2-column on large screens)                      │
│  ┌──────────────────────────┐  ┌──────────────────────────┐    │
│  │  GitHub                  │  │  Gmail                   │    │
│  │  ConnectorPanel          │  │  ConnectorPanel          │    │
│  └──────────────────────────┘  └──────────────────────────┘    │
│  ┌──────────────────────────┐  ┌──────────────────────────┐    │
│  │  Google Calendar         │  │  Slack                   │    │
│  └──────────────────────────┘  └──────────────────────────┘    │
│  ┌──────────────────────────┐  ┌──────────────────────────┐    │
│  │  Notion                  │  │  Jira                    │    │
│  └──────────────────────────┘  └──────────────────────────┘    │
│  ──────────────────────────────────────────────────────────     │
│                                                                 │
│  DisabledConnectors (greyed cards, not available)               │
│  Teams · SharePoint · OneDrive · Dropbox · Drive · Confluence   │
│                                                                 │
│  [StickyCommandCenter]                                          │
└─────────────────────────────────────────────────────────────────┘
```

---

## Information Hierarchy

```
Level 1  TrustBar — connected systems summary
Level 2  ConnectorGrid (6 governed connectors)
Level 3  Each ConnectorPanel — resources visible / hidden
Level 4  Resource toggles and bulk actions
Level 5  DM policy (Slack only)
Level 6  Disabled connectors (informational)
Level 7  StickyCommandCenter
```

---

## Components

| Component | File | Notes |
|---|---|---|
| `TrustCenter` | `components/platform/TrustCenter.jsx` (new) | Page orchestrator |
| `ConnectorPanel` | Inline | Per-connector resource list |
| `ResourceRow` | Inline | Single resource toggle |
| `DmPolicySelector` | Inline | Slack DM policy (4 options) |
| `TrustBar` | `components/ui/TrustBar.jsx` | Reusable trust strip |
| `AuditLogPanel` | Right slide-over | Permission change history |

---

## Data Sources

| Data | Source | Notes |
|---|---|---|
| Connector list | `GET /api/integration-permissions?workspaceId={ws}` | Counts per connector |
| Resource catalog | `GET /api/integration-permissions/{connector}?workspaceId={ws}` | Full resource list |
| Discovery | `POST /api/integration-permissions/{connector}/discover` | ADMIN+ triggers real provider API call |
| Bulk update | `PUT /api/integration-permissions/{connector}/resources` | Allow/hide multiple at once |
| Settings | `PATCH /api/integration-permissions/{connector}/settings` | autoAllowNew, dmPolicy |
| Audit log | `GET /api/integration-permissions/{connector}/audit` | Permission change history |

---

## Governed Connectors (6)

These connectors have resource-level permission control. Each renders a full ConnectorPanel.

| Connector | Resource Types | Notes |
|---|---|---|
| `github` | `organization`, `repository` | Org → repos hierarchy |
| `gmail` | `label` | Labels control which inbox messages FLOW reads |
| `google-calendar` | `calendar` | Which calendars FLOW syncs |
| `slack` | `channel`, `private_channel`, `group` | Channel-level control + DM policy |
| `notion` | `page`, `database` | Page/database permissions |
| `jira` | `project` | Which projects FLOW reads |

---

## ConnectorPanel Layout

Each governed connector renders as a panel:

```
┌────────────────────────────────────────────────────────────────┐
│  [GitHub icon]  GitHub                  [Connected ✓]          │
│  3 of 12 repositories allowed · Last synced: 2h ago            │
│  ──────────────────────────────────────────────────────────    │
│                                                                │
│  FLOW CAN SEE                          FLOW CANNOT SEE         │
│  ───────────────                       ───────────────         │
│  ✓ flow-os-backend                     ✗ archived-v1           │
│  ✓ flow-os-frontend                    ✗ personal-notes         │
│  ✓ infra-config                        ✗ test-repo-2            │
│                                                                │
│  ──────────────────────────────────────────────────────────    │
│  [search resources...]                                         │
│  [Allow all] [Hide all]   Auto-allow new: [Off ▾]  [Discover] │
│  ──────────────────────────────────────────────────────────    │
│  [View audit log]                                              │
└────────────────────────────────────────────────────────────────┘
```

The two-column layout (FLOW CAN SEE / FLOW CANNOT SEE) is the canonical mental model. Resources are never hidden in a nested tree — they are visible in one column or the other.

---

## Resource Row

Each resource row:

```
[toggle]  flow-os-backend          [repository]  Updated 2h ago
```

- Toggle: ON = allowed, OFF = hidden
- Toggle change calls `PUT /api/integration-permissions/{connector}/resources` immediately
- No save button — changes are instant and durable
- Confirmation toast: `"flow-os-backend — FLOW can now see this repository"`
- Optimistic update: toggle flips immediately, reverts on API error

---

## Ungoverned / Grandfathering State

When a connector was connected before governance was enabled (legacy grandfathered):

```
[GitHub icon]  GitHub               [UNGOVERNED]
⚠ This connector was connected before permissions were enabled.
  FLOW can currently see all resources.
  Run discovery to govern what FLOW reads.
  [Discover resources →]
```

After discovery: resources are seeded as `allowed` (preserving existing access) and the UNGOVERNED badge is removed. The connector is now fully governed (deny-by-default for new resources).

---

## Slack DM Policy Selector

Slack-only section, below the channel list:

```
DIRECT MESSAGES
FLOW's access to direct message conversations.

○ Never read DMs (most private)
● Read DMs I am a party to (recommended)
○ Read all DMs in channels FLOW can see
○ Read all DMs in the workspace

[Why does this matter?]  → tooltip explaining privacy implications
```

Options correspond to `DmPolicy` enum: `NEVER`, `PARTY_ONLY`, `CHANNEL_DMS`, `ALL`. Default: `PARTY_ONLY`.

Change calls `PATCH /api/integration-permissions/slack/settings` with `{ dmPolicy }`. No save button — instant.

---

## Auto-Allow New Resources

Each connector panel has:

```
Auto-allow new: [Off ▾]
```

Dropdown: `Off (deny new)` / `On (allow new)`.

- `Off` (default): New repositories/channels/pages added after setup are hidden until explicitly allowed.
- `On`: New resources are automatically allowed.

Change calls `PATCH /api/integration-permissions/{connector}/settings` with `{ autoAllowNew }`.

---

## Discovery Flow

```
[Discover →]
```

Triggers `POST /api/integration-permissions/{connector}/discover` (ADMIN+ required).

During discovery:
```
[GitHub icon]  GitHub   [Discovering... 12 repos found so far]
```

After discovery completes:
- Resource catalog refreshes
- New resources since last discovery are highlighted: `[NEW]` chip
- Toast: `"Discovery complete — 3 new repositories found"`

---

## Disabled Connectors

Non-governed connectors (no resource-level permissions configured):

```
AVAILABLE SOON
┌──────────┐  ┌──────────┐  ┌──────────┐
│  Teams   │  │SharePoint│  │ OneDrive │
│ [Coming] │  │ [Coming] │  │ [Coming] │
└──────────┘  └──────────┘  └──────────┘
```

No toggle rows. No fabricated resources. Just the connector name, icon, and `[Coming soon]` label. No action available.

---

## Audit Log Panel

Clicking `[View audit log]` on a connector opens a right slide-over:

```
[×]  GitHub — Permission History
──────────────────────────────────────────────────
Jul 18 2:14pm  flow-os-backend  Allowed    Rahul Kumar
Jul 17 9:03am  archived-v1      Hidden     Rahul Kumar
Jul 15 4:00pm  test-repo-2      Hidden     Auto (grandfathering)
```

Data: `GET /api/integration-permissions/{connector}/audit`.

---

## Loading State

```
[TrustBar skeleton]
[ConnectorPanel skeleton × 6]
  [header skeleton]
  [3 resource row skeletons]
```

---

## Empty State

**Connector not connected:**
```
┌────────────────────────────────────────────────────────────────┐
│  [GitHub icon]  GitHub               [Not connected]           │
│                                                                │
│  Connect GitHub to control what FLOW reads.                    │
│  [Connect GitHub →]                                            │
└────────────────────────────────────────────────────────────────┘
```

**No resources discovered:**
```
No resources found yet.
[Discover now →]
```

---

## Error States

- Discovery fails: `"Discovery failed. [Retry]"` — existing catalog still shown
- Toggle update fails: optimistic update reverts; toast: `"Failed to update permission. [Retry]"`
- Connector health `DEGRADED`: orange indicator in connector header; `"Connection degraded — some resources may be stale"`

---

## Keyboard Shortcuts

| Key | Action |
|---|---|
| `⌘F` | Focus resource search |
| `↓` / `↑` | Navigate resource rows |
| `Space` | Toggle focused resource |
| `D` | Trigger discovery for focused connector |
| `A` | Allow all for focused connector (with confirmation) |
| `H` | Hide all for focused connector (with confirmation) |
| `Escape` | Close audit log panel |

---

## Accessibility

- `<main>` with `aria-label="Trust Center"`
- ConnectorPanel: `role="region"`, `aria-label="{connector} permissions"`
- Resource toggles: `role="switch"`, `aria-checked`, `aria-label="Allow FLOW to read {resource name}"`
- DM policy: `role="radiogroup"`, `aria-label="Direct message policy"`
- Two-column layout: `aria-label="FLOW can see"` / `aria-label="FLOW cannot see"` on column headers
- Audit log panel: `role="dialog"`, `aria-modal="true"`, focus trap

---

## Responsive Behavior

| Viewport | Behavior |
|---|---|
| ≥1280px | 2-column ConnectorGrid |
| 1024px–1279px | 2-column ConnectorGrid (narrower panels) |
| 768px–1023px (tablet) | Single column; panels stack |

---

## Telemetry Events

| Event | Trigger | Properties |
|---|---|---|
| `trust_center.viewed` | Page mount | `{ connectedCount, governedCount }` |
| `trust_center.resource.toggled` | Resource allow/hide | `{ connector, resourceId, allowed }` |
| `trust_center.discovery.triggered` | Discover button | `{ connector }` |
| `trust_center.dm_policy.changed` | DM policy select | `{ policy }` |
| `trust_center.auto_allow.changed` | Auto-allow toggle | `{ connector, autoAllowNew }` |
| `trust_center.bulk.applied` | Allow all / Hide all | `{ connector, action, count }` |
| `trust_center.audit.viewed` | Audit log opened | `{ connector }` |

---

## Acceptance Criteria

- [ ] 6 governed connectors render with two-column resource layout (FLOW CAN SEE / FLOW CANNOT SEE).
- [ ] Ungoverned connectors show the UNGOVERNED badge; `[Discover →]` seeds catalog as allowed and removes badge.
- [ ] Resource toggles are instant and durable; optimistic update reverts on failure.
- [ ] Slack-only DM policy selector shows 4 options; `PARTY_ONLY` is default.
- [ ] Auto-allow new toggle persists via API immediately.
- [ ] Discovery in-progress shows count; on completion, new resources are marked `[NEW]`.
- [ ] Disabled connectors show no fabricated resources — name, icon, and `[Coming soon]` only.
- [ ] Audit log panel shows permission change history per connector.
- [ ] Not-connected state shows `[Connect →]` action.
- [ ] All keyboard shortcuts work.
- [ ] All telemetry events fire.
