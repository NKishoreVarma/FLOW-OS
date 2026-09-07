# Workspace Intelligence Cache (Phase 16.1)

The caching + serving layer that makes FLOW feel **instant**. Heavy reasoning runs in the
background; the UI reads one canonical snapshot of the company's current state.

> **Not an AI engine.** No new Operational Brain, no new Executive Council. It reuses the
> existing fast, deterministic sources and serves their aggregate from cache.

## Why

Home, Morning Briefing, and the Operational Inbox previously depended on expensive
runtime reasoning (the ~90s Brain/Council). That's the wrong place for it. The expensive
work now happens in the background; the UI simply reads the latest snapshot.

## Architecture

```
GitHub · Slack · Calendar · Jira · Notion · CRM
  → Unified Event Platform (11.0)
  → Operational Graph (11.1) · Prediction Engine (11.5) · Execution History (14) · Notifications
  → Workspace Intelligence Cache  ← YOU ARE HERE
  → Morning Briefing · Executive Dashboard · Operational Inbox · Home · Sidebar · API
```

## Modules (`src/workspaceCache/`)

| File | Responsibility |
|------|----------------|
| `snapshotBuilder.js` | `buildSnapshot(ws)` — aggregates the FAST sources into one doc. **Never** calls the Brain/Council |
| `snapshotStore.js` | In-memory `Map` (sub-ms reads) + Redis write-through (`wic:snapshot:{ws}`, TTL). Reads never build synchronously |
| `refreshCoordinator.js` | `refresh` / `scheduleRefresh` (debounced) / `ensureFresh` (cold read) / `registerWicSubscriber` / `warmActiveWorkspaces` |
| `index.js` | `startWorkspaceCache()` — wires the subscriber + boot warm + 5-min scheduled refresh |

## Snapshot contents

```jsonc
{
  "workspaceId", "generatedAt", "buildMs", "status": "ready",
  "overall": { "health", "priority": "critical|high|normal", "summary", "topActions": [] },
  "domains": {
    "engineering": { "status", "score", "topRisks": [], "topOpportunities": [], "recommendedActions": [], "riskCount", "topRiskScore" },
    "operations": { … }, "sales": { … }, "hr": { … }, "finance": { … }, "security": { … }
  },
  "counts": { "pendingApprovals", "notifications", "executions", "graphNodes", "predictionsTracked" }
}
```

Domain cards are derived from **Prediction Engine** output (domain-tagged, deterministic,
~50ms), **Health Score**, **Operational Graph** metrics, and durable PostgreSQL counts —
all cheap. A snapshot builds in **~140ms cold / ~13ms warm** (measured), versus ~90s for
the Brain/Council.

## Refresh flow / lifecycle

1. **Boot** — `startWorkspaceCache()` registers the `wic` event subscriber and warms
   active workspaces (distinct `workspace_id` across recent notifications / approvals /
   executions).
2. **Event-driven** — the `wic` subscriber marks a workspace dirty on relevant events
   (`MERGE_CONFLICT`, `EXECUTION_COMPLETED`, `APPROVAL`, `NOTIFICATION`, `PREDICTION`,
   `INCIDENT`, `MEETING`, `DECISION`, …) and rebuilds **debounced** (`WIC_DEBOUNCE_MS`,
   default 10s) to coalesce bursts.
3. **Scheduled** — every 5 minutes (`WIC_CRON_MS`) it re-warms active workspaces.
4. **Cold read** — a miss returns `{ status: 'building' }` and triggers an async build
   (`ensureFresh`); the read never blocks. The next read is warm.
5. **Write-through** — every build writes memory + Redis (`EX WIC_TTL_SECONDS`, default 1h).

Builds are deduped (`inflight` map) so concurrent triggers collapse to one.

## Consumers

- **Morning Briefing** — the Executive Summary reads `GET /api/workspace/snapshot`
  (instant), not the Executive Council. The Council stays available for deep,
  interactive reasoning.
- Home, Operational Inbox counts, sidebar badges, widgets, mobile, and any API client
  read the same snapshot.

## API (`/api/workspace/*`, JWT + workspace-id)

| Method | Path | Returns |
|--------|------|---------|
| GET | `/snapshot` | Full snapshot (`?force=true` rebuilds synchronously) |
| GET | `/health` | `overall.health` + per-domain `{status, score}` |
| GET | `/summary` | `overall { health, priority, summary, topActions }` + counts |
| GET | `/actions` | Top cross-domain actions + per-domain recommended actions |

These **never** invoke expensive reasoning.

## Performance (measured)

- Snapshot build: **140ms** cold, **13ms** warm.
- Cache read (memory): **0.004ms**; over HTTP: **~5ms** warm, **27ms** cold (returns
  `building` + async build). Well under the <100ms target.

## Invariants

- No duplicated logic — the cache aggregates existing engines; it holds no reasoning.
- Reads never trigger a synchronous heavy build.
- `workspace_id` mandatory on every read (tenant isolation).
- The Executive Council/Brain remain the deep-reasoning surfaces; the cache is the
  instant surface.

## Validation

`node scripts/validate-workspace-cache.js` — **14/14**: fast build (<5s, not the brain),
full structure (overall + 6 domains + counts), memory/Redis round-trip, sub-ms instant
read, background refresh, cold-miss-returns-null. Integration regression steady at
**66/74**.

Env knobs: `WIC_CRON_MS` (300000), `WIC_DEBOUNCE_MS` (10000), `WIC_TTL_SECONDS` (3600).
