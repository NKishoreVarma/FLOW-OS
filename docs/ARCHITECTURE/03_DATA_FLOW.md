# FLOW OS — Data Flow
**Architecture Version:** 1.0  
**Status:** FROZEN

---

## 1. Ingestion Flow (Message → Knowledge Store)

```
External system / developer seed
         │
         │ POST /api/webhook/ingest
         ▼
  JWT authenticate
  tenantIsolation (workspace-id ownership check)
         │
         ▼
  ingestionQueue.add({ workspaceId, platform, sender, channel, text })
         │                               Redis-backed BullMQ queue
         ▼
  ingestionWorker.process(job)
         │
         ├─ Stage 1: PARSER
         │    normalizeFormatting(text) → strips injection → [STRIPPED INJECTION]
         │    extractTaskAndDeadline() → detects tasks, deadlines
         │
         ├─ Stage 2: IMPORTANCE SCORER
         │    evaluateScores(sender, channel, text)
         │    → { privacy, intent, operational_value, business_impact,
         │         memory_value, authority, importance, urgency } ∈ [0,1]
         │
         ├─ Stage 3: PRIVACY GATE
         │    if privacy_score > 0.85:
         │      broadcast PRIVACY_SHIELD_TRIGGERED (no payload text)
         │      DISCARD ← pipeline terminates here
         │
         ├─ Stage 4: INCIDENT ENGINE
         │    detectIncidents(workspaceId, text, metadata)
         │    keyword match → incidentDatabase[] (in-memory)
         │    broadcast INCIDENT_CREATED | RISK_DETECTED
         │
         ├─ Stage 5: DECISION ENGINE
         │    extractDecisions(workspaceId, text, metadata, sender)
         │    → decisionDatabase[] (in-memory)
         │
         ├─ Stage 6: MEMORY BRAIN
         │    evaluateChunk(text, { workspaceId, source, sender, channel })
         │    composite = (importance × 0.45) + (authority × 0.35) + (urgency × 0.20)
         │    retention_policy: PERMANENT | 90_DAYS | 30_DAYS | 24_HOURS | DISCARD
         │    broadcast MEMORY_RETAINED | MEMORY_EXPIRED | MEMORY_DISCARDED | MEMORY_ESCALATED
         │
         ├─ Stage 7: ENTITY EXTRACTOR
         │    extractEntitiesFromText(text) → entity IDs in KG
         │
         ├─ Stage 8: KG SYNC
         │    registerEntity(id, type, name) for each entity
         │    → increments liveMetrics.totalNodes
         │
         └─ Stage 9: COGNITIVE BRAIN (LLM classification)
               Gemini 2.5 Flash classify → OPERATIONAL_INTEL | SOCIAL_COORDINATION | PRIVATE_PERSONAL
               Heuristic fallback if no API key or Gemini fails

               ┌─ OPERATIONAL_INTEL ─────────────────────────────────────────────┐
               │  saveToVault(workspaceId, channel, text, metadata)               │
               │    → $VAULT_ROOT/workspace_{id}/{channel}/intel_{ts}.md          │
               │  upsertVector(workspaceId, text, channel, metadata)              │
               │    → generateEmbedding(text) [768-dim]                           │
               │    → INSERT INTO workspace_intel_chunks (pgvector)               │
               │  broadcast INTEL_STORED                                          │
               └──────────────────────────────────────────────────────────────────┘

               ┌─ SOCIAL_COORDINATION ───────────────────────────────────────────┐
               │  Redis SET social_cache:workspace_{id}:{channel}:{ts} EX 3600   │
               └──────────────────────────────────────────────────────────────────┘

               ┌─ PRIVATE_PERSONAL ──────────────────────────────────────────────┐
               │  rawInputText = null   ← hard drop, never stored anywhere        │
               │  broadcast PRIVACY_SHIELD_TRIGGERED (no payload text)            │
               └──────────────────────────────────────────────────────────────────┘
```

---

## 2. RAG Query Flow (Question → Executive Brief)

```
Client
  │
  │ POST /api/query { queryText }
  │ Header: workspace-id, Authorization
  ▼
JWT authenticate → tenantIsolation → governanceMiddleware
  │
  ▼
Stage 1: ROUTER AGENT
  RouterAgent.routeQuery(queryText)
  → { primaryDomain, domainWeights, intentFlags, routingScore }
  Domains: engineering | security | product | finance | people | operations | general
  │
  ▼
Stage 2: RETRIEVAL
  retrieveContext(workspaceId, queryText, queryTraceId)
  ├─ Parse structural flags (from:, channel:, priority:) → vaultFrontmatterScan
  ├─ Semantic path:
  │    generateEmbedding(queryText)
  │    → pgvector ANN search LIMIT 20
  │    → fallback: vaultFallbackScan on DB/API failure
  └─ RRF merge (k=60) of vault + vector results
     → Knowledge Graph 2-hop expansion
     → top 5 authority-weighted chunks
  │
  ▼
Stage 3: CRITIC AGENT
  CriticAgent.evaluateContext(chunks, queryText)
  → temporal contradiction detection across 5 topic clusters:
    project_timeline, system_health, infra_migration,
    feature_availability, security_posture
  → flags lower-authority / older chunks as deprecated: true
  │
  ▼
Stage 4: MEMORY BOOST
  authorityCoeff >= 1.5 → +0.15 to finalScore
  (High-authority sources: github, obsidian, vault, git = 1.5)
  │
  ▼
Stage 5: EXECUTIVE SYNTHESIS
  ExecutiveSynthesisAgent.synthesize(queryText, validChunks, routerResult, criticSummary)
  → Gemini 2.5 Flash executive brief (Markdown)
  → fallback: local structured Markdown if no API key or Gemini fails
  │
  ▼
Stage 6: BROADCAST + RESPOND
  WebSocket broadcast EXECUTIVE_SYNTHESIS_READY
  → return JSON { brief, routerResult, retrievalResult, criticSummary, queryTrace }
```

---

## 3. Connector Action Flow

```
Client
  │
  │ POST /api/connectors/execute
  │ { connectorId, action, params }
  ▼
authenticate → tenantIsolation → governanceMiddleware
  │
  ▼
evaluateWithPolicies({ orgId, workspaceId, role, connectorId, action, userId })
  │
  ├─ DENY   → 403 { error: 'ACTION_DENIED', reason }
  │            persistConnectorAudit(outcome:'denied')
  │
  ├─ REQUIRE_APPROVAL (and no approvedBy):
  │           createPendingApproval({ workspaceId, userId, action, risk })
  │           → 403 { error: 'APPROVAL_REQUIRED', approvalId }
  │            persistConnectorAudit(outcome:'approval_required')
  │
  └─ ALLOW (or APPROVED):
       │
       ▼
    ExecutionEngine.executeAction(connectorId, action, params, context)
       │
       ├─ ConnectorRegistry.resolve(connectorId)
       ├─ adapter[action](params)
       ├─ persistConnectorAudit(outcome:'success') → audit_logs
       ├─ publish(FLOW Event) → Event Platform
       │    → KG subscriber: upsert nodes/edges
       │    → memory subscriber: store in org_memory_records
       │    → feed subscriber: add to workspace feed
       │    → notify subscriber: targeted notification
       ├─ in-memory timeline push (200-event ring)
       └─ WebSocket broadcast ACTION_EXECUTED
       │
       ▼
    200 { success, result, auditId }
```

---

## 4. AI Copilot Flow (Brain Query)

```
Client
  │
  │ POST /api/brain/copilot
  │ { question, pageContext?, entityId? }
  ▼
authenticate → tenantIsolation → governanceMiddleware
  │
  ▼
copilotService.answerCopilotQuery(workspaceId, { question, pageContext, entityId })
  │
  ├─ ContextAssembler:
  │    retrieveContext(workspaceId, question)        → RAG top 5 chunks
  │    getRelatedContext(workspaceId, entityId)      → KG 1-hop
  │    workspaceHealth(workspaceId)                  → health score + risks
  │
  ├─ AIPlatform.request({
  │     taskType: 'REASONING',
  │     prompt: question,
  │     workspaceId, userId, pageContext, entityId
  │   })
  │
  │   AIPlatform internals:
  │     Layer 6 in:  checkInput → PII? Injection? Policy?
  │     Layer 4:     checkAndIncrement (rate limit)
  │     Layer 7 ld:  load conversation history from Redis/PG
  │     Layer 2:     assembleContext (RAG + KG + health)
  │     Layer 3:     buildMessages (system + context + memory + user)
  │     Layer 8 def: getToolsForLLM() (search_workspace, get_entity, …)
  │     Layers 1+4:  selectProvider → BrainRouter → provider call
  │     Layer 8 ex:  if toolCalls → executeTools (→ executeAction)
  │     Layer 6 out: checkOutput → forbidden phrases? PII echo?
  │     Layer 7 st:  _remember(workspaceId, { query, answer, intent, topic })
  │     Layer 9:     trace.complete() → async DB persist
  │
  ├─ Format response: { text, provider, latencyMs, traceId, ... }
  │
  └─ (if SSE stream): POST /api/brain/copilot/stream
       yields Server-Sent Events with delta tokens
```

---

## 5. Event Platform Flow (Connector → Knowledge)

```
Any source:
  ingestionWorker | connector executeAction | webhookWorker
  │
  │ events.publish(source, rawType, payload, ctx)
  ▼
EventNormalizer.normalize(raw)
  → { id, workspaceId, type, connector, sourceEventId,
      actor, entity, metadata, timestamp, correlationId }
  │
  ▼
EventCorrelator.correlate(event)
  → assign correlationId (group related events into threads)
  │
  ▼
EventStore.append(event)
  → INSERT INTO flow_events
  → ON CONFLICT (workspace_id, connector, source_event_id) DO NOTHING (dedup)
  │
  ▼
EventRouter.route(event)
  → fan-out to all matching subscribers (fault-isolated, retry with backoff)
  │
  Builtin subscribers:
  ├─ timeline   → append to workspace timeline
  ├─ feed       → add to daily intelligence feed
  ├─ memory     → INSERT INTO org_memory_records (durable)
  ├─ notify     → notificationEngine.handleEvent (dedup + WS push)
  ├─ brain      → if urgent: enqueue RAG ingestion (skip if origin='ingestion')
  ├─ recommendation → update recommendation scores
  └─ graph      → GraphEngine.applyEvent (single writer)
                   → GraphSchema.deriveGraph(event)
                   → upsert graph_nodes, graph_edges
```

---

## 6. Workspace Intelligence Cache Flow

```
Trigger:
  Event Platform publishes any event (wic subscriber)
  OR 5-minute cron fires
         │
         ▼
RefreshCoordinator.scheduleRefresh(workspaceId)
  (debounced 10s — multiple rapid events collapse to one rebuild)
         │
         ▼
SnapshotBuilder.buildSnapshot(workspaceId)
  │
  ├─ PredictionEngine.predict(workspaceId, { domain: 'all' }) → ~22 predictions
  ├─ healthScoreService.getScore(workspaceId) → overall + 6 domain scores
  ├─ GraphEngine.metrics(workspaceId) → node/edge counts
  └─ pg.Pool SELECT count FROM flow_events, execution_records, notifications
  │
  ▼ (~140ms cold build)
SnapshotStore.set(workspaceId, snapshot)
  ├─ in-memory Map (sub-millisecond read)
  └─ Redis write-through (wic:snapshot:{ws}, TTL 3600s)

Read path:
GET /api/workspace/snapshot
  → SnapshotStore.get(workspaceId)
  → if miss: { status: 'building' } + trigger async build
  → if hit: snapshot (~5ms)
```

---

## 7. Approval Flow

```
APPROVAL CREATION:
  executeAction → REQUIRE_APPROVAL
  approvalStore.create({ workspaceId, userId, action, risk, params })
  → INSERT INTO pending_approvals (status=PENDING, expires_at=+48h)
  → notificationEngine → notify ADMIN+ users
  → 403 { approvalId }

APPROVAL RESOLUTION:
  ADMIN/OWNER → POST /api/approvals/:id/approve
  approvalStore.updateApprovalStatus(id, APPROVED, approverId)
  → self-approval check
  → CRITICAL: two distinct approvers required
  → executeAction(action, params, { approvedBy: approverId, approvalId: id })
  → mark PendingApproval EXECUTED
  → notificationEngine → notify requester

REJECTION:
  ADMIN/OWNER → POST /api/approvals/:id/reject
  approvalStore.updateApprovalStatus(id, REJECTED, ...)
  → notificationEngine → notify requester

EXPIRY (cron):
  pending_approvals WHERE expires_at < NOW() AND status=PENDING
  → UPDATE status=EXPIRED
```

---

## 8. Morning Briefing Flow

```
User → GET / (MorningBriefing component)
  │
  ▼
lib/brainApi.js → GET /api/workspace/snapshot
  → SnapshotStore.get(workspaceId) ← instant (~5ms)
  → snapshot: { overall, engineering, operations, ... }
  │
  ├─ If snapshot.status === 'building':
  │    show skeleton → retry after 3s
  │
  ▼
GET /api/autonomous/chief-of-staff
  → chiefOfStaffService.getChiefOfStaffBriefing(workspaceId, user)
  → top-5 NOW items from: pending approvals + notifications +
    predictions + failed executions + connector warnings + incidents
  → greeting personalization via memoryPersonalizer
  │
  ▼
Render: greeting + health snapshot + top 5 action cards
  (each action card: ExecutableActionCard with risk badge + governed execute)
```
