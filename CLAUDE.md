# CLAUDE.md — FLOW OS

> Lead Engineer reference document. Read this before touching any code.

---

## 1. Project Overview

FLOW OS is a **multi-tenant enterprise intelligence operating system**. It continuously ingests communication streams from corporate platforms (Slack, Gmail, GitHub, Jira, Calendar), classifies every message through a privacy gate, vectorizes operational intelligence into a pgvector store, and answers enterprise queries through a three-stage multi-agent RAG pipeline. A React dashboard consumes live telemetry over WebSocket.

**Stack at a glance**

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js 20+ (ESM modules, `"type": "module"`) |
| API server | Express 5.x |
| Queue | BullMQ 5.x on Redis (ioredis) |
| Primary DB | PostgreSQL with pgvector extension |
| ORM | Prisma 7.x (identity/org tables only) |
| Raw DB client | `pg.Pool` (vector store, intel chunks) |
| AI provider | Google Gemini API (`@google/genai`) — gemini-2.5-flash + gemini-embedding-2 |
| Auth | JWT (jsonwebtoken) + bcryptjs |
| WebSocket | `ws` library (workspace-isolated channels) |
| Integrations | Composio (OAuth proxy to Gmail, Slack, etc.) |
| Frontend | React 18, Vite, React Router v6, Tailwind CSS |

---

## 2. Folder Structure

```
flow-os-backend/
├── src/
│   ├── server.js                  # Entry point — mounts all routes and starts WS
│   ├── config/
│   │   ├── db.js                  # pg.Pool (raw SQL for intel chunks)
│   │   ├── queue.js               # BullMQ ingestion-queue
│   │   └── redis.js               # Shared ioredis connection
│   ├── core/
│   │   ├── config/prisma.js       # Prisma client singleton
│   │   ├── errors/index.js        # AppError, ValidationError, AuthenticationError
│   │   ├── events/eventBus.js     # In-process Node EventEmitter
│   │   ├── governance/            # Enterprise Governance Layer (Phase 5.3)
│   │   │   ├── constants.js       # Effect enum, role-action matrix, plan-tier gates
│   │   │   ├── permissionEvaluator.js # evaluateWithPolicies() (DB-first) + evaluate() (fallback)
│   │   │   ├── policyStore.js     # Policy CRUD + 60s in-memory cache
│   │   │   ├── approvalStore.js   # PendingApproval CRUD + lifecycle transitions
│   │   │   ├── eventSubscribers.js # eventBus subscribers (analytics, notifications)
│   │   │   ├── governanceMiddleware.js # Attaches req.govContext (workspaceRole, plan)
│   │   │   ├── auditPersistence.js    # Writes connector audit rows to PostgreSQL AuditLog
│   │   │   └── index.js           # Barrel export
│   │   └── middleware/
│   │       ├── authenticate.js    # JWT verify + signToken
│   │       ├── authorize.js       # RBAC role guard (legacy — governance replaces this for connectors)
│   │       ├── rateLimiter.js     # In-memory sliding window
│   │       └── tenantIsolation.js # Validates workspace ownership via DB; sets req.tenantId + req.workspace
│   ├── connectors/                # Universal Connector Framework (Phase 5.2)
│   │   ├── capabilities.js        # Capability, ActionType, AuthStrategy enums
│   │   ├── normalizedTypes.js     # FLOW-native object factories (no provider fields)
│   │   ├── BaseAdapter.js         # Abstract adapter interface (all connectors extend this)
│   │   ├── authManager.js         # Credential store (OAuth2, API key, service account)
│   │   ├── registry.js            # ConnectorRegistry (register, resolve, health)
│   │   ├── executionEngine.js     # Action pipeline + audit log + timeline + WS broadcast
│   │   ├── searchOrchestrator.js  # Universal search fan-out across all adapters
65: │   │   ├── adapters/
66: │   │   │   ├── index.js                  # Side-effect registration of all adapters at startup
67: │   │   │   ├── GmailAdapter.js           # Communication Capability — Gmail provider (Phase 5.4)
68: │   │   │   ├── GoogleCalendarAdapter.js  # Meeting Capability — Google Calendar provider (Phase 5.5)
69: │   │   │   ├── GitHubAdapter.js          # Engineering Capability — GitHub provider (Phase 5.6)
70: │   │   │   ├── JiraAdapter.js            # Work Management Capability — Jira provider (Phase 5.7)
71: │   │   │   ├── NotionAdapter.js          # Knowledge Capability — Notion provider (Phase 5.8)
72: │   │   │   ├── ConfluenceAdapter.js      # Knowledge Capability — Confluence skeleton (Phase 5.8)
73: │   │   │   ├── GoogleDriveAdapter.js     # Knowledge Capability — Google Drive skeleton (Phase 5.8)
74: │   │   │   ├── HubSpotAdapter.js         # Customer Intelligence Capability — HubSpot provider (Phase 5.9)
75: │   │   │   ├── SalesforceAdapter.js      # Customer Intelligence Capability — Salesforce skeleton (Phase 5.9)
76: │   │   │   ├── WorkdayAdapter.js         # Workforce Intelligence Capability — Workday provider (Phase 6.0)
77: │   │   │   └── BambooHRAdapter.js        # Workforce Intelligence Capability — BambooHR skeleton (Phase 6.0)
78: │   │   └── index.js               # Public API barrel export
79: │   ├── modules/                   # Phase-1 modular architecture
80: │   │   ├── auth/                  # signup + login (Prisma-backed)
81: │   │   ├── organizations/         # Org CRUD
82: │   │   └── users/                 # User CRUD
83: │   ├── routes/                    # Legacy routes (Phase-2 migration target)
84: │   │   ├── queryRoutes.js         # POST /api/query — full RAG pipeline
85: │   │   ├── intelligenceRoutes.js  # GET health-score, briefing/:role, explainable-recommendations, POST qa, copilot (Phase 7.0/8.0)
86: │   │   ├── integrationRoutes.js   # Composio OAuth connect/callback
87: │   │   ├── crawlerRoutes.js       # SSRF-safe URL fetch
88: │   │   ├── simulationRoutes.js    # End-to-end test simulation
89: │   │   ├── importRoutes.js        # POST /api/import — Universal Company Import Engine (Phase 10.0)
90: │   │   ├── evaluationRoutes.js    # GET /api/evaluation — AI Evaluation & Explainability (Phase 12.0)
91: │   │   ├── communicationRoutes.js # Communication Capability REST API (Phase 5.4)
90: │   │   ├── meetingRoutes.js       # Meeting Capability REST API (Phase 5.5)
91: │   │   ├── engineeringRoutes.js   # Engineering Capability REST API (Phase 5.6)
92: │   │   ├── workRoutes.js          # Work Management Capability REST API (Phase 5.7)
93: │   │   ├── knowledgeRoutes.js     # Knowledge Capability REST API (Phase 5.8)
94: │   │   ├── crmRoutes.js           # Customer Intelligence Capability REST API (Phase 5.9)
95: │   │   ├── hrRoutes.js            # Workforce Intelligence Capability REST API (Phase 6.0)
96: │   │   └── devDashboard.js        # Engineering cockpit UI (OWNER/ADMIN auth, blocked in prod)
│   ├── services/
│   │   ├── cognitiveBrainService.js    # Privacy gate + routing engine
│   │   ├── vectorStoreService.js       # In-memory vector DB + Synapse Engine
│   │   ├── retrievalService.js         # pgvector + vault fallback + RRF merge
│   │   ├── memoryBrain.js              # Retention policy engine
│   │   ├── operationalScoringService.js # 8-dimension scoring (privacy, authority...)
│   │   ├── operationalIntelligenceService.js # Predictions, stories, recommendations learning loop (Phase 6.2)
│   │   ├── operationalBrainService.js  # Role briefing, copilot, and explainable recommendations (Phase 7.0)
│   │   ├── importEngineService.js      # Ingest, validate, and bootstrap corporate twins (Phase 10.0)
│   │   ├── aiEvaluationService.js      # AI explainability, feedback outcomes, and learning loops (Phase 12.0)
│   │   ├── incidentEngine.js           # Keyword-based incident detection
│   │   ├── decisionMemoryService.js    # Decision extraction
│   │   ├── knowledgeGraphService.js    # In-memory adjacency graph
│   │   ├── socketService.js            # WebSocket server + workspace broadcast
│   │   ├── observabilityService.js     # Traces, metrics, health reporting
│   │   ├── vaultService.js             # Markdown file writer → FLOW-OS-VAULTS
│   │   ├── summaryService.js           # Rolling executive summary (LLM + fallback)
│   │   ├── parserService.js            # Text normalizer, chunker, injection stripper
│   │   ├── crawlerService.js           # SSRF-safe HTTP fetcher + HTML cleaner
│   │   ├── actionOrchestrator.js       # WebSocket event → automated action rules
│   │   ├── dailyIntelligenceService.js # Daily feed generator
│   │   ├── healthScoreService.js       # Workspace health score aggregator
│   │   ├── integrationService.js       # Composio OAuth flow
│   │   ├── calendarIntegration.js      # Google Calendar sync
│   │   ├── gmailInboundService.js      # Gmail watch handler
│   │   └── agents/
│   │       ├── RouterAgent.js           # Domain classifier + intent flags
│   │       ├── CriticAgent.js           # Contradiction detection + deprecation
│   │       └── ExecutiveSynthesisAgent.js # Gemini LLM → executive brief
│   ├── workers/
│   │   ├── ingestionWorker.js     # BullMQ consumer — runs the 9-stage pipeline
│   │   └── summaryWorker.js       # BullMQ consumer — daily rolling summaries
│   ├── observability/
│   │   └── tokenCounter.js        # Token estimation + Gemini cost calculator
│   ├── prompts/index.js           # Centralized LLM prompt templates
│   ├── evaluation/ragEval.js      # RAG quality evaluation harness
│   └── utils/
│       ├── envValidation.js       # Startup env guard (exits on missing keys)
│       ├── logger.js              # Colored console logger (rag, vector, security, queue...)
│       └── llm/
│           ├── embeddingHelpers.js
│           ├── jsonParser.js
│           ├── memoryHelpers.js
│           └── schemaEnforcer.js
├── prisma/schema.prisma           # Prisma schema (Org, Workspace, User, ApiKey, Integration, Agent, AuditLog)
├── flow-os-frontend/              # React app (see §7)
├── scripts/                       # Dev scripts: verify, validate, trace, metrics, brain, replay
├── tests/                         # Test directory (currently empty)
├── docs/API_REFERENCE.md
├── .env                           # NOT committed — see .env.example
└── package.json
```

---

## 3. Coding Conventions

- **ESM only** — all files use `import`/`export`. No `require()`.
- **Async/await** everywhere. Never callbacks in new code.
- **No default exports from service files** unless the module has a single responsibility. Named exports are preferred.
- **Service files are pure functions or function collections** — no class instances.
- **Error handling**: throw typed errors (`ValidationError`, `AuthenticationError`, `AppError`) from services; the global `errorHandler` in `core/errors/index.js` serializes them.
- **No inline SQL string concatenation** — always use parameterized queries (`$1`, `$2`, ...).
- **Tenant isolation is mandatory** in every route that touches intelligence data — `workspace-id` header must be validated before any DB query.
- **No comments explaining what code does** — only WHY (non-obvious constraints, fallback behavior, security invariants).
- **No unused variables** — remove rather than prefix with `_`.
- **Gemini calls always have a local fallback** — the pattern is `if (!process.env.GEMINI_API_KEY) { use heuristic }` then `try { Gemini } catch { fallback }`.

---

## 4. Engineering Rules

1. **Never skip tenant isolation.** Every handler that reads/writes workspace data must validate `workspace-id`. Use `req.headers['workspace-id']` and return `400` if absent.
2. **Never log PII.** The privacy gate drops private payloads silently. No raw text from a `PRIVATE_PERSONAL` branch ever touches a log line.
3. **Never bypass the Privacy Gate.** Even in tests, simulate the full pipeline.
4. **The `devDashboard` route has no auth.** This is intentional for local dev. Never add real user data to dev-only endpoints. It must be behind a feature flag or removed before any public deployment.
5. **The `vectorDatabase` array and all in-memory stores are process-scoped.** Do not build features that rely on them surviving a restart.
6. **Do not add CORS origins without confirmation.** Current `origin: '*'` is a known tech-debt item, not a design choice.
7. **BullMQ jobs must be idempotent** — the ingestion worker may retry failed jobs.
8. **All LLM calls must have a graceful no-key fallback** — the system must boot and process requests even without `GEMINI_API_KEY`.
9. **Do not touch Prisma schema without migrating** — run `npx prisma migrate dev` after any schema change.
10. **Ask for approval before any feature implementation.** Present a plan and wait for sign-off.

---

## 5. Backend Architecture

### 5.1 Server Boot Sequence

```
server.js
  → validateEnv()              # exits process if required env vars missing
  → db (pg.Pool)               # PostgreSQL connection pool
  → ingestionQueue (BullMQ)    # connects to Redis
  → ingestionWorker (BullMQ)   # starts consuming jobs
  → summaryWorker (BullMQ)     # starts consuming jobs + schedules midnight cron
  → Express app
     → cors, json, urlencoded, rateLimiter
     → authModule (public)
     → devDashboard (public, NO AUTH)
     → authenticate middleware
     → tenantIsolation middleware
     → orgModule, userModule (protected)
     → /api/webhook/ingest (protected)
     → /api/integrations, /api/query, /api/intelligence, /api/crawler, /api/test/simulate
     → /api/communication (Communication Capability)
     → /api/meetings (Meeting Capability)
     → errorHandler
  → httpServer.listen(PORT)
  → initSocketServer(httpServer)  # attaches ws.Server to same port
```

### 5.2 Ingestion Pipeline (9 Stages)

Triggered by a BullMQ job on `ingestion-queue`. Every stage writes to an in-memory trace (observabilityService) and broadcasts `TRACE_STAGE_UPDATE` via WebSocket.

```
Job payload: { workspaceId, platform, sender, channel, text }

Stage 1  Parser
         normalizeFormatting(text)  → strips prompt injection → [STRIPPED INJECTION]
         extractTaskAndDeadline()   → detects tasks + deadlines

Stage 2  Importance Scorer
         evaluateScores(sender, channel, text)
         → { privacy_score, intent_score, operational_value_score,
             business_impact_score, memory_value_score,
             authority_score, importance_score, urgency_score }

Stage 3  Privacy Gate
         if privacy_score > 0.85 → DISCARD + broadcast PRIVACY_SHIELD_TRIGGERED

Stage 4  Incident Engine
         detectIncidents(workspaceId, text, metadata)
         → keyword match → push to incidentDatabase[] (in-memory)
         → broadcast INCIDENT_CREATED or RISK_DETECTED

Stage 5  Decision Engine
         extractDecisions(workspaceId, text, metadata, sender)
         → push to decisionDatabase[] (in-memory)

Stage 6  Memory Brain
         evaluateChunk(text, { workspaceId, source, sender, channel })
         → { importance_score, authority_score, urgency_score, composite_score, retention_policy }
         → retention_policy: PERMANENT | 90_DAYS | 30_DAYS | 24_HOURS | DISCARD
         → broadcast MEMORY_RETAINED | MEMORY_EXPIRED | MEMORY_DISCARDED | MEMORY_ESCALATED

Stage 7  Entity Extractor
         extractEntitiesFromText(text)
         → returns entity IDs that exist in the in-memory KG

Stage 8  Knowledge Graph Sync
         registerEntity(id, type, name) for each extracted entity
         → increments liveMetrics.totalNodes

Stage 9  Cognitive Brain (processIncomingIntel)
         Gemini classification → OPERATIONAL_INTEL | SOCIAL_COORDINATION | PRIVATE_PERSONAL
         Heuristic fallback if GEMINI_API_KEY absent or API fails

         OPERATIONAL_INTEL:
           saveToVault(workspaceId, channel, text, metadata)
             → writes Markdown to ~/Desktop/FLOW-OS-VAULTS/workspace_{id}/{channel}/intel_{ts}.md
           upsertVector(workspaceId, text, channel, metadata)
             → generateEmbedding(text) → INSERT INTO workspace_intel_chunks
           broadcast INTEL_STORED

         SOCIAL_COORDINATION:
           Redis SET social_cache:workspace_{id}:{channel}:{ts} EX 3600

         PRIVATE_PERSONAL:
           rawInputText = null  → hard drop
           broadcast PRIVACY_SHIELD_TRIGGERED (no payload text)
```

### 5.3 RAG Query Pipeline (POST /api/query)

```
Request: { queryText } + header workspace-id

Stage 1  RouterAgent.routeQuery(queryText)
         → { primaryDomain, domainWeights, intentFlags, routingScore }
         Domains: engineering | security | product | finance | people | operations | general

Stage 2  retrieveContext(workspaceId, queryText, queryTraceId)
         a. Parse structural flags (from:, channel:, priority:) → vaultFrontmatterScan
         b. Semantic path → generateEmbedding(queryText) → pgvector ANN search (LIMIT 20)
            → fallback to vaultFallbackScan on DB/API failure
         c. RRF merge (k=60) of vault + vector results
         d. Knowledge Graph expansion (2-hop context injection)
         → top 5 authority-weighted chunks

Stage 3  CriticAgent.evaluateContext(chunks, queryText)
         → detects temporal contradictions across 5 topic clusters
           (project_timeline, system_health, infra_migration,
            feature_availability, security_posture)
         → flags lower-authority / older chunks as deprecated: true

Stage 4  Memory Boost
         authorityCoeff >= 1.5 → +0.15 to finalScore

Stage 5  ExecutiveSynthesisAgent.synthesize(queryText, validChunks, routerResult, criticSummary)
         → Gemini 2.5 Flash executive brief (Markdown)
         → fallback: local structured Markdown if no API key or Gemini fails

Stage 6  Broadcast EXECUTIVE_SYNTHESIS_READY + return JSON response
```

### 5.4 Authority Weight Matrix

| Platform | Authority Coefficient |
|----------|----------------------|
| github, obsidian, vault, git | 1.5 (HIGH) |
| slack, gmail, chat, discord | 0.8 (LOW) |
| default | 1.0 |

### 5.5 Data Stores

| Store | Technology | Persistence | Data |
|-------|-----------|-------------|------|
| `workspace_intel_chunks` | PostgreSQL + pgvector | Durable | Vectorized operational intel, 768-dim embeddings |
| Prisma tables | PostgreSQL | Durable | Org, Workspace, User, ApiKey, Integration, Agent, AuditLog |
| `vectorDatabase[]` | In-memory (module-level) | **Process lifetime only** | Chunks for summaryService |
| `incidentDatabase[]` | In-memory | **Process lifetime only** | Detected incidents |
| `decisionDatabase[]` | In-memory | **Process lifetime only** | Extracted decisions |
| `topicClusters[]` | In-memory | **Process lifetime only** | Synapse Engine clusters |
| Knowledge Graph nodes/edges | In-memory (Map) | **Process lifetime only** | Entity relationships |
| `ingestionTraces` | In-memory (Map) | **Process lifetime only** | Pipeline step traces |
| `queryTraces[]` | In-memory (Array[100]) | **Process lifetime only** | RAG query traces |
| Social cache | Redis | 3600s TTL | Social coordination messages |
| BullMQ queues | Redis | Durable (Redis-backed) | Job queue state |
| Vault files | Filesystem | Durable | Markdown intel reports, daily summaries |

### 5.6 WebSocket Event Catalog

| Event | Direction | Trigger |
|-------|-----------|---------|
| `CONNECTION_ACK` | Server→Client | On WS connect |
| `INGESTION_START` | Server→Client | Job starts |
| `TRACE_STAGE_UPDATE` | Server→Client | Each pipeline stage |
| `INGESTION_COMPLETE` | Server→Client | Job finishes |
| `INTEL_STORED` | Server→Client | OPERATIONAL_INTEL routed |
| `PRIVACY_SHIELD_TRIGGERED` | Server→Client | PII detected |
| `INCIDENT_CREATED` | Server→Client | Outage detected |
| `RISK_DETECTED` | Server→Client | Risk signal detected |
| `MEMORY_RETAINED/EXPIRED/DISCARDED/ESCALATED` | Server→Client | Memory Brain decision |
| `QUERY_TRACE_START` | Server→Client | RAG query begins |
| `QUERY_STAGE_UPDATE` | Server→Client | Each RAG stage |
| `COGNITIVE_ROUTING_COMPLETE` | Server→Client | Retrieval done |
| `EXECUTIVE_SYNTHESIS_READY` | Server→Client | LLM brief ready |
| `ROLLING_SUMMARY_READY` | Server→Client | Daily summary saved |
| `ACTION_EXECUTED` | Server→Client | Action orchestrator fires |

### 5.7 Route Map

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/health`, `/api/health` | None | Infrastructure health check |
| POST | `/api/auth/signup` | None | Register user + org + workspace |
| POST | `/api/auth/login` | None | Authenticate, returns JWT |
| GET | `/dev-dashboard` | None (HTML shell only) | Engineering cockpit UI — 404 in production |
| GET/POST | `/api/dev/*` | JWT + OWNER/ADMIN | Engineering cockpit API — 404 in production |
| POST | `/api/webhook/ingest` | JWT | Push messages into ingestion queue |
| POST | `/api/query` | JWT + workspace-id | RAG query → executive brief |
| GET | `/api/intelligence/health-score` | JWT + workspace-id | Workspace health score |
| GET | `/api/intelligence/daily-feed` | JWT + workspace-id | Daily intel feed |
| POST | `/api/intelligence/rolling-summary` | JWT + workspace-id | Compile rolling summary |
| GET | `/api/crawler/fetch` | JWT | SSRF-safe URL fetch |
| GET | `/api/connectors` | JWT + workspace-id | List registered connectors + auth status |
| GET | `/api/connectors/capabilities` | JWT + workspace-id | Capability → connector map |
| GET | `/api/connectors/health` | JWT + workspace-id | Health check all connectors |
| GET | `/api/connectors/timeline` | JWT + workspace-id | Workspace action timeline |
| GET | `/api/connectors/audit` | JWT + workspace-id | Workspace audit log |
| POST | `/api/connectors/execute` | JWT + workspace-id | Execute a connector action |
| POST | `/api/connectors/search` | JWT + workspace-id | Universal cross-connector search |
| POST | `/api/connectors/:id/auth/initiate` | JWT + workspace-id | Start auth flow |
| POST | `/api/connectors/:id/auth/callback` | JWT + workspace-id | OAuth code exchange |
| POST | `/api/connectors/:id/auth/revoke` | JWT + workspace-id | Revoke credentials |
| GET | `/api/approvals` | JWT + workspace-id + ADMIN+ | List pending approvals |
| GET | `/api/approvals/history` | JWT + workspace-id + ADMIN+ | All approvals (any status) |
| GET | `/api/approvals/:id` | JWT + workspace-id | Single approval detail |
| POST | `/api/approvals/:id/approve` | JWT + workspace-id + ADMIN+ | Approve + re-execute action |
| POST | `/api/approvals/:id/reject` | JWT + workspace-id + ADMIN+ | Reject approval request |
| GET | `/api/policies` | JWT + workspace-id + ADMIN+ | List governance policies |
| POST | `/api/policies` | JWT + OWNER | Create a policy |
| GET | `/api/policies/:id` | JWT + ADMIN+ | Get policy detail |
| PUT | `/api/policies/:id` | JWT + OWNER | Update a policy |
| PATCH | `/api/policies/:id/toggle` | JWT + OWNER | Enable/disable a policy |
| DELETE | `/api/policies/:id` | JWT + OWNER | Delete a policy |
| GET | `/api/integration-permissions` | JWT + workspace-id | All connectors + allowed/hidden counts |
| GET | `/api/integration-permissions/:connector` | JWT + workspace-id | Resource catalog (filters: q, status, type) |
| POST | `/api/integration-permissions/:connector/discover` | JWT + ADMIN+ | Real provider API → catalog |
| PUT | `/api/integration-permissions/:connector/resources` | JWT + ADMIN+ | Bulk allow/hide resources |
| POST | `/api/integration-permissions/:connector/bulk` | JWT + ADMIN+ | Allow all / hide all |
| PATCH | `/api/integration-permissions/:connector/settings` | JWT + ADMIN+ | autoAllowNew, dmPolicy |
| GET | `/api/integration-permissions/:connector/audit` | JWT + ADMIN+ | Permission-change history |
| GET | `/api/engineering/status` | JWT + workspace-id | GitHub connection status for workspace |
| POST | `/api/engineering/auth` | JWT + workspace-id | Store GitHub PAT for workspace |
| GET | `/api/engineering/repos` | JWT + workspace-id | List repos for authenticated user/org |
| GET | `/api/engineering/repos/:owner/:repo` | JWT + workspace-id | Single repo metadata |
| GET | `/api/engineering/repos/:owner/:repo/contributors` | JWT + workspace-id | Top contributors |
| GET | `/api/engineering/repos/:owner/:repo/branches` | JWT + workspace-id | List branches |
| GET | `/api/engineering/repos/:owner/:repo/compare` | JWT + workspace-id | Compare two refs (?base=&head=) |
| GET | `/api/engineering/repos/:owner/:repo/commits` | JWT + workspace-id | Commit history |
| GET | `/api/engineering/repos/:owner/:repo/commits/:sha` | JWT + workspace-id | Single commit with files |
| GET | `/api/engineering/repos/:owner/:repo/pulls` | JWT + workspace-id | List PRs (?state=open) |
| GET | `/api/engineering/repos/:owner/:repo/pulls/:number` | JWT + workspace-id | Single PR with merge readiness |
| GET | `/api/engineering/repos/:owner/:repo/pulls/:number/reviews` | JWT + workspace-id | Reviews + reviewer workload |
| GET | `/api/engineering/repos/:owner/:repo/deployments` | JWT + workspace-id | Deployments (?environment=) |
| GET | `/api/engineering/repos/:owner/:repo/deployments/:id` | JWT + workspace-id | Single deployment |
| POST | `/api/engineering/repos/:owner/:repo/branches` | JWT + workspace-id | Create branch |
| POST | `/api/engineering/repos/:owner/:repo/pulls` | JWT + workspace-id | Create pull request |
| PATCH | `/api/engineering/repos/:owner/:repo/pulls/:number` | JWT + workspace-id | Update PR |
| POST | `/api/engineering/repos/:owner/:repo/pulls/:number/approve` | JWT + workspace-id | Approve/review PR |
| POST | `/api/engineering/repos/:owner/:repo/pulls/:number/merge` | JWT + workspace-id | Merge pull request |
| POST | `/api/engineering/search` | JWT + workspace-id | Search code/repos/commits |
| POST | `/api/engineering/sync` | JWT + workspace-id | Sync PRs + commits to ingestion |
| GET | `/api/communication/status` | JWT + workspace-id | Gmail connection status for workspace |
| GET | `/api/communication/oauth/callback` | None (Google redirect) | OAuth code exchange; stores tokens |
| GET | `/api/communication/inbox` | JWT + workspace-id | List inbox messages |
| GET | `/api/communication/thread/:threadId` | JWT + workspace-id | Full thread with all messages |
| GET | `/api/communication/message/:messageId` | JWT + workspace-id | Single message (full body) |
| GET | `/api/communication/labels` | JWT + workspace-id | List Gmail labels |
| POST | `/api/communication/search` | JWT + workspace-id | Gmail search |
| POST | `/api/communication/send` | JWT + workspace-id | Send new email |
| POST | `/api/communication/reply/:messageId` | JWT + workspace-id | Reply to message |
| POST | `/api/communication/reply-all/:messageId` | JWT + workspace-id | Reply all |
| POST | `/api/communication/forward/:messageId` | JWT + workspace-id | Forward message |
| POST | `/api/communication/draft` | JWT + workspace-id | Create draft |
| PATCH | `/api/communication/label/:id` | JWT + workspace-id | Modify labels on message or thread |
| POST | `/api/communication/sync` | JWT + workspace-id | Sync inbox to ingestion pipeline |
| GET | `/api/meetings/status` | JWT + workspace-id | Google Calendar connection status |
| GET | `/api/meetings/oauth/callback` | None (Google redirect) | OAuth code exchange; stores tokens |
| GET | `/api/meetings/upcoming` | JWT + workspace-id | List upcoming events (next N days) |
| GET | `/api/meetings/past` | JWT + workspace-id | List past events (last N days) |
| GET | `/api/meetings/event/:eventId` | JWT + workspace-id | Single event with notes/actions/summary |
| GET | `/api/meetings/event/:eventId/context` | JWT + workspace-id | AI meeting prep context (RAG pipeline) |
| POST | `/api/meetings/search` | JWT + workspace-id | Text search across events |
| POST | `/api/meetings/create` | JWT + workspace-id | Create calendar event |
| PATCH | `/api/meetings/event/:eventId` | JWT + workspace-id | Update event metadata |
| DELETE | `/api/meetings/event/:eventId` | JWT + workspace-id | Delete event |
| POST | `/api/meetings/event/:eventId/notes` | JWT + workspace-id | Append meeting notes |
| POST | `/api/meetings/event/:eventId/actions` | JWT + workspace-id | Store action items on event |
| POST | `/api/meetings/event/:eventId/summary` | JWT + workspace-id | Store AI meeting summary on event |
| POST | `/api/meetings/sync` | JWT + workspace-id | Sync upcoming events to ingestion pipeline |
| POST | `/api/test/simulate/*` | JWT | End-to-end test simulation |
| GET/POST | `/api/integrations/*` | JWT | Composio OAuth integration |
| GET/POST | `/api/orgs/*` | JWT + tenant | Organization management |
| GET/POST | `/api/users/*` | JWT + tenant | User management |

---

## 6. AI Pipeline Details

### 6.1 Gemini Models Used

| Task | Model | Fallback |
|------|-------|---------|
| Privacy classification | `gemini-2.5-flash` | Keyword heuristic |
| Text embeddings | `gemini-embedding-2` (768-dim) | Random normalized vector (non-production only) |
| Executive synthesis | `gemini-2.5-flash` | Local Markdown builder |
| Rolling summary | `gemini-2.5-flash` | Template-based Markdown |

### 6.2 Memory Brain Retention Policy

```
composite = (importance × 0.45) + (authority × 0.35) + (urgency × 0.20)

urgency >= 0.7 AND importance >= 0.6 AND authority >= 0.6 → PERMANENT
urgency >= 0.7 (otherwise)                               → 24_HOURS
composite >= 0.70                                        → PERMANENT
composite >= 0.50                                        → 90_DAYS
composite >= 0.30                                        → 30_DAYS
composite >= 0.15                                        → 24_HOURS
otherwise                                                → DISCARD
```

### 6.3 Synapse Engine (Cross-Channel Clustering)

Runs inside `vectorStoreService.storeKnowledge`. For each chunk:
1. Generate 768-dim embedding
2. Compare cosine similarity against all existing clusters for this workspace
3. If best match ≥ 0.82 → join cluster, update rolling centroid
4. Otherwise → spawn new cluster (UUID, derived title, seed centroid)

---

## 7. Frontend Architecture

**Location**: `flow-os-frontend/`  
**Stack**: React 18, Vite, React Router v6, Tailwind CSS  
**Build**: Vite (`vite.config.js`)  
**Entry**: `src/main.jsx` → `src/App.jsx`

### 7.1 Route Map

| Route | Component | Status |
|-------|-----------|--------|
| `/workfeed` | DailyWorkfeed | Active |
| `/search` | UniversalSearch | Active |
| `/assistant` | WorkspaceIntelligence | Active |
| `/meetings/*` | MeetingDashboard, Prep, Live, Summary | Active |
| `/knowledge` | KnowledgeExplorer | Active |
| `/projects` | ProjectIntelligence | Active |
| `/inbox` | AIInbox | Active |
| `/query` | DeveloperConsole | Active (dev only) |
| `/company/*` | TeamDashboard, DecisionBoard, TeamMemory, CollabHub | Active |
| `/admin/*` | CompanyWorkspace, DepartmentIntelligence, CompanyMemory, ExecutiveAdvisor | Active |
| `/platform/*` | EnterpriseAdmin, IAM, Workspaces, Security, Audit, AI Governance, Integrations, Billing, Marketplace | Active |
| `/settings` | ComingSoon | Stub |
| `/security` | ComingSoon | Stub |
| `/activity` | ComingSoon | Stub |
| `/help` | ComingSoon | Stub |

### 7.2 Component Structure

```
src/
├── components/
│   ├── layout/        # LayoutShell, Sidebar, Header
│   ├── ui/            # Primitives: Button, Card, Input, Badge, Toast, Skeleton, etc.
│   ├── workfeed/      # DailyWorkfeed, RecommendationEngine (hero), actionCenterAdapter.js, WorkfeedCard, MeetingCard, ApprovalCard, etc.
│   ├── workspace/     # WorkspaceIntelligence, HealthIndicator, MemoryCard, etc.
│   ├── meetings/      # MeetingDashboard, LiveMeeting, MeetingSummary, etc.
│   ├── team/          # TeamDashboard, DecisionBoard, TeamMemory, CollaborationHub
│   ├── company/       # CompanyWorkspace, ExecutiveAdvisor, CompanyMemory, DepartmentIntelligence
│   ├── projects/      # ProjectIntelligence, ProjectOverview
│   ├── platform/      # Enterprise platform pages (admin, IAM, billing, governance)
│   ├── search/        # UniversalSearch
│   ├── inbox/         # AIInbox
│   └── knowledge/     # KnowledgeExplorer
├── hooks/
│   └── useWebSocket.jsx   # WebSocket connection hook (workspace-scoped)
└── styles/
    ├── tokens.css         # CSS custom properties (design tokens)
    ├── colors.css         # Color palette
    ├── typography.css     # Type scale
    ├── spacing.css        # Spacing scale
    ├── animations.css     # Keyframe animations
    └── globals.css        # Base resets + utilities
```

### 7.3 Frontend Conventions

- All routes lazy-loaded with `React.lazy` + `Suspense`
- CSS design tokens in `styles/tokens.css` — do not use raw hex values in components
- Component files are `.jsx` (not `.tsx`) — the codebase is JavaScript
- One exception: `src/components/ui/button.tsx` (leftover from shadcn migration — do not add more `.tsx`)

---

## 8. Current Project Status

### What is built and working

- Full ingestion pipeline (9 stages) with observability traces
- pgvector-backed vector store with Gemini embeddings
- Multi-agent RAG pipeline (Router → Critic → Synthesis)
- Privacy gate (LLM + heuristic fallback)
- Incident and decision detection engines
- Memory Brain retention scoring
- In-memory Knowledge Graph with 2-hop traversal
- Synapse Engine (cross-channel topic clustering)
- WebSocket real-time telemetry to all connected dashboards
- JWT auth + multi-tenant isolation
- Prisma-backed identity model (Org/Workspace/User)
- Dev Engineering Cockpit (`/dev-dashboard`) with pipeline replay, health, vectors, graph, test panel
- SSRF-safe web crawler
- Composio OAuth integration framework
- Rolling summary worker (daily BullMQ cron)
- React frontend with full routing, lazy loading, design system
- **FLOW Recommendation Engine** — client-side scoring engine in `DailyWorkfeed`, ranks live workfeed items by urgency, derives health impact deltas, animates workspace health prediction from current → predicted score, expandable AI reasoning panel. No backend changes. See `src/components/workfeed/RecommendationEngine.jsx`.
- **Universal Action Center** — connector-agnostic slide-over panel (`src/components/ui/ActionCenter.jsx`). Opens from Recommendation Engine card clicks. Sections: Header, Context, AI Analysis, Suggested Action (editable), Related Items, Execution, Timeline. Normalized by `src/components/workfeed/actionCenterAdapter.js` — add a new connector by extending the adapter only. No ActionCenter.jsx changes required for new connectors.
- **Vite proxy fix** — all frontend API calls now proxied from `:3000` → `:5001` (backend). WebSocket connects directly to `ws://localhost:5001`. Config in `flow-os-frontend/vite.config.js`.
- **Workfeed demo fallback** — if `/api/intelligence/workfeed` is unavailable (stale backend process), `DailyWorkfeed` loads rich inline demo data client-side so the page never hangs in skeleton state.
- **Universal Connector Framework** — `src/connectors/` provides the permanent integration foundation: Connector Registry, 10-capability layer, BaseAdapter interface, AuthManager (OAuth2/API key/service account/webhook), ExecutionEngine (full pipeline with audit + timeline + WS broadcast), SearchOrchestrator (fan-out search across all connected adapters + internal memory), and REST API at `/api/connectors/*`. Adding a new integration requires only a new adapter file + registration — zero changes to existing code.
- **Communication Capability (Phase 5.4)** — `GmailAdapter` is the first production Communication provider. Full Gmail support: OAuth2 consent flow, inbox listing, thread reading, message fetch, label listing, search (Gmail query syntax), send, reply, reply-all, forward, draft creation, label modification, inbox sync to ingestion pipeline. All actions flow through `executeAction()` — governance, audit, timeline, WebSocket broadcast, Recommendation Engine integration. Provider-agnostic REST API at `/api/communication/*`; add Outlook/Exchange/Slack DM by adding a new adapter. `?provider=` query param selects the adapter.
- **Meeting Capability (Phase 5.5)** — `GoogleCalendarAdapter` is the first production Meeting provider. Full Google Calendar support: OAuth2, upcoming/past event listing, single event detail, AI meeting prep context (RAG pipeline query on event title + attendees), event search, create, update, delete, live notes/action items/summary stored in `event.extendedProperties.private`, event sync to BullMQ ingestion pipeline (with KG node registration). Provider-agnostic REST API at `/api/meetings/*`; add Outlook Calendar, Zoom, Teams by adding a new adapter. Frontend meeting components (MeetingDashboard, MeetingPreparation, MeetingSummary, LiveMeeting) wired to real API with demo fallbacks so the UI works without a connected calendar.
- **Engineering Capability (Phase 5.6)** — `GitHubAdapter` is the first production Engineering provider. Full GitHub support via native `fetch` against the GitHub REST API: PAT authentication, repositories (list/metadata/contributors), branches (list/compare), commits (history/single with file diffs), pull requests (list/detail with AI merge readiness score 0–100), code reviews (list/reviewer workload/suggested reviewers), deployments (list/detail with risk score 0–100), branch create, PR create/update/approve/merge, search (code/repos/commits), sync to BullMQ ingestion pipeline with KG `authored_by` edges. Provider-agnostic REST API at `/api/engineering/*`; add GitLab, Bitbucket, Azure DevOps by adding a new adapter. `ProjectIntelligence.jsx` wired to real API — fetches repos + PRs + commits, computes risk status, surfaces merge readiness scores and AI recommendations. Full demo fallback when GitHub is not connected.
- **Workspace Lifecycle Engine (WLE)** — universal manifest-driven pipeline at `src/core/workspaceLifecycle/`. Replaces demo-specific import logic. Five operations: CREATE (10 stages), IMPORT (9), SYNC (7), REFRESH (4), VALIDATE (1, dry-run). Plugin registry of 23 built-in dataset types. Every operation creates a durable `ImportRecord` in PostgreSQL and streams 6 WebSocket event types. REST API at `/api/lifecycle/*` (7 routes). `ImportDashboard.jsx` provides a 5-tab UI. Full reference: `docs/WORKSPACE_LIFECYCLE_ENGINE.md`.

### What is stubbed / incomplete

- `/settings`, `/security`, `/activity`, `/help` routes → `ComingSoon` component
- Some platform pages (IAM, Governance, Billing, Marketplace) appear to be UI stubs without real data
- Test suite: `tests/` directory exists but is empty
- RAG evaluation harness (`src/evaluation/ragEval.js`) exists but is not wired into CI

### Completed feature branches (merged to main)

`feature/background-ingestion`, `feature/cognitive-privacy-engine`, `feature/core-middleware-errors`, `feature/database-schema`, `feature/express-routes`, `feature/frontend-dashboard`, `feature/integrations`, `feature/multi-agent-reasoning`, `feature/test-suites`, `feature/simulators-and-documentation`

---

## 9. Known Technical Debt

| ID | Issue | Location | Risk |
|----|-------|----------|------|
| TD-01 | All in-memory stores (vectorDatabase, incidentDatabase, decisionDatabase, KG, traces, topicClusters) are lost on restart | Multiple services | HIGH — no operational continuity |
| TD-02 | ~~Vault root hardcoded~~ — **FIXED Sprint 5.3.2**: uses `VAULT_ROOT` env var, defaults to `~/FLOW-OS-VAULTS` | `vaultService.js`, `retrievalService.js`, `summaryService.js` | ✅ Resolved |
| TD-03 | ~~Dev dashboard no auth~~ — **FIXED Sprint 5.3.2**: blocked in production (404); API routes require OWNER/ADMIN JWT | `devDashboard.js` | ✅ Resolved |
| TD-04 | CORS set to `origin: '*'` | `server.js:36` | HIGH — must be scoped to known domains before production |
| TD-05 | ~~JWT secret hardcoded fallback~~ — **FIXED Sprint 5.3.2**: no fallback; `validateEnv()` enforces presence + minimum 32 chars + known-default block | `authenticate.js`, `envValidation.js` | ✅ Resolved |
| TD-06 | Random embedding fallback silently used in dev/test | `vectorStoreService.js:182`, `retrievalService.js:574` | MEDIUM — pollutes vector index with noise, hard to detect |
| TD-07 | `generateEmbedding` duplicated | `vectorStoreService.js` + `retrievalService.js` | MEDIUM — divergence risk |
| TD-08 | Both `pg.Pool` and Prisma connect simultaneously | `db.js` + `core/config/prisma.js` | MEDIUM — two connection pools competing |
| TD-09 | Daily summary cron hardcoded to `workspace_corp_alpha` | `summaryWorker.js:26` | MEDIUM — no multi-tenant support |
| TD-10 | No per-tenant rate limiting | `core/middleware/rateLimiter.js` | MEDIUM — one noisy tenant can starve others |
| TD-11 | `console.log` in `operationalScoringService.js` fires on every job | `operationalScoringService.js:13-14` | LOW — log noise in production |
| TD-12 | Empty `tests/` directory | `tests/` | LOW — no automated safety net |
| TD-13 | Mixed `.jsx` and `.tsx` in frontend components | `src/components/ui/button.tsx` | LOW — TypeScript not configured, file will not type-check |
| TD-OG-01 | `testContext` helper inserts into `"Org"`/`"Workspace"` (PascalCase) but real tables are `organizations`/`workspaces` (snake_case); inserts silently no-op, so ephemeral test orgs are never created | `src/validation/helpers/testContext.js` | LOW — connector suites only need the workspace-id string; graph/org-FK tests must seed via Prisma instead |

---

## 10. Current Sprint

**Active: Workspace Lifecycle Engine (WLE)** (completed 2026-06-29)

Previous: Phase 5.6 — Engineering Capability (completed 2026-06-28)

### What was delivered in Sprint 5.3-A

- **Workspace isolation fix** — `tenantIsolation.js` now validates that the `workspace-id` header belongs to `req.user.orgId` via a Prisma DB query. Cross-org workspace access returns 403. `req.workspace` and `req.workspace.org.plan` are attached for downstream use.
- **Governance module** — `src/core/governance/` with:
  - `constants.js` — `Effect` enum (ALLOW/DENY/REQUIRE_APPROVAL), default role-action matrix, plan-tier capability gates
  - `permissionEvaluator.js` — `evaluate(context)` → `{ effect, reason }` — single authority for all permission decisions
  - `governanceMiddleware.js` — attaches `req.govContext` after tenantIsolation resolves
  - `auditPersistence.js` — writes connector execution records to PostgreSQL `AuditLog` table (Prisma)
  - `index.js` — barrel export
- **Execution engine upgraded** — `executeAction()` now: (1) evaluates governance before any I/O, (2) throws `AuthorizationError` on DENY, (3) throws `AppError(403, 'APPROVAL_REQUIRED')` when `approvedBy` is missing for roles that need it, (4) persists all outcomes (success, failure, denied, approval_required) to PostgreSQL, (5) emits `CONNECTOR_ACTION_EXECUTED` / `CONNECTOR_ACTION_DENIED` / `CONNECTOR_APPROVAL_REQUIRED` on the event bus.
- **Audit API** — `GET /api/connectors/audit` now queries PostgreSQL (durable) instead of the in-memory ring buffer.
- **In-memory timeline retained** — ephemeral 200-event ring buffer kept for real-time WebSocket delivery only.
- **Event bus wired** — `CONNECTOR_ACTION_EXECUTED`, `CONNECTOR_ACTION_DENIED`, `CONNECTOR_APPROVAL_REQUIRED` emitted. Subscribers (analytics, memory, notifications) attach in Sprint 5.3-B.

### What was delivered in Sprint 5.3-B

- **WorkspaceMember model** — `workspace_members` table separates workspace-level role from org role. `tenantIsolation` resolves the workspace role in one query and sets `req.workspaceRole`. Falls back to org role if no membership record exists. `governanceMiddleware` uses workspace role for `req.govContext.role`.
- **Policy model** — `policies` table stores DB-configurable governance rules. `policyStore.js` provides CRUD + 60-second in-memory cache. `evaluateWithPolicies()` is now the primary evaluator: DB policies first (DENY wins), default matrix fallback.
- **Approval lifecycle** — `pending_approvals` table persists every REQUIRE_APPROVAL decision. `approvalStore.js` manages the full PENDING → APPROVED → EXECUTED / REJECTED / EXPIRED state machine. Self-approval is guarded. 48-hour default TTL.
- **Approval API** — `GET/POST /api/approvals/*` for listing, approving, rejecting, and viewing history.
- **Policy management API** — `GET/POST/PUT/PATCH/DELETE /api/policies` for OWNER/ADMIN governance.
- **Audit improvements** — `AuditLog` now has dedicated `workspaceId`, `approvalId`, `policyId` indexed columns (no more JSON metadata filtering). `persistConnectorAudit()` returns the created row ID.
- **Event subscribers** — `eventSubscribers.js` wires `CONNECTOR_ACTION_EXECUTED`, `CONNECTOR_ACTION_DENIED`, `CONNECTOR_APPROVAL_REQUIRED`, `APPROVAL_RESOLVED` to independent handlers. In-memory metrics counter per workspace. Extension points documented for Sprint 5.3-C notifications.
- **Execution engine** — on REQUIRE_APPROVAL: creates PendingApproval record, returns `{ approvalId }` in 403 response. On approval resolution: `executeAction()` re-called with approvedBy + approvalId, marks PendingApproval as EXECUTED.
- **SQL migration** — `scripts/migrate-governance-5-3-b.sql` — idempotent, safe to re-run, does not touch `workspace_intel_chunks`.

### What was delivered in Sprint 5.3.2 — Security & Deployment Cleanup

- **Vault path portability** — replaced all 4 hardcoded `/Users/kishorevarma/Desktop/FLOW-OS-VAULTS` occurrences with `process.env.VAULT_ROOT ?? path.join(os.homedir(), 'FLOW-OS-VAULTS')`. Affected: `vaultService.js`, `retrievalService.js`, `summaryService.js`, `devDashboard.js`. Add `VAULT_ROOT` to `.env` to override.
- **Dev dashboard secured** — `devDashboard.js` now has two router-level middlewares: (1) production block — any `NODE_ENV === 'production'` request returns `404` before any handler runs; (2) API auth — all routes except `GET /` (HTML shell) require a valid Bearer JWT with OWNER or ADMIN role. Dashboard JS updated to read token from `localStorage` and send it with every `fetch` call. A "Set Token" / "Sign Out" button is visible in the header.
- **JWT hardcoded fallback removed** — `authenticate.js` no longer has `|| 'flow-os-dev-secret-change-in-production'`. `JWT_SECRET = process.env.JWT_SECRET` — guaranteed non-null by `validateEnv()` which runs before any module loads.
- **Startup config validation hardened** — `envValidation.js` now:
  - Rejects `JWT_SECRET` shorter than 32 characters
  - Rejects `JWT_SECRET` matching a set of known insecure defaults
  - Logs the effective `VAULT_ROOT` path on every startup so operators can verify where vault files land

### What was delivered in Sprint 5.5 — Meeting Capability (Phase 5.5)

- **GoogleCalendarAdapter** — `src/connectors/adapters/GoogleCalendarAdapter.js` — full Meeting provider:
  - OAuth2 consent URL generation with workspace `state` param; token exchange and auto-refresh
  - Upcoming event listing (configurable look-ahead days, limit)
  - Past event listing (configurable look-back, most-recent-first)
  - Single event detail fetch
  - Full-text event search across ±90 days
  - Create event (attendees, location, Google Meet video conference generation)
  - Update event (title, description, start/end, and FLOW metadata in `extendedProperties.private`)
  - Delete event
  - Notes/action items/AI summary stored as `flow_notes`/`flow_actions`/`flow_summary` in `extendedProperties.private` — persists on the calendar event
  - Sync to BullMQ ingestion pipeline + Knowledge Graph node registration (EVENT + USER entities, ATTENDING edges)
  - Search results normalized to `createSearchResult()` for SearchOrchestrator fan-out
  - Health check via `calendarList.list`; graceful DEGRADED if unauthenticated
- **Adapter registration** — `GoogleCalendarAdapter` added to `src/connectors/adapters/index.js`
- **Meeting REST API** — `src/routes/meetingRoutes.js` — 15 routes at `/api/meetings/*`:
  - All CRUD actions flow through `executeAction()` — governance, audit, timeline, WebSocket
  - `/event/:id/context` runs the full RAG pipeline (retrieve → critic → synthesis) against workspace memory using the meeting title + attendee names as the query, returning a structured prep context with AI brief, related chunks, and suggested questions
- **Frontend wiring** — all four meeting components updated to call real API with demo fallbacks:
  - `MeetingDashboard` — fetches `/api/meetings/upcoming` + `/api/meetings/past`; normalizes to card shape; refresh button; "Demo mode" indicator when calendar is not connected
  - `MeetingPreparation` — fetches event detail + AI context from `/api/meetings/event/:id/context`; renders AI brief panel when context is available
  - `MeetingSummary` — fetches event detail; normalizes actions/decisions from `metadata`; Save button persists actions back to calendar event via API
  - `LiveMeeting` — fetches event title + Meet URL from API; shows "Join Meet" button when `videoUrl` is present; mock transcript stream retained (real-time transcription requires Speech-to-Text API)

### What was delivered in Sprint 5.6 — Engineering Capability (Phase 5.6)

- **GitHubAdapter** — `src/connectors/adapters/GitHubAdapter.js` — first Engineering provider:
  - Auth: GitHub Personal Access Token (PAT) stored via `storeApiKey()` or `GITHUB_TOKEN` env var
  - Uses native `fetch` (Node 20+) with `Authorization: Bearer`, `X-GitHub-Api-Version: 2022-11-28`
  - **Repositories**: list user/org repos, single repo metadata (language, stars, forks, openIssues, topics)
  - **Contributors**: top contributors with contribution counts
  - **Branches**: list branches, compare two refs (ahead/behind commits, status)
  - **Commits**: list history or fetch single commit with full file diff (filename, status, additions, deletions, patch preview)
  - **Pull Requests**: list open/draft/closed PRs, single PR with `mergeReadinessScore` (0–100) computed from review state, merge conflicts, draft status, and PR age
  - **Code Reviews**: list reviews + reviewer workload summary + `suggestedReviewers` based on active reviewers; AI review summary string built locally from approve/changes-requested state
  - **Deployments**: list by environment, single deployment with `riskScore` (0–100) computed from environment type (prod = higher), deploy time (off-hours = higher), and day of week (weekend = higher)
  - **Create branch**: from SHA or existing branch ref
  - **Create PR**: full GitHub PR create (title, body, head, base, draft)
  - **Update PR**: patch title, body, state, base branch
  - **Approve PR review**: submit APPROVE, REQUEST_CHANGES, or COMMENT review event
  - **Merge PR**: squash/merge/rebase via GitHub Merge API
  - **Search**: GitHub code, repositories, commits, issues search with optional `repo:owner/name` qualifier
  - **Sync**: pushes open PRs + recent commits into BullMQ ingestion pipeline; registers PR authors as `user:github:login` nodes in Knowledge Graph with `authored_by` edges
  - Health check via `/rate_limit` — reports remaining API quota; DEGRADED if no credentials
- **Adapter registration** — `GitHubAdapter` added to `src/connectors/adapters/index.js`
- **Engineering REST API** — `src/routes/engineeringRoutes.js` — 22 routes at `/api/engineering/*`:
  - Same workspace-id guard + `resolveProvider()` + `runAction()` patterns as communication/meeting routes
  - `?provider=` param selects adapter (default: `github`); GitLab, Bitbucket, Azure DevOps plug in via new adapters only
  - All state-changing actions (create branch, create PR, merge, approve) flow through `executeAction()` — governance, audit, timeline, WebSocket broadcast
  - `POST /api/engineering/auth` — store PAT for workspace without going through executeAction
  - `GET  /api/engineering/status` — connection health + credential type
- **Startup warning** — `envValidation.js` warns (non-fatal) if `GITHUB_TOKEN` absent
- **Frontend wiring** — `ProjectIntelligence.jsx` rewritten:
  - Fetches `/api/engineering/repos` then parallel `pulls` + `commits` requests per repo (max 5 repos)
  - Normalizes GitHub data into the existing `project` shape: status (At Risk/On Track), risks, AI recommendation, decisions, commits, tasks
  - Risk determination: PRs with `mergeReadinessScore < 50` or `reviewStatus === changes_requested` = At Risk
  - AI recommendation: merge-ready PR surfaces a merge nudge; not-ready PR surfaces a review note
  - Full demo fallback with hardcoded data when API unavailable; "Demo mode" subtitle + refresh button
  - `ProjectOverview.jsx` unchanged — consumes normalized project shape

### What was delivered in Sprint 5.4 — Communication Capability (Phase 5.4)

- **GmailAdapter** — `src/connectors/adapters/GmailAdapter.js` — full Communication provider:
  - OAuth2 consent URL generation with workspace `state` param; token exchange and auto-refresh via `oauth2Client.on('tokens')`
  - Inbox listing (label filtering, pagination, Gmail query `q` param)
  - Thread fetch (all messages, MIME tree walking)
  - Single message fetch with recursive multipart/alternative MIME parsing
  - Label listing
  - Gmail search (passes raw Gmail query syntax)
  - Send (RFC 2822 MIME, multipart/alternative, base64url encoded)
  - Reply / reply-all (fetches original for `In-Reply-To` + `References` threading headers)
  - Forward (prepends original body)
  - Draft create and update
  - Label modification (per-message and per-thread, with named shortcut actions: `archive`, `markRead`, `markUnread`, `star`, `trash`)
  - Inbox sync to BullMQ ingestion queue (lazy import to avoid circular deps)
  - Normalized to `createCommunicationItem()` / `createSearchResult()` from `normalizedTypes.js`
  - Health check via `gmail.users.getProfile`; `503` if `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` absent
- **Adapter registration** — `src/connectors/adapters/index.js` imported as a side-effect in `server.js`; populates `ConnectorRegistry` at boot
- **Communication REST API** — `src/routes/communicationRoutes.js` — 14 routes at `/api/communication/*`; provider-agnostic via `?provider=` query param; workspace-id guard middleware; all actions dispatch through `executeAction()`
- **Startup warning** — `envValidation.js` warns (non-fatal) if Gmail credentials absent so operators know the capability is not activated
- **New env vars** — `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` (backward-compatible aliases: `GMAIL_CLIENT_ID` / `GMAIL_CLIENT_SECRET`); `FRONTEND_URL` for OAuth redirect target

### Sprint 5.3-C candidates (pending approval)

1. **[P0] Approval notifications** — email/Slack/WebSocket push when approval is created, approved, or rejected
2. **[P1] Analytics persistence** — persist `connectorMetrics` from eventSubscribers to PostgreSQL; feed recommendation engine
3. **[P1] Policy versioning** — `version` + `parentId` on Policy; compare active version on evaluation
4. **[P2] Multi-stage approval chains** — `approvalChain` JSON on PendingApproval; require N approvers in sequence
5. **[P2] MFA/device conditions** — `conditions.requireMFA` evaluated against session store in governanceMiddleware

---

## 11. Environment Variables

```bash
# Required (server will exit on startup if missing)
DATABASE_URL=postgresql://user:pass@host:port/db
REDIS_URL=redis://127.0.0.1:6379
JWT_SECRET=<min 32 chars, cryptographically random — generate: openssl rand -hex 32>
COMPOSIO_API_KEY=<composio key>
GEMINI_API_KEY=<google ai key>   # OR OPENAI_API_KEY — at least one required

# Optional
PORT=5000
GEMINI_BASE_URL=                 # Override Gemini endpoint (for proxies/testing)
NODE_ENV=production              # Disables random embedding fallback; blocks /dev-dashboard
VAULT_ROOT=/path/to/vault/dir   # Where vault Markdown files are written. Default: ~/FLOW-OS-VAULTS
FRONTEND_URL=http://localhost:3000  # OAuth redirect target for Gmail callback

# Communication Capability (required to activate Gmail)
GOOGLE_CLIENT_ID=<google oauth client id>
GOOGLE_CLIENT_SECRET=<google oauth client secret>
# Aliases also accepted: GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET

# Engineering Capability (required to activate GitHub)
GITHUB_TOKEN=<github personal access token — scopes: repo, read:user>
GITHUB_API_URL=                # Optional: override for GitHub Enterprise (default: https://api.github.com)
```

---

## 12. Running the Project

```bash
# Install
npm install

# Start server (includes workers)
npm run start      # production
npm run dev        # watch mode

# Developer dashboard (auth required — paste your JWT via the "Set Token" button)
# Navigate to http://localhost:5000/dev-dashboard

# Inject a test payload (requires OWNER/ADMIN JWT)
curl -X POST http://localhost:5000/api/dev/inject \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <jwt>" \
  -d '{"workspaceId":"workspace_corp_alpha","platform":"slack","sender":"CTO","channel":"engineering","text":"Critical database migration needed for pgvector upgrade."}'

# Seed all 5 platforms at once (requires OWNER/ADMIN JWT)
curl -X POST http://localhost:5000/api/dev/seed-all \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <jwt>" \
  -d '{"workspaceId":"workspace_corp_alpha"}'

# RAG query
curl -X POST http://localhost:5000/api/query \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <jwt>" \
  -H "workspace-id: workspace_corp_alpha" \
  -d '{"queryText":"What database changes are pending?"}'
```

---

```bash
# Initiate Gmail OAuth for a workspace (returns consent URL)
curl -X POST http://localhost:5000/api/connectors/gmail/auth/initiate \
  -H "Authorization: Bearer <jwt>" \
  -H "workspace-id: workspace_corp_alpha" \
  -H "Content-Type: application/json" \
  -d '{"callbackUrl":"http://localhost:5000/api/communication/oauth/callback"}'

# List inbox (after OAuth complete)
curl http://localhost:5000/api/communication/inbox?limit=10 \
  -H "Authorization: Bearer <jwt>" \
  -H "workspace-id: workspace_corp_alpha"

# Send an email
curl -X POST http://localhost:5000/api/communication/send \
  -H "Authorization: Bearer <jwt>" \
  -H "workspace-id: workspace_corp_alpha" \
  -H "Content-Type: application/json" \
  -d '{"to":"colleague@example.com","subject":"Test","body":"Hello from FLOW OS"}'

# Sync inbox to RAG pipeline
curl -X POST http://localhost:5000/api/communication/sync \
  -H "Authorization: Bearer <jwt>" \
  -H "workspace-id: workspace_corp_alpha" \
  -H "Content-Type: application/json" \
  -d '{"limit":25,"q":"is:unread"}'
```

---

```bash
# Initiate Google Calendar OAuth for a workspace (returns consent URL)
curl -X POST http://localhost:5001/api/connectors/google-calendar/auth/initiate \
  -H "Authorization: Bearer <jwt>" \
  -H "workspace-id: workspace_corp_alpha" \
  -H "Content-Type: application/json" \
  -d '{"callbackUrl":"http://localhost:5001/api/meetings/oauth/callback"}'

# List upcoming meetings (after OAuth complete)
curl "http://localhost:5001/api/meetings/upcoming?days=7&limit=20" \
  -H "Authorization: Bearer <jwt>" \
  -H "workspace-id: workspace_corp_alpha"

# Get AI meeting prep context
curl "http://localhost:5001/api/meetings/event/<eventId>/context" \
  -H "Authorization: Bearer <jwt>" \
  -H "workspace-id: workspace_corp_alpha"

# Create a meeting
curl -X POST http://localhost:5001/api/meetings/create \
  -H "Authorization: Bearer <jwt>" \
  -H "workspace-id: workspace_corp_alpha" \
  -H "Content-Type: application/json" \
  -d '{"title":"Q3 Planning","startTime":"2026-07-01T10:00:00Z","endTime":"2026-07-01T11:00:00Z","videoConference":true}'

# Store action items on a meeting
curl -X POST "http://localhost:5001/api/meetings/event/<eventId>/actions" \
  -H "Authorization: Bearer <jwt>" \
  -H "workspace-id: workspace_corp_alpha" \
  -H "Content-Type: application/json" \
  -d '{"actions":[{"text":"Prepare rollback scripts","owner":"David O.","deadline":"Friday"}]}'

# Sync upcoming meetings to RAG pipeline
curl -X POST http://localhost:5001/api/meetings/sync \
  -H "Authorization: Bearer <jwt>" \
  -H "workspace-id: workspace_corp_alpha" \
  -H "Content-Type: application/json" \
  -d '{"days":7}'
```

---

```bash
# Store GitHub PAT for a workspace (Engineering Capability)
curl -X POST http://localhost:5000/api/engineering/auth \
  -H "Authorization: Bearer <jwt>" \
  -H "workspace-id: workspace_corp_alpha" \
  -H "Content-Type: application/json" \
  -d '{"token":"ghp_your_personal_access_token"}'

# List repositories
curl http://localhost:5000/api/engineering/repos \
  -H "Authorization: Bearer <jwt>" \
  -H "workspace-id: workspace_corp_alpha"

# List open pull requests for a repo
curl "http://localhost:5000/api/engineering/repos/myorg/myrepo/pulls?state=open" \
  -H "Authorization: Bearer <jwt>" \
  -H "workspace-id: workspace_corp_alpha"

# Get single PR with merge readiness score
curl http://localhost:5000/api/engineering/repos/myorg/myrepo/pulls/42 \
  -H "Authorization: Bearer <jwt>" \
  -H "workspace-id: workspace_corp_alpha"

# Compare two branches
curl "http://localhost:5000/api/engineering/repos/myorg/myrepo/compare?base=main&head=feature/new-ui" \
  -H "Authorization: Bearer <jwt>" \
  -H "workspace-id: workspace_corp_alpha"

# Sync PRs + commits to ingestion pipeline
curl -X POST http://localhost:5000/api/engineering/sync \
  -H "Authorization: Bearer <jwt>" \
  -H "workspace-id: workspace_corp_alpha" \
  -H "Content-Type: application/json" \
  -d '{"owner":"myorg","repo":"myrepo","limit":20}'

# Merge a pull request
curl -X POST http://localhost:5000/api/engineering/repos/myorg/myrepo/pulls/42/merge \
  -H "Authorization: Bearer <jwt>" \
  -H "workspace-id: workspace_corp_alpha" \
  -H "Content-Type: application/json" \
  -d '{"mergeMethod":"squash","commitTitle":"feat: squash merge PR #42"}'
```

---

## 13. Phase 7.0 — Autonomous Operational Brain

> Full reference: [`docs/PHASE7_OPERATIONAL_BRAIN.md`](docs/PHASE7_OPERATIONAL_BRAIN.md)

An orchestration layer that reasons across all capabilities, produces explainable recommendations, executes governed automations, tracks goals, and exposes a unified executive experience. Delivered in four reviewed milestones (M1 Foundation, M2 Reasoning, M3 Decision & Execution, M4 Experience).

### Backend services (`src/services/`)
- `orgMemoryService.js` — durable decision/incident/event memory (PostgreSQL via Prisma).
- `operationalGraphService.js` — PostgreSQL operational graph; node ids namespaced `${workspaceId}:${rawId}`; bounded BFS `getRelatedContext`, `getNeighbors`.
- `briefingEngine.js` — `generateBriefing(workspaceId, orgId, role)`; role-aware, evidence-cited; Gemini + fallback.
- `copilotService.js` — `answerCopilotQuery(workspaceId, { question, pageContext, entityId })`; RAG + graph; Gemini + heuristic fallback.
- `decisionEngine.js` — first-class structured decisions (`createDecision`, `listDecisions`, `updateDecision`, `fromRecommendation`).
- `automationEngine.js` — governed multi-step workflows; every step via `executeAction()`; runs as fixed `MEMBER` actor; eventBus subscribers (no `CONNECTOR_ACTION_EXECUTED` to avoid loops).
- `goalTrackingService.js` — OKR goals + milestones + `evaluateGoal` (risks/blockers/predicted completion).
- `brainTimelineService.js` — `getOperationalTimeline` (memory + automation runs + connector timeline) + `getEntityContext` (graph neighbours grouped by type).

### Brain API — `src/routes/brainRoutes.js`, mounted at `/api/brain`
briefing · copilot · recommendations(+execute) · decisions · automations(ADMIN+ to mutate) · goals(+milestones+evaluate) · timeline · context/:entityId · memory · graph. All JWT + `workspace-id` scoped.

### Prisma (Phase 7 models)
`OrgMemoryRecord`, `GraphNode`, `GraphEdge`, `Goal`, `GoalMilestone`, `AutomationRule`, `AutomationRun`, `Briefing`, `BriefingRecommendation`, `CopilotConversation`, `CopilotMessage`. Migrations are hand-crafted SQL under `prisma/migrations/20260628*_phase7_brain*` — apply with `psql -f` (do NOT `prisma migrate dev`), then `npx prisma generate`.

### Frontend (`flow-os-frontend/src/`)
- `lib/brainApi.js` — central brain API client (auth from localStorage).
- `components/ui/AICopilot.jsx` — global floating, page + entity aware (mounted in LayoutShell).
- `components/company/ExecutiveDashboard.jsx` (`/dashboard`), `components/workspace/DailyBriefing.jsx` (`/briefing`), `components/workspace/OperationalTimeline.jsx` (`/timeline`), `components/platform/ImportDashboard.jsx` (`/platform/import`), `components/platform/OnboardingWizard.jsx` (`/platform/onboarding`), `components/platform/WorkspaceHealth.jsx` (`/platform/health`).
- `components/ui/CommandPalette.jsx` — ⌘K, brain RAG + nav commands.
- `components/workspace/EntityContextPanel.jsx` + `EntityWorkspace.jsx` (`/entity/:id`) + `lib/entityContext.js` — Cross-Capability Workspace.
- `components/ui/ErrorBoundary.jsx` — top-level graceful degradation.

### Governance invariants (do not regress)
Automation never bypasses governance; automation actor role is fixed `MEMBER` (rule data cannot escalate); automation rule create/toggle/delete require ADMIN/OWNER and verify workspace ownership; `CONNECTOR_ACTION_EXECUTED` is never an automation trigger.

---

## 14. Workspace Lifecycle Engine

The Workspace Lifecycle Engine (WLE) is a manifest-driven, plugin-extensible pipeline that replaces the earlier demo-specific import logic. It bootstraps, imports, synchronizes, and refreshes FLOW OS workspaces through a configurable sequence of pipeline stages, persists durable `ImportRecord` rows in PostgreSQL, and streams progress over WebSocket.

Full reference: [`docs/WORKSPACE_LIFECYCLE_ENGINE.md`](docs/WORKSPACE_LIFECYCLE_ENGINE.md)

### File map

| File | Description |
|------|-------------|
| `src/core/workspaceLifecycle/datasetRegistry.js` | Map-backed plugin registry: `registerDatasetType()`, `getDatasetHandler()`, `getSupportedTypes()`, `hasDatasetType()` |
| `src/core/workspaceLifecycle/datasets/builtinTypes.js` | Registers all 23 built-in dataset types as a side-effect; exports factory helpers `makeValidator`, `makeVectorizer`, `makeResolver`, `identity`, `noGraph`, `noVector` |
| `src/core/workspaceLifecycle/datasets/index.js` | Re-exports builtinTypes as a side-effect import; this is the file server.js imports to trigger registration |
| `src/core/workspaceLifecycle/manifestParser.js` | `parseManifest(raw)`, `getCompatibilityStatus(schemaVersion)`; constants `ENGINE_VERSION = '2.0'`, `SCHEMA_VERSION_FLOOR = '1.0'` |
| `src/core/workspaceLifecycle/pipelineStages.js` | 10 exported named async functions, one per pipeline stage |
| `src/core/workspaceLifecycle/lifecycleEngine.js` | `runLifecycleOperation(operation, workspaceId, { manifest, datasets })`, `validateOnly(workspaceId, { manifest, datasets })`; OPERATION_STAGES map; FATAL_STAGES: stageValidate + stageBootstrapWorkspace |
| `src/routes/lifecycleRoutes.js` | 7 routes at `/api/lifecycle/*` |

### Operations

| Operation | Stages | Notes |
|-----------|--------|-------|
| CREATE | 10 | Full bootstrap: org + workspace + users + graph + memory + vectors + copilot warmup |
| IMPORT | 9 | Same as CREATE without copilot warmup |
| SYNC | 7 | Incremental update; skips workspace bootstrap and briefings |
| REFRESH | 4 | Re-derives intelligence from existing data; no manifest required |
| VALIDATE | 1 | Dry-run only; no DB writes |

### Dataset type registry — registering a new type

Add one call to `src/core/workspaceLifecycle/datasets/builtinTypes.js`:

```js
registerDatasetType({
  type: 'contracts',
  validator: makeValidator(['id', 'title', 'value']),
  normalizer: identity,
  resolver: makeResolver('CONTRACT', [
    rec => rec.customerId ? { sourceId: String(rec.id), targetId: String(rec.customerId), type: 'BELONGS_TO' } : null,
  ]),
  vectorizer: makeVectorizer('contracts', ['title', 'description']),
  graphBuilder: makeResolver('CONTRACT', []),
});
```

No other files need to change. The new type appears immediately in `GET /api/lifecycle/schema`.

### 23 built-in dataset types

`summary` · `company` · `employees` · `departments` · `projects` · `customers` · `vendors` · `repositories` · `commits` · `pull_requests` · `jira_issues` · `emails` · `slack_threads` · `calendar_events` · `meetings` · `meeting_transcripts` · `incidents` · `documents` · `timeline` · `memory` · `executive_reports` · `knowledgeGraph` · `permissions`

### API endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/lifecycle/create` | Full workspace bootstrap (10 stages) |
| POST | `/api/lifecycle/import` | Import into existing or new workspace (9 stages) |
| POST | `/api/lifecycle/sync` | Incremental data update (7 stages) |
| POST | `/api/lifecycle/refresh` | Re-derive intelligence, no manifest needed (4 stages) |
| POST | `/api/lifecycle/validate` | Dry-run validation, no DB writes |
| GET | `/api/lifecycle/history` | Last 50 ImportRecords for the workspace |
| GET | `/api/lifecycle/schema` | Supported types, engine version, operations list |

### WebSocket events

`LIFECYCLE_STARTED` · `LIFECYCLE_STAGE_STARTED` · `LIFECYCLE_STAGE_COMPLETED` · `LIFECYCLE_STAGE_FAILED` · `LIFECYCLE_COMPLETED` · `LIFECYCLE_FAILED`

All events carry `importId` and are broadcast to the workspace WebSocket channel.

---

## 15. Unified Event Platform (Phase 11.0)

> Full reference: [`docs/UNIFIED_EVENT_PLATFORM.md`](docs/UNIFIED_EVENT_PLATFORM.md)

The single canonical event pipeline for FLOW at `src/events/`. Every activity from
every connector becomes one normalized **FLOW Event**; every intelligence module
subscribes independently. Consolidates (not rewrites) the Phase 9.4 intelligence
engines and Phase 10.3 webhook parsing — both are reused as internals.

**Producers publish only via `src/events`:** `publish(source, rawType, payload, ctx)`,
`publishFields(fields)`, `publishWebhook(whEvent)`. Migrated: ingestion worker,
webhook worker, connector-action governance subscriber.

**Consumers subscribe only via `src/events`:** `subscribe(name, filter, handler, opts)`.
Built-ins (`builtinSubscribers.js`): timeline, feed, memory (durable), notify,
brain (urgent → RAG ingestion), recommendation.

**Pipeline (`EventBus.publish`):** validate → correlate → durable append → route → legacy mirror.
- Durable store: PostgreSQL `flow_events` (+ `flow_event_deliveries`). Migration:
  `scripts/migrate-event-platform-v11-0.sql`. Idempotent via `ON CONFLICT DO NOTHING`
  on PK + `(workspace_id, connector, source_event_id)`.
- `EventRouter` fan-out is fault-isolated with retry/backoff → dead-letter; every
  outcome recorded per subscriber.
- Replay (`EventReplay`), search (`EventSearch`), metrics (`EventMetrics`), retention
  (`EventRetention`), schema/versioning (`EventSchemaRegistry`/`EventVersioning`).

**Invariants (do not regress):** exactly-one bus, one normalizer, one router, one
correlation path. Tenant isolation on every read (`workspace_id` mandatory). Brain
subscriber never re-enqueues `metadata.origin === 'ingestion'` or `replayed` events
(loop prevention). The bare `core/events/eventBus` EventEmitter is the internal
in-process primitive only.

**Adding a connector = OAuth → Sync → normalize (publish).** Nothing else.

**REST:** `/api/events/*` (feed, timeline, stats, metrics, search, event/:id, replay [ADMIN+], ingest).
**Admin:** Event Inspector at `/event-inspector` (dev only, 404 in prod; OWNER/ADMIN JWT + workspace-id).
**Deprecated shims (one release):** `services/events/EventPipeline.js`,
`services/webhooks/EventBroadcaster.js` forward into `src/events`.
**Validation:** `scripts/validate-event-platform.js` (13/13), `scripts/loadtest-event-platform.js`
(14/14 at 100k). Integration suite unchanged: 284 pass / 0 fail.

---

## 16. Operational Graph Engine — Digital Twin (Phase 11.1)

> Full reference: [`docs/OPERATIONAL_GRAPH_ENGINE.md`](docs/OPERATIONAL_GRAPH_ENGINE.md)

The company's Digital Twin at `src/graph/`. Every object is a node, every
relationship an edge (21 node types, 19 edge types). Built on the existing Phase 7
Postgres `graph_nodes`/`graph_edges` (extended in v11.1), populated in real time by
a single `graph` subscriber on the Phase 11.0 event bus — never polled, never rebuilt.

**Population:** the `graph` subscriber (durable) calls `GraphEngine.applyEvent` →
`GraphSchema.deriveGraph(event)` → Node/Edge bulk upsert. Single writer (the old
priority-gated graph writes in `EventMemoryService` were removed). Adding a
connector needs zero graph code — publishing FLOW events is enough.

**Node ids:** `${workspaceId}:type:connector:key`. People/customers use a shared
`people`/`customer` namespace (one node across connectors); connector-native
objects keep their connector.

**Traversal:** bounded iterative BFS (NOT recursive CTE — that explodes on dense
hubs: 38s → 30ms). Per-hop indexed query, frontier cap 400, node cap 1000.
neighbors · k-hop · shortestPath · dependencyChain · impactPath · temporal.

**Analysis:** ImpactAnalyzer (blast radius), DependencyAnalyzer (+orphans/stale),
RelationshipScorer (strength = weight×ln(1+obs)×recency; whoKnows, topCollaborators).

**REST:** `/api/graph/*` (JWT + workspace-id). **Admin viz:** `/graph-explorer`
(dev-only 404 in prod, OWNER/ADMIN JWT + workspace-id; force-directed SVG, search,
expand, path/impact/dependency highlight, temporal filter).

**Migration:** `scripts/migrate-graph-engine-v11-1.sql` (additive: edge
`observation_count`/`last_observed_at`, node `last_observed_at`, traversal indexes)
+ `prisma generate` (NOT migrate dev).

**Invariants:** one graph, one writer; tenant isolation on every read
(`workspace_id` mandatory); graph subscriber never publishes events (no loop).

**Validation:** `scripts/validate-graph-engine.js` (16/16), `scripts/validate-demo-twin.js`
(13/13 — Helios twin: 4,420 nodes / 26,636 edges, traversal <35ms). Integration
suite unchanged (284/0). `--keep` leaves a `demo-twin` workspace for the Explorer.

**Note:** graph edges need `gen_random_uuid()::text` id in raw inserts (Prisma
`cuid()` is app-side only). See TD-OG-01 for the `testContext` helper bug.

---

## 17. Explainable Intelligence Engine — XAI (Phase 11.2)

> Full reference: [`docs/EXPLAINABLE_INTELLIGENCE.md`](docs/EXPLAINABLE_INTELLIGENCE.md)

`src/explainability/` wraps any AI output into a standard **explanation envelope**
so every answer can be understood, verified, and challenged. Consolidates (does
not duplicate) the Phase 9.1 reasoning pipeline, CriticAgent contradictions,
Operational Graph (11.1), and Event Platform (11.0).

**Envelope:** executive summary · evidence · reasoning trace + decision tree ·
6-dim confidence · source attribution · missing information · contradictions ·
alternatives · business impact (6 dims) · recommended actions · trust · graph.

**Confidence (6 real-signal dims, never LLM self-report):** data freshness
(evidence ts), evidence quality (rank×authority×diversity), relationship
confidence (graph edge strength/11.1), reasoning confidence (9.1 ConfidenceScorer +
verifier), connector health (Phase 10 `connector_credentials.health_status`), overall.

**Trust ≠ confidence:** trust starts from confidence, rewards corroboration
(diverse/fresh sources), penalizes contradictions/insufficiency/failed verification.
Contradictions are surfaced (opposing-claims scan + pipeline flags), never hidden.
Missing evidence is declared honestly ("There isn't enough evidence…").

**API:** `explain(output, ctx)` · `explainQuestion(ws, question, opts)` (runs
Operational Brain → explains) · `answerFollowUp(explanation, type)` for
why/how/what_evidence/who_said/what_changed/why_now/what_missing/why_recommendation.
`explain()` normalizes both the Brain shape (evidence is an OBJECT with `.primary`)
and lighter shapes (evidence is an ARRAY) — the distinction gates normalization.

**Validation:** `scripts/validate-explainability.js` (16/16 across 8 domains —
meetings surfaces the deploy contradiction, knowledge declares insufficient
evidence, graph domains carry relationship/impact). Integration suite unchanged (284/0).

**M2 (done):** `/api/explain` (`POST /` explain output or reason+explain · `POST /followup`
· `GET /types`) + opt-in `explain:true` pass-through on `/api/brain/reason` and
`/api/brain/copilot` (off by default — explanation cost only when asked). Route
wiring validated 8/8; integration suite unchanged (284/0).

---

## 18. Workspace Replay Engine — DVR (Phase 11.3)

> Full reference: [`docs/WORKSPACE_REPLAY_ENGINE.md`](docs/WORKSPACE_REPLAY_ENGINE.md)

`src/replay/` is a **read-only DVR** over the Unified Event Platform (11.0). Reads
only `flow_events` (via `queryEvents`/`search`); computes snapshots on the fly —
**no duplicate storage**. Distinct from the platform's `EventReplay` (which
re-delivers events to subscribers); this engine replays history for humans.

**10 modules:** ReplayFilters (scope→filter), ReplayBuilder (ordered stream,
paginated at 1000/query — EventStore.query caps pages at 1000), ReplayTimeline
(hour/day/week frames), ReplaySnapshots (state as-of-T via **SQL aggregates**,
NOT the graph — graph only holds current last_observed_at), ReplayDiffEngine
(added/removed/changed/resolved/escalated), ReplayNavigator (markers/seek/step),
ReplayPlayer (stateless playback logic — frameAt/cursorView/playbackPlan),
ReplayMetrics (velocity/MTTR/deploy freq), ReplayExport (JSON/markdown narrative),
ReplayEngine (orchestrator).

**7 modes:** TIMELINE · INCIDENT (correlation chain + MTTR) · CUSTOMER_JOURNEY
(text focus) · ENGINEERING · MEETING · EXECUTIVE (importance≥0.6) · KNOWLEDGE.

**Snapshots/diff:** `snapshotCompare(ws, t1, t2)` → before/after/diff (Monday vs
Friday, before/after incident/deployment). Player: stateless windowed (client
drives; step/jump = re-query; speed/pause client-side).

**Validation:** `scripts/validate-replay-engine.js` 12/12 at **100k events** —
full 30-day replay ~2.1s, snapshot ~120ms (flat vs scale), diff ~147ms, incident
MTTR 48h. Integration suite unchanged (284/0).

**M2 (done):** `/api/replay/*` REST (modes · replay · snapshot · compare · export
json/markdown) + Replay Player admin page (`/replay-player`, prod-blocked, ADMIN+ —
timeline density track, play/pause/step/jump-to-marker/speed, mode+filter controls,
frame panel, metrics; client-driven playback, no server session). Wiring validated
11/11; integration suite unchanged (284/0).

---

## 19. What-If Simulation Engine (Phase 11.4)

> Full reference: [`docs/SIMULATION_ENGINE.md`](docs/SIMULATION_ENGINE.md)

`src/simulation/` — a decision-support engine that simulates hypothetical changes
before acting ("what if Rahul resigns / payments goes down / Acme churns / Release
4.2 slips"). **Consumes, never mocks**: cascading impact from the Operational
Graph (11.1), evidence from replayed history (11.0/11.3), analogues from memory,
and the explanation from the XAI layer (11.2).

**Pipeline:** ScenarioBuilder (11 types + heuristic NL classify + entity resolve
via searchNodes) → Validator → Planner (per-type analysis plan) → Runner (REAL
graph traversal `analyzeImpact`/`dependencyChain`/`neighbors`/bus-factor + replay +
memory) → ImpactEstimator (6 impacts + knowledge loss + heuristic financial) →
RiskCalculator (weighted × likelihood × criticality) → MitigationPlanner (grounded
actions) → SimulationReporter (12-field output + `explain()` envelope) →
SimulationMemory (persist as `MemoryRecordType.SIMULATION`).

**11 scenario types:** EMPLOYEE_DEPARTURE, SERVICE_OUTAGE, REPOSITORY_LOSS,
RELEASE_SLIP, DEPLOYMENT_POSTPONE, CUSTOMER_CHURN, PROJECT_CANCEL,
INTEGRATION_OUTAGE, MEETING_CANCEL, TEAM_MERGE, HIRING(abstract).

**API:** `simulate(ws, {type|question, targetEntityId|targetName, params})`,
`compare(ws, a, b)`. Financial = explicitly heuristic (ARR / replacement cost /
$/hr downtime / $/week delay) with stated basis + assumptions.

**Migration:** `scripts/migrate-simulation-v11-4.sql` adds `SIMULATION` to the
`MemoryRecordType` enum (+ `prisma generate`).

**Validation:** `scripts/validate-simulation-engine.js` 14/14 — seeds a twin via
events, runs all 7 scenarios (departure detects 8 owned assets / 8 bus-factor;
outage cascade 10 nodes; churn $60k heuristic; comparison + memory reuse).
Integration suite unchanged (284/0).

**Gotcha:** calendar attendees must carry an email or be strings — an object
`{name}` without email slugs to a bogus `object-object` employee node (9.4
normalizer `id = a.email || a`).

**M2 (done):** `/api/simulation/*` REST (types · run · compare — distinct from the
legacy `/api/test/simulate`) + Simulation Workspace admin UI (`/simulation-workspace`,
prod-blocked, ADMIN+ — scenario builder, risk gauge, impact bars, drivers, actions,
A/B compare). Wiring validated 9/9 (incl. NL "what if Alice resigns?" → EMPLOYEE_DEPARTURE);
integration suite unchanged (284/0).

---

## 20. Predictive Workspace Intelligence (Phase 11.5)

> Full reference: [`docs/PREDICTIVE_WORKSPACE_INTELLIGENCE.md`](docs/PREDICTIVE_WORKSPACE_INTELLIGENCE.md)

`src/predictions/` — "what is likely to happen next?" across engineering, people,
customers, operations (~22 deterministic types). **No ML, no invented scores**:
every probability is a bounded function of real signals from the Operational Graph,
event/replay trends, patterns, simulations (11.4), memory, and workspace health.
**Replaces** the former mock `operationalIntelligenceService.generatePredictions()`
(now delegates to this engine, mapped to the legacy shape; callers must `await`).

**Pipeline:** PredictionPipeline.buildContext (one shared 60d context) → PredictionModels
(registry, each `run(ctx)→{probability,trend,drivers,evidence}`) → RiskScorer →
ConfidenceEstimator → RecommendationGenerator → PredictionReporter (8-field + inline
explanation) → PredictionEngine (sort, topRisks, persist history). Helpers:
TrendAnalyzer (recent-vs-prior), PatternDetector (deploy→incident), AnomalyPredictor
(z-score baseline), ForecastEngine (linear projection).

**Output:** prediction · probability · confidence · time horizon · evidence · trend ·
business impact · preventive actions · explanation (why/evidence/historical/confidence/
missing/alternatives).

**API:** `predict(ws, {domain?/types?})`, `predictOne(ws, type)`, `getHistory(ws)`.
Persists runs as `MemoryRecordType.PREDICTION` (migration `scripts/migrate-predictions-v11-5.sql`
+ `prisma generate`).

**Validation:** `scripts/validate-prediction-engine.js` 20/20 — seeds real trends,
7 required predictions reflect the signal (sprint delay 83% falling, incidents 67%
rising, knowledge loss 100% sim-backed, churn 87%, ownership 100%, meeting overload
50%, deploy 48%); ~22 predictions in ~50ms; low-signal → honest low confidence.
Integration suite unchanged (284/0).

**Gotcha:** event platform dedups on `(workspace, connector, source_event_id)` — a
source reusing one id for repeated updates collapses to one event (found via a
customer-journey seed). Emit distinct event ids per state change.

**M2 (done):** `/api/predictions/*` REST (types · run · history · :type) + Prediction
Workspace UI (`/prediction-workspace`, prod-blocked, ADMIN+ — risk timeline, forecast
cards, history) + **proactive worker** (`predictionWorker`, BullMQ cron `PREDICTION_CRON`
default 6h → recompute active workspaces, push `PREDICTION_WARNING` over WebSocket for
risk ≥ `PREDICTION_WARN_THRESHOLD` default 65). Wiring validated 9/9; integration 284/0.

---

## 21. Production Hardening (Phase 12)

> Full reference: [`docs/DEPLOYMENT_GUIDE.md`](docs/DEPLOYMENT_GUIDE.md) (M1). No new AI/intelligence — reliability/perf/security/observability only. 3 milestones: M1 runtime & deployment, M2 security audit + observability, M3 perf/DR/code-quality/docs.

### Milestone 1 — Runtime hardening & deployment (done, 2026-07-11)
- **Docker:** multi-stage `Dockerfile` (node:20-slim, non-root, prisma generate in builder, HEALTHCHECK), `docker-compose.yml` (app + pgvector pg16 + redis7, healthchecks, depends_on service_healthy), `.dockerignore`.
- **Probes:** `/health/live` (liveness), `/health/ready` (readiness — pg+redis, 503 during shutdown), `/metrics/infra` (pool/redis/queues/memory). Existing `/health` kept.
- **Graceful shutdown:** `src/core/lifecycle/gracefulShutdown.js` — SIGTERM/SIGINT drains http → workers → pg pool → redis, 15s hard timeout; unhandledRejection/uncaughtException handlers. Wired in server boot.
- **API middleware:** `compression` (gzip), request timeout (`REQUEST_TIMEOUT_MS`, SSE-excluded), enhanced correlation ID (`req.id` + echoed `x-request-id`). Security headers already present.
- **DB:** `config/db.js` — timed query wrapper + slow-query log (`SLOW_QUERY_MS`), `poolStats()`; **removed `process.exit(-1)` on transient pool errors** (was a crash risk).
- **Redis:** `config/redis.js` — unified on `REDIS_URL`, `retryStrategy` + `reconnectOnError`, `redisHealth()`.
- **Queues:** `src/core/monitoring/queueMetrics.js` — job counts for all 6 BullMQ queues.
- **CRITICAL BOOT FIX:** `BaseAdapter` unconditionally assigned `this.supportedActions`, which threw for `SlackAdapter` (read-only getter) → **server crashed at boot under strict ESM**. Fixed `BaseAdapter` to skip assignment when a subclass exposes a getter (`_hasGetterOnly`). This un-SKIP'd 23 connector tests (all pass) → integration suite **284→307 pass, 0 fail**. Also fixed 3 never-validated PermissionsSuite assertions (read `capability`/`supportedActions`, health vocab HEALTHY/DEGRADED/DOWN).
- **Validation:** in-process probe 7/7 (boot, probes, correlation, infra metrics, headers, gzip). Integration **307 PASS / 0 FAIL**.

### Milestone 2 — Security, Observability & Operations (done, 2026-07-11)
- **Security audit** → `docs/SECURITY_AUDIT.md` (25 domains, scorecard, findings w/ risk/impact/files/mitigation/status). Overall STRONG. **HIGH-1 fixed:** WebSocket connections were unauthenticated (any client with `?workspaceId=` got that tenant's stream) → `socketService.authenticateSocket()` now verifies JWT + org-owns-workspace (query `?token=`/Bearer); enforced in prod / `WS_AUTH_REQUIRED=true`, dev warn-only. Others mitigated/accepted (rate-limit per-instance MED-1/TD-10, CORS dev-'*' MED-2/TD-04, vault workspaceId path LOW-1). Verified OK: parameterized SQL, no command-injection, SSRF-safe crawler, JWT-header (CSRF N/A), admin pages escape + prod-404.
- **Observability:** `src/core/monitoring/metricsAggregator.js` (process/cpu/mem, db pool, redis, 6 queues, event platform, engines, connectors, websocket), `engineMetrics.js` (prediction/simulation run counters — instrumented in those engines), `alerts.js` (rule eval). `GET /api/metrics` + `/api/metrics/alerts` (self-guarded ADMIN JWT or `METRICS_TOKEN`, all envs). `GET /metrics/infra` (open, infra-only).
- **Structured logging:** `logger` gained recursive **secret redaction** (`redact()` — token/password/secret/authorization/apikey/jwt/cookie/pii → `[REDACTED]`) + `channel`. `requestLogger` middleware logs each request (requestId/method/path/status/durationMs/workspaceId/userId; 5xx→error, 4xx/slow→warn). `LOG_FORMAT=json` for pipelines.
- **Monitoring dashboard:** `/monitoring` (dev-only 404 in prod, ADMIN JWT in UI; auto-refresh; consumes `/api/metrics`).
- **Docs:** `OPERATIONS_GUIDE.md`, `OBSERVABILITY_GUIDE.md`, `MONITORING_REFERENCE.md`, `SECURITY_AUDIT.md`.
- **Validation:** observability probe 6/6 (redaction, metrics auth/aggregate/rbac, alerts, dashboard). Integration **307 PASS / 0 FAIL**.

### Milestone 3 — Performance, DR & Code Quality (done, 2026-07-11)
- **Performance:** `scripts/benchmark-suite.js` → `docs/PERFORMANCE_REPORT.md`. Engine reads single-digit ms (event publish 3ms, graph traverse/impact 2ms, neighbors 1ms, search 1ms, timeline 3ms); prediction full-run ~345ms; simulation ~11ms. Scale: 100k store ~22.8k/s, replay 100k ~2.1s, snapshot ~120ms. **Finding:** aggregate reads (`metrics()`=5 queries) pool-bound at 1000-concurrent (~12s) — mitigate via cache/read-replica/gateway. Slow-query logger fired during the run (observability validated).
- **DR:** `docs/BACKUP_RECOVERY.md` (pg_dump + PITR, Redis AOF/rebuild, region-loss DR runbook w/ RPO/RTO, worker recovery, forward-only rollback, backup verification).
- **Code quality:** large files mostly dev-only/cohesive; boot succeeds (no fatal cycles; lazy dynamic imports break cycles); **fixed** the one request-path blocking read (`lifecycleRoutes` → async `fs/promises`). Rest tracked (TD-01 in-memory growth, TD-07 dup embedding).
- **Docs:** `PRODUCTION_HARDENING.md` (umbrella + readiness checklist + TD table), `PERFORMANCE_REPORT.md`, `BACKUP_RECOVERY.md`.
- **Validation:** server boots clean; benchmark suite ran; integration **307 PASS / 0 FAIL**.

**Phase 12 COMPLETE.** Set per-env before deploy: `WS_AUTH_REQUIRED=true`, `CORS_ORIGIN`, gateway rate limiting, backup schedule + PITR, log/metric shipping.

---

## 22. Integration Permissions (Phase 13.1)

> Full reference: [`docs/INTEGRATION_PERMISSIONS.md`](docs/INTEGRATION_PERMISSIONS.md)

**OAuth authenticates. Integration Permissions decide what FLOW is allowed to
understand.** A resource that is not explicitly allowed is never ingested — not
queued, not stored, not embedded, not graphed, not replayed, not predicted. It is
refused at the door.

`src/core/governance/integrationPermissions/`: `resourceTypes` (taxonomy) ·
`resourceDiscovery` (real provider APIs) · `resourceKeyExtractor` (sync item /
webhook payload → governing resource) · `permissionStore` (Prisma + 60s cache,
same shape as `policyStore`) · `permissionGate` (the chokepoint) · `discoveryService`.

**Governed connectors (6 — the ones with a sync adapter):** slack (channel /
private_channel / group) · github (organization / repository) · gmail (label) ·
google-calendar (calendar) · notion (page / database) · jira (project). Teams,
SharePoint, OneDrive, Dropbox, Drive, Confluence render as disabled cards — **no
fabricated resources.**

**Enforcement — every door is gated (this is the invariant; do not regress):**
| Door | Where | Note |
|---|---|---|
| Sync | `SyncEngine.runSync` | `filterItems()` runs **before dedup** — blocked items leave no trace anywhere |
| Webhooks | `WebhookProcessor.processWebhookRequest` | gate runs **before persistence** — `webhook_events` stores raw payloads |
| Capability sync routes | `GitHubAdapter` / `GmailAdapter` / `GoogleCalendarAdapter` | `403 RESOURCE_NOT_PERMITTED` |
| Legacy Google | `gmailInboundService`, `calendarIntegration` | per message / per calendar |

**Decision order:** not-governed → ALLOW · legacy-grandfathered → ALLOW ·
unattributable → **DENY** (never fail open) · Slack DM → `dmPolicy` · any candidate
allowed → ALLOW (any-of) · unknown → `autoAllowNew ? ALLOW : DENY` · else DENY.

**Grandfathering (non-breaking deploy):** the migration flags every
`(workspace, connector)` with existing sync history as `legacy_grandfathered`; the
gate passes its traffic and the UI shows **Ungoverned**. The first discovery seeds
that catalog as *allowed* (preserving existing access) and clears the flag — after
which deny-by-default governs.

**Adapter changes made to close attribution gaps:** Gmail threads now carry
`labels` (union of message labelIds); Jira comments carry `project`;
CalendarSyncAdapter fans out over **allowed calendars** (per-calendar sync-token
map, back-compatible) instead of hardcoding `primary`.

**Migration:** `scripts/migrate-integration-permissions-v13.sql` (idempotent;
guarded on table existence) + `npx prisma generate` (NOT `prisma migrate dev`).

**UI:** `/settings/permissions` — overview cards, per-connector search/filter/tree,
bulk actions, Slack DM policy, auto-allow toggle, sticky save bar.

**Validation:** `scripts/validate-integration-permissions.js` — **40/40** (deny-by-
default, re-discovery preserves decisions, all 4 DM policies, per-connector
attribution with real adapter item shapes, webhook door, capability door,
grandfathering handoff).

---

## 22. Operational Execution Engine (Phase 14)

> FLOW becomes an **AI Operations Platform**: it safely coordinates work, executes
> approved actions, notifies the right people, and keeps a complete operational
> history. Full refs: `docs/EXECUTION_ENGINE.md`, `docs/APPROVAL_ENGINE.md`,
> `docs/MERGE_CONFLICT_INTELLIGENCE.md`, `docs/NOTIFICATION_ENGINE.md`. Design spec:
> `docs/superpowers/specs/2026-07-14-operational-execution-engine-design.md`.

Every layer **consumes** the one beneath — extends `executeAction()` (governed
connector pipeline), governance, approvalStore, event platform, timeline, graph. No
duplication. Governance is never bypassed; a governance `DENY` always wins.

### Pipeline
```
Recommendation → Action Planner → Execution Planner → Approval Engine
  → Governance (existing) → executeAction() (existing) → Connector
  → Audit → Event Platform → Timeline → Graph → Notification Engine
```

### Risk-tiered approval (role-based)
LOW → auto · MEDIUM → requester confirms in FLOW · HIGH → 1×ADMIN/OWNER · CRITICAL →
2×**distinct** ADMIN/OWNER (two-person). `src/execution/riskClassifier.js` +
`approvalEngine.js`; `pending_approvals` gained `risk_level`/`required_approvals`/
`approval_votes` (distinct-approver + self-approval guards).

### Modules
- `src/execution/` — riskClassifier · approvalEngine · actionPlanner · executionPlanner
  (dry-run) · executionCoordinator (orchestration heart) · executionHistory (durable
  `ExecutionRecord`, honest `rollbackAvailable`). REST `/api/execution/*`.
- `src/collaboration/` — mergeConflictDetector (poll-on-sync/on-view;
  mergeable/mergeable_state/checks → events) · ownershipAnalyzer (owners / overlapping
  files / **only the relevant people**) · collaborationDetector (blocked/>48h/stale/
  changes-requested/large-PR/repeat-collision). REST `/api/collaboration/*`.
- `src/notifications/` — notificationTargeting (priority, role recipients, `canSee`
  permission) · notificationEngine (dedupe 6h, persist `notifications`, WS push,
  `notifyMergeConflict`/`notifyApprovalRequired`, `handleEvent` bus glue registered as
  the `flowNotify` builtin subscriber — consolidates Phase 9.4 RealtimeNotificationEngine).
  REST `/api/notifications/*`.
- Frontend: `lib/executionApi.js`; `components/execution/ExecutableActionCard.jsx`
  (risk badge + governed plan→execute, honest CONFIRM/APPROVAL states),
  `MergeConflictCard.jsx` (flagship: files + owners + Open Diff/PR/Message/Create
  Meeting); wired into BrainMessage card types `execute`/`merge_conflict`;
  NotificationDropdown reads `/api/notifications` + `NOTIFICATION_CREATED` WS.

### Migration
`scripts/migrate-execution-engine-v14.sql` (idempotent; adds `execution_records`,
`notifications`, additive `pending_approvals` columns). Apply with `psql -f`, then
`npx prisma generate` (NOT `prisma migrate dev`).

### Invariants (do not regress)
Nothing bypasses `executeAction` governance; risk tier may only be RAISED by policy;
CRITICAL requires two distinct approvers; automation stays fixed-MEMBER; notification
targeting is permission-aware (only relevant people); `rollbackAvailable` is honest.

### Validation
`scripts/validate-execution-engine.js` **26/26** · `validate-collaboration.js` **23/23**
(flagship: Rahul+Kishore on `auth.js` → owners=[rahul,kishore], unrelated excluded) ·
`validate-notification-engine.js` **19/19**. Integration regression steady at **66/74**
(the 8 fails are pre-existing stale tests — signup posts `name` vs required `fullName`;
lifecycle-schema asserts old fields — unrelated to Phase 14).

> **Integration-suite gotcha:** `npm run test:integration` is an HTTP client against a
> LIVE server on `:5001` (not in-process). Start `PORT=5001 node src/server.js` first,
> else ECONNREFUSED → 0/74 (not a regression).

---

*Last updated: 2026-07-14 by Claude (Phase 14 Operational Execution Engine — COMPLETE, M1–M4)*

---

## 23. Multi-Agent Executive Council (Phase 15)

> Six specialized AI executives assess the company, debate the big calls, and produce
> one answer. **Orchestration, not duplication** — every agent's brain is the existing
> Operational Brain (`explainQuestion`); routing reuses `CapabilityPlanner`; actions
> run through the Phase-14 Execution Engine; health reuses health/prediction services.
> Full refs: `docs/MULTI_AGENT_EXECUTIVE_COUNCIL.md`, `EXECUTIVE_ORCHESTRATOR.md`,
> `EXECUTIVE_DASHBOARD.md`. Spec: `docs/superpowers/specs/2026-07-14-multi-agent-executive-council-design.md`.

### Modules (`src/council/`)
- `agents/registry.js` — 6 config-driven COOs (Engineering · Operations · Sales · HR ·
  Security · Finance): `{ id, title, domainPrompt, capabilities, keywords, role }`.
- `agents/ExecutiveAgent.js` — `analyze()` (frames domain question → `explainQuestion` →
  normalized finding) + `healthReport()` (lighter pass for the dashboard). No agent
  reimplements reasoning.
- `router.js` — deterministic routing (keywords + CapabilityPlanner booster; full-council
  fallback when ambiguous).
- `executiveOrchestrator.js` — `askCouncil()`: route → `Promise.allSettled` (fault- AND
  time-isolated via `withTimeout`, `COUNCIL_AGENT_TIMEOUT_MS` default 60 s) → debate →
  synthesis. `askAgent()` for single agent.
- `debateEngine.js` — deterministic disagreement (go/caution polarity by signal count,
  confidence spread) + tradeoffs + **preserved minority opinions**; Security-defers rule.
- `councilSynthesizer.js` — one answer: LLM via `BrainRouter.reason()` (guarded by
  `COUNCIL_SYNTH_TIMEOUT_MS`) with a deterministic structured fallback (house rule 8).
- `confidenceAggregate.js` — mean agent confidence (shared).
- `executiveDashboard.js` — 6 `healthReport()`s in parallel, cached ~10 min → cards.
- REST `src/routes/councilRoutes.js` @ `/api/council/*`: `/ask`, `/dashboard`, `/agents`,
  `/agent/:id`. Council paths excluded from the 30 s request timeout
  (`COUNCIL_REQUEST_TIMEOUT_MS` default 120 s).
- Frontend: `lib/councilApi.js`, `components/council/ExecutiveCouncil.jsx` at `/council`
  (6 health cards + Ask box + debate panel); ⌘K + route added.

### Invariants
No duplicated reasoning/retrieval/execution/health — the council orchestrates existing
systems. Parallelism is fault- and time-isolated (always returns). Actions execute only
through the governed Execution Engine.

### Validation
`scripts/validate-executive-council.js` **23/23** (routing, debate + minority
preservation, synthesis, confidence aggregation, **no-duplication structural asserts**).
Live `/ask` 200 with a real synthesized answer. Integration regression steady **66/74**.

> **Perf (honest):** a single Brain call is ~28–30 s here (the existing
> `/api/brain/copilot` is 28.4 s). The council reuses that Brain, so live throughput is
> Brain-bound — fastest agents answer in-window, slower ones drop gracefully. Speeding up
> the Brain is out of Phase-15 scope.

---

*Last updated: 2026-07-14 by Claude (Phase 15 Multi-Agent Executive Council — COMPLETE, M1–M3)*

---

## 24. Workspace Intelligence Cache (Phase 16.1)

> The caching/serving layer that makes FLOW feel **instant**. Heavy reasoning runs in the
> background; the UI reads one canonical snapshot. **Not a new AI engine** — it aggregates
> existing fast sources. Full ref: `docs/WORKSPACE_INTELLIGENCE_CACHE.md`. Design spec:
> `docs/superpowers/specs/2026-07-14-...` (Phase 16.1).

**`src/workspaceCache/`** — `snapshotBuilder.js` (`buildSnapshot(ws)`: Prediction Engine
11.5 + Health Score + Graph metrics + PG counts → one doc; **never** the Brain/Council;
~140ms cold/13ms warm) · `snapshotStore.js` (in-memory Map sub-ms + Redis write-through
`wic:snapshot:{ws}`) · `refreshCoordinator.js` (`wic` event subscriber → debounced
rebuild; `ensureFresh` cold-read; `warmActiveWorkspaces`) · `index.js`
(`startWorkspaceCache()` = subscriber + boot warm + 5-min cron). Started in server boot.

**Snapshot:** `overall{health,priority,summary,topActions}` + 6 domain cards
(engineering/operations/sales/hr/finance/security, each `{status,score,topRisks,
recommendedActions}`) + `counts`. Domains derived from domain-tagged predictions.

**API `/api/workspace/*`** (instant, never reasons): `/snapshot` (`?force=true`), `/health`,
`/summary`, `/actions`. Cold miss → `{status:'building'}` + async build (never blocks).

**Consumers:** Morning Briefing Executive Summary now reads `/api/workspace/snapshot`
(was the ~90s Executive Council dashboard). Council stays for deep interactive reasoning.

**Perf (measured):** build 140ms/13ms; HTTP read ~5ms warm / 27ms cold (<<100ms target).
**Invariants:** no duplicated logic; reads never build synchronously; tenant-isolated.
**Validation:** `scripts/validate-workspace-cache.js` **14/14**; regression **66/74**.
Env: `WIC_CRON_MS`(300000) · `WIC_DEBOUNCE_MS`(10000) · `WIC_TTL_SECONDS`(3600).

---

## 25. Living Workspace Simulator (Sprint 5)

> Full reference: [`docs/LIVING_WORKSPACE_SIMULATOR.md`](docs/LIVING_WORKSPACE_SIMULATOR.md)

Makes a workspace feel **alive** so FLOW always has coherent, connected work to reason
about (an investor/CTO/pilot forgets it's simulated). **Not random records; not a new
backend** — a *driver* that feeds causal chains into the existing Event Platform (11.0),
Governance approvals (14.0), and Notification Engine (14.3); everything downstream
(graph/memory/timeline/feed/brain/WIC/workday) lights up because it all subscribes to the
one bus. **Dev-only** (404 in prod; OWNER/ADMIN JWT).

`src/simulator/`: `personas.js` (Rahul CTO + 6 colleagues w/ ownership), `scenarios.js`
(5 causal chains — featureShip email→slack→jira→PR→CI→deploy, incident
deploy→incident→postmortem, mergeConflict, customerEscalation, reviewNeeded — each
`publishFields`-emits linked events w/ shared correlationId + plants live approvals/
notifications), `simulatorEngine.js` (`seedHistory(ctx,{days=180})` 6-mo backfill + plant
current work · `tick` · `start/stop` heartbeat gated by `SIMULATOR_ENABLED` +
`SIM_WORKSPACE_ID`, never prod, `SIM_TICK_MS` default 5min).

Coarse event `type` = canonical Event enum; granular kind in `metadata.kind` (else event
validation drops it). Live CTO work attributes to the caller identity so it surfaces to
**NOW** in their workday. **Gotcha: the workspace-id header must be `workspace.externalId`
(what `tenantIsolation` resolves + what every app surface keys by), NOT the Prisma cuid.**

**REST:** `/api/simulator/{seed,tick,status,reset}` (dev-only). **Validation:**
`scripts/validate-simulator.js` **18/18** (DB-backed causal integrity: no orphans,
email→PR + deploy→incident chains, 6-mo spread, targeted notifs, tick adds, reset clean).
Verified live: empty "all clear" morning → **critical** WIC snapshot + NOW workday item
("Merge conflict in flow-backend — Blocking 2 people"). Regression **66/74**.

---

## 26. Pilot Experience Platform (Phase 17)

> Full refs: [`docs/PILOT_EXPERIENCE.md`](docs/PILOT_EXPERIENCE.md),
> [`docs/ONBOARDING_ARCHITECTURE.md`](docs/ONBOARDING_ARCHITECTURE.md),
> [`docs/SUCCESS_METRICS.md`](docs/SUCCESS_METRICS.md)

**Stop building platforms — build a product.** Phase 17 is a *product layer* for the first
paying customer (Rahul, CTO). **Reuse everything** — no new AI/DB/event/reasoning/graph/
execution layer. Onboarding flow: Welcome → Discover → Permissions → Build → Ready (Morning
Brief), each step backed by something that already exists (Integration-Permissions
discovery, deny-by-default gate 13.1, Lifecycle Engine build, WIC + Workday, Simulator demo).

### M1 — Onboarding backend (DONE, 2026-07-16)
- `src/onboarding/onboardingState.js` — per-workspace setup progress in **shared Redis**
  (`onboarding:state:{ws}`, no migration); drives the first-run gate (`completed:false` →
  `/welcome`). Steps: welcome·discover·permissions·build·ready.
- `src/onboarding/discoveryOrchestrator.js` — one call → per-connector discovery. `live`
  reuses `runDiscovery` (unconnected → honest `not_connected`, never fabricated); `demo`
  = deterministic Acme catalog (6 repos/14 channels/2 calendars/Notion/Jira/42 employees).
  Only the 6 governed connectors are discoverable.
- `src/success/{valueModel,successMetrics}.js` — **hybrid** ROI: measured counts from real
  records (execution_records EXECUTED, pending_approvals, notifications, flow_events) +
  transparently **labeled estimates** (Time Saved from conservative minute weights,
  Context Switches = notifs+approvals+tasks). Empty workspace shows zeros (no magical
  numbers); model discloses the estimate basis.
- Routes `/api/onboarding/*` + `/api/success/*` (JWT + workspace-id, tenant-scoped).
- **Validation:** `scripts/validate-pilot-experience.js` **23/23**; regression **66/74**.

### M2 — First-run flow frontend (DONE, 2026-07-16)
- `flow-os-frontend/src/components/onboarding/FirstRunFlow.jsx` — full-screen (overlays
  the shell, `position:fixed inset:0 z-index:4000`), one decision per step:
  Welcome → Discovery (progressive checklist) → Permissions (per-resource toggles) →
  Build (narrated stages, never a spinner) → Ready → Morning Brief. Demo co-primary with
  real connect; demo Build seeds the Living Workspace Simulator.
- `FirstRunGate.jsx` — routes to `/welcome` when onboarding incomplete; **fails open**
  (never traps a session; localStorage `flow_onboarding_complete`/`_dismissed` + "Skip for
  now"). Wired into App.jsx (`/welcome` route + gate inside the shell).
- `lib/onboardingApi.js` — client for `/api/onboarding/*` + `/api/success/*` + demo seed.
- Verified: state machine end-to-end (reset→discover 6/34→permissions→complete→persists);
  frontend build clean (2410 modules); regression **66/74**. Ref `FIRST_TIME_SETUP.md`.

### M3 — Value + Trust + Team (DONE, 2026-07-16)
- `components/success/SuccessDashboard.jsx` (`/success`, sidebar "Value") — hybrid ROI from
  `/api/success/summary`: headline + detail cards each with a measured/estimated **basis
  badge** + "How Time Saved is estimated" disclosure (model transparency). Standalone
  **Load Demo Company** (seeds Simulator).
- `components/ui/TrustBar.jsx` — reusable Track-8 trust strip (connected systems + health
  via `/api/connectors` + `/health`, permissions link, honest "nothing connected" empty).
- `components/onboarding/TeamInvite.jsx` (`/settings/team`) — reuses `POST /api/users/invite`
  + `GET /api/users`; per-role why/what-they-gain; surfaces a generated temp password
  (no email infra — honest). `lib/trustApi.js` client. Routes + sidebar wired.
- Verified: connectors(12)/users(1)/success endpoints return real data; build clean (2414
  modules); regression **66/74**.

### M4 — Polish + measure-success + validation (DONE, 2026-07-16)
- Polish (Track 9): removed dead `ComingSoon` import; normalized "Demo mode" banners →
  honest "Showing sample data — connect X to go live" (CustomerIntelligence,
  WorkforceIntelligence); pilot surfaces use tokens (no raw hex).
- Measure-success (Track 10): `src/onboarding/adoptionMetrics.js` → `GET /api/onboarding/
  metrics` — onboarding timing (time-to-value), connectors/resources discovered, work
  completed inside FLOW (tasks+approvals), time saved. Read-only over onboarding state +
  success summary; no new store.
- **Validation:** `scripts/validate-pilot-experience.js` **28/28** (state machine + gate,
  demo discovery, hybrid + honest-empty success, adoption metrics); frontend build clean
  (2413 modules); regression **66/74**.

**Phase 17 COMPLETE (M1–M4).** A CTO installs FLOW → premium welcome → discovery →
governed permissions → narrated build → live Morning Brief → a **Value** page proving ROI
(honest measured/estimated) → invite team → trust surfaces everywhere.

---

*Last updated: 2026-07-16 by Claude (Phase 17 Pilot Experience — COMPLETE M1–M4, 28/28, 66/74)*

---

## 27. Autonomous Operations (Phase 19)

> Full reference: [`docs/AUTONOMOUS_OPERATIONS.md`](docs/AUTONOMOUS_OPERATIONS.md)

**Mission:** FLOW should help people finish work, not just tell them what's happening.

`src/autonomous/` — thin orchestration layer, no new AI:
- `workflowTemplates.js` — named multi-step workflow registry (6 templates; add by extending TEMPLATES)
- `actionCardService.js` — `buildActionCard(item)` / `buildActionCards(items)` — WorkItem → ActionCard
- `memoryPersonalizer.js` — `getPreferences(workspaceId)` — reads execution_records for preferences
- `chiefOfStaffService.js` — `getChiefOfStaffBriefing(workspaceId, user)` — top-5 NOW items + greeting
- `weeklyReviewService.js` — `getWeeklyReview(workspaceId, {days})` — engineering velocity + execution success + risks

**Signal sources (Workday Engine enhanced):** pending approvals · notifications · predictions · failed executions · connector warnings · incidents

**Frontend:** `ActionCard.jsx` (multi-option, inline execution, risk badges) · `ChiefOfStaff.jsx` (`/chief`) · `WeeklyReview.jsx` (`/review`)

**Routes (`src/routes/phase19Routes.js` mounted at `/api/autonomous`):** `/api/autonomous/chief-of-staff` · `/api/autonomous/weekly-review` · `/api/autonomous/templates` · `/api/autonomous/efficiency`

**NL bridge:** `/api/brain/copilot` detects actionable intent → adds `plan` to response → `BrainMessage.jsx` renders `ExecutableActionCard`

**FLOW Efficiency Metrics:** `getEfficiencyMetrics(wsId, days)` in `pilotMetrics.js` — tracks action.accepted, action.dismissed, workflow.started, workflow.completed

**Invariants:** all actions flow through `executeAction()` (governance never bypassed); signal sources are best-effort (inbox never breaks); NL bridge is best-effort (copilot always returns response)

**Validation:** `scripts/validate-phase19.js` (50 assertions, no live server needed)

---

*Last updated: 2026-07-17 by Claude (Phase 19 Autonomous Operations — COMPLETE, 50/50)*
