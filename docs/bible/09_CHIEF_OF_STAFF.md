# FLOW OS — Chief of Staff
**Document:** 09 of 20  
**Status:** Authoritative  
**Last updated:** 2026-07-18

---

## Overview

The Chief of Staff is FLOW's flagship intelligence surface. It is not a page the user visits occasionally — it is the daily agenda. A senior executive should open `/chief` every morning before anything else.

The Chief of Staff answers one question: **what do you need to handle today, in order?**

---

## Mental Model

The Chief of Staff has already:
- Read all connected source data since the user last logged in
- Identified the items that require the user's attention specifically
- Prioritized them by urgency, business impact, and time sensitivity
- Prepared brief context for each
- Attached a concrete recommended action

The user arrives and sees the result. They do not configure it. They do not filter it. They act on it.

---

## Page: `/chief`

### Route and Component

- **Route:** `/chief`
- **Component:** `ChiefOfStaff.jsx`
- **Backend:** `GET /api/autonomous/chief-of-staff`
- **Sidebar label:** "Chief of Staff"
- **Sidebar icon:** Brain or Activity icon
- **Position in nav:** First item in INTELLIGENCE group

### Data Sources

The chief-of-staff API aggregates from:
- Pending approvals (from approval store)
- Active notifications (from notification engine)
- Workday engine priority queue (NOW items)
- Predictions above warning threshold
- Failed executions from last 24h
- Connector health warnings
- Detected incidents

These are ranked by a composite urgency score and returned as up to 5 NOW items, 3 NEXT items, and variable LATER items.

### Page Layout

```
[GREETING HEADER]
Good morning, Rahul. — Tuesday, July 18
─────────────────────────────────────────────────────────
HERE'S YOUR AGENDA
─────────────────────────────────────────────────────────
NOW
  [ActionCard 1]  ← highest urgency, critical or high
  [ActionCard 2]  ← high
  [ActionCard 3]  ← medium to high
  [ActionCard 4]  ← medium
  [ActionCard 5]  ← medium

NEXT (after you handle NOW)
  [ActionCard]
  [ActionCard]
  [ActionCard]

LATER (can wait until tomorrow)
  [ActionCard]   ...
```

### Greeting

The greeting is personalized:
- Uses first name from `localStorage.getItem('flow_user_name')` or email prefix
- Adapts by time of day: "Good morning" / "Good afternoon" / "Good evening"
- Current date displayed in natural format: "Tuesday, July 18"
- No auto-generated opening message beyond the greeting and date

### Section Headers

```
NOW                — items requiring action today
NEXT               — items that should be handled before end of week
LATER              — items that can wait, awareness only
```

The user does not configure these thresholds. They are determined by the urgency scoring in `chiefOfStaffService.js`.

---

## ActionCard — Decision Unit

Every item on the Chief of Staff page is an ActionCard. ActionCard is the atomic decision unit of FLOW.

### ActionCard Structure

```
┌────────────────────────────────────────────────────────────┐
│ [ICON] SITUATION TITLE                         [CRITICAL] │
│ Source: GitHub PR #447                   22 minutes ago   │
│                                                            │
│ PR #447 is blocking 3 engineers on the Release 2.5 cut.   │
│ The PR has been waiting for review for 2 days. All        │
│ automated checks have passed.                              │
│                                                            │
│ RECOMMENDED                                                │
│ Approve this PR and unblock the engineering team.         │
│                                                            │
│ [Approve Now]          [Delegate to Alice]   [More ▾]    │
└────────────────────────────────────────────────────────────┘
```

### ActionCard Fields

| Field | Description |
|---|---|
| `type` | Card type: `approval`, `merge_conflict`, `prediction`, `notification`, `recommendation`, `incident`, `meeting` |
| `source` | Source system: "GitHub", "Jira", "Slack", etc. |
| `sourceIcon` | Connector icon |
| `title` | Situation in 5–8 words |
| `description` | 2–3 sentence context |
| `recommendation` | 1 sentence: what to do |
| `impact` | `critical` / `high` / `medium` / `low` |
| `impactLabel` | "Blocks 3 engineers, delayed 18h" |
| `primaryAction` | Label + workflowId + risk level |
| `secondaryActions` | Array of additional options |
| `evidence` | Collapsed evidence list (source, text, timestamp) |
| `createdAt` | ISO timestamp |
| `workItem` | Original work item reference |

### ActionCard States

**Default:** shows title, description, recommendation, action buttons, impact badge.

**Executing:** primary button shows spinner, all buttons disabled.

**Success:** card transitions to a success state: "Approved. PR #447 is now unblocked." Collapses after 2 seconds.

**Failed:** inline error: "Could not execute. [Error reason]. Try again or delegate."

**Requires approval:** If action is HIGH risk and user is not ADMIN: "This requires approval from an admin. [Request approval]"

### Multi-Option Actions

Complex ActionCards offer multiple primary options with risk badges:

```
[Merge via squash]    LOW RISK
[Merge via rebase]    MEDIUM RISK
[Request changes]     LOW RISK
[Close PR]            HIGH RISK  ← requires ADMIN
```

---

## Morning Briefing (Homepage Decision Stream)

The homepage (`/`) is not identical to Chief of Staff. It is a subset, above-the-fold, with three decisions.

**Homepage vs Chief of Staff:**
- Homepage: top 3 decisions from WIC + chief-of-staff API, very brief
- Chief of Staff: full NOW/NEXT/LATER agenda, more context per card

The homepage Decision Stream sources from the same chief-of-staff API endpoint but renders fewer cards with less context. Users who want the full picture navigate to `/chief`.

---

## Weekly Review

### Route and Component

- **Route:** `/review`
- **Component:** `WeeklyReview.jsx`
- **Backend:** `GET /api/autonomous/weekly-review`
- **Sidebar label:** "Weekly Review"
- **Position in nav:** Second item in INTELLIGENCE group (below Chief of Staff)

### Purpose

The Weekly Review answers: **what happened this week, and what is next week's biggest risk?**

It is a retrospective surface, not a real-time surface. It is designed to be reviewed on Friday afternoons or Monday mornings.

### Sections

```
ENGINEERING VELOCITY
  Commits: 47 this week  (+12% vs last week)
  PRs merged: 8  (avg 1.4 days to merge)
  Deployments: 3  (1 to production, 2 to staging)
  Open PRs: 12  (3 >72h old)

EXECUTION SUCCESS
  Actions completed: 23
  Approvals resolved: 7 of 9 (2 still pending)
  Workflows started: 4
  Time saved estimate: ~4.2 hours

PREDICTIONS FOR NEXT WEEK
  Sprint delay: 83% likely  (based on 3 overdue PRs + 2 unassigned tasks)
  Burnout risk: 1 engineer at high risk
  Customer churn: 1 account at elevated risk (Acme Corp)

OPEN RISKS
  [RiskCard]  Auth service PR overdue → blocking Release 2.5
  [RiskCard]  No backup owner for payment service
  [RiskCard]  Customer escalation unresolved >48h
```

### Weekly Review Data Sources

| Section | API |
|---|---|
| Engineering Velocity | `/api/autonomous/weekly-review` |
| Execution Success | execution_records count queries |
| Predictions | `/api/predictions/run` |
| Open Risks | Top items from `/api/autonomous/chief-of-staff` (LATER + NEXT items) |

---

## Executive Summaries

At any time, a user can ask the Chief of Staff for an executive summary of a specific domain:

- `/brain`: "Give me an executive summary of engineering health"
- `/chief` → "Summarize my week" button
- CommandCenter: "/summarize this week"

These trigger the full reasoning pipeline (Router → Retrieval → Critic → Synthesis) and return a structured Markdown brief.

---

## Recommendations Engine

The Recommendation Engine powers the Decision Stream on the homepage and feeds the Chief of Staff. It scores work items from multiple signals:

### Scoring factors

1. **Urgency** — time-sensitive signals: open approvals, impending deadlines, blocking dependencies
2. **Business impact** — scope of affected people, systems, or customers
3. **Authority authority** — items from high-authority sources (GitHub > Slack) rank higher
4. **Prediction signal** — predicted risks surface before they become incidents
5. **Memory signal** — items similar to previously acted-on items rank higher
6. **User pattern** — items the user typically handles in the morning rank higher in the morning

### Score computation

```
composite = (urgency × 0.35) + (businessImpact × 0.30) + (authorityWeight × 0.15) + (predictionSignal × 0.10) + (memorySignal × 0.10)
```

Items above 0.7 composite → NOW.  
Items 0.4–0.7 → NEXT.  
Items below 0.4 → LATER.  
Items below 0.15 → omitted.

---

## Chief of Staff Tone

The Chief of Staff speaks differently from the general Brain conversation. It is more structured, more directive.

**Always uses section headers (NOW / NEXT / LATER)**  
**Always names the person responsible for the recommended action**  
**Always states the consequence of inaction**  
**Never asks clarifying questions** — it has already read everything  
**Never hedges** — "PR #447 is blocking the release" not "PR #447 might be related to potential release delays"  

Example greeting (daily, not auto-sent — displayed as header text, not as a chat message):

> Good morning, Rahul. Tuesday, July 18.
> You have 5 items requiring attention. One is blocking a release.
