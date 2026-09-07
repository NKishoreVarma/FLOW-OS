# Operational Inbox

Route: `/inbox`
Component: `flow-os-frontend/src/components/inbox/OperationalInbox.jsx`

## Signal sources

| Source | Type | Backend |
|--------|------|---------|
| Pending approvals | `approval` | `prisma.pendingApproval` |
| Notifications (merge conflicts, CI failures) | `conflict`, `ci`, etc. | `prisma.notification` |
| Prediction risks | `prediction` | `PredictionEngine.predict()` |
| Failed executions (last 24h) | `execution_failed` | `prisma.executionRecord` WHERE status=FAILED |
| Connector warnings | `connector_warning` | `registry.checkAllHealth()` |
| Recent incidents (last 48h) | `incident` | `orgMemoryService.queryMemory()` |
| Executive recommendations | `recommendation` | `/api/brain/recommendations` |
| Upcoming meetings | `meeting` | `/api/meetings/upcoming` |
| Workday queue (NOW+NEXT) | various | `/api/workday/queue` |

## Item lifecycle

1. Signal source → WorkItem (signalCollector.js)
2. WorkItem + suggestedActions → ActionCard (actionCardService.js / actionCardAdapter.js)
3. User clicks action → executionApi.execute() → governed pipeline
4. Tracking: `action.accepted` or `action.dismissed` in pilot_events

## Rendering

Every inbox item renders as an `<ActionCard>` with:
- Impact badge (critical / high / medium / low)
- Up to 3 evidence lines
- 1–4 action buttons with risk labels
- Inline execution state machine (idle → running → confirm | approval | done | error)

## Invariants

- Inbox never breaks if a signal source fails (all sources are best-effort via `Promise.allSettled`)
- Every item has at least one action (fallback: "Open" navigation)
- Dismissed items are removed client-side — no server state needed
- Completed items are soft-removed (`done` state) until page refresh
