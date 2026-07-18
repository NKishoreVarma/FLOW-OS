# Operational Graph Engine — Phase 11.1 (Digital Twin)

> FLOW stops answering from isolated records and starts reasoning across
> relationships. Every object in the company is a **node**; every relationship is
> an **edge**. The graph answers: *why? how? who? what depends on this? what is
> impacted? what is connected?*

---

## 1. What it is

The Operational Graph is the company's **Digital Twin** — a live, workspace-scoped
graph of people, work, systems, and customers, kept current in real time by the
Unified Event Platform (Phase 11.0). It is not a new database: it is built on the
existing Phase 7 PostgreSQL `graph_nodes` / `graph_edges` tables, extended and
driven by a single event-sourced writer.

```
 Unified Event Platform (11.0)          Operational Graph Engine (11.1)
 ┌──────────────────────────┐           ┌───────────────────────────────────┐
 │ every FLOW event          │  graph    │ GraphSchema   event → nodes+edges  │
 │  (github, slack, jira,    │ ───────▶  │ GraphEngine   applyEvent (single   │
 │   gmail, calendar, crm…)  │ subscriber│               writer, incremental) │
 └──────────────────────────┘           │ Node/EdgeManager  durable upsert    │
                                         │ TraversalEngine   bounded BFS       │
        graph_nodes / graph_edges  ◀──── │ Impact/Dependency/RelationshipScorer│
        (PostgreSQL, Phase 7)            │ Search / Index / Metrics            │
                                         └───────────────────────────────────┘
                                                 │
                              /api/graph/*   ·   /graph-explorer (admin viz)
```

### Module map (`src/graph/`)

| Module | Responsibility |
|--------|----------------|
| `nodeTypes.js` | 21 node types, 19 edge types, id namespacing, dependency/impact edge sets |
| `GraphSchema.js` | Derives nodes + edges from a unified FLOW event (the twin-builder rules) |
| `NodeManager.js` / `EdgeManager.js` | Durable bulk upsert; edges accumulate `observation_count` + `last_observed_at` |
| `GraphEngine.js` | `applyEvent` / `applyEvents` — the single graph writer |
| `TraversalEngine.js` | Bounded iterative BFS: neighbors, k-hop, shortest path, dependency, impact, temporal |
| `ImpactAnalyzer.js` | Blast-radius scoring ("what breaks if X fails") |
| `DependencyAnalyzer.js` | Dependency chains, orphan + staleness detection |
| `RelationshipScorer.js` | Strength scoring, who-knows, top collaborators |
| `GraphSearch.js` · `GraphIndex.js` · `GraphMetrics.js` | Search, degree/hubs, counts/density/orphans |
| `graphSubscriber.js` | Registers the `graph` subscriber on the event bus |
| `index.js` | Public API + subscriber registration |

---

## 2. Node taxonomy (21)

Employee · Department · Repository · Pull Request · Commit · Issue · Meeting ·
Decision · Project · Customer · Vendor · Document · Email · Slack Thread ·
Incident · Deployment · Task · Recommendation · Memory · Timeline Event ·
Integration.

**Node ids** are namespaced `type:connector:key`, then tenant-prefixed as the
PK: `${workspaceId}:type:connector:key`. **People and customers are
connector-agnostic** (`people` / `customer` namespace) so the same person or
account is one node across GitHub, Slack, Calendar, etc. — essential for "if X
leaves, what knowledge disappears?". Connector-native objects (PRs, repos,
incidents) keep the connector in their key.

## 3. Edge taxonomy (19)

OWNS · CREATED · ASSIGNED_TO · REVIEWED · DEPENDS_ON · BLOCKED_BY · MENTIONED_IN ·
DISCUSSED_IN · AFFECTED · CAUSED · RESOLVED · ATTENDED · WORKS_WITH · REPORTS_TO ·
BELONGS_TO · CONNECTED_TO · GENERATED · RELATED_TO · REFERENCES.

Each edge carries `weight`, `observation_count` (how many times the relationship
was seen), and `last_observed_at` (recency) — the inputs to relationship scoring
and temporal traversal.

- **Dependency edges** (upstream): `DEPENDS_ON`, `BLOCKED_BY`, `BELONGS_TO`, `ASSIGNED_TO`.
- **Impact edges** (propagation): out along `AFFECTED`/`CAUSED`/`CONNECTED_TO`, in along `DEPENDS_ON`/`BELONGS_TO`/`CONNECTED_TO`.

---

## 4. Event → Graph pipeline

The graph subscribes to the one event bus and never polls or rebuilds:

```
event bus ─▶ graph subscriber (durable, retries) ─▶ GraphEngine.applyEvent(event)
   ├─ GraphSchema.deriveGraph(event) → { nodes[], edges[] }
   │     • TIMELINE_EVENT node (causation anchor, keyed by eventId)
   │     • primary domain node (PR / Incident / Customer / Meeting / …)
   │     • Employee node(s) from actors, Integration node from connector
   │     • Repository / Project / Customer nodes from metadata + affected*
   │     • edges: CREATED / REVIEWED / ATTENDED / BELONGS_TO / GENERATED /
   │              AFFECTED / WORKS_WITH / CAUSED (causationId) / REFERENCES
   ├─ NodeManager.bulkUpsertNodes   (nodes first — FK integrity)
   └─ EdgeManager.bulkUpsertEdges   (observation_count += 1, weight = max, recency bump)
```

**Loop safety:** the graph subscriber only writes graph rows; it never publishes
events, so it cannot cycle. Causation chains reliably connect because
`causationId` (an eventId) matches the TIMELINE_EVENT node keyed by that eventId —
this is what makes "which PR caused this incident?" answerable across events.

Adding a new connector requires **no graph code**: as long as it publishes FLOW
events, the twin populates automatically.

---

## 5. Traversal algorithms

Traversal is **bounded iterative BFS**, not a recursive CTE. On a dense graph
(e.g. a `WORKS_WITH` collaboration mesh where a hub has hundreds of neighbors) an
unbounded recursive CTE explodes combinatorially — in testing a 2-hop expansion
from a hub took **38 seconds**. The BFS approach does one indexed, capped query
per hop:

```
SELECT (neighbor), (parent), weight
  FROM graph_edges
 WHERE workspace_id = $1 AND (source_id = ANY($frontier) OR target_id = ANY($frontier))
 ORDER BY weight DESC LIMIT 4000
```

with a per-level frontier cap (400, highest-weight first) and a global node cap
(1000). The same 2-hop expansion now runs in **~30ms**. The trade-off: on huge
hubs the strongest relationships are explored first, which is the right bias for
operational questions.

| Query | Method |
|-------|--------|
| `neighbors` | single indexed 1-hop query |
| `traverse` (1/2/3-hop) | undirected BFS, optional edge-type + `since` (temporal) filters |
| `shortestPath` | bidirectional-style BFS with parent pointers, reconstructs the chain |
| `dependencyChain` | directed BFS outward along dependency edges |
| `impactPath` | directed BFS along impact edges (out + in) |

---

## 6. Digital Twin lifecycle

1. **Bootstrap / backfill** — `GraphEngine.applyEvents(workspaceId, orgId, events)`
   or a dataset builder (see `scripts/validate-demo-twin.js`) constructs the
   initial twin in bulk.
2. **Live update** — every subsequent event incrementally upserts nodes/edges;
   repeated relationships strengthen (`observation_count`) and refresh recency.
3. **Query** — `/api/graph/*` and the analysis engines answer questions.
4. **Decay / staleness** — `last_observed_at` lets the twin surface stale
   knowledge and dormant entities without deleting history.
5. **Retention** — graph rows are workspace-scoped and cascade-delete with the org.

---

## 7. Query examples

Engine (server-side):

```js
import * as graph from '../graph/index.js';

await graph.whoKnows(ws, 'payments');              // experts on a topic
await graph.topCollaborators(ws, 20);              // who works with whom, ranked
await graph.shortestPath(ws, personA, personB);    // how are two people connected
await graph.analyzeImpact(ws, 'REPOSITORY:github:payments-svc');  // blast radius
await graph.analyzeDependencies(ws, prNodeId);     // what this depends on
await graph.findOrphans(ws, 'REPOSITORY');         // repos owned by nobody
await graph.findStale(ws, { type: 'DOCUMENT', days: 90 });        // stale docs
```

REST (`/api/graph`, JWT + workspace-id):

```
GET /api/graph/metrics
GET /api/graph/who-knows?topic=payments
GET /api/graph/collaborators
GET /api/graph/path?from=<id>&to=<id>
GET /api/graph/impact/<id>
GET /api/graph/dependencies/<id>
GET /api/graph/orphans?type=REPOSITORY
GET /api/graph/stale?type=DOCUMENT&days=90
GET /api/graph/traverse/<id>?hops=2
GET /api/graph/search?q=<text>&type=EMPLOYEE
```

**Graph Explorer** (admin visualization): `/graph-explorer` — dev-only (404 in
production), OWNER/ADMIN JWT + workspace-id. Force-directed SVG with search,
expand/collapse, path highlighting, impact + dependency visualization, temporal
filtering, workspace filtering, and live metrics. No build step, no external CDN.

---

## 8. Performance

Measured on the demo company (Helios Software) twin, local PostgreSQL, single
process. `node scripts/validate-demo-twin.js`.

**Twin scale:** 4,420 nodes · 26,636 edges, built in ~3.7s.

| Nodes | Edges |
|-------|-------|
| Commit 1415 · Issue 1200 · Employee 450 · Document 400 · PR 329 · Meeting 300 · Customer 210 · Incident 80 · Repository 16 · Department 12 · Project 8 | WORKS_WITH 13841 · BELONGS_TO 3410 · CREATED 3263 · ATTENDED 2327 · ASSIGNED_TO 1200 · REVIEWED 655 · DEPENDS_ON 544 · AFFECTED 533 · REPORTS_TO 449 · OWNS 226 · CONNECTED_TO 80 · RESOLVED 61 · DISCUSSED_IN 47 |

| Operation | Latency |
|-----------|---------|
| neighbors (hub, 200 edges) | ~12 ms |
| 2-hop traversal (1000-node cap) | ~30 ms |
| 3-hop traversal | ~28 ms |
| shortest path (employee → employee) | ~18 ms |
| impact analysis (357 impacted) | ~35 ms |
| dependency analysis | ~9 ms |

All 13 twin validations pass: traversal, shortest path, impact, dependency,
collaboration graph, orphan detection, stale-knowledge detection, relationship
scoring, and who-knows.

---

## 9. Scaling strategy

- **Indexes:** `(workspace_id, source_id)`, `(workspace_id, target_id)`,
  `(workspace_id, relationship_type)`, and `(workspace_id, last_observed_at)`
  keep every hop and staleness scan index-only (v11.1 migration).
- **Bounded traversal** guarantees predictable latency regardless of hub degree.
- **When volume grows:** (1) partition `graph_edges` by workspace or time;
  (2) add a per-workspace in-memory adjacency cache for hot subgraphs behind the
  same `TraversalEngine` interface; (3) precompute and store impact/dependency
  closures for critical nodes; (4) move to a native graph store only if
  multi-hop analytical load outgrows Postgres — the engine API would not change.
- **Writes** are idempotent bulk upserts with observation counting, so replay and
  backfill are safe.

---

## 10. Future roadmap

1. **Entity resolution** — unify people/customers across connectors by email/domain
   (today: name/id key in a shared namespace).
2. **Weighted causation** — learn edge weights from outcomes (which causes actually
   led to incidents) to sharpen impact scoring.
3. **Temporal snapshots** — "what did the org look like on date X" via edge history.
4. **Graph-RAG** — feed traversal results into the Operational Brain as grounded
   context ("answer using the relationship path", not just vector hits).
5. **Anomaly detection** — flag structural changes (a repo losing its only owner,
   a customer's support graph going quiet).
6. **Frontend Graph view** — promote the admin Explorer into the product UI.

---

## 11. Known technical debt

- **TD-OG-01** — `src/validation/helpers/testContext.js` inserts into
  `"Org"`/`"Workspace"` (wrong table names); its inserts silently no-op. Graph/org
  tests seed via Prisma instead. Low risk.

---

*Phase 11.1 — Milestone 2 complete. Operational Graph Engine is production-ready.*
