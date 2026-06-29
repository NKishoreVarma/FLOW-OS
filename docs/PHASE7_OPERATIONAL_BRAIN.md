# FLOW OS — Phase 7.0: Autonomous Operational Brain

> Reference documentation for the Operational Brain layer (Milestones 1–4).
> Last updated: 2026-06-29.

Phase 7.0 turns FLOW from a system that *understands* the company into one that *coordinates work* — continuously reasoning across every capability, producing explainable recommendations, executing governed multi-step automations, tracking goals, and surfacing all of it through a unified executive experience.

---

## 1. Milestone Map

| Milestone | Theme | Delivered |
|-----------|-------|-----------|
| **M1** | Core Intelligence Foundation | Durable Org Memory, PostgreSQL Operational Graph, Phase-7 Prisma schema |
| **M2** | AI Reasoning Layer | Role-aware Briefing Engine, Context-aware Copilot, `/api/brain/*` |
| **M3** | Decision & Execution Intelligence | Decision Engine, governed Automation Engine, Goal Tracking, extended Brain API |
| **M4** | Executive Experience & Universal Copilot | Floating Copilot, Executive Dashboard, Daily Briefing, Command Palette, Operational Timeline, Cross-Capability Workspace, Enterprise hardening, docs |

---

## 2. System Architecture

```
                         ┌──────────────────────────────────────────┐
                         │            React Frontend (Vite)          │
                         │  Exec Dashboard · Daily Briefing ·         │
                         │  Operational Timeline · Command Palette ·  │
                         │  Floating Copilot · Entity Workspace       │
                         └───────────────┬──────────────────────────┘
                                         │  /api/brain/*  (brainApi.js)
                         ┌───────────────▼──────────────────────────┐
                         │              Brain API (Express)          │
                         │  briefing · copilot · recommendations ·   │
                         │  decisions · automations · goals ·        │
                         │  timeline · context · memory · graph      │
                         └───┬───────────┬───────────┬───────────┬───┘
            ┌────────────────┘           │           │           └─────────────┐
   ┌────────▼────────┐  ┌────────────────▼──┐  ┌─────▼─────────┐  ┌────────────▼────────┐
   │ Briefing Engine │  │  Decision Engine  │  │  Automation   │  │  Goal Tracking      │
   │  Copilot Svc    │  │  (structured,     │  │  Engine       │  │  (evaluateGoal:     │
   │  (RAG + graph)  │  │   explainable)    │  │ (governed)    │  │   risk/blockers)    │
   └───────┬─────────┘  └────────┬──────────┘  └──────┬────────┘  └─────────┬───────────┘
           │                     │                    │                     │
   ┌───────▼─────────────────────▼────────────────────▼─────────────────────▼───────────┐
   │   Org Memory (PostgreSQL)   ·   Operational Graph (PostgreSQL)   ·   Connector       │
   │   Decisions/Incidents/...   ·   nodes+edges, workspace-namespaced ·  Execution Engine│
   └────────────────────────────────────────────────────────────────────────────────────┘
                                         │
                         ┌───────────────▼──────────────────────────┐
                         │   Governance Engine · Audit · Timeline ·  │
                         │   Connector Framework (Gmail/GitHub/...)  │
                         └──────────────────────────────────────────┘
```

Everything below the Brain API reuses the pre-existing Connector Framework, Governance Engine, Execution Engine, Universal Search and Recommendation Engine — Phase 7 adds reasoning and orchestration, not new capabilities.

---

## 3. Capability Map

| Capability | Provider(s) | Connector |
|-----------|-------------|-----------|
| Communication | Gmail | `GmailAdapter` |
| Meetings | Google Calendar | `GoogleCalendarAdapter` |
| Engineering | GitHub | `GitHubAdapter` |
| Work Management | Jira | `JiraAdapter` |
| Knowledge | Notion / Confluence / Google Drive | `NotionAdapter`, … |
| Customer Intelligence | HubSpot / Salesforce | `HubSpotAdapter`, … |
| Workforce Intelligence | Workday / BambooHR | `WorkdayAdapter`, … |

The Operational Brain reasons **across** these — correlating, e.g., a customer email → a meeting → a Jira issue → a GitHub PR → a decision → an executive briefing.

---

## 4. Operational Graph

The Operational Graph is a durable, PostgreSQL-backed knowledge graph (`GraphNode` + `GraphEdge`) that replaces the process-scoped in-memory graph for Phase-7 reasoning.

- **Nodes**: `id` (caller-supplied), `type` (USER/PROJECT/CUSTOMER/MEETING/EMAIL/DOCUMENT/PR/ISSUE/…), `name`, `metadata`, `workspaceId`, `orgId`.
- **Edges**: `sourceId` → `targetId`, `relationshipType`, `weight`; unique on `(sourceId, targetId, relationshipType)`.
- **Tenant safety**: every node id is namespaced `${workspaceId}:${rawId}` via `nodeKey()` so two workspaces can never collide on the same raw id. All reads filter by `workspaceId`.
- **Traversal**: `getRelatedContext(workspaceId, entityId, hops)` does a bounded BFS (`take: 500` per hop); `getNeighbors()` returns one-hop neighbours with direction + relation.

The frontend **Cross-Capability Workspace** (`/entity/:entityId` + the global context drawer) renders `getEntityContext()` — neighbours grouped into People/Projects/Customers/Meetings/Emails/Documents/PRs/Issues, plus recent decisions and active recommendations.

---

## 5. AI Reasoning Flow

```
Question / page / entity
        │
        ▼
  Copilot Service ──► retrieveContext() ── pgvector RAG (Router→Critic→Synthesis)
        │             getRelatedContext() ── operational graph expansion
        ▼
  Gemini 2.5 Flash synthesis  ──► answer + evidence[] + confidence + suggestedActions
        │   (local heuristic fallback when GEMINI_API_KEY is absent)
        ▼
  Response cites real operational context across systems
```

The **Briefing Engine** applies the same principle role-by-role: it pulls live incidents, decisions (from durable Org Memory), workspace health, and feedback-weighted recommendations, then renders a role-specific brief (EMPLOYEE / MANAGER / EXECUTIVE) where **every recommendation cites its evidence**. Gemini writes the narrative; a deterministic fallback runs without a key.

---

## 6. Decision Pipeline

Every recommendation can become a first-class, explainable **Decision** (`OrgMemoryRecord` of type `DECISION` with structured `metadata`).

```
Recommendation ──► decisionEngine.fromRecommendation()
                        │
                        ▼
   Decision { title, context, evidence[], riskAssessment, businessImpact,
              suggestedOwner, executionSteps[], confidence,
              requiresHumanApproval (= confidence < 90), rollbackStrategy,
              relatedSystems[], status }
                        │
       PENDING ─► AWAITING_APPROVAL ─► EXECUTING ─► COMPLETED / FAILED / REJECTED
```

`updateDecision()` advances status and records `executionResult` + `lessonLearned`, forming **decision memory** that future reasoning can reference.

API: `GET /api/brain/decisions`, `POST /api/brain/decisions` (raw or `{ recommendation }`), `PATCH /api/brain/decisions/:id`.

---

## 7. Automation Pipeline (Governed, Explainable)

Automation **never bypasses Governance**. Every workflow step routes through `executeAction()`, which enforces the full governance → execution → audit → timeline → memory → broadcast pipeline.

```
EventBus trigger (INCIDENT_CREATED, RISK_DETECTED, INTEL_STORED, MEMORY_ESCALATED)
        │
        ▼
  Rule match (conditions)  ──►  create Decision (explainability captured)
        │
        ▼
  AutomationRun: RUNNING
        │   for each step:
        ▼   executeAction({ workspaceId, connectorId, actionType, payload,
                            actor:{ id:'automation', role:'MEMBER' }, orgPlan })
        │      ├─ ALLOW              → step OK
        │      ├─ REQUIRE_APPROVAL   → step BLOCKED, run BLOCKED_BY_GOVERNANCE (halt)
        │      └─ DENY (403)         → step DENIED, run DENIED_BY_GOVERNANCE  (halt)
        ▼
  AutomationRun: COMPLETED / FAILED / BLOCKED_BY_GOVERNANCE / DENIED_BY_GOVERNANCE
        │   results = { explainability:{ why, triggeredBy, evidence, expectedOutcome,
        │                                risks, rollbackStrategy }, steps:[...] }
        ▼
  Decision updated with executionResult  ·  WS broadcast AUTOMATION_RUN_COMPLETE
```

**Safety invariants** (verified by whole-branch security review):
- Automation runs as a fixed conservative `MEMBER` actor — side-effectful steps always hit governance approval gates; rule authors cannot escalate role.
- Rule create/toggle/delete require **ADMIN or OWNER** (`req.workspaceRole`); `toggleRule` verifies workspace ownership before mutating.
- `CONNECTOR_ACTION_EXECUTED` is **not** a watched trigger (it is emitted *by* execution) — prevents self-triggering loops.

API: `GET/POST /api/brain/automations`, `PATCH /api/brain/automations/:id/toggle`, `DELETE /api/brain/automations/:id`.

---

## 8. Goal Tracking

OKR-style goals (`Goal` + `GoalMilestone`) with continuous evaluation.

`evaluateGoal(workspaceId, goalId)` →
`{ progress, status, risks[], blockers[], predictedCompletion, recommendedInterventions[], milestoneSummary }`
- Progress from completed milestones; risks from overdue milestones / passed target date.
- `predictedCompletion` extrapolated from completion velocity since creation.
- Derived status: COMPLETE / BLOCKED / AT_RISK / ON_TRACK; **CANCELLED is terminal** (never re-derived).

API: `GET/POST /api/brain/goals`, `GET/PATCH/DELETE /api/brain/goals/:id`, `POST /api/brain/goals/:id/milestones`, `PATCH /api/brain/goals/:goalId/milestones/:milestoneId/complete`, `GET /api/brain/goals/:id/evaluate`.

---

## 9. Brain API Specification

All routes are under `/api/brain`, require a JWT, validate the `workspace-id` header (400 if absent), and are workspace-scoped.

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/briefing?role=` | Role-aware briefing (EMPLOYEE/MANAGER/EXECUTIVE) |
| POST | `/copilot` | Context-aware Q&A `{ question, pageContext, entityId }` |
| GET | `/recommendations` | Proactive, feedback-weighted recommendations |
| POST | `/recommendations/execute` | Convert a recommendation → Decision (records feedback) |
| GET/POST | `/decisions` | List / create decisions |
| PATCH | `/decisions/:id` | Update decision status / result |
| GET/POST | `/automations` | List (rules+runs) / create rule (ADMIN+) |
| PATCH | `/automations/:id/toggle` | Enable/disable rule (ADMIN+) |
| DELETE | `/automations/:id` | Delete rule (ADMIN+) |
| GET/POST | `/goals` | List / create goals |
| GET/PATCH/DELETE | `/goals/:id` | Goal detail / update / delete |
| POST | `/goals/:id/milestones` | Add milestone |
| PATCH | `/goals/:goalId/milestones/:milestoneId/complete` | Complete milestone |
| GET | `/goals/:id/evaluate` | Continuous goal evaluation |
| GET | `/timeline?hours=&limit=` | Unified operational timeline |
| GET | `/context/:entityId` | Cross-capability entity context |
| GET | `/memory?hours=` | Org memory records + stats |
| GET | `/graph?entityId=` | Graph stats + neighbours |

Frontend access is centralised in `flow-os-frontend/src/lib/brainApi.js` (reads auth from localStorage, one method per endpoint).

---

## 10. Frontend Experience (Milestone 4)

| Surface | Route / Mount | Backs onto |
|---------|---------------|-----------|
| Floating AI Copilot | Global (LayoutShell) | `/copilot` — page + entity aware |
| Executive Dashboard | `/dashboard` | briefing(EXEC) + recommendations + timeline + goals |
| Daily Briefing | `/briefing` | `/briefing` — role switcher, cited evidence |
| Operational Timeline | `/timeline` | `/timeline` — day-grouped, range + kind filters |
| Universal Command Palette | ⌘K (LayoutShell) | `/api/query` RAG + client nav commands |
| Cross-Capability Workspace | `/entity/:id` + global drawer | `/context/:id` — graph-connected entities |

Cross-cutting: a top-level **ErrorBoundary** keeps the shell alive if a page crashes; global overlays expose `role="dialog"`, aria labels, and Escape-to-close. All data fetches degrade gracefully (loading / error / empty) and never assume a field exists.

---

## 11. Deployment Guide

### Prerequisites
- Node.js 20+, PostgreSQL with the `pgvector` extension, Redis.
- Required env (server exits if missing): `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET` (≥32 chars), `COMPOSIO_API_KEY`, and at least one of `GEMINI_API_KEY` / `OPENAI_API_KEY`. See CLAUDE.md §11 for the full list.

### Apply Phase-7 database migrations
The Phase-7 tables are hand-crafted SQL (the repo carries pre-existing governance drift, so `prisma migrate dev` is intentionally not used):
```bash
psql "$DATABASE_URL" -f prisma/migrations/20260628000000_phase7_brain/migration.sql
psql "$DATABASE_URL" -f prisma/migrations/20260628010000_phase7_brain_extended/migration.sql
npx prisma generate
```
This creates: `org_memory_records`, `graph_nodes`, `graph_edges`, `goals`, `goal_milestones`, `automation_rules`, `automation_runs`, `briefings`, `briefing_recommendations`, `copilot_conversations`, `copilot_messages`. The migrations never touch `workspace_intel_chunks`.

### Run
```bash
npm install
npm run start            # backend + embedded BullMQ workers
cd flow-os-frontend
npm install && npm run build   # production bundle (or: npm run dev)
```

### Verify
```bash
npm run verify           # infrastructure + subsystem health (expect ≥90%)
npx prisma validate
```
The verify suite reports HEALTHY for Postgres, Redis, BullMQ, Parser, Memory, Summary Worker, Search and WebSocket. The Vector Store check depends on a live embeddings quota; a `429 RESOURCE_EXHAUSTED` there is an external rate limit, not a code fault.

---

## 12. Production Readiness Assessment

| Area | Status | Notes |
|------|--------|-------|
| Multi-tenancy | ✅ Strong | Every brain query scopes by `workspaceId`; graph ids namespaced; cross-tenant writes guarded (toggleRule fix). |
| Security / Governance | ✅ Strong | Automation runs as MEMBER; rule mgmt ADMIN+; governance never bypassed; whole-branch security review applied. |
| Error handling | ✅ Good | Typed backend errors via global handler; frontend ErrorBoundary + graceful per-section degradation. |
| Observability | ✅ Good | Audit log, in-memory timeline, WS telemetry, `npm run verify`. |
| Accessibility | 🟡 Improving | Dialog roles, aria labels, Escape-to-close on new overlays; full WCAG audit pending. |
| Responsive design | ✅ Good | Token-based layouts, responsive grids, viewport-capped overlays. |
| Performance | 🟡 Adequate | Lazy-loaded routes; BFS bounded; main JS bundle ~430 kB gzip ~135 kB (code-split further if needed). |
| Logging (PII) | ✅ Strong | Privacy gate intact; no raw payloads logged; ErrorBoundary logs only error message + stack. |

---

## 13. Remaining Technical Debt (Phase 7)

- `decisionEngine.updateDecision` merges arbitrary `metadata` without an allowlist (now client-reachable via `PATCH /decisions/:id`; no execution path keys off it — low risk).
- `automationEngine.conditionsMatch` treats a missing payload key as satisfied (spec design choice).
- `automationEngine` passes `orgPlan: 'free'` for automation steps (fails closed on plan-gated capabilities; resolve real workspace plan later).
- `goalTrackingService.getGoal` returns `null` on not-found (route layer guards with `NotFoundError`).
- Copilot conversations are not yet persisted (`CopilotConversation`/`CopilotMessage` tables exist; wiring deferred).
- `customerRisks` in the executive briefing is a static placeholder until wired to live CRM data.
- Pre-existing platform-wide debt (TD-01…TD-13 in CLAUDE.md §9) is unchanged; notably CORS `origin: '*'` (TD-04) must be scoped before public deployment — intentionally left for explicit confirmation.
