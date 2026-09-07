# FLOW OS — Enterprise Architecture
**Document:** 12 of 20  
**Status:** Authoritative  
**Last updated:** 2026-07-18

---

## Data Model — Identity and Organization

FLOW uses a three-tier organization model: **Organization → Workspace → User**.

```
Organization
  id, name, plan (FREE|STARTER|PRO|ENTERPRISE)
  ↓ has many
  Workspace
    id, name, externalId (e.g. "workspace_corp_alpha"), orgId
    ↓ has many
    WorkspaceMember
      userId, workspaceId, role (OWNER|ADMIN|MANAGER|MEMBER|VIEWER)
  ↓ has many
  User
    id, email, fullName, role (org-level: OWNER|ADMIN|MEMBER)
```

### Key Distinction: Org Role vs Workspace Role

Every user has an **org-level role** (stored on the `User` model) and optionally one or more **workspace-level roles** (stored in `WorkspaceMember`).

Workspace role takes precedence over org role for workspace-scoped permission checks. If no `WorkspaceMember` record exists, the org role is used as fallback.

This enables: a user who is an org-level MEMBER but an ADMIN of a specific workspace.

---

## Roles

### Org-Level Roles

| Role | Description |
|---|---|
| `OWNER` | Full control. Can manage org settings, billing, all workspaces. |
| `ADMIN` | Can manage users, policies, connectors, and workspace settings. Cannot delete the org. |
| `MEMBER` | Standard user. Can work within permitted workspaces. |
| `MANAGER` | Extended MEMBER. Can manage team settings and invite members. |
| `VIEWER` | Read-only. Can view intelligence but cannot execute or approve. |
| `EXECUTIVE` | Read-only with full intelligence access. Cannot execute. Sees strategic layer. |

### Workspace-Level Roles

Same role enum as org-level, applied to a specific workspace. Takes precedence.

### Role Capabilities Matrix

| Capability | VIEWER | MEMBER | MANAGER | ADMIN | OWNER |
|---|---|---|---|---|---|
| View intelligence | ✓ | ✓ | ✓ | ✓ | ✓ |
| Use Brain / ask questions | ✓ | ✓ | ✓ | ✓ | ✓ |
| Execute LOW risk actions | — | ✓ | ✓ | ✓ | ✓ |
| Execute MEDIUM risk actions | — | ✓ | ✓ | ✓ | ✓ |
| Approve HIGH risk actions | — | — | — | ✓ | ✓ |
| Approve CRITICAL (as 1 of 2) | — | — | — | ✓ | ✓ |
| Invite members | — | — | ✓ | ✓ | ✓ |
| Manage integration permissions | — | — | — | ✓ | ✓ |
| Create / modify policies | — | — | — | — | ✓ |
| Delete connectors | — | — | — | — | ✓ |
| Manage workspaces | — | — | — | ✓ | ✓ |
| Access audit logs | — | — | — | ✓ | ✓ |
| View billing | — | — | — | ✓ | ✓ |
| Manage billing | — | — | — | — | ✓ |
| Access dev dashboard | — | — | — | ✓ | ✓ |

---

## Multi-Workspace

A single organization can have multiple workspaces. Common patterns:

- `workspace_engineering` — engineering signals only (GitHub, Jira)
- `workspace_sales` — customer signals (HubSpot, email)
- `workspace_exec` — executive layer (all signals, strategic summaries only)
- `workspace_corp_alpha` — single workspace for full company

Each workspace has:
- Its own connector credentials (separate OAuth per workspace per connector)
- Its own integration permissions (each workspace governs its own resources)
- Its own policies (governance rules can differ between workspaces)
- Its own intelligence store (pgvector chunks are workspace-scoped)
- Its own member list (role assignments are per-workspace)

Intelligence does not cross workspace boundaries. A user in workspace_engineering cannot query workspace_sales data, even if they are a member of both.

### Workspace Management

**Route:** `/settings/workspaces`  
**Component:** `WorkspaceManagement.jsx`  
**API:** `GET/POST/PATCH /api/org/workspaces`

Operations:
- Create workspace (name, description, AI provider setting)
- Clone workspace (copies settings, not data)
- Configure retention (data retention period for intel chunks)
- Set AI provider (Gemini / Ollama)
- Set briefing cadence (daily / weekly / on-demand)
- Archive workspace (soft delete — data retained per retention policy)

---

## Tenant Isolation

Tenant isolation is mandatory at every layer.

### HTTP Layer

Every protected route requires `workspace-id` header. `tenantIsolation` middleware:
1. Validates JWT is present and valid
2. Reads `workspace-id` header — returns 400 if absent
3. Queries PostgreSQL to confirm workspace belongs to `req.user.orgId` — returns 403 if not
4. Attaches `req.workspace` and `req.tenantId` for downstream handlers
5. Resolves workspace role from `WorkspaceMember` table (or falls back to org role)
6. Attaches `req.workspaceRole` for governance middleware

No handler that touches workspace data may run without this middleware completing successfully.

### Database Layer

Every SQL query against workspace-scoped tables includes `workspace_id = $N` as a mandatory WHERE clause. Parameterized queries only. No raw string interpolation.

```sql
-- Correct
SELECT * FROM workspace_intel_chunks
WHERE workspace_id = $1
  AND channel = $2

-- Never allowed
SELECT * FROM workspace_intel_chunks
WHERE workspace_id = '${workspaceId}'
```

### WebSocket Layer

Every WebSocket connection is workspace-scoped. `socketService.authenticateSocket()` verifies:
- JWT is valid and belongs to an active user
- `workspaceId` query param is provided
- The workspace belongs to the user's organization

Messages are broadcast to `workspace:{workspaceId}` channels only. A WebSocket client for workspace A cannot receive events from workspace B.

---

## Authentication

### JWT Authentication

FLOW uses JWT (jsonwebtoken). All JWTs:
- Are signed with `process.env.JWT_SECRET` (minimum 32 characters, no known-insecure defaults)
- Expire after `JWT_EXPIRY` (default: 24h)
- Are sent in the `Authorization: Bearer` header
- Are never sent in query strings (except WebSocket `?token=` for WS auth)

### Token Storage

- JWT stored in `localStorage` under key `flow_os_token`
- Workspace ID stored in `localStorage` under key `flow_os_workspace_id`
- User name stored in `localStorage` under key `flow_user_name`
- User email stored in `localStorage` under key `flow_user_email`

### API Key Authentication

FLOW supports API keys for programmatic access (machine-to-machine, CI/CD integrations).

- API keys stored in the `ApiKey` table (hashed, never stored in plaintext)
- Scoped to a workspace
- Expirable
- Revokable
- Carry the role of the creating user (cannot escalate)
- Management UI at `/settings/api-keys`

---

## User Management

**Route:** `/settings/iam`  
**Component:** `IdentityManagement.jsx`  
**API:** `GET /api/users`, `POST /api/users/invite`, `PATCH /api/users/:id`

### User Lifecycle

```
Invite
  ADMIN/OWNER sends invite with email + role + workspace
  System generates temp password (no email infra in v1 — password surfaced in UI)
  User receives credentials, logs in, forced to change password

Active
  User works in FLOW with their assigned role
  Workspace membership can be updated by ADMIN/OWNER

Deactivated
  User can be deactivated (not deleted)
  Deactivated users cannot log in
  Their audit history and decisions are retained

Removed from workspace
  WorkspaceMember record deleted
  User loses access to that workspace
  Remains in org if they have other workspace memberships
```

### MFA and SSO

MFA toggle is available in the IdentityManagement UI. In v1, the toggle is surfaced but not functionally enforced (backend enforcement is planned). SCIM toggle is similarly surfaced for enterprise positioning.

---

## Governance Policies

**Route:** `/settings/governance`  
**Component:** `AIGovernance.jsx`  
**API:** `GET/POST/PUT/PATCH/DELETE /api/policies`

Policies are workspace-scoped rules that override the default role-action matrix.

### Policy Model

```prisma
model Policy {
  id          String   @id @default(cuid())
  workspaceId String
  name        String
  description String?
  effect      Effect   // ALLOW | DENY | REQUIRE_APPROVAL
  action      String   // connector action type pattern
  conditions  Json?    // optional: role, connector, time-of-day, etc.
  enabled     Boolean  @default(true)
  createdBy   String
  createdAt   DateTime @default(now())
}
```

### Policy Evaluation Order

1. DB policies are evaluated first. DENY always wins.
2. If no DB policy matches, the default role-action matrix applies.
3. REQUIRE_APPROVAL from a DB policy creates a PendingApproval record.

Policies are cached in memory for 60 seconds to avoid database calls per action.

### Example Policies

```
Policy: No PR merges without 2 reviews
  Effect: DENY
  Action: MERGE_PULL_REQUEST
  Conditions: { reviewCount: { lt: 2 } }

Policy: High-value approvals require admin
  Effect: REQUIRE_APPROVAL
  Action: CREATE_JIRA_ISSUE
  Conditions: { estimatedValue: { gte: 50000 } }

Policy: Allow engineers to merge their own PRs
  Effect: ALLOW
  Action: MERGE_PULL_REQUEST
  Conditions: { role: MEMBER, authorIsActor: true }
```

---

## Plan Tiers

| Tier | Description | Limits |
|---|---|---|
| FREE | Individual user, single workspace | 1 workspace, 2 connectors, no execution |
| STARTER | Small team | 3 workspaces, 4 connectors, LOW risk execution only |
| PRO | Growing company | 10 workspaces, all connectors, HIGH risk execution |
| ENTERPRISE | Large org, compliance needs | Unlimited workspaces, all connectors, CRITICAL execution, SSO, SCIM, custom retention |

Capability gates are enforced in `permissionEvaluator.js` based on `req.workspace.org.plan`.

---

## Security

### Security Center

**Route:** `/settings/security`  
**Component:** `SecurityCenter.jsx`  
**API:** `GET /api/connectors/audit?outcome=denied,failure,approval_required`

Shows governance-related events:
- DENIED actions (blocked by policy)
- FAILED executions
- APPROVAL_REQUIRED events
- Privacy shield triggers (PII discarded)

Active Defenses section (static, always displayed):
- Privacy Gate active (classifies and discards PII before storage)
- PII Redaction (secret redaction in all log lines)
- Workspace Isolation (cross-tenant access returns 403)
- WebSocket Auth (WS connections require valid JWT)
- Rate limiting active (sliding window per IP)
- SQL injection prevention (parameterized queries only)
- SSRF protection (crawler validates URLs against allowlist)
- Vault files restricted (never served via HTTP)

### WebSocket Security

`WS_AUTH_REQUIRED=true` in production. All WebSocket connections require valid JWT via `?token=` query parameter. Dev mode: warn-only if missing (does not enforce, logs warning).

### CORS

`CORS_ORIGIN` env var must be set before production deployment. Default `origin: '*'` is a known tech debt item (TD-04) — it must be scoped to known frontend domains before any public deployment.

---

## Billing

**Route:** `/settings/billing`  
**Component:** `AnalyticsBilling.jsx`

Displays:
- Current plan and tier
- Usage metrics (workspace count, connector count, actions executed this month, AI queries)
- Upgrade/downgrade options

Billing infrastructure (Stripe integration) is not implemented in v1. The page is a positioning surface for the enterprise sales conversation.

---

## Import and Workspace Lifecycle

**Route:** `/settings/import`  
**Component:** `ImportDashboard.jsx`  
**API:** `/api/lifecycle/*`

Five operations:

| Operation | Description | Stages |
|---|---|---|
| CREATE | Full workspace bootstrap | 10 stages |
| IMPORT | Import data into workspace | 9 stages |
| SYNC | Incremental update | 7 stages |
| REFRESH | Re-derive intelligence from existing data | 4 stages |
| VALIDATE | Dry-run validation, no writes | 1 stage |

Every operation creates a durable `ImportRecord` in PostgreSQL. Progress streams via WebSocket (`LIFECYCLE_STARTED`, `LIFECYCLE_STAGE_STARTED/COMPLETED/FAILED`, `LIFECYCLE_COMPLETED/FAILED`).

### 23 Supported Dataset Types

`summary` · `company` · `employees` · `departments` · `projects` · `customers` · `vendors` · `repositories` · `commits` · `pull_requests` · `jira_issues` · `emails` · `slack_threads` · `calendar_events` · `meetings` · `meeting_transcripts` · `incidents` · `documents` · `timeline` · `memory` · `executive_reports` · `knowledgeGraph` · `permissions`

Adding a new type requires adding one `registerDatasetType()` call in `builtinTypes.js`. No other files change.
