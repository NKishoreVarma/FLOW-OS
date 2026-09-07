# FLOW OS — Version 1.0 Architecture Freeze
**Date:** 2026-07-21  
**Status:** FROZEN  
**Author:** Lead Engineering Team

---

## Official Declaration

FLOW OS version 1.0 is hereby declared **complete and architecturally frozen**.

This document is the canonical engineering reference for FLOW OS v1.0. It defines the frozen subsystems, the rules for future development, and the formal change management process for any architectural modifications.

---

## 1. What is Frozen

The following subsystems are complete in v1.0. Their interfaces, database schemas, and architectural roles are frozen. Changes require a formal Architecture Decision Record (ADR).

### Core Platform

| Subsystem | Location | Freeze Date | Validation |
|-----------|----------|-------------|-----------|
| Authentication & Identity | `src/modules/auth/` | 2026-06-15 | JWT flow, bcrypt, workspace membership |
| Tenant Isolation | `src/core/middleware/tenantIsolation.js` | 2026-06-20 | Cross-org 403 enforced |
| Governance & Policy Engine | `src/core/governance/` | 2026-06-25 | evaluateWithPolicies, ALLOW/DENY/REQUIRE_APPROVAL |
| Approval Lifecycle | `src/core/governance/approvalStore.js` | 2026-06-25 | PENDING→APPROVED→EXECUTED/REJECTED/EXPIRED |

### Connector Platform

| Subsystem | Location | Freeze Date | Validation |
|-----------|----------|-------------|-----------|
| Universal Connector Framework | `src/connectors/` | 2026-06-28 | BaseAdapter, AuthManager, ExecutionEngine, SearchOrchestrator |
| GmailAdapter | `src/connectors/adapters/GmailAdapter.js` | 2026-06-28 | Full Gmail capability |
| GoogleCalendarAdapter | `src/connectors/adapters/GoogleCalendarAdapter.js` | 2026-06-28 | Full Calendar capability |
| GitHubAdapter | `src/connectors/adapters/GitHubAdapter.js` | 2026-06-29 | Full GitHub capability |
| Integration Permissions | `src/core/governance/integrationPermissions/` | 2026-07-06 | Deny-by-default, 40/40 validation |

### AI Platform

| Subsystem | Location | Freeze Date | Validation |
|-----------|----------|-------------|-----------|
| AI Platform (9 layers) | `src/ai/` | 2026-07-18 | 93/93 validation, zero provider leakage |
| Provider Isolation Invariant | `src/ai/` | 2026-07-18 | `scripts/validate-ai-platform.js` |
| Guardrails | `src/ai/guardrails/` | 2026-07-18 | PII, injection, output validation |
| Tool Platform | `src/ai/tools/` | 2026-07-18 | 9 tools, governance routing |
| Request Tracer | `src/ai/observability/` | 2026-07-18 | End-to-end trace with async persist |

### Intelligence Platform

| Subsystem | Location | Freeze Date | Validation |
|-----------|----------|-------------|-----------|
| Unified Event Platform | `src/events/` | 2026-07-07 | 14/14 at 100k events |
| Knowledge Graph — Digital Twin | `src/graph/` | 2026-07-08 | 16/16, demo twin 4420n/26636e |
| Explainability Engine (XAI) | `src/explainability/` | 2026-07-08 | 16/16 across 8 domains |
| Workspace Replay Engine (DVR) | `src/replay/` | 2026-07-09 | 12/12 at 100k events |
| What-If Simulation Engine | `src/simulation/` | 2026-07-09 | 14/14, 7 scenario types |
| Predictive Workspace Intelligence | `src/predictions/` | 2026-07-09 | 20/20, ~50ms |

### Execution & Operations

| Subsystem | Location | Freeze Date | Validation |
|-----------|----------|-------------|-----------|
| Operational Execution Engine | `src/execution/` | 2026-07-14 | 26/26 |
| Collaboration Engine | `src/collaboration/` | 2026-07-14 | 23/23 |
| Notification Engine | `src/notifications/` | 2026-07-14 | 19/19 |

### Experience Platform

| Subsystem | Location | Freeze Date | Validation |
|-----------|----------|-------------|-----------|
| Multi-Agent Executive Council | `src/council/` | 2026-07-14 | 23/23 |
| Workspace Intelligence Cache | `src/workspaceCache/` | 2026-07-15 | 14/14 |
| Living Workspace Simulator | `src/simulator/` | 2026-07-15 | 18/18 |
| Onboarding Platform | `src/onboarding/` | 2026-07-16 | 28/28 |
| Success & ROI Platform | `src/success/` | 2026-07-16 | Hybrid measured/estimated |
| Autonomous Operations | `src/autonomous/` | 2026-07-17 | 50/50 |
| Workspace Lifecycle Engine | `src/core/workspaceLifecycle/` | 2026-06-29 | 7 routes, 5 operations |

### Production Readiness

| Subsystem | Freeze Date | Validation |
|-----------|-------------|-----------|
| Docker + Docker Compose | 2026-07-11 | Multi-stage, non-root, health checks |
| Graceful Shutdown | 2026-07-11 | SIGTERM drain + 15s hard timeout |
| Security Hardening (12.0) | 2026-07-11 | 25-domain audit, WS auth fixed |
| Observability Platform | 2026-07-11 | `/api/metrics`, structured logging, redaction |

---

## 2. Frozen Architectural Invariants

The following rules must not be violated in any future version without a formal ADR and lead engineering sign-off.

### INV-001: Provider Isolation
**Rule:** No file outside `src/ai/` may import `@google/genai`, `openai`, `@anthropic-ai/sdk`, or any other LLM provider SDK.  
**Verification:** `scripts/validate-ai-platform.js` (assertion 90–93).  
**Consequence of violation:** A rogue provider call bypasses guardrails, rate limiting, observability, fallbacks, and the permanent audit trail.

### INV-002: Governance Never Bypassed
**Rule:** All connector actions, AI tool executions, and automation steps must call `executeAction()`. No adapter method is called directly from application code.  
**Consequence of violation:** Unaudited actions, policy evasion, broken approval flows.

### INV-003: Tenant Isolation Before Any Data Access
**Rule:** `tenantIsolation` middleware must run before any route handler that reads or writes workspace data. The `workspace-id` header must be validated against the database.  
**Consequence of violation:** Cross-tenant data leakage.

### INV-004: Privacy Gate is a Hard Drop
**Rule:** When `privacy_score > 0.85`, the ingestion pipeline terminates. The text is set to `null` and is never stored, logged, vectorized, or analyzed.  
**Consequence of violation:** Personal private communications appear in query results.

### INV-005: Single Graph Writer
**Rule:** Only the Event Platform `graph` subscriber calls `GraphEngine.applyEvent`. No other code writes to `graph_nodes` or `graph_edges`.  
**Consequence of violation:** Duplicate edges, race conditions, inconsistent `observation_count`.

### INV-006: Graph Subscriber Must Not Publish Events
**Rule:** The graph subscriber reads the event bus but never publishes to it.  
**Consequence of violation:** Feedback loop → infinite graph churn.

### INV-007: Brain Subscriber Loop Prevention
**Rule:** The brain builtin subscriber must not re-enqueue events with `metadata.origin === 'ingestion'` or `metadata.replayed === true`.  
**Consequence of violation:** Every ingestion event triggers a Brain call → BullMQ overflow.

### INV-008: Automation Actor Role is Fixed MEMBER
**Rule:** Automation rules always run with `MEMBER` role. The role cannot be read from rule data.  
**Consequence of violation:** Automation privilege escalation bypasses ADMIN/OWNER approval requirements.

### INV-009: CONNECTOR_ACTION_EXECUTED Not an Automation Trigger
**Rule:** `CONNECTOR_ACTION_EXECUTED` must never be registered as an automation trigger event.  
**Consequence of violation:** Automation run → action executed → event → automation triggered → infinite loop.

### INV-010: Workspace Intelligence Cache Never Calls Brain
**Rule:** `SnapshotBuilder` may only call: Prediction Engine, Health Score, Graph metrics, PostgreSQL aggregate counts. It may not call `copilotService`, `briefingEngine`, or the Executive Council.  
**Consequence of violation:** Cache rebuild triggers AI rate limits every time an event is published.

---

## 3. Rules for Future Development

### New Features

1. **Present a plan and wait for sign-off before implementing.** (Engineering Rule 10 from CLAUDE.md)
2. New features that add a new architectural layer require an ADR.
3. New features that reuse existing layers do not require an ADR (but must respect all invariants).
4. No new LLM provider SDK may be used without an ADR and provider registration in `AIProviderFactory.js`.

### Adding New Connectors
- Create a new adapter in `src/connectors/adapters/`
- Register in `src/connectors/adapters/index.js`
- All state-changing actions must use `executeAction()`
- Add resource types to Integration Permissions if the connector is governed
- No changes to BaseAdapter, ExecutionEngine, or SearchOrchestrator are required

### Adding New Intelligence Modules
- Register as a subscriber on the Event Platform via `subscribe(name, filter, handler)`
- Do not read from connector APIs directly — consume FLOW Events
- Intelligence modules are read-only consumers; they must not publish connector actions

### Adding New AI Providers
- Implement `{ name, chat, embed, stream, health }` in `src/ai/providers/`
- Register in `AIProviderFactory.js`
- Add to fallback chain in `routingStrategy.js`
- No changes to `AIPlatform.js` or downstream services required

### Database Schema Changes
- Prisma-managed tables: `npx prisma migrate dev` (dev) / `npx prisma migrate deploy` (prod)
- Phase 7+ tables (hand-crafted SQL): apply with `psql -f`, then `npx prisma generate` only
- Never drop `workspace_intel_chunks` without explicit lead engineering approval
- pgvector column additions require raw SQL (`ALTER TABLE ... ADD COLUMN ... vector(768)`)

### Frontend Changes
- All new components use design tokens (`var(--brand)`, `var(--ok)`, etc.) — no raw hex values
- All routes are lazy-loaded
- Component files are `.jsx` — do not add `.tsx` files

---

## 4. Validation State at v1.0 Freeze

### In-Process Validation Scripts
All scripts in `scripts/validate-*.js` are runnable without a live server.

| Script | Assertions | Status |
|--------|-----------|--------|
| `validate-ai-platform.js` | 93 | ✅ 93/93 |
| `validate-event-platform.js` | 13 | ✅ 13/13 |
| `validate-graph-engine.js` | 16 | ✅ 16/16 |
| `validate-demo-twin.js` | 13 | ✅ 13/13 |
| `validate-explainability.js` | 16 | ✅ 16/16 |
| `validate-replay-engine.js` | 12 | ✅ 12/12 |
| `validate-simulation-engine.js` | 14 | ✅ 14/14 |
| `validate-prediction-engine.js` | 20 | ✅ 20/20 |
| `validate-workspace-cache.js` | 14 | ✅ 14/14 |
| `validate-simulator.js` | 18 | ✅ 18/18 |
| `validate-pilot-experience.js` | 28 | ✅ 28/28 |
| `validate-execution-engine.js` | 26 | ✅ 26/26 |
| `validate-collaboration.js` | 23 | ✅ 23/23 |
| `validate-notification-engine.js` | 19 | ✅ 19/19 |
| `validate-executive-council.js` | 23 | ✅ 23/23 |
| `validate-integration-permissions.js` | 40 | ✅ 40/40 |
| `validate-phase19.js` | 50 | ✅ 50/50 |

### Integration Test Suite
Requires live server (`PORT=5001 node src/server.js`):

| Suite | Status | Notes |
|-------|--------|-------|
| Integration tests (`tests/integration/`) | 66/74 | 8 pre-existing failures: `signup` expects `fullName` vs `name`; `lifecycle-schema` expects old fields — unrelated to v1.0 features |

### Frontend Build
- `npm run build` (flow-os-frontend): **clean** (2,413+ modules, no TypeScript errors)

---

## 5. Architecture Handbook Index

| Document | Contents |
|----------|---------|
| `01_SYSTEM_OVERVIEW.md` | Vision, principles, 10 platform layers, request lifecycle, deployment, stack |
| `02_COMPONENT_CATALOG.md` | Every subsystem: location, purpose, API, dependencies, invariants |
| `03_DATA_FLOW.md` | Complete data flows: ingestion, RAG, connector action, copilot, event platform, WIC, approval, briefing |
| `04_SEQUENCE_DIAGRAMS.md` | 8 Mermaid sequence diagrams: AI request, connector action, ingestion, briefing, council, onboarding, simulation, permission gate |
| `05_DATABASE_MAP.md` | Every table: owner, columns, indexes, lifecycle, migration ownership |
| `06_API_REFERENCE.md` | Every REST endpoint: method, path, auth, description |
| `07_AI_PLATFORM.md` | 9-layer AI Platform: each layer, provider config, tool registry, observability, isolation invariant |
| `08_SECURITY_MODEL.md` | Authentication, RBAC, tenant isolation, policy engine, approvals, PII, injection, audit, secrets, network |
| `09_DEPLOYMENT_GUIDE.md` | Local dev, Docker, production checklist, graceful shutdown, scaling, backups, RPO/RTO |
| `10_ARCHITECTURE_DECISIONS.md` | 14 ADRs: ESM, dual DB, event bus, single graph writer, BFS, provider isolation, governance, privacy gate, fallback, WS roles, onboarding state, morning briefing cache, deny-by-default, WIC-not-brain |
| `11_LIMITATIONS.md` | Known tech debt (TD-01 to TD-OG-01), performance limits, scalability constraints, feature gaps, security gaps, dependency risks |
| `12_VERSION_1.0_FREEZE.md` | This document |

---

## 6. Chronological Build Log

| Phase | What Was Built | Date |
|-------|---------------|------|
| Phase 1–4 | Auth, multi-tenant isolation, RAG pipeline, privacy gate, WebSocket | 2026-06 |
| Phase 5.2–5.3 | Universal Connector Framework, Governance, Policy Engine, Approval lifecycle | 2026-06-25 |
| Phase 5.4–5.6 | Gmail, Calendar, GitHub adapters | 2026-06-28 |
| Phase 6.0, 7.0 | Workforce Intelligence, Operational Brain (briefing, copilot, decisions, goals, automation) | 2026-06-28 |
| Phase 10.0, 11.0 | Workspace Lifecycle Engine, Unified Event Platform | 2026-07-06 |
| Phase 11.1–11.5 | Graph/Digital Twin, XAI, Replay DVR, Simulation, Predictions | 2026-07-09 |
| Phase 12 | Production Hardening (Docker, security audit, observability, performance) | 2026-07-11 |
| Phase 13.1 | Integration Permissions (deny-by-default gate) | 2026-07-06 |
| Phase 14 | Operational Execution Engine (risk tiers, approvals, notifications, merge conflicts) | 2026-07-14 |
| Phase 15 | Multi-Agent Executive Council | 2026-07-14 |
| Phase 16.1 | Workspace Intelligence Cache | 2026-07-15 |
| Sprint 5 | Living Workspace Simulator | 2026-07-15 |
| Phase 17 | Pilot Experience Platform (onboarding, success metrics, team invite) | 2026-07-16 |
| Phase 19 | Autonomous Operations (Chief of Staff, Weekly Review, Action Cards) | 2026-07-17 |
| AI Platform | 9-layer AI platform, Model Orchestrator, provider isolation, guardrails, tools | 2026-07-18 |
| Architecture Docs | This handbook | 2026-07-21 |

---

*FLOW OS v1.0 is declared architecturally frozen on 2026-07-21. All future architectural changes require a formal ADR.*
