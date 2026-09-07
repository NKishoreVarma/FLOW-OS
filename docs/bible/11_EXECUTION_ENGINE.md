# FLOW OS — Execution Engine
**Document:** 11 of 20  
**Status:** Authoritative  
**Last updated:** 2026-07-18

---

## Overview

FLOW is not a read-only system. It executes.

When a user approves an action — merging a PR, sending an email, creating a Jira ticket, scheduling a meeting — FLOW executes it through the governed execution pipeline. No tab switching. No copy-pasting. The action completes inside FLOW.

The Execution Engine is the layer that makes this safe, auditable, and reversible where possible.

---

## Pipeline

Every action — regardless of source (recommendation, brain, command center, ActionCard, automation) — flows through this pipeline in order. No shortcuts exist.

```
1. Action Request
   Source: ActionCard click, slash command, automation trigger, brain response

2. Risk Classification
   riskClassifier.js evaluates the action
   Output: LOW | MEDIUM | HIGH | CRITICAL

3. Approval Gate (per risk tier)
   LOW:      Auto-proceed after user clicks primary button
   MEDIUM:   User sees confirmation dialog ("This will X. Confirm?")
   HIGH:     Requires 1× ADMIN or OWNER to approve
   CRITICAL: Requires 2× distinct ADMIN/OWNER approvers

4. Governance Evaluation
   permissionEvaluator.evaluateWithPolicies(context)
   Output: ALLOW | DENY | REQUIRE_APPROVAL
   If DENY: stop, log, surface error. Pipeline ends.
   If REQUIRE_APPROVAL: create PendingApproval, suspend pipeline.

5. Connector Execution
   executeAction(workspaceId, connectorId, actionType, params, actor)
   → Validates connector credentials
   → Calls provider API (GitHub, Gmail, Jira, etc.)
   → Receives provider response

6. Audit Persistence
   AuditLog record written to PostgreSQL
   Fields: workspaceId, connectorId, actionType, actor, outcome, approvalId, policyId

7. Event Publication
   CONNECTOR_ACTION_EXECUTED | CONNECTOR_ACTION_DENIED | CONNECTOR_APPROVAL_REQUIRED
   Published to Event Platform (flow_events table)

8. Timeline Update
   Action added to workspace action timeline
   WebSocket broadcast: ACTION_EXECUTED to workspace channel

9. Knowledge Graph Update
   For actions that create or modify entities (PR merge creates edge, issue creates node)
   Graph subscriber handles this — never done inline

10. Notification Dispatch
    notificationEngine.handleEvent()
    Targets: requester (success/failure), approvers (approval needed), affected parties

11. Inline Result
    UI component transitions to success/failure/pending state
    No page navigation required
```

---

## Risk Classification

Every action type has a default risk tier. Risk can be elevated by governance policy. Risk can never be downgraded by policy.

### Risk Tiers

| Tier | Approval required | Examples |
|---|---|---|
| LOW | User click (no confirmation) | Read ops, mark as read, view context, flag item |
| MEDIUM | User confirmation dialog | Send email, post Slack message, add comment, create draft |
| HIGH | 1× ADMIN/OWNER | Merge PR, create branch, update Jira status, schedule meeting |
| CRITICAL | 2× distinct ADMIN/OWNER | Delete repository data, revoke access, bulk data operations |

### Default Risk by Action Type

```js
// Engineering
LIST_REPOSITORIES:    LOW
GET_PULL_REQUEST:     LOW
CREATE_BRANCH:        HIGH
CREATE_PULL_REQUEST:  HIGH
APPROVE_PULL_REQUEST: HIGH
MERGE_PULL_REQUEST:   HIGH   // ← never MEDIUM, never LOW
CLOSE_PULL_REQUEST:   HIGH

// Communication
LIST_EMAILS:          LOW
READ_EMAIL:           LOW
SEND_EMAIL:           MEDIUM
REPLY_EMAIL:          MEDIUM
FORWARD_EMAIL:        MEDIUM
CREATE_DRAFT:         LOW

// Meetings
LIST_EVENTS:          LOW
GET_EVENT:            LOW
CREATE_EVENT:         MEDIUM
UPDATE_EVENT:         MEDIUM
DELETE_EVENT:         HIGH

// Work Management
LIST_ISSUES:          LOW
GET_ISSUE:            LOW
CREATE_ISSUE:         MEDIUM
UPDATE_ISSUE_STATUS:  HIGH
DELETE_ISSUE:         CRITICAL

// Knowledge
GET_PAGE:             LOW
CREATE_PAGE:          MEDIUM
UPDATE_PAGE:          MEDIUM
DELETE_PAGE:          CRITICAL
```

---

## Approval Engine

### Single Approver (HIGH risk)

When an action requires HIGH risk approval:

1. `approvalStore.createPendingApproval(action, actor, riskLevel: 'HIGH')` → creates `pending_approvals` record
2. Response to initiator: 403 + `{ approvalId }` + "Awaiting admin approval"
3. Notification dispatched to all workspace ADMINs and OWNERs
4. On approval: `approvalStore.approve(approvalId, approverId)` → pipeline resumes from step 5
5. On rejection: `approvalStore.reject(approvalId, approverId)` → pipeline ends, notification to initiator

**Self-approval guard:** The initiator cannot approve their own REQUIRE_APPROVAL action.

**Expiry:** Approval requests expire after 48 hours. Expired requests notify the initiator.

### Two-Person Approval (CRITICAL risk)

When an action requires CRITICAL risk approval:

1. Creates `pending_approvals` with `requiredApprovals: 2`, `approvalVotes: []`
2. First ADMIN approves → vote recorded, but action not yet executed
3. Notification dispatched: "1 of 2 approvals received. Waiting for second approver."
4. Second distinct ADMIN/OWNER approves → execution proceeds
5. Same person cannot be both approvers (distinct-approver guard)
6. Initiator cannot be either approver

### Approval States

```
PENDING   → created, waiting for approvers
APPROVED  → votes received, action executed (or queued for execution)
REJECTED  → explicitly rejected by an approver
EXPIRED   → 48h elapsed without resolution
```

All state transitions are atomic. Partial approval states are persisted. Server restart does not lose approval state.

---

## ExecutionRecord

Every action that reaches Step 5 (connector execution) creates a durable `ExecutionRecord` in PostgreSQL.

```prisma
model ExecutionRecord {
  id              String   @id @default(cuid())
  workspaceId     String
  connectorId     String
  actionType      String
  actor           String
  riskLevel       String   // LOW | MEDIUM | HIGH | CRITICAL
  outcome         String   // EXECUTED | FAILED | DENIED | APPROVAL_REQUIRED
  rollbackAvailable Boolean
  rollbackData    Json?
  approvalId      String?
  policyId        String?
  payload         Json     // action params (redacted sensitive values)
  result          Json?    // provider response summary
  error           String?
  createdAt       DateTime @default(now())
}
```

`rollbackAvailable` is set honestly. If the provider API does not support reversal, `rollbackAvailable: false`. FLOW never claims rollback is available when it is not.

---

## Rollback

Where the provider supports reversal, FLOW surfaces a "Undo" option in the success state of the ActionCard for 30 seconds after execution.

| Action | Rollback available | Rollback method |
|---|---|---|
| Send email | No | Email cannot be recalled |
| Create Jira issue | Yes (15s window) | Delete the created issue |
| Merge PR | No | Merge cannot be undone via API |
| Create event | Yes | Delete the created event |
| Post Slack message | Yes (limited) | Delete the message |
| Update PR status | Yes | Revert status |
| Create branch | Yes | Delete the branch |

For actions where rollback is not available, the success state says: "This action cannot be undone." No undo button appears.

---

## ActionCard UI States

### Default (pre-execution)

ActionCard shows situation, description, recommendation, action buttons. Risk badge visible for HIGH/CRITICAL.

### Confirming (MEDIUM risk)

After clicking primary button, a confirmation panel expands:
```
This will send an email to Sarah Chen with subject "Q3 Review".
[Confirm & Send]   [Cancel]
```

### Awaiting Approval (HIGH/CRITICAL)

After initiating a HIGH risk action:
```
Awaiting admin approval.
Requested: 2 minutes ago
Approval sent to: Alice R., Marcus T.
[View request]   [Cancel request]
```

### Executing (during Step 5)

```
[████████░░░░] Merging PR #447…
Connecting to GitHub…
```

### Success

```
✓ PR #447 merged. Release 2.5 is unblocked.
[View PR on GitHub ↗]   [Undo (28s)] ← if rollback available
```

Card collapses or moves to "Completed" section after 3 seconds.

### Failed

```
✗ Could not merge PR #447.
GitHub returned: "Branch protection rules require 2 approving reviews."

[Retry]   [Delegate to Alice]   [Ask FLOW for help]
```

### Denied (governance)

```
✗ Action denied.
AI Governance policy "No PR merges without 2 reviews" prevented this action.
Contact your workspace admin to adjust the policy.
```

---

## Audit Log

Every execution, denial, and approval event is persisted to the `AuditLog` table in PostgreSQL.

Fields:
- `workspaceId` — tenant isolation
- `connectorId` — which connector
- `actionType` — what action
- `actor` — who initiated
- `outcome` — EXECUTED / DENIED / APPROVAL_REQUIRED / FAILED
- `riskLevel` — LOW / MEDIUM / HIGH / CRITICAL
- `approvalId` — if approval was involved
- `policyId` — if a policy triggered the outcome
- `createdAt` — timestamp

The full audit log is viewable at `/settings/audit`. Role requirement: ADMIN or OWNER.

---

## Execution within Automation

When automation rules (Phase 7 `automationEngine.js`) trigger actions:
- The actor is fixed as `MEMBER` role — the automation cannot escalate its own privilege
- CRITICAL risk actions are never executable by automation — they always require human intervention
- `CONNECTOR_ACTION_EXECUTED` is never an automation trigger (prevents infinite loops)
- Every automation action flows through the full execution pipeline — governance is never bypassed

---

## Notification on Execution

The notification engine fires after every execution outcome:

| Event | Who is notified |
|---|---|
| Action executed (LOW) | Initiator (if they requested notification) |
| Action executed (MEDIUM/HIGH) | Initiator + action's affected parties |
| Action failed | Initiator |
| Approval required | All workspace ADMINs/OWNERs |
| Approval received | Initiator + remaining approvers |
| Approval rejected | Initiator |
| Approval expired | Initiator + workspace OWNERs |

Notifications are deduplicated over a 6-hour window per (workspace, user, action type) triplet.
