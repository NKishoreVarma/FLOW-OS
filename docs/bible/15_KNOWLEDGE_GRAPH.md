# FLOW OS — Knowledge Graph
**Document:** 15 of 20  
**Status:** Authoritative  
**Last updated:** 2026-07-18

---

## Overview

The Knowledge Graph is FLOW's company Digital Twin — a live, continuously updated map of every entity and relationship in the organization.

Every person, project, customer, repository, deployment, meeting, incident, document, and system is a node. Every relationship between them is an edge. FLOW reasons across this graph to answer questions that require multi-hop context: "Who knows the most about this service?" "What is the blast radius if this engineer leaves?" "What other systems depend on this service?"

---

## Architecture

The graph is built on Phase 7's PostgreSQL `graph_nodes` and `graph_edges` tables, extended in Phase 11.1.

### Schema

```sql
CREATE TABLE graph_nodes (
  id              TEXT PRIMARY KEY,      -- "${workspaceId}:${type}:${connector}:${key}"
  workspace_id    TEXT NOT NULL,
  type            TEXT NOT NULL,         -- node type (21 types)
  connector       TEXT,
  external_id     TEXT,
  name            TEXT,
  properties      JSONB,
  last_observed_at TIMESTAMP,
  created_at      TIMESTAMP DEFAULT NOW()
);

CREATE TABLE graph_edges (
  id              TEXT PRIMARY KEY,      -- gen_random_uuid()::text (app-side cuid() not used)
  workspace_id    TEXT NOT NULL,
  source_id       TEXT NOT NULL REFERENCES graph_nodes(id),
  target_id       TEXT NOT NULL REFERENCES graph_nodes(id),
  type            TEXT NOT NULL,         -- edge type (19 types)
  weight          FLOAT DEFAULT 1.0,
  observation_count INT DEFAULT 1,
  last_observed_at TIMESTAMP,
  properties      JSONB,
  created_at      TIMESTAMP DEFAULT NOW()
);
```

**Important:** Edge IDs must use `gen_random_uuid()::text` in raw SQL inserts. Prisma's `@default(cuid())` is app-side only and is not used for raw SQL inserts.

---

## Node Types (21)

| Type | Description | Example ID |
|---|---|---|
| `PERSON` | Employee, team member | `ws:person:people:alice@co` |
| `CUSTOMER` | External customer/account | `ws:customer:customer:acme-corp` |
| `REPOSITORY` | Code repository | `ws:repository:github:myorg/flow-backend` |
| `PULL_REQUEST` | A PR in a repository | `ws:pull_request:github:myorg/flow-backend/447` |
| `COMMIT` | A git commit | `ws:commit:github:sha:abc123` |
| `BRANCH` | A git branch | `ws:branch:github:feature/new-auth` |
| `DEPLOYMENT` | A deployment event | `ws:deployment:github:myorg/flow-backend/prod/42` |
| `ISSUE` | Jira issue or GitHub issue | `ws:issue:jira:FLOW-123` |
| `PROJECT` | Jira project or GitHub repo project | `ws:project:jira:FLOW` |
| `SPRINT` | Jira sprint | `ws:sprint:jira:Sprint-18` |
| `SERVICE` | Backend service or system | `ws:service:manual:auth-service` |
| `EVENT` | Calendar event | `ws:event:calendar:event_id_xyz` |
| `DOCUMENT` | Notion page, Google Doc, Confluence page | `ws:document:notion:page_id_abc` |
| `EMAIL` | Gmail email thread | `ws:email:gmail:thread_id_xyz` |
| `CHANNEL` | Slack channel | `ws:channel:slack:C01234ABCD` |
| `INCIDENT` | Detected incident | `ws:incident:flow:incident_id_xyz` |
| `TEAM` | Organizational team | `ws:team:hr:engineering` |
| `DEPARTMENT` | Business department | `ws:department:hr:engineering` |
| `VENDOR` | External vendor | `ws:vendor:manual:datadog` |
| `GOAL` | OKR / strategic goal | `ws:goal:flow:goal_id_xyz` |
| `SIMULATION` | What-If scenario result | `ws:simulation:flow:sim_id_xyz` |

**Namespace note:** People and customers use shared `people`/`customer` namespaces (one node per person across all connectors). Connector-native objects keep their connector in the ID.

---

## Edge Types (19)

| Type | Description | Example |
|---|---|---|
| `AUTHORED_BY` | PR/commit authored by person | PR → Alice |
| `REVIEWED_BY` | PR reviewed by person | PR → Bob |
| `ASSIGNED_TO` | Issue assigned to person | Issue → Alice |
| `REPORTED_BY` | Incident reported by person | Incident → Bob |
| `BELONGS_TO` | Issue/PR belongs to project/repo | PR → Repository |
| `DEPLOYED_TO` | Deployment target | Deployment → Service |
| `PART_OF` | Sprint/milestone membership | Issue → Sprint |
| `MENTIONS` | Communication mentions entity | Email → Person/Issue |
| `DEPENDS_ON` | Service/system dependency | Service → Service |
| `ATTENDING` | Person attending event | Person → Event |
| `WORKS_ON` | Person works on project/service | Person → Project |
| `OWNS` | Person owns service/repository | Person → Repository |
| `ESCALATED_TO` | Customer issue escalated to person | Customer → Person |
| `MANAGED_BY` | Person managed by another | Person → Person |
| `MEMBER_OF` | Person member of team | Person → Team |
| `CUSTOMER_OF` | Company customer relationship | Customer → Company |
| `USES` | Person uses tool/system | Person → Service |
| `CAUSED` | Deployment caused incident | Deployment → Incident |
| `RESOLVES` | PR/commit resolves issue | PR → Issue |

---

## Population

The graph is populated by a single writer: the `graph` event bus subscriber in `src/graph/`.

```
Event Platform (flow_events)
    ↓
GraphEngine.applyEvent(event)
    ↓
GraphSchema.deriveGraph(event)
    → returns [{ nodes: [...], edges: [...] }]
    ↓
Bulk upsert into graph_nodes and graph_edges
```

**Single writer invariant:** Only the graph event bus subscriber writes to the graph. No other code writes directly to `graph_nodes` or `graph_edges`. This eliminates race conditions and duplicate edges.

**Zero polling:** The graph never rebuilds from scratch. It accumulates in real time from events. Adding a connector requires only publishing FLOW events — zero graph code changes.

---

## Traversal

All graph traversal uses bounded iterative BFS, not recursive CTEs (which explode on dense hubs, causing 38s → 30ms difference on real company graphs).

### Traversal Algorithms

```js
// Get immediate neighbors
graph.neighbors(workspaceId, nodeId, { direction: 'both' | 'in' | 'out' })

// K-hop traversal (bounded)
graph.kHop(workspaceId, nodeId, {
  maxHops: 3,
  maxNodes: 1000,
  frontierCap: 400,     // max nodes in BFS frontier at any step
  edgeTypes: [...],     // filter by edge type
})

// Shortest path between two nodes
graph.shortestPath(workspaceId, sourceId, targetId)

// Dependency chain (who/what depends on X)
graph.dependencyChain(workspaceId, nodeId)

// Impact path (what does X affect)
graph.impactPath(workspaceId, nodeId)

// Temporal traversal (state of graph at time T)
graph.temporalNeighbors(workspaceId, nodeId, { asOf: Date })
```

Frontier cap (400 nodes per hop) and node cap (1000 total) prevent runaway traversals on dense hubs.

---

## Analysis

### ImpactAnalyzer — Blast Radius

`analyzeImpact(workspaceId, nodeId)` answers: "If this entity is removed or fails, what is affected?"

Returns:
- Directly impacted nodes (1-hop)
- Transitively impacted nodes (N-hop)
- Estimated blast radius (count)
- Paths of impact
- High-risk nodes in the impact set

Used by the What-If Simulation Engine for departure, outage, and churn scenarios.

### DependencyAnalyzer — Risk Surface

`analyzeDependencies(workspaceId, nodeId)` answers: "What does this entity depend on?"

Returns:
- Dependency tree
- Orphaned nodes (no dependencies but also no dependents — dead code/services)
- Stale nodes (last observed > 90 days)
- Bus-factor nodes (depended on by many, owned by one)

### RelationshipScorer — Connection Strength

`scoreRelationship(workspaceId, nodeId1, nodeId2)` answers: "How strongly are these two entities connected?"

```
strength = weight × ln(1 + observationCount) × recencyDecay
```

Used by:
- `whoKnows(workspaceId, entityId)` — who knows the most about this entity (by strongest relationship)
- `topCollaborators(workspaceId, personId)` — who does this person work most closely with
- `suggestedReviewers(workspaceId, prId)` — who should review this PR (by code ownership edges)

---

## Knowledge Explorer (`/knowledge`)

The user-facing graph visualization.

### Current State (Known Issue)

The `KnowledgeExplorer.jsx` component currently renders entirely hardcoded demo data (17 nodes, 20 edges). It does not call any `/api/graph/*` endpoints.

### Required State

The Knowledge Explorer must connect to the live graph:

```
GET /api/graph/nodes?workspaceId=X&limit=100&types=PERSON,REPOSITORY,SERVICE
GET /api/graph/neighbors?nodeId=X&maxHops=2
POST /api/graph/search?q=auth+service
```

The force-directed SVG visualization receives real nodes and edges from these endpoints.

### Features

- Force-directed graph layout (SVG, client-side physics)
- Node colors by type (Person=blue, Repository=orange, Service=gray, Issue=yellow, etc.)
- Click node → Entity Workspace slide-over (`/entity/:id`)
- Search bar → highlights matching nodes
- Time filter → shows graph state as of selected date (temporal traversal)
- Expand node → loads neighbors on demand
- Path highlighting → shortest path between two selected nodes
- Impact mode → highlights blast radius of selected node

---

## Entity Workspace (`/entity/:id`)

A cross-capability view of a single graph node.

Route: `/entity/:entityId`  
Component: `EntityWorkspace.jsx`  
API: `GET /api/brain/context/:entityId`

Shows:
- Entity type and metadata
- Connected entities (grouped by type: People, PRs, Issues, Events, etc.)
- Recent events involving this entity (from Event Platform)
- Decisions referencing this entity
- AI summary of entity context
- Simulation: "What if this entity is removed?"

This is the deep-dive surface. Users reach it from:
- Clicking a node in the Knowledge Explorer
- Clicking an entity link in a brain response
- Entity mentions in meeting prep context

---

## Graph in Reasoning

The RAG pipeline performs a 2-hop Knowledge Graph expansion on retrieved chunks:

```
For each retrieved chunk:
  1. Extract entity IDs mentioned in the chunk
  2. Get 2-hop neighbors of each entity from the graph
  3. Inject entity context as additional evidence
  4. Weight by relationship strength
```

This means: if a chunk mentions "auth-service", FLOW also retrieves:
- The engineer who owns auth-service
- The PRs recently merged into auth-service
- The incidents that were caused by auth-service deployments
- The Jira issues linked to auth-service

All of this context reaches the Synthesis Agent without the user asking for it.
