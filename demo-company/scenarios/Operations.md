# Operations Scenarios
# Helios Software Inc. — Operational Validation Suite

Role: Site Reliability Lead, DevOps Lead, Operations Manager
Represented by: Elena Torres (emp-317), Priya Nair (emp-014)
FLOW Access Level: ADMIN
Connectors: GitHub, Slack, Jira, Calendar, Notion

---

## Scenario OPS-01: Deployment Pipeline Status

**Goal:** Verify that the deployment pipeline is healthy and ready for the Release 3.2 deployment.

**Question:** "Is our deployment pipeline ready for the December 29 Release 3.2 rollout?"

### Expected FLOW Reasoning
1. Pull proj-release-3-2 → deployment target Dec 29, gate status
2. Pull doc-runbook-platform → deployment checklist, rolling restart requirement
3. Pull incidents → INC-076 root cause (simultaneous pod restart) → rolling deploy now required
4. Pull PR status → pr-847 (not yet merged), pr-894 (merged, in release branch)
5. Synthesize: pipeline readiness checklist — what's ready, what's not

### Evidence Sources
- `projects.json` → proj-release-3-2 (targetDate: 2025-12-29, gate status)
- `documents.json` → doc-runbook-platform (deployment steps, WorkflowCache section)
- `incidents.json` → inc-076 (simultaneous restart = root cause)
- `pull_requests.json` → pr-847 (open), pr-894 (merged)

### Expected Recommendation
> "Deployment pipeline readiness for Dec 29: (1) PR #894 (memory fix): MERGED — in release branch. (2) PR #847 (auth fix): OPEN — must merge before Dec 29 deployment. Gate blocker. (3) Load test: 15,000-template dataset test is required (INC-076 action item). Status: pending Kenji's completion. (4) Deployment strategy: rolling restart REQUIRED — not simultaneous pod restart. This is the direct lesson from INC-076. (5) Memory alert threshold: 70% (already changed). (6) Timing: Tuesday December 29, 10 AM business hours. Not Friday afternoon. Not weekend."

### Expected ActionCard
```json
{
  "type": "document",
  "title": "Create Release 3.2 Deployment Runbook",
  "connector": "notion",
  "action": "NOTION_CREATE_PAGE",
  "payload": {
    "title": "Release 3.2 Deployment Runbook — Dec 29, 2025",
    "template": "deployment_runbook",
    "prefill": {
      "deploymentStrategy": "rolling",
      "rollbackTarget": "v3.1.9-p1",
      "monitoringWindow": "60 minutes post-deploy",
      "memoryAlertThreshold": "70%"
    }
  }
}
```

### Expected Audit Record
```json
{
  "action": "NOTION_CREATE_PAGE",
  "actor": "emp-317",
  "outcome": "SUCCESS",
  "governanceEffect": "ALLOW"
}
```

### Pass/Fail Checklist
- [ ] PR #847 as outstanding blocker identified
- [ ] Rolling deploy strategy cited (INC-076 lesson)
- [ ] 70% memory alert threshold mentioned
- [ ] 10 AM business hours timing recommended
- [ ] Rollback target specified (v3.1.9-p1)

---

## Scenario OPS-02: Infrastructure Capacity Planning

**Goal:** Plan infrastructure capacity for Q1 2026 given Atlas GA and customer growth.

**Question:** "What infrastructure changes do we need for Atlas GA in Q1?"

### Expected FLOW Reasoning
1. Pull proj-atlas → GA March 31, distributed microservices architecture
2. Pull doc-arch-microservices → current infrastructure footprint (7 services)
3. Pull inc-076 → memory sizing lesson (test at 15K templates, not 500)
4. Pull customers → enterprise customer template volumes
5. Surface: Atlas GA = new microservice boundaries = separate scaling policies needed

### Evidence Sources
- `projects.json` → proj-atlas (microservices, GA March 31)
- `documents.json` → doc-arch-microservices (7 services, communication patterns)
- `incidents.json` → inc-076 (memory sizing lesson)

### Expected Recommendation
> "Atlas GA infrastructure needs: (1) Service decomposition: Atlas splits the monolith into 7+ microservices. Each needs its own Kubernetes namespace, resource quotas, and autoscaling policies. (2) Memory sizing: INC-076 proved production workloads can be 25x larger than test data assumed. Load test at customer-realistic scale (15K templates) before GA. (3) Event-sourcing storage: CQRS + Event Sourcing means an event store — PostgreSQL event log will grow. Plan for 3-year retention at enterprise scale. (4) Auth service: extracted auth will need its own database pool — plan for additional connection capacity."

### Pass/Fail Checklist
- [ ] 7 microservices cited from architecture doc
- [ ] INC-076 lesson applied to capacity planning
- [ ] Event store storage requirement mentioned
- [ ] Auth service extraction flagged as capacity event

---

## Scenario OPS-03: On-Call Rotation Management

**Goal:** Verify the on-call rotation is properly staffed and David Park's removal is implemented.

**Question:** "Is the on-call rotation healthy after pulling David Park off?"

### Expected FLOW Reasoning
1. Pull employees → SRE team (emp-317 Elena Torres, emp-318, emp-319 Priya Nair)
2. Pull slack-oncall-handoff-dec14 → Priya handed off to Kenji
3. Pull incidents → inc-076 was resolved on the new rotation
4. Calculate: 3 SREs + no David Park = rotation frequency per person
5. Surface: manageable in short term; improved with 2 new SRE hires in Q1

### Evidence Sources
- `employees.json` → SRE team members
- `slack_threads.json` → slack-oncall-handoff-dec14 (Priya → Kenji handoff)
- `incidents.json` → inc-076 response (Priya + Elena)

### Expected Recommendation
> "On-call rotation health after David Park removal: (1) Current rotation: Elena Torres, Priya Nair, Kenji Watanabe (3 SREs). David Park removed effective Dec 14. (2) Rotation frequency: 24/7 among 3 engineers = ~8-day intervals. This is acceptable short-term. (3) INC-076 showed the team can respond effectively — 47-min MTTR with Priya as primary. (4) With 2 new SREs joining Q1: rotation extends to 5 engineers, ~14-day intervals. (5) Risk: December 29 deployment requires on-call coverage during the deploy window. Confirm Priya or Elena is scheduled on-call Dec 29."

### Expected ActionCard
```json
{
  "type": "calendar_event",
  "title": "Confirm on-call coverage for Release 3.2 deployment",
  "connector": "calendar",
  "action": "CALENDAR_CREATE_EVENT",
  "payload": {
    "title": "Release 3.2 Deployment — SRE On-Call",
    "date": "2025-12-29",
    "attendees": ["emp-317", "emp-014"],
    "note": "Both SREs available during deployment window"
  }
}
```

### Pass/Fail Checklist
- [ ] SRE rotation members named correctly
- [ ] 8-day rotation frequency calculated
- [ ] INC-076 response cited as competence evidence
- [ ] Q1 hire impact projected (14-day intervals)
- [ ] Dec 29 deployment coverage flagged

---

## Scenario OPS-04: Service Dependency Map

**Goal:** Map critical service dependencies to understand blast radius of a Platform API failure.

**Question:** "If Platform API goes down, what else fails?"

### Expected FLOW Reasoning
1. Pull doc-arch-microservices → 7 services, communication patterns
2. Pull knowledge_graph → service dependency nodes and edges
3. Pull incidents → inc-076 (Platform API down = workflow execution failed for all customers)
4. Identify: what depends on Platform API (workflow engine = core product)
5. Synthesize: blast radius includes all workflow execution + auth + data export

### Evidence Sources
- `documents.json` → doc-arch-microservices (service dependency map)
- `knowledgeGraph.json` → service nodes and relationships
- `incidents.json` → inc-076 (impact of Platform API failure)

### Expected Recommendation
> "Platform API blast radius: Platform API is the core service — its failure impacts: (1) Workflow execution: ALL customers lose ability to run workflows (proven by INC-076: 100% error rate on /api/v3/workflows). (2) Auth service: authentication calls flow through Platform API — login failures. (3) Data export: /api/v3/export uses Platform API — Acme Corp's nightly export would fail. (4) SDK connections: all SDK-connected clients experience failures. (5) Downstream analytics (Helios Analytics) — real-time event streaming stalls. Platform API is a single point of failure. Atlas addresses this by decomposing it into independently deployable services."

### Pass/Fail Checklist
- [ ] INC-076 cited as evidence (100% error rate)
- [ ] 5+ downstream impacts identified
- [ ] Atlas fix mentioned
- [ ] Knowledge graph traversal used
- [ ] No invented service names

---

## Scenario OPS-05: Runbook Coverage Audit

**Goal:** Verify that runbooks exist for all critical failure scenarios.

**Question:** "Which critical failure scenarios don't have runbooks yet?"

### Expected FLOW Reasoning
1. Pull documents → find all runbooks (doc-runbook-platform, doc-runbook-db, doc-runbook-ssl)
2. Pull incidents → what types of incidents have occurred
3. Cross-reference: incidents without corresponding runbooks
4. Pull inc-076 → WorkflowCache section was ADDED to runbook after the incident = gap found in retrospect

### Evidence Sources
- `documents.json` → doc-runbook-platform, doc-runbook-db, doc-runbook-ssl
- `incidents.json` → incident types across 80 incidents

### Expected Recommendation
> "Runbook coverage audit: Existing runbooks: (1) doc-runbook-platform (Platform API — updated post INC-076 with WorkflowCache section). (2) doc-runbook-db (Database failover). (3) doc-runbook-ssl (SSL certificate renewal). Gap analysis against incident history: (1) Auth service degradation — no runbook. PR #847's root cause (mutex deadlock) is not documented as a runbook. (2) Rate limiter exhaustion — seen in Nov P1. No runbook. (3) Analytics pipeline lag — HANA incidents reference delays but no runbook. Priority: auth service runbook before Release 3.2 ships."

### Pass/Fail Checklist
- [ ] 3 existing runbooks correctly identified
- [ ] Auth service runbook gap identified
- [ ] Incidents used to drive gap analysis
- [ ] Priority recommendation (before 3.2)

---

## Scenario OPS-06: Alert Fatigue Analysis

**Goal:** Identify whether the team is experiencing alert fatigue from too many false positives.

**Question:** "Is our alerting healthy? Are we getting too many false positive alerts?"

### Expected FLOW Reasoning
1. Pull incidents → count by severity over time
2. Pull slack-oncall-handoff-dec14 → handoff notes for alert context
3. Pull inc-076 → alert threshold was at 85% (too late) — now at 70%
4. Analyze: was 85% threshold causing delayed response = alert was LATE (not false positive)
5. Surface: the problem was under-alerting, not over-alerting

### Evidence Sources
- `incidents.json` → incident severity distribution, detection times
- `slack_threads.json` → slack-oncall-handoff-dec14 (on-call notes)
- `documents.json` → doc-runbook-platform (alert thresholds)

### Expected Recommendation
> "Alert health: The December pattern shows UNDER-alerting, not over-alerting: (1) INC-076: memory alert at 85% fired too late — engineers had 15 minutes before OOMKill. Changed to 70%. (2) INC-042: auth degradation was reported by customers before internal alerts fired. (3) No specific alert fatigue signals in Slack (no 'muted' or 'ignored' language). Recommendation: (1) Review all alert thresholds against INC-042 and INC-076 response timelines. (2) Add customer-impact alerts (e.g., error rate > 1% for > 5 minutes = page immediately). (3) Connect Grafana for real-time alert analytics."

### Pass/Fail Checklist
- [ ] INC-076 alert threshold story cited correctly (85% → 70%)
- [ ] INC-042 customer-before-alert issue mentioned
- [ ] UNDER-alerting correctly identified (not over-alerting)
- [ ] Grafana connector mentioned as next step
- [ ] No invented alert metrics

---

## Scenario OPS-07: SLA Compliance Review

**Goal:** Assess whether Helios is meeting its SLA commitments to enterprise customers.

**Question:** "Are we meeting our SLA commitments? Any breaches in December?"

### Expected FLOW Reasoning
1. Pull incidents → P1 MTTR: inc-076 (47 min), inc-042 (separate MTTR)
2. Pull customers → enterprise tier SLA (typically: 99.9% uptime, P1 MTTR < 4 hours)
3. Calculate: INC-076 downtime = 47 minutes = within P1 SLA (< 4 hours)
4. Pull customer-specific SLAs if available
5. Assess: INC-076 met P1 MTTR SLA; need to check uptime SLA

### Evidence Sources
- `incidents.json` → inc-076 (MTTR: 47 min), inc-042 (MTTR data)
- `customers.json` → enterprise tier SLA terms (in notes or contract)
- `executive_reports.json` → uptime metrics

### Expected Recommendation
> "SLA compliance assessment: (1) P1 MTTR: INC-076 = 47 minutes. Standard enterprise SLA P1 MTTR = 4 hours. STATUS: MET. (2) Uptime: INC-076 caused 47 minutes of downtime for Platform API. If monthly uptime SLA is 99.9% (43.8 min max per month), INC-076 used 107% of the monthly allowance. STATUS: POTENTIAL BREACH for December. (3) Acme Corp specifically: 847 failed executions during INC-076. Check if execution SLAs exist. (4) Meridian Health: HIPAA availability SLAs may be stricter. Recommend: send incident report to all affected enterprise customers before they request it."

### Pass/Fail Checklist
- [ ] 47-min MTTR cited and compared to 4-hour SLA
- [ ] 99.9% uptime calculation shown (43.8 min)
- [ ] SLA breach risk identified (INC-076 may breach monthly uptime)
- [ ] Proactive customer communication recommended
- [ ] No invented SLA terms

---

## Scenario OPS-08: Change Management Queue

**Goal:** Review pending changes and ensure proper change management process is followed.

**Question:** "What changes are scheduled for the next two weeks? Any high-risk ones?"

### Expected FLOW Reasoning
1. Pull pull_requests → open PRs that will merge soon (pr-847 pending)
2. Pull projects → Release 3.2 deployment (Dec 29) is the major planned change
3. Pull incidents → INC-076 was a change-triggered incident (Dec 13 deployment)
4. Surface: Dec 29 deployment is the high-risk change; rolling strategy required
5. Recommend: change freeze after Dec 23, only Release 3.2 changes allowed

### Evidence Sources
- `projects.json` → proj-release-3-2 (Dec 29 deployment)
- `pull_requests.json` → pr-847 (pending merge = upcoming change)
- `incidents.json` → inc-076 (triggered by Dec 13 deployment)

### Expected Recommendation
> "Change queue for Dec 14-29: (1) HIGH RISK: Release 3.2 deployment December 29. Rolling restart required (INC-076 lesson). Requires: PR #847 merged + load test completed + QA sign-off. (2) MEDIUM: PR #847 merge (auth fix) — when merged, requires rolling restart of Platform API. (3) LOW: HGRD-234 fix merge — when merged, Guardian service restart. Recommendation: (1) Change freeze for all non-Release 3.2 work from December 23. (2) No deployments December 24-28. (3) December 29 deployment at 10 AM with two SREs on-call."

### Pass/Fail Checklist
- [ ] Release 3.2 Dec 29 as highest-risk change
- [ ] INC-076 as evidence for change management caution
- [ ] Rolling restart requirement cited
- [ ] Change freeze recommendation (Dec 23)
- [ ] No invented pending changes

---
