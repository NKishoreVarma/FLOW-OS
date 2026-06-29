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

*Last updated: 2026-06-29 by Claude (Workspace Lifecycle Engine — WLE complete)*
