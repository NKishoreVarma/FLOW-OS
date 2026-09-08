# CEO Scenarios — James Hollis (emp-001)
# Helios Software Inc. — Operational Validation Suite

Role: CEO
FLOW Access Level: OWNER
Connectors: All (Gmail, Slack, GitHub, Jira, Calendar, Notion, HubSpot)

---

## Scenario CEO-01: Morning Executive Briefing

**Goal:** Understand the most critical items requiring CEO attention before the 9 AM leadership sync.

**Context:** It is 7:45 AM on December 14, 2025. An overnight incident resolved at 3:34 AM. The weekly leadership sync is at 9 AM. Acme Corp sent an escalation email December 11.

**Question:** "What do I need to know before 9 AM?"

### Expected FLOW Reasoning
1. Pull WIC snapshot → health score, top actions, domain cards
2. Surface INC-076 (P1, resolved 3:34 AM, 47-min MTTR) as highest-priority overnight event
3. Cross-reference INC-076 affected customers → Acme Corp, Meridian Health, GlobalTech
4. Surface Acme Corp renewal (Dec 28) + open escalation thread as compounding risk
5. Surface Release 3.2 delay (Dec 15 → Dec 29) as engineering signal
6. Synthesize: three converging risks (incident + customer + release) that require CEO awareness

### Evidence Sources
- `incidents.json` → INC-076 (detectedAt: 2025-12-14T02:47:00Z, resolvedAt: 2025-12-14T03:34:00Z)
- `emails.json` → thread-acme-escalation-dec11 (Marcus Webb, Acme CTO escalation)
- `customers.json` → cust-acme-corp (healthScore: 42, renewal: 2025-12-28)
- `projects.json` → proj-release-3-2 (targetDate: 2025-12-29, originalTargetDate: 2025-12-15)
- `slack_threads.json` → slack-exec-update-dec13 (weekly update with all metrics)

### Expected Recommendation
> "Three items require your attention before 9 AM: (1) INC-076 resolved at 3:34 AM with 47-min MTTR — Engineering handled it; Priya Nair and David Park resolved a WorkflowCache memory exhaustion. (2) Acme Corp's CTO emailed December 11 escalating two P1 tickets — their renewal is December 28. Sarah Chen has joined a December 16 call. (3) Release 3.2 was delayed from December 15 to December 29 due to the auth regression. All three items are in motion. Recommend you ask Sarah for a 5-minute pre-brief before the 9 AM sync."

### Expected ActionCard
```json
{
  "type": "briefing",
  "urgency": "high",
  "title": "Morning Brief — 3 items require CEO attention",
  "items": [
    { "id": "inc-076", "type": "incident", "status": "resolved", "mttr": 47 },
    { "id": "cust-acme-corp", "type": "customer_risk", "renewal": "2025-12-28" },
    { "id": "proj-release-3-2", "type": "project_delay", "slipDays": 14 }
  ],
  "suggestedAction": "Request pre-brief from VP Engineering before 9 AM sync",
  "connector": "calendar",
  "action": "CALENDAR_GET_EVENT"
}
```

### Expected Execution
- FLOW retrieves today's calendar (Google Calendar connector)
- Identifies 9 AM leadership sync event
- Optionally adds pre-brief agenda item to the event notes

### Expected Audit Record
```json
{
  "action": "CALENDAR_GET_EVENT",
  "actor": "emp-001",
  "resource": "calendar/leadership-sync-dec14",
  "outcome": "SUCCESS",
  "governanceEffect": "ALLOW",
  "policyApplied": "default-role-matrix",
  "timestamp": "2025-12-14T07:45:00Z"
}
```

### Expected Final Outcome
CEO walks into the 9 AM meeting informed: overnight incident resolved, customer escalation in motion, release delayed but controlled.

### Pass/Fail Checklist
- [ ] INC-076 surfaced within top 3 items
- [ ] Acme Corp renewal date cited correctly (Dec 28)
- [ ] Release 3.2 slip days cited correctly (14 days)
- [ ] Evidence from ≥3 connectors (Gmail, Slack, Calendar)
- [ ] No hallucinated metrics
- [ ] ActionCard references real calendar event
- [ ] Audit record created

---

## Scenario CEO-02: Board Meeting Preparation

**Goal:** Prepare a board-ready company health narrative for a scheduled board meeting.

**Context:** Quarterly board meeting is December 20, 2025. CEO needs a concise narrative on Q4 performance, risks, and Q1 plan.

**Question:** "Prepare me for the board meeting. What's the health of the company?"

### Expected FLOW Reasoning
1. Pull executive_reports.json → Q4 ARR progress, headcount, churn metrics
2. Pull customers.json → count at-risk accounts, calculate at-risk ARR
3. Pull incidents.json → Q4 incident count, MTTR trends
4. Pull projects.json → Atlas completion, Release 3.2 status
5. Synthesize into board-ready narrative: wins, risks, plan

### Evidence Sources
- `executive_reports.json` → Q4 metrics, ARR growth 18% YoY
- `customers.json` → 3 at-risk accounts, Acme Corp ($285K ARR) renewal Dec 28
- `incidents.json` → 80 incidents in dataset, 3 P0/P1 recent
- `projects.json` → Atlas 42%, Release 3.2 delayed 14 days
- `employees.json` → 450 headcount, 2 SRE hires approved

### Expected Recommendation
> "For the board: Engineering delivered 99.7% uptime in Q4 despite 3 P1 incidents (last MTTR: 47 min, within SLA). Release 3.2 ships December 29 — 14 days late due to a security fix in Guardian. ARR on track at +18% YoY. One risk: Acme Corp ($285K ARR, renewal Dec 28) has an open escalation — recovery call scheduled December 16. Q1 plan: Atlas GA (March 31), Apollo enterprise beta (April 30), 2 SRE hires starting."

### Expected ActionCard
```json
{
  "type": "document",
  "title": "Generate Board Deck Outline",
  "connector": "notion",
  "action": "NOTION_CREATE_PAGE",
  "payload": {
    "title": "Q4 Board Meeting — December 20, 2025",
    "template": "board_narrative"
  }
}
```

### Expected Execution
- FLOW creates a Notion page with the board narrative draft
- Sections: Financial Performance, Engineering Health, Customer Health, Risk Register, Q1 Plan

### Expected Audit Record
```json
{
  "action": "NOTION_CREATE_PAGE",
  "actor": "emp-001",
  "resource": "notion/board-deck-q4-2025",
  "outcome": "SUCCESS",
  "governanceEffect": "ALLOW"
}
```

### Expected Final Outcome
CEO has a structured board narrative with evidence citations, ready for editing.

### Pass/Fail Checklist
- [ ] ARR growth mentioned (18% YoY)
- [ ] Acme Corp ARR cited correctly ($285K)
- [ ] Atlas completion cited (42%)
- [ ] Incident MTTR cited (47 min)
- [ ] Notion connector used (not Gmail)
- [ ] No invented financial metrics
- [ ] Draft document created in Notion

---

## Scenario CEO-03: Customer Escalation — Acme Corp

**Goal:** Understand the full context of the Acme Corp escalation before responding to Marcus Webb's email.

**Context:** Marcus Webb (Acme Corp CTO) emailed December 11 escalating two P1 tickets and overnight downtime. Renewal is December 28.

**Question:** "Marcus Webb from Acme Corp emailed me. What's actually happening?"

### Expected FLOW Reasoning
1. Find email from Marcus Webb → thread-acme-escalation-dec11
2. Cross-reference to HPLT-847 (auth regression) and HPLT-892 (data export bug)
3. Pull customer record → cust-acme-corp (healthScore: 42, $285K ARR, renewal Dec 28)
4. Pull INC-076 → Acme Corp was affected (847 failed workflow executions)
5. Pull PR #847 (open 6 days) and HPLT-892 (fix deployed Dec 15)
6. Surface the customer call scheduled for December 16 (from Slack thread)
7. Synthesize: what happened, what's fixed, what's still open, what's the recovery plan

### Evidence Sources
- `emails.json` → thread-acme-escalation-dec11 (6 emails, Marcus Webb → Sarah Chen chain)
- `customers.json` → cust-acme-corp (healthScore: 42, arr: 285000, renewal: 2025-12-28)
- `jira_issues.json` → HPLT-847 (in-progress, PR #847 open), HPLT-892 (fix deployed Dec 15)
- `incidents.json` → INC-076 (affectedCustomers includes cust-acme-corp)
- `slack_threads.json` → slack-acme-escalation (James Wilks Dec 16 call)

### Expected Recommendation
> "Acme Corp situation: (1) HPLT-892 (data export) is fixed — deployed Dec 15. Their 50K-row nightly export will run tonight. (2) HPLT-847 (auth timeouts) — fix merged to release branch, in production now. (3) INC-076 caused 847 failed workflow executions for Acme Corp on Dec 14 at 2:47 AM — fixed in 47 minutes. (4) Sarah Chen and James Wilks have a call with Marcus Webb December 16. (5) Renewal is December 28 — 14 days away. Recommend: join the December 16 call. Acme is at risk but saveable."

### Expected ActionCard
```json
{
  "type": "email_reply",
  "title": "Reply to Marcus Webb — Acme Corp",
  "connector": "gmail",
  "action": "GMAIL_REPLY",
  "suggestedDraft": "Marcus, Thank you for reaching out directly. I've reviewed the situation with our team. Both issues are resolved — I'll have Sarah walk you through the details on December 16. I'm planning to join the call personally.",
  "to": "marcus.webb@acmecorp.com",
  "threadId": "thread-acme-escalation-dec11"
}
```

### Expected Execution
- FLOW drafts reply to Marcus Webb's email via Gmail connector
- CEO reviews and sends with one click

### Expected Audit Record
```json
{
  "action": "GMAIL_REPLY",
  "actor": "emp-001",
  "resource": "gmail/thread-acme-escalation-dec11",
  "outcome": "SUCCESS",
  "governanceEffect": "ALLOW"
}
```

### Expected Final Outcome
CEO sends an informed, confident reply to Acme Corp CTO grounded in real status data.

### Pass/Fail Checklist
- [ ] Both P1 tickets identified (HPLT-847, HPLT-892)
- [ ] INC-076 impact on Acme Corp cited (847 failed executions)
- [ ] Dec 28 renewal date surfaced
- [ ] December 16 call mentioned
- [ ] Gmail connector used (not Slack)
- [ ] Reply draft references real thread
- [ ] No hallucinated customer data

---

## Scenario CEO-04: Engineering Slowdown Investigation

**Goal:** Understand why engineering velocity has declined before the leadership sync.

**Context:** Sarah Chen mentioned in the weekly update that sprint completion is at 62%. CEO wants to understand the root causes and whether it's a systemic issue.

**Question:** "Engineering velocity has dropped. Is this a resource problem or an execution problem?"

### Expected FLOW Reasoning
1. Pull slack-eng-velocity → 62% completion, 3 consecutive sprints below target
2. Cross-reference David Park (emp-013) → 7 PRs in queue, 31-hour avg review time
3. Pull pull_requests.json → count open PRs, surface PR #847 (6 days old)
4. Pull incidents.json → 3 P1 incidents in Q4, estimate unplanned capacity consumption
5. Pull employees.json → on-call rotation (David Park 3 consecutive weeks)
6. Synthesize: velocity decline is capacity-constrained (on-call + PR review bottleneck) not execution failure

### Evidence Sources
- `slack_threads.json` → slack-eng-velocity (62% sprint, 31hr review time)
- `employees.json` → emp-013 David Park (onCall: true, 3 weeks consecutive)
- `pull_requests.json` → pr-847 (open since Dec 8), 72 total open PRs
- `incidents.json` → Q4 P1 count (3 incidents: INC-042, INC-076 in Dec)
- `projects.json` → proj-release-3-2 (19% sprint capacity consumed by stabilization)

### Expected Recommendation
> "This is a capacity problem, not an execution problem. Three root causes: (1) David Park (Staff Engineer) is on-call for the 3rd consecutive week and holding 7 PR reviews — he's the bottleneck. Sarah has already pulled him off on-call. (2) 3 P1 incidents in Q4 consumed ~28 person-days of unplanned SRE capacity. 2 SRE hires approved. (3) 19% of sprint capacity goes to Release 3.2 stabilization tax. This resolves once 3.2 ships Dec 29. Recommend: confirm the SRE hires are moving, and watch David Park's load next sprint."

### Expected ActionCard
```json
{
  "type": "insight",
  "title": "Engineering Velocity — Capacity Constraint Analysis",
  "connector": "jira",
  "action": "JIRA_SEARCH_ISSUES",
  "payload": {
    "query": "assignee = emp-013 AND status = 'In Progress'",
    "rationale": "Verify David Park's current open tickets"
  }
}
```

### Expected Audit Record
```json
{
  "action": "JIRA_SEARCH_ISSUES",
  "actor": "emp-001",
  "outcome": "SUCCESS",
  "governanceEffect": "ALLOW"
}
```

### Expected Final Outcome
CEO understands the velocity decline is structural (capacity) with a clear recovery timeline (SRE hires + Dec 29 release).

### Pass/Fail Checklist
- [ ] 62% sprint completion cited
- [ ] David Park named as bottleneck
- [ ] 31-hour PR review latency cited
- [ ] SRE hires mentioned as mitigation
- [ ] Incident capacity cost estimated
- [ ] No blame assigned to individual performance

---

## Scenario CEO-05: Headcount Decision — SRE Hires

**Goal:** Decide whether to formally approve two SRE headcount requests from Engineering.

**Context:** Sarah Chen has requested 2 SRE hires. The incident pattern and on-call burden support the request. Finance needs CEO sign-off in Workday.

**Question:** "Should I approve the 2 SRE headcount Sarah requested?"

### Expected FLOW Reasoning
1. Pull incident trend → 3 P1s in Q4, 28 person-days unplanned SRE work
2. Pull employee on-call data → David Park 3 weeks, SRE team understaffed
3. Pull executive_reports.json → headcount budget, Q1 plan
4. Calculate: 2 SREs at market rate vs. unplanned incident cost
5. Recommendation: approve (evidence-backed), action: Workday headcount approval

### Evidence Sources
- `incidents.json` → 3 P1 incidents Oct–Dec 2025, cumulative MTTR cost
- `employees.json` → current SRE count (emp-318, emp-319 = 2 named SREs + manager)
- `executive_reports.json` → Q4 headcount budget headroom
- `slack_threads.json` → slack-sre-hiring-approval (Sarah approves 2 hires)

### Expected Recommendation
> "Approve. Evidence: 3 P1 incidents in Q4 cost ~28 person-days of unplanned SRE work. The team has 3 SREs covering 450 employees and 16 production repositories. INC-076 response required both SREs on-call at 3 AM. 2 additional SREs reduces on-call frequency from every-3-weeks to every-5-weeks per person. Sarah has already approved the JDs — Elena Torres is posting them Friday. The incremental headcount cost is offset by one avoided P0 incident."

### Expected ActionCard
```json
{
  "type": "approval",
  "title": "Approve SRE Headcount — 2 FTE Q1 2026",
  "connector": "hr",
  "action": "WORKDAY_APPROVE_HEADCOUNT",
  "payload": {
    "positions": 2,
    "department": "dept-devops",
    "startQuarter": "Q1-2026",
    "requestedBy": "emp-009"
  },
  "riskLevel": "LOW",
  "requiresApproval": false
}
```

### Expected Execution
- FLOW executes Workday headcount approval via HR connector
- Notifies Sarah Chen via Slack that CEO approved

### Expected Audit Record
```json
{
  "action": "WORKDAY_APPROVE_HEADCOUNT",
  "actor": "emp-001",
  "outcome": "SUCCESS",
  "governanceEffect": "ALLOW",
  "riskLevel": "LOW"
}
```

### Expected Final Outcome
SRE headcount formally approved; JDs posted; hiring pipeline starts.

### Pass/Fail Checklist
- [ ] Incident count and cost cited (3 P1s, 28 person-days)
- [ ] Current SRE count cited
- [ ] Risk level classified LOW (not requiring 2-approver)
- [ ] HR connector used
- [ ] Audit record created
- [ ] Sarah Chen notified

---

## Scenario CEO-06: Company Health Review

**Goal:** Get a real-time snapshot of company health across all dimensions.

**Question:** "Give me a company health snapshot — engineering, customers, people, security."

### Expected FLOW Reasoning
1. Pull WIC snapshot → overall health score per domain
2. Engineering: incident rate, velocity, open PRs
3. Customers: at-risk count, total ARR at risk, renewal calendar
4. People: on-call load, overloaded employees, open headcount
5. Security: HGRD-234 (permission engine bug) status, audit anomalies

### Evidence Sources
- `incidents.json` → Q4 incident summary
- `customers.json` → 3 at-risk customers identified
- `employees.json` → overload signals (emp-013)
- `jira_issues.json` → HGRD-234 (security: incorrect permission decisions)
- `executive_reports.json` → ARR, headcount, NPS

### Expected Recommendation
> "Engineering: YELLOW — velocity at 62%, recovering after 3 P1 incidents. Release 3.2 ships Dec 29. People: YELLOW — David Park overloaded; 2 SRE hires approved. Customers: RED — Acme Corp ($285K, renewal Dec 28) at-risk; recovery call Dec 16. Security: YELLOW — HGRD-234 (Guardian permission engine bug) is in production; fix in 3.2. Finance: GREEN — ARR +18% YoY, Q4 on track."

### Expected ActionCard
None — this is a read-only briefing scenario.

### Expected Final Outcome
CEO has a cross-domain health view in under 60 seconds.

### Pass/Fail Checklist
- [ ] All 4 domains covered (engineering, customers, people, security)
- [ ] Domain statuses are evidence-backed (not arbitrary)
- [ ] Acme Corp ARR cited
- [ ] HGRD-234 surfaced as security risk
- [ ] No domain marked GREEN without evidence

---

## Scenario CEO-07: Budget Risk — Q4 Close

**Goal:** Assess whether Q4 revenue targets are at risk based on customer pipeline.

**Question:** "Are we at risk of missing Q4 ARR targets with the Acme Corp situation?"

### Expected FLOW Reasoning
1. Pull customers.json → Acme Corp ($285K), Pinnacle Logistics ($178K, renewal Dec 31)
2. Pull sales data → Q4 close pipeline, deals at risk
3. Calculate: if Acme churns = $285K ARR gap; Pinnacle = additional $178K
4. Pull exec reports → Q4 ARR target, current trajectory
5. Recommendation: Acme recovery critical; Pinnacle needs immediate outreach

### Evidence Sources
- `customers.json` → cust-acme-corp (arr: 285000, renewal: 2025-12-28)
- `customers.json` → cust-pinnacle-logistics (arr: 178000, renewal: 2025-12-31, health: at-risk)
- `executive_reports.json` → Q4 ARR target, current run rate

### Expected Recommendation
> "Risk: Two enterprise renewals in December. Acme Corp ($285K, Dec 28) — escalation in progress, recovery call Dec 16. Pinnacle Logistics ($178K, Dec 31) — at-risk, no active outreach found. Together: $463K ARR at risk in Q4. If both churn, Q4 ARR misses by ~8%. Recommend: (1) Confirm Acme recovery plan is in place for Dec 28. (2) Assign a CSM to Pinnacle immediately — no one is on it."

### Expected ActionCard
```json
{
  "type": "task",
  "title": "Assign CSM to Pinnacle Logistics renewal",
  "connector": "jira",
  "action": "JIRA_CREATE_ISSUE",
  "payload": {
    "summary": "Pinnacle Logistics renewal — assign CSM and initiate contact by Dec 16",
    "priority": "HIGH",
    "dueDate": "2025-12-16"
  }
}
```

### Expected Audit Record
```json
{
  "action": "JIRA_CREATE_ISSUE",
  "actor": "emp-001",
  "outcome": "SUCCESS",
  "governanceEffect": "ALLOW"
}
```

### Expected Final Outcome
CEO has ARR risk quantified; Pinnacle Logistics gets assigned.

### Pass/Fail Checklist
- [ ] Acme Corp ARR cited ($285K)
- [ ] Pinnacle Logistics surfaced as second at-risk
- [ ] Combined ARR at risk calculated ($463K)
- [ ] No invented revenue numbers
- [ ] Jira connector used for task creation

---

## Scenario CEO-08: Security Posture Review

**Goal:** Understand current security posture before the December board meeting.

**Question:** "What is our current security posture? Any critical risks?"

### Expected FLOW Reasoning
1. Pull HGRD-234 from Jira → Guardian policy engine bug (allows unauthorized writes)
2. Pull Meridian Health customer record → HIPAA-regulated, affected by HGRD-234
3. Pull documents → data-retention policy, SOC 2 status
4. Cross-reference: HGRD-234 is in Release 3.2 gate — fix ships Dec 29
5. Surface: Meridian Health disclosure required before Dec 29

### Evidence Sources
- `jira_issues.json` → HGRD-234 (missing AND clause allows read-only users to write)
- `customers.json` → cust-meridian-health (HIPAA-regulated, healthScore: 67)
- `documents.json` → doc-policy-data-retention (GDPR/HIPAA compliance tables)
- `incidents.json` → no security incidents in last 90 days

### Expected Recommendation
> "One active security issue: HGRD-234 — Guardian policy engine allows read-only users to perform write operations in specific configurations. Discovered by Meridian Health (HIPAA-regulated). Fix is in Release 3.2 (Dec 29). Risk: Meridian Health must be notified before the fix ships — Elena Vasquez (CISO) needs to lead a security disclosure call this week. SOC 2 audit logs retained 3 years per policy. No P0 security incidents in Q4."

### Expected ActionCard
```json
{
  "type": "email",
  "title": "Schedule Meridian Health Security Disclosure Call",
  "connector": "calendar",
  "action": "CALENDAR_CREATE_EVENT",
  "payload": {
    "title": "Security Disclosure — Meridian Health (HGRD-234)",
    "attendees": ["emp-209", "emp-341", "compliance@meridianhealth.com"],
    "urgency": "this week"
  }
}
```

### Expected Final Outcome
CEO knows about HGRD-234, Meridian Health disclosure is scheduled.

### Pass/Fail Checklist
- [ ] HGRD-234 surfaced and described accurately
- [ ] Meridian Health HIPAA context mentioned
- [ ] Fix timeline cited (Dec 29 / Release 3.2)
- [ ] Calendar connector used (not Slack)
- [ ] No invented vulnerabilities

---

## Scenario CEO-09: Quarterly Planning — Q1 2026

**Goal:** Identify the highest-leverage Q1 2026 priorities based on company state.

**Question:** "What should our Q1 2026 priorities be?"

### Expected FLOW Reasoning
1. Pull projects.json → Atlas (42% → Q1 GA), Apollo (28%), Titan (SSO), Marketplace (88%)
2. Pull customers.json → at-risk accounts, feature requests driving churn risk
3. Pull jira_issues.json → enterprise feature backlog (SSO = HPLT-815, major request)
4. Pull executive_reports.json → ARR growth, competitive positioning
5. Synthesize: Atlas GA + SSO = highest-leverage combination (unlock enterprise tier)

### Evidence Sources
- `projects.json` → proj-atlas (42%, Q1 GA target), proj-titan (SSO, 60% complete)
- `jira_issues.json` → HPLT-815 (SSO/SAML implementation, enterprise requirement)
- `customers.json` → SSO requested by 3 enterprise accounts
- `executive_reports.json` → enterprise tier = 3x ACV vs. mid-market

### Expected Recommendation
> "Q1 top 3 priorities: (1) Ship Atlas GA by March 31 — this unlocks the enterprise tier and removes the scalability ceiling that's limiting expansion at GlobalTech and QuantumLeap. (2) Ship Titan SSO (January 31) — HPLT-815 is blocking 3 enterprise deals. (3) Apollo enterprise beta (April 30). Secondary: Connect Marketplace (88% done, ship by Dec 31). Skip: GraphQL API — defer to H2 2026."

### Expected ActionCard
None — strategic planning is a read/synthesize scenario.

### Expected Final Outcome
CEO has a Q1 priority stack ranked by evidence (customer demand, revenue impact, completion proximity).

### Pass/Fail Checklist
- [ ] Atlas cited as #1 priority with GA date
- [ ] SSO mentioned (HPLT-815 or Titan)
- [ ] Priorities ranked by evidence (not arbitrary)
- [ ] At least one deferral recommended
- [ ] No invented roadmap items

---

## Scenario CEO-10: Acquisition Discussion Prep

**Goal:** Prepare context on Helios's key technical assets before a confidential acquisition discussion.

**Question:** "Summarize our core technical differentiation and any risks that would concern an acquirer."

### Expected FLOW Reasoning
1. Pull projects.json → Atlas architecture (CQRS, event sourcing, microservices)
2. Pull documents.json → RFC-0041 (Atlas tech design), arch-microservices
3. Pull incidents.json → reliability record, MTTR trends
4. Pull technical debt items → in-memory state (TD-01), vendor dependencies
5. Synthesize: key assets + honest risk register

### Evidence Sources
- `documents.json` → doc-rfc-0041 (CQRS/Event Sourcing design), doc-arch-microservices
- `incidents.json` → reliability trend (avg MTTR < 60 min for P1s)
- `projects.json` → proj-atlas (technical foundation), proj-guardian-2 (security layer)
- `jira_issues.json` → HGRD-234 (open security bug — material to disclosure)

### Expected Recommendation
> "Core assets: (1) Platform engine (Atlas) — CQRS + Event Sourcing architecture on Go microservices. Designed for 10x scale. (2) Guardian security layer — policy engine for enterprise compliance (SOC 2, HIPAA). (3) Connect ecosystem — 16 production integrations. Technical risks for acquirer: (1) Atlas is 42% complete — GA March 2026. (2) HGRD-234 — open Guardian security bug, fix Dec 29. (3) In-memory state loss on restart — documented tech debt (TD-01). Reliability: 99.7% uptime, avg P1 MTTR 47 min."

### Expected Final Outcome
CEO has a balanced asset/risk summary grounded in technical documentation.

### Pass/Fail Checklist
- [ ] Atlas architecture correctly described
- [ ] HGRD-234 surfaced as material disclosure risk
- [ ] TD-01 (in-memory state) mentioned
- [ ] Uptime and MTTR cited with evidence
- [ ] No invented technical capabilities
- [ ] Sources include RFC documents

---
