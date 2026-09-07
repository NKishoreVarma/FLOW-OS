# FLOW OS — Pages
**Document:** 17 of 20  
**Status:** Authoritative  
**Last updated:** 2026-07-18

---

## Page Specification Format

Each page is specified with:
- **Purpose** — what question it answers
- **Primary Action** — the one thing the user does on this page
- **AI Role** — how FLOW's intelligence is used
- **Components** — list of components used (see `18_COMPONENT_LIBRARY.md`)
- **States** — empty / loading / error / success / live
- **Data Sources** — API endpoints

---

## Daily Work Pages

---

### Home — Decision Stream
**Route:** `/`  
**Component:** `MorningBriefing.jsx`  
**Purpose:** Answer "what do I need to do today?" in under 60 seconds.  
**Primary Action:** Act on the highest-urgency decision.

**Layout (top to bottom):**
```
ExecutiveHero               ← today's workspace status + most urgent item
DecisionCard (critical)     ← item 1: approve, delegate, or defer
DecisionCard (high)         ← item 2
DecisionCard (medium)       ← item 3
[above fold boundary]
Live Feed (filtered)        ← company-relevant WebSocket events
Department Signals Grid     ← 4 domain health cards (Engineering/Sales/HR/Finance)
StickyCommandCenter         ← fixed bottom
```

**AI Role:** Chief-of-staff service ranks items. WIC snapshot provides hero context. ActionCards suggest specific actions per item.

**Data Sources:**
- `GET /api/autonomous/chief-of-staff` → top 5 NOW items → top 3 shown
- `GET /api/workspace/snapshot` → ExecutiveHero status
- WebSocket events → live feed

**States:**
- Loading: skeleton for hero + 3 skeleton cards
- Empty: "Your workspace is clear. No decisions pending today." + 4 suggested brain prompts
- Error: Demo fallback (clearly labeled "Showing sample data")
- Live: WebSocket events update live feed without page refresh

---

### Operational Inbox — Unified Work Queue
**Route:** `/inbox`  
**Component:** `OperationalInbox.jsx`  
**Purpose:** Answer "what is waiting for me right now?"  
**Primary Action:** Process the highest-priority pending item.

**Layout:**
```
ExecutiveHero               ← "3 approvals · 1 conflict · 2 alerts"
Filter bar                  ← All | Approvals | Conflicts | Predictions | Meetings | Alerts
ActionCard list             ← ranked by urgency
  → SlideOver on click      ← DecisionSlideOver with full context + actions
InlineDiffModal             ← for merge conflict files
InlineMeetingPrep           ← for meeting items
SlackThreadPanel            ← for Slack-sourced items
StickyCommandCenter
```

**AI Role:** ActionCards are built by `actionCardService.buildActionCards()` which applies urgency scoring. AI recommends actions per card.

**Data Sources:**
- `GET /api/workday/queue` → priority-ranked work items
- `GET /api/approvals` → pending approvals
- `GET /api/collaboration/conflicts` → active merge conflicts
- `GET /api/notifications` → unread notifications
- `GET /api/predictions` → risk warnings
- `GET /api/meetings/upcoming?days=1` → today's meetings
- WebSocket: `NOTIFICATION_CREATED`, `INCIDENT_CREATED`, `RISK_DETECTED` → prepend to list

**States:**
- Loading: 3 skeleton cards
- Empty: "All caught up. Nothing requires your attention right now."
- Live: WebSocket events prepend new items in real time
- Filter active: shows count badge on active filter

---

### Engineering — Code and Deployment Intelligence
**Route:** `/projects`  
**Component:** `ProjectIntelligence.jsx`  
**Purpose:** Answer "what is blocking the release?"  
**Primary Action:** Review or approve the highest-risk PR or deployment.

**Layout:**
```
ExecutiveHero               ← "Release 2.5 at risk: 2 PRs blocked"
[GitHub connected]          ← if connected: live data
  Repository selector       ← dropdown or tabs
  PR list (sorted by risk)  ← mergeReadinessScore + risk badges
  Deployment list           ← riskScore per deployment
  [Not connected]           ← if GitHub not configured: connect prompt + demo data labeled
StickyCommandCenter
```

**AI Role:** `mergeReadinessScore` (0–100) computed per PR from: review state, merge conflicts, draft status, PR age. `riskScore` (0–100) computed per deployment from: environment type, deploy time, day of week.

**Data Sources:**
- `GET /api/engineering/repos` → repository list
- `GET /api/engineering/repos/:o/:r/pulls` → PR list per repo
- `GET /api/engineering/repos/:o/:r/deployments` → deployments
- `GET /api/workspace/snapshot` → engineering domain status

**States:**
- Not connected: "Connect GitHub to surface PR and deployment intelligence" + [Connect] button
- Loading: skeleton PR list
- Demo: hardcoded DEMO_PROJECTS with "Showing sample data" badge
- Live: refresh button available

---

### Meetings — Calendar Intelligence
**Route:** `/meetings`  
**Component:** `MeetingDashboard.jsx`  
**Purpose:** Answer "am I prepared for what's next?"  
**Primary Action:** Open meeting prep for the next upcoming meeting.

**Layout:**
```
ExecutiveHero               ← "Next: Daily Standup in 14 minutes"
Upcoming meetings list      ← sorted by start time
  [Prep] button per card    ← → /meetings/:id/prep
  [Join] button if within 5m ← Google Meet URL
Past meetings section       ← last 7 days
  [Summary] button per card ← → /meetings/:id/summary
[Not connected prompt]      ← if Calendar not configured
StickyCommandCenter
```

**AI Role:** Meeting prep at `/meetings/:id/prep` runs the full RAG pipeline against workspace memory using the meeting title + attendee names as context query.

**Sub-pages:**
- `/meetings/:id/prep` — AI context (RAG brief + related chunks + suggested questions + attendees + their recent PRs)
- `/meetings/:id/live` — real-time note capture + action item detection
- `/meetings/:id/summary` — post-meeting artifacts, save to calendar event

**Data Sources:**
- `GET /api/meetings/upcoming?days=7` → upcoming events
- `GET /api/meetings/past?days=7` → past events
- `GET /api/meetings/event/:id/context` → AI prep context

**States:**
- Not connected: connect prompt
- Empty (no meetings): "No meetings scheduled. [Create a meeting]"
- Within 5m of meeting: [Join now] button appears
- Demo fallback: DEMO_UPCOMING, DEMO_PAST, clearly labeled

---

### Knowledge — Organizational Graph
**Route:** `/knowledge`  
**Component:** `KnowledgeExplorer.jsx`  
**Purpose:** Answer "what do we know about X?"  
**Primary Action:** Search for an entity or ask a knowledge question.

**Layout:**
```
Search bar                  ← semantic search over workspace
Force-directed graph        ← real nodes and edges from /api/graph/*
  Node click                ← open Entity Workspace slide-over
  Hover                     ← node tooltip with entity summary
Panel: Entity detail        ← neighbors, events, decisions for selected node
StickyCommandCenter
```

**AI Role:** Knowledge search triggers semantic retrieval. Entity context panel uses `/api/brain/context/:entityId`.

**Critical note:** The current implementation uses hardcoded demo data. This must be replaced with real `/api/graph/*` calls. See `15_KNOWLEDGE_GRAPH.md` for required endpoints.

**Data Sources:**
- `GET /api/graph/nodes?limit=100` → node list for visualization
- `GET /api/graph/neighbors?nodeId=X` → expand a node
- `POST /api/graph/search?q=X` → search for entities
- `GET /api/brain/context/:entityId` → AI entity context

---

## Intelligence Pages

---

### Chief of Staff
**Route:** `/chief`  
**Component:** `ChiefOfStaff.jsx`  
**Purpose:** "What do I need to handle today, in order?"  
**Primary Action:** Act on the top NOW item.

**Layout:**
```
Greeting header             ← "Good morning, Rahul. Tuesday, July 18."
NOW section
  ActionCard (up to 5)
NEXT section
  ActionCard (up to 3)
LATER section
  ActionCard list (lower urgency)
StickyCommandCenter
```

See `09_CHIEF_OF_STAFF.md` for full specification.

**Data Sources:** `GET /api/autonomous/chief-of-staff`

---

### Weekly Review
**Route:** `/review`  
**Component:** `WeeklyReview.jsx`  
**Purpose:** "What happened this week and what's next week's biggest risk?"  
**Primary Action:** Identify and act on the top prediction.

**Layout:**
```
Engineering Velocity section
Execution Success section
Predictions for next week
Open Risks (RiskCards)
StickyCommandCenter
```

**Data Sources:** `GET /api/autonomous/weekly-review`

---

### AI Brain — Chief of Staff Console
**Route:** `/brain`  
**Component:** `BrainHome.jsx`  
**Purpose:** Ask FLOW anything. Get executive-grade answers.  
**Primary Action:** Ask a question or act on a suggested prompt.

**Pre-conversation state:**
```
ACTIVE CONTEXT
[Release 2.5]  [Backend Team]  [Sprint 18]   ← from WIC snapshot
[Acme Corp Renewal]

SUGGESTED
[What's blocking the release?]    [Who needs attention today?]
[Prepare my 2PM standup]          [Summarize yesterday's activity]
```

**Conversation state:**
```
User question
FLOW response (streaming):
  1. Executive Summary
  2. Key Insights
  3. Recommended Actions + ActionBar
  4. ▶ Show sources (collapsed)
  5. Related prompts
```

**Important behavior:**
- FLOW does NOT auto-send an opening message
- Context chips appear before first message
- Conversation persists across sessions (PostgreSQL)
- `sessionStorage.getItem('flow_pending_ask')` picked up on load from StickyCommandCenter navigation

**Sub-pages:**
- `/brain/history` — `BrainHistory.jsx` — list of all past conversations
- `/brain/memory` — `BrainMemory.jsx` — what FLOW knows (counts + breakdown + controls)
- `/brain/preferences` — `BrainPreferences.jsx` — tone, cadence, pinned prompts, memory controls

**Data Sources:**
- `POST /api/brain/copilot/stream` (SSE) → streaming response
- `POST /api/brain/copilot` → non-streaming fallback
- `GET /api/brain/conversations/latest` → last conversation
- `GET /api/workspace/snapshot` → context chips

---

### Executive Council
**Route:** `/council`  
**Component:** `ExecutiveCouncil.jsx`  
**Purpose:** Strategic multi-agent view of company health.  
**Primary Action:** Ask the council a strategic question.

**Layout:**
```
6 domain health cards (Engineering / Operations / Sales / HR / Security / Finance)
  Each card: status, score, top risk, recommended action
Ask the Council input
Council response:
  Agent responses (6)
  Debate panel (agreements + disagreements)
  Synthesis (one answer)
  Minority opinion (preserved if any agent dissented)
StickyCommandCenter
```

**Performance note:** Each Brain call is 28–30s. The council reuses the Brain, so live throughput is Brain-bound. Fastest agents answer in-window; slower ones drop gracefully. This is acknowledged and documented.

**Data Sources:**
- `GET /api/council/dashboard` → 6 domain health cards
- `POST /api/council/ask` → council debate + synthesis

---

### People — Workforce Intelligence
**Route:** `/people`  
**Component:** `WorkforceIntelligence.jsx`  
**Purpose:** "Who needs attention?"  
**Primary Action:** Identify and address the employee at highest risk.

**Layout:**
```
ExecutiveHero               ← "1 employee at burnout risk"
Risk-sorted employee cards
  Burnout risk score
  Context switch score
  Knowledge concentration risk
  Open PRs / workload
Individual employee detail panel
StickyCommandCenter
```

**Data Sources:**
- `GET /api/users` → employee list
- `GET /api/predictions/run?domain=people` → burnout + churn predictions
- Simulation integration: "What if X leaves?"

---

### Customer Intelligence
**Route:** `/customers`  
**Component:** `CustomerIntelligence.jsx`  
**Purpose:** "Which customer needs contact today?"  
**Primary Action:** Open the at-risk customer and initiate contact.

**Layout:**
```
ExecutiveHero               ← "1 renewal overdue · 2 escalations active"
Churn-risk sorted account cards
  Health score (0–100)
  Contract value
  Last interaction
  Open escalations
Account detail panel
  Contacts
  Timeline
  Opportunities
  AI health narrative
StickyCommandCenter
```

**Data Sources:**
- `GET /api/crm/accounts` → account list
- `GET /api/predictions/run?domain=customers` → churn predictions
- Demo fallback: rich Acme Corp + Globex Corp demo data

---

### Activity — Operational Timeline
**Route:** `/activity`  
**Component:** `ActivityFeed.jsx`  
**Purpose:** "What happened in the last 24 hours?"  
**Primary Action:** Filter by connector or event type.

**Layout:**
```
Timeline filter bar         ← by connector, event type, date range
Event list (reverse chronological)
  Each event: source icon, description, timestamp, actor
  Click → event detail slide-over
StickyCommandCenter
```

**Data Sources:** `GET /api/events/feed?workspaceId=X&since=Y`

---

## Platform Pages

---

### Trust Center
**Route:** `/integrations`  
**Component:** `TrustCenter.jsx`  
**Purpose:** "What is FLOW allowed to see?"  
**Primary Action:** Toggle resource inclusion for a connected connector.

See `10_TRUST_CENTER.md` for full specification.

---

### Admin — Organization Overview
**Route:** `/settings`  
**Component:** `EnterpriseAdmin.jsx`  
**Purpose:** Manage organization-level settings.  
**Primary Action:** Create a new workspace.

**Sections:** Org stats (orgs, workspaces, users) · Create workspace modal

---

### Users & Roles
**Route:** `/settings/iam`  
**Component:** `IdentityManagement.jsx`  
**Purpose:** Manage team members and their roles.  
**Primary Action:** Invite a new team member.

**Sections:** User list with role badges · Invite modal (email + role + fullName) · MFA/SCIM toggles

---

### AI Governance
**Route:** `/settings/governance`  
**Component:** `AIGovernance.jsx`  
**Purpose:** Control what FLOW is allowed to do.  
**Primary Action:** Create a new policy.

**Sections:** Active policies list (ALLOW/DENY/REQUIRE_APPROVAL) · Create policy form · Citation threshold · HITL toggle

**Data Sources:** `GET /api/policies`, `POST /api/policies`

---

### Audit Logs
**Route:** `/settings/audit`  
**Component:** `AuditCompliance.jsx`  
**Purpose:** Verify all AI actions are audited.  
**Primary Action:** Search or export audit log.

**Sections:** Event log with search (filter by outcome, connector, date) · Compliance report stubs (SOC2, ISO 27001, GDPR)

**Data Sources:** `GET /api/connectors/audit?limit=50`

---

### Security Center
**Route:** `/settings/security`  
**Component:** `SecurityCenter.jsx`  
**Purpose:** Review security-relevant events.  
**Primary Action:** Investigate a denied or flagged action.

**Sections:** Denied actions · Failed executions · Active Defenses (static) · Privacy Shield triggers

---

### Workspace Health
**Route:** `/settings/health`  
**Component:** `WorkspaceHealth.jsx`  
**Purpose:** Understand predicted risks across the workspace.  
**Primary Action:** Act on the highest-probability risk.

**Sections:** Risk timeline · Prediction cards (22 types) · Confidence indicators

**Data Sources:** `GET /api/predictions/run`, `GET /api/predictions/history`

---

### Import Dashboard
**Route:** `/settings/import`  
**Component:** `ImportDashboard.jsx`  
**Purpose:** Import or sync company data into FLOW.  
**Primary Action:** Initiate an import or sync operation.

**5-tab UI:** History · Import · Sync · Refresh · Validate  
**Data Sources:** `GET /api/lifecycle/history`, `POST /api/lifecycle/*`

---

## Onboarding Pages

---

### First-Run Flow
**Route:** `/welcome`  
**Component:** `FirstRunFlow.jsx`  
**Purpose:** Get from signup to first morning briefing.  
**Primary Action:** Complete each setup step.

**Steps:** Welcome → Discover → Permissions → Build → Ready  
**Gate:** `FirstRunGate.jsx` — fails open (never traps a session)  
**Demo co-primary:** demo mode seeds the Living Workspace Simulator

---

### Success Dashboard
**Route:** `/success`  
**Component:** `SuccessDashboard.jsx`  
**Purpose:** Prove FLOW's value to the organization.  
**Primary Action:** Share the ROI report with leadership.

**Sections:** Headline metrics (with measured/estimated basis badges) · Time Saved disclosure · Connector usage · "Load Demo Company" entry

**Data Sources:** `GET /api/success/summary`

---

## Error States (Global)

| Condition | Display |
|---|---|
| 401 Unauthorized | Redirect to login |
| 403 Forbidden | "You don't have access to this page. Contact your workspace admin." |
| 404 Not Found | "This page doesn't exist. [Go home]" |
| 500 Server Error | "Something went wrong. FLOW is still running — try refreshing." |
| Network offline | Offline banner: "FLOW is offline. Showing cached intelligence." |
| API timeout | Page-level: "Data is taking longer than expected. [Retry]" |
| All: dev-only pages in prod | 404 response — never expose dev tools in production |
