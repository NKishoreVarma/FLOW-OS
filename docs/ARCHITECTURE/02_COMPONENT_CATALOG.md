# FLOW OS — Component Catalog
**Architecture Version:** 1.0  
**Status:** FROZEN

---

## How to Use This Document

Every major subsystem is listed with: location, purpose, public API, dependencies, and the invariants that must not be violated. Cross-reference with `03_DATA_FLOW.md` for request flows and `05_DATABASE_MAP.md` for table ownership.

---

## 1. Authentication & Identity

**Location:** `src/modules/auth/`, `src/core/middleware/authenticate.js`

**Purpose:** Authenticate users, issue JWTs, hash passwords, validate API keys.

**Public API:**
- `POST /api/auth/signup` — create org + workspace + user
- `POST /api/auth/login` — verify credentials, return JWT
- `signToken({ sub, orgId, role })` — exported from `authenticate.js`
- `authenticate` middleware — verifies JWT, sets `req.user`

**Dependencies:** `bcryptjs`, `jsonwebtoken`, Prisma (`users`, `organizations`)

**Invariants:**
- `JWT_SECRET` must be ≥32 chars; validated at startup
- No hardcoded fallback secret (removed Sprint 5.3.2)
- Passwords never stored plaintext

---

## 2. Tenant Isolation

**Location:** `src/core/middleware/tenantIsolation.js`

**Purpose:** Enforce workspace ownership before any route handler runs. This is the most critical security boundary.

**Public API:** Express middleware (`req.tenantId`, `req.workspace`, `req.workspaceRole` attached)

**Dependencies:** Prisma (`workspaces`, `workspace_members`)

**Invariants:**
- Every route handler touching workspace data must be behind this middleware
- Missing `workspace-id` header → 400
- Workspace not owned by authenticated org → 403
- The check is a DB query — it cannot be satisfied by spoofing the header alone

---

## 3. Governance & Policy Engine

**Location:** `src/core/governance/`

**Files:**
| File | Responsibility |
|------|---------------|
| `constants.js` | Effect enum, default role-action matrix, plan-tier gates |
| `permissionEvaluator.js` | `evaluateWithPolicies()` (DB-first) + `evaluate()` (fallback) |
| `policyStore.js` | Policy CRUD + 60-second in-memory cache |
| `approvalStore.js` | PendingApproval CRUD + lifecycle state machine |
| `governanceMiddleware.js` | Attaches `req.govContext` |
| `auditPersistence.js` | Writes audit rows to PostgreSQL |
| `eventSubscribers.js` | Event bus subscribers (analytics, notifications) |

**Purpose:** Single authority for all permission decisions. Database-configurable policies override the default role matrix.

**Public API:**
- `evaluateWithPolicies(context)` → `{ effect: 'ALLOW'|'DENY'|'REQUIRE_APPROVAL', reason }`
- `policyStore.{create,get,list,update,toggle,delete}`
- `approvalStore.{create,approve,reject,expire}`

**Invariants:**
- DENY always wins in policy evaluation
- Automation actor is always fixed `MEMBER` — never elevated
- Self-approval is blocked
- CRITICAL actions require two distinct approvers

---

## 4. Connector Platform

**Location:** `src/connectors/`

**Files:**
| File | Responsibility |
|------|---------------|
| `capabilities.js` | Capability, ActionType, AuthStrategy enums |
| `normalizedTypes.js` | FLOW-native object factories |
| `BaseAdapter.js` | Abstract interface all connectors extend |
| `authManager.js` | Credential store (OAuth2, API key, service account) |
| `registry.js` | ConnectorRegistry (register, resolve, health) |
| `executionEngine.js` | Action pipeline: governance → execute → audit → timeline → WS |
| `searchOrchestrator.js` | Fan-out search across all connected adapters |
| `adapters/` | 12 adapter implementations |

**Purpose:** Universal integration framework. All connector actions pass through `executeAction()`.

**Adapters:**
| Adapter | Capability | Status |
|---------|-----------|--------|
| GmailAdapter | Communication | Production (OAuth2) |
| GoogleCalendarAdapter | Meeting | Production (OAuth2) |
| GitHubAdapter | Engineering | Production (PAT) |
| JiraAdapter | Work Management | Production (Composio) |
| NotionAdapter | Knowledge | Production |
| HubSpotAdapter | Customer Intelligence | Production |
| WorkdayAdapter | Workforce Intelligence | Production |
| SalesforceAdapter | Customer Intelligence | Skeleton |
| ConfluenceAdapter | Knowledge | Skeleton |
| GoogleDriveAdapter | Knowledge | Skeleton |
| BambooHRAdapter | Workforce Intelligence | Skeleton |

**Invariants:**
- All state-changing adapter actions call `executeAction()` — never bypass governance
- Credentials never appear in logs (redaction layer)
- `BaseAdapter.supportedActions` must not conflict with subclass getters (Phase 12 boot fix)

---

## 5. AI Platform

**Location:** `src/ai/`  
**Full reference:** `07_AI_PLATFORM.md`

**Purpose:** 9-layer AI request pipeline. Single entry point for all LLM calls.

**Public API (via `src/ai/index.js`):**
- `request(req)` — full 9-layer pipeline
- `streamRequest(req)` — SSE streaming
- `ask(req)`, `embed(text)`, `stream(req)` — direct provider access (internal use)

**Invariants:**
- No module outside `src/ai/` may import `@google/genai`, `openai`, or `@anthropic-ai/sdk`
- Every request is traced end-to-end
- Rate limiting and guardrails cannot be bypassed by application code

---

## 6. Unified Event Platform

**Location:** `src/events/`  
**Full reference:** `docs/UNIFIED_EVENT_PLATFORM.md`

**Files:**
| File | Responsibility |
|------|---------------|
| `index.js` | `publish`, `publishFields`, `publishWebhook`, `subscribe` |
| `eventNormalizer.js` | Raw payload → FLOW Event schema |
| `eventStore.js` | Durable PostgreSQL append (`flow_events`) |
| `eventRouter.js` | Fan-out to subscribers with retry/backoff/dead-letter |
| `eventCorrelator.js` | Correlation ID assignment |
| `eventReplay.js` | Re-deliver past events to subscribers |
| `eventSearch.js` | Query `flow_events` by type, source, time |
| `eventMetrics.js` | Event throughput and delivery stats |
| `eventRetention.js` | TTL-based event expiry cron |
| `eventSchemaRegistry.js` | Event type registration and versioning |
| `builtinSubscribers.js` | timeline, feed, memory, notify, brain, recommendation |

**Purpose:** Single canonical event bus. Every connector activity produces a FLOW Event. Intelligence modules consume independently.

**Invariants:**
- Exactly one bus, one normalizer, one router, one correlation path
- `workspace_id` mandatory on every event (tenant isolation)
- Brain subscriber never re-enqueues `origin === 'ingestion'` or `replayed` events (loop prevention)
- Dead-letter queue captures all failed deliveries for inspection

---

## 7. Knowledge Graph — Digital Twin

**Location:** `src/graph/`  
**Full reference:** `docs/OPERATIONAL_GRAPH_ENGINE.md`

**Files:**
| File | Responsibility |
|------|---------------|
| `GraphEngine.js` | `applyEvent`, `upsertNode`, `upsertEdge` — single writer |
| `GraphSchema.js` | `deriveGraph(event)` → nodes + edges |
| `GraphTraversal.js` | BFS: `neighbors`, `kHop`, `shortestPath`, `dependencyChain`, `impactPath`, `temporal` |
| `ImpactAnalyzer.js` | Blast radius computation |
| `DependencyAnalyzer.js` | Orphan + stale detection |
| `RelationshipScorer.js` | Edge strength: weight × ln(1+obs) × recency |

**Purpose:** Live company digital twin. 21 node types, 19 edge types. Populated exclusively by the Event Platform `graph` subscriber.

**Node ID scheme:** `${workspaceId}:type:connector:key`  
**Traversal:** Bounded iterative BFS (NOT recursive CTE) — frontier cap 400, node cap 1000.

**Invariants:**
- Single writer: only the `graph` subscriber calls `GraphEngine.applyEvent`
- Tenant isolation: every read query filters by `workspace_id`
- Graph subscriber never publishes events (no feedback loop)

---

## 8. Execution Engine

**Location:** `src/execution/`  
**Full reference:** `docs/EXECUTION_ENGINE.md`

**Files:**
| File | Responsibility |
|------|---------------|
| `riskClassifier.js` | Classify action risk: LOW / MEDIUM / HIGH / CRITICAL |
| `approvalEngine.js` | Risk-tiered approval routing (extends governance approvalStore) |
| `actionPlanner.js` | Recommendation → structured action plan |
| `executionPlanner.js` | Dry-run simulation of action plan |
| `executionCoordinator.js` | Orchestrates action plan → connector → audit → event → notification |
| `executionHistory.js` | Durable `ExecutionRecord` in PostgreSQL |

**Purpose:** FLOW executes governed, risk-tiered, auditable actions. Every step routes through `executeAction()`.

**Invariants:**
- Nothing bypasses `executeAction()` governance
- Risk tier may only be RAISED by policy — never lowered
- CRITICAL requires two distinct approvers
- `rollbackAvailable` is honest (not optimistic)

---

## 9. Collaboration Engine

**Location:** `src/collaboration/`  
**Full reference:** `docs/MERGE_CONFLICT_INTELLIGENCE.md`

**Files:**
| File | Responsibility |
|------|---------------|
| `mergeConflictDetector.js` | Detect merge conflicts via GitHub Checks API polling |
| `ownershipAnalyzer.js` | Identify file owners + overlapping contributors |
| `collaborationDetector.js` | Detect blocked, stale, large, repeat-collision PRs |

**Purpose:** Surface coordination issues before they block people.

---

## 10. Notification Engine

**Location:** `src/notifications/`  
**Full reference:** `docs/NOTIFICATION_ENGINE.md`

**Files:**
| File | Responsibility |
|------|---------------|
| `notificationTargeting.js` | Determine recipients by priority + role + `canSee` |
| `notificationEngine.js` | Dedup (6h window), persist, WS push, bus subscriber |

**Purpose:** Route the right notification to the right person. Deduplication prevents alert fatigue.

**Invariants:**
- Targeting is permission-aware (only relevant people see governance-restricted events)
- Deduplication key: `(workspaceId, userId, type, entityId)` within 6 hours

---

## 11. Workspace Intelligence Cache

**Location:** `src/workspaceCache/`  
**Full reference:** `docs/WORKSPACE_INTELLIGENCE_CACHE.md`

**Files:**
| File | Responsibility |
|------|---------------|
| `snapshotBuilder.js` | Build snapshot from fast sources (~140ms cold) |
| `snapshotStore.js` | In-memory Map + Redis write-through |
| `refreshCoordinator.js` | Event-driven + 5-min cron debounced rebuild |

**Purpose:** Instant (~5ms) workspace intelligence snapshot for Morning Briefing and dashboard surfaces. Sources: Prediction Engine + Health Score + Graph metrics + PG counts. Never calls the Brain or Council.

---

## 12. Prediction Engine

**Location:** `src/predictions/`  
**Full reference:** `docs/PREDICTIVE_WORKSPACE_INTELLIGENCE.md`

**Purpose:** Deterministic "what is likely to happen next?" (~22 prediction types). No ML. Consumes graph, events, simulation, and memory signals.

**API:** `predict(workspaceId, opts)`, `predictOne(workspaceId, type)`, `getHistory(workspaceId)`

---

## 13. Simulation Engine

**Location:** `src/simulation/`  
**Full reference:** `docs/SIMULATION_ENGINE.md`

**Purpose:** "What if X happens?" — cascading impact simulation grounded in the real graph, event history, and memory. 11 scenario types.

**API:** `simulate(workspaceId, { type|question, targetEntityId })`, `compare(workspaceId, a, b)`

---

## 14. Replay Engine

**Location:** `src/replay/`  
**Full reference:** `docs/WORKSPACE_REPLAY_ENGINE.md`

**Purpose:** Read-only DVR over the Event Platform. 7 playback modes. No duplicate storage — reads `flow_events` only.

---

## 15. Explainability Engine (XAI)

**Location:** `src/explainability/`  
**Full reference:** `docs/EXPLAINABLE_INTELLIGENCE.md`

**Purpose:** Wraps any AI output into a standard explanation envelope: evidence, 6-dimension confidence, contradictions, missing information, trust score.

**API:** `explain(output, ctx)`, `explainQuestion(workspaceId, question, opts)`

---

## 16. Operational Brain Services

**Location:** `src/services/` (multiple files)

| Service | Responsibility |
|---------|---------------|
| `operationalBrainService.js` | Role briefing, copilot Q&A, explainable recommendations (Phase 7) |
| `copilotService.js` | RAG + KG + conversation memory (Phase 7) |
| `briefingEngine.js` | Morning briefing generation (Phase 7) |
| `decisionEngine.js` | Structured decision CRUD (Phase 7) |
| `automationEngine.js` | Governed multi-step workflow execution (Phase 7) |
| `goalTrackingService.js` | OKR goals + milestones + risk evaluation (Phase 7) |
| `brainTimelineService.js` | Operational timeline + entity context (Phase 7) |
| `orgMemoryService.js` | Durable decision/incident/event memory (Phase 7) |

---

## 17. Multi-Agent Executive Council

**Location:** `src/council/`  
**Full reference:** `docs/MULTI_AGENT_EXECUTIVE_COUNCIL.md`

**Files:**
| File | Responsibility |
|------|---------------|
| `agents/registry.js` | 6 COO agent configs (Engineering, Operations, Sales, HR, Security, Finance) |
| `agents/ExecutiveAgent.js` | `analyze()` via `explainQuestion` |
| `router.js` | Deterministic routing by keywords + capability |
| `executiveOrchestrator.js` | Parallel execution with timeout isolation |
| `debateEngine.js` | Disagreement detection + minority opinion preservation |
| `councilSynthesizer.js` | Single answer from multiple perspectives |
| `executiveDashboard.js` | 6 health cards (~10min cache) |

**Purpose:** 6 specialized AI agents debate company problems and produce one synthesized answer. Agents use `explainQuestion` — no duplicated reasoning.

---

## 18. Workspace Lifecycle Engine

**Location:** `src/core/workspaceLifecycle/`  
**Full reference:** `docs/WORKSPACE_LIFECYCLE_ENGINE.md`

**Purpose:** Manifest-driven workspace bootstrap, import, sync, refresh, and validate pipeline. 23 built-in dataset types. Durable `ImportRecord` in PostgreSQL.

**Operations:** CREATE (10 stages) · IMPORT (9) · SYNC (7) · REFRESH (4) · VALIDATE (1)

---

## 19. Autonomous Operations

**Location:** `src/autonomous/`  
**Full reference:** `docs/AUTONOMOUS_OPERATIONS.md`

**Files:**
| File | Responsibility |
|------|---------------|
| `workflowTemplates.js` | 6 named multi-step workflow templates |
| `actionCardService.js` | WorkItem → ActionCard builder |
| `memoryPersonalizer.js` | Read execution history for preference learning |
| `chiefOfStaffService.js` | Top-5 NOW items + greeting |
| `weeklyReviewService.js` | Engineering velocity + execution success + risks |

**Purpose:** FLOW proactively surfaces what to do next. All actions execute through the governed Execution Engine.

---

## 20. Living Workspace Simulator

**Location:** `src/simulator/`  
**Full reference:** `docs/LIVING_WORKSPACE_SIMULATOR.md`

**Purpose:** Dev-only causal event generator. Seeds coherent company history (6 months) and generates live events via the Event Platform. Blocked in production (404).

---

## 21. Integration Permissions

**Location:** `src/core/governance/integrationPermissions/`  
**Full reference:** `docs/INTEGRATION_PERMISSIONS.md`

**Purpose:** Deny-by-default resource gate. OAuth authenticates; Integration Permissions decide what FLOW is allowed to ingest. 4 enforcement doors: sync, webhook, capability routes, legacy Google.

**Governed connectors:** slack, github, gmail, google-calendar, notion, jira

**Invariant:** Blocked resources leave zero trace in any store — not queued, not stored, not embedded, not graphed.

---

## 22. Onboarding Platform

**Location:** `src/onboarding/`  
**Full reference:** `docs/ONBOARDING_ARCHITECTURE.md`

**Files:**
| File | Responsibility |
|------|---------------|
| `onboardingState.js` | Per-workspace setup progress in Redis |
| `discoveryOrchestrator.js` | Live or demo resource discovery |
| `adoptionMetrics.js` | Time-to-value + work-completed measurement |

---

## 23. Success & ROI Platform

**Location:** `src/success/`

**Files:**
| File | Responsibility |
|------|---------------|
| `valueModel.js` | Conservative ROI estimate with disclosed assumptions |
| `successMetrics.js` | Hybrid measured + estimated metrics |

**Purpose:** Honest ROI: measured counts from real records + transparently labeled estimates. Empty workspace shows zeros — no fabricated numbers.

---

## 24. Frontend Components

**Location:** `flow-os-frontend/src/`

| Directory | Contents |
|-----------|---------|
| `components/layout/` | LayoutShell, Sidebar, Header |
| `components/ui/` | Primitives: Button, Card, Input, Badge, Toast, AICopilot, CommandPalette, ActionCenter, ExecutableActionCard, TrustBar, ErrorBoundary |
| `components/morning/` | MorningBriefing (landing, `/`) |
| `components/inbox/` | AIInbox, OperationalInbox, ActionCard |
| `components/meetings/` | MeetingDashboard, MeetingPreparation, LiveMeeting, MeetingCompletion |
| `components/projects/` | ProjectIntelligence, EngineeringDashboard |
| `components/knowledge/` | KnowledgeExplorer |
| `components/company/` | ExecutiveDashboard, CustomerIntelligence, WorkforceIntelligence |
| `components/workspace/` | EntityWorkspace, SupportDashboard |
| `components/council/` | ExecutiveCouncil |
| `components/autonomous/` | ChiefOfStaff, WeeklyReview |
| `components/onboarding/` | FirstRunFlow, FirstRunGate, TeamInvite |
| `components/success/` | SuccessDashboard |
| `components/platform/` | EnterpriseAdmin, ImportDashboard, ModelOrchestrator, EvaluationPlatform, WorkspaceHealth, AIGovernance, … |
| `components/settings/` | IntegrationPermissions |
| `components/trust/` | TrustCenter, TrustCenterDashboard |
| `components/brain/` | BrainMessage |
| `components/execution/` | ExecutableActionCard, MergeConflictCard |
| `lib/` | brainApi, councilApi, executionApi, onboardingApi, trustApi, entityContext |
| `hooks/` | useWebSocket |
| `styles/` | tokens.css, colors.css, typography.css, spacing.css, animations.css, globals.css |
