# Living Workspace Simulator (Sprint 5)

> Make the workspace feel **alive** so FLOW always has meaningful, coherent work to
> reason about. The objective is that an investor, CTO, or pilot customer forgets the
> company is simulated.

**Not random demo records.** Every event connects to another. Emails create Slack
discussions. Slack creates Jira. Jira creates PRs. PRs create deployments. Deployments
create incidents. Incidents create postmortems. Customer complaints create renewal risk.

**Not a new backend.** The simulator is a *driver* — it feeds coherent causal chains into
the systems FLOW already has: the Unified Event Platform (11.0), Governance approvals
(14.0), and the Notification Engine (14.3). Everything downstream (graph, memory,
timeline, feed, brain, WIC, workday) lights up automatically because it all subscribes to
the one bus.

**Dev-only.** 404 in production; every route requires an OWNER/ADMIN JWT.

## Files (`src/simulator/`)

| File | Responsibility |
|------|----------------|
| `personas.js` | The coherent cast — Rahul (CTO) + 6 named colleagues with role, department, and ownership (repos / files / customer accounts). The people who own a thing are the ones the events involve and FLOW notifies. |
| `scenarios.js` | Five causal chains. Each emits linked FLOW events (shared `correlationId`, consistent people/repos/customers) via `publishFields`, and — when run **live** — creates the current pending approvals + targeted notifications. |
| `simulatorEngine.js` | `seedHistory(ctx,{days})` (6-month backfill, denser toward today, then plants current work), `tick(ctx)` (one live beat), `start()/stop()` (dev-only heartbeat, gated). |

## The five causal chains

| Scenario | Chain | Live signal it plants |
|----------|-------|-----------------------|
| `featureShip` | email → slack → jira → PR → CI → deploy | HIGH merge approval (1 approver) |
| `incident` | deploy → incident → war-room → postmortem → follow-up Jira | INCIDENT notification |
| `mergeConflict` | PR → conflicting commit → merge conflict | targeted MERGE_CONFLICT notification (owners only) |
| `customerEscalation` | customer email → sales escalation | RISK / renewal-at-risk notification |
| `reviewNeeded` | PR → review requested | CRITICAL merge approval (2 distinct approvers) |

Coarse event `type` uses the canonical Event Platform enum (`engineering`, `communication`,
`task`, `deployment`, `incident`, `knowledge`, `customer`); the granular activity
(`pull_request`, `email`, `merge_conflict`…) rides in `metadata.kind` so chains stay legible
without breaking event validation.

**The demo CTO is the logged-in user.** CTO-owned work (merge conflicts on owned files,
incidents, renewals) is attributed to the caller's identity as well as the persona, so it
surfaces to **NOW** in *their* Adaptive Workday queue — not just to a name they don't own.

## API (`/api/simulator/*`, dev-only, OWNER/ADMIN JWT + workspace-id)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/seed` | `{ days=180 }` — backfill history + plant current work. Returns `{ events, approvals, notifications, chains }`. |
| POST | `/tick` | One fresh live beat. |
| GET | `/status` | `{ events, latestEvent, notifications, pendingApprovals, enabled }` for the workspace. |
| POST | `/reset` | Remove all simulated data for the workspace (events, deliveries, notifications, approvals). |

> The workspace-id header must be the workspace's **externalId** (what `tenantIsolation`
> resolves and what every app surface keys data by) — not the Prisma cuid.

## Background heartbeat (optional)

Off by default. Enabled only when **`SIMULATOR_ENABLED=true`** *and* **`SIM_WORKSPACE_ID`**
is set (and never in production). Fires `tick()` every `SIM_TICK_MS` (default 5 min)
against the target workspace, using an OWNER of that workspace's org as the approval
requester. Timer is `unref`'d — it never keeps the process alive.

```bash
SIMULATOR_ENABLED=true SIM_WORKSPACE_ID=workspace_xxx SIM_TICK_MS=300000 npm run dev
```

## Validation

`node scripts/validate-simulator.js` — **18/18** (DB-backed): seeds a throwaway org +
workspace + owner, runs the real `seedHistory`, and asserts **causal integrity** —
every event belongs to a chain (no orphans), chains connect (email→PR, deploy→incident),
~6 months of spread with recent activity, current approvals + notifications exist,
merge-conflict notifications are targeted to owners only, `tick` adds activity, `reset` is
clean. Then tears everything down. `--keep` leaves the workspace to explore.

Verified end-to-end against a live server: seeding a real workspace turns an empty
"you're all clear" morning into a **critical** WIC snapshot with per-department activity
and a NOW workday item ("Merge conflict in flow-backend — Blocking 2 people"). Integration
regression steady at **66/74**.

## Success metric

Not events generated — **the workspace feels like a real company**: FLOW always has
coherent, connected work to reason about, and the Perfect Morning is never empty.
