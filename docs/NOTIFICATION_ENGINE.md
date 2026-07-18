# Workspace Notification Engine (Phase 14 M3)

The single, centralized notification path for FLOW. Every source — Execution Engine,
GitHub / merge-conflict, Slack, Jira, Simulation, Prediction, Replay, Operational Brain
— produces notifications through here. Notifications are **actionable**,
**deduplicated**, **priority-scored**, and **permission-aware**.

## Modules (`src/notifications/`)

| File | Responsibility |
|------|----------------|
| `notificationTargeting.js` | `priorityFor(type, severity)`, `resolveRoleRecipients(orgId, roles)`, `canSee(notification, user)`, `dedupeKeyFor()` |
| `notificationEngine.js` | `createNotification()` (+ dedupe, persist, WS push), source helpers, read side, event-bus glue |

## Delivery guarantees

- **Actionable** — every notification carries `actions[]` (`Open Diff`, `Message <owner>`,
  `Review approval`, `Create Meeting`, …).
- **Deduplicated** — a repeated signal with the same `dedupeKey` within a 6-hour window
  collapses onto the existing notification (`{ deduped: true }`) instead of spamming.
- **Priority-scored** — 0..100 (`MERGE_CONFLICT` 82, `INCIDENT` 90, `APPROVAL_REQUIRED`
  76, `EXECUTION_DONE` 30, …; ±8 by severity). Lists are ranked priority-desc.
- **Permission-aware** — `recipients` holds only the relevant people (merge-conflict
  owners, ADMIN/OWNER approvers, the requester). `canSee` lets a user read a notification
  only if they are a recipient (by id / email / login) or it is a workspace broadcast
  (empty recipients).

## Source helpers (the tested contract)

- `notifyMergeConflict({ workspaceId, ownership, message })` — recipients = **owners
  only** (from the ownership analyzer); dedupe on `MERGE_CONFLICT:repo:number`.
- `notifyApprovalRequired({ workspaceId, approvalId, riskLevel })` — routes to the
  workspace's ADMIN/OWNER; dedupe on the approval id.
- `notifyExecutionDone({ workspaceId, executionId, executedBy })` — informs the executor.

## Event-bus glue

Registered as the `flowNotify` built-in subscriber (`src/events/builtinSubscribers.js`).
`handleEvent(event)` maps FLOW events → notifications:
`MERGE_CONFLICT`/`CI_FAILED` → `notifyMergeConflict`;
`EXECUTION_APPROVAL_REQUIRED` → `notifyApprovalRequired`;
`EXECUTION_COMPLETED` → `notifyExecutionDone`. Unmatched types are ignored and
notification failures never break the bus. Consolidates (does not duplicate) the
Phase 9.4 `RealtimeNotificationEngine`, which remains a lightweight WS-only helper;
this engine is the durable, targeted authority (persists to `notifications`).

## REST (`/api/notifications/*`, JWT + workspace-id)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | List — priority-ranked, deduped, **permission-filtered** (`?unread=true`, `?limit=`) |
| GET | `/unread-count` | Unread count for the current user |
| POST | `/:id/read` | Mark one notification read |

## Validation

`node scripts/validate-notification-engine.js` — **19/19**: targeted merge-conflict
(owners only), dedupe, permission visibility (`canSee` + list filter), approval routing
to ADMIN/OWNER (member excluded), priority ranking, mark-read. Integration regression
unaffected.

See also: [`MERGE_CONFLICT_INTELLIGENCE.md`](MERGE_CONFLICT_INTELLIGENCE.md), [`EXECUTION_ENGINE.md`](EXECUTION_ENGINE.md).
