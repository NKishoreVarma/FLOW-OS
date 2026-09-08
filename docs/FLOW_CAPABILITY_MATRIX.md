# FLOW OS — Capability Matrix

> **The Operating Manual of FLOW's Brain.**
> This document is the single source of truth for what FLOW can do today, what is being built, and what is planned. Every row is a real user request. Every status is verifiable.

---

## How to Read This Document

Every capability is written as a **natural language prompt** a user would send to FLOW. This is intentional — if you can ask it, FLOW should be able to answer it or tell you exactly why it cannot.

### Status Legend

| Icon | Status | Meaning |
|------|--------|---------|
| ✅ | **Production Ready** | Shipped, tested, in active use |
| 🟡 | **Partially Implemented** | Core logic exists; edge cases or UI incomplete |
| 🚧 | **In Development** | Active sprint work; not yet deployed |
| ⏳ | **Planned** | Roadmapped; design approved |
| ❌ | **Not Supported** | Intentionally out of scope |

### Architecture Layers Referenced

| Layer | Location |
|-------|----------|
| Ingestion Pipeline | `src/workers/ingestionWorker.js` (9 stages) |
| RAG Query Engine | `src/routes/queryRoutes.js` + agents |
| Operational Brain | `src/services/operationalBrainService.js` |
| Connector Framework | `src/connectors/` |
| Execution Engine | `src/execution/` |
| Explainability | `src/explainability/` |
| Autonomous Operations | `src/autonomous/` |
| Graph Engine | `src/graph/` |
| Event Platform | `src/events/` |
| Workspace Cache | `src/workspaceCache/` |

---

## Table of Contents

1. [Executive Intelligence](#1-executive-intelligence)
2. [Chief of Staff](#2-chief-of-staff)
3. [Knowledge & Search](#3-knowledge--search)
4. [Operational Intelligence](#4-operational-intelligence)
5. [Engineering — GitHub](#5-engineering--github)
6. [Work Management — Jira](#6-work-management--jira)
7. [Communication — Gmail](#7-communication--gmail)
8. [Collaboration — Slack](#8-collaboration--slack)
9. [Calendar — Google Calendar](#9-calendar--google-calendar)
10. [Customer Intelligence](#10-customer-intelligence)
11. [Knowledge Base — Notion](#11-knowledge-base--notion)
12. [Workforce Intelligence — Workday](#12-workforce-intelligence--workday)
13. [Trust Center](#13-trust-center)
14. [Action Engine](#14-action-engine)
15. [Explainability](#15-explainability)
16. [Autonomous Operations](#16-autonomous-operations)
17. [Multi-Step Workflows](#17-multi-step-workflows)
18. [Long-Term Operational Brain](#18-long-term-operational-brain)
19. [Capability Statistics](#19-capability-statistics)
20. [North Star](#20-north-star)

---

## 1. Executive Intelligence

The executive intelligence layer transforms raw workspace signals into decision-ready briefings. Every output cites evidence. No numbers are invented.

### Morning Brief

| Capability | Status | Notes |
|-----------|--------|-------|
| "Give me my morning brief." | ✅ | Daily briefing via `/api/brain/briefing` — role-aware, evidence-cited |
| "What needs my attention today?" | ✅ | Chief of Staff top-5 NOW items from `chiefOfStaffService` |
| "What are the highest-priority items across all my systems?" | ✅ | Workspace Intelligence Cache snapshot via `/api/workspace/snapshot` |
| "Summarize yesterday for me." | ✅ | Replay Engine 24h window across connected sources |
| "What changed since I was last online?" | ✅ | Event Platform timeline diff since last session |
| "Show me what happened overnight." | ✅ | Incident engine + overnight event scan via Replay Engine |
| "What does my day look like?" | ✅ | Calendar integration + pending approvals + NOW workday items |
| "Brief me on the company before the board call." | ✅ | Executive Synthesis via `briefingEngine` (Gemini + fallback) |

### Executive Summary

| Capability | Status | Notes |
|-----------|--------|-------|
| "What is the company health score right now?" | ✅ | `healthScoreService` — 8 operational dimensions aggregated |
| "Generate an executive summary of the past week." | ✅ | Rolling summary worker + Gemini synthesis |
| "Give me a board-level summary of where we stand." | ✅ | Council synthesis via `executiveOrchestrator` |
| "What are the top 3 risks this week?" | ✅ | Prediction Engine top risks (`src/predictions/`) |
| "Summarize company performance for the quarter." | 🟡 | Depends on connected connectors; fiscal connectors not yet integrated |
| "Write an executive update for the all-hands." | 🟡 | Synthesis available; distribution requires Slack/Gmail approval gate |
| "Create a weekly status report and email it to the team." | ⏳ | Multi-step workflow: synthesis → draft → approval → send |

### Operational Health

| Capability | Status | Notes |
|-----------|--------|-------|
| "What is the current workspace health?" | ✅ | `/api/workspace/health` — instant from cache |
| "Show me which domains are in the red." | ✅ | Domain health cards (engineering/operations/sales/hr/finance/security) |
| "Why is engineering health declining?" | ✅ | XAI explanation envelope wrapping prediction evidence |
| "Compare this week's health to last week." | ✅ | Replay Engine snapshot comparison (T1 vs T2) |
| "What does the health look like across all teams?" | ✅ | Workspace snapshot 6-domain breakdown |
| "Alert me if health drops below 60." | ⏳ | Alert rule engine: threshold monitoring |

### Risk Detection

| Capability | Status | Notes |
|-----------|--------|-------|
| "What are the biggest risks right now?" | ✅ | Prediction Engine top-risk surface |
| "Is there a deployment risk this week?" | ✅ | Prediction model: `deploymentRisk` (engineering domain) |
| "Which customer is most at risk of churning?" | ✅ | Customer Intelligence + prediction (`customerChurnRisk`) |
| "Are there any security risks I should know about?" | ✅ | Security domain predictions + permission drift signals |
| "Detect anomalies in this week's data." | ✅ | AnomalyPredictor (z-score baseline) in `src/predictions/` |
| "What could go wrong with this release?" | ✅ | What-If Simulation Engine — RELEASE_SLIP scenario |
| "Show me the blast radius if Platform API goes down." | ✅ | ImpactAnalyzer in Operational Graph Engine |
| "What happens if Rahul resigns?" | ✅ | What-If Simulation — EMPLOYEE_DEPARTURE scenario |
| "Predict the probability of a sprint delay." | ✅ | `sprintDelayRisk` prediction model |
| "Which engineers are at burnout risk?" | ✅ | `engineerBurnoutRisk` prediction + on-call + PR queue signals |

### Priority Recommendations

| Capability | Status | Notes |
|-----------|--------|-------|
| "What should I do first today?" | ✅ | Chief of Staff NOW items ranked by urgency |
| "Show me my recommended actions." | ✅ | Recommendation Engine (`DailyWorkfeed` + FLOW score) |
| "Which of my pending decisions is most urgent?" | ✅ | Decision Engine priority ranking |
| "What actions will have the most impact right now?" | ✅ | Action cards with urgency × impact scoring |
| "Rank everything in my inbox by priority." | 🟡 | AIInbox ranking available; multi-connector inbox unified view planned |
| "What can I delegate?" | ⏳ | Delegation planner — maps tasks to qualified team members |
| "Surface anything that needs my approval today." | ✅ | `/api/approvals` pending approval list |

### Decision Support

| Capability | Status | Notes |
|-----------|--------|-------|
| "Help me decide whether to delay Release 3.2." | ✅ | Executive Council + What-If Simulation (RELEASE_SLIP) |
| "What context do I need before the Acme Corp call?" | ✅ | Meeting prep context via `/api/meetings/event/:id/context` |
| "What did we decide about the Atlas architecture?" | ✅ | Decision Engine — `listDecisions` with search |
| "Show me the decision history for Project Atlas." | ✅ | Decision history via `/api/brain/decisions` |
| "What are the tradeoffs of deploying on Friday?" | ✅ | Risk score (GitHubAdapter `deploymentRiskScore`) + simulation |
| "Who made the call to delay the SSO feature?" | ✅ | Decision record with actor, rationale, and timestamp |
| "Create a decision record for this meeting." | ✅ | `fromRecommendation` in `decisionEngine` |
| "What past decisions are most relevant to this problem?" | ✅ | OrgMemoryService + Knowledge Graph 2-hop context |

### Company Health

| Capability | Status | Notes |
|-----------|--------|-------|
| "What is the overall company health?" | ✅ | Workspace health score — 8 dimensions |
| "Show me the company's operational digital twin." | ✅ | Operational Graph Engine — 21 node types, 19 edge types |
| "How connected are our teams?" | ✅ | `topCollaborators` / `whoKnows` relationship scoring |
| "Who are the most critical people in the company graph?" | ✅ | RelationshipScorer — bus factor analysis |
| "What happened to company health after the incident?" | ✅ | Replay Engine + Workspace Snapshot comparison |

---

## 2. Chief of Staff

The Chief of Staff surface (`/chief`) gives every executive a personal AI operations officer. It knows your priorities, your team, and what needs to happen today.

### Daily Planning

| Capability | Status | Notes |
|-----------|--------|-------|
| "Plan my day." | ✅ | `chiefOfStaffService.getChiefOfStaffBriefing()` — top-5 NOW items |
| "What are the top things that need my attention today?" | ✅ | Multi-signal NOW items: pending approvals + notifications + predictions + incidents |
| "What's blocking the team right now?" | ✅ | Blockers surfaced from Jira + PR review queue + on-call overload signals |
| "What are my pending approvals?" | ✅ | `/api/approvals` — pending by workspace |
| "What failed executions need my review?" | ✅ | ExecutionHistory failed records surfaced in Chief |
| "What do I need to sign off on before EOD?" | ✅ | Pending approvals + HIGH/CRITICAL risk actions awaiting sign-off |

### Recommendations

| Capability | Status | Notes |
|-----------|--------|-------|
| "What do you recommend I do about the Acme Corp situation?" | ✅ | FLOW Recommendation Engine + customer health context |
| "Give me 3 things I should act on this week." | ✅ | Weekly Review top recommendations (`weeklyReviewService`) |
| "What's the most impactful action I can take right now?" | ✅ | Action card with urgency × business impact score |
| "Should I be worried about the deployment on Friday?" | ✅ | Risk score from deployment domain + simulation |
| "What recommendation do you have for the sprint planning meeting?" | ✅ | Sprint health analysis + velocity prediction |

### Decision Assistance

| Capability | Status | Notes |
|-----------|--------|-------|
| "Help me think through whether to hire two SREs." | ✅ | Operational Brain reasoning + evidence from team data |
| "What are the consequences of not fixing HPLT-847 this week?" | ✅ | Impact path via Operational Graph |
| "Give me a pros and cons for delaying the release." | ✅ | Executive Council — multi-agent debate |
| "What have we decided about this before?" | ✅ | OrgMemoryService `searchMemory` |
| "What would happen if we cancelled Project Atlas?" | ✅ | Simulation Engine — PROJECT_CANCEL scenario |

### Priorities

| Capability | Status | Notes |
|-----------|--------|-------|
| "What is the highest priority in engineering right now?" | ✅ | Engineering domain health card + top risks |
| "What are the priorities for next week?" | ✅ | Weekly Review (`weeklyReviewService`) |
| "Sort everything by business impact, not just urgency." | ✅ | XAI business impact dimensions in recommendation |
| "What are the top 5 things the company should focus on?" | ✅ | Workspace snapshot `topActions` list |
| "What can wait until next quarter?" | 🟡 | Deferral reasoning is available; explicit deferral workflow planned |

### Follow-ups

| Capability | Status | Notes |
|-----------|--------|-------|
| "What follow-ups were created from last week's meetings?" | ✅ | Meeting action items via `event.extendedProperties.private.flow_actions` |
| "Are there any follow-ups I haven't actioned?" | 🟡 | Action item extraction exists; aging/reminder workflow planned |
| "Remind me to follow up with Acme Corp on Thursday." | ⏳ | Scheduled reminder — calendar + notification engine |
| "Did anyone follow up on the INC-076 post-mortem actions?" | ✅ | Post-mortem action items tracked in Jira + meeting notes |
| "Create follow-up tasks from this meeting summary." | ✅ | `chiefOfStaffService` action card creation from meeting data |

### Evidence

| Capability | Status | Notes |
|-----------|--------|-------|
| "Show me the evidence behind this recommendation." | ✅ | XAI explanation envelope — evidence array with authority weights |
| "Where did you get this information?" | ✅ | Source attribution in every explanation |
| "What sources are you most confident in?" | ✅ | 6-dim confidence scoring (data freshness, authority, diversity) |
| "Show me everything you know about David Park's workload." | ✅ | Entity context via `/api/brain/context/:entityId` |

### Reasoning

| Capability | Status | Notes |
|-----------|--------|-------|
| "Explain your reasoning." | ✅ | XAI reasoning trace + decision tree |
| "Walk me through how you reached this conclusion." | ✅ | 9-stage COO reasoning pipeline with step-by-step output |
| "What would change your recommendation?" | ✅ | Follow-up: `what_missing` explanation type |
| "How confident are you in this?" | ✅ | Confidence aggregate — 6 real-signal dimensions |
| "What are the contradictions in this data?" | ✅ | CriticAgent contradiction detection across 5 topic clusters |

---

## 3. Knowledge & Search

FLOW maintains a living, searchable memory of everything that has happened in the workspace.

### Semantic Search

| Capability | Status | Notes |
|-----------|--------|-------|
| "Search for everything related to authentication timeouts." | ✅ | pgvector ANN search (768-dim Gemini embeddings, LIMIT 20) |
| "Find all context about the WorkflowCache memory bug." | ✅ | Semantic retrieval + Knowledge Graph 2-hop expansion |
| "What do we know about CQRS and event sourcing?" | ✅ | RAG query pipeline — Router → Critic → Synthesis |
| "Show me everything mentioned about Acme Corp." | ✅ | Cross-connector search via `searchOrchestrator` |
| "Find any messages about the Atlas database migration." | ✅ | Multi-source search: Slack + email + Jira + meetings |
| "Search for 'token refresh race condition'." | ✅ | Full-text + semantic hybrid retrieval with RRF merge |
| "What does FLOW know about our microservices architecture?" | ✅ | Knowledge Graph + vault intelligence + vector store |

### Knowledge Graph

| Capability | Status | Notes |
|-----------|--------|-------|
| "Show me how the auth service connects to everything else." | ✅ | k-hop traversal from `auth` node in Operational Graph |
| "Who worked on Platform API last quarter?" | ✅ | `authored_by` edges in Knowledge Graph |
| "Which systems depend on the database?" | ✅ | DependencyAnalyzer — dependency chain |
| "Map the relationship between Acme Corp and our team." | ✅ | Entity context — customer + people + ticket nodes |
| "Find the shortest path between David Park and Meridian Health." | ✅ | `shortestPath` traversal in GraphEngine |
| "What is the blast radius if the billing service goes down?" | ✅ | ImpactAnalyzer — blast radius from billing service node |
| "Show me all entities connected to Project Atlas." | ✅ | `neighbors` (k-hop) from Atlas project node |

### Project Search

| Capability | Status | Notes |
|-----------|--------|-------|
| "What's the current status of Project Atlas?" | ✅ | Project Intelligence + RAG query on atlas context |
| "Find all projects blocked on engineering issues." | ✅ | Cross-reference Jira + projects + incident data |
| "Which projects are at risk this quarter?" | ✅ | Prediction Engine + project domain signals |
| "Who is responsible for the Atlas authentication module?" | ✅ | Graph traversal — `OWNS` edges from Atlas project |
| "What are the open action items for Release 3.2?" | ✅ | Meeting action items + Jira blockers + PR status |

### Meeting Search

| Capability | Status | Notes |
|-----------|--------|-------|
| "Find all meetings about the database migration." | ✅ | `/api/meetings/search` — text search across ±90 days |
| "What was discussed in the last sprint review?" | ✅ | Meeting transcript retrieval + AI summary |
| "Find meetings where Acme Corp was discussed." | ✅ | Cross-source search: calendar + transcripts |
| "What decisions were made in the architecture review?" | ✅ | Decision extraction from meeting transcripts |
| "Show me all past 1:1s with David Park." | ✅ | Calendar search + attendee filter |

### Document Search

| Capability | Status | Notes |
|-----------|--------|-------|
| "Find the onboarding runbook." | ✅ | Knowledge Explorer — document search |
| "What does our data retention policy say about HIPAA data?" | ✅ | Vault retrieval + frontmatter scan |
| "Find all architecture decision records." | ✅ | Document search by type/tag in Knowledge Explorer |
| "Search for anything about our SSL certificate renewal process." | ✅ | Semantic search across vaulted documents |
| "Show me the post-mortem for INC-076." | ✅ | Incident → vault document retrieval |

### Timeline Search

| Capability | Status | Notes |
|-----------|--------|-------|
| "What happened on December 14th?" | ✅ | Replay Engine — TIMELINE mode for specific date |
| "Show me everything that happened during the incident." | ✅ | Replay Engine — INCIDENT mode (correlation chain + MTTR) |
| "What was the engineering timeline last month?" | ✅ | Replay Engine — ENGINEERING mode, monthly frame |
| "Walk me through the Acme Corp escalation step by step." | ✅ | Customer journey replay — email → Slack → Jira chain |
| "Compare this week's activity to last week." | ✅ | Replay diff — added/removed/changed/resolved/escalated |

### Company Memory

| Capability | Status | Notes |
|-----------|--------|-------|
| "What do we know about our database performance history?" | ✅ | OrgMemoryService — durable decision/incident/event memory |
| "What have we tried before to fix auth timeouts?" | ✅ | Memory search across incident history |
| "Recall all the decisions we made about microservices." | ✅ | Decision records with full context |
| "What analogues exist for this situation from the past?" | ✅ | Simulation Engine uses memory for analogues |
| "Show me everything FLOW remembers about the Pinnacle account." | ✅ | Entity context + memory records for Pinnacle |

### Relationship Discovery

| Capability | Status | Notes |
|-----------|--------|-------|
| "Who are the key collaborators on the Atlas project?" | ✅ | `topCollaborators` — relationship strength scoring |
| "Which engineers have the most institutional knowledge?" | ✅ | `whoKnows` — knowledge ownership mapping |
| "Find all people connected to the Acme Corp account." | ✅ | Graph traversal from customer node |
| "Who should I talk to about the payment service architecture?" | ✅ | Knowledge ownership from graph edges + commit history |
| "Map the informal influence network in the engineering team." | ✅ | RelationshipScorer across `COLLABORATES_WITH` edges |

---

## 4. Operational Intelligence

Domain-specific intelligence engines that reason about each functional area of the company.

### Engineering

| Capability | Status | Notes |
|-----------|--------|-------|
| "Show today's engineering risks." | ✅ | Engineering domain health card + top 3 risks |
| "Why is engineering velocity declining?" | ✅ | Sprint velocity trend + PR queue + on-call signals |
| "What is the deployment risk score for this week?" | ✅ | Deployment prediction model (`deploymentRisk`) |
| "How many open PRs need review?" | ✅ | GitHub PR list with `mergeReadinessScore` |
| "Who is the bottleneck in the review process?" | ✅ | ReviewerWorkload from GitHubAdapter |
| "Predict when Release 3.2 will actually ship." | ✅ | `sprintDelayRisk` + release gate blocker analysis |

### Product

| Capability | Status | Notes |
|-----------|--------|-------|
| "What features are customers asking for most?" | 🟡 | Customer feedback patterns from tickets/emails; CRM connector adds precision |
| "Which roadmap items are most at risk?" | ✅ | Project Intelligence + Jira integration + dependency graph |
| "What is blocking the Connect Marketplace launch?" | ✅ | Project blockers from Jira + PR status |
| "Summarize the product decisions made this month." | ✅ | Decision records filtered by product domain |

### Sales

| Capability | Status | Notes |
|-----------|--------|-------|
| "Which deals are at risk of slipping?" | 🟡 | Customer health signals available; CRM connector (HubSpot) needed for pipeline values |
| "What is blocking our enterprise deals?" | 🟡 | Known blockers from customer tickets + release delays; CRM needed for deal stage |
| "Which customer is closest to churning?" | ✅ | Customer churn prediction + health score |
| "Prepare me for the Acme Corp renewal call." | ✅ | Customer briefing — health score + open tickets + history |

### Support

| Capability | Status | Notes |
|-----------|--------|-------|
| "Which support tickets are most critical right now?" | ✅ | P1/P2 Jira tickets cross-referenced with customer health |
| "What are the common patterns in this week's tickets?" | ✅ | Ticket clustering via Synapse Engine |
| "Which tickets are about to breach SLA?" | 🟡 | Ticket age analysis available; SLA terms from contract system needed for precision |
| "What knowledge base articles are missing?" | ✅ | Gap analysis: ticket themes vs. existing documents |

### Finance

| Capability | Status | Notes |
|-----------|--------|-------|
| "What is the ARR at risk this quarter?" | ✅ | At-risk renewals from customer health scores |
| "Give me a revenue forecast." | 🟡 | Customer renewal signals available; accounting connector needed for complete P&L |
| "What is our burn rate?" | 🟡 | Headcount + infrastructure signals; accounting connector needed for precision |

### HR

| Capability | Status | Notes |
|-----------|--------|-------|
| "Which engineers are showing burnout signals?" | ✅ | On-call weeks + incident response frequency + PR queue depth |
| "What is the status of our open hiring pipeline?" | 🟡 | Slack/email evidence available; Workday needed for formal pipeline |
| "Are any critical engineers at retention risk?" | ✅ | Bus factor + workload + single-point-of-knowledge detection |

### Security

| Capability | Status | Notes |
|-----------|--------|-------|
| "Is there any permission drift in production?" | ✅ | Permission store audit + governance evaluation |
| "Show me the audit log for this week." | ✅ | PostgreSQL AuditLog via `/api/connectors/audit` |
| "Were there any governance violations?" | ✅ | Governance event bus + denied action audit records |
| "Did INC-076 expose any customer data?" | ✅ | Incident classification — availability vs. data breach assessment |

### Risk Analysis

| Capability | Status | Notes |
|-----------|--------|-------|
| "What are the top 5 organizational risks right now?" | ✅ | RiskCalculator — weighted × likelihood × criticality |
| "Simulate what happens if the auth service fails." | ✅ | Simulation Engine — SERVICE_OUTAGE scenario |
| "What is the knowledge loss risk if David Park leaves?" | ✅ | EMPLOYEE_DEPARTURE simulation + bus factor analysis |
| "How exposed are we to the Acme Corp renewal risk?" | ✅ | Customer churn simulation — CUSTOMER_CHURN scenario |

### Trend Detection

| Capability | Status | Notes |
|-----------|--------|-------|
| "Is the incident rate increasing or decreasing?" | ✅ | TrendAnalyzer — recent vs. prior period |
| "Are deployment failures trending up?" | ✅ | PatternDetector (deploy → incident correlation) |
| "Is team collaboration improving or declining?" | ✅ | RelationshipScorer trend over time |
| "Show me the velocity trend for the past 3 months." | ✅ | Engineering velocity prediction model |

### Forecasting

| Capability | Status | Notes |
|-----------|--------|-------|
| "When will the auth fix be merged?" | 🟡 | PR age + review demand signals; exact date requires calendar/schedule data |
| "Project Atlas completion — what's the real ETA?" | ✅ | Linear projection from velocity + blocker analysis |
| "Will we hit the Q4 ARR target?" | 🟡 | Renewal signals available; pipeline data requires HubSpot |
| "How many incidents should we expect next month?" | ✅ | ForecastEngine linear projection on incident frequency |

---

## 5. Engineering — GitHub

Full GitHub production implementation. All actions flow through the Execution Engine with governance, audit, and WebSocket broadcast.

### Repositories

| Capability | Status | Notes |
|-----------|--------|-------|
| "List all my repositories." | ✅ | `/api/engineering/repos` |
| "Show me the health of the Platform API repo." | ✅ | Single repo metadata: language, stars, open issues, topics |
| "Which repos have the most open issues?" | ✅ | Repo list sorted by `openIssues` |
| "Who are the top contributors to the analytics engine?" | ✅ | `/api/engineering/repos/:owner/:repo/contributors` |

### Pull Requests

| Capability | Status | Notes |
|-----------|--------|-------|
| "Show me all open pull requests." | ✅ | PR list with status, author, and age |
| "What's the merge readiness score for PR #847?" | ✅ | `mergeReadinessScore` (0–100): reviews + conflicts + draft status + age |
| "Which PRs are blocking the release?" | ✅ | `isReleaseGate` flag + merge readiness cross-reference |
| "Who hasn't reviewed their assigned PRs?" | ✅ | ReviewerWorkload from GitHubAdapter |
| "Show me the diff for PR #847." | ✅ | Single PR with full file diff |
| "Create a pull request for the auth fix branch." | ✅ | `GITHUB_CREATE_PR` via ExecutionEngine |
| "Update the PR description with the latest context." | ✅ | `GITHUB_UPDATE_PR` — patch title/body/state |
| "Approve PR #894." | ✅ | `GITHUB_APPROVE_PR` — submit APPROVE review event |
| "Merge PR #894 with squash." | ✅ | `GITHUB_MERGE_PR` — squash/merge/rebase |
| "Assign a reviewer to PR #847." | ✅ | `GITHUB_REQUEST_REVIEW` |
| "Who should review this PR based on the files changed?" | ✅ | `suggestedReviewers` from active reviewer analysis |

### Deployments

| Capability | Status | Notes |
|-----------|--------|-------|
| "Show me all deployments to production this week." | ✅ | `/api/engineering/repos/:owner/:repo/deployments?environment=production` |
| "What is the risk score for tomorrow's deployment?" | ✅ | `riskScore` (0–100): environment type + off-hours + day of week |
| "What was deployed last night?" | ✅ | Deployment list filtered by date + Replay Engine |
| "Show me the deployment timeline for the past month." | ✅ | Replay Engine — ENGINEERING mode |

### Releases

| Capability | Status | Notes |
|-----------|--------|-------|
| "What is included in Release 3.2?" | ✅ | Project gate items + merged PRs + resolved Jira tickets |
| "What is blocking Release 3.2 from shipping?" | ✅ | `blockingIssues` + open release-gate PRs |
| "Create a GitHub release for v3.2.0." | ⏳ | `GITHUB_CREATE_RELEASE` — planned |
| "Generate the release notes for v3.2.0." | ⏳ | AI synthesis from merged PRs + resolved tickets |

### Incidents (Engineering)

| Capability | Status | Notes |
|-----------|--------|-------|
| "What caused the December 14 incident?" | ✅ | INC-076 root cause analysis from incident engine |
| "How long did it take to resolve?" | ✅ | MTTR from incident record (detectedAt → resolvedAt) |
| "What commit triggered the incident?" | ✅ | Commit → deploy → incident correlation via Event Platform |
| "Did this code change cause the outage?" | ✅ | Replay Engine — INCIDENT mode (causation chain) |

### Code Intelligence

| Capability | Status | Notes |
|-----------|--------|-------|
| "Search for usages of AuthTokenManager in the codebase." | ✅ | `GITHUB_SEARCH_CODE` via SearchOrchestrator |
| "Find all files changed in the last 5 deployments." | ✅ | Commit list + file diff aggregation |
| "Compare the main branch to the release branch." | ✅ | `/api/engineering/repos/:owner/:repo/compare?base=main&head=release-3.2` |
| "Which branches haven't been merged in over 30 days?" | 🟡 | Branch list available; staleness threshold analysis planned |

### Engineering Metrics

| Capability | Status | Notes |
|-----------|--------|-------|
| "What is the current sprint completion rate?" | ✅ | Velocity from Jira sprint data + commit activity |
| "Show me DORA metrics for the past quarter." | 🟡 | Deploy frequency + MTTR available; change failure rate needs correlation |
| "How many PRs were merged this week?" | ✅ | PR list filtered by merge date |
| "What is the average time to merge a PR?" | ✅ | PR age analysis from `mergeReadinessScore` data |
| "Sync PRs and commits into FLOW's memory." | ✅ | `GITHUB_SYNC` → BullMQ ingestion pipeline |

---

## 6. Work Management — Jira

Production Jira integration with sprint, backlog, and issue tracking.

### Sprint Management

| Capability | Status | Notes |
|-----------|--------|-------|
| "What's the current sprint status?" | 🟡 | Sprint data via JiraAdapter; dashboard sprint velocity |
| "How many story points are remaining in Sprint 8?" | 🟡 | Jira sprint data; full sprint board view planned |
| "What is the sprint completion percentage?" | ✅ | Velocity metric from `weeklyReviewService` |
| "Which sprint items are blocked?" | ✅ | Jira issues with status `blocked` + dependency analysis |
| "What was the sprint velocity for the last 3 sprints?" | ✅ | Velocity trend via `engineeringVelocityDecline` prediction |
| "Close the current sprint and start a new one." | ⏳ | `JIRA_CLOSE_SPRINT` — planned |

### Backlog

| Capability | Status | Notes |
|-----------|--------|-------|
| "Show me the full backlog." | 🟡 | Jira issue list; full backlog view with prioritization planned |
| "Which backlog items are most important for next sprint?" | 🟡 | Priority ranking from Jira + customer signal cross-reference |
| "What technical debt tickets are in the backlog?" | 🟡 | Label-based search in Jira |
| "Add a technical debt ticket for the mutex issue." | ⏳ | `JIRA_CREATE_ISSUE` — planned |

### Issue Tracking

| Capability | Status | Notes |
|-----------|--------|-------|
| "What's the status of HPLT-847?" | ✅ | JiraAdapter issue fetch |
| "Which P1 tickets are still open?" | ✅ | Issue filter: priority=P1, status≠done |
| "Who is assigned to HGRD-234?" | ✅ | Issue assignee from JiraAdapter |
| "Update HPLT-847 to 'In Review'." | 🟡 | `JIRA_TRANSITION_ISSUE` — available via ExecutionEngine |
| "Add a comment to HPLT-847 with the latest fix status." | 🟡 | `JIRA_ADD_COMMENT` — available |
| "Assign HPLT-899 to Kenji Watanabe." | 🟡 | `JIRA_ASSIGN_ISSUE` — available |
| "What tickets are blocked on PR #847 being merged?" | ✅ | Jira → GitHub cross-reference via Knowledge Graph |

### Roadmaps

| Capability | Status | Notes |
|-----------|--------|-------|
| "What's on the Q1 roadmap?" | 🟡 | Jira epic/roadmap; Notion roadmap documents |
| "Show me all roadmap items at risk." | ✅ | Project risk from Prediction Engine |
| "What changed on the roadmap this month?" | ✅ | Replay Engine — roadmap change timeline |

### Velocity

| Capability | Status | Notes |
|-----------|--------|-------|
| "What is the team's current velocity?" | ✅ | Sprint velocity from `weeklyReviewService` |
| "Is velocity trending up or down?" | ✅ | TrendAnalyzer — velocity over trailing 4 sprints |
| "Why did velocity drop in Sprint 8?" | ✅ | Causal analysis: on-call + incident response + PR review bottleneck |
| "Predict next sprint's velocity." | ✅ | ForecastEngine linear projection |

---

## 7. Communication — Gmail

Full Gmail production implementation. Every action is governed, audited, and flows through the Execution Engine.

### Inbox

| Capability | Status | Notes |
|-----------|--------|-------|
| "Show me my inbox." | ✅ | `/api/communication/inbox` with label filter and pagination |
| "Show me unread emails from enterprise customers." | ✅ | Gmail query: `is:unread from:enterprise-customer` |
| "Find the email thread with Acme Corp from last week." | ✅ | `/api/communication/search` — Gmail query syntax |
| "Show me the full thread for the Meridian Health escalation." | ✅ | `/api/communication/thread/:threadId` — full MIME tree |
| "What emails haven't I responded to in over 48 hours?" | 🟡 | Inbox age analysis; automated follow-up flagging planned |

### Summaries

| Capability | Status | Notes |
|-----------|--------|-------|
| "Summarize my inbox from the past 24 hours." | ✅ | Inbox sync + Gemini synthesis |
| "What are the most important emails I received today?" | ✅ | RAG relevance ranking over inbox |
| "Summarize this email thread for me." | ✅ | Thread fetch + executive synthesis |
| "Sync my inbox to FLOW's memory." | ✅ | `GMAIL_SYNC` → BullMQ ingestion pipeline |

### Drafting

| Capability | Status | Notes |
|-----------|--------|-------|
| "Draft an email to the Acme Corp CTO about the incident." | ✅ | `GMAIL_CREATE_DRAFT` — creates draft, requires approval before send |
| "Write a follow-up email to Meridian Health about HGRD-234." | ✅ | Draft with HIGH risk level → OWNER approval required |
| "Draft a release announcement for v3.2." | ✅ | Gemini synthesis → draft created |
| "Create a meeting prep email for tomorrow's board call." | ✅ | Morning brief context → draft |

### Replies

| Capability | Status | Notes |
|-----------|--------|-------|
| "Reply to the Acme Corp email with the incident update." | ✅ | `GMAIL_REPLY` — threads correctly via `In-Reply-To` headers |
| "Reply all to the team about the deployment window." | ✅ | `GMAIL_REPLY_ALL` |
| "Forward the INC-076 post-mortem to the customer." | ✅ | `GMAIL_FORWARD` — prepends original body |

### Labels

| Capability | Status | Notes |
|-----------|--------|-------|
| "Archive the resolved Acme Corp thread." | ✅ | Label action: `archive` shortcut |
| "Mark all incident emails as read." | ✅ | `GMAIL_MODIFY_LABELS` — `markRead` shortcut |
| "Star the Meridian Health contract thread." | ✅ | `GMAIL_MODIFY_LABELS` — `star` shortcut |
| "Label this email as 'Customer Escalation'." | ✅ | Label modification by name |
| "Show me all Gmail labels." | ✅ | `/api/communication/labels` |

### Follow-ups

| Capability | Status | Notes |
|-----------|--------|-------|
| "Which customer emails need a follow-up?" | 🟡 | Follow-up detection from inbox; automated aging analysis planned |
| "Did we follow up with Pinnacle Logistics after the call?" | ✅ | Email search + calendar cross-reference |
| "Send the Acme credit approval email once the CFO approves." | ✅ | Approval gate → execute → `GMAIL_SEND` |

### Customer Communication

| Capability | Status | Notes |
|-----------|--------|-------|
| "Prepare the INC-076 post-mortem email for customers." | ✅ | Synthesis from incident data → draft → approval gate |
| "Send renewal reminders to all customers renewing this month." | ⏳ | Bulk communication workflow — planned |
| "Draft a security disclosure for Meridian Health." | ✅ | HIGH risk → OWNER approval required before send |

---

## 8. Collaboration — Slack

Slack integration via the governed connector framework. Read operations are production-ready. Full write actions require approval for high-risk messages.

### Conversation Search

| Capability | Status | Notes |
|-----------|--------|-------|
| "Find all Slack messages about the deployment." | 🟡 | Slack messages ingested to vector store; direct Slack API search planned |
| "Show me the on-call handoff thread from December 14." | ✅ | Memory retrieval from ingested Slack threads |
| "What was discussed in #engineering this week?" | ✅ | Ingested Slack thread summaries via RAG |
| "Find every mention of HPLT-847 in Slack." | ✅ | Cross-connector search: semantic + keyword |

### Summaries

| Capability | Status | Notes |
|-----------|--------|-------|
| "Summarize the #engineering channel from the past week." | ✅ | Channel context from ingested threads + Gemini synthesis |
| "What decisions were made in the executive Slack channel?" | ✅ | Decision extraction from Slack thread ingestion |
| "Give me a summary of the incident Slack thread." | ✅ | Thread summary from ingestion pipeline |

### Thread Intelligence

| Capability | Status | Notes |
|-----------|--------|-------|
| "What was the conclusion of the #release-3-2 thread?" | ✅ | Thread summary + decision extraction |
| "Are there any unresolved threads from the incident?" | 🟡 | Thread state analysis; resolution detection planned |
| "Show me all threads where a decision was made this week." | ✅ | Decision records linked to Slack sources |

### Notifications

| Capability | Status | Notes |
|-----------|--------|-------|
| "Notify the engineering team about the deployment window." | 🟡 | `SLACK_SEND_MESSAGE` via Execution Engine |
| "Send a message to #on-call about the INC-076 resolution." | 🟡 | Notification Engine → Slack |
| "Alert the team when PR #847 is merged." | ✅ | Event Platform subscriber → Notification Engine → Slack |

### Announcements

| Capability | Status | Notes |
|-----------|--------|-------|
| "Post the release announcement to #company-announcements." | ⏳ | Bulk announcement — approval gate + scheduling |
| "Schedule a Slack announcement for Monday morning." | ⏳ | Scheduled notification via BullMQ |
| "Draft a Slack message and post it when I approve." | 🟡 | Draft → approval → send flow |

### Messaging

| Capability | Status | Notes |
|-----------|--------|-------|
| "Send a message to David Park about PR #847." | 🟡 | `SLACK_SEND_DM` — governed; DM policy enforced |
| "Reply to the thread asking for a second reviewer." | 🟡 | `SLACK_REPLY_THREAD` |
| "Create a new Slack channel for the Atlas launch." | ⏳ | `SLACK_CREATE_CHANNEL` — planned |

---

## 9. Calendar — Google Calendar

Full Google Calendar production implementation.

### Scheduling

| Capability | Status | Notes |
|-----------|--------|-------|
| "Schedule a 1:1 with David Park this week." | ✅ | `CALENDAR_CREATE_EVENT` with video conference |
| "Create the Release 3.2 deployment window on December 29." | ✅ | Event with Google Meet + attendees |
| "Find a time when the whole engineering team is free." | 🟡 | Calendar search available; availability aggregation planned |
| "Show me my upcoming meetings this week." | ✅ | `/api/meetings/upcoming?days=7` |
| "Show me all meetings in the past 30 days." | ✅ | `/api/meetings/past?days=30` |

### Meeting Preparation

| Capability | Status | Notes |
|-----------|--------|-------|
| "Prepare me for the Acme Corp call in 30 minutes." | ✅ | Meeting prep context: full RAG pipeline on event + attendees |
| "What context do I need for the board meeting?" | ✅ | Meeting prep via `/api/meetings/event/:id/context` |
| "Summarize everything FLOW knows about tomorrow's meeting attendees." | ✅ | Entity context for each attendee from Knowledge Graph |
| "What topics usually come up in sprint reviews?" | ✅ | Pattern detection from past sprint review transcripts |

### Meeting Summaries

| Capability | Status | Notes |
|-----------|--------|-------|
| "Summarize the meeting we just had." | ✅ | `CALENDAR_STORE_SUMMARY` — persists to `extendedProperties.private` |
| "What were the action items from today's architecture review?" | ✅ | Action items fetched from event metadata |
| "Store these action items on the calendar event." | ✅ | `CALENDAR_STORE_ACTIONS` |
| "Add notes from the all-hands to the calendar event." | ✅ | `CALENDAR_STORE_NOTES` |

### Conflicts

| Capability | Status | Notes |
|-----------|--------|-------|
| "Do I have any meeting conflicts this week?" | ✅ | Calendar event overlap detection |
| "Which of these meetings can I skip?" | 🟡 | Meeting value scoring: attendee count + historical decisions; ML scoring planned |
| "Flag low-value meetings on my calendar." | ⏳ | Meeting value classifier + calendar label |

### Availability

| Capability | Status | Notes |
|-----------|--------|-------|
| "Is David Park available on Friday afternoon?" | ✅ | Calendar search for attendee |
| "Who from the SRE team is on-call December 29?" | 🟡 | Calendar search + on-call rotation correlation |
| "Find a slot for a 90-minute architecture review next week." | 🟡 | Availability scan across attendee calendars |

### Rescheduling

| Capability | Status | Notes |
|-----------|--------|-------|
| "Move the sprint review to Thursday." | ✅ | `CALENDAR_UPDATE_EVENT` — patch start/end |
| "Cancel the all-hands meeting for December 24." | ✅ | `CALENDAR_DELETE_EVENT` |
| "Update the meeting description with the agenda." | ✅ | `CALENDAR_UPDATE_EVENT` — patch description |
| "Sync upcoming meetings to FLOW's memory." | ✅ | `CALENDAR_SYNC` → BullMQ ingestion |

---

## 10. Customer Intelligence

Customer health, escalation management, and renewal tracking. Connected to the Knowledge Graph and Prediction Engine.

### Customer Health

| Capability | Status | Notes |
|-----------|--------|-------|
| "Which customers are most at risk right now?" | ✅ | Customer health scores + `customerChurnRisk` prediction |
| "Show me Acme Corp's health score." | ✅ | Customer record + health score breakdown |
| "Why is Acme Corp's health score so low?" | ✅ | XAI — evidence behind health score (open P1s + incidents + sentiment) |
| "What is the trend in customer health?" | ✅ | Health score trend over trailing 30 days |
| "Alert me if a customer's health drops below 50." | ⏳ | Alert rule: customer health threshold |

### Escalations

| Capability | Status | Notes |
|-----------|--------|-------|
| "Show me all active customer escalations." | ✅ | P1/P2 Jira tickets cross-referenced with customers |
| "Acme Corp's CTO just called. Prepare me for the conversation." | ✅ | Customer briefing: health + tickets + incidents + history |
| "What is the escalation history for Meridian Health?" | ✅ | Entity context — all incidents/tickets linked to customer node |
| "Who is the CSM assigned to Acme Corp?" | ✅ | Customer relationship from Knowledge Graph + employee data |

### Renewals

| Capability | Status | Notes |
|-----------|--------|-------|
| "Which renewals are at risk this month?" | ✅ | At-risk customers + renewal dates |
| "When does Acme Corp renew?" | ✅ | Customer record: `contractRenewalDate` |
| "What is the total ARR at risk this quarter?" | ✅ | Sum of at-risk renewal ARR |
| "Create a renewal plan for Pinnacle Logistics." | ✅ | Customer briefing + action card → CSM outreach |
| "What credit should we offer to retain Acme Corp?" | ✅ | ARR × credit % calculation with ROI framing |

### Timeline

| Capability | Status | Notes |
|-----------|--------|-------|
| "Show me the full history of the Acme Corp account." | ✅ | Customer journey replay — CUSTOMER_JOURNEY mode |
| "What was the sequence of events that led to the escalation?" | ✅ | Causal chain from Event Platform + Replay Engine |
| "When did Acme Corp first report the auth issue?" | ✅ | Timeline search in customer entity context |

### CRM Intelligence

| Capability | Status | Notes |
|-----------|--------|-------|
| "What does our CRM say about Pinnacle Logistics?" | 🟡 | HubSpotAdapter partial; Salesforce skeleton; full CRM connect needed |
| "Update the opportunity stage in HubSpot." | ⏳ | `HUBSPOT_UPDATE_DEAL` — planned |
| "Create a follow-up task in the CRM for the Acme call." | ⏳ | `HUBSPOT_CREATE_TASK` — planned |
| "Sync customer health scores to HubSpot." | ⏳ | Outbound sync — planned |

### Customer Briefings

| Capability | Status | Notes |
|-----------|--------|-------|
| "Brief me on all enterprise customers before the QBR." | ✅ | Briefing for each enterprise customer from customer intelligence |
| "Generate a customer status report for the board." | 🟡 | Customer health summary + at-risk count; narrative synthesis |
| "What should I say to Meridian Health about HGRD-234?" | ✅ | HIPAA context + security disclosure guidance |

---

## 11. Knowledge Base — Notion

Notion integration for documentation, decisions, and project management.

| Capability | Status | Notes |
|-----------|--------|-------|
| "Find the architecture decision record for the database migration." | 🟡 | NotionAdapter search; knowledge base documents ingested |
| "Create a post-mortem document for INC-076." | 🟡 | `NOTION_CREATE_PAGE` — available via ExecutionEngine |
| "Update the Release 3.2 runbook with the new deployment strategy." | 🟡 | `NOTION_UPDATE_PAGE` |
| "Search for everything in Notion about CQRS." | 🟡 | NotionAdapter search + semantic retrieval |
| "Create a meeting notes page from today's sprint review." | 🟡 | Meeting summary → `NOTION_CREATE_PAGE` |
| "Publish the deployment runbook." | ⏳ | Page publish with governance |
| "Find all Notion pages tagged 'architecture'." | 🟡 | Database query with filter |
| "Create an RFC for the microservices split." | 🟡 | RFC template + `NOTION_CREATE_PAGE` |

---

## 12. Workforce Intelligence — Workday

Workforce analytics for headcount, performance, and people operations.

| Capability | Status | Notes |
|-----------|--------|-------|
| "What is the current headcount by department?" | 🟡 | WorkdayAdapter partial; employee records from data |
| "Show me the open headcount positions." | 🟡 | Workday headcount integration |
| "Who has been on-call for more than 2 consecutive weeks?" | ✅ | Employee signals from dataset |
| "What is the average tenure in the engineering team?" | 🟡 | Workday integration needed for precise tenure |
| "Are there any engineers with unused vacation days?" | ⏳ | `WORKDAY_GET_LEAVE_BALANCES` — planned |
| "Trigger performance review cycle for the engineering team." | ⏳ | `WORKDAY_INITIATE_REVIEW` — planned |
| "Verify the SRE headcount approval is in Workday." | 🟡 | `WORKDAY_GET_HEADCOUNT` — WorkdayAdapter available |

---

## 13. Trust Center

The Trust Center gives ADMIN users full visibility into what FLOW can see, what it cannot, and why.

### Permissions

| Capability | Status | Notes |
|-----------|--------|-------|
| "What can FLOW read from Slack?" | ✅ | Integration permissions per-connector at `/settings/permissions` |
| "Block FLOW from reading the #exec-private channel." | ✅ | Resource hide via `PUT /api/integration-permissions/slack/resources` |
| "Allow FLOW to read the HANA Jira project." | ✅ | Resource allow via bulk permission update |
| "What would FLOW see if we connected HubSpot?" | ✅ | Discovery catalog via `POST /api/integration-permissions/:connector/discover` |
| "Show me all resources FLOW has access to." | ✅ | Integration permissions overview at `/api/integration-permissions` |

### Connector Health

| Capability | Status | Notes |
|-----------|--------|-------|
| "Are all connectors healthy?" | ✅ | `/api/connectors/health` — polls all registered adapters |
| "Why is the Slack connector showing DEGRADED?" | ✅ | Connector health detail with reason |
| "Reconnect the Gmail connector." | ✅ | OAuth re-initiation flow |
| "Show me the last time each connector synced." | ✅ | Connector registry health with last-sync timestamps |

### Audit Logs

| Capability | Status | Notes |
|-----------|--------|-------|
| "Show me everything FLOW did in the past 7 days." | ✅ | PostgreSQL AuditLog — durable, queryable |
| "Which actions were denied this week?" | ✅ | Audit log filter: `outcome=DENIED` |
| "Who approved the Acme Corp credit?" | ✅ | Approval record with `approvedBy` and timestamp |
| "Show me the complete audit trail for INC-076." | ✅ | Timeline + audit: all connector actions during incident window |
| "Export the audit log for the past month." | 🟡 | CSV export — planned |

### Governance

| Capability | Status | Notes |
|-----------|--------|-------|
| "Show me all active governance policies." | ✅ | `/api/policies` — policy list with evaluation state |
| "Create a policy that requires OWNER approval for all email sends." | ✅ | `POST /api/policies` — OWNER only |
| "Toggle the 'require approval for PR merges' policy." | ✅ | `PATCH /api/policies/:id/toggle` |
| "Which policy blocked this action?" | ✅ | Governance evaluation trace in action audit record |
| "Who needs to approve this action?" | ✅ | Risk tier → approver role resolution |

### Security

| Capability | Status | Notes |
|-----------|--------|-------|
| "Is the WebSocket connection authenticated?" | ✅ | `WS_AUTH_REQUIRED=true` — JWT + workspace verification |
| "Are there any unauthenticated endpoints?" | ✅ | Security audit: `/health`, `/api/auth/*` are public by design; all others require JWT |
| "Show me any requests that bypassed tenant isolation." | ✅ | TenantIsolation middleware — 400 on missing workspace-id |

### Privacy

| Capability | Status | Notes |
|-----------|--------|-------|
| "Can FLOW see private personal messages?" | ✅ | Privacy Gate: `PRIVATE_PERSONAL` → hard drop (no storage, no log) |
| "Show me what FLOW discarded from the privacy gate." | ✅ | `PRIVACY_SHIELD_TRIGGERED` events (no text payload, by design) |
| "Configure Slack DM policy." | ✅ | `dmPolicy`: ALLOW_ALL / DENY_ALL / ALLOW_MUTUAL_FOLLOWERS / ALLOW_EXPLICIT |

### Data Sources

| Capability | Status | Notes |
|-----------|--------|-------|
| "What data sources is FLOW connected to?" | ✅ | Connector registry list at `/api/connectors` |
| "What capabilities does each connector provide?" | ✅ | `/api/connectors/capabilities` |
| "Where is my data stored?" | ✅ | Data store catalog in Trust Center: pgvector / Prisma / Redis / vault files |

---

## 14. Action Engine

The Action Engine is the bridge between FLOW's recommendations and real-world execution. Every action is risk-scored, governed, and audited.

### Recommendations

| Capability | Status | Notes |
|-----------|--------|-------|
| "Show me today's recommended actions." | ✅ | Recommendation Engine — urgency × impact score |
| "What should I act on right now?" | ✅ | Chief of Staff NOW items |
| "Explain why FLOW is recommending this action." | ✅ | XAI explanation on every recommendation |
| "Dismiss this recommendation." | ✅ | Recommendation dismissed → `action.dismissed` efficiency metric |

### Approvals

| Capability | Status | Notes |
|-----------|--------|-------|
| "Show me all pending approvals." | ✅ | `/api/approvals` — pending by workspace |
| "Approve this action." | ✅ | `POST /api/approvals/:id/approve` — self-approval guarded |
| "Reject this request." | ✅ | `POST /api/approvals/:id/reject` |
| "How many approvals need two people?" | ✅ | CRITICAL risk tier — `required_approvals: 2`, distinct approver guard |
| "Who can approve this?" | ✅ | Risk tier → role resolution (MEDIUM=MEMBER, HIGH=ADMIN, CRITICAL=2×ADMIN) |
| "Show me all approvals I've actioned this month." | ✅ | `/api/approvals/history` |

### Execution

| Capability | Status | Notes |
|-----------|--------|-------|
| "Execute this action." | ✅ | ExecutionCoordinator → governance → executeAction → connector |
| "Run a dry-run to preview what this action will do." | ✅ | ExecutionPlanner dry-run |
| "What will happen if I approve this?" | ✅ | Execution plan preview with risk score |
| "Execute the PR merge with squash commit." | ✅ | `GITHUB_MERGE_PR` via ExecutionEngine |
| "Send the Acme email after the CFO approves." | ✅ | Approval gate → `GMAIL_SEND` on approval resolution |

### Rollback

| Capability | Status | Notes |
|-----------|--------|-------|
| "Can this action be rolled back?" | ✅ | ExecutionHistory `rollbackAvailable` — honest assessment |
| "Roll back the last deployment." | ⏳ | Infrastructure rollback connector — planned |
| "Undo the label change on this Jira ticket." | 🟡 | Connector-specific rollback |

### Audit

| Capability | Status | Notes |
|-----------|--------|-------|
| "Show me everything FLOW executed today." | ✅ | ExecutionRecord list + AuditLog |
| "What was the result of the last PR merge?" | ✅ | Execution record with outcome and connector response |
| "Did this action complete successfully?" | ✅ | ExecutionHistory `SUCCESS/FAILED/PENDING` status |

### Activity Timeline

| Capability | Status | Notes |
|-----------|--------|-------|
| "Show me the FLOW activity timeline." | ✅ | `brainTimelineService.getOperationalTimeline()` |
| "What actions were taken during the incident?" | ✅ | Timeline filtered by incident time window |
| "Show me who actioned what this week." | ✅ | Timeline with actor attribution |

---

## 15. Explainability

Every FLOW output is explainable. Every explanation is auditable. FLOW never says "trust me."

### Evidence

| Capability | Status | Notes |
|-----------|--------|-------|
| "Show me the evidence behind this answer." | ✅ | XAI evidence array: source, content, authority weight, timestamp |
| "How many sources back this recommendation?" | ✅ | Evidence diversity count |
| "Show me the raw chunks that informed this answer." | ✅ | Retrieved context chunks with authority scores |
| "Which sources do you trust most?" | ✅ | Authority weight matrix: github/vault (1.5×) > default (1.0×) > slack/email (0.8×) |

### Confidence

| Capability | Status | Notes |
|-----------|--------|-------|
| "How confident are you in this?" | ✅ | 6-dim confidence (data freshness, evidence quality, relationship confidence, reasoning, connector health, overall) |
| "Why is your confidence low on this prediction?" | ✅ | Confidence component breakdown via XAI |
| "What would increase your confidence?" | ✅ | Follow-up: `what_missing` explanation type |
| "Is this a measured fact or an estimate?" | ✅ | Source attribution distinguishes measured vs. inferred |

### Reasoning

| Capability | Status | Notes |
|-----------|--------|-------|
| "Walk me through your reasoning step by step." | ✅ | Reasoning trace: 9-stage COO pipeline output |
| "Show me the decision tree for this recommendation." | ✅ | XAI decision tree in explanation envelope |
| "Why did you recommend this instead of that?" | ✅ | Follow-up: `why` explanation type |
| "What assumptions did you make?" | ✅ | Missing information declared in explanation |

### Sources

| Capability | Status | Notes |
|-----------|--------|-------|
| "Where did this information come from?" | ✅ | Source attribution: connector + resource + timestamp |
| "Show me the original Slack message you're citing." | 🟡 | Source link: chunk metadata links to origin; direct Slack URL requires Slack API |
| "Is this information current?" | ✅ | Data freshness dimension in confidence scoring |

### Traceability

| Capability | Status | Notes |
|-----------|--------|-------|
| "How did FLOW arrive at this health score?" | ✅ | Health score explanation via XAI |
| "Show me the contradiction you detected in this data." | ✅ | CriticAgent contradictions surfaced in explanation |
| "What context did you use to answer this question?" | ✅ | Retrieved chunks + RAG trace |
| "Show me the full explanation envelope for this answer." | ✅ | `POST /api/explain` with full output |

### Decision History

| Capability | Status | Notes |
|-----------|--------|-------|
| "Why did FLOW recommend this 3 months ago?" | ✅ | Decision record with evidence snapshot at decision time |
| "How has FLOW's recommendation on Atlas changed over time?" | ✅ | Decision history + Replay Engine |
| "What outcomes followed FLOW's last recommendation?" | 🟡 | Outcome tracking — learning loop in development |

---

## 16. Autonomous Operations

FLOW can take governed, audited actions across every connected system. All autonomous actions require risk-appropriate approval. Governance is never bypassed.

> **Governance Rule:** LOW risk = auto-execute · MEDIUM risk = user confirms · HIGH risk = 1×ADMIN approval · CRITICAL risk = 2×distinct ADMIN approvals.

### GitHub

| Capability | Status | Notes |
|-----------|--------|-------|
| "Review PR #847 and tell me if it's safe to merge." | ✅ | Merge readiness score + risk analysis |
| "Assign a reviewer to PR #847." | ✅ | `GITHUB_REQUEST_REVIEW` — LOW risk, auto |
| "Approve PR #894." | ✅ | `GITHUB_APPROVE_PR` — MEDIUM risk, confirm |
| "Merge PR #894 with squash." | ✅ | `GITHUB_MERGE_PR` — HIGH risk, 1×ADMIN |
| "Create a release branch for v3.2." | ✅ | `GITHUB_CREATE_BRANCH` — MEDIUM risk |
| "Create a pull request for the hotfix." | ✅ | `GITHUB_CREATE_PR` — MEDIUM risk |
| "Update the PR description with the post-mortem findings." | ✅ | `GITHUB_UPDATE_PR` — LOW risk |
| "Request changes on this PR with comments." | ✅ | `GITHUB_REVIEW_PR` — MEDIUM risk |
| "Create a release tag for v3.2.0." | ⏳ | `GITHUB_CREATE_RELEASE` — planned |
| "Generate and publish release notes." | ⏳ | AI synthesis → GitHub release body |
| "Search the codebase for usages of deprecated API." | ✅ | `GITHUB_SEARCH_CODE` — LOW risk |
| "Sync the latest commits and PRs to FLOW memory." | ✅ | `GITHUB_SYNC` — LOW risk, auto |

### Gmail

| Capability | Status | Notes |
|-----------|--------|-------|
| "Draft an email to the Acme Corp CTO." | ✅ | `GMAIL_CREATE_DRAFT` — LOW risk |
| "Send the incident post-mortem to all affected customers." | ✅ | `GMAIL_SEND` — HIGH risk, 1×ADMIN (bulk customer comms) |
| "Reply to the Meridian Health security inquiry." | ✅ | `GMAIL_REPLY` — HIGH risk for security topics |
| "Reply all to the all-hands email thread." | ✅ | `GMAIL_REPLY_ALL` — MEDIUM risk |
| "Forward the incident report to the board." | ✅ | `GMAIL_FORWARD` — MEDIUM risk |
| "Archive this resolved thread." | ✅ | `GMAIL_MODIFY_LABELS` — LOW risk, auto |
| "Mark the Acme Corp thread as high priority." | ✅ | `GMAIL_MODIFY_LABELS` — LOW risk |
| "Follow up with Pinnacle Logistics if no response in 48 hours." | ⏳ | Scheduled follow-up workflow |
| "Sync the inbox and extract action items." | ✅ | `GMAIL_SYNC` → ingestion pipeline |

### Slack

| Capability | Status | Notes |
|-----------|--------|-------|
| "Send a message to #engineering about the deployment window." | 🟡 | `SLACK_SEND_MESSAGE` — LOW risk for team channels |
| "Reply to the PR review thread." | 🟡 | `SLACK_REPLY_THREAD` — LOW risk |
| "Notify the on-call engineer of the incident." | 🟡 | `SLACK_SEND_DM` — MEDIUM risk; DM policy enforced |
| "Post the weekly engineering update to Slack." | 🟡 | `SLACK_SEND_MESSAGE` — MEDIUM risk (announcements) |
| "Schedule an announcement for Monday at 9 AM." | ⏳ | `SLACK_SCHEDULE_MESSAGE` — planned |
| "Create a new Slack channel for Atlas GA." | ⏳ | `SLACK_CREATE_CHANNEL` — HIGH risk |
| "Archive the #release-3-2 channel after launch." | ⏳ | `SLACK_ARCHIVE_CHANNEL` — HIGH risk |

### Calendar

| Capability | Status | Notes |
|-----------|--------|-------|
| "Schedule a 1:1 with David Park." | ✅ | `CALENDAR_CREATE_EVENT` — LOW risk |
| "Invite the SRE team to the deployment review." | ✅ | Event creation with attendee list |
| "Cancel the December 24 all-hands." | ✅ | `CALENDAR_DELETE_EVENT` — MEDIUM risk |
| "Move the sprint review from Tuesday to Thursday." | ✅ | `CALENDAR_UPDATE_EVENT` — MEDIUM risk |
| "Create a recurring weekly engineering sync." | ✅ | Event with recurrence rules |
| "Block December 23-28 as a code freeze window." | ✅ | Multi-day calendar event — MEDIUM risk |
| "Send meeting prep materials to all attendees." | ⏳ | Calendar + Gmail: prep context → email |

### Jira

| Capability | Status | Notes |
|-----------|--------|-------|
| "Create a Jira ticket for the memory exhaustion bug." | 🟡 | `JIRA_CREATE_ISSUE` — LOW risk |
| "Assign HPLT-899 to Kenji Watanabe." | 🟡 | `JIRA_ASSIGN_ISSUE` — LOW risk |
| "Move HPLT-892 to Done." | 🟡 | `JIRA_TRANSITION_ISSUE` — LOW risk |
| "Add a comment to HGRD-234 with the security disclosure status." | 🟡 | `JIRA_ADD_COMMENT` — LOW risk |
| "Escalate HGRD-234 to Critical priority." | 🟡 | `JIRA_UPDATE_ISSUE` — MEDIUM risk |
| "Create a sub-task for the load test action item." | 🟡 | `JIRA_CREATE_SUBTASK` — LOW risk |
| "Close Sprint 8 and start Sprint 9." | ⏳ | `JIRA_CLOSE_SPRINT` → `JIRA_START_SPRINT` — HIGH risk |
| "Create tickets for all post-mortem action items." | ⏳ | Multi-create from meeting action items |

### Notion

| Capability | Status | Notes |
|-----------|--------|-------|
| "Create a post-mortem page for INC-076." | 🟡 | `NOTION_CREATE_PAGE` — LOW risk |
| "Update the deployment runbook with the rolling restart requirement." | 🟡 | `NOTION_UPDATE_PAGE` — LOW risk |
| "Create an RFC for the Atlas auth extraction." | 🟡 | RFC template → `NOTION_CREATE_PAGE` |
| "Publish the meeting notes from today's sprint review." | 🟡 | `NOTION_PUBLISH_PAGE` — MEDIUM risk |
| "Create a decision record from this discussion." | 🟡 | `NOTION_CREATE_PAGE` — LOW risk |
| "Create the Q1 engineering roadmap page." | ⏳ | Roadmap template + FLOW intelligence |
| "Update all Atlas documentation with the new architecture." | ⏳ | Multi-page update — HIGH risk |

### Infrastructure

| Capability | Status | Notes |
|-----------|--------|-------|
| "Deploy Release 3.2 to production." | ⏳ | `INFRA_DEPLOY_RELEASE` — CRITICAL risk, 2×ADMIN |
| "Rollback to v3.1.9 immediately." | ⏳ | `INFRA_ROLLBACK` — CRITICAL risk, emergency override |
| "Restart the Platform API pods with rolling restart." | ⏳ | `INFRA_ROLLING_RESTART` — HIGH risk, 1×ADMIN |
| "Scale the workflow workers from 3 to 6 replicas." | ⏳ | `INFRA_SCALE_WORKERS` — HIGH risk |
| "Rotate the database credentials." | ⏳ | `INFRA_ROTATE_SECRETS` — CRITICAL risk |
| "Show me current pod memory usage." | ⏳ | Infrastructure connector — planned |

### CRM

| Capability | Status | Notes |
|-----------|--------|-------|
| "Update the Acme Corp opportunity to Renewal — At Risk." | ⏳ | `HUBSPOT_UPDATE_DEAL` — MEDIUM risk |
| "Create a follow-up task for the Pinnacle Logistics call." | ⏳ | `HUBSPOT_CREATE_TASK` — LOW risk |
| "Notify the account owner that Acme's health score dropped." | ⏳ | CRM + Slack notification |
| "Log the call summary to Salesforce." | ⏳ | `SALESFORCE_LOG_CALL` — LOW risk |

---

## 17. Multi-Step Workflows

Multi-step workflows coordinate actions across multiple systems. Every step in a workflow goes through governance individually.

### Engineering Operations

| Workflow | Status | Systems |
|----------|--------|---------|
| "Review all open PRs, approve safe ones, notify Slack." | ⏳ | GitHub → Execution Engine → Slack |
| "Find PRs ready to merge, merge them, update Jira tickets." | ⏳ | GitHub → GitHub → Jira |
| "Create a release branch, cherry-pick the hotfix, open a PR, assign reviewers." | ⏳ | GitHub × 4 actions |
| "When PR #847 merges, deploy to staging, run smoke tests, notify #engineering." | ⏳ | GitHub → Infrastructure → Slack |
| "Close Sprint 8, move incomplete items to Sprint 9, notify the team." | ⏳ | Jira → Jira → Slack |
| "Generate sprint velocity report and post it to #engineering." | 🟡 | FLOW Intelligence → Slack |
| "Detect stale PRs over 7 days, notify owners, add labels." | ⏳ | GitHub → Slack → GitHub |
| "When a PR is approved, create a Jira sub-task to update the changelog." | ⏳ | GitHub → Jira |
| "Compile all merged PRs this week into a changelog and post to Notion." | ⏳ | GitHub → Notion |
| "Tag the release, generate release notes, create GitHub release, notify Slack." | ⏳ | GitHub × 3 → Slack |

### Incident Response

| Workflow | Status | Systems |
|----------|--------|---------|
| "Detect production issue, open incident, notify on-call, create Jira ticket." | ⏳ | Event Platform → Jira → Slack |
| "When incident is resolved, generate post-mortem, create Notion page, schedule review meeting." | ⏳ | Incident Engine → Notion → Calendar |
| "During incident: send customer status update, update status page, notify Slack." | ⏳ | Gmail → Status Page → Slack |
| "After incident: create action items in Jira, assign owners, schedule follow-up." | ⏳ | Jira → Calendar |
| "Monitor deployment; if error rate exceeds 5%, trigger rollback, alert on-call." | ⏳ | Infrastructure → Infrastructure → Slack |
| "Pull error logs, identify root cause, create Jira ticket with analysis." | ⏳ | Infrastructure → FLOW Intelligence → Jira |
| "Detect memory alert, check incident history for pattern, notify SRE lead." | ✅ | Event Platform → Memory → Notification Engine |
| "Open incident Slack channel, pin status updates, archive when resolved." | ⏳ | Slack × 3 |
| "After MTTR: update incident record, log to post-mortem template, send SLA report to customers." | ⏳ | Incident Engine → Notion → Gmail |

### Customer Success

| Workflow | Status | Systems |
|----------|--------|---------|
| "Generate customer health report and notify account managers via Slack." | ✅ | Customer Intelligence → Slack |
| "Detect at-risk renewal, create escalation Jira ticket, notify CSM." | ✅ | Prediction Engine → Jira → Notification Engine |
| "Prepare for Acme Corp call: pull health data, summarize tickets, draft agenda email." | ✅ | Customer Intelligence → Gmail |
| "After customer call: log notes to CRM, create follow-up tasks in Jira, send recap email." | ⏳ | CRM → Jira → Gmail |
| "When customer health drops below 50, trigger escalation: notify CSM, create Jira ticket, schedule call." | ⏳ | Alert → Jira → Calendar |
| "Send monthly customer health digest to all account managers." | ⏳ | Customer Intelligence → Gmail (bulk) |
| "Detect customer churn signal, draft retention email, route for approval." | 🟡 | Prediction → Gmail draft → Approval |
| "Generate renewal package: health report + incident summary + credit offer." | ✅ | Customer Intelligence → XAI → Gmail draft |
| "After security disclosure approval: send to customer, log in Jira, schedule confirmation call." | ✅ | Approval → Gmail → Jira → Calendar |
| "When customer opens a P1 ticket: notify engineering lead, update Jira priority, send acknowledgment email." | ⏳ | Jira (webhook) → Slack → Jira → Gmail |

### Executive Operations

| Workflow | Status | Systems |
|----------|--------|---------|
| "Generate morning brief, summarize key risks, email it to the executive team." | 🟡 | Brain → Gmail (requires approval for exec-level email) |
| "Prepare executive briefing and schedule a 30-min debrief with the team." | ✅ | Brain → Calendar |
| "After board meeting: capture decisions, create Notion page, assign follow-up tasks." | 🟡 | Meeting notes → Notion → Jira |
| "Every Sunday: generate weekly review, post to #exec-team Slack channel." | ⏳ | Weekly Review → Slack (scheduled) |
| "Compile quarterly business review: health trends + customer risks + engineering velocity." | 🟡 | Multi-domain intelligence → Notion |
| "Generate investor update: key metrics + notable wins + risks + asks." | ⏳ | Intelligence + Prediction → Notion/Gmail |
| "Before all-hands: pull company health, top wins, top risks, prepare talking points." | ✅ | Workspace Cache + Council → Document |
| "After all-hands: post recording link, share action items, schedule follow-ups." | ⏳ | Slack → Jira → Calendar |

### Communication Workflows

| Workflow | Status | Systems |
|----------|--------|---------|
| "Read emails, create Jira tickets for action items, assign owners, notify Slack." | ⏳ | Gmail → Jira → Slack |
| "Summarize all Slack threads from the past 24 hours and email a digest." | 🟡 | Slack → Gmail |
| "When a customer replies to an email, create a Jira ticket and notify the CSM." | ⏳ | Gmail (webhook) → Jira → Slack |
| "After approval: send email to customer, log to CRM, update Jira ticket." | ✅ | Approval → Gmail → CRM → Jira |
| "Draft weekly customer newsletter from FLOW's intelligence, route for approval, send." | ⏳ | Intelligence → Gmail draft → Approval → Send |

### Planning Workflows

| Workflow | Status | Systems |
|----------|--------|---------|
| "Summarize meetings from this week, create follow-up tasks, schedule next meetings." | ✅ | Calendar → Calendar actions stored → Jira |
| "Sprint planning: pull backlog, rank by customer impact, generate draft plan, post to Slack." | 🟡 | Jira → Customer Intelligence → Slack |
| "Create Q1 roadmap: pull predictions, identify risks, draft timeline, share with team." | ⏳ | Prediction → Notion → Slack |
| "Before planning meeting: analyze velocity, surface blockers, prepare agenda." | ✅ | Engineering Intelligence → Calendar meeting notes |
| "After planning: create sprint tickets, assign owners, set due dates, notify team." | ⏳ | Jira × N → Slack |
| "Generate the OKR review: pull goal progress, flag at-risk objectives, schedule discussion." | 🟡 | Goal Tracking → Calendar → Slack |
| "Find all decisions made this month and compile into a decision log." | ✅ | Decision Engine → Notion page |

### Security & Compliance

| Workflow | Status | Notes |
|----------|--------|-------|
| "Detect permission drift, audit affected accounts, notify CISO." | 🟡 | Governance → Audit → Slack |
| "Security disclosure: review finding, draft email, route for OWNER approval, send." | ✅ | Jira → Gmail (HIGH risk → OWNER approval) |
| "When HIGH-risk action is denied: log to audit, notify security team, create Jira review ticket." | ✅ | Governance → Audit → Jira → Notification |
| "Rotate API credentials, update environment variables, restart services, notify team." | ⏳ | Infrastructure × 3 → Slack |
| "Scan for expired OAuth tokens, notify connector owners, trigger re-authorization." | ⏳ | Connector health → Notification |
| "Monthly compliance review: pull audit log, flag anomalies, generate report, notify CISO." | ⏳ | Audit → Intelligence → Notion → Slack |

### Hiring & HR Workflows

| Workflow | Status | Notes |
|----------|--------|-------|
| "Detect burnout signal, notify manager, schedule check-in, monitor for 2 weeks." | 🟡 | Prediction → Slack → Calendar |
| "When SRE position is approved: create Workday req, draft JD, post to LinkedIn." | ⏳ | Workday → Document → LinkedIn |
| "After interview: compile feedback, route for decision, send offer if approved." | ⏳ | Calendar → Decision → Workday/Gmail |
| "Performance review cycle: pull data, generate summaries, schedule 1:1s." | ⏳ | Workday → Intelligence → Calendar |

### Knowledge Management

| Workflow | Status | Notes |
|----------|--------|-------|
| "Prepare release notes, tag GitHub release, publish Notion documentation." | ⏳ | Intelligence → GitHub → Notion |
| "Detect undocumented incidents, create post-mortem templates, assign owners." | ⏳ | Incident Engine → Notion → Jira |
| "After architecture decision: document in Notion, notify team in Slack, link to Jira." | 🟡 | Decision Engine → Notion → Slack → Jira |
| "Weekly knowledge digest: new documents + decisions + incidents, posted to #team." | ⏳ | Knowledge Search → Slack |
| "Find all outdated documentation, flag for review, create Jira tasks, assign owners." | ⏳ | Knowledge Explorer → Jira |

---

## 18. Long-Term Operational Brain

The vision for FLOW as a continuously running operational intelligence that learns, adapts, and acts on behalf of the organization.

### Autonomous Goal Planning

| Capability | Status | Notes |
|-----------|--------|-------|
| "Set a company goal: reduce incident MTTR by 50% in Q1." | 🟡 | Goal Tracking with milestones + evaluation via `goalTrackingService` |
| "Track progress toward the Release 3.2 launch goal." | ✅ | Goal evaluation with risks/blockers/predicted completion |
| "Alert me if we're falling behind on an OKR." | ⏳ | Goal-alert integration with Notification Engine |
| "Automatically adjust sprint planning when a goal is off track." | ⏳ | Adaptive planning — long-term roadmap |

### Multi-Agent Collaboration

| Capability | Status | Notes |
|-----------|--------|-------|
| "Ask the entire executive council what to do about the release delay." | ✅ | 6-agent council debate → synthesis — Phase 15 |
| "Have Engineering and Operations COOs debate the deployment strategy." | ✅ | Agent-to-agent debate via `debateEngine` |
| "Run a cross-functional risk assessment." | ✅ | Council: all 6 agents assess in parallel |
| "Route this question to the most relevant specialist." | ✅ | `councilRouter` deterministic routing |
| "Have agents autonomously monitor their domains and surface alerts." | ⏳ | Agent-as-monitor pattern |

### Organization Memory

| Capability | Status | Notes |
|-----------|--------|-------|
| "Remember that we decided to use CQRS for the Atlas event store." | ✅ | OrgMemoryService `createMemoryRecord` |
| "Search all decisions from the past 12 months." | ✅ | Memory search across durable PostgreSQL records |
| "What analogues from our past help with this situation?" | ✅ | Simulation Engine uses memory for analogues |
| "Learn from what happened after our last recommendation." | ⏳ | Outcome tracking → learning loop |
| "Show me FLOW's memory of how we handle incidents." | ✅ | Memory records filtered by `MemoryRecordType` |

### Human Approval Gates

| Capability | Status | Notes |
|-----------|--------|-------|
| "Always ask me before sending emails to customers." | ✅ | Policy: REQUIRE_APPROVAL on `GMAIL_SEND` for customer recipients |
| "Never deploy without two senior engineers approving." | ✅ | CRITICAL risk tier — 2×distinct ADMIN |
| "Alert me when any action over $10K is about to execute." | ⏳ | Financial impact threshold alert |
| "Let me review all AI-generated content before it goes public." | ⏳ | Content review gate on AI-generated actions |

### Policy Engine

| Capability | Status | Notes |
|-----------|--------|-------|
| "Create a policy that blocks all Friday afternoon deployments." | ✅ | Governance policy via `POST /api/policies` |
| "Add a policy: production PR merges require 2 reviewers." | ✅ | Policy with `effect: REQUIRE_APPROVAL` |
| "Version control our governance policies." | ⏳ | Policy versioning with `version + parentId` |
| "Test what impact a new policy would have before enabling it." | ⏳ | Policy simulation mode |

### Risk-Based Execution

| Capability | Status | Notes |
|-----------|--------|-------|
| "Only auto-execute actions with risk score below 30." | ✅ | LOW risk tier — auto-execute |
| "Flag anything that touches production for manual approval." | ✅ | Policy: production resource = HIGH risk |
| "Never auto-execute in the last 48 hours before a release." | ⏳ | Time-based execution gate |
| "Require two-factor confirmation for any customer data action." | ⏳ | MFA condition on governance policy |

### Self-Healing Workflows

| Capability | Status | Notes |
|-----------|--------|-------|
| "When memory usage exceeds 70%, automatically alert SRE lead." | ✅ | Alert rule via `alerts.js` + Notification Engine |
| "If a connector goes DEGRADED, attempt re-authentication." | ⏳ | Auto-remediation connector workflow |
| "When a P1 incident is detected, automatically open an incident and notify on-call." | ⏳ | Incident trigger → multi-step response |
| "Retry failed actions automatically for transient errors." | 🟡 | BullMQ retry logic; connector-level retry planned |

### Predictive Operations

| Capability | Status | Notes |
|-----------|--------|-------|
| "Predict the next incident before it happens." | ✅ | `incidentRisk` prediction model |
| "Forecast team capacity for Q1 given current hiring plan." | ✅ | ForecastEngine projection |
| "Warn me 2 weeks before a customer health score becomes critical." | ✅ | Prediction Engine proactive worker (`PREDICTION_WARN_THRESHOLD`) |
| "Surface opportunities, not just risks." | 🟡 | Opportunity prediction models planned |

### Learning From Decisions

| Capability | Status | Notes |
|-----------|--------|-------|
| "Track whether FLOW's recommendations led to good outcomes." | ⏳ | Outcome tracking + learning loop |
| "Improve recommendation weights based on what actually worked." | ⏳ | Feedback loop — next-generation roadmap |
| "Show me FLOW's accuracy on past predictions." | ⏳ | Prediction accuracy scoring |
| "Learn our company's specific risk tolerance from past approvals." | ⏳ | Policy learning from approval patterns |

### Workflow Automation

| Capability | Status | Notes |
|-----------|--------|-------|
| "Automate the entire weekly review process." | ✅ | Weekly Review via `weeklyReviewService` |
| "Run the sprint planning workflow automatically every Monday." | ⏳ | Scheduled automation workflow |
| "Trigger the customer renewal workflow 30 days before expiry." | ⏳ | Calendar-triggered automation |
| "Run the incident response workflow whenever P1 is detected." | ⏳ | Event-triggered automation |

### AI Delegation

| Capability | Status | Notes |
|-----------|--------|-------|
| "Delegate all routine PR reviews to FLOW." | ⏳ | Autonomous PR review agent |
| "Let FLOW handle all Tier-1 customer support responses." | ⏳ | Support automation — long-term roadmap |
| "Delegate the engineering standup summary to FLOW." | 🟡 | Standup summary from Slack/Jira data |
| "Let FLOW monitor metrics and only escalate anomalies." | ⏳ | Autonomous monitoring with escalation gate |

### Continuous Company Monitoring

| Capability | Status | Notes |
|-----------|--------|-------|
| "Watch everything and tell me what matters." | ✅ | Living Workspace Simulator + Event Platform always-on |
| "Alert me the moment an incident is detected." | ✅ | Incident Engine → Notification Engine → WebSocket |
| "Monitor Acme Corp's health and alert if anything changes." | ✅ | Customer health monitoring + alert rule |
| "Track all changes to production since last week." | ✅ | Event Platform + Replay Engine |
| "Watch for any mention of security vulnerabilities in our codebase." | 🟡 | Ingestion pipeline keyword detection |

### Autonomous Incident Response

| Capability | Status | Notes |
|-----------|--------|-------|
| "Detect incident → open ticket → notify on-call → draft customer comms — automatically." | ⏳ | Full incident response automation |
| "Classify incident severity and route to appropriate on-call engineer." | 🟡 | Incident classification exists; routing automation planned |
| "Auto-escalate if MTTR exceeds SLA threshold." | ⏳ | SLA-aware incident escalation |
| "Generate and send the all-clear notification when resolved." | ⏳ | Resolution trigger → notification workflow |

### Cross-Connector Reasoning

| Capability | Status | Notes |
|-----------|--------|-------|
| "Connect the dots: that Slack message → Jira ticket → GitHub PR → deployment → incident." | ✅ | Event Platform correlation + Graph Engine causation chain |
| "Why did that customer complaint appear 3 hours after the deployment?" | ✅ | Temporal graph analysis: deploy → customer event |
| "Which email thread started the Atlas project?" | ✅ | Customer journey replay in CUSTOMER_JOURNEY mode |
| "Map everything that touched the auth service this week." | ✅ | Impact path from auth service node in Graph Engine |

### Organization Digital Twin

| Capability | Status | Notes |
|-----------|--------|-------|
| "Show me the company's live digital twin." | ✅ | Operational Graph Engine — 21 node types, 19 edge types |
| "How is the company connected? Who talks to whom?" | ✅ | RelationshipScorer across collaborator edges |
| "What are the single points of failure in our organizational structure?" | ✅ | Bus factor analysis + EMPLOYEE_DEPARTURE simulation |
| "Replay the company's history from 6 months ago to today." | ✅ | Replay Engine — 6-month historical playback |
| "What does the company look like without Rahul?" | ✅ | Simulation Engine — EMPLOYEE_DEPARTURE |

---

## 19. Capability Statistics

> Last updated: 2026-07-20. Update this table after each major release.

### By Status

| Status | Count | Percentage |
|--------|-------|------------|
| ✅ Production Ready | — | — |
| 🟡 Partially Implemented | — | — |
| 🚧 In Development | — | — |
| ⏳ Planned | — | — |
| **Total Capabilities** | **—** | **—** |

### By Section

| Section | ✅ | 🟡 | 🚧 | ⏳ | Total |
|---------|---|---|---|---|-------|
| Executive Intelligence | — | — | — | — | — |
| Chief of Staff | — | — | — | — | — |
| Knowledge & Search | — | — | — | — | — |
| Operational Intelligence | — | — | — | — | — |
| Engineering — GitHub | — | — | — | — | — |
| Work Management — Jira | — | — | — | — | — |
| Communication — Gmail | — | — | — | — | — |
| Collaboration — Slack | — | — | — | — | — |
| Calendar | — | — | — | — | — |
| Customer Intelligence | — | — | — | — | — |
| Knowledge Base — Notion | — | — | — | — | — |
| Workforce Intelligence | — | — | — | — | — |
| Trust Center | — | — | — | — | — |
| Action Engine | — | — | — | — | — |
| Explainability | — | — | — | — | — |
| Autonomous Operations | — | — | — | — | — |
| Multi-Step Workflows | — | — | — | — | — |
| Long-Term Brain | — | — | — | — | — |

### By Connector

| Connector | Actions Available | Actions Planned | Status |
|-----------|-----------------|----------------|--------|
| GitHub | 20+ | 5 | ✅ Production |
| Gmail | 15+ | 3 | ✅ Production |
| Google Calendar | 14+ | 2 | ✅ Production |
| Jira | 10+ | 8 | 🟡 Partial |
| Notion | 8+ | 4 | 🟡 Partial |
| Slack | 6+ | 5 | 🟡 Partial |
| Workday | 3+ | 6 | 🟡 Partial |
| HubSpot | 2+ | 8 | 🟡 Partial |
| Confluence | 0 | 5 | ⏳ Planned |
| Salesforce | 0 | 8 | ⏳ Planned |
| Google Drive | 0 | 4 | ⏳ Planned |
| BambooHR | 0 | 5 | ⏳ Planned |
| Infrastructure | 0 | 8 | ⏳ Planned |
| **Total** | **—** | **—** | — |

### Workflows

| Workflow Category | Count | Status |
|------------------|-------|--------|
| Engineering Operations | 10 | ⏳ Planned |
| Incident Response | 9 | 🟡 / ⏳ |
| Customer Success | 10 | 🟡 / ⏳ |
| Executive Operations | 8 | 🟡 / ⏳ |
| Communication | 5 | 🟡 / ⏳ |
| Planning | 7 | 🟡 / ⏳ |
| Security & Compliance | 6 | 🟡 / ⏳ |
| HR & Hiring | 4 | ⏳ Planned |
| Knowledge Management | 5 | ⏳ Planned |
| **Total Workflows** | **64** | — |

### Overall FLOW Completion

> Percentage of shipped vs. total documented capabilities. Update each sprint.

```
Overall FLOW Completion: —%

Intelligence Layer:     ██████████ —%
Connector Reads:        ████████░░ —%
Connector Writes:       ███████░░░ —%
Autonomous Workflows:   ████░░░░░░ —%
Long-Term Brain:        ███░░░░░░░ —%
```

---

## 20. North Star

Every interaction with FLOW follows this operational lifecycle. Every capability in this document is a point on this cycle.

```
         Understand
             │
             ▼
           Reason
             │
             ▼
         Recommend
             │
             ▼
    Ask for Approval
             │
             ▼
           Execute
             │
             ▼
            Verify
             │
             ▼
            Notify
             │
             ▼
             Audit
             │
             ▼
            Learn
             │
             ▼
   Continuously Improve
             │
             └──────────────────────────┐
                                        │
                                   Understand
```

**Understand** — FLOW ingests signals from every connected system continuously. Nothing important is missed.

**Reason** — FLOW cross-references signals, detects patterns, and constructs grounded explanations. No hallucination.

**Recommend** — FLOW surfaces what matters. Every recommendation is actionable, evidence-backed, and timed correctly.

**Ask for Approval** — FLOW knows what it can do alone and what needs human judgment. The approval gate is the conscience of the system.

**Execute** — FLOW acts through the governed connector framework. Every action is risk-scored, audited, and traceable.

**Verify** — FLOW confirms outcomes. Success is verified. Failure is surfaced.

**Notify** — The right people are informed at the right time. Noise is eliminated.

**Audit** — Every action lives forever in the audit log. Transparency is non-negotiable.

**Learn** — FLOW improves with every decision. Past outcomes shape future recommendations.

**Continuously Improve** — The cycle restarts. The company gets smarter every day.

---

*FLOW OS Capability Matrix — Single Source of Truth*
*Maintained by the FLOW Engineering Team*
*Update frequency: Each major release*
*Repository: `/docs/FLOW_CAPABILITY_MATRIX.md`*
