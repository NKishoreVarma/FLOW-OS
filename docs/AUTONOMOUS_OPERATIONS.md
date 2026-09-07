# FLOW OS — Autonomous Operations (Phase 19)

> Turns FLOW from an intelligence reporter into an operational command center.
> No new AI models, no new databases. Every layer reuses Phase 14–18 systems.

## Goal

A CTO spends an hour inside FLOW and realizes:
- "I barely opened Slack."
- "I barely opened Jira."
- "I barely opened GitHub."
- "I completed my work from one place."

## Architecture

```
Signal Sources → Workday Engine → Action Card Service → OperationalInbox
                                       ↓
                             Chief of Staff Panel (/chief)
                                       ↓
                             Execution Engine (governed)
                                       ↓
                             Audit + Timeline + Notification
```

## What was built

| Component | Location | Description |
|-----------|----------|-------------|
| Signal Collector (enhanced) | `src/workday/signalCollector.js` | Adds failed executions, connector warnings, incidents |
| Workflow Templates | `src/autonomous/workflowTemplates.js` | Named multi-step workflow library |
| Action Card Service | `src/autonomous/actionCardService.js` | WorkItem → ActionCard with 2–4 options |
| Memory Personalizer | `src/autonomous/memoryPersonalizer.js` | Reads execution history for preferences |
| Chief of Staff Service | `src/autonomous/chiefOfStaffService.js` | Top-5 NOW items + greeting |
| Weekly Review Service | `src/autonomous/weeklyReviewService.js` | Engineering velocity + execution success rate + risks |
| Phase 19 Routes | `src/routes/phase19Routes.js` | `/api/autonomous/*` |
| ActionCard UI | `flow-os-frontend/src/components/inbox/ActionCard.jsx` | Multi-option, risk-aware, inline execution |
| ChiefOfStaff UI | `flow-os-frontend/src/components/autonomous/ChiefOfStaff.jsx` | `/chief` |
| WeeklyReview UI | `flow-os-frontend/src/components/autonomous/WeeklyReview.jsx` | `/review` |

## API

| Route | Description |
|-------|-------------|
| `GET /api/autonomous/chief-of-staff` | Top-5 NOW items + greeting + preferences |
| `GET /api/autonomous/weekly-review?days=7` | Weekly executive review |
| `GET /api/autonomous/templates` | Available workflow templates |
| `GET /api/autonomous/efficiency?days=7` | FLOW efficiency metrics |

## Invariants

- All actions still flow through `executeAction()` — governance never bypassed
- Action Cards never duplicate execution logic — they call `executionApi.execute()` client-side
- Signal sources are best-effort (wrapped in try/catch) — inbox never breaks if a source fails
- NL bridge is best-effort — copilot always returns a response even if plan detection fails
