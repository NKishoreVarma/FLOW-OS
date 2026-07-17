# Execution Workflows

## Multi-step workflow execution

FLOW uses the Phase 14 Execution Engine for all side-effects. A multi-step workflow
is a `Plan` — an ordered list of steps that `executePlan()` runs fault-isolated:
the first failed/blocked step halts the plan and waits for human input.

## Risk tiers

| Tier | Gate | Who approves |
|------|------|-------------|
| LOW | Auto-run | Nobody |
| MEDIUM | Confirm | Requester confirms in FLOW |
| HIGH | 1 approval | Any ADMIN/OWNER |
| CRITICAL | 2 approvals | Two distinct ADMIN/OWNER users |

## Action Card → Execution flow

```
User clicks action button
  → executionApi.execute({ title, steps })
     → POST /api/execution/execute
        → buildPlan(body)
           → executePlan(workspaceId, plan, actor)
              → for each step: runStep() → classifyAction() → decideGate()
                 → if LOW: executeAction() immediately
                 → if MEDIUM: return CONFIRM_REQUIRED → user confirms → re-run
                 → if HIGH/CRITICAL: openApproval() → notify approvers → wait
```

## Built-in workflows

See `src/autonomous/workflowTemplates.js` for the full registry.
Add new workflows there — no other files need to change.

| workflowId | Risk | Description |
|-----------|------|-------------|
| `approve_action` | HIGH | Approve a pending governance action |
| `reject_action` | LOW | Reject a pending governance action |
| `dismiss` | LOW | Mark item as reviewed and dismiss |
| `navigate` | LOW | Navigate to the relevant FLOW page |
| `notify_team` | LOW | Send notification to team members |
| `escalate_to_council` | LOW | Open the Executive Council with this question |

## Audit trail

Every execution writes a durable `ExecutionRecord` in PostgreSQL via `src/execution/executionHistory.js`.
Every approval opens a `PendingApproval` row and notifies the relevant ADMIN/OWNER users.
All outcomes are broadcast as WebSocket events and appear in the Timeline at `/timeline`.
