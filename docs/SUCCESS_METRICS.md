# Success Metrics (Phase 17 — Pilot Experience)

> FLOW's personal ROI dashboard. **Business value, not system metrics.** Track 8 demands
> nothing feel magical — so every number is either **measured** from a real record or a
> **transparently labeled estimate** derived from those measured counts.

## The hybrid model

`src/success/successMetrics.js · getWeeklySummary(ws, { sinceDays = 7 })`

**Measured** (counted from real records FLOW already writes — tenant-scoped):

| Metric | Source | Rule |
|--------|--------|------|
| Tasks Completed | `execution_records` | `status = EXECUTED` in window |
| Approvals Executed | `pending_approvals` | `status ∈ {EXECUTED, APPROVED}` |
| Emails Drafted | `execution_records` | actionType `draft\|reply\|forward\|send` on a mail connector |
| Merge Conflicts Resolved | `execution_records` | actionType `merge` |
| Meetings Prepared | `flow_events` | eventType `meeting` / `metadata.kind = meeting` |
| Jira Issues Created | `execution_records` | jira connector / create-issue action |

**Estimated** (derived + labeled `basis: 'estimated'`):

| Metric | Derivation |
|--------|-----------|
| Context Switches Prevented | `notifications + approvals + tasksCompleted` — each in-app item is one app-open avoided |
| Time Saved (hours) | Σ (count × conservative minutes-per-action) from `src/success/valueModel.js` |

## Transparency (`src/success/valueModel.js`)

The minute weights are conservative and **shown to the user** (returned as `summary.model`)
so a CTO can see exactly how Time Saved is computed:

```
taskCompleted 5 · approvalExecuted 6 · emailDrafted 8 ·
mergeConflictResolved 25 · meetingPrepared 15 · jiraIssueCreated 4 ·
contextSwitch 3   (minutes each)
```

## Honesty guarantees
- An **empty workspace shows zeros** — no pre-filled numbers. (Validated.)
- Failed/denied actions are **not** counted as completed.
- The Demo Company (Living Workspace Simulator) is what makes the dashboard impressive —
  not fabricated metrics.

## API — `/api/success/*` (JWT + workspace-id)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/summary?days=7` | `{ window, headline[4], detail[4], timeSavedHours, model }` — each metric carries `basis: 'measured'\|'estimated'` |
| GET | `/model` | the estimate basis (minute weights + note) |

## Adoption metrics (Track 10 — measure outcomes)

`src/onboarding/adoptionMetrics.js · getAdoptionMetrics(ws)` — `GET /api/onboarding/metrics`.
Read-only aggregation of onboarding state timestamps + the success summary. Measures
outcomes, not features:

```
onboarding: { started, completed, step, mode, permissionsConfigured,
              startedAt, completedAt, timeToCompleteMs, timeToCompleteMinutes }
adoption:    { connectorsDiscovered, resourcesDiscovered, workCompletedInFlow, timeSavedHours }
```

`timeToCompleteMinutes` = time to first value. `workCompletedInFlow` = tasks + approvals
executed inside FLOW. No separate analytics platform.

## Validation
`node scripts/validate-pilot-experience.js` — **28/28**: §1 onboarding state machine + gate,
§2 demo discovery shape, §3 honest-empty success, §4 measured counts (EXECUTED only; FAILED
excluded) + labeled estimates, §5 adoption metrics (completion, time-to-value, work-in-FLOW).
Regression **66/74**.
