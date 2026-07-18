# Executive Intelligence — Solution Specification
## FLOW OS Solutions Library

> **STATUS: DESIGN ONLY**
> Capability layer: Phase 7.0 (Operational Brain — production)

---

## Problem Statement

Executives operate with too much data and too little intelligence. They get weekly status reports assembled by hand from 8 different tools, hour-long all-hands meetings that could be 2-minute briefings, and board decks that take the entire team a week to prepare.

The cost isn't just time. It's decision quality. By the time the data reaches the executive, it's stale. The dashboard shows last week's numbers. The report was assembled from estimates. Nobody caught the signal that the largest customer went quiet 3 weeks ago.

FLOW is already ingesting all of this data in real time. Executive Intelligence is the layer that presents it at executive altitude: synthesized, evidence-backed, actionable, and explained.

---

## Module Scope

```
Executive Intelligence
├── Role-Aware Daily Briefing       — CEO, CTO, VP gets a different brief
├── Strategic Copilot               — conversational intelligence layer
├── Board Report Generation         — auto-assembled from operational data
├── OKR Intelligence                — goal tracking with risk + predicted completion
├── Cross-Team Decision Register    — all material decisions, searchable and auditable
└── Executive Automation            — governed workflows triggered by executive context
```

---

## Signature Workflows

### 1. Role-Aware Morning Briefing

**Trigger:** Daily scheduled generation (configurable cadence: daily/weekly)  
**FLOW action:**
- Pull last 24h of ingested signals (new incidents, decisions, commits, meetings, customer events)
- Filter by the role's domain: CEO gets company-wide; CTO gets engineering + product; VP Sales gets pipeline + customer
- Generate executive brief: Gemini synthesis over relevant chunks, structured as Critical Updates, Key Decisions, Risks to Watch, Wins
- Deliver: in-app (`/briefing`), email, or Slack DM

**Example CEO brief:**  
> "CRITICAL: Payment service incident resolved at 2:47am (3h uptime loss). 2 enterprise customers affected — Acme Corp contacted at 4am. Root cause: Friday deployment identified. Post-mortem scheduled Thursday.  
> KEY DECISION: Engineering team approved migration to Postgres 15. Planned for Q3. No revenue risk.  
> WIN: Marcus W. closed TechCorp expansion — $180K ARR uplift, closes Monday."

**What no other tool generates:** This brief pulled from real-time Slack, GitHub, and CRM — not status forms.

### 2. Strategic Copilot

**Trigger:** Any query from the `/assistant` UI, Command Palette (⌘K), or mobile  
**Examples:**
- "What are our biggest customer risks right now?" → pulls CRM, recent support threads, NPS signals from ingested communication
- "How is the engineering team performing vs last quarter?" → velocity metrics, incident rate, PR throughput comparison
- "What decisions have we made about the auth rewrite?" → searches Decision Register + Org Memory
- "Who's working on the Q3 payment feature?" → graph query: PROJECT node "Q3 Payments" → all connected USER nodes

**How it works:** RAG pipeline over all workspace intelligence, enriched with Operational Graph context, answered by Gemini 2.5 Flash with heuristic fallback.

### 3. Board Report Auto-Assembly

**Trigger:** Manual trigger by CEO/COO; configurable monthly schedule  
**FLOW action:**
- Pull KPIs from Goal Tracking: OKR progress per department
- Pull engineering metrics: deployment frequency, incident rate, lead time
- Pull customer intelligence: ARR, churn, new logos, at-risk accounts
- Pull financial signals: headcount changes, runway signals (if connected)
- Draft structured board report: Executive Summary, Company Highlights, Risk Register, Financial Overview, Team Updates, Key Decisions
- Output: Notion page, Google Doc, or PDF-ready Markdown

**What no other tool does:** The board report is assembled from operational data FLOW already has, not manually curated slides. A CTO can review and edit it, but the first draft takes minutes not days.

### 4. OKR Intelligence

**Trigger:** Goal created or milestone updated; weekly intelligence pass  
**FLOW action:**
- Track each goal against leading indicators from connected tools (not just self-reported %)
- Predict: "Q3 Revenue Goal is 34% complete with 41% of the quarter elapsed. At current run rate, predicted completion: 87% of target. Risk factors: TechCorp deal still open, 2 at-risk expansions."
- Alert: "Goal 'Zero P0 Incidents' is at risk — 2 P0 incidents in the last 14 days vs 0 in the previous period."
- Identify blockers: "Engineering velocity goal blocked by code review lag (avg 2.8 day wait). Root cause: James K. on vacation, 40% of his review load unassigned."

### 5. Cross-Team Decision Register

**Trigger:** Decision extracted from any ingested communication (Slack, email, meeting notes)  
**FLOW action:**
- Store all extracted decisions with: author, date, context, evidence, confidence
- Index for search: "All decisions about the auth service in the last 6 months"
- Surface in briefings: "3 material decisions made this week you should know about"
- Alert when contradicted: "New decision conflicts with prior decision from 2024-11-15: auth service was previously decided to stay on v1 through Q1"

**What no other tool does:** Decisions made in Slack threads, email threads, and meeting notes are captured automatically. No one has to file a decision log.

---

## Reused FLOW Components

| Component | Role |
|---|---|
| BriefingEngine | Role-aware briefing generation |
| CopilotService | Conversational intelligence |
| GoalTrackingService | OKR progress + milestone tracking |
| DecisionEngine | Decision storage + search |
| Org Memory | Historical decision + incident memory |
| Vector Store | Semantic search over all workspace intelligence |
| Operational Graph | Cross-team dependency + entity context |
| AutomationEngine | Governed executive workflow execution |
| Executive Dashboard (`/dashboard`) | UI — already built in Phase 7 |
| Daily Briefing (`/briefing`) | UI — already built in Phase 7 |
| Command Palette | ⌘K copilot interface — already built in Phase 7 |

---

## New Services Required

| Service | Purpose |
|---|---|
| `boardReportService.js` | Assemble board report from all intelligence sources |
| `conflictDetectionService.js` | Detect when new decisions contradict historical ones |
| `kpiAggregatorService.js` | Pull numeric KPIs from connected tools for OKR reporting |

---

## API Additions

```
POST /api/brain/board-report              — Generate board report for period
GET  /api/brain/decisions/conflicts       — Decisions that contradict prior decisions
GET  /api/brain/goals/:id/prediction      — OKR prediction + risk + blocker analysis
POST /api/brain/goals/:id/kpi-sync        — Pull KPI signals from connected tools
```

---

## Competitive Differentiation

**vs. Notion AI / Confluence AI:** They summarize documents you've already written. FLOW synthesizes from operational data you never explicitly wrote down.

**vs. Glean / Microsoft Viva:** They search your tools. FLOW reasons across them: not "here's a Slack message about the payment incident" but "here's what the payment incident means for your Q3 targets."

**vs. Klipfolio / Tableau (dashboards):** They show you numbers. FLOW explains them: not "incident rate went up" but "incident rate went up because of the Friday deployment pattern. Here's the engineering decision that caused it and who made it."

**vs. BuiltWith (board reporting):** Manual assembly of slides. FLOW auto-assembles from real operational data. Your first draft is ready in 2 minutes.

---

## Roadmap Stage

**Phase 7.0** (Current): Operational Brain (briefing, copilot, OKR tracking, decision register) — production  
**Phase 8.0** (Beta): Executive Intelligence hardened under real customer usage  
**Phase 11.4** (Post-Beta): Board report generation + conflict detection + KPI sync

---

*Last updated: 2026-07-01 · Status: DESIGN ONLY*
