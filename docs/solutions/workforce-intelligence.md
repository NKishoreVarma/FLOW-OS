# Workforce Intelligence — Solution Specification
## FLOW OS Solutions Library

> **STATUS: DESIGN ONLY**
> This is a business solution specification, not a feature plan.
> Deep-dive engineering spec: [`docs/EMPLOYEE_LIFECYCLE_INTELLIGENCE.md`](../EMPLOYEE_LIFECYCLE_INTELLIGENCE.md)
> Capability layer: Phase 6.0 (WorkdayAdapter, BambooHRAdapter)

---

## Problem Statement

People operations in mid-market companies operate on disconnected systems: Workday or BambooHR for headcount records, Slack for communication, GitHub and Jira for work output, Google Workspace for collaboration. Nobody has a single operational view of how people actually work — who depends on whom, what knowledge lives where, and what changes in headcount will break what.

HR teams make consequential decisions (hiring, promotion, offboarding) with lagging data. They know org charts but not collaboration graphs. They know job titles but not actual influence. They know who was fired but not what breaks when they leave.

**FLOW's advantage:** It already has all of this. The Operational Graph contains real collaboration data. Org Memory has the decisions and incidents. The vector store holds institutional knowledge. Workforce Intelligence is the layer that surfaces this data in the context of people operations.

---

## Module Scope

```
Workforce Intelligence
├── Org Health Dashboard           — real-time people pulse
├── Employee Lifecycle             — onboarding + offboarding + role changes
│   └── Deep-dive spec: EMPLOYEE_LIFECYCLE_INTELLIGENCE.md
├── Performance Intelligence       — output scoring from actual work signals
├── Headcount Intelligence         — capacity, coverage, SPOF analysis
└── Culture & Collaboration        — team dynamics from graph data
```

---

## Signature Workflows

### 1. Intelligent Offboarding (Priority: Post-Beta)

**Trigger:** HR marks employee as leaving  
**FLOW action:** Discover all owned assets → generate ranked transfer plan → get manager approval → execute revocations + transfers → issue compliance certificate  
**What competitors miss:** Knowledge Transfer Report, graph-based successor suggestions, hidden dependency detection  
**Full spec:** [`docs/EMPLOYEE_LIFECYCLE_INTELLIGENCE.md`](../EMPLOYEE_LIFECYCLE_INTELLIGENCE.md)

### 2. Onboarding Intelligence

**Trigger:** New hire record created in Workday/BambooHR  
**FLOW action:**
- Auto-provision access to GitHub org, Jira projects, Notion workspace, Slack channels based on role template
- Generate "Getting Started" brief: who the new hire should meet, what projects they're on, what documentation to read first
- Create onboarding Knowledge Graph: connect new hire node to team node, project nodes, manager node
- 30-day check-in: compare new hire's actual collaboration graph vs expected (who have they actually worked with?)

**Differentiation:** No onboarding tool generates a brief from real project data. "You're on the payments team — here are the 8 Notion pages about the payments system, the 3 engineers who have the most commits, and the 2 recurring meetings you should join."

### 3. Headcount SPOF Detection

**Trigger:** Weekly scheduled job (or on-demand)  
**FLOW action:**
- Scan Operational Graph for all assets with a single owner/contributor
- Score criticality: `productionSystem × soleOwner × lastCommitAge`
- Surface: "James K. is the only engineer who has committed to auth-service in 6 months. If James leaves, auth-service has no owner."
- Recommend: "Add Marcus W. as co-maintainer. He has reviewed James's last 4 PRs."

**Differentiation:** HR tools don't know what code James owns. FLOW does.

### 4. Performance Intelligence (Graph-Based)

**Trigger:** Manager requests team performance view  
**FLOW action:**
- Pull actual work signals: PR merge rate, code review participation, Jira throughput, meeting attendance vs contribution
- Cross-reference with OrgMemory: decisions authored, incidents investigated, projects delivered
- Produce: "Sarah's output velocity is in the 85th percentile for the engineering team. Her code review contributions are below average relative to her seniority."

**Differentiation:** Not manager sentiment. Not peer ratings. Actual work output signals from connected tools.

### 5. Org Health Score

**Trigger:** Real-time, surfaced on Executive Dashboard  
**FLOW action:**
- Aggregate signals: team collaboration density, knowledge concentration risk, attrition risk (based on communication pattern changes), project delivery risk
- Surface: Org Health Score (0–100) with drill-down by department
- Alert: "Engineering team collaboration score dropped 23% this week. This preceded the last two departures by 3 weeks."

---

## Reused FLOW Components

| Component | Role |
|---|---|
| WorkdayAdapter / BambooHRAdapter | Source of headcount events |
| Operational Graph | Real collaboration data per employee |
| Org Memory | Decisions/incidents per employee |
| Vector Store | Knowledge attribution per employee |
| Execution Engine | Provision/revoke access across connectors |
| Governance Engine | REQUIRE_APPROVAL for sensitive HR actions |
| Operational Brain | Briefing + copilot for HR and managers |
| Audit Persistence | Compliance trail for every HR action |

---

## New Services Required

| Service | Purpose |
|---|---|
| `lifecycleEventService.js` | Already in Employee Lifecycle spec |
| `assetDiscoveryService.js` | Already in Employee Lifecycle spec |
| `orgHealthService.js` | Compute org health score from graph + memory signals |
| `onboardingService.js` | Generate onboarding brief + provision access |
| `headcountRiskService.js` | SPOF detection + coverage gap analysis |
| `performanceSignalService.js` | Aggregate work signals per employee per period |

---

## API Additions

```
GET  /api/workforce/org-health              — Org health score + department breakdown
GET  /api/workforce/headcount-risk          — SPOF list + coverage gaps
GET  /api/workforce/employees/:id/profile   — Full intelligence profile per employee
GET  /api/workforce/employees/:id/graph     — Graph context (who they work with + what they own)
GET  /api/workforce/performance/:teamId     — Team performance signals
POST /api/workforce/onboarding              — Trigger onboarding flow for new hire
POST /api/workforce/lifecycle/events        — Already in Employee Lifecycle spec
```

---

## Competitive Differentiation

**vs. Workday / BambooHR:** They are systems of record. FLOW is a system of intelligence. FLOW knows what the person actually does, not just their HR metadata.

**vs. Lattice / 15Five (performance):** They collect surveys and structured reviews. FLOW derives signals from real work: commits, PRs, reviews, meetings, decisions. No one has to fill out a form.

**vs. OrgVitals / Pyn (org health):** They analyze Slack activity. FLOW analyzes the full operational graph — code, issues, meetings, decisions — and explains *why* a team's health is changing, not just that it changed.

---

## Roadmap Stage

**Phase 6.0** (Current): Adapter infrastructure for Workday/BambooHR — skeleton done  
**Phase 11.1** (Post-Beta): Employee Lifecycle Intelligence MVP (offboarding)  
**Phase 11.2** (Post-Beta): Full Workforce Intelligence module (all 5 workflows above)

---

*Last updated: 2026-07-01 · Status: DESIGN ONLY*
