# FLOW OS — Information Architecture
**Document:** 04 of 20  
**Status:** Authoritative  
**Last updated:** 2026-07-18

---

## Overview

FLOW's information architecture organizes every feature into four semantic layers:

1. **Daily Work** — surfaces for daily operational decisions (Home, Inbox, Engineering, Meetings, Knowledge)
2. **Intelligence** — AI-driven views that require reasoning across data (Chief of Staff, Weekly Review, People, Customers, Council)
3. **Platform** — configuration and governance of what FLOW can see and do (Integrations, Workspace, AI, System)
4. **Foundation** — backend systems that power all layers (connectors, event pipeline, graph, memory, execution)

Every page exists in exactly one layer. Navigation exposes all four layers.

---

## Complete Site Map

### Layer 1: Daily Work

```
/                   Home — Decision Stream
  Primary action:   Act on today's top decision
  Data sources:     /api/autonomous/chief-of-staff + /api/workspace/snapshot
  Sections:         ExecutiveHero → DecisionStream (top 3) → LiveFeed → Dept Signals (below fold)
  
/inbox              Operational Inbox — Unified Work Queue
  Primary action:   Process the highest-priority pending item
  Data sources:     Approvals + Merge Conflicts + Notifications + Recommendations + Workday
  Sections:         Hero → Filtered list (All / Approvals / Conflicts / Predictions / Meetings / Alerts)
  
/projects           Engineering — Code & Deployment Intelligence
  Primary action:   Review or approve the highest-risk PR or deployment
  Data sources:     /api/engineering/* (GitHub) + /api/workspace/snapshot (engineering domain)
  Sections:         Hero (release risk) → PR list → Deployment list → Repository overview
  
/meetings           Meetings — Calendar Intelligence
  Primary action:   Prepare for the next meeting
  Data sources:     /api/meetings/* (Google Calendar)
  Sections:         Hero (next meeting + countdown) → Upcoming → Past → Live meeting
  /meetings/:id/prep      Meeting Preparation — AI context for an event
  /meetings/:id/live      Live Meeting — real-time notes and action capture
  /meetings/:id/summary   Meeting Summary — post-meeting artifacts
  
/knowledge          Knowledge — Organizational Graph
  Primary action:   Explore a specific entity or answer a knowledge question
  Data sources:     /api/graph/* + pgvector RAG
  Sections:         Search → Force-directed graph visualization → Entity detail panel
```

### Layer 2: Intelligence

```
/chief              Chief of Staff — AI Daily Agenda
  Primary action:   Act on the top NOW item
  Data sources:     /api/autonomous/chief-of-staff + workday queue
  Sections:         Greeting → NOW items (top 5, ActionCards) → NEXT (3 items) → LATER

/review             Weekly Review — Velocity and Risk
  Primary action:   Identify the one risk to address before Friday
  Data sources:     /api/autonomous/weekly-review
  Sections:         Engineering velocity → Execution success rate → Emerging risks → Predictions

/activity           Activity — Operational Timeline
  Primary action:   Understand what changed in the last 24h
  Data sources:     /api/events/* 
  Sections:         Timeline feed → Filter by connector / event type / date
  
/brain              AI Brain — Chief of Staff Console
  Primary action:   Ask FLOW anything
  Data sources:     /api/brain/copilot/stream (SSE)
  Sections:         Context chips → Suggested prompts → Conversation (persistent)
  /brain/history    Conversation History — all past sessions
  /brain/memory     AI Memory — what FLOW has learned about this workspace
  /brain/preferences  AI Preferences — tone, briefing cadence, memory retention
  
/council            Executive Council — 6-Agent Strategic View
  Primary action:   Ask the council a strategic question
  Data sources:     /api/council/*
  Sections:         6 domain health cards → Ask the Council → Debate panel

/people             People Intelligence — Workforce View
  Primary action:   Identify who needs attention today
  Data sources:     /api/users/* + predictions (burnout, bus-factor)
  Sections:         Risk-sorted employee cards → Individual detail → Team health signals

/customers          Customer Intelligence
  Primary action:   Identify which customer needs contact today
  Data sources:     /api/crm/* + predictions (churn, expansion)
  Sections:         Churn-risk sorted accounts → Account detail → Timeline → Contacts
  
/success            Value Dashboard — ROI and Impact
  Primary action:   Understand FLOW's measured value to the organization
  Data sources:     /api/success/*
  Sections:         Headline metrics → Breakdown (measured vs estimated) → Connector usage
```

### Layer 3: Platform

```
/integrations         Trust Center — Connected Sources and Permissions
  Primary action:     Add or configure a connector
  Sections:           Connection overview (6 governed connectors) → Per-connector resource panel
  /integrations/trust    Same page, Trust tab active — see what FLOW can and cannot see
  /integrations/sync     Sync Status — when each connector last synced + health
  
/settings               Admin — Organization Overview  
  Primary action:     Manage organization settings
  /settings/iam          Identity Management — users, roles, invitations
  /settings/workspaces   Workspace Management — create, clone, configure workspaces
  /settings/team         Team Invite — invite new members with role selection
  
/settings/governance    AI Governance — Policy Management
  Primary action:     Create or toggle a governance policy
  Sections:           Active policies → Create policy → Effect (ALLOW/DENY/REQUIRE_APPROVAL)

/settings/security      Security Center — Governance Audit
  Primary action:     Review denied or flagged connector actions
  Sections:           Security events → Denied actions → Active defenses

/settings/audit         Audit Compliance — Full Audit Log
  Primary action:     Export audit log or review specific events
  Sections:           Event log with search → Compliance report stubs (SOC2, ISO27001, GDPR)

/settings/health        Workspace Health — Predictions and Risk
  Primary action:     Identify the highest-risk upcoming event
  Sections:           Risk predictions → Workspace health score → Domain breakdown

/settings/import        Import Dashboard — Workspace Lifecycle
  Primary action:     Import or sync company data
  Sections:           5-tab UI (History / Import / Sync / Refresh / Validate)
  
/settings/api-keys      API Keys — Programmatic Access
  Primary action:     Create a new API key
  Sections:           Active keys → Create key → Scope selection

/settings/billing       Billing — Plan and Usage
  Primary action:     Upgrade plan or view usage
  Sections:           Current plan → Usage metrics → Upgrade options

/settings/marketplace   Marketplace — Additional Connectors
  Primary action:     Browse available connectors
  Sections:           Available connectors → Coming soon

/welcome                Onboarding — First-Run Flow
  Primary action:     Complete setup to reach Morning Brief
  Sections:           Welcome → Discover → Permissions → Build → Ready
```

### Layer 4: Foundation (Backend, Not Pages)

```
/api/brain/*            Reasoning, briefing, copilot, decisions, automations, goals, memory, graph
/api/council/*          6-agent executive council
/api/autonomous/*       Chief of Staff, Weekly Review, Action Cards, Workflow Templates
/api/workspace/*        Workspace Intelligence Cache (instant snapshot)
/api/workday/*          Workday Engine (priority queue)
/api/connectors/*       Connector Registry, execution, search, health, audit, timeline
/api/execution/*        Risk-tiered action execution, approval workflows
/api/integration-permissions/*  Per-resource governance (Trust Center backend)
/api/events/*           Unified Event Platform
/api/graph/*            Operational Graph Engine (Digital Twin)
/api/predictions/*      Predictive Intelligence
/api/simulation/*       What-If Simulation Engine
/api/replay/*           Workspace Replay (DVR)
/api/lifecycle/*        Workspace Lifecycle Engine (Create/Import/Sync/Refresh/Validate)
/api/onboarding/*       Onboarding state and discovery
/api/success/*          Value and ROI metrics
/api/engineering/*      Engineering Capability (GitHub)
/api/meetings/*         Meeting Capability (Google Calendar)
/api/communication/*    Communication Capability (Gmail)
/api/collaboration/*    Merge conflict detection, ownership analysis
/api/notifications/*    Notification delivery and targeting
/api/policies/*         Governance policy CRUD
/api/approvals/*        Approval lifecycle management
/api/orgs/*             Organization management
/api/users/*            User management
/api/auth/*             Authentication (signup, login)
```

---

## Feature Grouping Rationale

### Why Integrations is a primary destination (not buried in Settings)

Integration Permissions (the Trust Center) is the most important product feature for enterprise trust. A user who does not know what FLOW can and cannot read cannot trust the system. Burying it in settings is product failure. It gets a primary route: `/integrations`.

### Why Chief of Staff and Weekly Review are in Intelligence, not Home

The Home page is the Decision Stream — the highest-priority 3 decisions right now. Chief of Staff at `/chief` is the full NOW/NEXT/LATER agenda. Weekly Review at `/review` is the weekly velocity view. These are deeper surfaces for users who want more context. They should be adjacent to Home in the sidebar (Intelligence group, right after Primary group), not identical to it.

### Why People and Customers are in Intelligence, not Company

People Intelligence and Customer Intelligence are not org charts. They are risk-scored, AI-interpreted views of your workforce and customers. They belong in the Intelligence layer alongside Chief of Staff and Council, not in a "Company" administrative section.

### Why Knowledge is in Daily Work, not Intelligence

Knowledge is where engineers and researchers go to search for specific answers — "what decision did we make about the database schema?" This is a daily work surface, not an AI-driven insight surface. The force-directed graph is a tool, not an insight. It belongs in Daily Work alongside Engineering and Meetings.

---

## Hierarchy of Disclosure

Information in FLOW is always disclosed in this order:

1. **Conclusion** — what it means (one sentence)
2. **Recommendation** — what to do (one sentence + action button)
3. **Context** — why this matters (2–3 sentences)
4. **Evidence** — where this comes from (collapsed by default, expandable)
5. **Detail** — full data if needed (SlideOver or linked page)

No page shows evidence before conclusion. No page shows detail before recommendation. The user decides how deep to go.

---

## Page Anatomy (Universal)

Every non-administrative page follows this layout from top to bottom:

```
ExecutiveHero         — situation + priority + primary action button
DecisionStream/List   — the ranked list of items on this page
Content Area          — expanded view of selected item (or default state)
StickyCommandCenter   — always visible, always available
```

Administrative pages (settings, governance, IAM, billing) are exempt from the hero requirement but must still have a clear primary action above the fold.

---

## Empty States

Every page has an intentional, instructive empty state. No page shows a blank area.

| Page | Empty State |
|---|---|
| Home | "No decisions pending. Your workspace is clear." + suggested brain prompts |
| Inbox | "All caught up. Nothing requires your attention." |
| Engineering | "Connect GitHub to surface PR and deployment intelligence." |
| Meetings | "Connect Google Calendar to see your schedule." |
| Knowledge | "Start ingesting data to build your knowledge graph." |
| Chief of Staff | "No items surfaced. Ask FLOW what's on your agenda." |
| People | "No employee signals available. Connect HR systems to get started." |
| Customers | "Connect HubSpot or Salesforce to surface customer intelligence." |
| /brain | Context chips + 4 suggested prompts. Never an empty chat box. |

---

## Loading States

Every page loads in three phases:

1. **Instant skeleton** — layout is visible immediately. Correct dimensions. No content.
2. **Cached content** — WIC snapshot and localStorage data fill in within 50ms.
3. **Live content** — API calls resolve and replace cached content. No layout shift.

Pages never show a full-screen spinner. Pages never block interaction during load.
