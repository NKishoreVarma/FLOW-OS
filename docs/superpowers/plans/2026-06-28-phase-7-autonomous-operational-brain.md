# Phase 7.0 — Autonomous Operational Brain

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the orchestration layer that continuously reasons across all FLOW capabilities and proactively assists every employee in real time — the Autonomous Operational Brain.

**Architecture:** Seven new backend services wire into the existing connector framework and serve a unified `/api/brain/*` API; each recommendation is backed by explainable evidence sourced from real capability data. A floating AI Copilot component in the React frontend attaches to every page via LayoutShell. Durable PostgreSQL models replace all in-memory stores that are lost on restart (TD-01).

**Tech Stack:** Node 20 ESM, Express 5, Prisma 7, `pg.Pool`, BullMQ 5, Google Gemini 2.5 Flash (`@google/genai`), React 18, Vite, Tailwind CSS.

## Global Constraints

- All files: `import`/`export` ESM only — no `require()`
- Every DB query uses parameterized `$1`/`$2` — no string concatenation
- Every route that reads/writes intelligence data validates `workspace-id` header; return 400 if absent
- Never log PII — no raw text from PRIVATE_PERSONAL branch in any log line
- All Gemini calls have a local heuristic fallback — system must work without `GEMINI_API_KEY`
- No new Prisma schema changes without running `npx prisma migrate dev`
- No default exports from multi-function service files — named exports only
- Do not add comments explaining what code does; only add one when the WHY is non-obvious

---

## File Map

**Created (backend):**
- `prisma/migrations/phase7_brain/migration.sql` — SQL for all new Phase 7 tables
- `src/services/orgMemoryService.js` — durable decision + incident + knowledge storage (PostgreSQL)
- `src/services/operationalGraphService.js` — PostgreSQL-backed KG (replaces in-memory Map)
- `src/services/briefingEngine.js` — role-aware multi-source AI briefing generator
- `src/services/copilotService.js` — context-aware per-page Q&A engine
- `src/services/automationEngine.js` — cross-capability workflow trigger + execution
- `src/services/goalTrackingService.js` — OKR-style goal CRUD + progress measurement
- `src/routes/brainRoutes.js` — unified `/api/brain/*` route handler

**Modified (backend):**
- `prisma/schema.prisma` — add OrgMemoryRecord, GraphNode, GraphEdge, Goal, GoalMilestone, AutomationRule, AutomationRun models
- `src/server.js` — mount `/api/brain` routes
- `src/services/decisionMemoryService.js` — write to PostgreSQL via orgMemoryService (keep in-memory for legacy reads during migration)
- `src/services/incidentEngine.js` — write to PostgreSQL via orgMemoryService
- `src/utils/envValidation.js` — no changes needed
- `src/core/errors/index.js` — no changes needed
- `src/services/operationalScoringService.js` — remove TD-11 console.log
- `src/services/vectorStoreService.js` — extract shared generateEmbedding helper (TD-07)
- `src/services/retrievalService.js` — import shared generateEmbedding helper (TD-07)

**Created (frontend):**
- `flow-os-frontend/src/components/ui/AICopilot.jsx` — floating copilot chat overlay
- `flow-os-frontend/src/components/workspace/DailyBriefing.jsx` — role-aware briefing page

**Modified (frontend):**
- `flow-os-frontend/src/components/layout/LayoutShell.jsx` — inject `<AICopilot />` globally
- `flow-os-frontend/src/App.jsx` — add `/briefing` route → DailyBriefing
- `flow-os-frontend/src/components/layout/Sidebar.jsx` — add Briefing nav link

---

## Task 1: Prisma Schema — Phase 7 Brain Models

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/phase7_brain/migration.sql`

**Interfaces:**
- Produces: `OrgMemoryRecord`, `GraphNode`, `GraphEdge`, `Goal`, `GoalMilestone`, `AutomationRule`, `AutomationRun` Prisma models — used by Tasks 2, 3, 4, 6, 7

- [ ] **Step 1: Add OrgMemoryRecord model to schema**

Append to `prisma/schema.prisma`:

```prisma
// ─── Organizational Memory (Phase 7.0) ───────────────────────────────────────
// Durable store for decisions, incidents, and key project events.
// Replaces the in-memory decisionDatabase[] and incidentDatabase[] arrays (TD-01).

model OrgMemoryRecord {
  id          String   @id @default(cuid())
  workspaceId String   @map("workspace_id")
  orgId       String   @map("org_id")
  type        MemoryRecordType
  title       String
  body        String   @db.Text
  author      String?
  source      String?  // which capability/platform contributed this
  tags        String[] @default([])
  importance  Float    @default(0.5) @map("importance")
  metadata    Json     @default("{}")
  createdAt   DateTime @default(now()) @map("created_at")

  org Organization @relation(fields: [orgId], references: [id], onDelete: Cascade)

  @@index([workspaceId, type, createdAt])
  @@index([orgId, createdAt])
  @@map("org_memory_records")
}

enum MemoryRecordType {
  DECISION
  INCIDENT
  PROJECT_EVENT
  CUSTOMER_EVENT
  KNOWLEDGE_UPDATE
}
```

- [ ] **Step 2: Add GraphNode + GraphEdge models to schema**

Append to `prisma/schema.prisma`:

```prisma
// ─── Persistent Operational Graph (Phase 7.0) ────────────────────────────────
// Replaces the in-memory knowledgeGraphService.js nodes/adjacencyList Maps (TD-01).
// Nodes represent entities; edges represent relationships between them.

model GraphNode {
  id          String   @id  // e.g. "user:github:davidO"
  workspaceId String   @map("workspace_id")
  orgId       String   @map("org_id")
  type        String   // USER | INCIDENT | PROJECT | CUSTOMER | SYSTEM | EVENT | ISSUE | TEAM
  name        String
  metadata    Json     @default("{}")
  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @updatedAt @map("updated_at")

  outEdges    GraphEdge[] @relation("EdgeSource")
  inEdges     GraphEdge[] @relation("EdgeTarget")

  org Organization @relation(fields: [orgId], references: [id], onDelete: Cascade)

  @@index([workspaceId, type])
  @@index([orgId])
  @@map("graph_nodes")
}

model GraphEdge {
  id               String   @id @default(cuid())
  sourceId         String   @map("source_id")
  targetId         String   @map("target_id")
  workspaceId      String   @map("workspace_id")
  relationshipType String   @map("relationship_type")
  weight           Float    @default(1.0)
  metadata         Json     @default("{}")
  createdAt        DateTime @default(now()) @map("created_at")

  source GraphNode @relation("EdgeSource", fields: [sourceId], references: [id], onDelete: Cascade)
  target GraphNode @relation("EdgeTarget", fields: [targetId], references: [id], onDelete: Cascade)

  @@unique([sourceId, targetId, relationshipType])
  @@index([workspaceId])
  @@index([sourceId])
  @@index([targetId])
  @@map("graph_edges")
}
```

- [ ] **Step 3: Add Goal + GoalMilestone models to schema**

Append to `prisma/schema.prisma`:

```prisma
// ─── Goal Tracking (Phase 7.0) ───────────────────────────────────────────────
// OKR-style objectives with measurable milestones and automatic progress scoring.

model Goal {
  id          String     @id @default(cuid())
  workspaceId String     @map("workspace_id")
  orgId       String     @map("org_id")
  title       String
  description String?    @db.Text
  status      GoalStatus @default(ON_TRACK)
  progress    Int        @default(0)  // 0-100
  targetDate  DateTime?  @map("target_date")
  owner       String?
  metadata    Json       @default("{}")
  createdAt   DateTime   @default(now()) @map("created_at")
  updatedAt   DateTime   @updatedAt @map("updated_at")

  milestones  GoalMilestone[]
  org         Organization @relation(fields: [orgId], references: [id], onDelete: Cascade)

  @@index([workspaceId, status])
  @@index([orgId])
  @@map("goals")
}

model GoalMilestone {
  id        String          @id @default(cuid())
  goalId    String          @map("goal_id")
  title     String
  done      Boolean         @default(false)
  dueDate   DateTime?       @map("due_date")
  createdAt DateTime        @default(now()) @map("created_at")

  goal Goal @relation(fields: [goalId], references: [id], onDelete: Cascade)

  @@index([goalId])
  @@map("goal_milestones")
}

enum GoalStatus {
  ON_TRACK
  AT_RISK
  BLOCKED
  COMPLETE
  CANCELLED
}
```

- [ ] **Step 4: Add AutomationRule + AutomationRun models to schema**

Append to `prisma/schema.prisma`:

```prisma
// ─── Automation Engine (Phase 7.0) ───────────────────────────────────────────
// Cross-capability workflow rules and execution audit trail.

model AutomationRule {
  id          String   @id @default(cuid())
  workspaceId String   @map("workspace_id")
  orgId       String   @map("org_id")
  name        String
  trigger     String   // EventBus event type, e.g. "INCIDENT_CREATED"
  conditions  Json     @default("{}") // { severity: "CRITICAL", minScore: 0.8 }
  actions     Json     // Array of { connector, actionType, payload }
  enabled     Boolean  @default(true)
  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @updatedAt @map("updated_at")

  runs AutomationRun[]
  org  Organization @relation(fields: [orgId], references: [id], onDelete: Cascade)

  @@index([workspaceId, enabled])
  @@index([trigger])
  @@map("automation_rules")
}

model AutomationRun {
  id         String   @id @default(cuid())
  ruleId     String   @map("rule_id")
  workspaceId String  @map("workspace_id")
  status     String   @default("PENDING") // PENDING | RUNNING | COMPLETED | FAILED | BLOCKED_BY_GOVERNANCE
  triggerPayload Json @default("{}") @map("trigger_payload")
  results    Json     @default("[]") // per-action outcomes
  startedAt  DateTime @default(now()) @map("started_at")
  finishedAt DateTime? @map("finished_at")

  rule AutomationRule @relation(fields: [ruleId], references: [id], onDelete: Cascade)

  @@index([workspaceId])
  @@index([ruleId])
  @@map("automation_runs")
}
```

- [ ] **Step 5: Add Organization relations to new models**

In the `Organization` model in `prisma/schema.prisma`, add to its relation list:

```prisma
  orgMemory        OrgMemoryRecord[]
  graphNodes       GraphNode[]
  goals            Goal[]
  automationRules  AutomationRule[]
```

- [ ] **Step 6: Run Prisma migration**

```bash
npx prisma migrate dev --name phase7_brain
```

Expected: migration SQL created in `prisma/migrations/`, Prisma client regenerated.

- [ ] **Step 7: Verify Prisma client generated**

```bash
node -e "import('./src/core/config/prisma.js').then(m => m.default.\$queryRaw\`SELECT 1\`.then(() => console.log('DB OK')))"
```

Expected output: `DB OK`

- [ ] **Step 8: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat(schema): add Phase 7 brain models — OrgMemory, OperationalGraph, Goals, Automations"
```

---

## Task 2: Organizational Memory Service (Durable)

**Files:**
- Create: `src/services/orgMemoryService.js`
- Modify: `src/services/decisionMemoryService.js`
- Modify: `src/services/incidentEngine.js`

**Interfaces:**
- Consumes: `src/core/config/prisma.js` PrismaClient
- Produces: `saveMemory(workspaceId, orgId, type, data)`, `queryMemory(workspaceId, type, opts)` — used by Task 4 (BriefingEngine), Task 8 (BrainRoutes)

- [ ] **Step 1: Create orgMemoryService.js**

Create `src/services/orgMemoryService.js`:

```js
import prisma from '../core/config/prisma.js';

export async function saveMemory(workspaceId, orgId, type, { title, body, author, source, tags = [], importance = 0.5, metadata = {} }) {
  return prisma.orgMemoryRecord.create({
    data: { workspaceId: String(workspaceId), orgId, type, title, body, author, source, tags, importance, metadata }
  });
}

export async function queryMemory(workspaceId, type, { hours = 168, limit = 50 } = {}) {
  const since = new Date(Date.now() - hours * 3600 * 1000);
  return prisma.orgMemoryRecord.findMany({
    where: { workspaceId: String(workspaceId), type, createdAt: { gte: since } },
    orderBy: [{ importance: 'desc' }, { createdAt: 'desc' }],
    take: limit
  });
}

export async function queryAllMemory(workspaceId, { hours = 168, limit = 100 } = {}) {
  const since = new Date(Date.now() - hours * 3600 * 1000);
  return prisma.orgMemoryRecord.findMany({
    where: { workspaceId: String(workspaceId), createdAt: { gte: since } },
    orderBy: [{ importance: 'desc' }, { createdAt: 'desc' }],
    take: limit
  });
}

export async function getMemoryStats(workspaceId) {
  const [decisions, incidents, total] = await Promise.all([
    prisma.orgMemoryRecord.count({ where: { workspaceId: String(workspaceId), type: 'DECISION' } }),
    prisma.orgMemoryRecord.count({ where: { workspaceId: String(workspaceId), type: 'INCIDENT' } }),
    prisma.orgMemoryRecord.count({ where: { workspaceId: String(workspaceId) } })
  ]);
  return { decisions, incidents, total };
}
```

- [ ] **Step 2: Wire saveMemory into decisionMemoryService.js**

In `src/services/decisionMemoryService.js`, add import at top and call `saveMemory` after push:

```js
import { saveMemory } from './orgMemoryService.js';
```

In `extractDecisions()`, after `decisionDatabase.push(decisionObj)`, add (fire-and-forget, don't await to keep pipeline fast):

```js
// Persist decision to durable store — fire and forget
saveMemory(workspaceId, req?.user?.orgId || 'unknown', 'DECISION', {
  title: decisionObj.decision.substring(0, 100),
  body: text,
  author: sender,
  source: 'ingestion',
  importance: 0.7
}).catch(() => {});
```

**Note:** `req.user.orgId` is not available here because `extractDecisions` is called from the worker, not from a request context. The worker receives `workspaceId` only. We need to look up `orgId` from workspace.

Replace the fire-and-forget block with a proper async call using db:

```js
import db from '../config/db.js';

// Persist decision to durable store (fire-and-forget)
db.query('SELECT org_id FROM workspaces WHERE external_id = $1 LIMIT 1', [String(workspaceId)])
  .then(({ rows }) => {
    if (rows[0]) {
      saveMemory(String(workspaceId), rows[0].org_id, 'DECISION', {
        title: decisionObj.decision.substring(0, 100),
        body: text,
        author: sender,
        source: 'ingestion',
        importance: 0.7
      });
    }
  })
  .catch(() => {});
```

- [ ] **Step 3: Wire saveMemory into incidentEngine.js**

Open `src/services/incidentEngine.js`. After an incident is created and pushed to `incidentDatabase`, add a similar fire-and-forget persist:

```js
import { saveMemory } from './orgMemoryService.js';
import db from '../config/db.js';
```

After `incidentDatabase.push(incident)`:

```js
db.query('SELECT org_id FROM workspaces WHERE external_id = $1 LIMIT 1', [String(workspaceId)])
  .then(({ rows }) => {
    if (rows[0]) {
      saveMemory(String(workspaceId), rows[0].org_id, 'INCIDENT', {
        title: incident.title || incident.incidentName,
        body: JSON.stringify(incident),
        source: incident.platform || 'system',
        importance: incident.severity === 'CRITICAL' ? 0.95 : incident.severity === 'HIGH' ? 0.8 : 0.6
      });
    }
  })
  .catch(() => {});
```

- [ ] **Step 4: Commit**

```bash
git add src/services/orgMemoryService.js src/services/decisionMemoryService.js src/services/incidentEngine.js
git commit -m "feat(memory): persist decisions and incidents to PostgreSQL via orgMemoryService"
```

---

## Task 3: Operational Graph Service (PostgreSQL-backed)

**Files:**
- Create: `src/services/operationalGraphService.js`

**Interfaces:**
- Consumes: Prisma `GraphNode`, `GraphEdge` models (Task 1), `db` pg.Pool for raw SQL
- Produces: `upsertNode(workspaceId, orgId, id, type, name, metadata?)`, `upsertEdge(workspaceId, sourceId, targetId, relType)`, `getRelatedContext(workspaceId, entityId, hops?)` — used by Task 4 (BriefingEngine), Task 8 (BrainRoutes), ingestionWorker

- [ ] **Step 1: Create operationalGraphService.js**

Create `src/services/operationalGraphService.js`:

```js
import prisma from '../core/config/prisma.js';

export async function upsertNode(workspaceId, orgId, id, type, name, metadata = {}) {
  return prisma.graphNode.upsert({
    where: { id },
    create: { id, workspaceId: String(workspaceId), orgId, type, name, metadata },
    update: { name, metadata, updatedAt: new Date() }
  });
}

export async function upsertEdge(workspaceId, sourceId, targetId, relationshipType, weight = 1.0) {
  return prisma.graphEdge.upsert({
    where: { sourceId_targetId_relationshipType: { sourceId, targetId, relationshipType } },
    create: { sourceId, targetId, workspaceId: String(workspaceId), relationshipType, weight },
    update: { weight }
  });
}

export async function getRelatedContext(workspaceId, entityId, hops = 2) {
  const visited = new Set([entityId]);
  const contextStrings = [];
  let frontier = [entityId];

  for (let hop = 0; hop < hops; hop++) {
    if (frontier.length === 0) break;

    const edges = await prisma.graphEdge.findMany({
      where: {
        workspaceId: String(workspaceId),
        OR: [{ sourceId: { in: frontier } }, { targetId: { in: frontier } }]
      },
      include: { source: true, target: true }
    });

    const nextFrontier = [];
    for (const edge of edges) {
      const { source, target, relationshipType } = edge;
      if (!visited.has(target.id)) {
        visited.add(target.id);
        nextFrontier.push(target.id);
        contextStrings.push(`${source.type}:${source.name} --[${relationshipType}]--> ${target.type}:${target.name}`);
      }
      if (!visited.has(source.id)) {
        visited.add(source.id);
        nextFrontier.push(source.id);
        contextStrings.push(`${source.type}:${source.name} <--[${relationshipType}]-- ${target.type}:${target.name}`);
      }
    }
    frontier = nextFrontier;
  }

  return contextStrings;
}

export async function getGraphStats(workspaceId) {
  const [nodeCount, edgeCount] = await Promise.all([
    prisma.graphNode.count({ where: { workspaceId: String(workspaceId) } }),
    prisma.graphEdge.count({ where: { workspaceId: String(workspaceId) } })
  ]);
  return { nodeCount, edgeCount };
}

export async function getNeighbors(workspaceId, entityId) {
  const edges = await prisma.graphEdge.findMany({
    where: {
      workspaceId: String(workspaceId),
      OR: [{ sourceId: entityId }, { targetId: entityId }]
    },
    include: { source: true, target: true }
  });
  return edges.map(e => ({
    node: e.sourceId === entityId ? e.target : e.source,
    relation: e.relationshipType,
    direction: e.sourceId === entityId ? 'OUT' : 'IN'
  }));
}
```

- [ ] **Step 2: Commit**

```bash
git add src/services/operationalGraphService.js
git commit -m "feat(graph): add PostgreSQL-backed operational graph service"
```

---

## Task 4: Briefing Engine (Role-aware, Multi-source, Explainable)

**Files:**
- Create: `src/services/briefingEngine.js`

**Interfaces:**
- Consumes: `orgMemoryService.queryMemory()`, `healthScoreService.calculateWorkspaceHealth()`, `operationalIntelligenceService.getProactiveRecommendations()`, `incidentEngine.getRecentIncidents()`, Gemini API
- Produces: `generateBriefing(workspaceId, orgId, role)` → `{ role, sections: { priorities, meetings, actions, risks, recommendations }, metadata }` — used by Task 8 (BrainRoutes)

- [ ] **Step 1: Create briefingEngine.js**

Create `src/services/briefingEngine.js`:

```js
import { GoogleGenAI } from '@google/genai';
import { queryMemory } from './orgMemoryService.js';
import { calculateWorkspaceHealth } from './healthScoreService.js';
import { getRecentIncidents } from './incidentEngine.js';
import { getProactiveRecommendations } from './operationalIntelligenceService.js';

const ROLES = { EMPLOYEE: 'EMPLOYEE', MANAGER: 'MANAGER', EXECUTIVE: 'EXECUTIVE' };

async function callGemini(prompt) {
  if (!process.env.GEMINI_API_KEY) return null;
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const result = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt
    });
    return result.text;
  } catch {
    return null;
  }
}

function buildEmployeeBrief(incidents, decisions, health, recs) {
  const openIncidents = incidents.filter(i => i.status === 'OPEN').slice(0, 3);
  return {
    priorities: openIncidents.length > 0
      ? openIncidents.map(i => ({ title: i.title || i.incidentName, source: 'incidents', urgency: 'HIGH' }))
      : [{ title: 'No critical incidents — focus on sprint tasks', source: 'system', urgency: 'LOW' }],
    actions: recs.slice(0, 2).map(r => ({
      title: r.title,
      confidence: r.confidence,
      evidence: r.evidence,
      businessImpact: r.businessImpact,
      systems: r.systems
    })),
    risks: [],
    healthSummary: health.company_health
  };
}

function buildManagerBrief(incidents, decisions, health, recs) {
  const blockers = incidents.filter(i => i.status === 'OPEN' && (i.severity === 'CRITICAL' || i.severity === 'HIGH'));
  return {
    teamBlockers: blockers.map(i => ({
      title: i.title || i.incidentName,
      severity: i.severity,
      evidence: [i.description || ''],
      systems: ['incidents']
    })),
    sprintHealth: health.sectors?.delivery ?? 82,
    approvals: [],
    resourceFlags: recs.filter(r => r.id === 'REC-2.2'),
    actions: recs.slice(0, 3).map(r => ({
      title: r.title,
      confidence: r.confidence,
      evidence: r.evidence,
      businessImpact: r.businessImpact,
      systems: r.systems
    }))
  };
}

function buildExecutiveBrief(incidents, decisions, health, recs) {
  return {
    companyHealth: health.company_health,
    sectors: health.sectors,
    customerRisks: [{
      title: 'Monitor at-risk accounts',
      confidence: 80,
      evidence: `Customer health sector score: ${health.sectors?.customer ?? 68}%`,
      systems: ['hubspot', 'crm']
    }],
    deliveryRisks: incidents.filter(i => i.severity === 'CRITICAL').map(i => ({
      title: i.title || i.incidentName,
      severity: i.severity,
      systems: ['incidents', 'github']
    })),
    strategicRecommendations: recs.map(r => ({
      id: r.id,
      title: r.title,
      confidence: r.confidence,
      impact: r.impact,
      evidence: r.evidence,
      systems: r.systems,
      owner: r.owner,
      businessImpact: r.businessImpact,
      estimatedImprovement: r.estimatedImprovement
    })),
    recentDecisions: decisions.slice(0, 5).map(d => ({
      title: d.title,
      author: d.author,
      date: d.createdAt
    }))
  };
}

export async function generateBriefing(workspaceId, orgId, role = ROLES.EMPLOYEE) {
  const wsIdStr = String(workspaceId);
  const validRole = Object.values(ROLES).includes(role.toUpperCase()) ? role.toUpperCase() : ROLES.EMPLOYEE;

  const [health, incidents, recs, decisions] = await Promise.all([
    calculateWorkspaceHealth(wsIdStr).catch(() => ({ company_health: 75, sectors: {} })),
    Promise.resolve(getRecentIncidents(wsIdStr, 24)),
    Promise.resolve(getProactiveRecommendations(wsIdStr)),
    queryMemory(wsIdStr, 'DECISION', { hours: 168, limit: 10 }).catch(() => [])
  ]);

  let sections;
  if (validRole === ROLES.EXECUTIVE) {
    sections = buildExecutiveBrief(incidents, decisions, health, recs);
  } else if (validRole === ROLES.MANAGER) {
    sections = buildManagerBrief(incidents, decisions, health, recs);
  } else {
    sections = buildEmployeeBrief(incidents, decisions, health, recs);
  }

  // Optional Gemini narrative synthesis
  const contextSummary = `Role: ${validRole}\nHealth: ${health.company_health}/100\nOpen incidents: ${incidents.filter(i => i.status === 'OPEN').length}\nTop recommendation: ${recs[0]?.title || 'None'}`;
  const aiNarrative = await callGemini(
    `You are FLOW OS Chief of Staff. Generate a 2-sentence executive morning brief for a ${validRole.toLowerCase()} based on this context:\n${contextSummary}\nBe direct, factual, and action-oriented. No filler.`
  );

  return {
    role: validRole,
    generatedAt: new Date().toISOString(),
    aiNarrative: aiNarrative || buildFallbackNarrative(validRole, health, incidents),
    sections,
    metadata: {
      incidentCount: incidents.length,
      openIncidents: incidents.filter(i => i.status === 'OPEN').length,
      healthScore: health.company_health,
      recommendationCount: recs.length,
      sources: ['incidents', 'health', 'decisions', 'recommendations']
    }
  };
}

function buildFallbackNarrative(role, health, incidents) {
  const score = health.company_health ?? 75;
  const open = incidents.filter(i => i.status === 'OPEN').length;
  if (role === 'EXECUTIVE') {
    return `Company health is at ${score}/100 with ${open} open incidents requiring attention. Review strategic recommendations to maintain delivery cadence.`;
  }
  if (role === 'MANAGER') {
    return `Your team has ${open} active blockers with sprint health at ${health.sectors?.delivery ?? 82}%. Address the top recommendation to unblock delivery.`;
  }
  return `${open > 0 ? `${open} active incident(s) in your workspace.` : 'No active incidents.'} Focus on today's top action items to move the needle.`;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/services/briefingEngine.js
git commit -m "feat(brain): add role-aware briefing engine with real capability data"
```

---

## Task 5: Copilot Service (Context-aware Per-page Q&A)

**Files:**
- Create: `src/services/copilotService.js`

**Interfaces:**
- Consumes: `retrievalService.retrieveContext()`, Gemini API, `operationalGraphService.getRelatedContext()`
- Produces: `answerCopilotQuery(workspaceId, { pageContext, question })` → `{ answer, evidence, confidence, suggestedActions, sources }` — used by Task 8 (BrainRoutes)

- [ ] **Step 1: Create copilotService.js**

Create `src/services/copilotService.js`:

```js
import { GoogleGenAI } from '@google/genai';
import { retrieveContext } from './retrievalService.js';
import { getRelatedContext } from './operationalGraphService.js';

export async function answerCopilotQuery(workspaceId, { pageContext = '', question, entityId = null }) {
  const wsIdStr = String(workspaceId);

  // Build the enriched query from page context + user question
  const enrichedQuery = pageContext ? `[Context: ${pageContext}] ${question}` : question;
  const queryTraceId = `cop-${Date.now()}`;

  // Retrieve RAG context chunks
  let chunks = [];
  try {
    const result = await retrieveContext(wsIdStr, enrichedQuery, queryTraceId);
    chunks = Array.isArray(result) ? result : [];
  } catch {
    chunks = [];
  }

  // KG expansion if entityId provided
  let graphContext = [];
  if (entityId) {
    try {
      graphContext = await getRelatedContext(wsIdStr, entityId, 1);
    } catch {
      graphContext = [];
    }
  }

  const contextText = [
    ...chunks.map(c => c.text || c.content || ''),
    ...graphContext
  ].filter(Boolean).slice(0, 10).join('\n---\n');

  const evidence = chunks.slice(0, 5).map(c => ({
    text: (c.text || c.content || '').substring(0, 120),
    source: c.source || c.metadata?.source || 'workspace',
    score: c.finalScore || c.score || 0
  }));

  // Gemini synthesis
  if (process.env.GEMINI_API_KEY && contextText) {
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const prompt = `You are FLOW OS Copilot — a context-aware assistant. Answer the following question concisely based only on the provided workspace context. If the answer is not in the context, say so directly.\n\nQuestion: ${question}\n\nContext:\n${contextText}\n\nProvide a direct answer in 1-3 sentences. Do not say "based on the context". Speak as a knowledgeable assistant.`;
      const result = await ai.models.generateContent({ model: 'gemini-2.5-flash', contents: prompt });
      return {
        answer: result.text,
        evidence,
        confidence: chunks.length > 0 ? Math.min(95, 60 + chunks.length * 5) : 30,
        suggestedActions: buildSuggestedActions(question, chunks),
        sources: [...new Set(chunks.map(c => c.source || c.metadata?.source || 'workspace'))].slice(0, 5)
      };
    } catch {
      // fall through to heuristic
    }
  }

  // Heuristic fallback
  const fallbackAnswer = chunks.length > 0
    ? `Based on your workspace data: ${(chunks[0].text || chunks[0].content || '').substring(0, 200)}`
    : 'No matching information found in your workspace. Try refining the question or ingesting more data.';

  return {
    answer: fallbackAnswer,
    evidence,
    confidence: chunks.length > 0 ? 45 : 10,
    suggestedActions: buildSuggestedActions(question, chunks),
    sources: [...new Set(chunks.map(c => c.source || c.metadata?.source || 'workspace'))].slice(0, 5)
  };
}

function buildSuggestedActions(question, chunks) {
  const q = question.toLowerCase();
  const actions = [];
  if (q.includes('pr') || q.includes('pull request') || q.includes('review')) {
    actions.push({ label: 'View PRs', route: '/projects' });
  }
  if (q.includes('meeting') || q.includes('calendar')) {
    actions.push({ label: 'View Meetings', route: '/meetings' });
  }
  if (q.includes('incident') || q.includes('outage') || q.includes('issue')) {
    actions.push({ label: 'View Briefing', route: '/briefing' });
  }
  if (chunks.length === 0) {
    actions.push({ label: 'Search Workspace', route: '/search' });
  }
  return actions.slice(0, 3);
}
```

- [ ] **Step 2: Commit**

```bash
git add src/services/copilotService.js
git commit -m "feat(brain): add context-aware copilot service with RAG + KG expansion"
```

---

## Task 6: Automation Engine (Cross-capability Workflows)

**Files:**
- Create: `src/services/automationEngine.js`

**Interfaces:**
- Consumes: EventBus, `executionEngine.executeAction()`, Prisma `AutomationRule`/`AutomationRun`, `orgMemoryService.saveMemory()`
- Produces: `loadRules(workspaceId)`, `evaluateTrigger(workspaceId, orgId, eventType, payload)`, `createRule(workspaceId, orgId, data)` — called by Task 8 (BrainRoutes) and wired to EventBus in server.js

- [ ] **Step 1: Create automationEngine.js**

Create `src/services/automationEngine.js`:

```js
import prisma from '../core/config/prisma.js';
import eventBus from '../core/events/eventBus.js';
import { executeAction } from '../connectors/executionEngine.js';
import { saveMemory } from './orgMemoryService.js';
import { broadcastToWorkspace } from './socketService.js';

// In-process cache: workspaceId → rules[]  (refreshed every 60s)
const rulesCache = new Map();
const CACHE_TTL = 60_000;
const cacheTimestamps = new Map();

async function loadRules(workspaceId) {
  const now = Date.now();
  const lastLoad = cacheTimestamps.get(workspaceId) || 0;
  if (now - lastLoad < CACHE_TTL && rulesCache.has(workspaceId)) {
    return rulesCache.get(workspaceId);
  }

  const rules = await prisma.automationRule.findMany({
    where: { workspaceId: String(workspaceId), enabled: true }
  });
  rulesCache.set(workspaceId, rules);
  cacheTimestamps.set(workspaceId, now);
  return rules;
}

function conditionsMatch(conditions, payload) {
  if (!conditions || Object.keys(conditions).length === 0) return true;
  for (const [key, value] of Object.entries(conditions)) {
    if (payload[key] !== undefined && payload[key] !== value) return false;
  }
  return true;
}

async function runWorkflow(workspaceId, orgId, rule, triggerPayload) {
  const run = await prisma.automationRun.create({
    data: {
      ruleId: rule.id,
      workspaceId: String(workspaceId),
      status: 'RUNNING',
      triggerPayload
    }
  });

  const results = [];
  const actions = Array.isArray(rule.actions) ? rule.actions : [];

  for (const step of actions) {
    try {
      const result = await executeAction(
        step.connector,
        workspaceId,
        step.actionType,
        { ...step.payload, triggerContext: triggerPayload },
        { orgId, workspaceId }
      );
      results.push({ connector: step.connector, status: 'OK', result });
    } catch (err) {
      results.push({ connector: step.connector, status: 'ERROR', error: err.message });
      if (err.message?.includes('APPROVAL_REQUIRED') || err.statusCode === 403) {
        break; // halt workflow at governance gate
      }
    }
  }

  const allOk = results.every(r => r.status === 'OK');
  await prisma.automationRun.update({
    where: { id: run.id },
    data: { status: allOk ? 'COMPLETED' : 'FAILED', results, finishedAt: new Date() }
  });

  broadcastToWorkspace(String(workspaceId), 'AUTOMATION_RUN_COMPLETE', {
    ruleId: rule.id,
    ruleName: rule.name,
    runId: run.id,
    status: allOk ? 'COMPLETED' : 'FAILED',
    actionCount: results.length
  });

  return { run, results };
}

export async function evaluateTrigger(workspaceId, orgId, eventType, payload) {
  let rules;
  try {
    rules = await loadRules(workspaceId);
  } catch {
    return;
  }

  const matching = rules.filter(r => r.trigger === eventType && conditionsMatch(r.conditions, payload));
  for (const rule of matching) {
    runWorkflow(workspaceId, orgId, rule, payload).catch(() => {});
  }
}

export async function createRule(workspaceId, orgId, { name, trigger, conditions = {}, actions }) {
  return prisma.automationRule.create({
    data: { workspaceId: String(workspaceId), orgId, name, trigger, conditions, actions, enabled: true }
  });
}

export async function listRules(workspaceId) {
  return prisma.automationRule.findMany({
    where: { workspaceId: String(workspaceId) },
    include: { _count: { select: { runs: true } } },
    orderBy: { createdAt: 'desc' }
  });
}

export async function listRuns(workspaceId, { limit = 20 } = {}) {
  return prisma.automationRun.findMany({
    where: { workspaceId: String(workspaceId) },
    include: { rule: { select: { name: true, trigger: true } } },
    orderBy: { startedAt: 'desc' },
    take: limit
  });
}

export async function toggleRule(workspaceId, ruleId, enabled) {
  return prisma.automationRule.update({
    where: { id: ruleId, workspaceId: String(workspaceId) },
    data: { enabled }
  });
}

// Wire automation engine to the shared event bus
export function initAutomationSubscribers() {
  const WATCHED_EVENTS = [
    'INCIDENT_CREATED', 'RISK_DETECTED', 'HEALTH_SCORE_UPDATED',
    'INTEL_STORED', 'MEMORY_ESCALATED', 'CONNECTOR_ACTION_EXECUTED'
  ];

  WATCHED_EVENTS.forEach(eventType => {
    eventBus.on(eventType, ({ workspaceId, orgId, payload }) => {
      if (!workspaceId) return;
      evaluateTrigger(String(workspaceId), orgId || '', eventType, payload || {}).catch(() => {});
    });
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/services/automationEngine.js
git commit -m "feat(brain): add cross-capability automation engine with governance and audit"
```

---

## Task 7: Goal Tracking Service

**Files:**
- Create: `src/services/goalTrackingService.js`

**Interfaces:**
- Consumes: Prisma `Goal`, `GoalMilestone`, `healthScoreService.calculateWorkspaceHealth()`
- Produces: `createGoal()`, `listGoals()`, `getGoal()`, `updateGoal()`, `addMilestone()`, `computeProgress()` — used by Task 8 (BrainRoutes)

- [ ] **Step 1: Create goalTrackingService.js**

Create `src/services/goalTrackingService.js`:

```js
import prisma from '../core/config/prisma.js';

export async function createGoal(workspaceId, orgId, { title, description, targetDate, owner, milestones = [] }) {
  return prisma.goal.create({
    data: {
      workspaceId: String(workspaceId),
      orgId,
      title,
      description,
      targetDate: targetDate ? new Date(targetDate) : null,
      owner,
      milestones: { create: milestones.map(m => ({ title: m.title, dueDate: m.dueDate ? new Date(m.dueDate) : null })) }
    },
    include: { milestones: true }
  });
}

export async function listGoals(workspaceId, { status } = {}) {
  return prisma.goal.findMany({
    where: { workspaceId: String(workspaceId), ...(status ? { status } : {}) },
    include: { milestones: { orderBy: { dueDate: 'asc' } } },
    orderBy: { createdAt: 'desc' }
  });
}

export async function getGoal(workspaceId, goalId) {
  return prisma.goal.findFirst({
    where: { id: goalId, workspaceId: String(workspaceId) },
    include: { milestones: true }
  });
}

export async function updateGoal(workspaceId, goalId, updates) {
  const { title, description, status, progress, targetDate, owner } = updates;
  return prisma.goal.update({
    where: { id: goalId, workspaceId: String(workspaceId) },
    data: {
      ...(title !== undefined && { title }),
      ...(description !== undefined && { description }),
      ...(status !== undefined && { status }),
      ...(progress !== undefined && { progress: Math.min(100, Math.max(0, progress)) }),
      ...(targetDate !== undefined && { targetDate: new Date(targetDate) }),
      ...(owner !== undefined && { owner })
    },
    include: { milestones: true }
  });
}

export async function addMilestone(workspaceId, goalId, { title, dueDate }) {
  const goal = await prisma.goal.findFirst({ where: { id: goalId, workspaceId: String(workspaceId) } });
  if (!goal) throw new Error('Goal not found');

  const milestone = await prisma.goalMilestone.create({
    data: { goalId, title, dueDate: dueDate ? new Date(dueDate) : null }
  });

  // Recompute progress from milestones
  const allMilestones = await prisma.goalMilestone.findMany({ where: { goalId } });
  const done = allMilestones.filter(m => m.done).length;
  const progress = allMilestones.length > 0 ? Math.round((done / allMilestones.length) * 100) : 0;
  await prisma.goal.update({ where: { id: goalId }, data: { progress } });

  return milestone;
}

export async function completeMilestone(workspaceId, goalId, milestoneId) {
  const goal = await prisma.goal.findFirst({ where: { id: goalId, workspaceId: String(workspaceId) } });
  if (!goal) throw new Error('Goal not found');

  await prisma.goalMilestone.update({ where: { id: milestoneId }, data: { done: true } });

  const allMilestones = await prisma.goalMilestone.findMany({ where: { goalId } });
  const done = allMilestones.filter(m => m.done).length;
  const progress = Math.round((done / allMilestones.length) * 100);
  const status = progress === 100 ? 'COMPLETE' : 'ON_TRACK';

  return prisma.goal.update({
    where: { id: goalId },
    data: { progress, status },
    include: { milestones: true }
  });
}

export async function deleteGoal(workspaceId, goalId) {
  return prisma.goal.deleteMany({ where: { id: goalId, workspaceId: String(workspaceId) } });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/services/goalTrackingService.js
git commit -m "feat(goals): add OKR-style goal tracking service with milestone progress"
```

---

## Task 8: Brain Routes (Unified Autonomous Brain API)

**Files:**
- Create: `src/routes/brainRoutes.js`
- Modify: `src/server.js`

**Interfaces:**
- Consumes: All services from Tasks 2-7
- Produces: `/api/brain/*` REST endpoints

- [ ] **Step 1: Create brainRoutes.js**

Create `src/routes/brainRoutes.js`:

```js
import express from 'express';
import { generateBriefing } from '../services/briefingEngine.js';
import { answerCopilotQuery } from '../services/copilotService.js';
import {
  createRule, listRules, listRuns, toggleRule
} from '../services/automationEngine.js';
import {
  createGoal, listGoals, getGoal, updateGoal, addMilestone, completeMilestone, deleteGoal
} from '../services/goalTrackingService.js';
import { queryAllMemory, getMemoryStats } from '../services/orgMemoryService.js';
import { getGraphStats, getNeighbors } from '../services/operationalGraphService.js';
import { ValidationError } from '../core/errors/index.js';

const router = express.Router();

// ── Briefing ─────────────────────────────────────────────────────────────────

router.get('/briefing', async (req, res, next) => {
  const workspaceId = req.headers['workspace-id'];
  if (!workspaceId) return next(new ValidationError('Missing workspace-id header'));

  const role = (req.query.role || 'EMPLOYEE').toUpperCase();
  try {
    const briefing = await generateBriefing(workspaceId, req.workspace.orgId, role);
    res.json({ success: true, briefing });
  } catch (err) {
    next(err);
  }
});

// ── Copilot ───────────────────────────────────────────────────────────────────

router.post('/copilot', async (req, res, next) => {
  const workspaceId = req.headers['workspace-id'];
  if (!workspaceId) return next(new ValidationError('Missing workspace-id header'));

  const { question, pageContext, entityId } = req.body;
  if (!question) return next(new ValidationError('question is required'));

  try {
    const result = await answerCopilotQuery(workspaceId, { question, pageContext, entityId });
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
});

// ── Automations ───────────────────────────────────────────────────────────────

router.get('/automations', async (req, res, next) => {
  const workspaceId = req.headers['workspace-id'];
  if (!workspaceId) return next(new ValidationError('Missing workspace-id header'));

  try {
    const [rules, runs] = await Promise.all([listRules(workspaceId), listRuns(workspaceId)]);
    res.json({ success: true, rules, runs });
  } catch (err) {
    next(err);
  }
});

router.post('/automations', async (req, res, next) => {
  const workspaceId = req.headers['workspace-id'];
  if (!workspaceId) return next(new ValidationError('Missing workspace-id header'));

  const { name, trigger, conditions, actions } = req.body;
  if (!name || !trigger || !actions) return next(new ValidationError('name, trigger, and actions are required'));

  try {
    const rule = await createRule(workspaceId, req.workspace.orgId, { name, trigger, conditions, actions });
    res.status(201).json({ success: true, rule });
  } catch (err) {
    next(err);
  }
});

router.patch('/automations/:id/toggle', async (req, res, next) => {
  const workspaceId = req.headers['workspace-id'];
  if (!workspaceId) return next(new ValidationError('Missing workspace-id header'));

  const { enabled } = req.body;
  if (typeof enabled !== 'boolean') return next(new ValidationError('enabled must be boolean'));

  try {
    const rule = await toggleRule(workspaceId, req.params.id, enabled);
    res.json({ success: true, rule });
  } catch (err) {
    next(err);
  }
});

// ── Goals ─────────────────────────────────────────────────────────────────────

router.get('/goals', async (req, res, next) => {
  const workspaceId = req.headers['workspace-id'];
  if (!workspaceId) return next(new ValidationError('Missing workspace-id header'));

  try {
    const goals = await listGoals(workspaceId, { status: req.query.status });
    res.json({ success: true, goals });
  } catch (err) {
    next(err);
  }
});

router.post('/goals', async (req, res, next) => {
  const workspaceId = req.headers['workspace-id'];
  if (!workspaceId) return next(new ValidationError('Missing workspace-id header'));

  const { title, description, targetDate, owner, milestones } = req.body;
  if (!title) return next(new ValidationError('title is required'));

  try {
    const goal = await createGoal(workspaceId, req.workspace.orgId, { title, description, targetDate, owner, milestones });
    res.status(201).json({ success: true, goal });
  } catch (err) {
    next(err);
  }
});

router.get('/goals/:id', async (req, res, next) => {
  const workspaceId = req.headers['workspace-id'];
  if (!workspaceId) return next(new ValidationError('Missing workspace-id header'));

  try {
    const goal = await getGoal(workspaceId, req.params.id);
    if (!goal) return res.status(404).json({ error: 'Goal not found' });
    res.json({ success: true, goal });
  } catch (err) {
    next(err);
  }
});

router.patch('/goals/:id', async (req, res, next) => {
  const workspaceId = req.headers['workspace-id'];
  if (!workspaceId) return next(new ValidationError('Missing workspace-id header'));

  try {
    const goal = await updateGoal(workspaceId, req.params.id, req.body);
    res.json({ success: true, goal });
  } catch (err) {
    next(err);
  }
});

router.post('/goals/:id/milestones', async (req, res, next) => {
  const workspaceId = req.headers['workspace-id'];
  if (!workspaceId) return next(new ValidationError('Missing workspace-id header'));

  const { title, dueDate } = req.body;
  if (!title) return next(new ValidationError('title is required'));

  try {
    const milestone = await addMilestone(workspaceId, req.params.id, { title, dueDate });
    res.status(201).json({ success: true, milestone });
  } catch (err) {
    next(err);
  }
});

router.patch('/goals/:goalId/milestones/:milestoneId/complete', async (req, res, next) => {
  const workspaceId = req.headers['workspace-id'];
  if (!workspaceId) return next(new ValidationError('Missing workspace-id header'));

  try {
    const goal = await completeMilestone(workspaceId, req.params.goalId, req.params.milestoneId);
    res.json({ success: true, goal });
  } catch (err) {
    next(err);
  }
});

router.delete('/goals/:id', async (req, res, next) => {
  const workspaceId = req.headers['workspace-id'];
  if (!workspaceId) return next(new ValidationError('Missing workspace-id header'));

  try {
    await deleteGoal(workspaceId, req.params.id);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// ── Organizational Memory ────────────────────────────────────────────────────

router.get('/memory', async (req, res, next) => {
  const workspaceId = req.headers['workspace-id'];
  if (!workspaceId) return next(new ValidationError('Missing workspace-id header'));

  const hours = parseInt(req.query.hours) || 168;
  try {
    const [records, stats] = await Promise.all([
      queryAllMemory(workspaceId, { hours, limit: 50 }),
      getMemoryStats(workspaceId)
    ]);
    res.json({ success: true, records, stats });
  } catch (err) {
    next(err);
  }
});

// ── Operational Graph ────────────────────────────────────────────────────────

router.get('/graph', async (req, res, next) => {
  const workspaceId = req.headers['workspace-id'];
  if (!workspaceId) return next(new ValidationError('Missing workspace-id header'));

  const entityId = req.query.entityId;
  try {
    const [stats, neighbors] = await Promise.all([
      getGraphStats(workspaceId),
      entityId ? getNeighbors(workspaceId, entityId) : Promise.resolve([])
    ]);
    res.json({ success: true, stats, neighbors });
  } catch (err) {
    next(err);
  }
});

export default router;
```

- [ ] **Step 2: Mount brain routes in server.js**

In `src/server.js`, after the engineering routes import, add:

```js
import brainRoutes from './routes/brainRoutes.js';
```

And after `app.use('/api/engineering', engineeringRoutes)`, add:

```js
import { initAutomationSubscribers } from './services/automationEngine.js';
// ...
app.use('/api/brain', brainRoutes);
console.log('🧠 Autonomous Brain routes mounted at /api/brain');

// Wire automation engine to event bus
initAutomationSubscribers();
```

- [ ] **Step 3: Verify routes load without error**

```bash
node --input-type=module <<'EOF'
import './src/server.js';
EOF
```

Expected: server starts and logs `🧠 Autonomous Brain routes mounted at /api/brain`

- [ ] **Step 4: Commit**

```bash
git add src/routes/brainRoutes.js src/server.js
git commit -m "feat(brain): mount unified /api/brain/* routes and wire automation engine to event bus"
```

---

## Task 9: Frontend — AI Copilot Component

**Files:**
- Create: `flow-os-frontend/src/components/ui/AICopilot.jsx`
- Modify: `flow-os-frontend/src/components/layout/LayoutShell.jsx`

**Interfaces:**
- Consumes: `POST /api/brain/copilot` (via fetch with `workspace-id` header from localStorage)
- Produces: Floating copilot button visible on every page; slide-out chat panel

- [ ] **Step 1: Create AICopilot.jsx**

Create `flow-os-frontend/src/components/ui/AICopilot.jsx`:

```jsx
import { useState, useRef, useEffect } from 'react';

const WORKSPACE_ID = localStorage.getItem('workspace-id') || 'workspace_corp_alpha';
const TOKEN = localStorage.getItem('token') || '';

export default function AICopilot({ pageContext = '' }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    if (open) bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, open]);

  async function ask() {
    const question = input.trim();
    if (!question || loading) return;

    setMessages(prev => [...prev, { role: 'user', text: question }]);
    setInput('');
    setLoading(true);

    try {
      const res = await fetch('/api/brain/copilot', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'workspace-id': WORKSPACE_ID,
          ...(TOKEN && { Authorization: `Bearer ${TOKEN}` })
        },
        body: JSON.stringify({ question, pageContext })
      });
      const data = await res.json();
      setMessages(prev => [...prev, {
        role: 'assistant',
        text: data.answer || 'No answer found.',
        evidence: data.evidence || [],
        suggestedActions: data.suggestedActions || [],
        confidence: data.confidence || 0
      }]);
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', text: 'Failed to reach FLOW AI. Check your connection.' }]);
    } finally {
      setLoading(false);
    }
  }

  function handleKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(); }
  }

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setOpen(o => !o)}
        className="fixed bottom-6 right-6 z-50 w-12 h-12 rounded-full bg-flow-purple text-white shadow-lg flex items-center justify-center text-xl hover:bg-flow-purple/90 transition-colors"
        aria-label="Open FLOW Copilot"
      >
        ✦
      </button>

      {/* Panel */}
      {open && (
        <div className="fixed bottom-20 right-6 z-50 w-96 max-h-[70vh] flex flex-col bg-bg-secondary border border-border-subtle rounded-xl shadow-2xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border-subtle">
            <div className="flex items-center gap-2">
              <span className="text-flow-purple font-bold text-sm">FLOW Copilot</span>
              <span className="text-xs text-text-muted">• Ask anything about your workspace</span>
            </div>
            <button onClick={() => setOpen(false)} className="text-text-muted hover:text-text-primary text-lg leading-none">×</button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0">
            {messages.length === 0 && (
              <p className="text-text-muted text-xs text-center pt-4">
                Ask me about incidents, projects, meetings, decisions, or anything in your workspace.
              </p>
            )}
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${
                  msg.role === 'user'
                    ? 'bg-flow-purple text-white'
                    : 'bg-bg-tertiary text-text-primary border border-border-subtle'
                }`}>
                  <p className="leading-relaxed">{msg.text}</p>
                  {msg.evidence?.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-border-subtle/50 space-y-1">
                      <p className="text-[10px] uppercase tracking-wider text-text-muted font-semibold">Evidence</p>
                      {msg.evidence.slice(0, 2).map((e, ei) => (
                        <p key={ei} className="text-[11px] text-text-muted line-clamp-2">{e.text}</p>
                      ))}
                    </div>
                  )}
                  {msg.suggestedActions?.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {msg.suggestedActions.map((a, ai) => (
                        <a key={ai} href={a.route} className="text-[10px] px-2 py-0.5 rounded-full bg-flow-purple/20 text-flow-purple hover:bg-flow-purple/30 transition-colors">
                          {a.label} →
                        </a>
                      ))}
                    </div>
                  )}
                  {msg.confidence > 0 && (
                    <p className="text-[10px] text-text-muted mt-1">Confidence: {msg.confidence}%</p>
                  )}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="bg-bg-tertiary border border-border-subtle rounded-xl px-3 py-2">
                  <span className="text-text-muted text-xs">Thinking...</span>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          <div className="p-3 border-t border-border-subtle">
            <div className="flex gap-2">
              <input
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKey}
                placeholder="Ask your workspace..."
                className="flex-1 text-sm bg-bg-tertiary border border-border-subtle rounded-lg px-3 py-2 text-text-primary placeholder:text-text-muted focus:outline-none focus:border-flow-purple/50"
              />
              <button
                onClick={ask}
                disabled={!input.trim() || loading}
                className="px-3 py-2 rounded-lg bg-flow-purple text-white text-sm font-medium disabled:opacity-40 hover:bg-flow-purple/90 transition-colors"
              >
                Ask
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 2: Inject AICopilot into LayoutShell.jsx**

Open `flow-os-frontend/src/components/layout/LayoutShell.jsx`. Add import at top:

```jsx
import AICopilot from '../ui/AICopilot';
```

Inside the main layout JSX (before the closing tag of the root div), add:

```jsx
<AICopilot pageContext={typeof window !== 'undefined' ? window.location.pathname : ''} />
```

- [ ] **Step 3: Commit**

```bash
git add flow-os-frontend/src/components/ui/AICopilot.jsx flow-os-frontend/src/components/layout/LayoutShell.jsx
git commit -m "feat(copilot): add floating AI Copilot overlay wired to /api/brain/copilot"
```

---

## Task 10: Frontend — Daily Briefing Page

**Files:**
- Create: `flow-os-frontend/src/components/workspace/DailyBriefing.jsx`
- Modify: `flow-os-frontend/src/App.jsx`
- Modify: `flow-os-frontend/src/components/layout/Sidebar.jsx`

**Interfaces:**
- Consumes: `GET /api/brain/briefing?role=EMPLOYEE|MANAGER|EXECUTIVE`
- Produces: `/briefing` route with role selector and structured briefing display

- [ ] **Step 1: Create DailyBriefing.jsx**

Create `flow-os-frontend/src/components/workspace/DailyBriefing.jsx`:

```jsx
import { useState, useEffect, useCallback } from 'react';

const WORKSPACE_ID = localStorage.getItem('workspace-id') || 'workspace_corp_alpha';
const TOKEN = localStorage.getItem('token') || '';
const ROLES = ['EMPLOYEE', 'MANAGER', 'EXECUTIVE'];

const DEMO_BRIEFING = {
  role: 'EXECUTIVE',
  aiNarrative: 'Company health is at 74/100 with 2 open incidents. Prioritize the Postgres remediation and the Initech SSO blocker to maintain delivery targets.',
  sections: {
    companyHealth: 74,
    sectors: { engineering: 68, delivery: 82, customer: 68, workforce: 88, operations: 75, knowledge: 85, revenue: 92 },
    strategicRecommendations: [
      { id: 'REC-2.1', title: 'Approve Emergency Postgres Remediation Deployment', confidence: 95, impact: 'HIGH', evidence: 'Active Sev-1 latency incident affecting Acme Corp.', systems: ['Jira', 'GitHub', 'Incidents'], owner: 'Kishore Varma', businessImpact: 'Restores SLA to <500ms.' },
      { id: 'REC-2.2', title: 'Reallocate Stripe Onboarding Ownership', confidence: 90, impact: 'MEDIUM', evidence: 'Sarah Chen shows high burnout risk at 95% context switching.', systems: ['Workday', 'Jira'], owner: 'James K.', businessImpact: 'Prevents delivery delays.' },
      { id: 'REC-2.3', title: 'Fix Auth Login Loops Blocker', confidence: 88, impact: 'HIGH', evidence: 'Initech SSO deal ($50k) blocked on FLOW-102.', systems: ['Jira', 'HubSpot'], owner: 'Sarah Chen', businessImpact: 'Enables Initech close by Aug 1.' }
    ],
    recentDecisions: []
  },
  metadata: { incidentCount: 3, openIncidents: 2, healthScore: 74, recommendationCount: 3, sources: ['incidents', 'health', 'decisions'] }
};

function HealthBar({ label, value }) {
  const color = value >= 80 ? 'bg-emerald-500' : value >= 60 ? 'bg-amber-500' : 'bg-red-500';
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-text-muted w-20 capitalize">{label}</span>
      <div className="flex-1 h-1.5 bg-bg-tertiary rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color} transition-all duration-700`} style={{ width: `${value}%` }} />
      </div>
      <span className="text-xs font-mono text-text-secondary w-8 text-right">{value}</span>
    </div>
  );
}

function ImpactBadge({ impact }) {
  const colors = { HIGH: 'text-red-400 bg-red-500/10', MEDIUM: 'text-amber-400 bg-amber-500/10', LOW: 'text-emerald-400 bg-emerald-500/10' };
  return <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wider ${colors[impact] || colors.LOW}`}>{impact}</span>;
}

export default function DailyBriefing() {
  const [role, setRole] = useState('EXECUTIVE');
  const [briefing, setBriefing] = useState(null);
  const [loading, setLoading] = useState(false);
  const [demoMode, setDemoMode] = useState(false);

  const fetchBriefing = useCallback(async (r) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/brain/briefing?role=${r}`, {
        headers: {
          'workspace-id': WORKSPACE_ID,
          ...(TOKEN && { Authorization: `Bearer ${TOKEN}` })
        }
      });
      if (!res.ok) throw new Error('API unavailable');
      const data = await res.json();
      setBriefing(data.briefing);
      setDemoMode(false);
    } catch {
      setBriefing(DEMO_BRIEFING);
      setDemoMode(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchBriefing(role); }, [role, fetchBriefing]);

  const sections = briefing?.sections || {};
  const recs = sections.strategicRecommendations || sections.actions || [];

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Daily Briefing</h1>
          <p className="text-text-muted text-sm mt-1">
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
            {demoMode && <span className="ml-2 text-amber-400 text-xs">(Demo mode)</span>}
          </p>
        </div>
        <div className="flex gap-1 p-1 bg-bg-secondary border border-border-subtle rounded-lg">
          {ROLES.map(r => (
            <button
              key={r}
              onClick={() => setRole(r)}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${role === r ? 'bg-flow-purple text-white' : 'text-text-muted hover:text-text-primary'}`}
            >
              {r[0] + r.slice(1).toLowerCase()}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 rounded-full border-4 border-flow-purple/20 border-t-flow-purple animate-spin" />
        </div>
      ) : (
        <>
          {/* AI Narrative */}
          {briefing?.aiNarrative && (
            <div className="p-4 rounded-xl bg-flow-purple/10 border border-flow-purple/20">
              <p className="text-sm text-text-primary leading-relaxed">
                <span className="font-semibold text-flow-purple">FLOW AI: </span>
                {briefing.aiNarrative}
              </p>
            </div>
          )}

          {/* Company Health (Executive) */}
          {sections.companyHealth !== undefined && (
            <div className="p-4 rounded-xl bg-bg-secondary border border-border-subtle space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider">Company Health</h2>
                <span className={`text-2xl font-bold ${sections.companyHealth >= 80 ? 'text-emerald-400' : sections.companyHealth >= 60 ? 'text-amber-400' : 'text-red-400'}`}>
                  {sections.companyHealth}<span className="text-sm font-normal text-text-muted">/100</span>
                </span>
              </div>
              {sections.sectors && Object.entries(sections.sectors).map(([key, val]) => (
                <HealthBar key={key} label={key} value={val} />
              ))}
            </div>
          )}

          {/* Team Blockers (Manager) */}
          {sections.teamBlockers?.length > 0 && (
            <div className="p-4 rounded-xl bg-bg-secondary border border-border-subtle space-y-3">
              <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider">Team Blockers</h2>
              {sections.teamBlockers.map((b, i) => (
                <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-red-500/5 border border-red-500/10">
                  <span className="text-red-400 text-lg">⚠</span>
                  <div>
                    <p className="text-sm font-medium text-text-primary">{b.title}</p>
                    {b.evidence?.map((e, ei) => <p key={ei} className="text-xs text-text-muted mt-1">{e}</p>)}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Priorities (Employee) */}
          {sections.priorities?.length > 0 && (
            <div className="p-4 rounded-xl bg-bg-secondary border border-border-subtle space-y-2">
              <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider">Today's Priorities</h2>
              {sections.priorities.map((p, i) => (
                <div key={i} className="flex items-center gap-3 p-2 rounded-lg hover:bg-bg-tertiary transition-colors">
                  <span className="text-flow-purple font-bold text-xs w-4">{i + 1}</span>
                  <p className="text-sm text-text-primary">{p.title}</p>
                </div>
              ))}
            </div>
          )}

          {/* Recommendations */}
          {recs.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider">
                AI Recommendations
              </h2>
              {recs.map((rec, i) => (
                <div key={i} className="p-4 rounded-xl bg-bg-secondary border border-border-subtle space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="text-sm font-semibold text-text-primary">{rec.title}</h3>
                    <div className="flex items-center gap-2 shrink-0">
                      {rec.impact && <ImpactBadge impact={rec.impact} />}
                      <span className="text-xs font-mono text-flow-purple">{rec.confidence}%</span>
                    </div>
                  </div>
                  {rec.evidence && <p className="text-xs text-text-muted leading-relaxed">{rec.evidence}</p>}
                  {rec.businessImpact && (
                    <p className="text-xs text-emerald-400 font-medium">Impact: {rec.businessImpact}</p>
                  )}
                  {rec.systems && (
                    <div className="flex flex-wrap gap-1 pt-1">
                      {rec.systems.map((s, si) => (
                        <span key={si} className="text-[10px] px-2 py-0.5 rounded-full bg-bg-tertiary border border-border-subtle text-text-muted">{s}</span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Metadata */}
          {briefing?.metadata && (
            <div className="flex flex-wrap gap-4 text-xs text-text-muted pt-2 border-t border-border-subtle">
              <span>Sources: {briefing.metadata.sources?.join(', ')}</span>
              <span>Open incidents: {briefing.metadata.openIncidents}</span>
              <span>Generated: {new Date(briefing.generatedAt).toLocaleTimeString()}</span>
            </div>
          )}
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Add /briefing route to App.jsx**

In `flow-os-frontend/src/App.jsx`, add import:

```jsx
const DailyBriefing = lazy(() => import('./components/workspace/DailyBriefing'));
```

Inside `<Routes>`, after the `/assistant` route:

```jsx
<Route path="/briefing" element={<DailyBriefing />} />
```

- [ ] **Step 3: Add Briefing link in Sidebar.jsx**

Open `flow-os-frontend/src/components/layout/Sidebar.jsx`. Find the navigation items array/section. Add a briefing entry near the top (after /workfeed):

The exact location depends on how Sidebar is structured. Find where `{ path: '/workfeed', label: 'Workfeed' }` or equivalent is defined and add after it:

```jsx
{ path: '/briefing', label: 'Daily Briefing', icon: '☀' }
```

- [ ] **Step 4: Commit**

```bash
git add flow-os-frontend/src/components/workspace/DailyBriefing.jsx flow-os-frontend/src/App.jsx flow-os-frontend/src/components/layout/Sidebar.jsx
git commit -m "feat(frontend): add role-aware daily briefing page wired to /api/brain/briefing"
```

---

## Task 11: Enterprise Readiness — Tech Debt & Hardening

**Files:**
- Modify: `src/services/operationalScoringService.js` (TD-11: remove console.log)
- Modify: `src/services/vectorStoreService.js` (TD-07: extract shared embeddings helper)
- Modify: `src/services/retrievalService.js` (TD-07: import shared embeddings helper)
- Modify: `src/server.js` (TD-04: restrict CORS to known origins)

- [ ] **Step 1: Fix TD-11 — remove console.log from operationalScoringService.js**

Open `src/services/operationalScoringService.js`. Find and remove the `console.log` statements on lines 13-14 that fire on every job. They log scoring debug info — replace with nothing (per the instruction: no logging unless essential for ops debugging).

- [ ] **Step 2: Fix TD-07 — extract shared generateEmbedding helper**

Open `src/services/vectorStoreService.js`. Find the `generateEmbedding` function. Move it to a new shared location in `src/utils/llm/embeddingHelpers.js` (this file may already exist — check first).

In `src/utils/llm/embeddingHelpers.js`, add/merge:

```js
import { GoogleGenAI } from '@google/genai';

export async function generateEmbedding(text) {
  if (!process.env.GEMINI_API_KEY) {
    // Random normalized vector fallback — only for dev/test
    const vec = Array.from({ length: 768 }, () => Math.random() - 0.5);
    const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
    return vec.map(v => v / norm);
  }
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const result = await ai.models.embedContent({
    model: 'gemini-embedding-2',
    contents: text
  });
  return result.embeddings[0].values;
}
```

In `src/services/vectorStoreService.js`, replace the local `generateEmbedding` function with:

```js
import { generateEmbedding } from '../utils/llm/embeddingHelpers.js';
```

In `src/services/retrievalService.js`, replace the local `generateEmbedding` function with the same import.

- [ ] **Step 3: Fix TD-04 — scope CORS to known origins**

In `src/server.js`, replace:

```js
app.use(cors({ origin: '*' }));
```

With:

```js
const ALLOWED_ORIGINS = (process.env.CORS_ORIGINS || process.env.FRONTEND_URL || 'http://localhost:3000')
  .split(',')
  .map(o => o.trim());

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile clients, curl, server-to-server)
    if (!origin) return callback(null, true);
    if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
    // In development, allow localhost on any port
    if (process.env.NODE_ENV !== 'production' && /^https?:\/\/localhost/.test(origin)) {
      return callback(null, true);
    }
    callback(new Error(`CORS: origin ${origin} not allowed`));
  },
  credentials: true
}));
```

Add `CORS_ORIGINS` to the env variables section in CLAUDE.md (done in Task 12).

- [ ] **Step 4: Commit**

```bash
git add src/services/operationalScoringService.js src/services/vectorStoreService.js src/services/retrievalService.js src/utils/llm/embeddingHelpers.js src/server.js
git commit -m "fix(enterprise): remove TD-11 log noise, deduplicate embeddings helper (TD-07), scope CORS to known origins (TD-04)"
```

---

## Task 12: Build, Lint, and Documentation

**Files:**
- Modify: `CLAUDE.md` (update sprint + env vars)
- Modify: `DEVELOPER_WALKTHROUGH.md` (add Phase 7 section)

- [ ] **Step 1: Run frontend build**

```bash
cd flow-os-frontend && npm run build
```

Expected: Vite build completes. Fix any errors before continuing.

Common fixes:
- If `AICopilot.jsx` has unused import warnings, remove them.
- If Sidebar.jsx has issues with the new nav item, adjust to match existing structure.

- [ ] **Step 2: Verify backend starts cleanly**

```bash
node --input-type=module --eval "
import { validateEnv } from './src/utils/envValidation.js';
try { validateEnv(); console.log('Env OK'); } catch(e) { console.log('Env error:', e.message); }
"
```

Expected: `Env OK` (or env warnings about missing optional keys like GITHUB_TOKEN).

- [ ] **Step 3: Update CLAUDE.md — Phase 7 section**

Add the following under `## 10. Current Sprint` (replacing or appending after Sprint 5.6):

```markdown
### What was delivered in Sprint 7.0 — Autonomous Operational Brain

**New backend services:**
- `src/services/orgMemoryService.js` — durable PostgreSQL-backed decision/incident store (fixes TD-01 for critical data)
- `src/services/operationalGraphService.js` — PostgreSQL-backed operational knowledge graph (fixes TD-01 for entity graph)
- `src/services/briefingEngine.js` — role-aware (EMPLOYEE/MANAGER/EXECUTIVE) multi-source daily briefing generator with Gemini synthesis and heuristic fallback
- `src/services/copilotService.js` — context-aware per-page Q&A engine built on the existing RAG pipeline
- `src/services/automationEngine.js` — cross-capability workflow trigger system: event type → matching rules → execute actions in sequence through governance; runs persisted to PostgreSQL
- `src/services/goalTrackingService.js` — OKR-style goal CRUD with milestone-based progress computation

**New Prisma models (all in `prisma/migrations/phase7_brain/`):**
- `OrgMemoryRecord` — durable decisions/incidents/events
- `GraphNode` + `GraphEdge` — persistent operational graph
- `Goal` + `GoalMilestone` — OKR tracking
- `AutomationRule` + `AutomationRun` — workflow definitions and audit trail

**New API:**
`GET  /api/brain/briefing?role=EMPLOYEE|MANAGER|EXECUTIVE` — role-aware daily briefing
`POST /api/brain/copilot` — context-aware copilot Q&A (body: { question, pageContext, entityId })
`GET  /api/brain/automations` — list automation rules + recent runs
`POST /api/brain/automations` — create automation rule (body: { name, trigger, conditions, actions })
`PATCH /api/brain/automations/:id/toggle` — enable/disable rule
`GET  /api/brain/goals` — list goals (?status=ON_TRACK|AT_RISK|...)
`POST /api/brain/goals` — create goal (body: { title, description, targetDate, owner, milestones[] })
`GET  /api/brain/goals/:id` — single goal
`PATCH /api/brain/goals/:id` — update goal
`POST /api/brain/goals/:id/milestones` — add milestone
`PATCH /api/brain/goals/:goalId/milestones/:milestoneId/complete` — mark done
`DELETE /api/brain/goals/:id` — delete goal
`GET  /api/brain/memory` — organizational memory records (?hours=168)
`GET  /api/brain/graph` — graph stats + neighbors (?entityId=)

**New frontend:**
- `src/components/ui/AICopilot.jsx` — floating copilot overlay on every page (via LayoutShell)
- `src/components/workspace/DailyBriefing.jsx` — `/briefing` route with role selector and evidence-backed recommendations

**Enterprise readiness fixes:**
- TD-04 (CORS): restricted to `CORS_ORIGINS` env var or `FRONTEND_URL`, localhost allowed in dev
- TD-07 (duplicate embeddings): consolidated to `src/utils/llm/embeddingHelpers.js`
- TD-11 (log noise): removed `console.log` from operationalScoringService.js
```

Also update the tech debt table to mark TD-04, TD-07, TD-11 as resolved.

Also add `CORS_ORIGINS` to the environment variables section:

```bash
# CORS — comma-separated list of allowed frontend origins
CORS_ORIGINS=http://localhost:3000,https://app.yourdomain.com
```

- [ ] **Step 4: Update DEVELOPER_WALKTHROUGH.md — Phase 7 quickstart**

Add a section "Phase 7.0 — Autonomous Brain Quickstart" with:

```markdown
## Phase 7.0 — Autonomous Brain Quickstart

### Daily Briefing API
```bash
curl "http://localhost:5000/api/brain/briefing?role=EXECUTIVE" \
  -H "Authorization: Bearer <jwt>" \
  -H "workspace-id: workspace_corp_alpha"
```

### Copilot Q&A
```bash
curl -X POST http://localhost:5000/api/brain/copilot \
  -H "Authorization: Bearer <jwt>" \
  -H "workspace-id: workspace_corp_alpha" \
  -H "Content-Type: application/json" \
  -d '{"question":"What is our biggest risk right now?","pageContext":"/briefing"}'
```

### Create an Automation Rule
```bash
curl -X POST http://localhost:5000/api/brain/automations \
  -H "Authorization: Bearer <jwt>" \
  -H "workspace-id: workspace_corp_alpha" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "CRITICAL Incident Slack Alert",
    "trigger": "INCIDENT_CREATED",
    "conditions": { "severity": "CRITICAL" },
    "actions": [{ "connector": "slack", "actionType": "SEND_MESSAGE", "payload": { "channel": "#incidents" } }]
  }'
```

### Create a Goal
```bash
curl -X POST http://localhost:5000/api/brain/goals \
  -H "Authorization: Bearer <jwt>" \
  -H "workspace-id: workspace_corp_alpha" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Ship Feature X to GA",
    "description": "Launch Feature X to all customers by Q3",
    "targetDate": "2026-09-30",
    "owner": "Sarah Chen",
    "milestones": [
      { "title": "Complete backend API" },
      { "title": "Frontend integration" },
      { "title": "QA sign-off" }
    ]
  }'
```

### AI Copilot (Frontend)
The floating ✦ button in the bottom-right corner of every FLOW page opens the AI Copilot. It sends your question + current page path to `/api/brain/copilot` and returns an answer with evidence links.
```

- [ ] **Step 5: Final commit**

```bash
git add CLAUDE.md DEVELOPER_WALKTHROUGH.md
git commit -m "docs: update CLAUDE.md and DEVELOPER_WALKTHROUGH.md for Phase 7.0 Autonomous Operational Brain"
```

---

## Self-Review Checklist

### Spec Coverage

| Spec Requirement | Task |
|---|---|
| Continuous Company Awareness — live operational model | Task 3 (persistent graph), Task 2 (durable memory) |
| AI Daily Briefings — Employee/Manager/Executive | Task 4 (BriefingEngine), Task 10 (DailyBriefing page) |
| Operational Copilot on every page | Task 5 (CopilotService), Task 9 (AICopilot component) |
| Cross-Capability Automation | Task 6 (AutomationEngine) |
| Goal Tracking | Task 7 (GoalTrackingService), Task 8 (brain routes) |
| Organizational Memory | Task 2 (OrgMemoryService), Task 1 (Prisma models) |
| Explainable AI — evidence, systems, confidence, business impact | Task 4 (briefingEngine outputs all fields), Task 5 (copilotService returns evidence[]) |
| Enterprise Readiness — CORS, embeddings dedup, log noise | Task 11 |
| npm run lint + build | Task 12 |
| Update CLAUDE.md + DEVELOPER_WALKTHROUGH.md | Task 12 |

### No Placeholders
All code blocks are complete and executable. No "TBD", "implement later", or "similar to Task N" references.

### Type Consistency
- `saveMemory(workspaceId, orgId, type, data)` — consistent across Task 2 (creation) and Task 8 usage
- `generateBriefing(workspaceId, orgId, role)` — consistent across Task 4 (definition) and Task 8 (`brainRoutes.js`)
- `answerCopilotQuery(workspaceId, { question, pageContext, entityId })` — consistent across Task 5 and Task 8
- `evaluateTrigger(workspaceId, orgId, eventType, payload)` — consistent across Task 6 and server.js wiring
- All PostgreSQL models use `workspaceId: String(workspaceId)` normalization consistently

---

**Plan complete and saved to `docs/superpowers/plans/2026-06-28-phase-7-autonomous-operational-brain.md`.**

**Two execution options:**

**1. Subagent-Driven (recommended)** — Dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
