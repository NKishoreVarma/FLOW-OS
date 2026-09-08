# Support Scenarios
# Helios Software Inc. — Operational Validation Suite

Role: Support Engineer, Support Lead
FLOW Access Level: MEMBER
Connectors: Jira, Gmail, Slack, Notion, Calendar

---

## Scenario SUP-01: Critical Customer Ticket Triage

**Goal:** Determine which open support tickets need immediate escalation before the morning standup.

**Question:** "Which open tickets are most critical right now? What needs to be escalated?"

### Expected FLOW Reasoning
1. Pull jira_issues → filter status: open, priority: P1/P2
2. For each P1/P2: cross-reference customer health, renewal proximity, ARR
3. Surface HPLT-847 (Acme Corp, renewal Dec 28, in-progress auth fix)
4. Surface HGRD-234 (Meridian Health, HIPAA, security issue, in-progress)
5. Rank: by customer ARR × health risk × renewal urgency

### Evidence Sources
- `jira_issues.json` → HPLT-847 (P1, in-progress), HGRD-234 (P1, security)
- `customers.json` → at-risk customer profiles with ARR and renewal dates

### Expected Recommendation
> "Morning triage — tickets requiring immediate escalation: (1) HPLT-847 — Auth timeouts, Acme Corp ($285K, renewal Dec 28). PR #847 has been open 6 days needing second reviewer. This is a release gate blocker and a renewal risk. Escalate to Engineering Lead now. (2) HGRD-234 — Guardian permission bug, Meridian Health (HIPAA). Security disclosure call needs to be scheduled this week. Escalate to CISO (Elena Vasquez). (3) HPLT-815 (SSO/SAML) — feature request, no active customer harm, lower priority. (4) HPLT-899 — INC-076 follow-up load test. In progress with Kenji."

### Expected ActionCard
```json
{
  "type": "slack_message",
  "title": "Escalate HPLT-847 to engineering lead",
  "connector": "slack",
  "action": "SLACK_SEND_MESSAGE",
  "payload": {
    "channel": "#engineering",
    "text": "@david-park HPLT-847 escalation: Acme Corp renewal is December 28. PR #847 needs a second reviewer today. This is blocking the renewal. Can you assign someone to review?"
  }
}
```

### Expected Audit Record
```json
{
  "action": "SLACK_SEND_MESSAGE",
  "actor": "support-user",
  "outcome": "SUCCESS",
  "governanceEffect": "ALLOW"
}
```

### Pass/Fail Checklist
- [ ] HPLT-847 and HGRD-234 both surfaced
- [ ] Acme Corp renewal date cited (Dec 28)
- [ ] HIPAA context for HGRD-234 mentioned
- [ ] Correct escalation paths (engineering for 847, CISO for HGRD-234)
- [ ] Slack connector used

---

## Scenario SUP-02: Acme Corp Ticket Status

**Goal:** Give a complete status update on all open Acme Corp tickets for the December 16 call.

**Question:** "What's the complete status on all open Acme Corp tickets? I need to brief the team before the December 16 call."

### Expected FLOW Reasoning
1. Pull cust-acme-corp → openTickets: [HPLT-892, HPLT-847]
2. Pull HPLT-892 → fix deployed Dec 15 (RESOLVED)
3. Pull HPLT-847 → in-progress, PR #847 open 6 days, needs second reviewer
4. Pull inc-076 → Acme Corp affected (847 failed executions)
5. Synthesize: what's resolved, what's pending, what's the honest ETA

### Evidence Sources
- `customers.json` → cust-acme-corp (openTickets: HPLT-892, HPLT-847)
- `jira_issues.json` → HPLT-892 (fix deployed Dec 15), HPLT-847 (in-progress)
- `incidents.json` → inc-076 (Acme impact: 847 failed executions)

### Expected Recommendation
> "Acme Corp ticket brief for Dec 16 call: (1) HPLT-892 (data export) — RESOLVED. Fix deployed December 15. Acme's 50K-row nightly export is working. Confirm with them. (2) HPLT-847 (auth timeouts) — IN PROGRESS. Root cause fixed in PR #847 (in review). Fix is in production already (PR merged to release branch). No more auth deadlocks occurring. Pending formal PR review completion. (3) INC-076 (Dec 14 overnight) — RESOLVED. 47-minute MTTR. Root cause: WorkflowCache memory exhaustion. Permanent fix deployed (PR #894). Incident report available. Summary for call: 2 of 3 issues fully resolved. HPLT-847 is in its final step."

### Expected ActionCard
```json
{
  "type": "document",
  "title": "Create Acme Corp call prep doc",
  "connector": "notion",
  "action": "NOTION_CREATE_PAGE",
  "payload": {
    "title": "Acme Corp — December 16 Call Brief",
    "content": "HPLT-892: RESOLVED Dec 15. HPLT-847: IN PROGRESS, PR in review. INC-076: RESOLVED, incident report attached."
  }
}
```

### Pass/Fail Checklist
- [ ] HPLT-892 correctly marked RESOLVED (Dec 15)
- [ ] HPLT-847 correctly marked IN PROGRESS
- [ ] INC-076 mentioned with MTTR (47 min)
- [ ] 847 failed executions cited
- [ ] Call brief document created

---

## Scenario SUP-03: Support Backlog Prioritization

**Goal:** Prioritize the full support backlog for sprint planning.

**Question:** "Help me prioritize the support backlog for next sprint. What goes first?"

### Expected FLOW Reasoning
1. Pull jira_issues → all open tickets, group by priority and customer
2. Cross-reference customers → at-risk accounts get priority boost
3. Apply triage matrix: P1 active > P1 fix-in-review > P2 at-risk customer > P2 standard > feature requests
4. Surface: HPLT-847 and HGRD-234 as P1 requiring active sprint focus
5. Surface: HPLT-815 (SSO) as high-value feature for Q1

### Evidence Sources
- `jira_issues.json` → full ticket list with priorities and customer links
- `customers.json` → at-risk customers to weight tickets

### Expected Recommendation
> "Support backlog priority for Sprint 9: (1) HPLT-847 [P1]: Auth fix — second reviewer needed today. Gate blocker. (2) HGRD-234 [P1]: Security fix — disclosure call needed this week. (3) HPLT-899 [P2]: Load test 15K templates — INC-076 action item, assign to Kenji. (4) HPLT-815 [P2]: SSO/SAML — enterprise demand, assign after 3.2 ships. (5) HPLT-756 [P3]: Atlas auth refactor — blocked on PR #847, unblocks after. (6) Feature backlog: defer until Sprint 10. Priority rule: fix-what-broke-a-customer-in-the-last-30-days before new work."

### Pass/Fail Checklist
- [ ] HPLT-847 and HGRD-234 as #1 and #2
- [ ] HPLT-899 (post-mortem action item) included
- [ ] HPLT-815 SSO ranked correctly (after 3.2)
- [ ] No invented tickets
- [ ] Priority rule stated explicitly

---

## Scenario SUP-04: Knowledge Base Gap Analysis

**Goal:** Identify gaps in the knowledge base that are causing repeat support tickets.

**Question:** "Which issues keep coming up because we don't have good documentation?"

### Expected FLOW Reasoning
1. Pull jira_issues → find recurring themes across open tickets
2. Pull documents → check if runbooks/guides exist for these themes
3. Cross-reference: HPLT-847 type (auth mutex) — does a runbook exist? NO (found in OPS-05)
4. Pull incident post-mortems → action items pointing to documentation gaps
5. Surface: auth service, WorkflowCache, and SSO setup as documentation gaps

### Evidence Sources
- `jira_issues.json` → recurring issue patterns
- `documents.json` → existing runbooks and guides
- `incidents.json` → inc-076 post-mortem action items

### Expected Recommendation
> "Knowledge base gaps causing repeat tickets: (1) Auth service degradation: no runbook. HPLT-847 root cause (mutex deadlock) is undocumented — support teams couldn't diagnose it without engineering escalation. (2) WorkflowCache memory exhaustion: JUST added to doc-runbook-platform after INC-076. Test that the new section is findable by support. (3) SSO setup guide: HPLT-815 generates repeated customer questions about when SSO will be available and how to configure identity providers. Pre-ship documentation would reduce 40% of these tickets. (4) Data export limitations: the 10K-row bug (HPLT-892) generated 8 days of confused tickets because customers didn't understand what was happening."

### Pass/Fail Checklist
- [ ] Auth service runbook gap identified
- [ ] WorkflowCache section mentioned as JUST added
- [ ] SSO documentation gap cited
- [ ] Data export customer confusion cited
- [ ] Sources are real documents (not invented)

---

## Scenario SUP-05: Escalation Workflow Validation

**Goal:** Verify that the support-to-engineering escalation path is working correctly.

**Question:** "Is our escalation path working? HPLT-847 has been open 6 days — did it get properly escalated?"

### Expected FLOW Reasoning
1. Pull HPLT-847 → created around Dec 8 when PR #847 was opened
2. Pull slack-pr-847-review → thread shows escalation happened Dec 10 (Slack)
3. Pull pr-847 → 1 approval, needs 2 — escalation happened but second reviewer not assigned
4. Assess: escalation was flagged verbally but not formally actioned via Jira
5. Surface: escalation worked (problem was identified) but execution failed (no second reviewer assigned)

### Evidence Sources
- `jira_issues.json` → HPLT-847 (status: in-progress, created Dec 8-ish)
- `slack_threads.json` → slack-pr-847-review (escalation discussion in Slack)
- `pull_requests.json` → pr-847 (1 approval, 6 days open)

### Expected Recommendation
> "Escalation path analysis for HPLT-847: (1) Escalation was flagged: the Slack thread shows the bottleneck was discussed December 10 and a reviewer reassignment was mentioned. (2) Escalation was NOT properly actioned: 6 days later, the PR still has only 1 reviewer. The Slack discussion didn't translate into a GitHub action. (3) Process gap: escalations in Slack don't create formal assignments. A Jira sub-task for 'second review required — release gate' with an owner and due date would have prevented this. Recommendation: for release-gate PRs, create a tracking Jira issue with an engineer assignment when escalating."

### Pass/Fail Checklist
- [ ] Escalation identified as occurring (Slack thread)
- [ ] Execution failure identified (no second reviewer assigned)
- [ ] Process gap clearly stated
- [ ] Concrete fix recommended (Jira tracking sub-task)

---

## Scenario SUP-06: SLA Breach Risk

**Goal:** Identify which open tickets are at risk of breaching their SLA.

**Question:** "Which open tickets are closest to breaching their SLA?"

### Expected FLOW Reasoning
1. Pull jira_issues → open tickets with creation dates
2. Apply SLA rules: P1 = 4-hour response SLA; P2 = 8 hours; P3 = 48 hours
3. Calculate time elapsed since creation
4. Surface: HPLT-847 is the most egregious — P1 open 6 days (far past SLA)
5. Note: SLA breach may have already occurred — assess whether SLA clock was paused

### Evidence Sources
- `jira_issues.json` → HPLT-847 (in-progress, created ~Dec 8), HGRD-234 (in-progress)
- SLA policy definitions

### Expected Recommendation
> "SLA breach analysis: (1) HPLT-847: Created Dec 8. P1 response SLA = 4 hours. 6 days have elapsed. SLA BREACH — unless SLA was paused when fix entered review (valid). Verify if Acme Corp was notified of status updates every 24 hours per escalation SLA. (2) HGRD-234: P1 security. Security disclosure timeline is driven by HIPAA rules (72-hour notification), not standard SLA. Disclosure call not yet scheduled. Risk of HIPAA clock starting. (3) Active recommendation: send an SLA status update to Acme Corp today (HPLT-847) and schedule the Meridian Health call this week (HGRD-234)."

### Pass/Fail Checklist
- [ ] HPLT-847 SLA breach identified
- [ ] HGRD-234 HIPAA 72-hour clock mentioned
- [ ] SLA pause condition acknowledged
- [ ] Proactive customer communication recommended
- [ ] No invented SLA rules

---

## Scenario SUP-07: Common Issue Pattern Detection

**Goal:** Identify patterns in December support issues to surface systemic product problems.

**Question:** "What common patterns are showing up in December support tickets?"

### Expected FLOW Reasoning
1. Pull jira_issues → December tickets, group by component/symptom
2. Identify: auth issues (HPLT-847 + INC-042), memory/performance (INC-076 + HPLT-892 scale), security/permissions (HGRD-234)
3. Cross-reference with customers → Acme Corp appears in multiple issues
4. Surface: December is dominated by three intersecting failures — not random, all related to scale and Release 3.2

### Evidence Sources
- `jira_issues.json` → December ticket distribution
- `incidents.json` → INC-042, INC-076 (December incidents)
- `customers.json` → Acme Corp in multiple issues

### Expected Recommendation
> "December support patterns: (1) Auth service fragility: HPLT-847 (race condition), INC-042 (auth regression), HPLT-815 (SSO request) — 3 distinct auth-related issues in 30 days. Auth service is the highest-risk component going into 3.2. (2) Scale ceiling: INC-076 (memory exhaustion at Acme's scale), HPLT-892 (export failure at 10K rows) — Helios has a consistent scale boundary problem. (3) Acme Corp concentration: Acme Corp's profile (1200 users, 12,400 templates, 50K-row exports) hits every edge case. They're our scale reference customer whether we want that or not. Recommendation: create a 'Acme-scale' test suite."

### Pass/Fail Checklist
- [ ] Auth issues correctly grouped (847, INC-042, 815)
- [ ] Scale pattern identified (INC-076 + HPLT-892)
- [ ] Acme Corp as scale canary identified
- [ ] Recommendation creates actionable test suite
- [ ] Pattern analysis is evidence-based

---

## Scenario SUP-08: Ticket Routing Optimization

**Goal:** Ensure tickets are routed to the correct team and not stuck in the wrong queue.

**Question:** "Are any tickets in the wrong queue or team? Anything routing incorrectly?"

### Expected FLOW Reasoning
1. Pull jira_issues → tickets and their assigned teams
2. Identify: HGRD-234 is a security issue but is it assigned to the security team?
3. Identify: HPLT-847 is assigned but blocked on GitHub review (not a Jira execution issue)
4. Pull employees → who owns which components (Elena Vasquez = security, David Park = platform/auth)
5. Surface: any misrouted tickets

### Evidence Sources
- `jira_issues.json` → ticket assignments and teams
- `employees.json` → team component ownership

### Expected Recommendation
> "Ticket routing audit: (1) HGRD-234 — Guardian security bug. Verify this is assigned to Elena Vasquez (CISO, emp-209) and the Helios Guard team. It originated as a product ticket but has security disclosure implications — CISO must own. (2) HPLT-847 — the Jira ticket is IN PROGRESS but the actual blocker is a GitHub PR review, not a Jira task. The issue is tracked correctly but the action is in GitHub. Create a sub-task: 'Assign second reviewer to PR #847' with an owner. (3) HPLT-756 (Atlas auth refactor) — marked blocked. Verify it's in the Atlas backlog, not the support queue. Support teams shouldn't be working on internal refactors."

### Pass/Fail Checklist
- [ ] HGRD-234 security ownership verified
- [ ] HPLT-847 GitHub-vs-Jira gap identified
- [ ] HPLT-756 internal refactor routing questioned
- [ ] No invented tickets
- [ ] Routing recommendations are specific

---

## Scenario SUP-09: Post-Incident Customer Communication

**Goal:** Draft proactive customer communication about INC-076 before customers ask.

**Question:** "INC-076 is resolved. What do I tell customers? Who gets which message?"

### Expected FLOW Reasoning
1. Pull inc-076 → 47-min outage, 100% error rate, all workflow executions failed
2. Pull customers → which customers were active during the incident window (Dec 14, 2:47 AM - 3:34 AM)
3. Identify: Acme Corp (847 failed executions = directly impacted and knows)
4. Pull cust-meridian-health → HIPAA, may have had active workflows
5. Segment communication: directly impacted (Acme) vs. potentially impacted vs. all customers

### Evidence Sources
- `incidents.json` → inc-076 (timeline: 2:47 AM to 3:34 AM, 100% error rate, 847 Acme failures)
- `customers.json` → Acme Corp (directly impacted), enterprise tier customers

### Expected Recommendation
> "Post-INC-076 customer communication plan: (1) Acme Corp (directly impacted — 847 confirmed failed executions): personal email from VP Customer Success within 24 hours. Include: what happened, MTTR (47 min), root cause (WorkflowCache memory bug), permanent fix (PR #894 deployed), and credit offer. (2) Meridian Health (HIPAA-regulated, may have active workflows at 2:47 AM): send proactive notification. HIPAA availability SLA requires acknowledgment. (3) All enterprise tier customers: status page post-mortem within 48 hours. Include timeline + fix + prevention. (4) Free/starter tier: status page update sufficient. Do NOT: provide technical details in the all-customer message, or mention Acme Corp's specific failure count."

### Expected ActionCard
```json
{
  "type": "email",
  "title": "Draft INC-076 post-mortem email to Acme Corp",
  "connector": "gmail",
  "action": "GMAIL_CREATE_DRAFT",
  "payload": {
    "to": "cto@acmecorp.example",
    "subject": "Platform Incident Resolution — December 14 Service Disruption",
    "template": "incident_postmortem_enterprise",
    "prefill": {
      "incidentId": "INC-076",
      "mttr": "47 minutes",
      "failedExecutions": 847,
      "creditOffer": true
    }
  }
}
```

### Expected Audit Record
```json
{
  "action": "GMAIL_CREATE_DRAFT",
  "actor": "support-user",
  "outcome": "SUCCESS",
  "governanceEffect": "ALLOW"
}
```

### Pass/Fail Checklist
- [ ] Acme Corp correctly identified as directly impacted (847 executions)
- [ ] Meridian Health surfaced for HIPAA proactive notification
- [ ] Segmented communication plan (not one message for all)
- [ ] Credit offer tied to Acme communication
- [ ] Draft created (not auto-sent)

---

## Scenario SUP-10: Self-Service Deflection Analysis

**Goal:** Identify which support tickets could have been self-served if better documentation existed.

**Question:** "How many of our December tickets could customers have resolved themselves?"

### Expected FLOW Reasoning
1. Pull jira_issues → December tickets, categorize by type
2. Pull documents → public-facing docs and runbooks
3. For each ticket type: does a public troubleshooting guide exist?
4. Estimate: tickets without corresponding docs = deflectable with documentation investment
5. Surface: highest-deflection-value documentation to write

### Evidence Sources
- `jira_issues.json` → December ticket breakdown
- `documents.json` → existing external documentation
- `incidents.json` → customer-reported issues (where customers found the problem before support)

### Expected Recommendation
> "Self-service deflection analysis: (1) HPLT-892 (data export > 10K rows): this type of limit-based failure is highly deflectable. A 'Data Export Limits' guide with workarounds would have answered Acme's initial questions. Estimated deflection: 60-70% of initial contact. (2) INC-076 customer reports: during the incident, Acme noticed failures before Helios alerted. A real-time status page would have deflected 4-6 tickets asking 'is something down?'. (3) SSO/SAML questions (HPLT-815): feature timing questions are deflectable with a public roadmap. (4) Auth timeout reports (HPLT-847 symptom): some customers reported symptoms without submitting tickets. Not deflectable until fix ships. Priority: status page > export limits guide > public roadmap."

### Pass/Fail Checklist
- [ ] Three deflection opportunities identified from real tickets
- [ ] Status page as highest priority (not invented)
- [ ] Auth timeout correctly not deflectable (bug, not docs gap)
- [ ] Export limits guide recommendation grounded in HPLT-892
- [ ] No invented deflection percentages without caveats

---
