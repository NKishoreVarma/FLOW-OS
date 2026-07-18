# Approval Engine (Phase 14)

Risk-tiered, human-in-the-loop approval that sits **above** the existing governance
gate. Governance (`evaluateWithPolicies`) decides whether an action is permitted at all
and can `DENY` outright — that always wins. The Approval Engine decides *how many* and
*whose* approvals a permitted-but-risky action needs before it executes.

## Tiers

| Risk | Gate | Who |
|------|------|-----|
| LOW | `AUTO` | executes immediately |
| MEDIUM | `CONFIRM` | the requesting user confirms in FLOW (`confirmed:true`) |
| HIGH | `APPROVAL` (1) | one ADMIN/OWNER approves |
| CRITICAL | `APPROVAL` (2) | **two distinct** ADMIN/OWNER approve (two-person rule) |

`decideGate(level)` returns `{ gate, requiredApprovals, reason }`.

## Two-person / distinct-approver rule

`pending_approvals` gained additive columns: `risk_level`, `required_approvals` (2 for
CRITICAL), `approval_votes` (`[{ approverId, at }]`). A vote (`castApprovalVote`):

- rejects if the approval is not `PENDING` or is expired,
- rejects **self-approval** (requester can never approve their own request),
- rejects a **duplicate** vote from the same approver,
- appends the vote; when `approval_votes.length >= required_approvals` the record flips to
  `APPROVED` and the Coordinator executes the action with `approvedBy` set.

Only `ADMIN`/`OWNER` (workspace role) may vote — enforced in `approvalEngine.vote()`.

## Lifecycle

```
PENDING ──vote(s) reach required──▶ APPROVED ──executeApproved()──▶ EXECUTED
   │
   ├── reject() ─────────────────▶ REJECTED
   └── expiresAt (48h default) ──▶ EXPIRED
```

`executeApproved()` re-verifies the approval is `APPROVED` before running the recorded
action through the governed `executeAction()` pipeline (with `approvedBy` so governance
sees it as approved). The action is never executed twice.

## REST

Under `/api/execution/*` (see [`EXECUTION_ENGINE.md`](EXECUTION_ENGINE.md)):
`GET /approvals/:id`, `POST /approvals/:id/vote`, `POST /approvals/:id/reject`.
The Sprint-5.3 `/api/approvals/*` routes remain for the single-approver governance flow.

## Invariants

- Governance is never bypassed; a governance `DENY` always wins.
- The risk tier may only be **raised** by policy, never silently lowered.
- CRITICAL requires two **distinct** approver identities.
- The self-approval guard is enforced for every vote.

## Validation

`node scripts/validate-execution-engine.js` exercises: self-approval rejected, first
distinct vote leaves it PENDING, duplicate vote rejected, second distinct vote →
APPROVED, two approver ids recorded. **26/26** overall.
