# Operational Execution Engine (Phase 14)

FLOW's execution layer turns a recommendation into safely-executed work. Every action
is permission-aware, governed, auditable, explainable, and (where possible) recoverable.

> Milestone status: **M1 delivered** (risk tiers + Approval Engine + Planners +
> Coordinator + Execution History + REST). M2 Merge Conflict Intelligence, M3
> Notification Engine, and M4 executable Brain cards follow.

## Pipeline

```
Recommendation
  → Action Planner        buildPlan()      normalize → ExecutablePlan(steps[])
  → Execution Planner     dryRun()         risk + gate + connector/creds check (no side effects)
  → Execution Coordinator runStep()/executePlan()
       ├─ Risk Classifier classifyAction() LOW | MEDIUM | HIGH | CRITICAL
       ├─ Approval Engine  decideGate()     AUTO | CONFIRM | APPROVAL(1|2)
       └─ executeAction()  (existing)       governance → adapter → audit → timeline → event → WS
  → Execution History     execution_records   who/when/result/duration/rollbackAvailable
```

The Coordinator **never bypasses governance**. `executeAction()` still runs
`evaluateWithPolicies()`; a governance `DENY` always wins. The risk tier layers *on top*
of governance — it decides how many / whose approvals a permitted-but-risky action needs.

## Modules (`src/execution/`)

| File | Responsibility |
|------|----------------|
| `riskClassifier.js` | Deterministic `(connector, actionType, payload) → {level, reasons}`; policy may only *raise* the tier |
| `approvalEngine.js` | `decideGate(level)`, tiered open/vote/reject, distinct-approver + two-person rule |
| `actionPlanner.js` | `buildPlan(recommendation)` → `{ id, title, steps[] }` |
| `executionPlanner.js` | `dryRun(workspaceId, plan)` → per-step risk/gate/support/creds, no side effects |
| `executionCoordinator.js` | `runStep` / `executePlan` / `executeApproved`; the orchestration heart |
| `executionHistory.js` | Durable `ExecutionRecord` CRUD; honest `rollbackAvailable` |

## Risk matrix (default; policy-overridable, raise-only)

| Level | Example actions | Gate |
|-------|-----------------|------|
| LOW | read/search; comment; label; draft | auto-execute |
| MEDIUM | create issue/page; (unclassified writes) | requester confirms in FLOW |
| HIGH | merge PR; send/reply email or message; assign; transition; update; cancel meeting | 1 × ADMIN/OWNER |
| CRITICAL | delete; merge to protected branch; bulk ops | 2 × **distinct** ADMIN/OWNER |

Context escalations: merge → `main`/`master`/`protected` ⇒ CRITICAL; external recipient ⇒ ≥ HIGH; `bulk`/many ids ⇒ CRITICAL.

## REST (`/api/execution/*`, JWT + workspace-id)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/plan` | Dry-run preview — risk + gate per step, **no execution** |
| POST | `/execute` | Run a plan under its risk gates (`confirmed:true` for MEDIUM) |
| GET | `/history` | List execution records for the workspace |
| GET | `/record/:id` | One execution record |
| GET | `/approvals/:id` | Approval detail (tier + votes + remaining) |
| POST | `/approvals/:id/vote` | Cast a distinct approval vote (ADMIN/OWNER); executes when satisfied |
| POST | `/approvals/:id/reject` | Reject a pending approval (ADMIN/OWNER) |

## Execution history (`execution_records`)

Each record stores: requester, executor, approver ids, connector, action, risk level,
status (`PENDING|APPROVED|EXECUTED|FAILED|DENIED|ROLLED_BACK`), result, duration,
`rollbackAvailable` (honest — `create/comment/label/assign` reversible; `merge/send/delete`
not), links to audit + timeline.

## Events

`EXECUTION_APPROVAL_REQUIRED` · `EXECUTION_COMPLETED` published to the Unified Event
Platform (→ timeline, notifications, graph). Connector-level `ACTION_EXECUTED` /
`CONNECTOR_ACTION_DENIED` continue from the existing engine.

## Validation

`node scripts/validate-execution-engine.js` — **26/26** (risk matrix, gates, dry-run,
two-person distinct-approver + self-approval guard, execution history, honest rollback).
Integration regression steady at **66/74** (8 pre-existing stale tests unrelated to Phase 14).

## Migration

`scripts/migrate-execution-engine-v14.sql` (idempotent) adds `execution_records`,
`notifications`, and additive `pending_approvals` columns (`risk_level`,
`required_approvals`, `approval_votes`). Apply with `psql -f`, then `npx prisma generate`
(NOT `prisma migrate dev`).

See also: [`APPROVAL_ENGINE.md`](APPROVAL_ENGINE.md).
