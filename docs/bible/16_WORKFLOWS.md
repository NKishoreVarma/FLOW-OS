# FLOW OS — Workflows
**Document:** 16 of 20  
**Status:** Authoritative  
**Last updated:** 2026-07-18

---

## Overview

Workflows are the end-to-end operational sequences that FLOW enables. They are not features — they are the reason features exist. Every workflow maps to a real thing an executive, manager, or engineer does every day.

Each workflow shows:
1. The problem it solves
2. The FLOW surfaces involved
3. The step-by-step experience
4. The APIs called
5. The outcome

---

## Workflow 1: Morning Executive Briefing

**Persona:** CTO, VP Engineering, COO  
**Frequency:** Daily  
**Time budget:** 10 minutes  
**Problem:** Starting the day means triaging 300+ Slack messages, 40+ emails, 12+ GitHub notifications. This takes 45–90 minutes.

### FLOW Experience

```
7:45 AM — User opens FLOW → Home (/)

Step 1: Decision Stream (above fold)
  FLOW shows 3 items in order of urgency:
  ① PR #447 blocking 3 engineers — [Approve Now] or [Delegate]
  ② Production deploy risk: Friday 5PM window identified — [Defer to Monday] or [Proceed]
  ③ Customer Acme Corp: renewal call in 4h — [View prep]
  
  Total context needed: 90 seconds of reading.

Step 2: Act on item ①
  User clicks "Approve Now"
  Risk classification: HIGH → requires ADMIN confirmation
  User is ADMIN → single-step confirm dialog appears
  User confirms → PR #447 approved via GitHub API
  Success state appears inline: "✓ PR #447 approved. Engineering team unblocked."
  
Step 3: Act on item ②
  User clicks "Defer to Monday"
  ActionCard marks deployment as deferred
  Notification sent to engineering team
  
Step 4: Act on item ③
  User clicks "View prep"
  SlideOver opens: Acme Corp renewal context
  Shows: contract value, last interaction, open issues, sentiment signals
  [View full prep] → navigates to /meetings/:id/prep

Step 5: Brain check-in (optional)
  User types in Command Center: "What else should I know before standup?"
  Navigates to /brain with pre-loaded question
  Response streams: engineering velocity, team blockers, open risks
```

**APIs involved:**
- `GET /api/autonomous/chief-of-staff` → Decision Stream items
- `GET /api/workspace/snapshot` → ExecutiveHero domain status
- `POST /api/execution/execute` → PR approval
- `GET /api/meetings/event/:id/context` → Meeting prep

---

## Workflow 2: Engineering Standup Preparation

**Persona:** Engineering Manager, Tech Lead  
**Frequency:** Daily (before standup)  
**Time budget:** 5 minutes  
**Problem:** Standup requires knowing: what everyone shipped yesterday, what's blocked, what's at risk.

### FLOW Experience

```
9:55 AM — User opens /meetings

Step 1: Meeting Dashboard Hero
  "Daily Standup in 5 minutes"
  "3 action items from last standup outstanding"
  [View prep] — primary action button
  
Step 2: Meeting Prep (/meetings/:id/prep)
  FLOW shows:
  - Attendees and their current PRs / recent commits
  - Action items from last standup (marked completed / still open)
  - Blockers detected this week (from Jira + GitHub signals)
  - AI brief: "Engineering velocity is 12% below last week. Main blocker: auth service PR."

Step 3: Notes during standup (/meetings/:id/live)
  User captures notes inline
  Action items detected automatically from text ("Alice will review X")
  
Step 4: Post-standup (/meetings/:id/summary)
  Action items listed with owners and deadlines
  [Save action items to calendar event] → stored in Google Calendar extendedProperties
  [Create Jira issues for blockers] → dispatches CREATE_ISSUE actions
```

**APIs involved:**
- `GET /api/meetings/upcoming` → meeting list
- `GET /api/meetings/event/:id/context` → AI prep context
- `POST /api/meetings/event/:id/notes` → live notes
- `POST /api/meetings/event/:id/actions` → action items
- `POST /api/execution/execute` with `CREATE_JIRA_ISSUE` → create Jira issues

---

## Workflow 3: PR Review and Merge Decision

**Persona:** Engineering Manager, Senior Engineer  
**Frequency:** Multiple times daily  
**Time budget:** 3–10 minutes per PR  
**Problem:** PR review requires: reading the diff, understanding the context, knowing who else reviewed it, assessing merge risk.

### FLOW Experience

```
Step 1: PR surfaces in Decision Stream or /inbox
  "PR #447 from Rahul: auth service migration"
  mergeReadinessScore: 78/100
  Risk: MEDIUM (no conflicts, 1 of 2 required reviews)
  
Step 2: Click ActionCard
  SlideOver opens:
  - Situation: "Auth service migration PR. Waiting on 1 more review. All CI checks passed."
  - Reviewer: Alice R. has not reviewed (she reviewed similar PRs in the last sprint)
  - Evidence: linked Jira issue, 3 commits, files changed
  - Recommended action: "Request review from Alice R. — she owns this service."
  
Step 3: Action options
  [Request Review from Alice]  → LOW risk, executes immediately
  [Approve PR]                 → HIGH risk, requires ADMIN confirmation
  [View full diff]             → opens GitHub PR in new tab
  [Ask FLOW about this PR]     → opens brain with PR context pre-loaded

Step 4: If approved
  Merge method dialog (squash / merge / rebase)
  Risk level increases to HIGH for merge
  ADMIN confirms → GitHub MERGE_PULL_REQUEST action fires
  Success: "PR #447 merged. Release 2.5 can now proceed."
  
  Knowledge Graph updated: authored_by edge (Rahul → PR), resolved edge (PR → Jira issue)
```

**APIs involved:**
- `GET /api/engineering/repos/:owner/:repo/pulls/:number` → PR detail + mergeReadinessScore
- `GET /api/engineering/repos/:owner/:repo/pulls/:number/reviews` → reviewer workload
- `POST /api/engineering/repos/:owner/:repo/pulls/:number/approve` → request review
- `POST /api/engineering/repos/:owner/:repo/pulls/:number/merge` → merge

---

## Workflow 4: Customer Escalation Response

**Persona:** Sales Leader, Customer Success Manager  
**Frequency:** As needed  
**Time budget:** 15 minutes  
**Problem:** Customer escalation arrives in email. Requires: understanding history, coordinating with engineering, drafting response.

### FLOW Experience

```
Step 1: Notification received
  Toast: "New customer escalation: Acme Corp"
  Notification in NotificationDropdown: "Acme Corp opened escalation re: API latency"
  ActionCard in /inbox: CUSTOMER_ESCALATION type

Step 2: Escalation context in /inbox
  ActionCard shows:
  - Situation: "Acme Corp reporting API latency >3s for 4 hours. SLA breach at 4h."
  - Last interaction: 12 days ago (review call, positive)
  - Contract value: $240K ARR
  - Open issues: 2 (one >30 days)
  - Related incidents: auth service incident 6 days ago

Step 3: Investigation
  User clicks "Ask FLOW about Acme"
  Brain response: "Acme's latency issue correlates with the auth service deployment from Tuesday. 
  Three other customers show the same pattern. Engineering is aware."
  
Step 4: Coordinate response
  User clicks "Draft response email"
  Command Center inline: composes draft
  "Thank you for reaching out. Our engineering team has identified the root cause..."
  [Send via Gmail]  → MEDIUM risk, user confirms
  [Save as draft]   → LOW risk, auto-executes

Step 5: Escalation resolved
  User marks escalation resolved in Jira
  Knowledge Graph: ESCALATED_TO edge (Acme → User), RESOLVES edge (PR → Issue)
```

---

## Workflow 5: Merge Conflict Resolution

**Persona:** Engineer, Tech Lead  
**Frequency:** Multiple times weekly  
**Problem:** Two engineers modified the same file. The conflict is blocking a release.

### FLOW Experience

```
Step 1: MergeConflictCard in /inbox
  "Conflict in auth.js between Rahul K. and Alice R."
  "This is blocking 2 engineers and delaying Release 2.5"
  Conflict detected by mergeConflictDetector.js (polls on sync and on view)

Step 2: MergeConflictCard detail
  Files: auth.js (14 conflicts), utils/session.js (2 conflicts)
  Owners: Rahul K. (auth.js owner) + Alice R. (co-author last 30 days)
  Unrelated people excluded from the conflict card
  
  Actions:
  [Open Diff]        → GitHub PR comparison URL
  [Open PR]          → GitHub PR
  [Message Rahul]    → Inline compose: "Hey Rahul, I see there's a conflict in auth.js..."
  [Create Meeting]   → Calendar create event with Rahul + Alice as attendees

Step 3: Resolution
  Engineers resolve conflict off-platform
  Conflict re-check on next sync → conflict resolved → card auto-removes from inbox
```

---

## Workflow 6: Governance Approval

**Persona:** ADMIN, OWNER  
**Frequency:** As needed  
**Problem:** A team member has requested a HIGH risk action that requires approval.

### FLOW Experience

```
Step 1: Notification received
  Toast: "Approval requested: Merge PR #523 to production branch"
  Notification: "Rahul requested approval for production merge"
  ActionCard in /inbox: APPROVAL_REQUIRED type

Step 2: Review in /inbox
  ActionCard shows:
  - Action: Merge PR #523 (database schema migration)
  - Requested by: Rahul K.
  - Risk level: HIGH
  - Reason: Direct merge to production branch
  - Evidence: PR details, CI status, review count
  - Policy triggered: "Production merges require ADMIN approval"

Step 3: Approve or reject
  [Approve]  → Risk HIGH, this user is ADMIN → executes immediately
  [Reject]   → Initiator receives rejection notification with reason
  
  If [Approve]:
  - PendingApproval record updated to APPROVED
  - executeAction() resumes → PR merged
  - Audit log updated
  - Notification to Rahul: "Your merge request was approved. PR #523 has been merged."
```

---

## Workflow 7: What-If Strategic Analysis

**Persona:** CTO, VP Engineering  
**Frequency:** Weekly / as needed  
**Problem:** "What happens if Rahul leaves? What is at risk?"

### FLOW Experience

```
Step 1: Ask in Command Center
  User types: "What if Rahul leaves?"
  Routes to /brain with pre-loaded question

Step 2: Simulation initiated
  Brain recognizes EMPLOYEE_DEPARTURE scenario
  Delegates to Simulation Engine (src/simulation/)
  
Step 3: Results (in brain response)
  Executive Summary:
  "If Rahul leaves, 8 repositories lose their primary owner. 
  The auth service would have no designated maintainer."
  
  Key Insights:
  • 8 repositories owned by Rahul
  • Bus-factor: 3 services have no knowledge backup  
  • Estimated replacement time: 8–12 weeks
  • Financial estimate: ~$320K (heuristic: 2× annual salary for replacement)
  
  Recommended Actions:
  [Start knowledge transfer plan]  → create Jira issue
  [Schedule cross-training]        → create calendar events
  [Document service ownership]     → open Notion page

Step 4: Save to decision memory
  The simulation is stored as MemoryRecordType.SIMULATION
  Future "what if" questions about Rahul reference this analysis
```

---

## Workflow 8: Incident Response

**Persona:** On-call Engineer, Engineering Manager  
**Frequency:** As needed  
**Problem:** Production incident detected. Need fast context and action.

### FLOW Experience

```
Step 1: INCIDENT_CREATED WebSocket event
  Toast: "⚠ New incident: auth service latency spike"
  ActionCard in /inbox: INCIDENT type
  Live feed panel shows incident event in real time

Step 2: Incident context
  ActionCard shows:
  - Situation: "Auth service latency spike detected. P99 > 4s. Started 7 minutes ago."
  - Correlation: "Last deployment was 2h ago (PR #447, merged by Rahul)"
  - Affected users: 3 customers
  - Related incidents: Similar spike in March (resolved via DB connection pool increase)
  
  Actions:
  [Start incident response]  → Creates Jira incident ticket
  [Alert on-call]            → Notification to on-call engineer
  [Rollback deployment]      → If rollbackAvailable: true on ExecutionRecord

Step 3: Resolution
  When incident resolved → Decision Memory record created
  Knowledge Graph: CAUSED edge (Deployment → Incident), RESOLVES edge (PR → Incident)
  Postmortem automatically drafted from incident timeline
```

---

## Workflow 9: Weekly Executive Review

**Persona:** CTO, CEO  
**Frequency:** Weekly (Fridays)  
**Time budget:** 15 minutes  

### FLOW Experience

```
Step 1: /review page
  Weekly Review loads: velocity, execution, risks, predictions
  
  Engineering Velocity:
  - 47 commits, 8 PRs merged, 3 deployments
  - Open PRs: 12 (3 aged >72h — needs attention)
  
  Execution:
  - 23 actions completed, 4.2h saved
  
  Top 3 risks next week:
  1. Sprint delay: 83% probability — 3 overdue PRs
  2. Knowledge loss: Rahul's vacation next week (auth service unowned)
  3. Customer churn: Acme Corp renewal overdue

Step 2: Ask the Executive Council for strategic view
  User clicks "Ask Council" or navigates to /council
  Asks: "What's our biggest Q3 risk?"
  6 agents analyze in parallel → debate → synthesis
  Response: structured multi-agent answer with dissenting minority opinion preserved

Step 3: Action
  User creates a goal from the top risk
  Goal: "Reduce PR age to <48h average" with milestone
  Stored in GoalTracking service (/api/brain/goals)
```

---

## Workflow 10: Onboarding a New Employee

**Persona:** HR Manager, Engineering Manager  
**Frequency:** As needed  

### FLOW Experience

```
Step 1: Chief of Staff surfaces new employee
  Decision Stream: "Alex R. starts Monday. 3 onboarding tasks pending."
  ActionCard type: ONBOARDING

Step 2: Actions
  [Create onboarding Jira issue]    → CREATE_JIRA_ISSUE with template
  [Schedule intro meetings]          → Create calendar events with team leads
  [Send welcome email]               → Draft welcome email
  [Grant tool access]                → Notify IT (Slack message or email)

Step 3: Progress tracking
  Jira issue tracks onboarding checklist
  FLOW surfaces the issue in Engineering page under "Alex R."
  Manager receives notification when checklist is complete
```
