# Engineering Manager Scenarios
# Helios Software Inc. — Operational Validation Suite

Roles: Engineering Manager, Staff Engineer, Senior Engineer
Represented by: David Park (emp-013), Sarah Chen (emp-009), Team Leads
FLOW Access Level: MEMBER / ADMIN
Connectors: GitHub, Jira, Slack, Calendar

---

## Scenario ENG-01: Who Is Overloaded?

**Goal:** Identify which engineers are at capacity before assigning new work.

**Question:** "Who on the team is overloaded right now?"

### Expected FLOW Reasoning
1. Pull employees → find engineers with onCall: true
2. Pull pull_requests → count open PRs per author, count PRs waiting for each reviewer
3. Pull jira_issues → count in-progress tickets per engineer
4. Pull slack-eng-velocity → explicit mention of David Park and review bottleneck
5. Cross-reference: David Park (emp-013) = on-call + 7 PRs in review queue + Atlas tech lead

### Evidence Sources
- `employees.json` → emp-013 (onCall: true, title: Staff Engineer)
- `pull_requests.json` → pr-847 (author: emp-013), review queue analysis
- `slack_threads.json` → slack-eng-velocity (31-hour review latency, David Park named)
- `jira_issues.json` → HPLT-756, HPLT-847 (both assigned to David Park area)

### Expected Recommendation
> "David Park (emp-013, Staff Engineer) is overloaded: (1) Primary reviewer for auth service — 7 PRs in queue. (2) On-call 3 consecutive weeks. (3) Tech lead for Project Atlas auth module extraction. (4) Author of PR #847 (auth fix, 6 days open) and PR #894 (emergency fix at 3 AM). The Slack thread from December 12 explicitly flags his review latency as the sprint bottleneck. Sarah Chen has already pulled him off on-call. Recommend: redistribute his review responsibilities for the next 2 weeks and give him focused time on Atlas."

### Expected ActionCard
```json
{
  "type": "slack_message",
  "title": "Notify team of on-call reassignment",
  "connector": "slack",
  "action": "SLACK_SEND_MESSAGE",
  "payload": {
    "channel": "#engineering",
    "text": "On-call reassignment: David Park is transitioning off on-call effective this week. Elena Torres takes primary. David is focused on PR reviews and Atlas auth module."
  }
}
```

### Pass/Fail Checklist
- [ ] David Park identified by name and ID
- [ ] 3 overload factors cited (on-call, PR queue, Atlas)
- [ ] Slack evidence referenced
- [ ] Recommendation reduces David's load (not adds to it)
- [ ] Slack connector used for notification

---

## Scenario ENG-02: Which PRs Are Stale?

**Goal:** Identify pull requests that have been open too long and need intervention.

**Question:** "Which PRs have been open too long? What's blocking them?"

### Expected FLOW Reasoning
1. Pull pull_requests → filter status: open, sort by createdAt ascending
2. Find PRs older than 3 days (SLO per doc-policy-code-review)
3. For each stale PR, identify: author, reviewers assigned, blocking reason
4. Surface PR #847 as highest-priority (6 days, release gate, auth service)
5. Cross-reference with Jira for blocking dependencies

### Evidence Sources
- `pull_requests.json` → pr-847 (open since Dec 8 = 6 days), plus other open PRs
- `documents.json` → doc-policy-code-review (PR review SLO: 24 hours for critical, 3 days for standard)
- `jira_issues.json` → HPLT-847 (linked to PR #847)

### Expected Recommendation
> "Stale PRs (open > 3 days): (1) PR #847 — 6 days old, auth service, RELEASE GATE. Missing second reviewer. Blocks Release 3.2. (2) [Other stale PRs from filler data listed here]. PR #847 is the critical one — it is directly blocking the December 29 release. Every day of delay reduces QA buffer. Code review policy SLO: 24 hours for release-gate PRs. This PR is 5 days past SLO."

### Expected ActionCard
```json
{
  "type": "code_review",
  "title": "Request immediate review on PR #847",
  "connector": "github",
  "action": "GITHUB_REQUEST_REVIEW",
  "payload": {
    "prNumber": 847,
    "repo": "repo-platform-api",
    "reviewers": ["emp-015"],
    "comment": "Release gate — 6 days old, needs review today"
  }
}
```

### Pass/Fail Checklist
- [ ] PR #847 identified as most critical
- [ ] Age cited correctly (6 days)
- [ ] Code review policy SLO cited
- [ ] Release gate connection made
- [ ] GitHub connector used

---

## Scenario ENG-03: Sprint Risk Assessment

**Goal:** Identify which sprint commitments are at risk before the sprint review.

**Question:** "Which sprint 8 commitments are at risk of not shipping?"

### Expected FLOW Reasoning
1. Pull jira_issues → filter sprint = 8, status != Done
2. Identify: HPLT-847 (in-progress, PR open 6 days), HPLT-892 (just resolved), HGRD-234 (in-progress)
3. Pull pull_requests → pr-847 (open, blocks HPLT-847)
4. Pull slack-eng-velocity → 62% completion, carryover decision
5. Surface: 4 stories are Release 3.2 gate blockers and are being carried over

### Evidence Sources
- `jira_issues.json` → sprint 8 issues, status distribution
- `pull_requests.json` → pr-847 (open)
- `slack_threads.json` → slack-eng-velocity (sprint review discussion)
- `projects.json` → proj-release-3-2 (blocking issues)

### Expected Recommendation
> "Sprint 8 risk: 4 stories are at risk — all are Release 3.2 gate blockers: (1) HPLT-847 — auth fix, PR open 6 days, needs second reviewer. (2) HGRD-234 — Guardian fix, in review. (3) QA regression suite — 2 critical failures found in auth module. (4) Sprint completion is 62% (target 85%). Decision already made: all 4 carry over to Sprint 9 as top priority. Recommend: verify Sprint 9 capacity plan accounts for the 19% stabilization overhead from Sprint 8."

### Pass/Fail Checklist
- [ ] 62% sprint completion cited
- [ ] All 3 gate blocker tickets identified
- [ ] Carryover decision referenced (from Sprint Review)
- [ ] Stabilization overhead quantified (19%)

---

## Scenario ENG-04: Deployment Readiness Check

**Goal:** Run through a deployment readiness checklist before pushing a release.

**Question:** "Is Platform API v3.1.9-p1 ready for deployment?"

**Context:** This is the emergency patch for INC-076. It has been merged and is staged.

### Expected FLOW Reasoning
1. Pull pr-894 → merged at 3:28 AM, tested, LRU fix
2. Pull incidents → INC-076 context, what caused it (rolling restart needed)
3. Pull doc-runbook-platform → deployment checklist section
4. Check: memory alert threshold (should be 70% after INC-076)
5. Recommend: rolling restart strategy, timing (not 2 AM), post-deploy monitoring

### Evidence Sources
- `pull_requests.json` → pr-894 (merged, LRU fix, tested)
- `incidents.json` → inc-076 (root cause context)
- `documents.json` → doc-runbook-platform (WorkflowCache section, deployment notes)

### Expected Recommendation
> "v3.1.9-p1 deployment checklist: (1) PR #894 merged and tested — confirmed. (2) Unit tests: TestWorkflowCache_Eviction passing — confirmed. (3) Load test: 15K template dataset — pending (add to pre-deploy gate). (4) Deployment strategy: use rolling deploy — NOT simultaneous restart. (5) Post-deploy: watch memory metrics for 30 minutes. Alert threshold is now 70% (confirmed). (6) Rollback: previous v3.1.8 is stable fallback. Proceed with rolling deploy."

### Pass/Fail Checklist
- [ ] PR #894 merge status cited
- [ ] Rolling deploy strategy recommended (INC-076 lesson)
- [ ] Memory alert threshold (70%) mentioned
- [ ] Load test gap flagged
- [ ] Rollback plan included

---

## Scenario ENG-05: On-Call Handoff

**Goal:** Brief the incoming on-call engineer on current system state.

**Question:** "I'm taking on-call from David Park. What do I need to know?"

### Expected FLOW Reasoning
1. Pull slack-oncall-handoff-dec14 → formal handoff summary
2. Pull incidents → recent incidents (INC-076, INC-042) and their status
3. Pull pull_requests → open PRs that could deploy during on-call window
4. Pull doc-runbook-platform → WorkflowCache section (recent addition)
5. Synthesize: system state, known risks, escalation contacts

### Evidence Sources
- `slack_threads.json` → slack-oncall-handoff-dec14 (Priya → Kenji handoff)
- `incidents.json` → inc-076 (just resolved), inc-042 (ongoing mitigation)
- `documents.json` → doc-runbook-platform (updated with WorkflowCache section)
- `pull_requests.json` → pr-847 (might merge and auto-deploy during on-call)

### Expected Recommendation
> "On-call briefing for Dec 14 morning: (1) INC-076 resolved at 3:34 AM — root cause was WorkflowCache memory exhaustion. Fix deployed. Watch memory: alert now at 70%. (2) INC-042 mitigation: auth feature flag still in place from Dec 10. PR #847 contains the permanent fix — will deploy when merged. (3) PR #847 may merge today — if so, a rolling restart of Platform API is expected. Normal. (4) Acme Corp had 847 failed workflow executions overnight — they're aware and the Dec 16 call is scheduled. (5) Runbook: doc-runbook-platform updated with WorkflowCache section today."

### Expected ActionCard
None — this is an information briefing scenario.

### Pass/Fail Checklist
- [ ] INC-076 context included (resolved, root cause)
- [ ] INC-042 mitigation mentioned (feature flag)
- [ ] PR #847 deployment risk flagged
- [ ] Runbook update referenced
- [ ] No actions taken without on-call permission

---

## Scenario ENG-06: Incident Post-Mortem Preparation

**Goal:** Prepare structured notes for the INC-076 post-mortem meeting.

**Question:** "Help me prepare for the INC-076 post-mortem. What are the key facts?"

### Expected FLOW Reasoning
1. Pull inc-076 → full incident record, timeline, affected customers
2. Pull pr-894 → root cause fix details
3. Pull slack-inc-076-main → full conversation timeline, who said what when
4. Pull doc-runbook-platform → what the runbook says about WorkflowCache (or didn't say)
5. Pull meeting_transcripts → if post-mortem meeting transcript exists
6. Synthesize: blameless timeline, root cause, contributing factors, action items

### Evidence Sources
- `incidents.json` → inc-076 (complete record)
- `pull_requests.json` → pr-894 (fix details)
- `slack_threads.json` → slack-inc-076-main (14 messages, minute-by-minute timeline)
- `documents.json` → doc-pm-inc-076 (if already created)

### Expected Recommendation
> "INC-076 Post-Mortem Facts: Timeline: 2:47 AM PagerDuty. 3:10 AM root cause identified (David Park). 3:14 AM PR #894 created. 3:28 AM merged. 3:31 AM deployed. 3:34 AM restored. MTTR: 47 minutes. Root cause: WorkflowCache.populate() lacked eviction. Contributing factors: (1) Load test dataset (500 templates) didn't match production (12,400 templates for Acme Corp). (2) Memory alert threshold was 85% — caught too late. (3) Simultaneous pod restart meant no staggered memory growth. Action items: 5 items already in doc-pm-inc-076. No individuals to blame — systemic testing gap."

### Pass/Fail Checklist
- [ ] Timeline accurate (2:47 AM → 3:34 AM)
- [ ] Root cause correct (WorkflowCache, no eviction)
- [ ] 3 contributing factors identified
- [ ] Blameless framing maintained
- [ ] Action items from doc-pm-inc-076 cited

---

## Scenario ENG-07: Code Review Standards Compliance

**Goal:** Verify the team is following the code review standards policy.

**Question:** "Is the team following our code review standards? Any violations?"

### Expected FLOW Reasoning
1. Pull doc-policy-code-review → SLOs: 24 hours critical, 3 days standard, 2 reviews for auth
2. Pull pull_requests → open PRs older than SLO, auth PRs with < 2 reviews
3. Find violations: PR #847 = 6 days old, auth service, 1 review (needs 2)
4. Count: how many other PRs are past SLO
5. Recommend: enforce SLO, add PR age dashboard metric

### Evidence Sources
- `documents.json` → doc-policy-code-review (standards document)
- `pull_requests.json` → pr-847 (6 days, auth, 1 review — policy violation), other open PRs

### Expected Recommendation
> "Code review standards violations found: (1) PR #847 — auth service, open 6 days (SLO: 24 hours for critical). Has 1 approval, requires 2. This is a policy violation and a release gate blocker. (2) [N other PRs > 3 days old]. Policy requires: 24-hour first review for release-gate PRs, 3 days for standard PRs, minimum 2 reviews for auth-service and guardian changes. PR #847 violates all three rules. Recommended action: add PR age to the sprint dashboard. Enforce as a sprint health metric."

### Pass/Fail Checklist
- [ ] doc-policy-code-review cited as source
- [ ] PR #847 identified as policy violation
- [ ] All three policy rules cited
- [ ] Corrective action recommended

---

## Scenario ENG-08: Technical Debt Prioritization

**Goal:** Identify the highest-impact technical debt items for Sprint 9 planning.

**Question:** "What technical debt should we tackle in Q1? What has the highest impact?"

### Expected FLOW Reasoning
1. Pull known tech debt sources: incidents (INC-076 caused by unbounded cache = TD-06 equivalent)
2. Pull jira_issues → tech debt labeled tickets
3. Pull incidents → root causes that suggest systemic debt
4. Pull exec reports → any tech debt mentioned in business context
5. Rank by: (a) caused an incident, (b) blocks a goal, (c) security risk

### Evidence Sources
- `incidents.json` → inc-076 (unbounded cache = tech debt), inc-001 (Route53 = infra debt)
- `documents.json` → doc-rfc-0038 (API gateway migration — tech debt / modernization)
- `jira_issues.json` → tech debt tickets in backlog

### Expected Recommendation
> "Top 3 tech debt items for Q1: (1) Unbounded cache audit — INC-076 proved WorkflowCache had no eviction. Audit is in progress (David Park, Sprint 9). Must complete before Atlas GA. (2) Test data scale gap — load tests used 500 templates; production has 12,400. Fix test fixtures to use customer-realistic scale. (3) In-memory state loss — all incidents, decisions, and KG data are lost on restart (TD-01). This blocks operational continuity and blocks a future audit trail. Priority: #1 and #2 first because they caused real incidents."

### Pass/Fail Checklist
- [ ] INC-076 cited as evidence for cache audit
- [ ] Test data gap identified
- [ ] TD-01 (in-memory state) mentioned
- [ ] Priorities ranked by incident evidence (not opinion)
- [ ] No invented tech debt items

---

## Scenario ENG-09: Dependency Audit — Security

**Goal:** Find outdated or vulnerable dependencies across all repositories.

**Question:** "Which repos have critical security vulnerabilities from dependencies?"

### Expected FLOW Reasoning
1. Pull jira_issues → Dependabot alerts mentioned in meetings/executive reports
2. Pull documents → security scan reference (from Sprint Review: "47 Dependabot alerts")
3. Pull repositories → 16 repos, identify which have CI/security scanning
4. Surface: known alert count, recommend running Dependabot now
5. Acknowledge: cannot enumerate specific CVEs without GitHub Security connector

### Evidence Sources
- `meeting_transcripts.json` → transcript mentioning "47 Dependabot alerts"
- `repositories.json` → 16 repos across 4 products
- `documents.json` → doc-policy-code-review (security scan requirement)

### Expected Recommendation
> "From available signals: 47 Dependabot alerts were flagged in the December sprint review. Team leads were asked to close all high-severity alerts before Release 3.2 ships (December 29 deadline). To enumerate specific CVEs, FLOW needs GitHub Security Scanning connected. From the policy: all high-severity dependency alerts must be resolved before any release gate opens. Recommend: verify each product team lead has closed their assigned alerts before Dec 29."

### Expected ActionCard
```json
{
  "type": "jira_query",
  "title": "Find open Dependabot alert tickets",
  "connector": "jira",
  "action": "JIRA_SEARCH_ISSUES",
  "payload": {
    "query": "label = dependabot AND status != Done",
    "rationale": "Find open Dependabot alerts across all products"
  }
}
```

### Pass/Fail Checklist
- [ ] 47 Dependabot alerts cited (from meeting transcript)
- [ ] Dec 29 deadline mentioned
- [ ] FLOW acknowledges gap (no GitHub Security connector)
- [ ] Does not invent specific CVEs

---

## Scenario ENG-10: Merge Conflict Detection

**Goal:** Find active merge conflicts that are blocking work.

**Question:** "Are there any active merge conflicts blocking engineers right now?"

### Expected FLOW Reasoning
1. Pull pull_requests → open PRs, check for merge conflict signals in titles/labels
2. Pull slack-pr-847-review → any mention of conflicts
3. Pull jira_issues → tickets blocked by merge conflicts
4. Cross-reference: pr-847 (open 6 days, high churn branch) likely has conflicts with base

### Evidence Sources
- `pull_requests.json` → pr-847 (open 6 days on active branch — conflict risk)
- `slack_threads.json` → slack-pr-847-review (mentions of branch state)

### Expected Recommendation
> "PR #847 is at high risk of merge conflicts: it has been open for 6 days on the auth service, which is an active development area (HPLT-756, HPLT-815 all modifying the same module). GitHub connector can check the actual merge conflict status. Recommend checking PR #847 mergeable status now — if conflicted, resolve before the second reviewer is assigned (conflicted PRs cannot be reviewed meaningfully)."

### Expected ActionCard
```json
{
  "type": "code_review",
  "title": "Check PR #847 merge conflict status",
  "connector": "github",
  "action": "GITHUB_GET_PR",
  "payload": {
    "repo": "repo-platform-api",
    "prNumber": 847,
    "checkField": "mergeable"
  }
}
```

### Pass/Fail Checklist
- [ ] PR #847 identified as conflict risk
- [ ] Reasoning explains why (6 days, active area)
- [ ] GitHub connector used (not Jira)
- [ ] Does not claim a conflict exists without evidence

---

## Scenario ENG-11: Release Branch Health

**Goal:** Verify the release branch is stable and ready for QA.

**Question:** "How healthy is the Release 3.2 branch? Is it safe for QA to start?"

### Expected FLOW Reasoning
1. Pull projects.json → Release 3.2 branch status, blocking issues
2. Pull jira_issues → QA status in Release 3.2 scope
3. Pull pull_requests → what has merged to release branch
4. Pull incidents → INC-076 fix (pr-894) was emergency-merged — verify it's in release branch
5. Pull doc-runbook-platform → pre-QA checklist

### Evidence Sources
- `projects.json` → proj-release-3-2 (blockingIssues status)
- `pull_requests.json` → pr-894 (merged), pr-847 (pending)
- `jira_issues.json` → QA regression tickets in Release 3.2

### Expected Recommendation
> "Release 3.2 branch health: (1) PR #894 (memory fix) is merged — confirmed in release branch. (2) PR #847 (auth fix) is NOT yet merged — QA cannot begin auth module testing until this merges. (3) HGRD-234 fix is in review. QA assessment: branch is NOT ready for full regression. Safe for partial QA (everything except auth and Guardian policy modules). Recommend: QA starts on stable modules today; auth and Guardian modules after respective PRs merge."

### Pass/Fail Checklist
- [ ] PR #894 merge status confirmed
- [ ] PR #847 open status flagged as QA blocker
- [ ] Partial QA recommendation is sensible
- [ ] Evidence from multiple sources (projects, PRs, Jira)

---

## Scenario ENG-12: New Engineer Onboarding — Context

**Goal:** Brief a new engineer joining the Platform team on current system state.

**Question:** "I'm new to the Platform team. What do I need to know about the current state of the system?"

### Expected FLOW Reasoning
1. Pull doc-onboarding-eng → week 1 checklist, key systems
2. Pull proj-atlas → current project context
3. Pull incidents → recent incidents (INC-076) as learning context
4. Pull doc-arch-microservices → architecture overview
5. Pull doc-policy-code-review → team standards

### Evidence Sources
- `documents.json` → doc-onboarding-eng (engineering onboarding guide)
- `documents.json` → doc-arch-microservices (platform architecture)
- `projects.json` → proj-atlas (current major project)
- `incidents.json` → inc-076 (recent incident to learn from)

### Expected Recommendation
> "Platform team brief for new engineers: (1) Architecture: 7-service Go microservices (see doc-arch-microservices). Core service: Platform API (helios-platform-api). (2) Current project: Project Atlas (42% complete) — major rewrite adding CQRS/Event Sourcing. This is where most new feature work is happening. (3) Recent incident: INC-076 (Dec 14) — WorkflowCache memory exhaustion. Fixed in v3.1.9-p1. Post-mortem is in doc-pm-inc-076. (4) Code review policy: auth service requires 2 reviewers. PR SLO: 24 hours for critical. (5) On-call rotation: you'll join after 90 days. (6) Onboarding checklist: see doc-onboarding-eng."

### Pass/Fail Checklist
- [ ] Architecture doc cited
- [ ] Atlas project mentioned
- [ ] INC-076 as learning example
- [ ] Code review policy included
- [ ] No assumption of prior knowledge
- [ ] Sources are real documents in the dataset

---
