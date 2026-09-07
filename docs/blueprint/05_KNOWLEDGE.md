# Blueprint: Knowledge — `/knowledge`
**Document:** BP-05  
**Last updated:** 2026-07-18  
**Status:** Authoritative

---

## Purpose

Answer one question: **"What does my company actually know?"**

Knowledge visualizes the operational knowledge graph — entities, relationships, and cross-workspace intelligence derived from all connected sources. It is the "Digital Twin" explorer. Its primary action is exploring a specific entity or asking FLOW to surface connected knowledge.

**Known issue:** `KnowledgeExplorer.jsx` currently renders hardcoded demo data. It must be connected to `/api/graph/*` endpoints. This blueprint specifies the target behavior.

---

## Target User

**Primary:** CTO, VP Engineering, Head of Product  
**Secondary:** Any user researching a project, person, or system  
**Frequency:** Weekly or when researching a specific entity/topic

---

## Entry Points

| Source | How |
|---|---|
| Sidebar | "Knowledge" item (PRIMARY group, position 5) |
| `⌘K` → "Go to Knowledge" | CommandPalette |
| Entity card click | From Brain response or any inline entity reference |
| `/entity/:id` | Direct entity workspace link |
| Direct URL | `/knowledge` |

---

## Layout Hierarchy

```
┌─────────────────────────────────────────────────────────────────┐
│ Sidebar (220px)                                                 │
├──────────────────────────────────────────────┬──────────────────┤
│                                              │                  │
│  PageHeader (60px)                           │  Graph Panel     │
│  Knowledge   [search input ⌘F]  [filters ▾] │  (force-directed │
│  ──────────────────────────────────────────  │  SVG graph,      │
│                                              │  right column    │
│  StatsBar (40px)                             │  or full panel   │
│  N nodes · N edges · last synced: Xm ago    │  on /entity/:id) │
│  ──────────────────────────────────────────  │                  │
│                                              │                  │
│  EntityStream (left panel, scrollable)       │                  │
│  ├── [Type filter: All / People / Projects / │                  │
│  │    Repos / Services / Customers / ...]    │                  │
│  ├── EntityCard (compact row)                │                  │
│  ├── EntityCard                              │                  │
│  └── ...                                    │                  │
│                                              │                  │
│  [StickyCommandCenter]                       │                  │
└──────────────────────────────────────────────┴──────────────────┘
```

---

## Sub-Pages

| Route | Purpose |
|---|---|
| `/knowledge` | Main explorer: entity list + graph |
| `/entity/:id` | Entity Workspace: full context for one entity |

---

## Information Hierarchy

```
Level 1  StatsBar — workspace graph scale and freshness
Level 2  Type filter tabs — narrow entity scope
Level 3  EntityStream — scrollable list of entities
Level 4  Graph Panel — visual force-directed graph (right)
Level 5  Entity detail on click — expands right panel with entity context
Level 6  StickyCommandCenter
```

---

## Components

| Component | File | Notes |
|---|---|---|
| `KnowledgeExplorer` | `components/knowledge/KnowledgeExplorer.jsx` | Page orchestrator — MUST be rewired to `/api/graph/*` |
| `EntityCard` | Inline | Compact entity row |
| `EntityContextPanel` | `components/workspace/EntityContextPanel.jsx` | Right panel detail |
| `EntityWorkspace` | `components/workspace/EntityWorkspace.jsx` | `/entity/:id` page |
| `GraphViewer` | SVG-based, inline | Force-directed graph (see `graph-explorer` admin precedent) |
| `SkeletonCard` | variant `row` | Loading |

---

## Data Sources

| Data | Source | Notes |
|---|---|---|
| Graph stats | `GET /api/graph/stats` (or `/api/workspace/snapshot` graph counts) | Node/edge counts |
| Entity list | `GET /api/graph/search?q={query}&type={type}&workspaceId={ws}` | Paginated |
| Entity neighbors | `GET /api/graph/neighbors/:nodeId?depth=2` | On entity select |
| Full entity context | `GET /api/brain/context/:entityId` | `/entity/:id` page |
| Graph traversal | `GET /api/graph/khop?nodeId=X&hops=2` | For graph visualization |

**Implementation note:** These endpoints exist in `src/routes/` (from Phase 11.1). `KnowledgeExplorer.jsx` currently does NOT call them — this is the primary bug to fix.

---

## Entity Types and Icons

| Type | Icon | Color dot |
|---|---|---|
| `PERSON` / `USER` | Person silhouette | `var(--accent)` |
| `REPOSITORY` | Code brackets | `var(--t2)` |
| `SERVICE` | Server | `var(--status-healthy)` |
| `PROJECT` | Folder | `var(--t2)` |
| `CUSTOMER` | Building | `var(--t2)` |
| `DEPLOYMENT` | Deploy arrow | `var(--status-warning)` |
| `INCIDENT` | Warning | `var(--status-critical)` |
| `DOCUMENT` | Page | `var(--t3)` |
| `PULL_REQUEST` | Git branch | `var(--t2)` |
| `MEETING` | Calendar | `var(--t2)` |
| `JIRA_ISSUE` | Ticket | `var(--t2)` |

---

## Entity Card Row Layout

```
[type icon] [entity name]                    [type chip]  [edge count]
            [connector · last seen: Xh ago]              [N connections]
```

- Row height: 60px
- Hover: `var(--hover-bg)`, 80ms
- Selected: `var(--surface-1)`, left border 2px `var(--accent)`
- Click: loads entity detail in the right GraphPanel and calls `GET /api/graph/neighbors/:nodeId`

---

## Entity Search

Global search bar in PageHeader:
- `⌘F` focuses the search input
- Debounced 300ms: calls `GET /api/graph/search?q={input}&workspaceId={ws}`
- Results replace the EntityStream list while the query is active
- Clear button (`×`) resets to the full list
- Results ranked by `last_observed_at` DESC then node type relevance
- "No results for '{query}'" state with `[Ask FLOW about {query}]` chip

---

## Type Filters

Tab-style filter chips below the search bar:

```
[All]  [People]  [Repos]  [Services]  [Projects]  [Customers]  [Incidents]  [More ▾]
```

- `[More ▾]` dropdown contains remaining types with counts
- Filter calls `GET /api/graph/search?type={type}&workspaceId={ws}`
- Filter state preserved in URL: `/knowledge?type=PERSON`

---

## Graph Panel (Right Column)

Force-directed SVG visualization:
- Nodes: circles, colored by type (match icon colors above)
- Edges: thin lines, opacity `var(--t3)`
- Selected node: larger radius, `var(--accent)` ring
- Connected nodes: highlighted, non-connected nodes dimmed to 20% opacity
- Zoom: scroll wheel
- Pan: drag on empty canvas
- Click node: selects entity, loads detail in right panel
- Double-click node: navigates to `/entity/:id`

**Graph is only rendered** when an entity is selected (neighbors are loaded). Before selection: placeholder text `"Select an entity to explore its connections."` centered in the panel.

**Performance cap:** Maximum 100 nodes rendered in the graph at once. If `kHop` returns > 100 nodes, show the closest 100 by relationship score. Banner: `"Showing top 100 connections."`

---

## Entity Workspace (`/entity/:id`)

Full-width single-entity deep-dive page.

```
┌──────────────────────────────────────────────────────────────────┐
│ ← Knowledge    [entity type chip]  [entity name]                 │
│                [connector] · [last seen: Xh ago]                 │
│                [N connections] · [N degrees of separation: avg]  │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  2-column:                                                       │
│  ┌────────────────────────────────┐  ┌────────────────────────┐ │
│  │ ENTITY CONTEXT                 │  │ GRAPH VISUALIZATION    │ │
│  │ AI brief on this entity        │  │ (force-directed,       │ │
│  │ from /api/brain/context/:id    │  │  centered on entity)   │ │
│  │                                │  │                        │ │
│  │ RELATIONSHIPS (by type)        │  │                        │ │
│  │ Authored by:  [list]           │  └────────────────────────┘ │
│  │ Reviewed by:  [list]           │                             │
│  │ Deployed to:  [list]           │                             │
│  │ Reported by:  [list]           │                             │
│  │                                │                             │
│  │ RECENT ACTIVITY (timeline)     │                             │
│  │ [last 10 events involving this │                             │
│  │  entity from flow_events]      │                             │
│  │                                │                             │
│  │ [Ask FLOW about {entity name}] │                             │
│  └────────────────────────────────┘                             │
└──────────────────────────────────────────────────────────────────┘
```

**AI Context brief:** `GET /api/brain/context/:entityId` → renders as bullet list. Falls back to `"Analyzing {entity name}... No context available yet."` if insufficient data.

---

## AI Behavior

### Command Center on /knowledge
```
SUGGESTED:
  "Who has the most context about the pgvector migration?"
  "Show me everything connected to Release 2.5"
  "Who works with Rahul most closely?"
  "What services depend on the auth module?"
```

### Command Center on /entity/:id
```
ACTIVE CONTEXT: [entity name] — [type]
SUGGESTED:
  "What's the impact of removing this dependency?"
  "Who else knows about this?"
  "Show me the history of this {entity type}"
  "What would happen if {entity name} left?"
```

The last suggestion routes to the Simulation Engine (`POST /api/simulation/run` with `type: EMPLOYEE_DEPARTURE` or `SERVICE_OUTAGE` depending on entity type).

---

## Loading State

EntityStream:
```
5 × entity row skeletons (60px each)
[circle icon skeleton] [████████████] [██] [███]
```

Graph panel: `"Loading connections..."` centered text.

---

## Empty State

**No entities in graph (new workspace):**
```
[Graph icon, 40px, var(--t4)]
Your knowledge graph is empty.
Connect sources and sync to build your company's Digital Twin.

[Go to Trust Center →]  [Sync now →]
```

**Search returns no results:**
```
No entities match "{query}".
[Clear search]  [Ask FLOW about "{query}"]
```

**Entity has no connections:**
```
[entity name] has no recorded connections yet.
Connections are built automatically as FLOW processes activity.
```

---

## Error State

- Graph API failure: `"Unable to load knowledge graph. [Retry]"` with last-known entity list still rendered
- Entity not found (`404`): `"Entity not found. It may have been removed or renamed."` with `[← Back to Knowledge]`

---

## Keyboard Shortcuts

| Key | Action |
|---|---|
| `⌘F` | Focus search input |
| `↓` / `↑` | Navigate entity list |
| `Enter` | Select entity, load graph |
| `⌘Enter` | Open `/entity/:id` for selected entity |
| `Escape` | Clear selection; clear search |
| `+` / `-` | Zoom in/out graph panel |
| `0` | Reset graph zoom to fit |

---

## Accessibility

- `<main>` for content
- EntityStream: `role="list"`, each row `role="listitem"`, `aria-selected`
- Graph SVG: `role="img"`, `aria-label="Knowledge graph showing {N} nodes and {N} edges"`. Nodes keyboard-navigable as `role="button"` within SVG.
- Filter tabs: `role="tablist"`, `aria-selected`
- Search: `role="search"`, `aria-label="Search entities"`, `aria-live="polite"` on result count

---

## Responsive Behavior

| Viewport | Behavior |
|---|---|
| ≥1280px | EntityStream (left) + GraphPanel (right) side by side |
| 1024px–1279px | Same; graph panel narrows to 340px |
| 768px–1023px (tablet) | Single column: EntityStream full-width; graph panel below |

---

## Telemetry Events

| Event | Trigger | Properties |
|---|---|---|
| `knowledge.viewed` | Page mount | `{ nodeCount, edgeCount }` |
| `knowledge.entity.selected` | Entity row clicked | `{ nodeId, type, connectionCount }` |
| `knowledge.entity.workspace.viewed` | `/entity/:id` mount | `{ nodeId, type }` |
| `knowledge.search.performed` | Search debounce | `{ query, resultCount }` |
| `knowledge.filter.changed` | Type filter clicked | `{ type, resultCount }` |
| `knowledge.graph.zoomed` | Graph zoom | `{ direction }` |
| `knowledge.simulation.triggered` | Simulation chip clicked | `{ entityId, scenarioType }` |

---

## Acceptance Criteria

- [ ] `KnowledgeExplorer.jsx` calls `/api/graph/search` and `/api/graph/neighbors`, not hardcoded demo data.
- [ ] Entity list renders with correct type icons, connection counts, and last-seen timestamps.
- [ ] Search is debounced 300ms; results update without page reload.
- [ ] Type filter tabs filter the entity list and update URL query param.
- [ ] Graph panel renders force-directed SVG when an entity is selected.
- [ ] Graph caps at 100 nodes with a banner if exceeded.
- [ ] Clicking a graph node selects the entity and loads its neighbors.
- [ ] Double-clicking a graph node navigates to `/entity/:id`.
- [ ] `/entity/:id` renders AI context brief, relationships grouped by type, and recent activity.
- [ ] Empty state (no graph) links to Trust Center and sync.
- [ ] All keyboard shortcuts work including `+`/`-`/`0` for graph zoom.
- [ ] All telemetry events fire at correct triggers.
