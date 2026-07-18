# Workspace Replay Engine — Phase 11.3

> A DVR for company operations. Don't just view events — **replay** them. See
> exactly how decisions, incidents, deployments, and customer events unfolded over
> time, scrub through history, snapshot any moment, and diff Monday against Friday.

---

## 1. What it is

`src/replay/` is a **read-only DVR** over the Unified Event Platform (Phase 11.0).
It reads only from the durable `flow_events` store (via `queryEvents` / `search`)
and computes snapshots on the fly — **no duplicate storage, ever**.

```
 Unified Event Platform (flow_events)            Replay Engine (src/replay)
 ┌──────────────────────────────┐   queryEvents  ┌──────────────────────────────┐
 │ every FLOW event, durably     │ ─────────────▶ │ ReplayFilters  scope → filter │
 │ stored, tenant-scoped         │                │ ReplayBuilder  ordered stream │
 └──────────────────────────────┘                │ ReplayTimeline frames         │
                                                  │ ReplaySnapshots state as-of-T │
                                                  │ ReplayDiffEngine before/after │
                                                  │ ReplayNavigator markers/seek  │
                                                  │ ReplayPlayer   playback logic │
                                                  │ ReplayMetrics  velocity/MTTR  │
                                                  │ ReplayExport   JSON / narrative│
                                                  │ ReplayEngine   orchestrator   │
                                                  └──────────────────────────────┘
```

It answers: *What happened yesterday? How did this incident evolve? Who was
involved? Which meetings preceded this decision? Which PR introduced the bug? How
did Acme become a churn risk? How did engineering recover? What changed between
Monday and Friday?*

---

## 2. Replay dimensions

Replay by any scope, resolved by `ReplayFilters`:

| Dimension | How it maps |
|-----------|-------------|
| Time | `from`/`to` or `range` (`day`/`week`/`month`/`30d`/`quarter`) |
| Employee | `actorId` (native index on `actor->>'id'`) |
| Connector | `connector` |
| Event type | `eventType` / `eventTypes[]` |
| Incident | `correlationId` (the incident's chain) |
| Customer / Project / Repository / Meeting / Deployment | full-text focus over title/summary (event store search) |
| Workspace | no filter — the whole history |

## 3. Replay modes

Presets in `ReplayEngine.MODES` combine filters + bucket + focus:

| Mode | What it shows |
|------|---------------|
| `TIMELINE` | Everything, chronologically |
| `INCIDENT` | How an incident evolved (correlation/causation chain) + MTTR |
| `CUSTOMER_JOURNEY` | Every event touching a customer ("how Acme became churn risk") |
| `ENGINEERING` | PRs, commits, deployments |
| `MEETING` | Meetings and the decisions around them |
| `EXECUTIVE` | High-impact events only (importance ≥ 0.6) |
| `KNOWLEDGE` | How knowledge/docs evolved |

---

## 4. Snapshots & diff

A **snapshot** is workspace state reconstructed *as-of-T* by folding events up to
that instant — computed with SQL aggregates over `flow_events`, never persisted.
It captures totals by type/connector/priority, incidents (opened/resolved/open/
critical), deployments, meetings, active contributors, and the customer/incident
entity sets present by T.

> The Operational Graph is deliberately **not** the snapshot source — it holds
> only current `last_observed_at` and cannot represent Monday's state. The event
> log can, exactly.

`ReplayDiffEngine.diffSnapshots(before, after)` classifies the change:
**added** (new events/incidents/deployments/customers), **removed** (n/a — events
are append-only; see resolved), **changed** (per-type deltas), **resolved**
(incidents closed in the window), **escalated** (new critical incidents). Powers
"Monday vs Friday", "before/after incident", "before/after deployment".

---

## 5. Player (stateless, windowed)

The server holds no session. `ReplayPlayer` provides pure playback logic the
client drives:

- `frameAt(timeline, index)` / `cursorView(timeline, position)` — what to show.
- `playbackPlan(timeline, { speed })` — a speed-compressed frame sequence (at
  `speed: 3600`, a day of history plays in ~24 seconds).
- `ReplayNavigator` — jump markers (incidents, deployments, decisions, critical/
  high-importance events), `seek(timeline, ts)`, `step(timeline, i, ±1)`.

Pause/resume are client concerns (stop/continue consuming the plan). Step and jump
are re-queries of a window — nothing to keep warm server-side.

---

## 6. Metrics & export

`ReplayMetrics.computeMetrics(events)` (over already-fetched events, no extra
queries): event **velocity** over time, **peak period**, **top actors**, per-type/
connector counts, **incident MTTR** (paired open→resolved by correlation id), and
**deployment frequency**.

`ReplayExport.exportReplay(replay, 'json'|'markdown')` — full JSON, or a readable
narrative ("**[date]** — N events: 🔴 alice: Payments API returning 500s …").

---

## 7. Module map (`src/replay/`)

| Module | Responsibility |
|--------|----------------|
| `ReplayFilters.js` | Scope → event-store query filter |
| `ReplayBuilder.js` | Ordered event stream (paginated; multi-type merge; text focus) |
| `ReplayTimeline.js` | Bucket into scrubbable frames (hour/day/week) |
| `ReplaySnapshots.js` | State as-of-T via SQL aggregates |
| `ReplayDiffEngine.js` | added/removed/changed/resolved/escalated |
| `ReplayNavigator.js` | Markers, seek, step |
| `ReplayPlayer.js` | Stateless playback logic |
| `ReplayMetrics.js` | Velocity, MTTR, deploy frequency, top actors |
| `ReplayExport.js` | JSON / Markdown narrative |
| `ReplayEngine.js` | Orchestrator + 7 modes + snapshotCompare + narrative |

---

## 8. Performance

`node scripts/validate-replay-engine.js` — 100,000 events across 30 days + curated
incident/customer/engineering lifecycles. All 12 checks pass.

| Operation | Scale | Time |
|-----------|-------|------|
| Full 30-day replay (fetch + timeline + nav + metrics) | 100,000 events | **~2.1 s** |
| Snapshot as-of-T (SQL aggregate) | 100,009 events | **~120 ms** |
| Monday-vs-Friday snapshot diff | 100k baseline | **~147 ms** |
| Incident evolution (correlation chain) | 3-event chain | <30 ms |

Snapshots and diffs stay in the low hundreds of ms **regardless of history size**
because they are SQL aggregates, not row pulls. A full replay pulls the whole
window (paginated at 1000/query); in practice the Player windows the range rather
than loading everything at once.

---

## 9. Scaling strategy

- Reads ride the event platform's existing indexes (`workspace_id, ts`;
  `event_type`; `connector`; `correlation_id`).
- Snapshots and diffs are aggregate queries — flat cost as history grows.
- Full-range pulls paginate at 1000 rows/query; the Player should request only the
  visible window + adjacent frames, so the 2.1s "load everything" number is a
  worst case, not the interactive path.
- Future: optional Redis memo-cache of recent snapshots keyed by
  `(workspace, bucketedT)`; pre-bucketed frame density for very long ranges.

---

## 10. Integration invariant

The Replay Engine consumes **only** the Unified Event Platform and never writes.
It is distinct from the platform's own `EventReplay` (which *re-delivers* events to
subscribers for reprocessing) — this engine is a read-only DVR for humans.

---

## 11. REST API & Player (Milestone 2)

`/api/replay` (JWT + workspace-id):

```
GET  /api/replay/modes        → the 7 replay modes
POST /api/replay              { mode, scope, bucket }   → run a replay
POST /api/replay/snapshot     { at }                    → state as-of-T
POST /api/replay/compare      { t1, t2 }                → before/after diff
POST /api/replay/export       { mode, scope, format }   → json | markdown narrative
```

**Replay Player** — admin DVR UI at `/replay-player` (dev-only 404 in production,
OWNER/ADMIN JWT + workspace-id). A self-contained timeline scrubber: a density
track (bars per frame, incident/deployment markers highlighted), **play / pause /
step / jump-to-marker / speed** controls, mode + range + focus + connector
filters, a per-frame event panel, and live metrics (events, incidents, MTTR,
deploys). No build step, no CDN. Playback is client-driven over the windowed
replay payload — the server holds no session.

## 12. Future roadmap

1. Graph-enriched "who was involved" (join replay actors to the Operational Graph).
3. Explainability-narrated replays ("why did this happen" per marker, via 11.2).
4. Saved replays / shareable permalinks.
5. Live "follow" mode that tails new events onto an open replay.

---

*Phase 11.3 Milestone 1 complete. Milestone 2: Replay Player admin page + REST API.*
