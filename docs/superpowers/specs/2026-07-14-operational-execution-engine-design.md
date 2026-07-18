# Phase 14 — Operational Execution Engine — Design Spec

> Status: approved 2026-07-14. FLOW evolves from an intelligence platform into an
> **AI Operations Platform** — it safely coordinates work, executes approved actions,
> notifies the right people, and keeps a complete operational history.

## Principle

Every layer **consumes** the layer beneath — no duplication. Phase 14 extends the
existing Execution Engine (`executeAction`), Governance (`evaluateWithPolicies`),
Approval store, Automation Engine, Event Platform, Timeline, Graph, and Connectors.

## Architecture

```
Operational Brain (Phase 7/9)            existing
  → Action Planner                       NEW  recommendation → ExecutablePlan(steps[])
  → Execution Planner                    NEW  order + dependency + dry-run (perms/creds)
  → Approval Engine                      NEW  risk tier → auto / confirm / manager / two-person
  → Governance Engine                    existing  evaluateWithPolicies() — DENY still wins
  → Execution Engine                     existing  executeAction() — lightly extended
  → Connector                            existing  adapters
  → Audit → Event Platform → Timeline → Graph   existing
  → Workspace Notification Engine        NEW  centralized, dedup, priority, permission-aware
```

The Approval Engine sits **above** the binary governance gate. Governance can still
`DENY` outright; the Approval Engine decides *how many / whose* approvals a
permitted-but-risky action needs.

## Decisions (locked)

1. **Approval resolution — role-based.** LOW → auto-execute · MEDIUM → current user
   confirms in FLOW · HIGH → 1 × ADMIN/OWNER · CRITICAL → 2 × **distinct** ADMIN/OWNER.
   No manager hierarchy required; reuses existing roles + self-approval guard.
2. **Teams — skeleton/defer.** Register a Teams adapter skeleton; real execution stays
   on GitHub · Slack · Jira · Calendar · Gmail · Notion · CRM.
3. **Conflict detection — poll on sync + on-view.** Read `mergeable` / `mergeable_state`
   / review + check status during GitHub sync and when a PR is opened in FLOW; a webhook
   path can layer on later.
4. **Milestones — M1→M4**, each build → validate → regression → reviewed.

## Modules (new)

| File | Responsibility |
|------|----------------|
| `src/execution/riskClassifier.js` | Deterministic matrix `(connector, actionType, payload) → {level, reasons}`, policy-overridable |
| `src/execution/approvalEngine.js` | Tiered approval on top of governance; extends `approvalStore` for two-person distinct approvers |
| `src/execution/actionPlanner.js` | Recommendation → `ExecutablePlan` (1..n steps) |
| `src/execution/executionPlanner.js` | Order steps, dependency resolve, dry-run (perms/creds) |
| `src/execution/executionCoordinator.js` | Per step: risk → approval gate → `executeAction()` → `ExecutionRecord` |
| `src/execution/executionHistory.js` | Durable `ExecutionRecord` CRUD |
| `src/collaboration/mergeConflictDetector.js` | Poll-on-sync + on-view; emit `MERGE_CONFLICT_DETECTED` / `PR_BLOCKED` / `CI_FAILED` |
| `src/collaboration/ownershipAnalyzer.js` | Owners / who-introduced / overlapping files / blocked-duration from graph + PR files + commit authors |
| `src/collaboration/collaborationDetector.js` | Blocked PRs, >48h waits, stale branches, repeated collisions, large risky PRs → suggested actions |
| `src/notifications/notificationEngine.js` | One bus subscriber; dedupe key; priority score; persist + WS push |
| `src/notifications/notificationTargeting.js` | Resolve recipients (only relevant people via ownership/graph) + permission filter |

## Risk matrix (default; policy-overridable)

| Level | Actions | Gate |
|-------|---------|------|
| LOW | read/list/search/get; label; draft | auto-execute |
| MEDIUM | comment; add note; create issue/page; assign; transition | current user confirms |
| HIGH | merge PR; request changes; send/reply/forward email; send Slack/Teams msg; create/update/cancel meeting; update customer | 1 × ADMIN/OWNER |
| CRITICAL | delete; close issue en masse; merge to protected branch; irreversible/bulk ops | 2 × distinct ADMIN/OWNER |

## Data model (additive — hand-crafted SQL migration, then `prisma generate`; NOT `prisma migrate dev`)

- **`ExecutionRecord`** — `id, workspaceId, orgId, planId, requestedById, executedById,
  approverIds[], connector, actionType, riskLevel, status(PENDING|APPROVED|EXECUTED|FAILED|DENIED|ROLLED_BACK),
  result(JSON), durationMs, rollbackAvailable, rolledBack, timelineEventId, auditLogId, createdAt`.
- **`Notification`** — `id, workspaceId, orgId, type, priority(0-100), title, body,
  actions(JSON), dedupeKey, recipients(JSON userIds), readBy(JSON), sourceEventId, createdAt`.
- **`PendingApproval`** additive columns — `riskLevel`, `requiredApprovals(int default 1)`,
  `approvalVotes(JSON [{approverId, at}])`. CRITICAL sets `requiredApprovals=2`; a vote only
  transitions to APPROVED once `approvalVotes.length >= requiredApprovals` with distinct approvers.

## REST

```
POST /api/execution/plan          build ExecutablePlan from a recommendation/intent
POST /api/execution/execute       run a plan/step (goes through Approval Engine)
GET  /api/execution/history       list ExecutionRecords (workspace-scoped)
GET  /api/execution/:id           one record
POST /api/execution/:id/rollback  reverse where supported
GET  /api/collaboration/signals   blocked/stale/conflict smart-collab signals
GET  /api/notifications           list (permission-filtered, deduped)
POST /api/notifications/:id/read  mark read
GET  /api/notifications/stream    (existing WS carries pushes)
```
`/api/approvals/*` extended: approval detail carries `riskLevel` + `requiredApprovals` +
current votes; approve endpoint records a distinct vote.

## Merge Conflict Intelligence (flagship)

On GitHub sync / PR view: read `mergeable`, `mergeable_state`, review + check status.
On conflict/blocked/CI-fail → emit a FLOW event → `ownershipAnalyzer` computes owners,
who introduced the conflict, overlapping files, repo/branch, blocked duration →
`notificationEngine` targets **only** the involved people (e.g. Rahul + Kishore who both
touched `auth.js`), with actions: Open Diff · Open PR · Message <owner> · Create Meeting.
Unrelated employees are never notified.

## Invariants (do not regress)

- Nothing bypasses `executeAction` governance. Governance `DENY` always wins.
- Two-person approval requires **distinct** approver ids (self-approval guard reused).
- Automation Engine still runs as fixed `MEMBER` actor; execution actor role is never
  escalated by plan/rule data.
- Notification targeting is permission-aware — a recipient only sees a notification for
  data their role + workspace membership allows.
- Tenant isolation on every read (`workspaceId` mandatory).

## Error handling / rollback

Steps are fault-isolated; a failed **required** step halts the plan (later steps not run).
`rollbackAvailable` is **honest**: created issue/page → closable/archivable (true);
sent email / Slack message / merged PR → not reversible (false). `/rollback` only acts
where the connector exposes a true inverse.

## Validation

`scripts/validate-execution-engine.js`:
1. risk classification across the matrix
2. tiered approval incl. CRITICAL two-person **distinct**-approver enforcement
3. execution history record completeness
4. timeline + audit event creation per execution
5. notification dedup + priority + **permission/targeting** (unrelated user excluded)
6. merge-conflict ownership analysis (two owners on overlapping file)
7. rollback where supported / honestly false where not

Integration regression must stay at the **66/74** baseline (8 known pre-existing stale
tests — signup posts `name` vs required `fullName`; lifecycle-schema asserts old fields).

## Docs (M4)

`EXECUTION_ENGINE.md` · `APPROVAL_ENGINE.md` · `NOTIFICATION_ENGINE.md` ·
`MERGE_CONFLICT_INTELLIGENCE.md`.

## Milestones

- **M1** — risk classifier, Approval Engine (tiers + two-person), Action/Execution Planner,
  Execution Coordinator + History, `/api/execution/*`, migration, validate script.
- **M2** — Merge Conflict Intelligence + Smart Collaboration + `/api/collaboration/signals`.
- **M3** — Workspace Notification Engine (consolidate RealtimeNotificationEngine) + `/api/notifications/*`.
- **M4** — Executable Brain cards (UI) + approvals inbox + merge-conflict card + 4 docs.
