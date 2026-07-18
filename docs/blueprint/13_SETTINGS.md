# Blueprint: Settings Group — `/settings/*`
**Document:** BP-13  
**Last updated:** 2026-07-18  
**Status:** Authoritative

---

## Purpose

Settings is a group of administrative sub-pages for managing the workspace, team, governance, security, and AI. It is not a single page — it is a shared shell with sub-page routing.

Settings pages are for configuration and administration. They are not intelligence surfaces — no AI recommendations, no live event feeds. Design: utility first, calm, information-dense.

---

## Target User

| Sub-page | Primary user |
|---|---|
| IAM | OWNER only |
| Governance | OWNER, ADMIN |
| Audit Logs | OWNER, ADMIN |
| Security | OWNER |
| Workspace Health | OWNER, ADMIN |
| Billing | OWNER |

Non-admin users: sidebar shows "Settings" but items that require elevated role show `[ADMIN required]` chip and render a 403 page on direct navigation.

---

## Entry Points

| Source | How |
|---|---|
| Sidebar | Platform group → "Settings" (expandable) → sub-items |
| `⌘K` → "Settings — [name]" | CommandPalette (each sub-page listed) |
| Trust Center | `[View audit log →]` links to Audit Logs |
| Onboarding | Step 3 links to IAM after setup |
| Direct URL | `/settings/{slug}` |

---

## Settings Shell Layout

```
┌─────────────────────────────────────────────────────────────────┐
│ Sidebar (220px)                                                 │
├──────────────────────┬──────────────────────────────────────────┤
│                      │                                          │
│  Settings Nav        │  Sub-page content area                   │
│  (160px sub-nav)     │                                          │
│  ──────────────────  │                                          │
│  ● IAM               │  [Sub-page renders here]                 │
│    Team              │                                          │
│    Roles             │                                          │
│  ──────────────────  │                                          │
│  ● Governance        │                                          │
│    Policies          │                                          │
│    Approvals         │                                          │
│  ──────────────────  │                                          │
│  ● Security          │                                          │
│  ● Audit Logs        │                                          │
│  ● Health            │                                          │
│  ● Billing           │                                          │
│                      │                                          │
└──────────────────────┴──────────────────────────────────────────┘
```

Left sub-nav is sticky. No LiveFeed on any settings page.

---

## Sub-Page: IAM — `/settings/iam`

**Purpose:** Manage team members, roles, and invitations.

### Layout

```
PageHeader: Identity & Access Management

TEAM MEMBERS (N)
[Invite member →]

[avatar] Rahul Kumar    OWNER   rahul@company.com   Active
[avatar] Alice Chen     ADMIN   alice@company.com   Active
[avatar] Marcus Wong    MEMBER  marcus@company.com  Active

PENDING INVITATIONS (N)
jordan@company.com     MEMBER  Invited 2d ago  [Resend]  [Revoke]
```

### Components

- **Member list:** `GET /api/users?workspaceId={ws}` — sortable by name, role, join date
- **Invite flow:** `POST /api/users/invite` — requires name, email, role selection
- **Role change:** `PATCH /api/users/{userId}` — OWNER can change any role; ADMIN can invite but not promote to OWNER
- **Remove member:** `DELETE /api/users/{userId}` — with confirmation modal; cannot remove self if last OWNER

### Role hierarchy (display)

| Role | Capabilities |
|---|---|
| OWNER | All actions; can delete workspace |
| ADMIN | All connector + governance actions; cannot delete workspace |
| MEMBER | Read + execute approved actions |
| VIEWER | Read only |
| SERVICE_ACCOUNT | API access only (no UI login) |

### Invite modal

```
Invite a team member

Email address     [                    ]
Full name         [                    ]
Role              [MEMBER ▾]

Note: A temporary password will be shown once. 
Ask them to change it on first login.

[Send invitation]  [Cancel]
```

---

## Sub-Page: Governance — `/settings/governance`

**Purpose:** Manage approval policies and pending approvals.

### Policies tab

```
GOVERNANCE POLICIES (N)

[+ Create policy]

GitHub — PR Merge to Main
REQUIRE_APPROVAL · ADMIN+ · Active
Created by Rahul Kumar · Jul 10

Connector: all
Action: EXECUTE · Effect: REQUIRE_APPROVAL
[Edit]  [Disable]  [Delete]
```

**Create policy modal fields:**
- Name (text)
- Connector (dropdown: `all` or specific connector)
- Action (dropdown: `EXECUTE`, `DELETE`, `BULK`, etc.)
- Effect (radio: `ALLOW` / `DENY` / `REQUIRE_APPROVAL`)
- Required approver role (if `REQUIRE_APPROVAL`): `ADMIN` / `OWNER`
- Active (toggle)

**Data:** `GET /api/policies`, `POST /api/policies`, `PUT/DELETE /api/policies/:id`, `PATCH /api/policies/:id/toggle`

### Approvals tab

```
PENDING APPROVALS (N)

[filter: All / Pending / Approved / Rejected]

PR Merge: flow-os-backend #445           HIGH risk
Requested by Alice Chen · 2h ago
[Approve]  [Reject]  [View details]

Deploy to production                     CRITICAL risk
Requested by Marcus Wong · 4h ago
Requires 2 approvals · 0 of 2 received
[Approve]  [Reject]  [View details]
```

**Data:** `GET /api/approvals`, `POST /api/approvals/:id/approve`, `POST /api/approvals/:id/reject`

---

## Sub-Page: Audit Logs — `/settings/audit`

**Purpose:** Complete, tamper-evident record of all governed actions.

```
PageHeader: Audit Log

[connector ▾] [person ▾] [action ▾] [Jul 11 – Jul 18 ▾]  [Export CSV]

TIMESTAMP              ACTOR          ACTION              RESULT
Jul 18 2:14pm          Alice Chen     PR #445 Merged      SUCCESS
Jul 18 10:03am         Rahul Kumar    Policy Updated      SUCCESS
Jul 17 4:00pm          Marcus Wong    Deploy to prod      APPROVAL_REQUIRED
Jul 17 3:58pm          Marcus Wong    Deploy to prod      DENIED
```

Click row → AuditDetailPanel (right slide-over) with full request/response:
```
Action: EXECUTE — github/merge_pull_request
Actor: Marcus Wong
Risk level: CRITICAL
Governance result: APPROVAL_REQUIRED (2 approvals needed)
Approval ID: apr_xxxxx
```

**Data:** `GET /api/connectors/audit?workspaceId={ws}` (PostgreSQL AuditLog, not in-memory)

**Export:** `[Export CSV]` triggers `GET /api/connectors/audit?format=csv` (OWNER only).

---

## Sub-Page: Security — `/settings/security`

**Purpose:** Authentication settings, JWT configuration, WebSocket auth, and CORS.

```
PageHeader: Security

AUTHENTICATION
JWT Secret          Set · Last rotated: never     [Rotate...]
Session timeout     24 hours                      [Change]

WEBSOCKET
WS Auth Required    [On ✓]                        
(Production value — do not disable)

CORS Origins        localhost:3000                [Edit]
                    [Warning: Not scoped for production]

API KEYS
[+ Create API key]
flow-mobile-app     Last used: 3d ago              [Revoke]
dashboard-service   Last used: 1h ago              [Revoke]

RATE LIMITS
Current limit: 100 req/min (shared)
[TD-10: Per-tenant rate limiting is a known debt item]
```

**JWT secret rotation:** shows confirmation modal:
```
Rotating the JWT secret will immediately invalidate all active sessions.
All users will need to log in again.
[Confirm rotation]  [Cancel]
```

This calls a backend-only operation (requires OWNER). Does NOT expose the secret value in UI.

---

## Sub-Page: Workspace Health — `/settings/health`

**Purpose:** Technical health of the FLOW workspace — connectors, queues, DB, AI providers.

Reuses and expands the `GET /api/workspace/snapshot` health fields:

```
PageHeader: Workspace Health

OVERALL HEALTH    ●●●●○  78/100

CONNECTORS
GitHub            ✓ Connected · Rate: 4,872 remaining
Gmail             ✓ Connected
Google Calendar   ✓ Connected
Slack             ✗ Not connected        [Connect →]
Notion            ✗ Not connected        [Connect →]
Jira              ✓ Connected

AI PROVIDERS
Gemini 2.5 Flash  ✓ Available
Embeddings        ✓ Available
Fallback          Active (Ollama/local)

INFRASTRUCTURE
Database          ✓ Connected · Pool: 8/10 active
Redis             ✓ Connected
BullMQ            ✓ 0 failed jobs
Ingestion Queue   ✓ 0 queued

INTELLIGENCE CACHE
Last built        2 minutes ago
Build time        142ms
[Force rebuild →]
```

Data: `GET /api/workspace/snapshot`, `GET /metrics/infra`, `GET /api/connectors/health`.

`[Force rebuild →]` calls `GET /api/workspace/snapshot?force=true`. Response: `"Rebuilding — check back in 30 seconds."`

---

## Sub-Page: Billing — `/settings/billing`

**Purpose:** Plan tier, usage, and upgrades.

```
PageHeader: Billing

CURRENT PLAN     Enterprise Pilot (invited)
Renewal          Not applicable — pilot period

USAGE THIS MONTH
Events processed       12,483
AI queries             247
Actions executed       38
Team members           3 / unlimited

[Contact us to upgrade]
[Export usage report]
```

No live billing integration in v1. All plan-tier gates are enforced by `governance/constants.js`. Billing is for display only.

---

## Loading States (per sub-page)

| Sub-page | Skeleton |
|---|---|
| IAM | 3 member row skeletons |
| Governance | Policy list: 3 card skeletons |
| Audit | 5 row skeletons |
| Security | Key/value row skeletons |
| Health | Status dot row skeletons |
| Billing | Text block skeletons |

---

## Error States

| Sub-page | Error |
|---|---|
| IAM | `"Unable to load team. [Retry]"` |
| Governance | `"Unable to load policies. [Retry]"` |
| Audit | `"Audit log unavailable. [Retry]"` |
| Security | `"Security settings unavailable."` (read-only render) |
| Health | Individual service shows `"Unknown"` if check fails |

---

## Keyboard Shortcuts

| Key | Action |
|---|---|
| `1–6` | Jump to settings sub-page by position in sub-nav |
| `⌘F` | Focus search/filter on current sub-page |
| `↓` / `↑` | Navigate lists |
| `Enter` | Open detail panel / modal |
| `Escape` | Close modal / detail panel |

---

## Accessibility

- Settings sub-nav: `role="navigation"`, `aria-label="Settings navigation"`
- Active sub-page: `aria-current="page"`
- Policy/member/audit rows: `role="row"` in `role="grid"`
- Modals: `role="dialog"`, `aria-modal="true"`, `aria-labelledby` title, focus trap
- Toggle switches: `role="switch"`, `aria-checked`

---

## Responsive Behavior

| Viewport | Behavior |
|---|---|
| ≥1280px | Settings sub-nav (160px) + content area |
| 1024px–1279px | Same |
| 768px–1023px (tablet) | Sub-nav collapses to a tab bar at top |

---

## Telemetry Events

| Event | Trigger | Properties |
|---|---|---|
| `settings.page.viewed` | Sub-page mount | `{ subPage }` |
| `settings.iam.invite.sent` | Invite submitted | `{ role }` |
| `settings.iam.role.changed` | Role updated | `{ userId, from, to }` |
| `settings.governance.policy.created` | Policy created | `{ effect, connector }` |
| `settings.governance.approval.acted` | Approve/reject | `{ approvalId, action, riskLevel }` |
| `settings.security.key.rotated` | JWT rotated | `{}` |
| `settings.health.rebuild.triggered` | Force rebuild | `{}` |

---

## Acceptance Criteria

- [ ] Settings shell renders sub-nav with correct items per user role (ADMIN/OWNER gates enforced).
- [ ] IAM: member list from API; invite modal; role change; remove with confirmation.
- [ ] Governance: policy CRUD; approvals list with approve/reject actions and risk badges.
- [ ] Audit: filterable log from PostgreSQL; click for detail; CSV export (OWNER).
- [ ] Security: JWT rotation with confirmation modal; API key list; CORS warning present.
- [ ] Health: all 6 sections render with live data from snapshot/infra/connectors endpoints.
- [ ] Billing: plan tier and usage display; no billing integration.
- [ ] All modals have focus traps and close on Escape.
- [ ] All telemetry events fire.
