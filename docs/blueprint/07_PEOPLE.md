# Blueprint: People — `/people`
**Document:** BP-07  
**Last updated:** 2026-07-18  
**Status:** Authoritative

---

## Purpose

Answer one question: **"Who is doing what, and who is at risk?"**

People surfaces workforce intelligence — workload, attrition risk, knowledge concentration (bus factor), collaboration patterns, and team health signals. Its primary action is identifying and acting on a team health risk.

---

## Target User

**Primary:** CTO, VP Engineering, HR Lead  
**Secondary:** Engineering Manager  
**Frequency:** Weekly; daily during performance reviews or headcount changes

---

## Entry Points

| Source | How |
|---|---|
| Sidebar | "People" item (INTELLIGENCE group, position 3) |
| `⌘K` → "Go to People" | CommandPalette |
| FLOW Brain | `"Who owns X?"`, `"Who is overloaded?"` → surfaces People link |
| Simulation result | Employee departure simulation → `/people` |
| Direct URL | `/people` |

---

## Layout Hierarchy

```
┌─────────────────────────────────────────────────────────────────┐
│ Sidebar (220px)                                                 │
├──────────────────────────────────────────────┬──────────────────┤
│                                              │                  │
│  PageHeader: People  [search]  [filter ▾]   │  LiveFeed        │
│  ──────────────────────────────────────────  │  (260px)         │
│  ExecutiveHero                               │                  │
│  "2 engineers overloaded · 1 attrition risk" │                  │
│  [View attrition risk]                       │                  │
│  ──────────────────────────────────────────  │                  │
│  2-column cards grid:                        │                  │
│  ┌──────────────────┐  ┌──────────────────┐  │                  │
│  │  WorkloadPanel   │  │  KnowledgeRisk   │  │                  │
│  │  (by team/person)│  │  (bus factor)    │  │                  │
│  └──────────────────┘  └──────────────────┘  │                  │
│  ──────────────────────────────────────────  │                  │
│  CollaborationInsights (collapsed)           │                  │
│  ──────────────────────────────────────────  │                  │
│  PeopleList (searchable, all members)        │                  │
│                                              │                  │
│  [StickyCommandCenter]                       │                  │
└──────────────────────────────────────────────┴──────────────────┘
```

---

## Information Hierarchy

```
Level 1  ExecutiveHero — team health in one sentence
Level 2  WorkloadPanel — overloaded / underloaded signals
Level 3  KnowledgeRisk — bus factor, single points of failure
Level 4  CollaborationInsights — who works with whom (collapsed)
Level 5  PeopleList — all members with metadata
Level 6  StickyCommandCenter
```

---

## Components

| Component | File | Notes |
|---|---|---|
| Page orchestrator | `components/platform/WorkforceIntelligence.jsx` (rename target) | Currently shows demo data |
| `PersonCard` | Inline | Compact person row |
| `PersonDetailPanel` | Right-side panel | Person context on click |
| `WorkloadBar` | Inline | Visual workload indicator |
| `BusFactorBadge` | Inline | Shows `Bus factor: 1` warning |
| `ExecutiveHero` | `components/decisions/ExecutiveHero.jsx` | |
| `SkeletonCard` | variant `row` | Loading |

---

## Data Sources

| Data | Source | Notes |
|---|---|---|
| Team members | `GET /api/graph/search?type=PERSON&workspaceId={ws}` | From knowledge graph |
| Predictions | `GET /api/predictions/run?domain=people` | People domain predictions |
| Workload | Derived from graph edges (`AUTHORED_BY`, `REVIEWING`, `ASSIGNED_TO`) | |
| Collaboration | `GET /api/graph/relationship-score?workspaceId={ws}` | Top collaborator pairs |
| Activity | `GET /api/events/feed?type=PERSON&workspaceId={ws}` | Recent person events |

**Demo fallback:** When HR connector (Workday/BambooHR) is not connected, people data comes from the knowledge graph (built from GitHub, Jira, Slack activity). Label: `"Showing activity-derived people data — connect HR system for full profiles."`

---

## Workload Panel

```
WORKLOAD SIGNALS
─────────────────────────────────────────────────────────────────
[avatar] Rahul Kumar        [████████████████████] Overloaded
         CTO · 5 open PRs · 3 approval requests

[avatar] Alice Chen         [████████████░░░░░░░░] Normal
         Senior Engineer · 2 open PRs

[avatar] Marcus Wong        [██████░░░░░░░░░░░░░░] Light
         Engineer · 1 open PR

[See all →]
```

Workload bar color:
- Overloaded (>80% full): `var(--status-critical)`
- High (60–80%): `var(--status-warning)`
- Normal (30–60%): `var(--status-healthy)`
- Light (<30%): `var(--t4)`

Workload score derived from: open PRs authored + assigned Jira issues + pending review requests.

---

## Knowledge Risk Panel

```
BUS FACTOR RISKS
─────────────────────────────────────────────────────────────────
auth-service      Bus factor: 1    Only Rahul has contributed
                  [What if Rahul leaves?]  → Simulation

payments-flow     Bus factor: 2    Alice + Marcus
                  [Explore →]
```

- `[What if Rahul leaves?]` → routes to simulation: `POST /api/simulation/run` with `{type: 'EMPLOYEE_DEPARTURE', targetEntityId: 'person:rahul', params: {}}`
- Result opens in a modal (SimulationResult panel)
- `[Explore →]` → `/entity/{nodeId}` for the service

---

## Collaboration Insights (Collapsed)

```
COLLABORATION PATTERNS
[+] Expand to see team collaboration
```

On expand:
```
TOP COLLABORATOR PAIRS
Rahul ↔ Alice    Relationship strength: 0.84 · 24 shared PRs
Alice ↔ Marcus   Relationship strength: 0.71 · 12 shared PRs

ISOLATED MEMBERS
Jordan Lee — 0 collaboration events in 30 days
[Ask FLOW about Jordan →]
```

---

## People List

Full searchable list of all workspace members/contributors:

```
[Search people... ⌘F]  [Department ▾]  [Team ▾]

[avatar] Rahul Kumar    CTO · Engineering
         Last active: 2h ago · 12 PRs this month

[avatar] Alice Chen     Senior Engineer · Backend
         Last active: 4h ago · 8 PRs this month

[avatar] Marcus Wong    Engineer · Backend
         Last active: 1d ago · 5 PRs this month
```

Click on a person row → opens PersonDetailPanel (right slide-over):

```
[×]  Rahul Kumar
     CTO · Engineering
─────────────────────────────
ACTIVITY (last 30 days)
  12 PRs authored · 4 merged
  8 code reviews · 3 Jira issues
─────────────────────────────
KNOWLEDGE CONCENTRATION
  auth-service · payments (2 repos)
  Bus factor: 1 for auth-service
─────────────────────────────
COLLABORATION
  Most works with: Alice, Marcus
─────────────────────────────
AI CONTEXT
  [1–2 sentence FLOW summary]
─────────────────────────────
[Run departure simulation]  [Ask FLOW about Rahul]
```

---

## AI Behavior

### Predictions
People domain predictions from `GET /api/predictions/run?domain=people`:
- `KNOWLEDGE_LOSS` — bus factor risk
- `TEAM_BURNOUT` — workload signals
- `ATTRITION_RISK` — engagement patterns
- `HIRING_NEED` — velocity vs capacity gap

These drive the ExecutiveHero text and card prominence.

### Command Center suggestions
```
SUGGESTED:
  "Who is most overloaded right now?"
  "What happens if Alice leaves?"
  "Who has context on the payments service?"
  "What's the bus factor for our core services?"
```

### Simulation via Command Center
`"What if Rahul resigns?"` → routed to `POST /api/simulation/run` → result rendered in StickyCommandCenter as inline response with a `[View full simulation →]` link to `/simulation-workspace`.

---

## Demo State (No HR Connector)

The page works from knowledge graph data (GitHub/Jira/Slack activity):

```
Banner:
"Showing activity-derived people data — connect Workday or BambooHR for full HR profiles."
[Connect HR system →]  → `/integrations`
```

Note: the data is real (from the graph), not fake. Only the HR-specific fields (salary, tenure, role level) are absent.

---

## Loading State

```
[Hero skeleton]
[2-column: WorkloadPanel skeleton (4 rows) + KnowledgeRisk skeleton (2 rows)]
[People list: 5 row skeletons]
```

---

## Empty State

**No people data at all:**
```
[People icon]
No workforce data available.
Connect GitHub or Jira to build your team intelligence.
[Go to Trust Center →]
```

**Search returns no results:**
```
No people match "{query}".
[Clear search]
```

---

## Error State

- Predictions API failure: WorkloadPanel shows `"Workload data unavailable."` — rest of page renders
- Graph API failure: `"Unable to load team data. [Retry]"` — full page fallback

---

## Keyboard Shortcuts

| Key | Action |
|---|---|
| `⌘F` | Focus search input |
| `↓` / `↑` | Navigate people list |
| `Enter` | Open PersonDetailPanel for focused person |
| `S` | Run departure simulation for focused person |
| `Escape` | Close PersonDetailPanel |
| `⌘/` | Focus StickyCommandCenter |

---

## Accessibility

- Person rows: `role="listitem"`, `aria-label="{name}, {role}"`
- Workload bar: `role="meter"`, `aria-valuenow`, `aria-valuemin="0"`, `aria-valuemax="100"`, `aria-label="{name} workload"`
- Bus factor badge: `aria-label="Bus factor: 1 — single point of failure"`
- PersonDetailPanel: `role="dialog"`, `aria-modal="true"`, focus trap

---

## Responsive Behavior

| Viewport | Behavior |
|---|---|
| ≥1280px | 2-column panels + LiveFeed |
| 1024px–1279px | 2-column panels, no LiveFeed |
| 768px–1023px (tablet) | Single column; panels stack |

---

## Telemetry Events

| Event | Trigger | Properties |
|---|---|---|
| `people.viewed` | Page mount | `{ memberCount, overloadedCount, busFactorRiskCount }` |
| `people.person.selected` | Person row click | `{ personId, workload }` |
| `people.simulation.triggered` | Departure simulation clicked | `{ personId }` |
| `people.search.performed` | Search | `{ query, resultCount }` |
| `people.hr.connect_clicked` | HR connect banner | `{}` |

---

## Acceptance Criteria

- [ ] Workload panel derives data from knowledge graph (GitHub PRs + Jira issues) when no HR connector.
- [ ] Knowledge risk panel shows bus factor for all repos with factor ≤ 2.
- [ ] `[What if X leaves?]` triggers simulation and displays result.
- [ ] PersonDetailPanel shows activity, knowledge concentration, collaboration, and AI context.
- [ ] People list is searchable; results update without page reload.
- [ ] Demo banner shows when HR connector not connected; real data still renders from graph.
- [ ] All keyboard shortcuts work.
- [ ] All telemetry events fire.
