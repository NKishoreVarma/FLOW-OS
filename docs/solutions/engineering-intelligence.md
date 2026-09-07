# Engineering Intelligence — Solution Specification
## FLOW OS Solutions Library

> **STATUS: DESIGN ONLY**
> Capability layer: Phase 5.6 (GitHubAdapter — production)

---

## Problem Statement

Engineering leaders fly blind. GitHub shows them PRs and commits. Jira shows them issues. But neither answers the real questions: Which PR is blocking three other teams and nobody knows it? Which engineer is the only person who understands the auth service? Which deployment this Friday has the highest risk of breaking production?

Developers spend cognitive overhead on coordination that FLOW can do for them. They miss review requests because Slack is noisy. They merge PRs with stale reviews. They deploy to production on Friday afternoons because they don't have a risk score. They lose institutional knowledge when the senior engineer leaves.

**FLOW's advantage:** It sits between all of these systems. It can correlate a Jira issue to the PR that fixes it, the deployment that ships it, and the Slack thread where the incident was reported three weeks later. No engineering tool has this cross-system view.

---

## Module Scope

```
Engineering Intelligence
├── PR Intelligence              — merge readiness, reviewer load, risk scoring
├── Deployment Risk Engine       — pre-deploy risk assessment
├── Code Ownership Analysis      — SPOF detection, bus factor
├── Engineering Velocity         — throughput, cycle time, review lag
├── Incident Intelligence        — pattern detection, post-mortem generation
└── Dependency Risk              — cross-team dependency graph
```

---

## Signature Workflows

### 1. PR Intelligence & Merge Readiness

**Trigger:** PR opened or updated, or developer query  
**FLOW action:**
- Compute `mergeReadinessScore` (0–100): review state, conflict status, CI status, PR age, draft flag
- Identify reviewer load: "Marcus has 7 open review requests. Suggest assigning to someone with < 3."
- Detect stale PRs: "This PR has been open 14 days. The branch has diverged from main by 47 commits."
- Surface dependency: "This PR touches payment-gateway.js, which is referenced in 3 other open PRs."

**Copilot query:** "What PRs are blocking the Q3 payment feature?"  
FLOW: pulls all PRs with label `payment`, cross-references Jira epic, surfaces merge dependencies.

### 2. Deployment Risk Assessment

**Trigger:** Deployment created or deployment window approaching  
**FLOW action:**
- Compute `riskScore` (0–100): environment type (prod = high), deploy time (Friday 4pm = very high), PR count in deploy (many = higher risk), test coverage delta, number of engineers who reviewed
- Surface: "Deployment #247 has risk score 82/100. Reasons: Friday 5pm production deploy, 14 PRs included, 3 have less than 2 reviewers."
- Recommend: "Consider deploying #246 (score 34) separately and deferring #247 to Monday."

**What no other tool does:** FLOW knows which engineers are on-call this week (from Calendar), which customers were promised a feature in this deployment (from CRM), and which Jira issues this is tied to (from Jira).

### 3. Bus Factor Analysis (Code SPOF Detection)

**Trigger:** Weekly scheduled job + on engineer profile view  
**FLOW action:**
- Compute per-repository: `contributorCount`, `uniqueFileMaintainers`, `lastActiveContributor`
- Flag: repositories where `uniqueFileMaintainers < 2` for files modified in the last 90 days
- Produce: "Bus factor report — auth-service has 3 files with exactly 1 contributor. Sarah Chen is the only engineer who has modified `oauth.js` in 8 months."
- Recommend: "Schedule a knowledge transfer session for auth-service. Suggested second maintainer: David O. (6 reviews on auth-service PRs)."

### 4. Engineering Velocity Dashboard

**Trigger:** Manager or team lead request; weekly briefing  
**FLOW action:**
- Pull per-engineer signals: PRs merged, review participation, Jira throughput, cycle time (issue open → PR merge → deployed)
- Surface: "Team velocity is 23 story points/week, down 18% from last month. Cycle time increased from 2.1 days to 4.7 days. Root cause: review lag — PRs are waiting an average of 2.8 days for first review."
- Recommend: "Assign review rotation. Top reviewers this month: James K. (12 reviews), Marcus W. (9). Least active: Sarah C. (2 reviews). Consider pairing."

**Copilot query:** "Why did we ship less last sprint?"  
FLOW: pulls PR data, Jira throughput, compares to previous sprint, finds review bottleneck.

### 5. Automated Post-Mortem Generation

**Trigger:** Incident resolved (from Incident Engine detection)  
**FLOW action:**
- RAG query over all organizational memory during the incident window
- Correlate: Slack threads discussing the incident, GitHub commits deployed before it, Jira issues that may have introduced the bug, previous incidents with similar keywords
- Generate: structured post-mortem draft with Timeline, Root Cause (from commit diff context), Impact, Resolution, Action Items
- Pre-populate Notion page or Confluence page

**What no other tool does:** The post-mortem draft already has the timeline, the deployment that caused it, and the Slack conversation thread that resolved it — pulled from FLOW's ingestion pipeline.

---

## Reused FLOW Components

| Component | Role |
|---|---|
| GitHubAdapter | All repository, PR, commit, deployment data |
| JiraAdapter | Issue → PR → deployment traceability |
| Operational Graph | Cross-team PR dependency graph |
| Incident Engine | Real-time incident detection |
| Org Memory | Historical incident + decision data |
| Vector Store | Code-level semantic search |
| Operational Brain | Copilot for engineering leaders |
| Execution Engine | Create branches, approve PRs, comment programmatically |

---

## New Services Required

| Service | Purpose |
|---|---|
| `deploymentRiskEngine.js` | Compute risk score for any deployment object |
| `busFactor Analysis.js` | Graph + commit history → SPOF detection |
| `velocityMetricsService.js` | Throughput, cycle time, review lag per team/engineer |
| `postMortemService.js` | Structured post-mortem generation from incident context |
| `dependencyGraphService.js` | Cross-PR, cross-team dependency mapping |

---

## API Additions

```
GET  /api/engineering/intelligence/velocity     — Team velocity metrics
GET  /api/engineering/intelligence/bus-factor   — Bus factor analysis per workspace
GET  /api/engineering/intelligence/risk         — Pre-deploy risk assessment for pending deployments
POST /api/engineering/intelligence/post-mortem  — Generate post-mortem for incident
GET  /api/engineering/intelligence/dependencies — Cross-team PR dependency graph
```

---

## Competitive Differentiation

**vs. LinearB / Swarmia (engineering metrics):** They instrument git + issue tracker. FLOW adds communication context: the Slack thread where the team diagnosed the incident, the meeting where the architectural decision was made that caused it.

**vs. Cortex / OpsLevel (service catalog):** They provide a registry. FLOW provides intelligence: which services are at risk, who owns them, what's changed lately.

**vs. GitHub Insights:** Native GitHub only. FLOW correlates across GitHub, Jira, Slack, Calendar, and org memory.

**vs. Sentry / Datadog (incident detection):** They detect in infrastructure. FLOW detects in organizational communication — catching "the payment service is down" in Slack before the alert fires, and correlating it with the deployment from 2 hours ago.

---

## Roadmap Stage

**Phase 5.6** (Current): GitHubAdapter + ProjectIntelligence UI — production  
**Phase 8.0** (Beta): Engineering Intelligence dashboard with velocity + bus factor  
**Phase 11.3** (Post-Beta): Automated post-mortem + dependency risk engine

---

*Last updated: 2026-07-01 · Status: DESIGN ONLY*
