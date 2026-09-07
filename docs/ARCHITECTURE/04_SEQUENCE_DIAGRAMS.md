# FLOW OS — Sequence Diagrams
**Architecture Version:** 1.0  
**Status:** FROZEN

All diagrams use Mermaid syntax. Render at https://mermaid.live or any Mermaid-compatible Markdown renderer.

---

## 1. AI Request — Full 9-Layer Pipeline

```mermaid
sequenceDiagram
    participant Client
    participant Express
    participant TenantIso as TenantIsolation
    participant AIPlatform
    participant Guardrails
    participant RateLimit as RateLimiter
    participant Memory
    participant Context as ContextAssembler
    participant Prompt as PromptBuilder
    participant BrainRouter
    participant Provider as LLM Provider
    participant Tracer

    Client->>Express: POST /api/brain/copilot {question}
    Express->>Express: authenticate (JWT verify)
    Express->>TenantIso: validate workspace-id
    TenantIso->>TenantIso: DB query — org owns workspace?
    TenantIso-->>Express: req.workspaceRole attached

    Express->>AIPlatform: request({workspaceId, question, taskType})
    AIPlatform->>Tracer: startTrace()

    AIPlatform->>Guardrails: checkInput(req)
    Guardrails->>Guardrails: PII scan
    Guardrails->>Guardrails: injection detect
    Guardrails->>Guardrails: policy check (fails open)
    Guardrails-->>AIPlatform: {pass: true, issues: []}

    AIPlatform->>RateLimit: checkAndIncrement(workspaceId, provider, tier)
    RateLimit-->>AIPlatform: {allowed: true, remaining: 29}

    AIPlatform->>Memory: load(workspaceId, N=5)
    Memory-->>AIPlatform: conversationHistory[]

    AIPlatform->>Context: assembleContext(workspaceId, question)
    Context->>Context: retrieveContext (pgvector ANN)
    Context->>Context: getRelatedContext (KG 1-hop)
    Context->>Context: healthScore
    Context-->>AIPlatform: {rag, graph, health}

    AIPlatform->>Prompt: buildMessages(req, context, history)
    Prompt-->>AIPlatform: messages[] (system + context + user)

    AIPlatform->>BrainRouter: ask({messages, taskType, tools})
    BrainRouter->>BrainRouter: selectProvider()
    BrainRouter->>Provider: chat(messages, opts)
    Provider-->>BrainRouter: {text, inputTokens, outputTokens}
    BrainRouter-->>AIPlatform: {text, provider, latencyMs}

    AIPlatform->>Guardrails: checkOutput(text, req)
    Guardrails-->>AIPlatform: {pass: true, text}

    AIPlatform->>Memory: store(workspaceId, {query, answer})

    AIPlatform->>Tracer: complete({provider, tokens, cost})
    Tracer->>Tracer: async persist → model_requests (non-blocking)

    AIPlatform-->>Express: {text, provider, latencyMs, traceId}
    Express-->>Client: 200 {text, ...}
```

---

## 2. Connector Action with Approval

```mermaid
sequenceDiagram
    participant User
    participant Express
    participant GovMiddleware as GovernanceMiddleware
    participant PolicyEval as PolicyEvaluator
    participant ApprovalStore
    participant Notify as NotificationEngine
    participant Admin
    participant ExecEngine as ExecutionEngine
    participant Adapter as ConnectorAdapter
    participant EventPlatform
    participant AuditLog

    User->>Express: POST /api/connectors/execute {action}
    Express->>Express: authenticate + tenantIsolation
    Express->>GovMiddleware: attach govContext (workspaceRole, plan)

    Express->>PolicyEval: evaluateWithPolicies(context)
    PolicyEval->>PolicyEval: load DB policies (60s cache)
    PolicyEval->>PolicyEval: role-action matrix fallback

    alt Policy: DENY
        PolicyEval-->>Express: {effect: DENY}
        Express->>AuditLog: persist(outcome:'denied')
        Express-->>User: 403 {error: 'ACTION_DENIED'}

    else Policy: REQUIRE_APPROVAL
        PolicyEval-->>Express: {effect: REQUIRE_APPROVAL}
        Express->>ApprovalStore: create(workspaceId, userId, action, risk)
        ApprovalStore-->>Express: {approvalId}
        Express->>Notify: notifyAdmins(approvalId)
        Notify-->>Admin: WebSocket NOTIFICATION_CREATED
        Express->>AuditLog: persist(outcome:'approval_required')
        Express-->>User: 403 {error: 'APPROVAL_REQUIRED', approvalId}

        Admin->>Express: POST /api/approvals/:id/approve
        Express->>ApprovalStore: updateStatus(APPROVED, adminId)
        ApprovalStore->>ApprovalStore: self-approval check
        ApprovalStore->>ApprovalStore: distinct-approver check
        ApprovalStore-->>Express: approved

        Express->>ExecEngine: executeAction(action, {approvedBy: adminId})
        ExecEngine->>Adapter: adapter[action](params)
        Adapter-->>ExecEngine: result
        ExecEngine->>AuditLog: persist(outcome:'success')
        ExecEngine->>EventPlatform: publish(FLOW Event)
        ExecEngine->>ApprovalStore: markExecuted(approvalId)
        Notify-->>User: WebSocket ACTION_EXECUTED
        Express-->>Admin: 200 {success, result}

    else Policy: ALLOW
        PolicyEval-->>Express: {effect: ALLOW}
        Express->>ExecEngine: executeAction(action, params)
        ExecEngine->>Adapter: adapter[action](params)
        Adapter-->>ExecEngine: result
        ExecEngine->>AuditLog: persist(outcome:'success')
        ExecEngine->>EventPlatform: publish(FLOW Event)
        Express-->>User: 200 {success, result}
    end
```

---

## 3. Data Ingestion Pipeline

```mermaid
sequenceDiagram
    participant Source as External Source
    participant Queue as BullMQ (ingestion-queue)
    participant Worker as IngestionWorker
    participant Privacy as Privacy Gate
    participant Cognitive as Cognitive Brain (LLM)
    participant Vector as pgvector Store
    participant Vault as Vault (filesystem)
    participant WS as WebSocket

    Source->>Queue: add job {workspaceId, platform, sender, text}
    Queue-->>Worker: dequeue job

    Worker->>Worker: Stage 1: normalize + strip injection
    Worker->>WS: TRACE_STAGE_UPDATE {stage:1}

    Worker->>Worker: Stage 2: score 8 dimensions
    Worker->>WS: TRACE_STAGE_UPDATE {stage:2}

    Worker->>Privacy: Stage 3: privacy_score > 0.85?
    alt High PII
        Privacy-->>Worker: DISCARD
        Worker->>WS: PRIVACY_SHIELD_TRIGGERED
        Note over Worker: Pipeline terminates
    else Pass
        Privacy-->>Worker: continue

        Worker->>Worker: Stage 4: incident detection
        Worker->>WS: TRACE_STAGE_UPDATE {stage:4}

        Worker->>Worker: Stage 5: decision extraction
        Worker->>Worker: Stage 6: memory brain retention policy
        Worker->>WS: MEMORY_RETAINED | MEMORY_DISCARDED

        Worker->>Worker: Stage 7: entity extraction
        Worker->>Worker: Stage 8: KG sync

        Worker->>Cognitive: Stage 9: classify (Gemini or heuristic)
        Cognitive-->>Worker: OPERATIONAL_INTEL | SOCIAL | PRIVATE

        alt OPERATIONAL_INTEL
            Worker->>Vault: saveToVault (Markdown file)
            Worker->>Vector: generateEmbedding → INSERT workspace_intel_chunks
            Worker->>WS: INTEL_STORED
        else SOCIAL_COORDINATION
            Worker->>Worker: Redis SET (3600s TTL)
        else PRIVATE_PERSONAL
            Worker->>Worker: rawText = null (hard drop)
            Worker->>WS: PRIVACY_SHIELD_TRIGGERED
        end

        Worker->>WS: INGESTION_COMPLETE
    end
```

---

## 4. Executive Briefing Flow

```mermaid
sequenceDiagram
    participant Client
    participant API as /api/brain/briefing
    participant BriefEngine as BriefingEngine
    participant WorkspaceCache
    participant OrgMemory
    participant DecisionEngine
    participant AIPlatform

    Client->>API: GET /api/brain/briefing?role=CTO
    API->>WorkspaceCache: GET snapshot (instant, ~5ms)
    WorkspaceCache-->>API: {overall, engineering, operations, ...}

    API->>BriefEngine: generateBriefing(workspaceId, orgId, role)

    BriefEngine->>OrgMemory: getRecentDecisions(orgId, 7d)
    BriefEngine->>OrgMemory: getRecentIncidents(workspaceId, 7d)
    BriefEngine->>DecisionEngine: getPendingDecisions(workspaceId)
    BriefEngine->>WorkspaceCache: snapshot (health + predictions)

    BriefEngine->>AIPlatform: request({taskType:'BRIEFING', evidence})
    AIPlatform->>AIPlatform: 9 layers (guardrails + context + LLM)
    AIPlatform-->>BriefEngine: formatted Markdown brief

    BriefEngine-->>API: {brief, evidence, metadata}
    API-->>Client: 200 {brief, role, generatedAt}
```

---

## 5. Multi-Agent Executive Council

```mermaid
sequenceDiagram
    participant Client
    participant CouncilAPI as /api/council/ask
    participant Router as CouncilRouter
    participant AgentA as EngineeringAgent
    participant AgentB as OperationsAgent
    participant AgentC as SecurityAgent
    participant Debate as DebateEngine
    participant Synth as CouncilSynthesizer
    participant Brain as ExplainQuestion

    Client->>CouncilAPI: POST /api/council/ask {question}
    CouncilAPI->>Router: route(question)
    Router->>Router: keyword match + CapabilityPlanner boost
    Router-->>CouncilAPI: [engineering, operations, security]

    par Agent parallelism (timeout-isolated)
        CouncilAPI->>AgentA: analyze(question)
        AgentA->>Brain: explainQuestion(workspaceId, domain_question)
        Brain-->>AgentA: {answer, evidence, confidence}
        AgentA-->>CouncilAPI: {finding, signal, confidence}
    and
        CouncilAPI->>AgentB: analyze(question)
        AgentB->>Brain: explainQuestion(...)
        Brain-->>AgentB: {answer, evidence, confidence}
        AgentB-->>CouncilAPI: {finding, signal, confidence}
    and
        CouncilAPI->>AgentC: analyze(question)
        AgentC->>Brain: explainQuestion(...)
        Brain-->>AgentC: {finding, signal, confidence}
    end

    CouncilAPI->>Debate: debate(findings[])
    Debate->>Debate: go/caution polarity by signal count
    Debate->>Debate: confidence spread → disagreements
    Debate->>Debate: preserve minority opinions
    Debate-->>CouncilAPI: {tradeoffs, agreements, minorityViews}

    CouncilAPI->>Synth: synthesize(question, findings, debate)
    Synth->>Brain: reason() via BrainRouter (with timeout guard)
    Brain-->>Synth: synthesized answer
    Note over Synth: Falls back to deterministic structured answer if LLM times out
    Synth-->>CouncilAPI: {answer, reasoning, confidence}

    CouncilAPI-->>Client: 200 {answer, agents, debate, confidence}
```

---

## 6. Workspace Onboarding (First Run)

```mermaid
sequenceDiagram
    participant User
    participant Gate as FirstRunGate
    participant OnboardingAPI as /api/onboarding
    participant State as OnboardingState (Redis)
    participant Discovery as DiscoveryOrchestrator
    participant Lifecycle as WorkspaceLifecycleEngine
    participant Simulator

    User->>Gate: navigate to any page
    Gate->>OnboardingAPI: GET /api/onboarding/state
    OnboardingAPI->>State: get(workspaceId)
    State-->>OnboardingAPI: {step:'welcome', completed:false}
    OnboardingAPI-->>Gate: {completed: false}
    Gate-->>User: redirect /welcome

    User->>OnboardingAPI: POST /api/onboarding/discover (demo mode)
    OnboardingAPI->>Discovery: discoverDemo(connectors)
    Discovery-->>OnboardingAPI: catalog {repos:6, channels:14, calendars:2}
    OnboardingAPI->>State: update(step:'permissions')

    User->>OnboardingAPI: POST /api/onboarding/permissions {allowedResources}
    OnboardingAPI->>State: update(step:'build', permissions)

    User->>OnboardingAPI: POST /api/onboarding/build (demo)
    OnboardingAPI->>Simulator: seed(workspaceId, {days:180})
    Simulator->>Simulator: publish 6 causal chains via Event Platform
    Simulator-->>OnboardingAPI: {seeded: true}
    OnboardingAPI->>Lifecycle: refresh(workspaceId)
    Lifecycle-->>OnboardingAPI: ImportRecord {status:'completed'}
    OnboardingAPI->>State: update(step:'ready', completed:true)
    OnboardingAPI-->>User: redirect /  (Morning Briefing)
```

---

## 7. What-If Simulation

```mermaid
sequenceDiagram
    participant Client
    participant SimAPI as /api/simulation/run
    participant ScenarioBuilder
    participant GraphEngine
    participant EventSearch
    participant OrgMemory
    participant XAI as ExplainabilityEngine
    participant SimMemory

    Client->>SimAPI: POST /api/simulation/run {question:'What if Rahul resigns?'}
    SimAPI->>ScenarioBuilder: build(question)
    ScenarioBuilder->>ScenarioBuilder: NL classify → EMPLOYEE_DEPARTURE
    ScenarioBuilder->>GraphEngine: searchNodes('Rahul') → entity resolve
    ScenarioBuilder-->>SimAPI: {type, targetEntityId, params}

    SimAPI->>GraphEngine: analyzeImpact(entityId) → blast radius
    SimAPI->>GraphEngine: dependencyChain(entityId) → owned assets
    SimAPI->>GraphEngine: neighbors(entityId) → collaborators
    SimAPI->>EventSearch: query(actor:entityId, 90d) → activity history
    SimAPI->>OrgMemory: getMemory(type:'simulation', entity:entityId) → analogues

    SimAPI->>SimAPI: ImpactEstimator → 6 impact dimensions + heuristic financial
    SimAPI->>SimAPI: RiskCalculator → weighted × likelihood × criticality
    SimAPI->>SimAPI: MitigationPlanner → grounded actions from graph

    SimAPI->>XAI: explain(simulationOutput, ctx)
    XAI-->>SimAPI: explanationEnvelope

    SimAPI->>SimMemory: persist(MemoryRecordType.SIMULATION)
    SimAPI-->>Client: 200 {simulation, explanation, mitigations}
```

---

## 8. Integration Permission Gate (Sync Path)

```mermaid
sequenceDiagram
    participant Sync as SyncEngine
    participant PermGate as PermissionGate
    participant PermStore as PermissionStore (Prisma + 60s cache)
    participant Ingestion as ingestionQueue
    participant EventBus as Event Platform

    Sync->>Sync: fetch items from connector API

    loop For each sync item
        Sync->>PermGate: isAllowed(workspaceId, connector, item)
        PermGate->>PermGate: extractResourceKey(item) → {type, id}

        alt Resource not governed
            PermGate-->>Sync: ALLOW (legacy)
        else DM policy check
            PermGate->>PermStore: getDMPolicy(workspaceId, connector)
            PermStore-->>PermGate: policy
            PermGate-->>Sync: ALLOW | DENY
        else Normal resource
            PermGate->>PermStore: getDecision(workspaceId, connector, resourceId)
            PermStore-->>PermGate: {allowed: true|false}
            alt Allowed
                PermGate-->>Sync: ALLOW
            else Denied
                PermGate-->>Sync: DENY (item leaves no trace)
            end
        end

        alt ALLOW
            Sync->>Ingestion: queue.add(item)
            Sync->>EventBus: publish(SYNC_ITEM_PROCESSED)
        end
    end
```
