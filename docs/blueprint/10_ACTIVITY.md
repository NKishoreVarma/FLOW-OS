# Blueprint: Activity — `/activity`
**Document:** BP-10  
**Last updated:** 2026-07-18  
**Status:** Authoritative

---

## Purpose

Answer one question: **"What happened in my company, and when?"**

Activity is FLOW's DVR — a chronological, filterable view of all events across every connected system. It supports two modes: live feed (recent events) and replay (historical playback with diff). The primary action is navigating to the entity or action referenced by an event.

---

## Target User

**Primary:** CTO, VP Engineering  
**Secondary:** Engineering Manager, Head of Operations  
**Frequency:** When diagnosing an incident; when reviewing a period's activity; daily standup prep

---

## Entry Points

| Source | How |
|---|---|
| Sidebar | Platform group → "Activity" (when enabled) |
| `⌘K` → "Go to Activity" | CommandPalette |
| Incident card | `[View timeline]` links to Activity with incident filter |
| Simulation result | `[View contributing events →]` |
| Direct URL | `/activity` |

---

## Layout Hierarchy

```
┌─────────────────────────────────────────────────────────────────┐
│ Sidebar (220px)                                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  PageHeader: Activity                                           │
│                                                                 │
│  FilterBar (sticky, 52px)                                       │
│  [All] [Engineering] [Operations] [People] [Customers]          │
│  [connector ▾] [person ▾] [date range ▾]   [Replay mode]       │
│  ─────────────────────────────────────────────────────────      │
│                                                                 │
│  [LIVE MODE]                    OR    [REPLAY MODE]             │
│  EventTimeline (scrollable)           ReplayPlayer (controls)   │
│  │                                    [← ▶ →  ◉ 1x]            │
│  │ Today                                                        │
│  ├─ [event] 2h ago   Deploy to prod                             │
│  ├─ [event] 3h ago   PR #445 merged                             │
│  ├─ [event] 4h ago   Incident detected                          │
│  │                                                              │
│  │ Yesterday                                                    │
│  ├─ [event] 25h ago  EBR with Acme                              │
│  └─ ...                                                         │
│                                                                 │
│  [StickyCommandCenter]                                          │
└─────────────────────────────────────────────────────────────────┘
```

---

## Information Hierarchy

```
Level 1  FilterBar — scope the view by domain/connector/person/date
Level 2  Mode toggle — Live vs Replay
Level 3  EventTimeline / ReplayPlayer — events grouped by day
Level 4  EventCard — single event with entity links
Level 5  EventDetailPanel — full context for a selected event
Level 6  StickyCommandCenter
```

---

## Components

| Component | File | Notes |
|---|---|---|
| `ActivityPage` | `components/platform/ActivityPage.jsx` (new) | Page orchestrator |
| `EventCard` | Inline | Single normalized FLOW event |
| `EventDetailPanel` | Right slide-over | Full event detail |
| `ReplayControls` | Inline | Play/pause/step/speed controls (Replay mode) |
| `SkeletonCard` | variant `timeline-row` | Loading |

---

## Data Sources

| Data | Source | Notes |
|---|---|---|
| Live event feed | `GET /api/events/feed?workspaceId={ws}&limit=100` | Most recent 100, descending |
| Filtered feed | `GET /api/events/feed?type={type}&connector={c}&workspaceId={ws}` | Filter params |
| Replay mode | `GET /api/replay/replay?mode={mode}&workspaceId={ws}&startTime={t}&endTime={t}` | 7-day default |
| Snapshot compare | `POST /api/replay/compare?workspaceId={ws}` with `{ t1, t2 }` | Before/after diff |
| Single event | `GET /api/events/{eventId}?workspaceId={ws}` | On event click |

WebSocket: `FLOW_EVENT_PUBLISHED` updates the live feed in real time. New events prepend to the timeline with a subtle slide-in animation (120ms ease-out).

---

## Live Mode — EventTimeline

Events grouped by day label (`Today`, `Yesterday`, `[Date]`):

```
TODAY

[Engineering] PR #445 merged           MERGE_REQUEST
[avatar] Alice Chen · main ← feature/ui-cleanup · 2h ago
[2 files changed · +340 −180]    [View PR →]

[Engineering] Deployment to production    DEPLOYMENT
Flow OS Backend · 3h ago · Risk score: LOW
[View deployment →]

[Operations] Incident resolved            INCIDENT
Database latency — 4h ago · Duration: 22m
[View incident →]

YESTERDAY

[Engineering] PR #443 opened             PULL_REQUEST
[avatar] Marcus Wong · feature/rate-limiting · 1d ago
[View PR →]
```

Each event card:
- Connector badge (Engineering/Operations/People/Customers/Knowledge)
- Event type chip (`PULL_REQUEST`, `DEPLOYMENT`, `INCIDENT`, etc.)
- Human-readable summary (derived from event `type` + `metadata`)
- Entity pills (linked: `[PR #445]`, `[auth-service]`)
- Actor avatar + name
- Relative timestamp (`2h ago`) — full ISO on hover
- Primary action link (`[View PR →]`, `[View incident →]`)

---

## Filter Bar

```
[All] [Engineering] [Operations] [People] [Customers] [Knowledge]
[connector ▾] [person ▾] [Jul 11 – Jul 18 ▾]          [⊙ Replay]
```

- Domain filters are tab-style chips; multi-select
- `[connector ▾]` dropdown: lists connected connectors (github / gmail / jira / slack / notion / etc.)
- `[person ▾]` dropdown: lists workspace members from graph
- Date range picker: calendar-based; presets (`Today`, `This week`, `Last 30 days`, `Custom`)
- All filter state lives in URL: `/activity?type=ENGINEERING&connector=github&from=2026-07-11&to=2026-07-18`
- `[⊙ Replay]` toggle switches to Replay mode

---

## Replay Mode

When Replay mode is activated, the timeline shifts to a historical playback view:

```
REPLAY MODE

[Date range: Jul 11 – Jul 18 ▾]    [Mode: Engineering ▾]    [× Exit]
─────────────────────────────────────────────────────────────────────

ReplayBar (fixed, bottom of content area)
|══════════════════════════════════════════════════════|  Progress
  [◄◄]  [◄]  [▶ Play]  [►]  [▶▶]    ●1x  ●2x  ●5x     Speed
  Frame: 347 / 1,892 events          Jul 14 at 09:42am  Timestamp

─────────────────────────────────────────────────────────────────────

EventTimeline (driven by player cursor)
Events rendered up to the cursor timestamp.
New events appear as the cursor advances.
```

ReplayPlayer controls:
- `◄◄` — jump to start
- `◄` — step backward one event
- `▶ Play` / `⏸ Pause` — auto-advance at selected speed
- `►` — step forward one event
- `▶▶` — jump to end
- Speed: 1×, 2×, 5× — controls auto-advance interval (200ms / 100ms / 40ms per event)

**Marker system:** Significant events (incidents, deployments, releases) appear as markers on the progress bar. Clicking a marker jumps the player to that event.

---

## Snapshot Compare (Diff Mode)

Accessible from date range picker → `[Compare two points in time]`:

```
SNAPSHOT COMPARE
Before: Jul 11 8:00am    After: Jul 18 8:00am

ADDED THIS WEEK (47 items)
  + 8 pull requests merged
  + 12 Jira issues resolved
  + 1 deployment

CHANGED
  ~ auth-service — 3 incidents resolved
  ~ Acme Corp — health improved: ●●○○○ → ●●●●○

REMOVED
  - Feature flag: enable-new-login-flow (deprecated)
```

Data: `POST /api/replay/compare`.

---

## Event Detail Panel

Click any event card → EventDetailPanel slides in from the right (320px):

```
[×]  PR #445 Merged                           MERGE_REQUEST
     Jul 18 at 2:14pm
─────────────────────────────────────────────
ACTOR:    Alice Chen
REPO:     flow-os-backend
BRANCH:   feature/ui-cleanup → main
CHANGES:  +340 −180 · 2 files

CONNECTED ENTITIES
  → [Jira FLOW-201] — "Cleanup dashboard styles"
  → [Deploy #112]  — "Triggered: 2h ago"
  → [Alice Chen]   — "Graph: 12 PRs this month"

─────────────────────────────────────────────
[Open in GitHub →]  [View graph context →]  [Ask FLOW about this]
```

---

## AI Behavior

### Live feed filtering
Command Center on this page:
```
SUGGESTED:
  "What happened in the last 24 hours?"
  "Show me all deployments this week"
  "What caused the incident on Tuesday?"
  "Who's been most active in engineering?"
```

### Incident correlation
When filtering to `INCIDENT` type, FLOW automatically shows correlated events (deploy + incident + resolution) in a causal chain:
```
[DEPLOY → INCIDENT → RESOLUTION] causal chain highlighted
```

Correlation: via `correlationId` on related `flow_events` rows.

### Command Center suggestions (context-aware)
When an event is selected:
```
ACTIVE CONTEXT: PR #445 — Alice Chen — auth-service
SUGGESTED:
  "What's the impact of this PR?"
  "What was deployed as a result?"
  "Has Alice had other incidents this week?"
```

---

## Loading State

```
[FilterBar: visible immediately]
[EventTimeline: 5 skeleton rows]
[Row skeleton: 60px, shimmer]
```

Data loads within 500ms (cached recent events). If >3s: show what's loaded so far, append as more arrives.

---

## Empty State

**No events for current filter:**
```
[Calendar icon, 40px, var(--t4)]
No events match this filter.
Try a wider date range or fewer filters.
[Clear filters]
```

**No events at all (new workspace):**
```
[Activity icon, 40px, var(--t4)]
No activity yet.
FLOW starts recording events as soon as you connect sources.
[Go to Trust Center →]
```

---

## Error State

- Feed API failure: `"Activity feed unavailable. [Retry]"` — page renders with last cached events
- Replay API failure: `"Replay data unavailable. Try a shorter date range. [Retry]"`

---

## Keyboard Shortcuts

| Key | Action |
|---|---|
| `F` | Toggle filter bar focus |
| `R` | Toggle Replay mode |
| `↓` / `↑` | Navigate events |
| `Enter` | Open EventDetailPanel |
| `Escape` | Close EventDetailPanel |
| `Space` | Play/pause in Replay mode |
| `← / →` | Step backward/forward in Replay mode |
| `1` / `2` / `5` | Set replay speed (1×/2×/5×) |
| `⌘/` | Focus StickyCommandCenter |

---

## Accessibility

- `<main>` with `aria-label="Activity Timeline"`
- Timeline groups: `<section aria-label="Today">`, `<section aria-label="Yesterday">`
- Event cards: `role="article"`, `aria-label="{type}: {summary}"`
- FilterBar chips: `role="tab"`, `aria-selected`
- Replay controls: `role="toolbar"`, standard `aria-label` on each button
- Progress bar: `role="slider"`, `aria-valuenow`, `aria-valuemin`, `aria-valuemax`
- New events arriving live: `aria-live="polite"` on the timeline container

---

## Responsive Behavior

| Viewport | Behavior |
|---|---|
| ≥1280px | Full timeline + EventDetailPanel slide-over |
| 1024px–1279px | Same; panel overlays (80% width) |
| 768px–1023px (tablet) | Single column; EventDetailPanel full-screen |

---

## Telemetry Events

| Event | Trigger | Properties |
|---|---|---|
| `activity.viewed` | Page mount | `{ eventCount, mode: 'live' }` |
| `activity.filter.changed` | Filter changed | `{ filter, value }` |
| `activity.event.selected` | Event click | `{ eventId, type }` |
| `activity.replay.started` | Replay toggled on | `{ dateRange }` |
| `activity.replay.played` | Play button clicked | `{ speed }` |
| `activity.compare.opened` | Snapshot compare | `{ t1, t2 }` |

---

## Acceptance Criteria

- [ ] Live feed shows events in descending order, grouped by day.
- [ ] FilterBar updates timeline without page reload; filter state in URL.
- [ ] New events prepend to timeline via WebSocket `FLOW_EVENT_PUBLISHED`.
- [ ] Replay mode shows playback controls; events reveal as player advances.
- [ ] Replay speed 1×/2×/5× changes auto-advance interval.
- [ ] Markers on replay progress bar jump to significant events.
- [ ] Snapshot compare shows added/changed/removed diff.
- [ ] EventDetailPanel shows connected entities and action links.
- [ ] All keyboard shortcuts work including Replay controls.
- [ ] All telemetry events fire.
