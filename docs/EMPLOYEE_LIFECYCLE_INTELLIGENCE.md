# Employee Lifecycle Intelligence
## Architecture Specification — FLOW OS Post-Beta Feature

> **STATUS: DESIGN ONLY**
> This document is a production engineering specification for a future milestone.
> Do not implement any part of this during the current roadmap (Milestones 1–10).
> Assigned to: **Post-Beta — Enterprise Tier**

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Product Vision & Market Positioning](#2-product-vision--market-positioning)
3. [Architecture Analysis — Reusable vs New](#3-architecture-analysis)
4. [Data Architecture](#4-data-architecture)
5. [Service Architecture](#5-service-architecture)
6. [API Design](#6-api-design)
7. [Operational Brain Reasoning Flow](#7-operational-brain-reasoning-flow)
8. [Discovery Flow](#8-discovery-flow)
9. [Recommendation & Plan Generation Flow](#9-recommendation--plan-generation-flow)
10. [Knowledge Transfer Flow](#10-knowledge-transfer-flow)
11. [Execution Flow](#11-execution-flow)
12. [Audit & Compliance Flow](#12-audit--compliance-flow)
13. [Sequence Diagrams](#13-sequence-diagrams)
14. [UI Wireframes](#14-ui-wireframes)
15. [Integration into Workforce Intelligence](#15-integration-into-workforce-intelligence)
16. [Competitive Differentiation](#16-competitive-differentiation)
17. [Implementation Effort Estimate](#17-implementation-effort-estimate)
18. [Recommended Roadmap Stage](#18-recommended-roadmap-stage)

---

## 1. Executive Summary

Employee Lifecycle Intelligence is FLOW's answer to one of the most expensive and legally risky operational failures in mid-market companies: the unstructured, manual, partially-completed employee offboarding that leaves access open, destroys institutional knowledge, and produces no audit trail for compliance.

This is not a new product. It is a **business solution** — a specific orchestration workflow that activates all of FLOW's existing infrastructure against a single, well-defined business trigger: an employee's employment status changes.

FLOW already knows who everyone is, what they own, who they work with, what knowledge they hold, and which systems they depend on. No competitor in this space has that depth. This specification describes how to surface that advantage as a governed, auditable, explainable workflow that HR, IT, and Compliance teams can use without engineering involvement.

**The core insight:** Identity management platforms remove access. FLOW understands work. That distinction — knowing *why* someone had access, *what knowledge leaves with them*, and *how to safely transfer that knowledge* — is the moat this feature builds on.

---

## 2. Product Vision & Market Positioning

### 2.1 Module Hierarchy

```
FLOW OS
└── Enterprise Intelligence Platform
    └── Intelligence Modules
        └── Workforce Intelligence
            └── Employee Lifecycle Intelligence
                ├── Hiring Intelligence
                ├── Onboarding
                ├── Role Changes & Promotions
                ├── Department Transfers
                ├── Leave Management
                ├── Performance Intelligence
                ├── Contract Expiry
                ├── Offboarding          ← primary focus of this spec
                ├── Knowledge Transfer   ← primary focus of this spec
                └── Compliance           ← primary focus of this spec
```

### 2.2 The Business Problem (Precise)

A typical 100-person company loses approximately **$40,000–$120,000** per offboarding in combined cost:
- IT staff time for manual access removal across 15–40 systems
- Risk from orphaned access (average dwell time post-departure: 5 days)
- Knowledge destruction (critical undocumented processes lost permanently)
- Compliance exposure (SOC2, ISO 27001, GDPR access control requirements)
- Project disruption from poorly executed ownership transfers

FLOW's target customer (Series A–C B2B SaaS companies, 50–500 employees) has exactly this problem and no credible solution today.

### 2.3 Why This Feature Belongs in FLOW (Not Okta)

| Capability | Okta / BetterCloud | Rippling | FLOW |
|---|---|---|---|
| Remove access from SaaS tools | ✅ | ✅ | ✅ |
| Know *what the employee owned* | ❌ | Partial (HR data only) | ✅ (Operational Graph + connectors) |
| Know *who depended on them* | ❌ | ❌ | ✅ (Graph relationships) |
| Know *what knowledge leaves* | ❌ | ❌ | ✅ (Org Memory + vector index) |
| Generate Knowledge Transfer Report | ❌ | ❌ | ✅ (LLM over Memory + docs) |
| Suggest successors based on collaboration history | ❌ | ❌ | ✅ (Graph-weighted) |
| Explainable recommendations with evidence | ❌ | ❌ | ✅ (Recommendation Engine) |
| Human-approved execution with governance | Partial | Partial | ✅ (Governance + Approval Engine) |
| Immutable compliance certificate | Basic | Basic | ✅ (Audit + SHA256 hash) |
| Context-aware copilot during review | ❌ | ❌ | ✅ (AI Copilot) |

**Core differentiation:** Okta knows Sarah has a Gmail account. FLOW knows Sarah authored the payment gateway RFC, owns three GitHub repositories with no contributors, is the only person who attended the last four Stripe integration planning meetings, and has 47 Notion documents that reference the billing system no one else understands.

---

## 3. Architecture Analysis

### 3.1 Fully Reusable (Zero Code Changes Required)

| Component | Location | Role in Offboarding |
|---|---|---|
| Connector Framework | `src/connectors/` | Fan-out discovery + execution across all providers |
| ExecutionEngine | `src/connectors/executionEngine.js` | Execute each revocation/transfer action with governance gate |
| GovernanceEngine | `src/core/governance/` | Policy evaluation before every action |
| ApprovalStore | `src/core/governance/approvalStore.js` | Manager approval workflow |
| AuditPersistence | `src/core/governance/auditPersistence.js` | Immutable log of every action |
| OperationalGraph | `src/services/operationalGraphService.js` | Discover who depends on the employee |
| OrgMemory | `src/services/orgMemoryService.js` (Phase 7) | Query all decisions, incidents employee was involved in |
| CopilotService | `src/services/copilotService.js` | Answer HR/Manager questions during review |
| BriefingEngine | `src/services/briefingEngine.js` | Generate role-aware offboarding brief for manager |
| EventBus | `src/core/events/eventBus.js` | Trigger automation subscribers on lifecycle events |
| WebSocket | `src/services/socketService.js` | Stream execution progress in real time |
| Action Center | `flow-os-frontend/src/components/ui/ActionCenter.jsx` | UI for manager to review + approve each action |
| Timeline | `flow-os-frontend/src/components/workspace/OperationalTimeline.jsx` | Show execution progress |
| SearchOrchestrator | `src/connectors/searchOrchestrator.js` | Search across all connectors for owned assets |
| VectorStore | pgvector `workspace_intel_chunks` | Semantic search for knowledge the employee contributed |
| RAG Pipeline | `src/routes/queryRoutes.js` | Query "what did [employee] know/build/decide?" |

### 3.2 Partially Reusable (Minor Extension Required)

| Component | Extension Needed |
|---|---|
| `WorkdayAdapter.js` / `BambooHRAdapter.js` | Add `EMPLOYEE_STATUS_CHANGED` webhook handler; emit `LIFECYCLE_EVENT_TRIGGERED` on eventBus |
| `HubSpotAdapter.js` / `SalesforceAdapter.js` | Add `TRANSFER_CUSTOMER_OWNERSHIP` action type |
| `GitHubAdapter.js` | Add `TRANSFER_REPO_OWNERSHIP`, `REMOVE_USER` action types |
| `JiraAdapter.js` | Add `REASSIGN_ISSUES`, `REMOVE_PROJECT_MEMBER` action types |
| `NotionAdapter.js` | Add `TRANSFER_PAGE_OWNERSHIP`, `ARCHIVE_PAGES` action types |
| `GmailAdapter.js` | Add `DISABLE_ACCOUNT` (via Google Workspace Admin if service account available) |
| `BriefingEngine` | Add `OFFBOARDING_MANAGER` role type generating plan-aware briefing |
| `AutomationEngine` | Register `LIFECYCLE_EVENT_TRIGGERED` as a valid trigger event type |
| `Governance constants.js` | Add `lifecycle.*` action namespace to role-action matrix |
| `User` Prisma model | Add `employmentStatus`, `department`, `managerId`, `jobTitle`, `startDate`, `terminationDate` fields |
| `GraphNode` | Add `ASSET` node type for discovered owned resources |

### 3.3 New Components Required

| Component | Type | Purpose |
|---|---|---|
| `LifecycleEventService` | Backend service | Detect, store, and orchestrate lifecycle events |
| `AssetDiscoveryService` | Backend service | Fan-out across all connectors to find everything the employee owns |
| `OffboardingPlanService` | Backend service | Generate AI-ranked, evidence-backed offboarding task list |
| `KnowledgeTransferService` | Backend service | Extract implicit knowledge from Memory, vectors, and docs; generate KT report |
| `SuccessorRecommendationService` | Backend service | Graph-weighted successor suggestion for each owned asset |
| `ComplianceCertificateService` | Backend service | Generate tamper-evident PDF-ready certificate after plan completes |
| `lifecycleEventRoutes.js` | Route | REST API for HR systems to push lifecycle events |
| `offboardingRoutes.js` | Route | REST API for plan management, approval, execution |
| `OffboardingDashboard.jsx` | Frontend | HR view: all active offboardings |
| `OffboardingPlanView.jsx` | Frontend | Plan review + approval UI with evidence cards |
| `KnowledgeTransferView.jsx` | Frontend | KT report UI with risk heatmap |
| `OffboardingTimeline.jsx` | Frontend | Live execution progress view |
| `ComplianceCertificateView.jsx` | Frontend | Certificate display + download |

---

## 4. Data Architecture

### 4.1 Prisma Schema Additions

```prisma
// ─── Employee Lifecycle ───────────────────────────────────────────────────────

// Extend the User model (addition to existing fields):
// employmentStatus  String   @default("active")  // active | on_leave | leaving | terminated
// department        String?
// jobTitle          String?
// managerId         String?  -- references User.id
// startDate         DateTime?
// terminationDate   DateTime?
// hrSystemId        String?  -- external HR system record ID

model LifecycleEvent {
  id            String              @id @default(cuid())
  orgId         String              @map("org_id")
  workspaceId   String              @map("workspace_id")
  employeeId    String              @map("employee_id")   // User.id
  employeeName  String              @map("employee_name")
  employeeEmail String              @map("employee_email")
  managerId     String?             @map("manager_id")    // User.id of direct manager
  eventType     LifecycleEventType
  effectiveDate DateTime            @map("effective_date")
  metadata      Json                @default("{}")        // department, jobTitle, reason
  status        LifecycleEventStatus @default(PENDING)
  source        String              @default("manual")    // "manual" | "workday" | "bamboohr" | "api"
  createdAt     DateTime            @default(now())       @map("created_at")
  updatedAt     DateTime            @updatedAt            @map("updated_at")

  offboardingPlan OffboardingPlan?

  @@index([orgId])
  @@index([workspaceId])
  @@index([employeeId])
  @@index([status])
  @@map("lifecycle_events")
}

enum LifecycleEventType {
  HIRE
  ONBOARD
  ROLE_CHANGE
  PROMOTION
  DEPARTMENT_TRANSFER
  LEAVE_START
  LEAVE_END
  CONTRACT_EXPIRY
  OFFBOARDING
  OFFBOARDING_COMPLETE
}

enum LifecycleEventStatus {
  PENDING
  DISCOVERY       // AI discovery phase running
  PLANNING        // Plan generation running
  AWAITING_APPROVAL
  EXECUTING
  COMPLETE
  CANCELLED
}

model OffboardingPlan {
  id               String      @id @default(cuid())
  lifecycleEventId String      @unique @map("lifecycle_event_id")
  orgId            String      @map("org_id")
  workspaceId      String      @map("workspace_id")
  employeeId       String      @map("employee_id")
  managerId        String?     @map("manager_id")
  effectiveDate    DateTime    @map("effective_date")
  status           PlanStatus  @default(DRAFT)
  riskScore        Int         @default(0)          // 0-100 composite risk
  aiSummary        String?     @db.Text             // LLM executive summary
  discoveryResult  Json        @default("{}")        // raw discovery output
  generatedAt      DateTime    @default(now())       @map("generated_at")
  approvedBy       String?     @map("approved_by")
  approvedAt       DateTime?   @map("approved_at")
  completedAt      DateTime?   @map("completed_at")
  createdAt        DateTime    @default(now())       @map("created_at")
  updatedAt        DateTime    @updatedAt            @map("updated_at")

  lifecycleEvent       LifecycleEvent           @relation(fields: [lifecycleEventId], references: [id])
  tasks                OffboardingTask[]
  knowledgeReport      KnowledgeTransferReport?
  complianceCertificate ComplianceCertificate?

  @@index([orgId])
  @@index([workspaceId])
  @@index([employeeId])
  @@index([status])
  @@map("offboarding_plans")
}

enum PlanStatus {
  DRAFT
  AWAITING_APPROVAL
  APPROVED
  EXECUTING
  COMPLETE
  CANCELLED
}

model OffboardingTask {
  id             String         @id @default(cuid())
  planId         String         @map("plan_id")
  category       TaskCategory
  priority       TaskPriority
  title          String
  description    String?        @db.Text
  connector      String?                            // 'gmail' | 'github' | 'jira' | etc.
  actionType     String?        @map("action_type") // connector action enum value
  payload        Json           @default("{}")      // action payload (no secrets)
  successorId    String?        @map("successor_id") // recommended inheritor (User.id)
  confidence     Float          @default(0.0)       // 0.0–1.0 AI confidence
  businessImpact BusinessImpact
  evidence       Json           @default("[]")      // [{source, quote, authorityWeight}]
  status         TaskStatus     @default(PENDING)
  approvalId     String?        @map("approval_id") // PendingApproval.id if escalated
  auditLogId     String?        @map("audit_log_id")
  failureReason  String?        @map("failure_reason") @db.Text
  executedAt     DateTime?      @map("executed_at")
  createdAt      DateTime       @default(now())     @map("created_at")
  updatedAt      DateTime       @updatedAt          @map("updated_at")

  plan OffboardingPlan @relation(fields: [planId], references: [id], onDelete: Cascade)

  @@index([planId, priority])
  @@index([planId, status])
  @@index([connector])
  @@map("offboarding_tasks")
}

enum TaskCategory {
  ACCOUNT_REVOCATION
  OWNERSHIP_TRANSFER
  KNOWLEDGE_TRANSFER
  MEETING_REASSIGNMENT
  CUSTOMER_HANDOVER
  PROJECT_HANDOVER
  DOCUMENT_ARCHIVE
  APPROVAL_HANDLING
  COMPLIANCE
}

enum TaskPriority {
  CRITICAL
  HIGH
  MEDIUM
  LOW
}

enum BusinessImpact {
  CRITICAL
  HIGH
  MEDIUM
  LOW
}

enum TaskStatus {
  PENDING
  AWAITING_APPROVAL
  APPROVED
  EXECUTING
  COMPLETE
  FAILED
  SKIPPED
}

model KnowledgeTransferReport {
  id          String   @id @default(cuid())
  planId      String   @unique @map("plan_id")
  orgId       String   @map("org_id")
  workspaceId String   @map("workspace_id")
  employeeId  String   @map("employee_id")
  generatedAt DateTime @default(now()) @map("generated_at")

  // Structured knowledge inventory
  technicalKnowledge   Json @default("[]") // [{ name, type, description, riskIfLost, successorId }]
  businessKnowledge    Json @default("[]") // customers, roadmap ownership, vendor relationships
  documentationOwned   Json @default("[]") // notion pages, runbooks, RFCs, ADRs
  riskAnalysis         Json @default("{}")  // { criticalSpofs: [], orphanedRepos: [], customerRisks: [] }
  successorSuggestions Json @default("[]") // [{ assetId, assetType, successorId, collaborationScore, reason }]

  // LLM-generated narrative sections
  executiveSummary   String? @db.Text @map("executive_summary")
  keyRisks           String? @db.Text @map("key_risks")
  transferPriorities String? @db.Text @map("transfer_priorities")
  hiddenDependencies String? @db.Text @map("hidden_dependencies") // what the graph reveals that HR didn't know

  plan OffboardingPlan @relation(fields: [planId], references: [id], onDelete: Cascade)

  @@index([orgId])
  @@index([employeeId])
  @@map("knowledge_transfer_reports")
}

model ComplianceCertificate {
  id            String   @id @default(cuid())
  planId        String   @unique @map("plan_id")
  orgId         String   @map("org_id")
  workspaceId   String   @map("workspace_id")
  employeeId    String   @map("employee_id")
  employeeName  String   @map("employee_name")
  employeeEmail String   @map("employee_email")
  approvedBy    String   @map("approved_by")      // User.id of approver
  approverName  String   @map("approver_name")
  issuedAt      DateTime @default(now())           @map("issued_at")
  effectiveDate DateTime @map("effective_date")

  // Completion record
  accountsRevoked    Json @default("[]") // [{ system, timestamp, auditLogId, executedBy }]
  transfersCompleted Json @default("[]") // [{ asset, assetType, from, to, timestamp, auditLogId }]
  pendingItems       Json @default("[]") // [{ item, reason, owner, expectedDate }]
  blockedItems       Json @default("[]") // [{ item, reason, blockingFactor, escalatedTo }]

  // Integrity
  auditLogIds Json   @default("[]") @map("audit_log_ids") // all AuditLog.id references
  certHash    String @map("cert_hash")                    // SHA256 of canonical JSON — tamper detection

  plan OffboardingPlan @relation(fields: [planId], references: [id])

  @@index([orgId])
  @@index([employeeId])
  @@index([issuedAt])
  @@map("compliance_certificates")
}
```

### 4.2 SQL Migration Notes

- Add `employment_status`, `department`, `job_title`, `manager_id`, `start_date`, `termination_date`, `hr_system_id` columns to `users` table (all nullable, backward-compatible).
- All new tables created idempotently (`CREATE TABLE IF NOT EXISTS`).
- Add `ASSET` to `GraphNode.type` check constraint (currently free-form string, no constraint needed).
- No changes to existing indexed columns on core tables.

---

## 5. Service Architecture

### 5.1 New Services

```
src/services/
├── lifecycleEventService.js         # Create/update lifecycle events; emit eventBus trigger
├── assetDiscoveryService.js         # Fan-out discovery across all connectors; graph query
├── offboardingPlanService.js        # Build ranked task list from discovery results
├── knowledgeTransferService.js      # Extract knowledge from Memory, vectors, docs; generate KT report
├── successorRecommendationService.js # Graph-weighted collaborator ranking per asset type
└── complianceCertificateService.js  # Assemble + hash compliance certificate on plan completion
```

### 5.2 Service Responsibilities

**`lifecycleEventService.js`**
```
createEvent(orgId, workspaceId, employeeId, eventType, effectiveDate, metadata)
  → persist LifecycleEvent
  → emit eventBus: LIFECYCLE_EVENT_TRIGGERED
  → if eventType === 'OFFBOARDING': trigger background job on BullMQ 'lifecycle-queue'

getEvent(id, orgId)
updateEventStatus(id, orgId, status)
listEvents(orgId, { status, employeeId, eventType })
```

**`assetDiscoveryService.js`**
- Runs as a BullMQ job on `lifecycle-queue`
- Queries **OperationalGraph** (`operationalGraphService`): all GraphNodes where `metadata.ownerId === employeeId` OR edges where source is employee's graph node
- Queries **GitHub** via connector: repos where employee is OWNER or sole contributor; open PRs authored
- Queries **Jira** via connector: issues assigned; boards where employee is sprint owner
- Queries **Notion** via connector: pages authored; databases owned
- Queries **Google Drive** via connector: files and folders where employee is Owner
- Queries **Gmail**: email threads with customers (via CRM relationship)
- Queries **Calendar**: recurring meetings organizer
- Queries **CRM** (HubSpot/Salesforce): customer accounts where employee is primary contact
- Queries **OrgMemory**: decisions employee authored; incidents they investigated
- Queries **VectorStore** (pgvector): semantic search for `author:{email}` chunks
- Returns: `DiscoveryResult` object with assets grouped by category

**`offboardingPlanService.js`**
- Accepts `DiscoveryResult`
- For each discovered asset: calls Gemini to score `{ priority, confidence, businessImpact, suggestedAction, evidence }`
- Calls `successorRecommendationService` for each transferable asset
- Assembles sorted `OffboardingTask[]`
- Calls Gemini for `aiSummary` and `riskScore` (0–100)
- Persists `OffboardingPlan` + `OffboardingTask[]`
- Heuristic fallback: static priority matrix if Gemini unavailable

**`knowledgeTransferService.js`**
- Runs in parallel with `offboardingPlanService`
- Queries VectorStore: RAG query `"What did {employeeName} build, decide, or own?"` → top 30 chunks
- Queries OrgMemory: `{ author: employeeName }` decisions and incidents
- Queries GraphNode 2-hop traversal from employee node → all connected DOCUMENT, PROJECT, SYSTEM nodes
- Calls Gemini to generate:
  - `executiveSummary`: what this person knew, built, and owned
  - `keyRisks`: what is most at risk if KT is incomplete
  - `transferPriorities`: ordered list of knowledge to transfer first
  - `hiddenDependencies`: non-obvious things the graph reveals
- Heuristic fallback: structured Markdown from raw data if Gemini unavailable

**`successorRecommendationService.js`**
- For each asset, finds all users in the org who have graph edges to the same asset (`COLLABORATES_ON`, `REVIEWS`, `CONTRIBUTES_TO`, `ATTENDS`, `CO-OWNS`)
- Scores each candidate: `graphProximityScore × collaborationFrequency × currentWorkload (inverse)`
- Returns top 3 ranked successors per asset with `reason` string
- Purely graph-based: no LLM call needed

**`complianceCertificateService.js`**
- Triggered when plan reaches `COMPLETE` status
- Collects all `OffboardingTask` records with `status=COMPLETE` + their `auditLogId`
- Fetches AuditLog rows for evidence chain
- Assembles canonical JSON certificate
- Computes `certHash = SHA256(JSON.stringify(canonicalCert))`
- Persists `ComplianceCertificate`
- Emits `OFFBOARDING_COMPLETE` on eventBus

---

## 6. API Design

**Mount point:** `/api/workforce/lifecycle`

```
POST   /api/workforce/lifecycle/events
       Body: { employeeId, eventType, effectiveDate, metadata }
       Auth: JWT + workspace-id + ADMIN
       → Creates LifecycleEvent; triggers discovery job for OFFBOARDING

GET    /api/workforce/lifecycle/events
       Query: ?status=&employeeId=&eventType=
       Auth: JWT + workspace-id + ADMIN
       → List all lifecycle events for workspace

GET    /api/workforce/lifecycle/events/:id
       Auth: JWT + workspace-id
       → Single event with embedded plan summary

GET    /api/workforce/lifecycle/events/:id/status
       Auth: JWT + workspace-id
       → Live status + WebSocket event stream subscription token

GET    /api/workforce/lifecycle/plans/:planId
       Auth: JWT + workspace-id
       → Full plan with all tasks, KT report summary, risk score

GET    /api/workforce/lifecycle/plans/:planId/tasks
       Query: ?category=&priority=&status=
       Auth: JWT + workspace-id
       → Filtered task list

POST   /api/workforce/lifecycle/plans/:planId/approve
       Body: { approverId, note? }
       Auth: JWT + workspace-id + ADMIN+
       → Transition plan AWAITING_APPROVAL → APPROVED; trigger execution

POST   /api/workforce/lifecycle/plans/:planId/tasks/:taskId/skip
       Body: { reason }
       Auth: JWT + workspace-id + ADMIN+
       → Mark task SKIPPED with reason

GET    /api/workforce/lifecycle/plans/:planId/knowledge-transfer
       Auth: JWT + workspace-id
       → Full KnowledgeTransferReport

GET    /api/workforce/lifecycle/plans/:planId/compliance-certificate
       Auth: JWT + workspace-id + ADMIN+
       → ComplianceCertificate (includes certHash for verification)

GET    /api/workforce/lifecycle/plans/:planId/compliance-certificate/pdf
       Auth: JWT + workspace-id + ADMIN+
       → Rendered PDF certificate (via server-side template)

POST   /api/workforce/lifecycle/webhook/hr-system
       Auth: HMAC signature (configured per HR system integration)
       → Receives Workday / BambooHR webhook events; creates LifecycleEvent automatically
```

**WebSocket Events (new)**

| Event | Trigger |
|---|---|
| `LIFECYCLE_DISCOVERY_STARTED` | BullMQ job begins |
| `LIFECYCLE_DISCOVERY_PROGRESS` | Each connector scan completes |
| `LIFECYCLE_PLAN_READY` | Plan + KT report generated |
| `LIFECYCLE_TASK_EXECUTING` | Individual task execution starts |
| `LIFECYCLE_TASK_COMPLETE` | Individual task succeeds |
| `LIFECYCLE_TASK_FAILED` | Individual task fails |
| `LIFECYCLE_TASK_BLOCKED` | Task requires additional approval |
| `LIFECYCLE_PLAN_COMPLETE` | All tasks done |
| `LIFECYCLE_CERTIFICATE_ISSUED` | Compliance certificate generated |
| `OFFBOARDING_COMPLETE` | Full workflow done |

---

## 7. Operational Brain Reasoning Flow

When the Brain receives a `LIFECYCLE_EVENT_TRIGGERED` event for an `OFFBOARDING`, it executes a structured reasoning chain:

```
TRIGGER: LifecycleEvent { employeeId: "user_xyz", eventType: "OFFBOARDING" }

STEP 1 — Identity Resolution
  Load User record → { name, email, role, department, managerId, startDate }
  Load WorkspaceMember record → { workspaceRole }
  Load GraphNode for employee → { type: "USER", id: "user:flow:xyz" }

STEP 2 — Ownership Mapping (Operational Graph)
  getNeighbors("user:flow:xyz", { direction: "outEdge", depth: 2 })
  → nodes where relationshipType IN:
    OWNS | AUTHORED | MAINTAINS | ORGANIZES | ASSIGNED_TO |
    PRIMARY_CONTACT | SOLE_CONTRIBUTOR | APPROVES | MANAGES

STEP 3 — Dependency Mapping (reverse graph)
  getNeighbors("user:flow:xyz", { direction: "inEdge", depth: 2 })
  → nodes where relationshipType IN:
    DEPENDS_ON | REPORTS_TO | REQUIRES_APPROVAL_FROM | BLOCKS

STEP 4 — Knowledge Extraction (Vector + Memory)
  VectorStore semantic search:
    queries = [
      "authored by {email}",
      "designed by {name}",
      "owned by {name}",
      "contact: {name}",
    ]
    → top 40 chunks, authority-weighted
  OrgMemory:
    { author: name, type: [DECISION, INCIDENT] }
    → all decisions employee made or co-authored

STEP 5 — Single Point of Failure Detection
  For each owned GraphNode:
    countCollaborators(nodeId) → if count === 1, flag SPOF: true
  For each SPOF:
    businessImpactScore = node.weight × systemCriticalityScore

STEP 6 — Customer Risk Assessment
  GraphNodes of type CUSTOMER adjacent to employee:
    customerRisk = { customerId, name, primaryContactOnly: bool, arr: float }

STEP 7 — LLM Synthesis (Gemini 2.5 Flash)
  Prompt: structured JSON of all above findings
  Output:
    {
      overallRiskScore: 0-100,
      criticalFindings: [{ asset, risk, evidence, confidence }],
      recommendedActions: [{ action, priority, successor, reasoning }],
      hiddenRisks: [{ description, evidence }],
      executiveSummary: "string"
    }

STEP 8 — Fallback (no GEMINI_API_KEY or API failure)
  Heuristic scoring:
    riskScore = (spofCount × 15) + (customerCount × 20) + (repoCount × 8) + (jiraOwnerCount × 5)
    Capped at 100
  Static recommendation templates per asset type
```

---

## 8. Discovery Flow

```
HR / API triggers OFFBOARDING event
          ↓
lifecycleEventService.createEvent()
          ↓
BullMQ 'lifecycle-queue' job pushed: { planId, employeeId, workspaceId }
          ↓
          │
          ├──── GraphQuery ──────────────────────────────────────────────────────┐
          │     operationalGraphService.getRelatedContext(employeeNodeId)         │
          │     → All connected assets (depth 2)                                 │
          │     → Edge types: OWNS, AUTHORS, MAINTAINS, ORGANIZES, APPROVES      │
          └─────────────────────────────────────────────────────────────────────┘
          │
          ├──── ConnectorFanOut (Promise.allSettled) ────────────────────────────┐
          │     searchOrchestrator.search({ query: employeeEmail, connectors: *}) │
          │     GitHubAdapter:  listRepos(filter: owner/contributor=email)        │
          │     JiraAdapter:    listIssues(assignee=email) + listBoards()         │
          │     NotionAdapter:  searchPages(author=email)                         │
          │     GmailAdapter:   listCustomerThreads() [via CRM graph edges]       │
          │     CalendarAdapter: listOrganizedMeetings(organizer=email)           │
          │     CRMAdapter:     listOwnedAccounts(primaryContact=email)           │
          │     DriveAdapter:   listOwnedFiles(owner=email)                       │
          └─────────────────────────────────────────────────────────────────────┘
          │
          ├──── VectorStore Query ───────────────────────────────────────────────┐
          │     pgvector ANN search: embedding("authored by {email}")             │
          │     + exact filter: metadata.sender = email                           │
          │     → Top 40 chunks with authority weight                             │
          └─────────────────────────────────────────────────────────────────────┘
          │
          ├──── OrgMemory Query ────────────────────────────────────────────────┐
          │     orgMemoryService.query({ author: name })                          │
          │     → DECISION, INCIDENT, PROJECT_EVENT records                      │
          └─────────────────────────────────────────────────────────────────────┘
          │
          ↓
assetDiscoveryService.consolidate(results)
  → Deduplicate (same asset found by graph + connector)
  → Classify: ACCOUNT | REPOSITORY | DOCUMENT | MEETING | CUSTOMER | ISSUE
  → Flag SPOFs (sole owner/contributor/contact)
  → Emit: LIFECYCLE_DISCOVERY_PROGRESS (per connector batch)
          ↓
offboardingPlanService.generate(discoveryResult)
  [parallel] knowledgeTransferService.generate(discoveryResult)
          ↓
persisted: OffboardingPlan + OffboardingTask[] + KnowledgeTransferReport
          ↓
emit: LIFECYCLE_PLAN_READY
broadcast WebSocket: { planId, taskCount, riskScore }
```

---

## 9. Recommendation & Plan Generation Flow

```
Discovery Result arrives
          ↓
offboardingPlanService.buildTasks(discoveryResult)
          │
          ├── For each ACCOUNT (Gmail, Slack, GitHub, Jira, Notion):
          │     task = {
          │       category: ACCOUNT_REVOCATION,
          │       priority: CRITICAL,  ← always critical (compliance/security)
          │       confidence: 0.99,
          │       businessImpact: HIGH,
          │       connector: "gmail",
          │       actionType: "DISABLE_ACCOUNT",
          │       evidence: [{ source: "hr_system", field: "email" }]
          │     }
          │
          ├── For each REPOSITORY where employee is sole contributor:
          │     successors = successorRecommendationService.rank(repoId, employeeId)
          │     task = {
          │       category: OWNERSHIP_TRANSFER,
          │       priority: CRITICAL,
          │       confidence: 0.98,
          │       businessImpact: CRITICAL,
          │       connector: "github",
          │       actionType: "TRANSFER_REPO_OWNERSHIP",
          │       successorId: successors[0].userId,
          │       evidence: [{ source: "graph", edge: "SOLE_CONTRIBUTOR", nodeId: repoId }]
          │     }
          │
          ├── For each REPOSITORY where employee has collaborators:
          │     task = {
          │       category: OWNERSHIP_TRANSFER,
          │       priority: HIGH,
          │       confidence: 0.90,
          │       businessImpact: HIGH,
          │       ...
          │     }
          │
          ├── For each CUSTOMER (primary contact only):
          │     task = {
          │       category: CUSTOMER_HANDOVER,
          │       priority: CRITICAL,
          │       confidence: 0.97,
          │       businessImpact: CRITICAL,
          │       connector: "hubspot",
          │       actionType: "TRANSFER_CUSTOMER_OWNERSHIP",
          │       successorId: successors[0].userId,
          │       evidence: [{ source: "crm", role: "PRIMARY_CONTACT" }]
          │     }
          │
          ├── For each JIRA BOARD (sprint owner):
          │     task = { category: PROJECT_HANDOVER, priority: HIGH, ... }
          │
          ├── For each ORGANIZED RECURRING MEETING:
          │     task = { category: MEETING_REASSIGNMENT, priority: MEDIUM, ... }
          │
          ├── For each NOTION PAGE with no co-authors:
          │     task = { category: DOCUMENT_ARCHIVE or OWNERSHIP_TRANSFER, priority: MEDIUM, ... }
          │
          └── For each PENDING APPROVAL the employee was approver for:
                task = { category: APPROVAL_HANDLING, priority: HIGH, ... }

          ↓
LLM Ranking Pass (Gemini 2.5 Flash):
  Input: all tasks + employee context
  Output: final priority ordering + businessImpact overrides + merged duplicates
          ↓
Sort: CRITICAL → HIGH → MEDIUM → LOW
      Within priority: by businessImpact score × confidence
          ↓
Persist: OffboardingPlan.tasks = sorted task array
Compute: riskScore = weighted aggregate of CRITICAL and HIGH tasks
Emit: LIFECYCLE_PLAN_READY
```

---

## 10. Knowledge Transfer Flow

```
knowledgeTransferService.generate(discoveryResult, employeeContext)
          │
          ├── Technical Knowledge Extraction
          │     Input: GitHub repos, services in GraphNode[type=SYSTEM], Jira boards
          │     Per item: { name, type, description, riskIfLost, successorId, collaborationScore }
          │
          ├── Business Knowledge Extraction
          │     Input: CRM accounts (primary contact), roadmap decisions from OrgMemory
          │     Per item: { customer/project, employeeRole, lastInteraction, riskIfLost }
          │
          ├── Documentation Inventory
          │     Input: Notion pages (authored), Vault files, VectorStore chunks (author=email)
          │     Per item: { title, url, type, topics, viewCount, hasSuccessor }
          │
          ├── Risk Analysis
          │     criticalSpofs: assets where employee is sole owner AND criticality > 0.7
          │     orphanedRepos: repos with no other contributors
          │     customerRisks: customers with no secondary contact
          │     deploymentRisks: deployments employee owns in production
          │
          ├── Successor Suggestions
          │     For each transferable asset:
          │       successorRecommendationService.rank(assetId, employeeId)
          │       Returns: [{ userId, name, score, reason, collaborationEdgeCount }]
          │
          └── LLM Narrative Generation (Gemini 2.5 Flash)
                Prompt sections:
                  - "Generate executive summary of what [name] built and owned"
                  - "List the top 5 risks if knowledge transfer is incomplete"
                  - "Identify hidden dependencies that HR may not know about"
                  - "Recommend transfer priorities based on business impact"

                Output: {
                  executiveSummary,
                  keyRisks,
                  transferPriorities,
                  hiddenDependencies
                }

                Fallback: Structured Markdown template from raw data

          ↓
Persisted: KnowledgeTransferReport
```

---

## 11. Execution Flow

```
Plan approved (approverId, planId)
          ↓
offboardingPlanService.execute(planId, approverId)
          ↓
Load all OffboardingTask[] ordered by priority

For each task (sequential within category, parallel across categories):
          │
          ├── governance: evaluateWithPolicies({
          │     workspaceId,
          │     role: ADMIN,          ← offboarding actions always run as ADMIN actor
          │     connectorId: task.connector,
          │     actionType: task.actionType,
          │     approvedBy: approverId
          │   })
          │
          │   → ALLOW:
          │       executionEngine.executeAction({
          │         connectorId: task.connector,
          │         workspaceId,
          │         actionType: task.actionType,
          │         payload: task.payload,
          │         actor: { userId: approverId, role: 'ADMIN' },
          │         context: { lifecycleEventId, planId, taskId }
          │       })
          │       → connector adapter executes
          │       → auditPersistence.write() → AuditLog row
          │       → task.status = COMPLETE, task.auditLogId = id
          │       → emit: LIFECYCLE_TASK_COMPLETE
          │
          │   → REQUIRE_APPROVAL:
          │       approvalStore.create(...)  → PendingApproval
          │       task.status = AWAITING_APPROVAL
          │       task.approvalId = pendingApproval.id
          │       emit: LIFECYCLE_TASK_BLOCKED
          │       [paused — resumes when approval resolves]
          │
          │   → DENY:
          │       task.status = FAILED, task.failureReason = "Denied by policy"
          │       emit: LIFECYCLE_TASK_FAILED
          │
          └── (error): task.status = FAILED, task.failureReason = err.message
                       emit: LIFECYCLE_TASK_FAILED
                       continue to next task (non-blocking failure)

All tasks terminal (COMPLETE | FAILED | SKIPPED):
          ↓
plan.status = COMPLETE
complianceCertificateService.issue(planId)
          ↓
emit: LIFECYCLE_CERTIFICATE_ISSUED
emit: OFFBOARDING_COMPLETE
broadcast WebSocket: { planId, certificate }
```

**Execution Categories and Order**

| Phase | Categories Executed | Why This Order |
|---|---|---|
| 1. Knowledge capture first | KNOWLEDGE_TRANSFER | Capture before any access is removed |
| 2. Handover | OWNERSHIP_TRANSFER, CUSTOMER_HANDOVER, PROJECT_HANDOVER | Transfer while account still accessible |
| 3. Reassignment | MEETING_REASSIGNMENT, APPROVAL_HANDLING | Clear operational dependencies |
| 4. Archival | DOCUMENT_ARCHIVE | Archive after handover completes |
| 5. Revocation | ACCOUNT_REVOCATION | Remove access last (after all transfers confirmed) |
| 6. Compliance | COMPLIANCE | Certificate issued only after all above |

---

## 12. Audit & Compliance Flow

```
All tasks complete
          ↓
complianceCertificateService.issue(planId)
          │
          ├── Load all AuditLog rows referenced by task.auditLogId
          │
          ├── Assemble canonicalCert JSON:
          │   {
          │     certificateVersion: "1.0",
          │     issuedAt: ISO8601,
          │     issuer: { orgId, orgName, workspaceId },
          │     subject: { employeeId, employeeName, employeeEmail, terminationDate },
          │     approver: { approverId, approverName, approvedAt },
          │     accountsRevoked: [{ system, revokedAt, auditLogId, executedBy }],
          │     transfersCompleted: [{ assetType, assetId, from, to, transferredAt, auditLogId }],
          │     pendingItems: [{ description, owner, expectedDate }],
          │     blockedItems: [{ description, reason, escalatedTo }],
          │     auditLogIds: [id1, id2, ...],
          │     totalActionsExecuted: N,
          │     totalActionsSkipped: N,
          │     totalActionsFailed: N
          │   }
          │
          ├── certHash = SHA256(JSON.stringify(canonicalCert, null, 0))
          │   (canonical: no whitespace, keys sorted alphabetically)
          │
          ├── Persist ComplianceCertificate { ...canonicalCert, certHash }
          │
          └── emit: LIFECYCLE_CERTIFICATE_ISSUED
                    OFFBOARDING_COMPLETE

Verification (future):
  GET /compliance-certificate/:planId → returns { cert, certHash }
  SHA256(JSON.stringify(cert)) must equal certHash
  Any modification post-issuance produces certHash mismatch → tampered flag
```

---

## 13. Sequence Diagrams

### 13.1 Full Offboarding Sequence

```
HR System     FLOW API     BullMQ      OperationalBrain    Connectors    Manager    AuditLog
    │              │           │               │                │            │           │
    │──POST event──►│           │               │                │            │           │
    │              │──push job──►               │                │            │           │
    │◄─202 Accepted─│           │               │                │            │           │
    │              │       [async]              │                │            │           │
    │              │           │──Discovery────►│                │            │           │
    │              │           │         ──graph query──────────────          │           │
    │              │           │         ──connector fanout─────────►         │           │
    │              │           │                │            ◄─────scan────── │           │
    │              │           │         ──vectorStore query──                │           │
    │              │           │         ──orgMemory query───                 │           │
    │              │           │         ──LLM reasoning────                  │           │
    │              │           │         ──plan generation──                  │           │
    │              │           │               │                │            │           │
    │              │◄─WS: PLAN_READY──────────────────────────────►           │           │
    │              │           │               │                │            │           │
    │              │           │               │                │──────────►WS notif      │
    │              │           │               │                │            │           │
    │              │◄─────────────────────────────────── GET /plan/:id ──────►           │
    │              │─────────────────────────────────── plan + KT report ───►│           │
    │              │           │               │                │            │           │
    │              │◄─────────────────────────────────── POST /approve ──────►           │
    │              │           │               │                │            │           │
    │              │           │──Execute──────►│                │            │           │
    │              │           │         ──governance check──                 │           │
    │              │           │         ──executeAction─────────────────────►│          │
    │              │           │                │                │────────────────write──►│
    │              │◄─WS: TASK_COMPLETE────────────────────────────────────────►         │
    │              │           │         ... (per task)          │            │           │
    │              │           │               │                │            │           │
    │              │           │──Cert issue───►│                │            │           │
    │              │           │         ──SHA256 hash──                      │           │
    │              │◄─WS: CERTIFICATE_ISSUED──────────────────────────────────►          │
```

### 13.2 Successor Recommendation Sequence

```
OffboardingPlan     SuccessorService    OperationalGraph    VectorStore
      │                    │                  │                  │
      │──rank(repoId)─────►│                  │                  │
      │                    │──getNeighbors────►│                  │
      │                    │◄─collaborators────│                  │
      │                    │──semantic search──────────────────►  │
      │                    │◄─coauthors─────────────────────────  │
      │                    │──score(workload, proximity)          │
      │                    │──rank descending                     │
      │◄─[{userId, score}]─│                  │                  │
```

---

## 14. UI Wireframes

### 14.1 Offboarding Dashboard (`/workforce/offboarding`)

```
┌─ FLOW OS ──────────────────────────────────────────────────────────────────────┐
│  [Sidebar]  │  Workforce Intelligence › Offboarding                            │
│             │                                                                  │
│             │  Active Offboardings                          [+ New Offboarding] │
│             │  ┌──────────────────────────────────────────────────────────┐   │
│             │  │ 🔴 Sarah Chen          Engineering    Risk: 87    Day 2   │   │
│             │  │    3 critical tasks pending • GitHub: sole owner 4 repos  │   │
│             │  │    [View Plan]  [Resume Execution]                        │   │
│             │  ├──────────────────────────────────────────────────────────┤   │
│             │  │ 🟡 Marcus Webb         Sales          Risk: 54    Day 1   │   │
│             │  │    Awaiting manager approval • 2 customers to transfer    │   │
│             │  │    [View Plan]  [Approve Plan]                            │   │
│             │  ├──────────────────────────────────────────────────────────┤   │
│             │  │ ✅ David Okafor        DevOps          Risk: 22  Complete  │   │
│             │  │    Certificate issued 2026-06-20 • 14 tasks completed     │   │
│             │  │    [View Certificate]                                     │   │
│             │  └──────────────────────────────────────────────────────────┘   │
│             │                                                                  │
│             │  Upcoming (Next 30 Days)                                         │
│             │  James K. · Contract expires 2026-07-28 · [Start Planning]       │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### 14.2 Offboarding Plan View (`/workforce/offboarding/:planId`)

```
┌─ Offboarding Plan — Sarah Chen ────────────────────────────────────────────────┐
│  Engineering · Effective: 2026-07-15 · Risk Score: 87/100 🔴                  │
│  [Approve Plan]  [Skip All Low]  [Export PDF]  [Ask Copilot...]                │
│                                                                                │
│  ┌── AI Summary ──────────────────────────────────────────────────────────────┐│
│  │  Sarah is the sole maintainer of 4 production repositories and the primary ││
│  │  contact for TechCorp (ARR: $240K). The payment-gateway-v2 repo has no     ││
│  │  other contributors — transfer is CRITICAL before access is removed.        ││
│  └────────────────────────────────────────────────────────────────────────────┘│
│                                                                                │
│  CRITICAL (4)                                                                  │
│  ┌─────────────────────────────────────────────────────────────────────────┐  │
│  │ ● Transfer GitHub Repo: payment-gateway-v2                    98% conf  │  │
│  │   Sole maintainer. Recommended → David O. (8 collab. edges)  CRITICAL  │  │
│  │   Evidence: graph:SOLE_CONTRIBUTOR · 0 other contributors              │  │
│  │   [✓ Approve]  [↳ Reassign successor]  [Skip]                          │  │
│  ├─────────────────────────────────────────────────────────────────────────┤  │
│  │ ● Transfer Customer: TechCorp ($240K ARR)                     97% conf  │  │
│  │   Primary contact only. Recommended → Marcus W. (14 email threads)     │  │
│  │   Evidence: crm:PRIMARY_CONTACT_ONLY · HubSpot record #CH-4421         │  │
│  │   [✓ Approve]  [↳ Reassign successor]  [Skip]                          │  │
│  └─────────────────────────────────────────────────────────────────────────┘  │
│                                                                                │
│  HIGH (6)   MEDIUM (8)   LOW (3)                                               │
│  [Show all]                                                                    │
│                                                                                │
│  Timeline ────────────────────────────────────────────────────────────────────│
│  ▓▓▓▓░░░░░░░░░░░░░░░░░░  4/21 tasks complete                                 │
└────────────────────────────────────────────────────────────────────────────────┘
```

### 14.3 Knowledge Transfer Report (`/workforce/offboarding/:planId/knowledge-transfer`)

```
┌─ Knowledge Transfer Report — Sarah Chen ───────────────────────────────────────┐
│  Generated: 2026-07-10 · 47 knowledge items discovered                         │
│                                                                                │
│  Risk Heatmap                                                                  │
│  ┌──────────────────────────────────────────────────────────────────────┐     │
│  │  Critical SPOFs    Repos owned    Customers    Docs w/ no co-author   │     │
│  │      🔴 3              🔴 4          🟡 2            🟡 12            │     │
│  └──────────────────────────────────────────────────────────────────────┘     │
│                                                                                │
│  Technical Knowledge                                                           │
│  ┌─────────────────────────────────────────────────────────────────────────┐  │
│  │  payment-gateway-v2   SOLE OWNER   "Stripe webhook handler, retry       │  │
│  │                                     logic. Only Sarah understands        │  │
│  │                                     idempotency key generation."        │  │
│  │  → Successor: David O. (score 0.87)  [Schedule KT Session]              │  │
│  ├─────────────────────────────────────────────────────────────────────────┤  │
│  │  auth-service         CONTRIBUTOR  "OAuth2 + PKCE flow implementation"  │  │
│  │  → Successor: Kishore V. (score 0.74)                                   │  │
│  └─────────────────────────────────────────────────────────────────────────┘  │
│                                                                                │
│  Hidden Dependencies (AI-Discovered)                                           │
│  ┌─────────────────────────────────────────────────────────────────────────┐  │
│  │  ⚠️  The Stripe API key rotation runbook references a personal Gmail    │  │
│  │      account for 2FA. This will break if account is disabled before    │  │
│  │      migrating 2FA to a shared account. Found in: vault/stripe-ops.md  │  │
│  └─────────────────────────────────────────────────────────────────────────┘  │
│                                                                                │
│  [Export PDF]  [Ask Copilot about this report]                                 │
└────────────────────────────────────────────────────────────────────────────────┘
```

### 14.4 Compliance Certificate (`/workforce/offboarding/:planId/certificate`)

```
┌─ Compliance Certificate ───────────────────────────────────────────────────────┐
│                                                                                │
│                         FLOW OS ENTERPRISE                                     │
│                    OFFBOARDING COMPLIANCE CERTIFICATE                          │
│                         Certificate #CERT-2026-0047                           │
│                                                                                │
│  Subject:    Sarah Chen <sarah.chen@company.com>                              │
│  Role:       Senior Engineer · Engineering Department                          │
│  Effective:  2026-07-15                                                       │
│  Approved by: James K. (CTO) on 2026-07-12 14:32 UTC                         │
│                                                                                │
│  Systems Offboarded:                                                           │
│  ✅ Gmail          Disabled: 2026-07-15 09:00 UTC  [AuditLog #AL-8812]        │
│  ✅ GitHub         Access removed: 2026-07-15 09:01 UTC  [AuditLog #AL-8813]  │
│  ✅ Jira           Removed: 2026-07-15 09:02 UTC  [AuditLog #AL-8814]        │
│  ✅ Notion         Ownership transferred: 2026-07-14  [AuditLog #AL-8810]    │
│  ✅ Slack          Deactivated: 2026-07-15 09:03 UTC  [AuditLog #AL-8815]    │
│                                                                                │
│  Transfers Completed:  4 repositories · 2 customers · 8 Jira boards          │
│  Pending Items:        0                                                       │
│  Blocked Items:        0                                                       │
│                                                                                │
│  Certificate Hash (SHA256):                                                    │
│  a8f3d92b1c74e5f6a2b9...                                                     │
│                                                                                │
│  This certificate was automatically generated by FLOW OS and is suitable      │
│  for SOC2, ISO 27001, and internal audit reviews.                             │
│                                                                                │
│  [Download PDF]  [Verify Hash]  [Share with Auditor]                          │
└────────────────────────────────────────────────────────────────────────────────┘
```

---

## 15. Integration into Workforce Intelligence

### 15.1 Existing `hrRoutes.js` Extension

The current `src/routes/hrRoutes.js` (Phase 6.0) handles the Workforce Intelligence capability using the WorkdayAdapter and BambooHRAdapter. Employee Lifecycle Intelligence slots in as a **sub-module**:

```
/api/hr/*                         ← existing Workforce Intelligence API (Phase 6.0)
/api/workforce/lifecycle/*        ← new Employee Lifecycle Intelligence API (Post-Beta)
```

The two are distinct because HR capability routes are provider-agnostic connector routes (read from HR systems), while Lifecycle routes are orchestration routes (coordinate across all systems).

### 15.2 Module Dependencies

```
Employee Lifecycle Intelligence
  REQUIRES (Phase 6.0 first):
  ├── WorkdayAdapter / BambooHRAdapter — for HR event webhooks
  ├── Phase 7 Operational Brain — for reasoning + recommendations
  ├── Phase 5.6 Engineering Capability — for GitHub repo discovery
  ├── Phase 5.7 Work Management — for Jira discovery
  ├── Phase 5.8 Knowledge Capability — for Notion discovery
  ├── Phase 5.9 Customer Intelligence — for CRM handover
  └── WLE (Workspace Lifecycle Engine) — for compliance patterns
```

This is why it belongs **after Beta**: it depends on the full connector suite being production-hardened.

### 15.3 Navigation Placement

```
Sidebar:
  Workforce
  ├── Team Intelligence         (existing)
  ├── Performance               (future)
  └── Employee Lifecycle        ← new top-level nav item
        ├── Overview
        ├── Active Offboardings
        ├── Scheduled Events
        └── Compliance Archive
```

---

## 16. Competitive Differentiation

### 16.1 vs. Okta Lifecycle Management

Okta knows Sarah has a Gmail account. Okta can disable it. Okta has no idea:
- That Sarah owns 4 GitHub repositories with zero other contributors
- That Sarah is the primary contact for TechCorp, your largest customer
- That Sarah's Notion pages contain the only documentation for your billing system
- That Sarah attended every Stripe integration planning meeting for 18 months

**FLOW's advantage:** The Operational Graph has this information already. Offboarding is just a query against existing data.

### 16.2 vs. Rippling

Rippling automates HR workflows including access removal and has org chart awareness. It does not:
- Have semantic understanding of *what work* an employee did
- Integrate with engineering systems at the depth FLOW does (PRs, commits, code review history)
- Generate an explainable Knowledge Transfer Report
- Suggest successors based on collaboration graph edges
- Surface hidden dependencies (e.g., "this person's Gmail is a 2FA device for a production service")

**FLOW's advantage:** Knowledge extraction from organizational memory. Rippling knows the org chart. FLOW knows the org's operational history.

### 16.3 vs. BetterCloud / Zluri

BetterCloud is strong on SaaS management and automated offboarding workflows. It does not:
- Understand which repositories have a single owner
- Know which customers are at risk because their primary contact is leaving
- Generate a human-readable narrative of what knowledge is being lost
- Recommend specific successors based on who actually worked with the departing employee

**FLOW's advantage:** The Operational Brain. BetterCloud automates. FLOW reasons.

### 16.4 FLOW's Unique Selling Points

1. **Knowledge Transfer Report** — no identity management platform generates this
2. **Graph-based successor recommendations** — based on real collaboration, not org chart proximity
3. **Hidden dependency discovery** — LLM over all operational memory surfaces what HR doesn't know
4. **Explainability** — every recommendation shows its evidence and confidence
5. **Compliance certificate with SHA256 integrity** — audit-grade, not a screenshot
6. **Copilot during review** — manager can ask "what projects will be affected?" and get an answer
7. **Full governance integration** — every action approved by the same system that governs all other FLOW actions

---

## 17. Implementation Effort Estimate

### 17.1 Backend

| Component | Effort | Notes |
|---|---|---|
| Prisma schema additions + migration | 1 day | 5 new models, User extension |
| `lifecycleEventService.js` | 1 day | CRUD + BullMQ job trigger |
| `assetDiscoveryService.js` | 4 days | Fan-out across 8 connectors + graph + vector |
| `offboardingPlanService.js` | 3 days | Task generation + LLM ranking + fallback |
| `knowledgeTransferService.js` | 3 days | Memory query + LLM narrative + fallback |
| `successorRecommendationService.js` | 2 days | Graph traversal + scoring |
| `complianceCertificateService.js` | 1 day | Assembly + SHA256 + persist |
| New adapter action types (per connector) | 3 days | 1 action type per connector × 7 connectors |
| Lifecycle BullMQ worker | 1 day | Job consumer + error handling |
| API routes (`lifecycleEventRoutes`, `offboardingRoutes`) | 2 days | 12 endpoints |
| WebSocket event emission | 0.5 days | Reuses existing socketService |
| **Backend total** | **~21 days** | |

### 17.2 Frontend

| Component | Effort | Notes |
|---|---|---|
| `OffboardingDashboard.jsx` | 2 days | List + status + risk scores |
| `OffboardingPlanView.jsx` | 3 days | Task cards with approve/skip/reassign |
| `KnowledgeTransferView.jsx` | 3 days | Risk heatmap + knowledge sections |
| `OffboardingTimeline.jsx` | 1 day | Reuses OperationalTimeline pattern |
| `ComplianceCertificateView.jsx` | 2 days | Certificate + PDF export |
| App.jsx routes + Sidebar navigation | 0.5 days | |
| WebSocket progress integration | 1 day | |
| **Frontend total** | **~12.5 days** | |

### 17.3 Testing + Documentation

| Component | Effort |
|---|---|
| Unit tests (services) | 3 days |
| Integration tests (full workflow) | 2 days |
| Architecture documentation | 1 day |
| **Testing + Docs total** | **~6 days** | |

### 17.4 Summary

| Phase | Effort |
|---|---|
| Backend | 21 days |
| Frontend | 12.5 days |
| Testing + Docs | 6 days |
| **Total** | **~39 days (~8 weeks with review cycles)** |

This is a 2-engineer, 8-week project assuming all connector adapters are already production-hardened and the Phase 7 Operational Brain is fully deployed.

---

## 18. Recommended Roadmap Stage

### 18.1 Prerequisites

This feature **cannot be built before** the following are production-stable:

| Prerequisite | Current Status |
|---|---|
| Phase 5.4–5.9: All connector adapters (Gmail, GitHub, Jira, Notion, CRM, Drive) | ✅ In progress |
| Phase 6.0: WorkdayAdapter / BambooHRAdapter | Skeleton exists |
| Phase 7.0: Operational Brain (briefing, copilot, decisions, automation) | ✅ Complete |
| Phase 10.0: Workspace Lifecycle Engine | ✅ Complete |
| Phase 12.0: AI Evaluation & Explainability | In roadmap |
| Beta (Milestones 1–10): All above hardened under real customer load | Future |

### 18.2 Placement

```
Current Roadmap:
Milestones 1–10: Core Platform → FLOW Beta

Recommended:
Phase 11 (Post-Beta): Enterprise Business Solutions
  ├── Phase 11.1: Employee Lifecycle Intelligence (THIS SPEC)
  ├── Phase 11.2: Customer Intelligence Workflows
  └── Phase 11.3: Vendor & Contract Intelligence
```

### 18.3 MVP Scope (Phase 11.1-A)

For the fastest path to customer value, the MVP should include:
1. Manual lifecycle event creation (not webhook — manual HR input)
2. Asset discovery from GitHub + Jira + Notion only (3 connectors)
3. Offboarding plan generation with LLM + fallback
4. Manager approval via existing Approval API
5. Account revocation for the 3 connectors
6. Basic compliance certificate

**MVP effort: ~18 days (2 engineers)**

Everything else (CRM handover, KT report, successor AI, PDF certificate, HR webhooks) is Phase 11.1-B, added after MVP proves customer value.

### 18.4 Target Customer Segment

- Series B–D B2B SaaS companies
- 50–500 employees
- Engineering-forward (GitHub + Jira already connected to FLOW)
- SOC2 or ISO 27001 compliance requirement (compliance certificate has immediate value)
- Minimum 2–3 offboardings per month to justify the complexity

---

## Appendix A: Event Bus Contract

```
LIFECYCLE_EVENT_TRIGGERED
  payload: { lifecycleEventId, orgId, workspaceId, employeeId, eventType, effectiveDate }

LIFECYCLE_DISCOVERY_STARTED
  payload: { lifecycleEventId, planId }

LIFECYCLE_DISCOVERY_PROGRESS
  payload: { lifecycleEventId, planId, connector, assetsFound }

LIFECYCLE_PLAN_READY
  payload: { lifecycleEventId, planId, taskCount, riskScore, criticalCount }

LIFECYCLE_TASK_EXECUTING
  payload: { planId, taskId, category, connector, actionType }

LIFECYCLE_TASK_COMPLETE
  payload: { planId, taskId, auditLogId }

LIFECYCLE_TASK_FAILED
  payload: { planId, taskId, reason }

LIFECYCLE_TASK_BLOCKED
  payload: { planId, taskId, approvalId }

LIFECYCLE_PLAN_COMPLETE
  payload: { planId, completedAt, tasksComplete, tasksFailed, tasksSkipped }

LIFECYCLE_CERTIFICATE_ISSUED
  payload: { planId, certificateId, certHash }

OFFBOARDING_COMPLETE
  payload: { lifecycleEventId, planId, certificateId, employeeId, effectiveDate }
```

---

## Appendix B: Governance Policy Namespace

```
lifecycle.event.create        ADMIN+
lifecycle.plan.approve        ADMIN+
lifecycle.task.skip           ADMIN+
lifecycle.certificate.view    ADMIN+
lifecycle.execute.revoke.*    ADMIN (with REQUIRE_APPROVAL for production connectors)
lifecycle.execute.transfer.*  ADMIN (with REQUIRE_APPROVAL for CRITICAL tasks)
```

These integrate into the existing `constants.js` role-action matrix without structural changes.

---

*Specification authored: 2026-07-01*
*Status: DESIGN ONLY — Do not implement until Post-Beta*
*Target milestone: Phase 11.1 (Employee Lifecycle Intelligence MVP)*
*Estimated effort: 39 days full implementation, 18 days MVP*
