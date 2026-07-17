# Phase 18 — Private Pilot Readiness
**Date:** 2026-07-17  
**Approach:** B — Lightweight Telemetry + Targeted Hardening  
**Author:** Claude (approved by user)

---

## Mission

FLOW is feature-complete. Phase 18 makes it trustworthy for daily use by a real CTO at a 20–80 person software company — two weeks without needing the dev team.

No new AI. No new intelligence engines. Reliability, recovery, observability, and the admin surface a non-technical ops person can actually use.

---

## Success Criteria

- Morning Brief loads < 3s every morning, never silently blank
- Every error surfaces a user-readable message + self-serve recovery step
- "Report this" button delivers pilot feedback to the dev team in < 60s
- Ops admin can re-auth a connector, invite a user, and read workspace health without opening a terminal
- Dev team can see daily active usage, feature engagement, and error rate without querying the database
- All 6 daily journey validation tests pass before pilot launch

---

## Architecture

### Backend — `src/analytics/`

**`pilotTracker.js`**  
Ingests the 8 critical pilot events into `pilot_events` (PostgreSQL). Every event carries `workspaceId`, `userId`, `event`, `properties`, `ts`. Uses the existing `pg.Pool` (`config/db.js`) — no new DB connection.

**`pilotMetrics.js`**  
Aggregates `pilot_events` into pilot health metrics: DAU, feature engagement counts, error rate, time-to-first-value (session.start → morning_brief.loaded delta). Consumed by `/api/analytics/summary` and the live dashboard.

**`digestService.js`**  
Builds the daily digest payload (total sessions, actions completed, errors, top friction, feedback count). Scheduled as a BullMQ cron at 08:00 workspace-local time via the existing queue infrastructure.

### Backend — `src/feedback/`

**`feedbackStore.js`**  
Stores pilot feedback (thumbs up/down + optional text) in `pilot_feedback` (PostgreSQL). Every submit also fires `pilot.feedback_submitted` on the existing `eventBus` so the dev team's live dashboard updates in real time.

**`recoveryMap.js`**  
Maps every application error code → `{ userMessage, recoverySteps: string[], selfServeAction }`. Used by the error handler to enrich API error responses with actionable guidance. Examples:
- `CONNECTOR_AUTH_EXPIRED` → "Your Gmail connection expired. Click reconnect to restore access in 30 seconds."
- `WIC_BUILD_FAILED` → "Morning Brief couldn't load. We're rebuilding it now — refresh in 60 seconds."
- `APPROVAL_REQUIRED` → "This action needs approval from your workspace admin. They've been notified."

### Backend — New Routes

**`analyticsRoutes.js`** at `/api/analytics/*`  
- `POST /event` — track event (JWT, any role)
- `GET /summary` — pilot metrics summary (ADMIN JWT, workspace-scoped)
- `GET /digest` — today's digest payload (ADMIN JWT)
- `GET /live` — SSE stream of real-time pilot events (dev-only 404 in prod, ADMIN JWT)

**`feedbackRoutes.js`** at `/api/feedback/*`  
- `POST /` — submit feedback (JWT, any role)
- `GET /` — list feedback (ADMIN JWT, newest first)

### Error Handler Enhancement

`core/errors/index.js` `errorHandler` enriched — when a `recoveryMap` entry exists for the error code, the response includes:
```json
{
  "error": {
    "code": "CONNECTOR_AUTH_EXPIRED",
    "message": "...",
    "userMessage": "Your Gmail connection expired.",
    "recoverySteps": ["Click Reconnect in Settings → Connections", "Re-authorize with your Google account"],
    "selfServeAction": { "label": "Reconnect Gmail", "href": "/admin/ops#gmail" }
  }
}
```
Backward-compatible — `userMessage`/`recoverySteps`/`selfServeAction` only appear when the code is in the map.

### Database Migration

`scripts/migrate-pilot-analytics-v18.sql`  
Two new tables, idempotent (`IF NOT EXISTS`), additive — no existing tables touched:

```sql
pilot_events (id, workspace_id, user_id, event, properties jsonb, ts)
pilot_feedback (id, workspace_id, user_id, thumbs, text, context, reported_at)
```

---

## Frontend

### `RecoveryToast.jsx` (new, `src/components/ui/`)

Replaces the generic red toast for API errors. Renders:
- **What happened** — `userMessage` from the error envelope
- **How to fix it** — `recoverySteps` as a numbered list (if present)
- **Self-serve CTA** — button wired to `selfServeAction.href` (if present)
- **"Report this"** — always present; fires `POST /api/feedback` with error context + `POST /api/analytics/event` with `error.reported`, then shows "Reported — we'll look into it" confirmation

All FLOW OS design tokens. No raw hex values. Dismissible. Auto-dismiss after 12s if the user takes the self-serve action.

### `ErrorBoundary.jsx` (enhanced, `src/components/ui/`)

Current: generic "Something went wrong" with Try Again + Go to Workfeed.  
Enhanced:
- Accepts `context` prop (`morning-brief` | `inbox` | `meetings` | `council` | `default`)
- Context-aware message: "Morning Brief couldn't load" instead of generic copy
- Shows recovery steps if available
- Adds "Report this" button (posts to `/api/feedback`)
- Retry logic: on "Try Again", clears state + triggers a `session.start` re-track

### `/pilot` — Live Pilot Dashboard (dev-only, ADMIN JWT)

Four panels:
1. **Activity strip** — DAU over 14 days (bar chart), session count today
2. **Feature engagement** — counts per `feature.visited` route, `action.completed` type
3. **Error log** — last 50 `morning_brief.failed` + `action.failed` events, with report status
4. **Feedback feed** — last 20 `pilot_feedback` rows, thumbs + text, newest first

SSE live feed (`/api/analytics/live`) updates the error log and feedback feed in real time without polling. 404 in production.

### `/admin/ops` — Admin Operations Panel (ADMIN+ JWT)

Built for a non-technical ops person. Plain English. No technical jargon.

Four sections:
1. **Connections** — each connector card shows green/yellow/red status + "Reconnect" button when OAuth expires (calls existing `/api/connectors/:id/auth/initiate`)
2. **Team** — user table (name, role, last active), Invite button (existing `/api/users/invite`), Remove button
3. **Workspace Health** — plain language status (e.g., "Everything looks good" / "Gmail is disconnected — 3 emails may be delayed") derived from existing `/api/workspace/snapshot`
4. **Recent Activity** — last 20 connector audit log entries in plain English (not raw JSON)

---

## The 8 Tracked Events

| Event | When | Key Properties |
|-------|------|----------------|
| `session.start` | App mounts + user is authenticated | `userId`, `workspaceId` |
| `morning_brief.loaded` | WIC snapshot renders successfully | `loadTimeMs`, `snapshotAge` |
| `morning_brief.failed` | WIC snapshot errors or is stale > 30min | `errorCode`, `snapshotAge` |
| `action.completed` | Execution engine action succeeds | `actionType`, `connector` |
| `action.failed` | Execution engine action errors | `actionType`, `errorCode` |
| `feedback.submitted` | Thumbs up/down + text sent | `thumbs`, `context` |
| `error.reported` | "Report this" clicked | `errorCode`, `context` |
| `feature.visited` | Route change | `route` |

Frontend fires `POST /api/analytics/event`. Backend also auto-tracks `action.completed` and `action.failed` from the existing `ExecutionEngine` via `eventBus` subscriber — no frontend change needed for execution events.

---

## Journey Validation Suite

`scripts/validate-pilot-journeys.js` — 6 end-to-end daily journeys against a live server on `:5001`.

| Journey | Steps | Pass Condition |
|---------|-------|----------------|
| 1. Morning Brief | GET /api/workspace/snapshot | status 200, overall.health present |
| 2. Inbox | GET /api/communication/inbox | status 200 or 503 with userMessage |
| 3. Meetings | GET /api/meetings/upcoming | status 200 or 503 with userMessage |
| 4. Council Ask | POST /api/council/ask | status 200, answer.text present |
| 5. Action Execution | POST /api/execution/plan | status 200, plan.steps present |
| 6. Error Recovery | Force a known error → check userMessage + recoverySteps in response | `userMessage` and `recoverySteps` both present |

---

## Milestones

| Milestone | Deliverables | Validation |
|-----------|-------------|------------|
| M1 | DB migration + pilotTracker + pilotMetrics + digestService + feedbackStore + recoveryMap + analyticsRoutes + feedbackRoutes | validate-pilot-analytics.js |
| M2 | RecoveryToast + enhanced ErrorBoundary + Morning Brief retry | Manual + journey test 6 |
| M3 | /pilot Live Dashboard (SSE) + /admin/ops panel | validate-pilot-journeys.js (all 6) |
| M4 | Error handler enrichment (10 codes in recoveryMap: `CONNECTOR_AUTH_EXPIRED`, `WIC_BUILD_FAILED`, `APPROVAL_REQUIRED`, `RATE_LIMITED`, `AUTHENTICATION_REQUIRED`, `FORBIDDEN`, `NOT_FOUND`, `CONNECTOR_UNAVAILABLE`, `WORKSPACE_NOT_FOUND`, `INTERNAL_ERROR`) + daily digest cron + PILOT_RUNBOOK.md | validate-phase18.js (all scenarios) |

---

## Invariants (do not regress)

- Analytics events never contain PII — `text` fields are never logged, only metadata
- `pilot_events` is workspace-scoped — every query requires `workspace_id` filter
- `recoveryMap` enrichment is additive — error responses are backward-compatible
- `/pilot` and error diagnostic detail are 404 in production
- Feedback submission never blocks the UI — fire-and-forget with optimistic "Reported" confirmation
- `digestService` cron uses existing BullMQ infrastructure — no new queue
