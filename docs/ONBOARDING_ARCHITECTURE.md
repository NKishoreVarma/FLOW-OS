# Onboarding Architecture (Phase 17 — Pilot Experience)

> The first-time-setup backend. **No new engine, no new database, no new event system.**
> It is thin orchestration + one read-only aggregator over systems FLOW already has, so
> the pilot experience is a *product layer*, not a new platform.

## The flow

```
Welcome → Discover → Permissions → Build → Ready (Morning Brief)
```

Each step maps to something that already exists:

| Step | Backed by | Reuses |
|------|-----------|--------|
| Discover | `POST /api/onboarding/discover` | Integration-Permissions discovery (live) · deterministic demo catalog |
| Permissions | `POST /api/onboarding/permissions` | Integration Permissions deny-by-default gate (Phase 13.1) enforces once data flows |
| Build | frontend calls `/api/lifecycle/create` (demo) or `/api/simulator/seed` | Workspace Lifecycle Engine (10 stages + WS progress) · Living Workspace Simulator |
| Ready | `/api/workspace/snapshot` + `/api/workday/queue` | WIC + Adaptive Workday |
| ROI | `GET /api/success/summary` | execution_records · pending_approvals · notifications · flow_events |

## Modules

### `src/onboarding/onboardingState.js`
Per-workspace setup progress, persisted in the **shared Redis** (`onboarding:state:{ws}`) —
reuse, no schema migration. Losing it only re-shows onboarding, so Redis durability is the
right trade for a pilot. Drives the **first-run gate**: `completed === false` routes the UI
to `/welcome` instead of the Morning Brief. `getState / setState / markComplete / reset`.
Steps: `welcome · discover · permissions · build · ready`.

### `src/onboarding/discoveryOrchestrator.js`
One call returns, per connector, everything FLOW found — so the admin governs before any
import (Track 1 + 2).
- **live** → reuses `runDiscovery(ws, connector)` (real provider APIs). A connector not yet
  OAuth'd returns `status: 'not_connected'` — **honest, never fabricated**.
- **demo** → a deterministic, coherent catalog (Acme Technologies: 6 repos, 14 Slack
  channels, 2 calendars, Notion spaces, Jira projects, 42 employees) consistent with the
  Living Workspace Simulator's world, for "investors explore in 30 seconds."

Only the 6 governed connectors (slack, github, gmail, google-calendar, notion, jira) are
discoverable; others are honestly absent.

## Routes — `/api/onboarding/*` (JWT + workspace-id)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/state` | current progress |
| POST | `/discover` | `{ mode:'demo'\|'live', connectors? }` → discovery, advances to `permissions` |
| POST | `/permissions` | `{ selections }` → records allow/hide intent, advances to `build` |
| POST | `/complete` | `{ buildImportId? }` → flips the first-run gate |
| POST | `/reset` | clears state (re-run setup / dev) |

## Invariants
- No new store: onboarding state in Redis, everything else in existing tables.
- Discovery never fabricates: unconnected connectors say so.
- Governance is not re-implemented — the real Phase 13.1 gate still enforces what was
  allowed once data flows.

## Validation
`node scripts/validate-pilot-experience.js` — **23/23** (state machine persistence + gate,
demo discovery shape, hybrid success metrics incl. honest-empty case). Regression **66/74**.
