# FLOW OS // Developer Verification & Observability Walkthrough

Welcome to the **FLOW OS Developer Verification & Observability Walkthrough**. This document outlines how to spin up FLOW, test every subsystem, and observe the flow of data through our operational intelligence pipelines.

---

## 🚀 1. How to Start FLOW OS

### Prerequisites
* **Node.js**: v18+ (tested on Node.js v24)
* **PostgreSQL**: Running locally on port `5432` with a database named `flow_os_production` (or default fallback).
* **Redis**: Running locally on `127.0.0.1:6379` (used for cache storage and BullMQ broker).

### Installation
From the root directory (`/Users/kishorevarma/Desktop/flow-os-backend`):
```bash
npm install
```

### Starting the Server & Workers
Run the unified start command to boot the HTTP/WebSocket server, the BullMQ ingestion workers, and the Daily rollup worker:
```bash
npm start
```

---

## 🌐 2. Which URL to Open

FLOW OS exposes a dedicated, gorgeous **Developer Verification Dashboard** for real-time observability in development mode.

* **URL**: [http://localhost:5001/dev-dashboard](http://localhost:5001/dev-dashboard)
* **WebSocket**: Connects to `ws://localhost:5001?workspaceId=workspace_corp_alpha` automatically to feed real-time pipeline events into the dashboard.

Open this URL in your web browser to monitor server status, Redis cached keys, BullMQ job queues, knowledge graph metrics, and a live pipeline visualizer.

---

## 🔌 3. Which API Endpoints to Call

Below are the primary development and testing endpoints you can call directly using `curl` or Postman:

### Development and Verification (No Auth Needed)
* **Health Check**: `GET http://localhost:5001/api/health`
  * Checks PG and Server status.
* **Developer Stats**: `GET http://localhost:5001/api/dev/stats`
  * Returns counts of PG chunks, Redis cache keys, BullMQ status, incidents, and decisions.
* **Batch Seed 5 Platforms**: `POST http://localhost:5001/api/dev/seed-all`
  * Queues sample data for **Gmail, Slack, Calendar, GitHub, and Jira** into the ingestion queue.
  * *Payload*: `{"workspaceId": "workspace_corp_alpha"}`
* **Scrape URL (SSRF Scraper)**: `POST http://localhost:5001/api/crawler/scrape`
  * Scrapes text safely from web pages (bypasses auth for dev testing).
  * *Payload*: `{"url": "https://example.com"}`

### Inbound Ingestion Intake
* **Intake Webhook**: `POST http://localhost:5001/api/webhook/ingest`
  * Stages raw platform messages into the BullMQ background queue.
  * *Payload example*:
    ```json
    {
      "workspaceId": "workspace_corp_alpha",
      "platform": "slack",
      "channelId": "general",
      "messages": [
        { "sender": "cto@company.com", "text": "Deploying user migration script to PG." }
      ]
    }
    ```

---

## 🪵 4. Which Logs to Expect

When payloads are processed, monitor your terminal console for the following execution traces:

### A. Ingestion Start
```text
=== COGNITIVE ENGINE INGESTION TRACE ===
Raw text length: 155
Evaluating text content: "confidential: setup authorized one-click login via composio oauth handshakes for google workspace, gmail, and github. ensure security tokens are encrypted."
```

### B. Incident / Decision Detection
```text
📝 [Decision Memory] Decision Recorded: DEC-81D8F647
🔥 [Incident Engine] CRITICAL Incident Detected: INC-770F6B23
```

### C. Memory Brain Score & Policy
```text
🧠 [Memory Brain] Scored chunk. Importance: 1.0, Authority: 0.9, Urgency: 0.3. Retention: PERMANENT
```

### E. Storage
```text
💾 [Vault Service] Saved operational intel to vault: /Users/kishorevarma/Desktop/FLOW-OS-VAULTS/workspace_workspace_corp_alpha/C_ENGINEERING/intel_*.md
📥 [Retrieval Service] Ingesting intel chunk for Workspace workspace_corp_alpha, Channel C_ENGINEERING...
✅ [Retrieval Service Ingest] Successfully stored chunk in workspace_intel_chunks.
✅ [Ingestion Worker] Job completed successfully.
```

---

## 💾 5. Where Data Appears

Depending on the classification, data is routed to different persistence layers:

1. **PostgreSQL**: Safe `OPERATIONAL_INTEL` with high authority is vectorized and saved in the **`workspace_intel_chunks`** table.
   * Verify via query: `SELECT * FROM workspace_intel_chunks;`
2. **Obsidian Vault File System**: Sandboxed by workspace key under:
   * `/Users/kishorevarma/Desktop/FLOW-OS-VAULTS/workspace_{id}/{channelName}/intel_{timestamp}.md`
3. **Redis Cache**: Short-lived `SOCIAL_COORDINATION` (badminton coordination, greetings, lunch chatters) is cached for 1 hour under:
   * Key pattern: `social_cache:workspace_{id}:{channelName}:{timestamp}`
4. **Programmatic Purge**: Highly sensitive `PRIVATE_PERSONAL` data (passwords, credit cards, bank accounts, SSN) is instantly dropped in-memory. Zero bytes are written to vault, database, or cache.

---

## 🧪 6. How to Test Every Subsystem

Run the automated diagnostic verification suite to check the health and connectivity of all system configurations:

```bash
npm run verify
```

### Verification Output:
```text
🔍 RUNNING FLOW OS DIAGNOSTIC VERIFICATION SUITE 🔍

✅ Server               : HTTP Status: 200 | DB Status: CONNECTED
✅ PostgreSQL           : Connected & queried SELECT 1 successfully
✅ Redis                : Ping response: PONG
✅ BullMQ               : Ingestion queue ready: true
✅ Parser               : Chunk count: 4 | Social Chatter Filter: OK
✅ Memory               : Retention Policy: PERMANENT | Composite: 0.846
✅ Vector Store         : Stored chunks: 1 | Top match score: 0.761
✅ Knowledge Graph      : Nodes count: 0 | Edges count: 0
✅ Crawler              : SSRF Localhost Blocked: true | Parser: OK
✅ Summary Worker       : Summary Queue and repeatable schedules initialized
✅ Routes               : Public health and status routes resolving 200 OK
✅ WebSocket            : Successfully established WebSocket handshake
✅ Integrations         : Integrations configured: 0

=======================================
Overall Health: 100%
=======================================
```

---

## 🕷️ 7. How to Verify the Complete Ingestion Pipeline

To trace a message through the entire pipeline:

1. Open the [Developer Verification Dashboard](http://localhost:5001/dev-dashboard).
2. Look at the **Pipeline Visualizer** nodes.
3. Click the green **"Seed All 5 Platforms"** button.
4. Watch the pipeline nodes light up in real-time as WebSocket events (`INGESTION_START` ➔ `MEMORY_RETENTION_ASSIGNED` ➔ `INTEL_STORED`) are broadcast.
5. Check your local filesystem under `/Users/kishorevarma/Desktop/FLOW-OS-VAULTS/workspace_workspace_corp_alpha/` to see the generated Markdown files.
6. Verify the table counts for PostgreSQL, Redis, Incidents, and Decisions update dynamically.

---

## 8. FLOW Recommendation Engine

**Sprint:** Intelligent Recommendation Engine  
**File:** `flow-os-frontend/src/components/workfeed/RecommendationEngine.jsx`

### What it does

The Recommendation Engine is the hero section at the top of the Workfeed (`/workfeed`). It answers "If I have the next 20 minutes, what should I do first?" by ranking live workfeed data using a client-side urgency scoring algorithm.

### How recommendations are computed

No backend changes were required. The engine consumes workfeed data already returned by `/api/intelligence/workfeed` (incidents, actions, approvals, healthScore, aiRecommendation).

Scoring per item:

| Input | Urgency weight |
|-------|---------------|
| CRITICAL incident | 100 |
| P1 action (overdue) | 78 + 20 = 98 |
| P1 action (on-time) | 78 |
| Approval (gmail) | 68 |
| P2 action | 55 |

Top 3 by urgency score are displayed.

### Impact derivation matrix

| Source / Type | Metric | Delta |
|---------------|--------|-------|
| github / CRITICAL incident | Engineering Health | +14pts |
| github action | Engineering Health | +14pts |
| incident P1 | Engineering Health | +8pts |
| gmail action | Customer Health | High Risk → Stable |
| jira action | Operations | +6pts |
| approval (email) | Finance Workflow | Pending → Complete |

### Health prediction animation

`predictedHealth = min(100, currentHealth + Σ(delta × 0.55))` for all numeric impact items, +3 for each non-numeric.

The score counter animates from `currentHealth` → `predictedHealth` using cubic ease-out over 1.4s with `requestAnimationFrame`.

### Interaction model

| Click target | Navigation |
|-------------|------------|
| github rec | `/query` |
| gmail rec | `/inbox` |
| jira rec | `/projects` |
| slack rec | `/workfeed` |
| calendar rec | `/meetings` |
| incident rec | `/assistant` |
| ✓ button | Removes rec, re-ranks remaining |

### Architecture notes

- Pure client-side: no new API calls, no backend changes
- Reads `data` prop passed from `DailyWorkfeed` (same fetch, no duplication)
- `computeRecommendations`, `deriveImpact`, `totalHealthGain`, `computeConfidence` are pure functions — unit-testable
- Designed to support any future integration source via `SOURCE_CFG` and `NAV_TARGET` maps — add a key, get full UI support instantly

### Port fix (same sprint)

All frontend URLs were corrected from `:5000` → `:5001`:
- `vite.config.js` proxy targets
- `useWebSocket.jsx` WebSocket URL

Vite proxy routes: `/api/*` and `/dev-dashboard` → `http://localhost:5001`. WebSocket connects directly to `ws://localhost:5001` (browser WebSocket API does not support Vite proxy for non-`/ws`-prefixed URLs).


---

## 9. Universal Action Center

**Sprint:** Phase 4.1 — Universal Action Center  
**Files:**
- `flow-os-frontend/src/components/ui/ActionCenter.jsx` — universal slide-over UI
- `flow-os-frontend/src/components/workfeed/actionCenterAdapter.js` — normalization layer

### How to trigger it

Click any card in the FLOW Recommendation Engine (hero section of `/workfeed`). The Action Center slides in from the right.

### Architecture

```
RecCard click
  → onOpenActionCenter(rawItem)           [RecommendationEngine prop]
  → setActionCenterRaw(rawItem)           [DailyWorkfeed state]
  → normalizeItem(rawItem, workfeedData)  [actionCenterAdapter.js]
  → <ActionCenter item={normalized} />    [ActionCenter.jsx]
```

The adapter (`actionCenterAdapter.js`) is the only connector-aware code. `ActionCenter.jsx` is fully generic — it renders whatever the adapter provides.

### Adding a new connector

1. Extend `deriveDraft()` in `actionCenterAdapter.js` with a new `source` branch
2. Extend `deriveRelatedItems()` for contextual cross-linking
3. Add the source key to `SOURCE_CFG` in `ActionCenter.jsx`
4. Done — no other file changes required

### Sections rendered

| Section | Content source |
|---------|---------------|
| Header | `item.source`, `item.priority`, `item.status`, `item.timestamp` |
| Context | `item.context[]` — raw reasons from workfeed item |
| AI Analysis | `item.aiAnalysis` — recommendation, business impact, urgency, dependencies, historical note, confidence |
| Suggested Action | `item.draft` — editable textarea (approvals/incidents) or read-only plan (github actions) |
| Related Items | `item.relatedItems` — derived from workfeed meetings, decisions, incidents |
| Execution | `item.execution` — primary (Execute), secondary (Open in source), reject (Dismiss/Reject) |
| Timeline | `item.timeline` — AI rank event, overdue escalation, original creation |

### Execution flow

| Button | Action |
|--------|--------|
| Primary (Execute / Merge PR / Review Draft) | `onComplete(id)` — removes item from workfeed, closes panel |
| Secondary (Open in GitHub / Gmail / Jira) | `navigate(item.execution.secondary.navigate)` — goes to relevant FLOW page |
| Reject / Dismiss | `onComplete(id)` — removes item, shows warning toast |
| Escape key | Closes panel |

### No backend changes

All data is derived from the already-fetched workfeed payload. The Action Center makes zero additional API calls.

---

## 🔌 10. Universal Connector Framework (Phase 5.2)

### Architecture Overview

```
FLOW OS
       │
       ▼
Connector Registry          — central catalog; resolves connectors by capability, not by name
       │
       ▼
Capability Layer            — 10 business capabilities (Communication, Engineering, CRM, …)
       │
       ▼
Connector Adapter           — every provider implements BaseAdapter interface
       │
       ▼
Provider API                — Gmail, Slack, GitHub, HubSpot, etc.
       │
       ▼
Execution Engine            — single pipeline: validate → execute → audit → timeline → memory → WS
       │
       ▼
Timeline / Audit Log        — every executed action recorded in chronological order
       │
       ▼
Company Memory              — significant actions can update workspace memory
       │
       ▼
Recommendation Engine       — reads normalized company events (never provider-specific objects)
       │
       ▼
Workfeed + Search           — UI consumes capabilities, never provider names
```

### Folder Structure

```
src/connectors/
├── capabilities.js         — Capability, ActionType, AuthStrategy enums + CapabilityActions map
├── normalizedTypes.js      — FLOW-native object factories (no provider-specific fields)
├── BaseAdapter.js          — Abstract adapter interface (every connector extends this)
├── authManager.js          — Credential store (OAuth2, API key, service account, webhook)
├── registry.js             — ConnectorRegistry (register, resolve by capability, health)
├── executionEngine.js      — Action pipeline (validate → execute → audit → broadcast)
├── searchOrchestrator.js   — Universal search (fan out to connectors + internal memory)
└── index.js                — Public API barrel export

src/routes/
└── connectorsRoutes.js     — REST API (/api/connectors/*)
```

### Capabilities

| Capability | Example Providers |
|-----------|-------------------|
| `communication` | Gmail, Outlook, Slack DM, Teams Chat |
| `meetings` | Google Calendar, Outlook Calendar |
| `engineering` | GitHub, GitLab, Bitbucket, Linear, Jira |
| `knowledge` | Notion, Confluence, Obsidian |
| `finance` | QuickBooks, Xero, NetSuite |
| `crm` | HubSpot, Salesforce |
| `hr` | Workday, BambooHR |
| `operations` | PagerDuty, Datadog, Grafana |
| `sales` | Salesloft, Outreach |
| `compliance` | Vanta, Drata |

### Adding a New Connector

1. Extend `BaseAdapter` in `src/connectors/adapters/<name>Adapter.js`
2. Implement the methods your connector supports
3. Return FLOW-native objects from `normalizedTypes.js` — never provider objects
4. Call `registerConnector(adapter)` at startup (import in server.js)
5. Add credentials via `authManager.storeOAuthTokens` or `storeApiKey`
6. Done — connector appears in `/api/connectors`, search and execution pick it up automatically

No changes to the rest of FLOW are needed.

### REST API

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/connectors` | List all registered connectors + auth status |
| GET | `/api/connectors/capabilities` | Capability → [connectorId] map |
| GET | `/api/connectors/health` | Health check all connectors |
| GET | `/api/connectors/timeline` | Workspace action timeline |
| GET | `/api/connectors/audit` | Workspace audit log |
| GET | `/api/connectors/:id` | Single connector detail |
| GET | `/api/connectors/:id/health` | Single connector health |
| POST | `/api/connectors/:id/auth/initiate` | Start OAuth or store API key |
| POST | `/api/connectors/:id/auth/callback` | OAuth code exchange |
| POST | `/api/connectors/:id/auth/revoke` | Revoke credentials |
| POST | `/api/connectors/execute` | Execute a connector action |
| POST | `/api/connectors/search` | Universal cross-connector search |

### Execution Pipeline

Every action through the connector framework runs this pipeline:

1. Input validation (workspaceId, connectorId, actionType required)
2. Human approval required for all side-effectful actions (`approvedBy` field)
3. Connector resolved from registry
4. Action type validated against connector's `supportedActions`
5. Credentials checked — side-effectful actions blocked without auth
6. OAuth scopes validated
7. Adapter `.execute()` called
8. Audit log entry written
9. Timeline event created
10. WebSocket `ACTION_EXECUTED` broadcast
11. Normalized result returned

### Search Strategy

`POST /api/connectors/search` fans out to:
- All registered connectors with `search` support and stored credentials
- Internal memory via `retrievalService` (pgvector + vault)

Results are merged, deduplicated, and ranked by relevance score. The frontend (`UniversalSearch`) now calls both `/api/query` (RAG synthesis) and `/api/connectors/search` (live connectors) in parallel and merges results.

### Authentication Strategies

| Strategy | Use case | Setup |
|----------|----------|-------|
| `oauth2` | Gmail, Slack, GitHub, HubSpot | `POST /api/connectors/:id/auth/initiate` → consent URL → callback |
| `api_key` | Jira, Notion, Datadog | `POST /api/connectors/:id/auth/initiate` with `{ apiKey }` |
| `service_account` | GCP, BigQuery | `POST /api/connectors/:id/auth/initiate` with service account JSON |
| `webhook_secret` | GitHub webhooks, Stripe | Stored secret validated on inbound webhook |

### Security Model

- Every action requires `workspace-id` header (tenant isolation)
- Side-effectful actions (`send`, `create`, `update`, `delete`, `execute`) require `approvedBy` field
- OAuth tokens stored per-workspace-per-connector (no cross-tenant leakage)
- Revoke at any time via `POST /api/connectors/:id/auth/revoke`
- Audit log retained for last 500 actions per workspace
- Timeline retained for last 200 events per workspace

### Frontend Integration

- **ActionCenter**: normalized items carry an `execution.framework` payload with `connectorId`, `actionType`, and `endpoint: '/api/connectors/execute'`
- **UniversalSearch**: queries both RAG pipeline and `/api/connectors/search` in parallel; merges results
- **Recommendation Engine**: unchanged — reads normalized workfeed data; works automatically as connectors populate it

---

## 11. Phase 5.3-A — Enterprise Governance Foundation

### What Changed

Sprint 5.3-A retrofits the connector framework with an enterprise governance layer. No connector-specific code was written. The framework and all future connectors benefit automatically.

### Request Lifecycle (Updated)

```
HTTP Request
      │
      ▼
authenticate.js
  → JWT verify → req.user { id, email, role, orgId }
      │
      ▼
tenantIsolation.js  (FIXED)
  → Reads workspace-id header
  → DB query: SELECT * FROM workspaces WHERE external_id=$1 AND org_id=$2
  → 403 if workspace doesn't belong to req.user.orgId
  → req.tenantId  = workspace.externalId
  → req.workspace = { id, externalId, orgId, org: { plan } }
      │
      ▼
governanceMiddleware.js  (NEW)
  → Reads req.user.role + req.workspace.org.plan
  → req.govContext = { role, orgId, userId, workspaceId, orgPlan, planGate }
      │
      ▼
Route Handler
  → extracts connectorId, actionType, payload, approvedBy from request
      │
      ▼
executeAction()
  │
  ├── 1. Input validation
  ├── 2. Connector resolution (registry lookup — no I/O)
  ├── 3. Governance evaluation  ← NEW
  │       permissionEvaluator.evaluate({ role, actionType, capability, orgPlan, approvedBy })
  │       DENY             → persistAudit(outcome:'denied') → emit event → 403 AuthorizationError
  │       REQUIRE_APPROVAL → persistAudit(outcome:'approval_required') → emit event → 403 APPROVAL_REQUIRED
  │       ALLOW            → continue
  ├── 4. Action support check
  ├── 5. Credential check
  ├── 6. OAuth scope check
  ├── 7. adapter.execute()
  ├── 8. persistConnectorAudit() → PostgreSQL AuditLog  ← NEW (was in-memory ring buffer)
  ├── 9. appendTimeline() → in-memory 200-event ring buffer (real-time WS only)
  ├── 10. liveMetrics counter
  ├── 11. eventBus.emit('CONNECTOR_ACTION_EXECUTED')  ← NEW
  └── 12. broadcastToWorkspace('ACTION_EXECUTED')
```

### Governance Module

```
src/core/governance/
├── constants.js          — Effect (ALLOW/DENY/REQUIRE_APPROVAL), role-action matrix, plan gates
├── permissionEvaluator.js — evaluate(context) → { effect, reason }
├── governanceMiddleware.js — attaches req.govContext to every request
├── auditPersistence.js   — INSERT INTO audit_logs via Prisma (never logs raw payload/secrets)
└── index.js              — barrel export
```

### Permission Matrix (Defaults)

| ActionType | OWNER | ADMIN | MEMBER | VIEWER |
|------------|-------|-------|--------|--------|
| read, search, health, audit, sync | ✓ | ✓ | ✓ | ✓ |
| send, create, update, execute | ✓ (self) | ✓ (self) | ✓ + approval | ✗ |
| delete | ✓ (self) | ✓ + approval | ✗ | ✗ |
| approve, reject | ✓ (self) | ✓ (self) | ✗ | ✗ |

**REQUIRE_APPROVAL** means the action is structurally permitted for the role but requires a non-empty `approvedBy` field in the request body. If absent, the engine returns `403 APPROVAL_REQUIRED` (not `403 FORBIDDEN`). The client can show an approval dialog and re-submit with `approvedBy` populated.

### Plan-Tier Capability Gates

| Plan | Capabilities Available | Max Connectors |
|------|----------------------|----------------|
| free | knowledge, communication | 2 |
| starter | + meetings, engineering | 5 |
| pro | + crm, hr, operations | 20 |
| enterprise | all | unlimited |

Requests from a `free` org trying to use `engineering` capability return `403 DENY: Capability "engineering" requires a higher plan tier`.

### Event Bus (Sprint 5.3-A wiring, Sprint 5.3-B subscribers)

Three new events emitted on the existing `eventBus`:

| Event | When |
|-------|------|
| `CONNECTOR_ACTION_EXECUTED` | Successful execution |
| `CONNECTOR_ACTION_DENIED` | Governance DENY |
| `CONNECTOR_APPROVAL_REQUIRED` | REQUIRE_APPROVAL without approvedBy |

Subscribers (Slack notifications, analytics, memory consolidation) will attach in Sprint 5.3-B without touching the execution engine.

### Audit Log Migration

`GET /api/connectors/audit` now reads from PostgreSQL `AuditLog` table (Prisma). Records survive server restarts. The in-memory 200-event timeline remains for real-time WebSocket delivery only.

Audit rows store structural metadata only — no raw message bodies, no credential values:
```json
{
  "workspaceId": "ws_corp_alpha",
  "connectorId": "gmail",
  "capability":  "communication",
  "actionType":  "send",
  "approvedBy":  "james@company.com",
  "latencyMs":   342,
  "outcome":     "success"
}
```

---

## 12. Phase 5.3-B — Dynamic Governance & Approval System

### New Database Models

| Table | Purpose |
|-------|---------|
| `workspace_members` | Workspace-scoped role per user. Falls back to org role if no record. |
| `policies` | DB-configurable governance rules. Evaluated before default matrix. |
| `pending_approvals` | Persistent record of every REQUIRE_APPROVAL governance decision. |
| `audit_logs.workspace_id` | Dedicated indexed column (replaces JSON metadata filter from Sprint 5.3-A). |
| `audit_logs.approval_id` | Links audit rows to their PendingApproval record. |
| `audit_logs.policy_id` | Links audit rows to the Policy that drove the decision. |

Apply: `psql "postgresql://..." -f scripts/migrate-governance-5-3-b.sql`

### Policy Resolution Order

```
Request arrives at executeAction()
        │
        ▼
evaluateWithPolicies({ orgId, workspaceId, role, actionType, capability, connectorId, approvedBy })
        │
        ├── 1. Load DB Policies (policyStore, 60s cache)
        │         ↓
        │   Match on: subjectRole, subjectUserId, capability, actionType, connectorId
        │   (null field = wildcard — matches anything)
        │         ↓
        │   DENY wins over ALLOW at the same priority level
        │         ↓
        │   Apply `conditions.requireApproval` override if present
        │         ↓
        │   If match found → return { effect, reason, policyId }
        │
        └── 2. Fallback to DEFAULT_ROLE_PERMISSIONS matrix
                  ↓
              Plan-tier gate → Role action gate → Approval gate
                  ↓
              Return { effect, reason, policyId: null }
```

### Approval Lifecycle

```
MEMBER requests "send" action
        │
        ▼
evaluateWithPolicies → REQUIRE_APPROVAL
        │
        ▼
createPendingApproval() → pending_approvals table (status: PENDING)
        │
        ▼
persistConnectorAudit()  (outcome: approval_required, approvalId set)
        │
        ▼
eventBus.emit('CONNECTOR_APPROVAL_REQUIRED')
        │
        ▼
throw AppError(403, 'APPROVAL_REQUIRED', { approvalId })
        │
        │   — later —
        │
ADMIN calls POST /api/approvals/:id/approve
        │
        ▼
approveRequest()  — validates PENDING status + self-approval guard
        │
        ▼
executeAction()   — re-called with approvedBy + approvalId
        │
        ├── evaluateWithPolicies → ALLOW (approvedBy now set)
        ├── adapter.execute()
        ├── persistConnectorAudit() (outcome: success)
        └── markExecuted(approvalId, auditLogId) → status: EXECUTED
```

### Workspace Role Resolution

```
JWT          req.user.role = 'MEMBER'   (org-level, from JWT)
                    │
tenantIsolation     │
                    ↓
      workspace.members WHERE user_id = req.user.id
                    │
               found: role = 'ADMIN'   →  req.workspaceRole = 'ADMIN'
               not found              →  req.workspaceRole = req.user.role
                    │
governanceMiddleware
                    ↓
      req.govContext.role = req.workspaceRole  (workspace takes precedence)
```

### Policy REST API

```bash
# List org policies
curl -H "Authorization: Bearer $JWT" -H "workspace-id: ws_xyz" \
  http://localhost:5000/api/policies

# Create: deny VIEWER from searching on engineering capability
curl -X POST -H "Authorization: Bearer $JWT" -H "workspace-id: ws_xyz" \
  -H "Content-Type: application/json" \
  -d '{
    "subjectRole": "VIEWER",
    "capability":  "engineering",
    "effect":      "DENY",
    "priority":    200,
    "description": "Viewers cannot access engineering connectors"
  }' \
  http://localhost:5000/api/policies

# Toggle a policy off
curl -X PATCH -H "Authorization: Bearer $JWT" -H "workspace-id: ws_xyz" \
  -H "Content-Type: application/json" \
  -d '{ "enabled": false }' \
  http://localhost:5000/api/policies/pol_abc123/toggle
```

### Approval API

```bash
# List pending approvals
curl -H "Authorization: Bearer $JWT" -H "workspace-id: ws_xyz" \
  "http://localhost:5000/api/approvals?status=PENDING"

# Approve a request (re-executes automatically)
curl -X POST -H "Authorization: Bearer $JWT" -H "workspace-id: ws_xyz" \
  http://localhost:5000/api/approvals/apr_abc123/approve

# Reject with note
curl -X POST -H "Authorization: Bearer $JWT" -H "workspace-id: ws_xyz" \
  -H "Content-Type: application/json" \
  -d '{ "note": "Not the right time — wait for Q3 sign-off" }' \
  http://localhost:5000/api/approvals/apr_abc123/reject
```

### Event Architecture

```
executionEngine emits:
  CONNECTOR_ACTION_EXECUTED   → handleActionExecuted   (metrics counter++)
  CONNECTOR_ACTION_DENIED     → handleActionDenied     (denied counter++)
  CONNECTOR_APPROVAL_REQUIRED → handleApprovalRequired (approvalRequired counter++)
  APPROVAL_RESOLVED           → handleApprovalResolved (Sprint 5.3-C: notify requester)

All subscribers are independent — one failing does not affect others.
Subscribers never call executeAction() (read-side observers only).
```

### Future Extension Points

| Feature | Where to add |
|---------|-------------|
| Email/Slack notifications | `eventSubscribers.handleApprovalRequired` |
| Analytics persistence | `eventSubscribers.handleActionExecuted` |
| Multi-stage approval chain | `PendingApproval.approvalChain` (Json) |
| MFA requirement | `Policy.conditions.requireMFA` + session store check in governanceMiddleware |
| Policy versioning | `Policy.version` (Int) + `parentId` (String) |
| Delegated approvals | `PendingApproval.delegatedTo` (String) |
| SSO provider binding | `conditions.ssoProvider` checked against auth session |

---

## Phase 5.3.2 — Security & Deployment Cleanup

**Delivered:** 2026-06-28

### 1. Vault Path Portability

Every hardcoded `/Users/kishorevarma/Desktop/FLOW-OS-VAULTS` reference has been replaced with:

```js
const VAULT_ROOT = process.env.VAULT_ROOT ?? path.join(os.homedir(), 'FLOW-OS-VAULTS');
```

**Affected files:** `vaultService.js`, `retrievalService.js`, `summaryService.js`, `devDashboard.js`

**To override:** Set `VAULT_ROOT=/mnt/data/flow-vaults` in your `.env`. The effective path is logged on every startup:

```
📁 Vault storage root: /home/ubuntu/FLOW-OS-VAULTS
```

All three services (`vaultService`, `retrievalService`, `summaryService`) derive the same root from the same env var — they always stay in sync.

---

### 2. Secure Developer Dashboard

The Engineering Cockpit at `/dev-dashboard` and `/api/dev/*` now has two layers of protection:

#### Layer 1 — Production Block

```js
router.use((req, res, next) => {
  if (process.env.NODE_ENV === 'production') return res.status(404).end();
  next();
});
```

When `NODE_ENV=production`, every request to `/dev-dashboard` or `/api/dev/*` returns a 404 with no body — the route is not discoverable.

#### Layer 2 — API Authentication

```js
router.use((req, res, next) => {
  if (req.path === '/') return next(); // HTML shell, no token needed
  const decoded = jwt.verify(authHeader.split(' ')[1], process.env.JWT_SECRET);
  if (!['OWNER', 'ADMIN'].includes(decoded.role)) return res.status(403)...
  req.user = { ... };
  next();
});
```

The HTML page at `GET /dev-dashboard` is served without a token (browsers cannot attach Authorization headers to navigation). All data endpoints (`/api/dev/stats`, `/api/dev/traces`, etc.) require `Authorization: Bearer <jwt>` with OWNER or ADMIN role.

#### Token UX in the Dashboard

The dashboard header has a **Set Token** button that prompts for the JWT and stores it in `localStorage`. All fetch calls use:

```js
function authHeaders(extra) {
  const t = localStorage.getItem('flowDevToken') || '';
  return t ? { 'Authorization': 'Bearer ' + t, ...extra } : { ...extra };
}
```

A **Sign Out** button clears the stored token.

**To use in development:**
1. `POST /api/auth/login` with your credentials → copy the `token` field
2. Open `http://localhost:5000/dev-dashboard`
3. Click **Set Token** → paste the JWT → page reloads authenticated

---

### 3. JWT Configuration — No Fallback

**Before (insecure):**
```js
const JWT_SECRET = process.env.JWT_SECRET || 'flow-os-dev-secret-change-in-production';
```

**After:**
```js
const JWT_SECRET = process.env.JWT_SECRET; // validated by validateEnv() at startup
```

`validateEnv()` enforces three rules before any module loads:
1. `JWT_SECRET` must be present
2. Must be ≥ 32 characters
3. Must not match a known insecure default (list in `envValidation.js`)

Generate a compliant secret: `openssl rand -hex 32`

---

### 4. Startup Configuration Validation

`src/utils/envValidation.js` now validates:

| Check | Condition | Exit code |
|-------|-----------|-----------|
| `DATABASE_URL` present | falsy → FATAL | 1 |
| `REDIS_URL` present | falsy → FATAL | 1 |
| `JWT_SECRET` present | falsy → FATAL | 1 |
| `JWT_SECRET` length | < 32 chars → FATAL | 1 |
| `JWT_SECRET` value | matches known-insecure set → FATAL | 1 |
| `COMPOSIO_API_KEY` present | falsy → FATAL | 1 |
| AI provider key | neither `GEMINI_API_KEY` nor `OPENAI_API_KEY` → FATAL | 1 |
| `VAULT_ROOT` | optional — effective path logged on startup | — |

Error output format:
```
=================================================
❌ FATAL: CRITICAL ENVIRONMENT CONFIGURATION ERROR
=================================================
- Missing/Invalid: JWT_SECRET
  Too short (8 chars). Minimum 32 characters required. Run: openssl rand -hex 32
=================================================
```

---

### Files Modified in Sprint 5.3.2

| File | Change |
|------|--------|
| `src/utils/envValidation.js` | JWT quality checks (length + known-defaults); VAULT_ROOT startup log |
| `src/core/middleware/authenticate.js` | Removed insecure fallback; cleaned up stale public path entries |
| `src/services/vaultService.js` | `VAULT_ROOT` from env var |
| `src/services/retrievalService.js` | `VAULT_ROOT` from env var |
| `src/services/summaryService.js` | `VAULT_ROOT` from env var |
| `src/routes/devDashboard.js` | Production block + API auth middleware; dashboard fetch calls send Bearer token; vault root from env var |

### Technical Debt Resolved

| ID | Status |
|----|--------|
| TD-02 | ✅ Vault root now configurable via `VAULT_ROOT` env var |
| TD-03 | ✅ Dev dashboard blocked in production; API routes require OWNER/ADMIN JWT |
| TD-05 | ✅ JWT secret fallback removed; startup fails fast on missing/weak secret |

---

## Phase 5.4 — Communication Capability

### Architecture

The Communication Capability is a provider-agnostic email/messaging layer built on the Universal Connector Framework. Gmail is the first provider. All actions flow through the Execution Engine — governance, audit, timeline, and WebSocket broadcast happen automatically.

```
Client
  └→ GET/POST /api/communication/*
       └→ communicationRoutes.js          (workspace-id guard, validation)
            └→ executeAction()            (governance → credential check → adapter)
                 └→ GmailAdapter.execute()
                      └→ gmail API v1
                 └→ persistConnectorAudit() → PostgreSQL AuditLog
                 └→ appendTimeline()       → in-memory ring (WS only)
                 └→ broadcastToWorkspace() → WebSocket FLOW_ACTION_EXECUTED
```

### Environment Variables

Add to `.env` before testing Gmail:
```bash
GOOGLE_CLIENT_ID=<your google oauth client id>
GOOGLE_CLIENT_SECRET=<your google oauth client secret>
FRONTEND_URL=http://localhost:3000         # OAuth redirect destination
```
Aliases `GMAIL_CLIENT_ID` / `GMAIL_CLIENT_SECRET` are also accepted for backward compatibility.

### OAuth Flow

```
1. POST /api/connectors/gmail/auth/initiate
   Body: { callbackUrl: "http://localhost:5001/api/communication/oauth/callback" }
   Response: { authUrl: "https://accounts.google.com/o/oauth2/auth?..." }

2. Redirect user to authUrl in a browser

3. Google redirects back to:
   GET /api/communication/oauth/callback?code=...&state=<workspaceId>
   → tokens stored in authManager for workspace
   → browser redirected to FRONTEND_URL/platform/integrations?gmailConnected=true

4. Workspace is now connected; all communication routes work
```

### API Examples

```bash
# Status check (is Gmail connected for this workspace?)
curl http://localhost:5001/api/communication/status \
  -H "Authorization: Bearer <jwt>" \
  -H "workspace-id: workspace_corp_alpha"

# Inbox (first 10 unread)
curl "http://localhost:5001/api/communication/inbox?limit=10&q=is:unread" \
  -H "Authorization: Bearer <jwt>" \
  -H "workspace-id: workspace_corp_alpha"

# Read a thread
curl http://localhost:5001/api/communication/thread/1234abcd \
  -H "Authorization: Bearer <jwt>" \
  -H "workspace-id: workspace_corp_alpha"

# Send email
curl -X POST http://localhost:5001/api/communication/send \
  -H "Authorization: Bearer <jwt>" \
  -H "workspace-id: workspace_corp_alpha" \
  -H "Content-Type: application/json" \
  -d '{"to":"colleague@example.com","subject":"Test","body":"Hello from FLOW OS"}'

# Reply to a message
curl -X POST http://localhost:5001/api/communication/reply/MSG_ID \
  -H "Authorization: Bearer <jwt>" \
  -H "workspace-id: workspace_corp_alpha" \
  -H "Content-Type: application/json" \
  -d '{"body":"Thanks, confirmed."}'

# Gmail search
curl -X POST http://localhost:5001/api/communication/search \
  -H "Authorization: Bearer <jwt>" \
  -H "workspace-id: workspace_corp_alpha" \
  -H "Content-Type: application/json" \
  -d '{"query":"from:cto@example.com has:attachment","limit":20}'

# Archive a message
curl -X PATCH http://localhost:5001/api/communication/label/MSG_ID \
  -H "Authorization: Bearer <jwt>" \
  -H "workspace-id: workspace_corp_alpha" \
  -H "Content-Type: application/json" \
  -d '{"action":"archive"}'

# Sync inbox to RAG pipeline (queues messages into BullMQ for ingestion)
curl -X POST http://localhost:5001/api/communication/sync \
  -H "Authorization: Bearer <jwt>" \
  -H "workspace-id: workspace_corp_alpha" \
  -H "Content-Type: application/json" \
  -d '{"limit":25,"q":"is:unread"}'
```

### Adding a New Communication Provider

1. Create `src/connectors/adapters/YourAdapter.js` extending `BaseAdapter` with `capability: Capability.COMMUNICATION`
2. Implement the same methods: `authenticate`, `handleAuthCallback`, `execute`, `search`, `healthCheck`
3. Add one line to `src/connectors/adapters/index.js`:
   ```js
   import yourAdapter from './YourAdapter.js';
   registerConnector(yourAdapter);
   ```
4. Clients use `?provider=youradapter` on any `/api/communication/*` route — zero route changes needed

### Files Delivered in Sprint 5.4

| File | Change |
|------|--------|
| `src/connectors/adapters/GmailAdapter.js` | New — full Gmail Communication provider (OAuth, CRUD, search, sync) |
| `src/connectors/adapters/index.js` | New — adapter registration side-effect imported at boot |
| `src/routes/communicationRoutes.js` | New — 14 REST routes for Communication Capability |
| `src/server.js` | Import adapter registration + mount `/api/communication` |
| `src/utils/envValidation.js` | Non-fatal warning when Gmail credentials absent |
| `CLAUDE.md` | Phase 5.4 section, route map update, env vars, status update |
| `DEVELOPER_WALKTHROUGH.md` | This section |

---

## Phase 5.6 — Engineering Capability

### Overview

The Engineering Capability is the third production connector capability, following Communication (Phase 5.4) and Meeting (Phase 5.5). GitHub is the first provider — the architecture is identical to the Communication and Meeting capabilities so GitLab, Bitbucket, and Azure DevOps require only a new adapter file.

### Authentication

GitHub uses Personal Access Token (PAT) authentication (no OAuth flow required for read-only or admin-scoped tokens):

```bash
# Store a GitHub PAT for a workspace
curl -X POST http://localhost:5001/api/engineering/auth \
  -H "Authorization: Bearer <jwt>" \
  -H "workspace-id: workspace_corp_alpha" \
  -H "Content-Type: application/json" \
  -d '{"token":"ghp_xxxxxxxxxxxxxxxxxxxx"}'
```

Or set `GITHUB_TOKEN` in `.env` — the adapter falls back to the env var when no workspace-level token is stored. Required scopes: `repo`, `read:user`.

### Engineering Adapter Contract

`GitHubAdapter` extends `BaseAdapter` with `capability: Capability.ENGINEERING`. The `read()` method dispatches on `payload.resourceType`:

| resourceType | GitHub API | Returns |
|-------------|-----------|---------|
| `repos` | `/repos/{owner}/{repo}` or `/user/repos` | `createEngineeringTask[]` (type: pipeline) |
| `contributors` | `/repos/{owner}/{repo}/contributors` | contributor list with counts |
| `branches` | `/repos/{owner}/{repo}/branches` | `createEngineeringTask[]` (type: pipeline) |
| `branches` + base+head | `/repos/{owner}/{repo}/compare/{base}...{head}` | comparison with commit list |
| `commits` | `/repos/{owner}/{repo}/commits` | `createEngineeringTask[]` with `filesChanged` |
| `pulls` | `/repos/{owner}/{repo}/pulls` | `createEngineeringTask[]` (type: pr) with `mergeReadinessScore` |
| `reviews` | `/repos/{owner}/{repo}/pulls/{n}/reviews` | reviews + workload + suggested reviewers |
| `deployments` | `/repos/{owner}/{repo}/deployments` | `createEngineeringTask[]` (type: deployment) with `riskScore` |

### Merge Readiness Score (0–100)

```
base = 50
- PR is draft                    → -30
- merge conflicts                → -40
+ each APPROVED review           → +15
- each CHANGES_REQUESTED review  → -20
+ CI checks passing (detected)   → +20
- PR age > 14 days               → -10
clamped to [0, 100]
```

A score ≥ 80 is green (merge ready), 50–79 is yellow (review in progress), < 50 is red (blocked).

### Deployment Risk Score (0–100)

```
base = 30
+ production environment         → +30
+ staging environment            → +10
+ off-hours deployment (< 9AM or > 6PM) → +15
+ weekend deployment             → +15
clamped to [0, 100]
```

### Knowledge Graph Integration

On `sync()`, the adapter:
1. Pushes open PR text into BullMQ ingestion queue for the 9-stage pipeline
2. Registers `user:github:{login}` entities in the in-memory Knowledge Graph
3. Links PR nodes to their author with `authored_by` edges

This means GitHub engineers connect into FLOW's operational graph alongside calendar attendees, Slack senders, and Gmail participants.

### Adding a New Engineering Provider

1. Create `src/connectors/adapters/YourAdapter.js` extending `BaseAdapter` with `capability: Capability.ENGINEERING`
2. Implement `read(workspaceId, options)` dispatching on `options.resourceType`
3. Register in `src/connectors/adapters/index.js`:
   ```js
   import yourAdapter from './YourAdapter.js';
   registerConnector(yourAdapter);
   ```
4. Clients use `?provider=youradapter` — zero route changes needed

### Files Delivered in Phase 5.6

| File | Change |
|------|--------|
| `src/connectors/adapters/GitHubAdapter.js` | New — full GitHub Engineering provider (repos, branches, commits, PRs, reviews, deployments, merge/approve/create, search, sync) |
| `src/connectors/adapters/index.js` | +1 import + registerConnector(gitHubAdapter) |
| `src/routes/engineeringRoutes.js` | New — 22 REST routes for Engineering Capability |
| `src/server.js` | Import + mount `/api/engineering` |
| `src/utils/envValidation.js` | Non-fatal warning when GITHUB_TOKEN absent |
| `flow-os-frontend/src/components/projects/ProjectIntelligence.jsx` | Rewritten — fetches repos+PRs+commits; normalizes to project shape; demo fallback |
| `CLAUDE.md` | Phase 5.6 section, route map update (22 routes), env vars, status update |
| `DEVELOPER_WALKTHROUGH.md` | This section |

---

## Phase 5.7 — Work Management Capability

### Overview

The Work Management Capability is the fourth production connector capability. Jira is the first provider — the architecture is identical to the other capabilities, allowing Linear, Asana, and ClickUp to extend the same API routes via `?provider=` query parameter.

### Authentication

Jira uses email + apiToken stored via `storeApiKey()`:

```bash
# Store Jira credentials for a workspace
curl -X POST http://localhost:5001/api/work/auth \
  -H "Authorization: Bearer <jwt>" \
  -H "workspace-id: workspace_corp_alpha" \
  -H "Content-Type: application/json" \
  -d '{"email":"dev@flow-os.local","token":"jira_api_token"}'
```

### Work Management Adapter Contract

`JiraAdapter` extends `BaseAdapter` with `capability: Capability.WORK_MANAGEMENT`. The `read()` method dispatches on `payload.resourceType`:

| resourceType | Jira API | Returns |
|-------------|-----------|---------|
| `projects` | `/rest/api/3/project` | `MOCK_PROJECTS` list / live project list |
| `project` | `/rest/api/3/project/{key}` | single project metadata (boards, components, versions) |
| `issues` | `/rest/api/3/search?jql=` | `createWorkItem[]` |
| `issue` | `/rest/api/3/issue/{key}` | `createWorkItem` with `aiIntelligence` |
| `sprints` | `/rest/agile/1.0/board/{id}/sprint` | sprint milestones, velocity, and burndown |

### AI Intelligence Analysis (Sprint 5.7 Target)

Every Jira issue is enriched with a simulated AI analysis pass:
* **AI Summary**: Short, dense executive context.
* **Business Impact**: Downstream operational value/downtime cost.
* **Risk Score** (0-100): Composite of blocker counts, priority, and timeline.
* **Priority Score** (0-100): Calculated authority/urgency metrics.
* **Suggested Next Action**: Pragmatic task steps.

### Knowledge Graph Integration

On `sync()` or `create()`, the adapter:
1. Registers `ISSUE` and `PROJECT` entities in the graph.
2. Establishes links: `ISSUE` --[BELONGS_TO]--> `PROJECT`, `ISSUE` --[ASSIGNED_TO]--> `USER`.
3. Auto-links cross-platform dependencies (e.g. `ISSUE` --[BLOCKS]--> `ISSUE`).

### Files Delivered in Phase 5.7

| File | Change |
|------|--------|
| `src/connectors/adapters/JiraAdapter.js` | New — Jira Work Management adapter supporting projects, issues, sprints, workflows, AI intelligence details, search, and knowledge graph mapping |
| `src/routes/workRoutes.js` | New — 12 REST routes for Work Management |
| `src/connectors/capabilities.js` | Added `WORK_MANAGEMENT` capability and actions |
| `src/connectors/normalizedTypes.js` | Added `createWorkItem` factory normalizer |
| `src/server.js` | Mounted `/api/work` route namespace |
| `src/services/knowledgeGraphService.js` | Extended `EntityTypes` with `ISSUE` and `PROJECT` |
| `flow-os-frontend/src/components/projects/ProjectIntelligence.jsx` | Updated to display active sprints and toggle tabs between Jira / GitHub |
| `flow-os-frontend/src/components/projects/ProjectOverview.jsx` | Overwritten to render active sprint Kanban boards and slide-out AI drawers |

---

## Phase 5.8 — Knowledge Capability

### Overview

The Knowledge Capability is the fifth production connector capability. Notion is the first provider — the architecture is identical to the other capabilities, allowing Confluence, Google Drive, SharePoint, and Obsidian to extend the same API routes via `?provider=` query parameter.

### Authentication

Notion uses apiToken stored via `storeApiKey()`:

```bash
# Store Notion credentials for a workspace
curl -X POST http://localhost:5001/api/knowledge/auth \
  -H "Authorization: Bearer <jwt>" \
  -H "workspace-id: workspace_corp_alpha" \
  -H "Content-Type: application/json" \
  -d '{"apiKey":"secret_xxxxxxxxxxxxxxxxxxxxxxxxxx"}'
```

### Knowledge Adapter Contract

`NotionAdapter` extends `BaseAdapter` with `capability: Capability.KNOWLEDGE`. The `read()` method dispatches on `payload.resourceType`:

| resourceType | Notion API | Returns |
|-------------|------------|---------|
| `documents` | `/v1/search` | `createKnowledgeDocument[]` |
| `document` | `/v1/pages/{id}` | single page details with `aiIntelligence` |

### AI Intelligence Analysis (Sprint 5.8 Target)

Every Notion document is enriched with a simulated AI analysis pass:
* **AI Summary**: Concise executive synthesis.
* **Decisions**: List of core decisions recorded in the document.
* **Action Items**: Key tasks with assignees.
* **Risks**: Outlined business/technical risks.
* **Suggested Follow-Up**: Actionable next step recommendations.
* **Cross-Platform Links**: Links to related Meetings, Emails, Jira issues, and GitHub PRs.

### Knowledge Graph Integration

On `sync()` or `create()`, the adapter:
1. Registers `DOCUMENT` and `DEPARTMENT` entities in the graph.
2. Establishes links: `DOCUMENT` --[BELONGS_TO]--> `DEPARTMENT` (space), `DOCUMENT` --[AUTHORED_BY]--> `USER`.
3. Auto-links cross-platform dependencies (e.g. `DOCUMENT` --[CONTEXT_FOR]--> `ISSUE`, `DOCUMENT` --[AUDITED_BY]--> `USER`).

### Files Delivered in Phase 5.8

| File | Change |
|------|--------|
| `src/connectors/adapters/NotionAdapter.js` | New — Notion Knowledge adapter supporting search, sync, read, create, update, delete, and AI insights |
| `src/connectors/adapters/ConfluenceAdapter.js` | New — Confluence adapter foundation skeleton |
| `src/connectors/adapters/GoogleDriveAdapter.js` | New — Google Drive adapter foundation skeleton |
| `src/routes/knowledgeRoutes.js` | New — 12 REST routes for Knowledge Capability |
| `src/connectors/capabilities.js` | Updated `Capability.KNOWLEDGE` actions list |
| `src/connectors/normalizedTypes.js` | Added `aiIntelligence` to `createKnowledgeDocument` |
| `src/server.js` | Mounted `/api/knowledge` route namespace |
| `flow-os-frontend/src/components/company/CompanyMemory.jsx` | Updated to retrieve documents from Knowledge API and show AI insights cards |
| `flow-os-frontend/src/components/knowledge/KnowledgeExplorer.jsx` | Appended Notion nodes and edges to the Knowledge Graph visualization |

---

## Phase 5.9 — Customer Intelligence Capability (CRM)

### Overview

The Customer Intelligence Capability is the sixth production connector capability. HubSpot is the first provider — the architecture is identical to the other capabilities, allowing Salesforce, Zoho, and Pipedrive to extend the same API routes via `?provider=` query parameter.

### Authentication

HubSpot uses access tokens / api keys stored via `storeApiKey()`:

```bash
# Store HubSpot credentials for a workspace
curl -X POST http://localhost:5001/api/crm/auth \
  -H "Authorization: Bearer <jwt>" \
  -H "workspace-id: workspace_corp_alpha" \
  -H "Content-Type: application/json" \
  -d '{"apiKey":"pat-na1-xxxxxxxxxxxxxxxxxxxxxxxxx"}'
```

### Customer Intelligence Adapter Contract

`HubSpotAdapter` extends `BaseAdapter` with `capability: Capability.CRM`. The `read()` method dispatches on `payload.resourceType`:

| resourceType | HubSpot API | Returns |
|-------------|-------------|---------|
| `accounts` | `/crm/v3/objects/companies` | `createCrmAccount[]` |
| `account` | `/crm/v3/objects/companies/{id}` | single account detail with related contacts, opportunities, and activities |
| `contacts` | `/crm/v3/objects/contacts` | `createCrmContact[]` |
| `opportunities` | `/crm/v3/objects/deals` | `createCrmOpportunity[]` |
| `activities` | `/crm/v3/objects/emails` / `/meetings` | `createCrmActivity[]` |

### AI Intelligence Analysis (Sprint 5.9 Target)

Every HubSpot Account is enriched with a simulated AI analysis pass:
* **Health Score**: 0-100 score indicating client sentiment and active issue counts.
* **Churn Risk**: Low / Medium / High churn indicator.
* **Expansion Opportunity**: Low / Medium / High up-sell indicator.
* **Communication Summary**: Narrative synthesis of latest calls, emails, and meetings.
* **Outstanding Commitments**: Unfulfilled promises or deadlines.
* **Suggested Next Action**: Targeted recommended follow-ups.

### Knowledge Graph Integration

On `sync()`, the adapter:
1. Registers `CUSTOMER` (accounts), `USER` (contacts), and `OPPORTUNITY` (deals) nodes in the graph.
2. Establishes links: `CONTACT` --[WORKS_AT]--> `ACCOUNT`, `OPPORTUNITY` --[BELONGS_TO]--> `ACCOUNT`.
3. Auto-links cross-platform dependencies: e.g. `CUSTOMER` --[AFFECTED_BY]--> `INCIDENT`, `CUSTOMER` --[WAITING_ON]--> `ISSUE` (Jira).

### Files Delivered in Phase 5.9

| File | Change |
|------|--------|
| `src/connectors/adapters/HubSpotAdapter.js` | New — HubSpot CRM adapter supporting accounts, contacts, opportunities, activities, search, and knowledge graph mapping |
| `src/connectors/adapters/SalesforceAdapter.js` | New — Salesforce adapter foundation skeleton |
| `src/routes/crmRoutes.js` | New — 12 REST routes for Customer Intelligence |
| `src/connectors/capabilities.js` | Updated `Capability.CRM` actions list |
| `src/connectors/normalizedTypes.js` | Added `createCrmAccount`, `createCrmContact`, `createCrmOpportunity`, and `createCrmActivity` |
| `src/server.js` | Mounted `/api/crm` route namespace |
| `src/services/knowledgeGraphService.js` | Extended `EntityTypes` with `OPPORTUNITY` |
| `flow-os-frontend/src/components/company/CustomerIntelligence.jsx` | New — Customer Intelligence dashboard with health panels and AI customer insights |
| `flow-os-frontend/src/components/company/CompanyWorkspace.jsx` | Updated to display CRM KPI metrics and link to `/admin/crm` |
| `flow-os-frontend/src/App.jsx` | Registered the new customer intelligence dashboard route |

---

## Phase 6.0 — Workforce Intelligence Capability (HR)

### Overview

The Workforce Intelligence Capability is the seventh production connector capability. Workday is the first provider — the architecture is identical to the other capabilities, allowing BambooHR, Rippling, and Deel to extend the same API routes via `?provider=` query parameter.

### Authentication

Workday uses API keys stored via `storeApiKey()`:

```bash
# Store Workday credentials for a workspace
curl -X POST http://localhost:5001/api/hr/auth \
  -H "Authorization: Bearer <jwt>" \
  -H "workspace-id: workspace_corp_alpha" \
  -H "Content-Type: application/json" \
  -d '{"apiKey":"wd-api-key-xxxxxxxxxxxxxxxxxxxxxxxxx"}'
```

### Workforce Intelligence Adapter Contract

`WorkdayAdapter` extends `BaseAdapter` with `capability: Capability.HR`. The `read()` method dispatches on `payload.resourceType`:

| resourceType | Workday API | Returns |
|-------------|-------------|---------|
| `employees` | `/workers` | `createHrEmployee[]` |
| `employee` | `/workers/{id}` | single worker profile detail with reports, workload, skills, timezone, timeoff |
| `teams` | `/org-groups` | `createHrTeam[]` |
| `skills` | `/skills` | `createHrSkill[]` |
| `availability` | `/timeoff` | `createHrAvailability[]` |

### AI Workforce Insights (Sprint 6.0 Target)

Every Workday Employee is enriched with a simulated AI analysis pass:
* **Burnout Risk**: Low / Medium / High burnout warning based on workload metrics.
* **Context Switching Score**: Percentage indicating task fragmentation.
* **Review Bottlenecks**: Highlights code or spec approval congestion.
* **Knowledge Concentration Risk**: Pinpoints siloed technical domains (e.g. KMS secret management).
* **Suggested Delegates / Reviewers**: Auto-matches team peers for RAG context matching.

### Knowledge Graph Integration

On `sync()`, the adapter:
1. Registers `USER` (employees/managers) and `SYSTEM` (skills/services) nodes in the graph.
2. Establishes links: `EMPLOYEE --[REPORTS_TO]--> MANAGER`, `EMPLOYEE --[WORKS_IN]--> DEPARTMENT`, `EMPLOYEE --[WORKS_ON]--> PROJECT`.
3. Auto-links cross-platform dependencies: e.g. `EMPLOYEE --[ASSIGNED_TO]--> ISSUE` (Jira), `EMPLOYEE --[SUPPORTS]--> CUSTOMER` (CRM).

### Files Delivered in Phase 6.0

| File | Change |
|------|--------|
| `src/connectors/adapters/WorkdayAdapter.js` | New — Workday HR adapter supporting employees, teams, skills, availability, search, and knowledge graph mapping |
| `src/connectors/adapters/BambooHRAdapter.js` | New — BambooHR adapter foundation skeleton |
| `src/routes/hrRoutes.js` | New — 12 REST routes for Workforce Intelligence |
| `src/connectors/capabilities.js` | Updated `Capability.HR` actions list |
| `src/connectors/normalizedTypes.js` | Added `createHrEmployee`, `createHrTeam`, `createHrSkill`, and `createHrAvailability` |
| `src/server.js` | Mounted `/api/hr` route namespace |
| `flow-os-frontend/src/components/company/WorkforceIntelligence.jsx` | New — Workforce Intelligence dashboard with burnout risk gauges and AI direct reports reporting tree |
| `flow-os-frontend/src/components/company/CompanyWorkspace.jsx` | Updated to display HR button link to `/admin/workforce` |
| `flow-os-frontend/src/App.jsx` | Registered the new workforce intelligence dashboard route |

---

## Phase 6.1 — Executive Intelligence Layer

### Overview

The Executive Intelligence Layer reasons across every capability already built. It aggregates 7 key operational sectors (Engineering, Delivery, Customer, Workforce, Operational, Knowledge, Revenue) into a unified overall Company Health Score and provides an AI Chief of Staff morning briefing.

### Endpoint APIs

#### 1. GET `/api/intelligence/briefing`
Returns the complete executive briefing payload including:
* **Morning Brief**: Today's priorities, wins, risks, and operational summary text.
* **Company Health**: Sector scores + overall health score.
* **AI Executive Recommendations 2.0**: Action cards detailing confidence, business impact, and owner.
* **Unified Timeline**: Collation of meeting events, code commits, Jira tasks, customer escalations, PTO logs.
* **Company Graph Explorer**: Nodes and edges representing cross-system entity relationships.

#### 2. POST `/api/intelligence/qa`
Accepts a strategic executive question (e.g. "Why is Engineering Health declining?", "Which customers are most at risk?") and returns evidence-based reasoning answers linking multiple backend capability sources.

### Company Health Computation Matrix

The health aggregator calculates scores out of 100:
1. **Engineering**: Active critical/high server incidents + high-urgency vector store chunks.
2. **Delivery**: Blocked or high-risk Jira tasks.
3. **Customer**: Average health score of HubSpot accounts.
4. **Workforce**: Staff burnout alerts.
5. **Operational**: Active production incidents and queue status.
6. **Knowledge**: Notion document audit completeness.
7. **Revenue**: Average deal probabilities from HubSpot opportunities.

### Files Delivered in Phase 6.1

| `src/services/healthScoreService.js` | Updated — Re-implemented `calculateWorkspaceHealth` to aggregate 7-sector scores and broadcast health payload |
| `src/routes/intelligenceRoutes.js` | Updated — Implemented `/briefing` and `/qa` endpoints |
| `flow-os-frontend/src/components/company/CompanyWorkspace.jsx` | Updated — Redesigned into a full Executive Operating System dashboard with circular gauges, unified timeline, and SVG Graph Explorer |
| `flow-os-frontend/src/components/company/ExecutiveAdvisor.jsx` | Updated — Connected strategic Q&A chat form to backend `/api/intelligence/qa` endpoint |

---

## Phase 6.2 — Operational Intelligence Engine

### Overview

The Operational Intelligence Engine provides cross-capability event correlation, predictive scoring, proactive recommendations, dynamic model training feedback, and narrative-driven operational stories.

### Key Capabilities

#### 1. Event Correlation Engine
Correlates events across isolated capabilities (e.g. groups customer email + meeting + blocker issue + pull request + deployment into single event traces).

#### 2. Predictive Intelligence
Generates delivery delay risk, customer churn probability, sprint completion confidence, staff burnout alerts, review bottlenecks, and deployment risk margins.

#### 3. Proactive Recommendation Engine (Learning Loop)
Tracks user authorization / rejection responses to proactively recommendations to dynamically adjust AI model weights in real-time.

#### 4. Operational Story Builder
Generates narrative descriptions detailing exactly why projects are slipping or succeeding.

### Files Delivered in Phase 6.2

| `src/services/operationalIntelligenceService.js` | New — Core intelligence service managing predictions, stories, correlations, recommendations feedback, and decision memory |
| `src/routes/intelligenceRoutes.js` | Updated — Integrated predictions/stories in `/briefing` and added `POST /recommendations/:id/feedback` learning loop route |
| `flow-os-frontend/src/components/company/CompanyWorkspace.jsx` | Updated — Rendered Predictive Intelligence indexes, Operational Stories, and Learning Loop triggers |

---

## Phase 7.0 Milestone 2 — Autonomous Operational Brain (AI Reasoning Layer)

### Overview
Phase 7.0 Milestone 2 introduces the AI Reasoning Layer which implements personalized briefings, a context-aware copilot service, and explainable recommendation systems across all connected channels.

### Features

#### 1. Role-aware Briefing Engine
Generates customized briefs based on the user's role:
* **Employee/Engineer**: Daily focus (triage Sev-1 latency pool checks, PR #824 retry config review), blockers (FLOW-247 release alerts), opportunities (decisions memory blocks).
* **Engineering Manager**: Team blockers (Frontend rewrite backend dependency blocks), resource limits (Sarah Chen burnout overload), budget approvals (AWS RDS scale upgrades).
* **Executive**: High-level telemetry (TechCorp SLA incident), customer risk maps, Globex expansion deal closings.

#### 2. Context-aware Copilot Service
Queries pgvector databases + Knowledge Graph adjacency mappings to synthesize evidence-based answers. Supports JSON structured schemas containing final responses and detailed `reasoningTrace` blocks.

#### 3. Cross-capability Reasoning
Explicitly traces dependency chains automatically:
* *Customer Latency Chain*: Email complaint (INC-B71C) -> Incident declared (INC-A3F2) -> Code PR submitted (#824) -> Awaiting verification deploy -> Recommendation.
* *Burnout Overload Chain*: Employee meeting overload (Sarah Chen) -> Task context switching -> Gated HubSpot deal activation -> Onboarding milestone slippage -> Recommendation.

#### 4. Explainable Recommendations
Every recommendation contains: `title`, `summary`, `evidence[]`, `relatedSystems[]`, `confidence` score, `businessImpact`, `urgency` level, `suggestedOwner`, and `reasoningTrace`.

### Files Delivered in Phase 7.0 Milestone 2

| File | Change |
|------|--------|
| `src/services/operationalBrainService.js` | New — Reasoning layer containing briefings, copilot, and explainable recommendations |
| `src/routes/intelligenceRoutes.js` | Updated — Registered `/briefing/:role`, `/copilot`, and `/explainable-recommendations` routes |

---

## Phase 7.0 Milestones 1, 3 & 4 — Operational Brain (Production)

> Full architecture, pipelines, diagrams, and deployment guide: [`docs/PHASE7_OPERATIONAL_BRAIN.md`](docs/PHASE7_OPERATIONAL_BRAIN.md).

The production Operational Brain runs alongside the Milestone-2 reasoning service and is fronted by a dedicated, provider-agnostic API at **`/api/brain/*`** (separate from the legacy `/api/intelligence/*` routes).

### Durable foundation (M1)
- `orgMemoryService.js` persists decisions/incidents to PostgreSQL (`org_memory_records`).
- `operationalGraphService.js` is a durable, workspace-namespaced operational graph (`graph_nodes`/`graph_edges`).
- Decisions/incidents detected in the ingestion pipeline fire-and-forget into Org Memory.

### Decision & Execution (M3)
- `decisionEngine.js` — turns recommendations into structured, explainable decisions.
- `automationEngine.js` — governed multi-step workflows; **every step routes through `executeAction()`**; runs as a fixed `MEMBER` actor; rule mutation requires ADMIN/OWNER.
- `goalTrackingService.js` — OKR goals with `evaluateGoal` (risks, blockers, predicted completion).

### Experience (M4)
- Floating Copilot (global), Executive Dashboard (`/dashboard`), Daily Briefing (`/briefing`), Operational Timeline (`/timeline`), brain-routed Command Palette (⌘K), Cross-Capability Workspace (`/entity/:id`), and a top-level ErrorBoundary.
- All frontend brain calls go through `flow-os-frontend/src/lib/brainApi.js`.

### Verify it end-to-end
```bash
# 1. Apply Phase-7 migrations (idempotent; never touches workspace_intel_chunks)
psql "$DATABASE_URL" -f prisma/migrations/20260628000000_phase7_brain/migration.sql
psql "$DATABASE_URL" -f prisma/migrations/20260628010000_phase7_brain_extended/migration.sql
npx prisma generate

# 2. Boot + health
npm run start
npm run verify            # expect >= 90% (Vector Store 429 = external quota, not a fault)

# 3. Exercise the Brain API (replace <jwt>)
curl "http://localhost:5000/api/brain/briefing?role=EXECUTIVE" \
  -H "Authorization: Bearer <jwt>" -H "workspace-id: workspace_corp_alpha"

curl -X POST http://localhost:5000/api/brain/copilot \
  -H "Authorization: Bearer <jwt>" -H "workspace-id: workspace_corp_alpha" \
  -H "Content-Type: application/json" \
  -d '{"question":"What needs my attention today?","pageContext":"Executive Dashboard"}'

curl "http://localhost:5000/api/brain/timeline?hours=168&limit=20" \
  -H "Authorization: Bearer <jwt>" -H "workspace-id: workspace_corp_alpha"

# 4. Frontend
cd flow-os-frontend && npm run build   # production bundle; npm run dev for local
```

### Governance invariants (must not regress)
Automation never bypasses Governance · automation actor role is a fixed `MEMBER` (rule data cannot escalate) · rule create/toggle/delete require ADMIN/OWNER and verify workspace ownership · `CONNECTOR_ACTION_EXECUTED` is never an automation trigger (prevents self-trigger loops).

### Files Delivered in Phase 7.0 Milestones 1, 3 & 4

| File | Change |
|------|--------|
| `src/services/orgMemoryService.js` | New — durable org memory (PostgreSQL) |
| `src/services/operationalGraphService.js` | New — PostgreSQL operational graph |
| `src/services/decisionEngine.js` | New — structured explainable decisions |
| `src/services/automationEngine.js` | New — governed multi-step automation |
| `src/services/goalTrackingService.js` | New — OKR goals + evaluation |
| `src/services/brainTimelineService.js` | New — unified timeline + entity context |
| `src/routes/brainRoutes.js` | New — unified `/api/brain/*` API |
| `prisma/schema.prisma` + `prisma/migrations/20260628*_phase7_brain*` | New — 11 Phase-7 models |
| `flow-os-frontend/src/lib/brainApi.js`, `lib/entityContext.js` | New — brain client + entity event bus |
| `flow-os-frontend/src/components/ui/AICopilot.jsx`, `ErrorBoundary.jsx` | New — global copilot + error boundary |
| `flow-os-frontend/src/components/company/ExecutiveDashboard.jsx` | New — `/dashboard` |
| `flow-os-frontend/src/components/workspace/DailyBriefing.jsx`, `OperationalTimeline.jsx`, `EntityContextPanel.jsx`, `EntityWorkspace.jsx` | New — briefing, timeline, entity workspace |
| `flow-os-frontend/src/components/ui/CommandPalette.jsx` | Updated — brain-routed nav commands |







