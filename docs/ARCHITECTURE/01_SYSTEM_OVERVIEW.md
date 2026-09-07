# FLOW OS — System Overview
**Architecture Version:** 1.0  
**Status:** FROZEN  
**Date:** 2026-07-21

---

## 1. System Vision

FLOW OS is a **multi-tenant enterprise intelligence operating system**. It continuously ingests communication streams from corporate platforms, classifies every message through a privacy gate, vectorizes operational intelligence into a pgvector store, and answers enterprise queries through a multi-agent reasoning pipeline. A React dashboard consumes live telemetry over WebSocket.

FLOW is designed around a single governing insight: **executives, managers, and engineers spend more time finding context than doing work.** FLOW eliminates that friction by maintaining a living, automatically updated model of the company — and making it instantly queryable.

### Design Philosophy

- **The LLM is not the brain. FLOW is.** Every AI call is preceded by comprehensive data retrieval from internal systems. The LLM only synthesizes; it does not know the company.
- **Every action is governed.** No connector executes without passing through the Policy Engine, Approval Engine, and Audit Trail.
- **Data never crosses tenant boundaries.** Workspace isolation is enforced at the middleware layer before any handler runs.
- **The system must work without AI keys.** Every LLM call has a deterministic fallback so FLOW boots and operates even without `GEMINI_API_KEY`.
- **Privacy is a hard gate, not a soft filter.** High-privacy-score content is silently discarded before vectorization. It never reaches the knowledge store.

---

## 2. Core Principles

| Principle | Implementation |
|-----------|---------------|
| **Tenant Isolation** | `workspace-id` header validated by DB query in `tenantIsolation` middleware before any route handler runs |
| **Governance First** | All connector actions pass through `permissionEvaluator` → `approvalEngine` → `executeAction` |
| **Privacy by Default** | Privacy gate (Stage 3 of ingestion) discards high-PII content before any storage |
| **Provider Agnosticism** | All LLM calls route through `src/ai/AIPlatform.js`; no service imports `@google/genai`, `openai`, or `@anthropic-ai` |
| **Graceful Degradation** | Every LLM call, Redis operation, and connector action has a fallback path |
| **Audit Everything** | Every connector action writes to `audit_logs` (PostgreSQL, durable) |
| **No Silent Failures** | Observability layer traces every AI request through all 9 platform layers |

---

## 3. Platform Architecture — 10 Major Layers

```
┌─────────────────────────────────────────────────────────────────┐
│                        React Frontend                           │
│           (Vite · React 18 · React Router v6 · Design Tokens)  │
└──────────────────────────┬──────────────────────────────────────┘
                           │ HTTPS / WebSocket
┌──────────────────────────▼──────────────────────────────────────┐
│                     Express API Server                          │
│       cors · compression · rateLimiter · authenticate           │
│       tenantIsolation · governanceMiddleware · requestLogger    │
└────┬──────────┬──────────┬──────────┬──────────┬───────────────┘
     │          │          │          │          │
┌────▼───┐ ┌───▼───┐ ┌────▼────┐ ┌───▼────┐ ┌──▼──────────────┐
│  Auth  │ │ Brain │ │Connector│ │ Trust  │ │   AI Platform   │
│ Module │ │ Layer │ │Platform │ │ Center │ │  (9 Layers)     │
└────────┘ └───────┘ └────────┘ └────────┘ └─────────────────┘
                           │
     ┌─────────────────────┼──────────────────────┐
     │                     │                      │
┌────▼─────┐    ┌──────────▼──────┐    ┌─────────▼──────┐
│Execution │    │  Event Platform │    │  Graph Engine  │
│ Engine   │    │  (Unified Bus)  │    │ (Digital Twin) │
└────┬─────┘    └──────────┬──────┘    └─────────┬──────┘
     │                     │                      │
┌────▼─────────────────────▼──────────────────────▼──────┐
│              Persistence Layer                          │
│  PostgreSQL (Prisma + pg.Pool)  ·  Redis  ·  pgvector  │
└─────────────────────────────────────────────────────────┘
     │
┌────▼───────────────────────────────┐
│         BullMQ Workers             │
│  ingestion · summary · sync        │
│  webhook · event-retention         │
│  prediction · workflow             │
└────────────────────────────────────┘
```

---

## 4. Major Platform Layers

### 4.1 Frontend (`flow-os-frontend/`)
React 18 + Vite + React Router v6 + Tailwind CSS. All routes are lazy-loaded. Design tokens live in `src/styles/tokens.css` — no raw hex values in components. Connects to backend via Vite proxy (`:3000` → `:5001`) and direct WebSocket to `ws://localhost:5001`.

### 4.2 API Server (`src/server.js`)
Express 5.x. Middleware stack (in order): CORS → compression → security headers → request ID → rate limiter → request logger → auth (JWT) → tenant isolation → governance context → route handlers → error handler. Graceful shutdown on SIGTERM/SIGINT with 15-second hard timeout.

### 4.3 Authentication & Identity
JWT-based (`jsonwebtoken`). Tokens carry `{ sub, orgId, role }`. `authenticate` middleware verifies signature and attaches `req.user`. Passwords hashed with `bcryptjs`. API keys stored in `api_keys` table.

### 4.4 Tenant Isolation
`tenantIsolation` middleware validates that the `workspace-id` header belongs to `req.user.orgId` via a Prisma DB query. Cross-org workspace access returns 403 before any route handler runs. `req.workspace` and `req.workspaceRole` are attached for downstream use.

### 4.5 Governance & Policy Engine (`src/core/governance/`)
Database-configurable policies with ALLOW / DENY / REQUIRE_APPROVAL effects. `evaluateWithPolicies()` is the single authority for all permission decisions. Supports workspace-scoped policies, role constraints, plan-tier gates, and approval chains. All decisions are persisted to the audit log.

### 4.6 Connector Platform (`src/connectors/`)
Universal Connector Framework with BaseAdapter interface, AuthManager (OAuth2 / API key / service account / webhook), ExecutionEngine (governance → execution → audit → timeline → WebSocket), and SearchOrchestrator (fan-out search across all adapters). Adding a new integration requires only a new adapter file.

### 4.7 AI Platform (`src/ai/`)
9-layer platform — see `07_AI_PLATFORM.md`. Single entry point `AIPlatform.request()`. No module outside `src/ai/` may reference an AI provider SDK.

### 4.8 Unified Event Platform (`src/events/`)
Single canonical event bus. Every activity from every connector becomes one normalized FLOW Event. Consumers subscribe independently. Durable storage in `flow_events` (PostgreSQL). Powers the Knowledge Graph, Memory, Feed, Timeline, Notifications, and Brain.

### 4.9 Knowledge Graph — Digital Twin (`src/graph/`)
21 node types, 19 edge types. Populated in real time by a single `graph` subscriber on the Event Platform. Bounded iterative BFS traversal (not recursive CTE). Single writer; all graph code references `graph_nodes` / `graph_edges`.

### 4.10 Workflow Runtime (`src/runtime/`)
BullMQ-backed workflow engine. Workflows are defined in a JSON DSL and executed by the Runtime via the Action Registry. Every workflow step goes through `executeAction()` — governance is never bypassed.

---

## 5. High-Level Request Lifecycle

### 5.1 User Question (Copilot)
```
User → POST /api/brain/copilot
  → authenticate (JWT verify)
  → tenantIsolation (workspace ownership DB check)
  → governanceMiddleware (workspace role)
  → copilotService.answerCopilotQuery()
      → ContextAssembler (RAG + KG + health)
      → PromptBuilder (structured prompt with evidence)
      → AIPlatform.request()
          → Guardrails (PII, injection)
          → RateLimiter
          → Memory (load conversation history)
          → BrainRouter (provider selection + fallback)
          → Provider (Ollama / Gemini / OpenAI / Anthropic)
          → Guardrails (output validation)
          → Memory (store turn)
          → Tracer (complete trace)
      → Response formatter
  → WebSocket broadcast EXECUTIVE_SYNTHESIS_READY
  → JSON response
```

### 5.2 Connector Action
```
User → POST /api/connectors/execute
  → authenticate + tenantIsolation
  → evaluateWithPolicies() (ALLOW / DENY / REQUIRE_APPROVAL)
  → If REQUIRE_APPROVAL: create PendingApproval, return 403
  → If ALLOW: executeAction()
      → Connector adapter method
      → persistConnectorAudit() → audit_logs
      → publish() → Event Platform → KG + Memory + Feed
      → WebSocket broadcast ACTION_EXECUTED
  → JSON response
```

### 5.3 Data Ingestion
```
Message → POST /api/webhook/ingest (or BullMQ job)
  → ingestionQueue.add()
  → ingestionWorker.process()
      Stage 1: Parser (normalize, strip injection)
      Stage 2: Importance Scorer (8 dimensions)
      Stage 3: Privacy Gate (discard if score > 0.85)
      Stage 4: Incident Engine (keyword detection)
      Stage 5: Decision Engine (extract decisions)
      Stage 6: Memory Brain (retention policy)
      Stage 7: Entity Extractor
      Stage 8: KG Sync
      Stage 9: Cognitive Brain (classify → OPERATIONAL_INTEL / SOCIAL / PRIVATE)
                → If OPERATIONAL: vectorize → pgvector, vault file
                → If SOCIAL: Redis cache (3600s TTL)
                → If PRIVATE: hard drop
  → WebSocket broadcast per stage
```

---

## 6. Deployment Model

```
┌──────────────────────────────────────────┐
│              Docker Compose              │
│                                          │
│  app (node:20-slim, non-root)            │
│    → PORT 5001 (HTTP + WebSocket)        │
│    → /health/live, /health/ready         │
│                                          │
│  postgres (pgvector/pgvector:pg16)       │
│    → Port 5432                           │
│    → POSTGRES_DB=flowos                  │
│                                          │
│  redis (redis:7-alpine)                  │
│    → Port 6379                           │
│    → appendonly yes (AOF)                │
└──────────────────────────────────────────┘
```

Production requirements: `NODE_ENV=production`, `WS_AUTH_REQUIRED=true`, scoped `CORS_ORIGIN`, gateway rate limiting, pg_dump + PITR, Redis AOF + backup schedule, structured logging (`LOG_FORMAT=json`), metrics shipping from `/api/metrics`.

---

## 7. Technology Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js 20+ (ESM modules, `"type": "module"`) |
| API server | Express 5.x |
| Queue | BullMQ 5.x on Redis (ioredis) |
| Primary DB | PostgreSQL 16 with pgvector extension |
| ORM | Prisma 7.x (identity/org/governance/intelligence tables) |
| Raw DB client | `pg.Pool` (vector store, intel chunks, raw SQL) |
| AI primary | Google Gemini 2.5 Flash + gemini-embedding-2 (768-dim) |
| AI secondary | Anthropic Claude Sonnet/Opus, OpenAI GPT-4o, Ollama (local) |
| Auth | JWT (`jsonwebtoken`) + `bcryptjs` |
| WebSocket | `ws` library (workspace-isolated channels) |
| Frontend | React 18, Vite, React Router v6 |
| Styling | Tailwind CSS + CSS design tokens |
| Caching | Redis (response cache, conversation memory, rate limiting) |
| Workers | BullMQ (ingestion, summary, sync, webhook, events, predictions) |
