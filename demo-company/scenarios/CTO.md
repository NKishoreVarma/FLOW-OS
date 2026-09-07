# CTO Scenarios — Sarah Chen (emp-009)
# Helios Software Inc. — Operational Validation Suite

Role: VP Engineering / CTO
FLOW Access Level: ADMIN
Connectors: GitHub, Jira, Slack, Calendar, Gmail, Notion

---

## Scenario CTO-01: Release Gate Status

**Goal:** Determine whether Release 3.2 can ship and what is blocking it.

**Context:** Release 3.2 was originally scheduled December 15. It has been delayed to December 29. Sarah needs to know the exact gate status before the daily engineering sync.

**Question:** "Is Release 3.2 ready to ship? What are the remaining blockers?"

### Expected FLOW Reasoning
1. Pull proj-release-3-2 → blockingIssues: [HPLT-847, HPLT-892, HGRD-234]
2. For each blocking ticket, pull current status:
   - HPLT-847 → in-progress, PR #847 open 6 days (needs second review)
   - HPLT-892 → fix deployed Dec 15 (DONE)
   - HGRD-234 → in-progress, PR pending in Guardian
3. Pull PR #847 from GitHub → status: open, 1 approval (needs 2)
4. Synthesize: 2 of 3 gates remain open; expected ship Dec 29 if PR #847 merges this week

### Evidence Sources
- `projects.json` → proj-release-3-2 (blockingIssues, targetDate: 2025-12-29)
- `jira_issues.json` → HPLT-847 (in-progress), HPLT-892 (in-progress, fix deployed), HGRD-234 (in-progress)
- `pull_requests.json` → pr-847 (status: open, createdAt: 2025-12-08, reviewCount: 1)

### Expected Recommendation
> "Release 3.2 is NOT ready. 2 of 3 gate blockers remain open: (1) HPLT-847 — auth fix (PR #847) needs a second review. PR has been open 6 days with 1 approval. Per code review policy, auth service changes require 2 approvals. Assign a second reviewer immediately. (2) HGRD-234 — Guardian policy engine fix is in review. ETA December 20. HPLT-892 is resolved (deployed Dec 15). Projected clear date: December 22-23, giving 6 days of QA buffer before Dec 29 target."

### Expected ActionCard
```json
{
  "type": "code_review",
  "title": "Assign second reviewer to PR #847",
  "connector": "github",
  "action": "GITHUB_REQUEST_REVIEW",
  "payload": {
    "repo": "repo-platform-api",
    "prNumber": 847,
    "reviewers": ["emp-015", "emp-016"],
    "urgency": "release-gate"
  },
  "riskLevel": "HIGH",
  "requiresApproval": false
}
```

### Expected Execution
- FLOW calls GitHub API to add reviewers to PR #847
- Slack notification sent to assigned reviewers in #code-review

### Expected Audit Record
```json
{
  "action": "GITHUB_REQUEST_REVIEW",
  "actor": "emp-009",
  "resource": "github/repo-platform-api/pulls/847",
  "outcome": "SUCCESS",
  "governanceEffect": "ALLOW",
  "timestamp": "2025-12-14T08:00:00Z"
}
```

### Expected Final Outcome
PR #847 gets assigned second reviewer; review happens same day; release gate moves forward.

### Pass/Fail Checklist
- [ ] All 3 blockers identified (HPLT-847, HPLT-892, HGRD-234)
- [ ] HPLT-892 correctly marked as resolved
- [ ] PR #847 days-open cited (6 days)
- [ ] 2-reviewer requirement for auth cited from policy
- [ ] GitHub connector used
- [ ] Audit record created

---

## Scenario CTO-02: Production Incident Response

**Goal:** Get the full picture of INC-076 immediately after waking up to PagerDuty alerts.

**Context:** It is 3:35 AM December 14. INC-076 just resolved. Sarah was paged as escalation contact. She needs a complete situation report.

**Question:** "What happened tonight? Walk me through INC-076 end to end."

### Expected FLOW Reasoning
1. Pull INC-076 → P1, detectedAt 2:47 AM, resolvedAt 3:34 AM, MTTR 47 min
2. Pull slack-inc-076-main → full 14-message timeline of the incident
3. Pull PR #894 → root cause fix details (LRU cache eviction)
4. Pull affected customers → Acme Corp (847 failures), Meridian Health (123), GlobalTech (67)
5. Synthesize: what happened, who responded, what was fixed, what follow-up is needed

### Evidence Sources
- `incidents.json` → inc-076 (full incident record)
- `slack_threads.json` → slack-inc-076-main (14 messages, Priya's timeline)
- `pull_requests.json` → pr-894 (fix details, merged 3:28 AM)
- `customers.json` → affected customer impact counts

### Expected Recommendation
> "INC-076 summary: WorkflowCache in Platform API had no eviction policy. For Acme Corp (12,400 workflow templates), this caused heap exhaustion within 8 hours of the 6:30 PM deployment. All pods hit OOM simultaneously at 2:47 AM. Root cause found by David Park at 3:10 AM. Elena Torres did a rolling restart (immediate mitigation). PR #894 (LRU eviction fix) merged 3:28 AM, deployed as v3.1.9-p1 at 3:31 AM. Restored 3:34 AM. MTTR: 47 minutes. Three follow-ups needed: (1) Load test with 15K templates, (2) Memory alert threshold → 70%, (3) Unbounded cache audit."

### Expected ActionCard
```json
{
  "type": "document",
  "title": "Create INC-076 Post-Mortem Document",
  "connector": "notion",
  "action": "NOTION_CREATE_PAGE",
  "payload": {
    "title": "Post-Mortem: INC-076 — Dec 14 2025",
    "template": "incident_postmortem",
    "prePopulate": {
      "incidentId": "inc-076",
      "severity": "P1",
      "mttr": "47 minutes",
      "rootCause": "WorkflowCache unbounded growth — no eviction policy"
    }
  }
}
```

### Expected Audit Record
```json
{
  "action": "NOTION_CREATE_PAGE",
  "actor": "emp-009",
  "outcome": "SUCCESS",
  "governanceEffect": "ALLOW"
}
```

### Expected Final Outcome
Sarah has full incident picture; post-mortem document started.

### Pass/Fail Checklist
- [ ] Root cause described correctly (WorkflowCache, no eviction)
- [ ] MTTR cited (47 minutes)
- [ ] All 3 affected customers named
- [ ] PR #894 timeline accurate (created 3:14 AM, merged 3:28 AM)
- [ ] 3 action items listed
- [ ] Notion connector used for post-mortem

---

## Scenario CTO-03: PR Review Bottleneck

**Goal:** Understand why PR #847 has been open for 6 days and unblock it.

**Question:** "PR #847 has been open for 6 days. What's happening and who needs to act?"

### Expected FLOW Reasoning
1. Pull pr-847 → open since Dec 8, 1 approval, needs 2 (auth service policy)
2. Pull slack-pr-847-review → thread showing PR was flagged, reviewers reassigned
3. Pull David Park (emp-013) → on-call 3 consecutive weeks, 7 PRs in queue
4. Pull documents → doc-policy-code-review → auth service 2-reviewer requirement
5. Synthesize: review policy was not met; David Park capacity is the bottleneck; assign additional reviewers

### Evidence Sources
- `pull_requests.json` → pr-847 (open, reviewCount: 1, jiraIssueId: HPLT-847)
- `slack_threads.json` → slack-pr-847-review (11 messages, bottleneck discussion)
- `employees.json` → emp-013 (onCall: true, skills: auth-service)
- `documents.json` → doc-policy-code-review (auth service 2-review SLO)

### Expected Recommendation
> "PR #847 has been open 6 days because: (1) David Park is the primary auth reviewer and has been on-call for 3 consecutive weeks with 7 PRs in queue. He reviewed it but the second required reviewer hasn't been assigned. (2) Code review policy requires 2 approvals for auth service — this is a gate, not a preference. (3) The Slack thread shows the PR was flagged 2 days ago but no action was taken. Assign a second reviewer now from the auth-capable engineers (emp-015, emp-016). This is Release 3.2's longest-running blocker."

### Expected ActionCard
```json
{
  "type": "code_review",
  "title": "Assign second reviewer — PR #847 (Release 3.2 gate)",
  "connector": "github",
  "action": "GITHUB_REQUEST_REVIEW",
  "payload": {
    "repo": "repo-platform-api",
    "prNumber": 847,
    "reviewers": ["emp-015"],
    "comment": "This is a release gate — please review today"
  }
}
```

### Expected Final Outcome
Second reviewer assigned; review completes within same day; HPLT-847 closes.

### Pass/Fail Checklist
- [ ] PR age cited correctly (6 days)
- [ ] 2-reviewer policy cited with source (doc-policy-code-review)
- [ ] David Park's overload identified as contributing factor
- [ ] Slack thread referenced as evidence
- [ ] GitHub connector used for reviewer assignment

---

## Scenario CTO-04: Engineering Velocity Decline

**Goal:** Identify root causes of the 23% velocity decline and propose solutions.

**Question:** "Why is engineering velocity declining? Is this fixable in Q1?"

### Expected FLOW Reasoning
1. Pull slack-eng-velocity → 62% sprint completion, 31-hour PR review latency
2. Pull incidents → 3 P1 incidents in Q4, estimated 28 person-days unplanned
3. Pull pull_requests → avg review time calculation, PR #847 as exemplar
4. Pull employees → on-call rotation, David Park consecutive weeks
5. Calculate: velocity decline components = incident tax + review bottleneck + stabilization work
6. Project Q1 recovery: SRE hires + review SLO enforcement + David Park off on-call

### Evidence Sources
- `slack_threads.json` → slack-eng-velocity (62% sprint, velocity data)
- `incidents.json` → P1 count Q4 (inc-042, inc-076, plus earlier P1s)
- `pull_requests.json` → open PR count (72), avg age calculation
- `employees.json` → emp-013 (on-call, overloaded)

### Expected Recommendation
> "Velocity decline breakdown: (1) On-call interrupt tax: ~28 person-days lost to P1 incidents in Q4. (2) PR review bottleneck: avg review time 31 hours (was 18 hours in Q3). David Park is the single point of failure for auth/platform reviews. (3) 19% sprint capacity consumed by Release 3.2 stabilization. Recovery plan for Q1: (1) SRE hires reduce on-call frequency (approved). (2) 2-hour PR review SLO for release-gate PRs — enforced as sprint commitment. (3) Velocity target: restore to 80%+ by Sprint 10 (Feb 2026). Fixable in Q1 with these three changes."

### Expected ActionCard
```json
{
  "type": "document",
  "title": "Create Engineering Velocity Recovery Plan",
  "connector": "notion",
  "action": "NOTION_CREATE_PAGE",
  "payload": {
    "title": "Engineering Velocity Recovery — Q1 2026",
    "sections": ["Root Cause Analysis", "Recovery Actions", "Success Metrics", "Timeline"]
  }
}
```

### Expected Final Outcome
CTO has documented velocity recovery plan with evidence-backed targets.

### Pass/Fail Checklist
- [ ] Three root causes identified (incidents, review bottleneck, stabilization tax)
- [ ] 31-hour review latency cited
- [ ] 62% sprint completion cited
- [ ] SRE hires as mitigation mentioned
- [ ] Q1 recovery target realistic (80%, not 100%)

---

## Scenario CTO-05: Architecture Review — Atlas Decision

**Goal:** Validate that the CQRS + Event Sourcing decision for Atlas is still the right call.

**Question:** "We approved RFC-0041 six months ago. Is CQRS still the right architecture for Atlas?"

### Expected FLOW Reasoning
1. Pull doc-rfc-0041 → RFC-0041 accepted July 2025, CQRS + Event Sourcing rationale
2. Pull proj-atlas → 42% complete, auth module extraction ongoing
3. Pull knowledge graph → Atlas dependencies, team expertise
4. Pull HPLT-756 (Atlas auth refactor) → current state of auth extraction
5. Assess: decision-appropriate reassessment (6 months in, 42% done) — change cost vs. benefit

### Evidence Sources
- `documents.json` → doc-rfc-0041 (RFC-0041: CQRS + Event Sourcing, accepted July 2025)
- `projects.json` → proj-atlas (42% complete, auth blocker)
- `jira_issues.json` → HPLT-756 (Atlas auth refactor, blocked on PR #847)

### Expected Recommendation
> "CQRS remains the right decision. Evidence: (1) The auth extraction work (HPLT-756, now blocked on PR #847) is exactly the kind of bounded context isolation CQRS enables — the team's work confirms the architecture is correct. (2) 42% completion at 6 months is on track for the extended timeline. (3) No evidence of 'CQRS overhead' complaints in Sprint retrospectives or Slack. The complexity is in the auth migration, not the CQRS pattern itself. Recommendation: continue. Revisit only if auth extraction reveals fundamental domain model problems."

### Expected Final Outcome
CTO has an architecture decision review grounded in current evidence.

### Pass/Fail Checklist
- [ ] RFC-0041 cited with accept date (July 2025)
- [ ] Atlas completion percentage cited (42%)
- [ ] HPLT-756 cross-referenced
- [ ] Recommendation is evidence-backed (not opinion)
- [ ] No invented architectural concerns

---

## Scenario CTO-06: Infrastructure Cost Analysis

**Goal:** Understand current infrastructure costs and whether they're in line with growth.

**Question:** "Are our infrastructure costs proportional to our growth? Where are we overspending?"

### Expected FLOW Reasoning
1. Pull executive_reports.json → infrastructure costs, ARR, cost as % of revenue
2. Pull incidents.json → over-provisioning signals (INC-076 caused by deployment strategy)
3. Pull repositories.json → 16 repos, count active microservices
4. Pull commits.json → deployment frequency, rollout patterns
5. Surface: no specific cost data in demo — recommend connecting AWS/GCP connector; surface what IS available

### Evidence Sources
- `executive_reports.json` → infrastructure cost line items (if present)
- `incidents.json` → INC-076 (related to deployment timing — rolling restart cost)
- `projects.json` → proj-atlas (will require infrastructure changes at GA)

### Expected Recommendation
> "Infrastructure cost data requires connecting the cloud billing connector (AWS/GCP). From available signals: (1) The Dec 13 deployment caused simultaneous pod restarts — a rolling deploy strategy would reduce memory spike risk and cost. (2) Atlas GA will require infrastructure scaling decision in Q1 — budget now. (3) The current monitoring stack fires alerts at 85% memory — we're already paying for 15% wasted headroom before restart. Recommend connecting the cloud billing connector for precise cost analysis."

### Expected ActionCard
```json
{
  "type": "connector_auth",
  "title": "Connect AWS Cost Explorer",
  "connector": "aws",
  "action": "AUTH_INITIATE",
  "note": "Required to answer infrastructure cost questions with real data"
}
```

### Expected Final Outcome
CTO understands what's knowable from current connectors vs. what requires additional data.

### Pass/Fail Checklist
- [ ] FLOW acknowledges data gap (no billing connector) rather than inventing numbers
- [ ] Actionable alternatives suggested (connect AWS connector)
- [ ] Available signals from incidents/deployments surfaced
- [ ] No hallucinated cost figures

---

## Scenario CTO-07: SRE Headcount Capacity Planning

**Goal:** Build the business case for 2 additional SRE hires for CEO approval.

**Question:** "What's the case for 2 more SREs? Build me the argument."

### Expected FLOW Reasoning
1. Pull incidents → Q4 P1 count, cumulative MTTR (3 incidents, ~47+30+25 min = 102 min)
2. Pull employees → current SRE team size (3 named: emp-317, emp-318, emp-319)
3. Calculate: current on-call frequency (3 SREs, 24/7 = 8-day rotation avg)
4. Calculate: with 5 SREs = 14-day rotation avg
5. Pull executive_reports → cost of downtime per minute (from ARR / (365*24*60))
6. Estimate: 1 avoided P1 per quarter offsets 1 SRE's cost

### Evidence Sources
- `incidents.json` → Q4 P1s (inc-042: Oct, inc-076: Dec 14)
- `employees.json` → emp-317 (Elena Torres), emp-318, emp-319 (3 SREs total)
- `slack_threads.json` → slack-sre-hiring-approval (Sarah's SRE hire request)

### Expected Recommendation
> "Business case for 2 SRE hires: (1) Current team: 3 SREs covering 450 employees, 16 repos, on-call 24/7. Each SRE is on-call ~every 8 days. (2) Q4 P1 incidents: INC-076 (47 min), INC-042 (30 min), INC-001 equivalent (25 min) = 102 min downtime. (3) Cost: ~$57/min downtime at $30M ARR. 102 minutes = ~$5,800 direct cost + customer trust impact. (4) 2 additional SREs at market rate (~$280K/year total) → on-call every 14 days per person → expected 40% reduction in incident response time from reduced fatigue. Payback: 1 avoided P1 per quarter."

### Expected Final Outcome
CTO has a documented business case ready for CEO presentation.

### Pass/Fail Checklist
- [ ] Current SRE count cited (3)
- [ ] Q4 incident count and MTTR cited
- [ ] On-call frequency calculated correctly
- [ ] Cost estimate labeled as heuristic/estimate
- [ ] No invented salary figures presented as facts

---

## Scenario CTO-08: Security Vulnerability — HGRD-234

**Goal:** Understand the security impact of HGRD-234 and manage the disclosure timeline.

**Question:** "How serious is HGRD-234? Who is affected and when do we need to disclose?"

### Expected FLOW Reasoning
1. Pull HGRD-234 from Jira → missing AND clause, allows read-only users to write
2. Pull customers → find HIPAA-regulated customers → Meridian Health
3. Pull Meridian Health customer record → discovered HGRD-234, informed Helios
4. Pull Release 3.2 project → HGRD-234 is a release gate blocker (fix in 3.2)
5. Pull doc-policy-data-retention → HIPAA retention requirements
6. Recommend: immediate disclosure to Meridian Health, coordinated with fix

### Evidence Sources
- `jira_issues.json` → HGRD-234 (full description: SQL missing AND clause, read-only user write access)
- `customers.json` → cust-meridian-health (HIPAA-regulated, discovered HGRD-234)
- `projects.json` → proj-release-3-2 (HGRD-234 listed as blocker)
- `documents.json` → doc-policy-data-retention (HIPAA section)

### Expected Recommendation
> "HGRD-234 severity: HIGH. The missing AND clause in the Guardian policy evaluation query allows read-only users to execute write operations in some permission configurations. Discovered by Meridian Health (HIPAA-regulated customer). (1) HIPAA breach notification: 72-hour notification clock may apply — legal review needed now. (2) Meridian Health must be informed of the scope before the fix ships. (3) Fix is in Release 3.2 gate — ETA December 20 (in review). (4) Elena Vasquez (CISO) should lead the disclosure call. Recommend: treat this as a regulated disclosure, not just a bug fix."

### Expected ActionCard
```json
{
  "type": "email",
  "title": "Initiate security disclosure — Meridian Health",
  "connector": "gmail",
  "action": "GMAIL_SEND",
  "payload": {
    "to": "security@meridianhealth.com",
    "subject": "Security Notice: Guardian Policy Engine — Helios Software",
    "draft": true,
    "note": "Requires legal review before sending"
  },
  "riskLevel": "HIGH",
  "requiresApproval": true,
  "approvalRequired": "ADMIN"
}
```

### Expected Execution
- Action creates a draft (not sent) — requires ADMIN approval before sending
- Approval request routed to CISO (emp-209) + CTO (emp-009)

### Expected Audit Record
```json
{
  "action": "GMAIL_SEND",
  "actor": "emp-009",
  "outcome": "APPROVAL_REQUIRED",
  "approvalRequired": "ADMIN",
  "governanceEffect": "REQUIRE_APPROVAL",
  "riskLevel": "HIGH"
}
```

### Expected Final Outcome
Disclosure draft created; approval routed; no email sent until approved.

### Pass/Fail Checklist
- [ ] HGRD-234 technical description accurate
- [ ] Meridian Health identified as HIPAA-regulated
- [ ] Approval gate fired (not auto-sent)
- [ ] CISO added as approver
- [ ] Legal review recommended

---

## Scenario CTO-09: Deployment Readiness Review

**Goal:** Verify that the Dec 29 Release 3.2 deployment is safe to proceed.

**Question:** "We're planning to deploy Release 3.2 on December 29. What do I need to verify first?"

### Expected FLOW Reasoning
1. Pull proj-release-3-2 → gate status, remaining blockers
2. Pull doc-runbook-platform → deployment checklist, WorkflowCache section
3. Pull incidents → INC-076 was caused by a deployment — verify same conditions don't exist
4. Pull PR #847 status → is it merged? (prerequisite)
5. Pull QA status from Jira → regression suite results
6. Surface: deployment risk factors checklist

### Evidence Sources
- `projects.json` → proj-release-3-2 (gate status)
- `documents.json` → doc-runbook-platform (deployment checklist, cache validation section)
- `incidents.json` → inc-076 (was triggered by deployment — rolling restart needed)
- `jira_issues.json` → QA gate tickets

### Expected Recommendation
> "December 29 deployment readiness checklist: (1) Gate blockers: HPLT-847 and HGRD-234 must be merged before cutoff. (2) Load test: Kenji's 15,000-template load test must pass (action item from INC-076 post-mortem). (3) Memory alerts: confirm threshold is at 70% (changed after INC-076). (4) Deployment strategy: use rolling deploy — NOT simultaneous pod restart (INC-076 root cause). (5) Timing: deploy Tuesday 10 AM — avoid weekend deployments (post-mortem rule). (6) Rollback plan: v3.1.9-p1 is stable rollback target."

### Expected ActionCard
```json
{
  "type": "document",
  "title": "Create Release 3.2 Deployment Checklist",
  "connector": "notion",
  "action": "NOTION_CREATE_PAGE",
  "payload": {
    "title": "Release 3.2 — Dec 29 Deployment Checklist",
    "items": [
      "PR #847 merged",
      "HGRD-234 merged",
      "15K template load test passing",
      "Memory alert at 70%",
      "Rolling deploy strategy confirmed",
      "Rollback plan documented"
    ]
  }
}
```

### Expected Final Outcome
CTO has a deployment checklist grounded in post-mortem learnings.

### Pass/Fail Checklist
- [ ] All 3 gate blockers referenced
- [ ] INC-076 lessons applied (rolling deploy, 70% alert)
- [ ] Load test requirement mentioned (from post-mortem)
- [ ] Rollback plan cited
- [ ] Timing recommendation (avoid weekend) referenced

---

## Scenario CTO-10: Vendor Dependency Risk

**Goal:** Identify single points of failure in external vendor dependencies.

**Question:** "What vendor or external service failures would take us down?"

### Expected FLOW Reasoning
1. Pull doc-arch-microservices → external dependencies (databases, queues, external APIs)
2. Pull incidents → what caused past outages (INC-001 = DB failover)
3. Pull pull_requests, commits → external SDK updates, dependency management
4. Pull jira_issues → Dependabot alerts, outdated deps
5. Surface: critical path vendors with no fallback

### Evidence Sources
- `documents.json` → doc-arch-microservices (external deps: PostgreSQL, Redis, Kafka)
- `incidents.json` → inc-001 (P0 database failover — Route53 misconfiguration)
- `documents.json` → doc-runbook-db (database failover runbook exists)

### Expected Recommendation
> "Critical vendor dependencies: (1) PostgreSQL (primary DB) — INC-001 shows DB failover took 25 min due to Route53 health check misconfiguration. Runbook exists. (2) Redis — in-memory queues and session cache. No documented fallback. (3) BullMQ on Redis — ingestion and summary queues. Job data survives Redis restart but in-flight jobs are lost. (4) Gemini API (AI) — system degrades gracefully (heuristic fallback built in). (5) Composio OAuth proxy — if down, OAuth flows fail for all connectors. No mitigation documented. Priority: document Redis fallback and Composio SLA."

### Expected Final Outcome
CTO has a vendor dependency map with risk ratings and gap analysis.

### Pass/Fail Checklist
- [ ] PostgreSQL surfaced with INC-001 evidence
- [ ] Redis identified as undocumented risk
- [ ] Gemini fallback correctly noted (NOT a critical risk)
- [ ] Composio mentioned
- [ ] No invented dependencies
- [ ] Sources include architecture docs

---
