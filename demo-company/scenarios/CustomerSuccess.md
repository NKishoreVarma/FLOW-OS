# Customer Success Scenarios
# Helios Software Inc. — Operational Validation Suite

Role: VP Customer Success, Senior CSM
Represented by: Michael Santos (emp-337), James Wilks (emp-341)
FLOW Access Level: MEMBER
Connectors: Gmail, Slack, Jira, Calendar, HubSpot, Notion

---

## Scenario CS-01: Renewal Risk — Acme Corp

**Goal:** Build and execute a renewal recovery plan for Acme Corp ($285K ARR, renewal Dec 28).

**Question:** "Acme Corp renews in 14 days. What's our renewal risk and what's the recovery plan?"

### Expected FLOW Reasoning
1. Pull cust-acme-corp → healthScore 42, arr $285K, renewal Dec 28, at-risk
2. Pull emails → thread-acme-escalation-dec11 (Marcus Webb CTO escalation)
3. Pull incidents → inc-076 (847 failed executions, Acme Corp affected)
4. Pull jira_issues → HPLT-847 (in-progress), HPLT-892 (resolved Dec 15)
5. Pull slack-acme-escalation → recovery actions, Dec 16 call with Sarah Chen
6. Synthesize: risk level, recovery actions in motion, what CSM should do now

### Evidence Sources
- `customers.json` → cust-acme-corp (healthScore: 42, arr: 285000, renewal: 2025-12-28)
- `emails.json` → thread-acme-escalation-dec11 (escalation chain, 6 messages)
- `incidents.json` → inc-076 (affectedCustomers includes Acme Corp)
- `jira_issues.json` → HPLT-847 (in-progress), HPLT-892 (fixed Dec 15)
- `slack_threads.json` → slack-acme-escalation (recovery call Dec 16)

### Expected Recommendation
> "Acme Corp renewal risk: HIGH. Current status: (1) HPLT-892 resolved Dec 15 — data export works again. This is good news for the call. (2) HPLT-847 (auth fix) in final review — expected this week. (3) INC-076 caused 847 failed workflow executions for Acme on Dec 14 — Marcus Webb's CTO is aware. (4) Dec 16 call is scheduled with Sarah Chen (CTO), James Wilks (CSM), and Marcus Webb. Recovery plan: (1) Lead with HPLT-892 fix as good news. (2) Commit to HPLT-847 fix by Dec 20. (3) Offer 15% December credit. (4) Offer Kronos beta access. (5) Get verbal renewal commitment before Dec 28."

### Expected ActionCard
```json
{
  "type": "calendar_event",
  "title": "Prepare talking points for Acme Corp Dec 16 call",
  "connector": "notion",
  "action": "NOTION_CREATE_PAGE",
  "payload": {
    "title": "Acme Corp Recovery Call — December 16 Talking Points",
    "sections": ["What we fixed", "What's still pending", "Offer", "Renewal ask"]
  }
}
```

### Expected Audit Record
```json
{
  "action": "NOTION_CREATE_PAGE",
  "actor": "emp-341",
  "outcome": "SUCCESS",
  "governanceEffect": "ALLOW"
}
```

### Expected Final Outcome
James Wilks walks into the Dec 16 call with a complete picture and a structured talking point document.

### Pass/Fail Checklist
- [ ] $285K ARR cited correctly
- [ ] Dec 28 renewal deadline cited
- [ ] HPLT-892 correctly marked as resolved
- [ ] INC-076 impact on Acme cited (847 failures)
- [ ] Credit and Kronos beta mentioned as recovery levers
- [ ] Dec 16 call date referenced

---

## Scenario CS-02: Customer Health Score Decline — Meridian Health

**Goal:** Understand why Meridian Health's health score declined and create a recovery plan.

**Question:** "Meridian Health's health score dropped to 67. What happened and what do I do?"

### Expected FLOW Reasoning
1. Pull cust-meridian-health → healthScore 67, HIPAA-regulated, arr $195K
2. Pull jira_issues → HGRD-234 (Guardian bug, read-only users gaining write access — Meridian discovered it)
3. Pull incidents → inc-076 (Meridian affected: 123 failed executions)
4. Pull customers notes → "HGRD-234 caused incorrect permission decisions, security concern"
5. Synthesize: health decline driven by HGRD-234 security concern + INC-076

### Evidence Sources
- `customers.json` → cust-meridian-health (healthScore: 67, notes: HGRD-234 concern)
- `jira_issues.json` → HGRD-234 (Meridian discovered it, HIPAA implications)
- `incidents.json` → inc-076 (Meridian affected: 123 failed executions)

### Expected Recommendation
> "Meridian Health health decline: two causes. (1) HGRD-234 — Meridian discovered that Guardian policy engine allowed their read-only users to perform write operations. This is a security issue at a HIPAA-regulated customer. Fix is in Release 3.2 (Dec 29). (2) INC-076 — Meridian had 123 workflow execution failures at 2:47 AM Dec 14. MTTR 47 min (within SLA). Recovery plan: (1) Elena Vasquez (CISO) must schedule a security disclosure call with Meridian's security team this week. (2) Provide written incident report for INC-076. (3) Walk Meridian through HGRD-234 scope (their environment only) and fix timeline."

### Expected ActionCard
```json
{
  "type": "email",
  "title": "Send INC-076 incident report to Meridian Health",
  "connector": "gmail",
  "action": "GMAIL_SEND",
  "payload": {
    "to": "security@meridianhealth.com",
    "subject": "Incident Report: INC-076 — December 14, 2025",
    "attachIncidentId": "inc-076",
    "draft": true
  },
  "riskLevel": "HIGH",
  "requiresApproval": true
}
```

### Pass/Fail Checklist
- [ ] HGRD-234 identified as health decline cause
- [ ] HIPAA context for Meridian mentioned
- [ ] INC-076 impact on Meridian cited (123 failures)
- [ ] CISO involvement required
- [ ] Approval gate fires (HIGH risk)

---

## Scenario CS-03: Customer Escalation Response — GlobalTech Solutions

**Goal:** Respond to GlobalTech Solutions' concerns about the data export issue.

**Question:** "GlobalTech Solutions responded to the Release 3.2 delay email asking about HPLT-892. What do I tell them?"

### Expected FLOW Reasoning
1. Pull cust-globaltech-solutions → healthScore 71, arr $320K, openTickets: HPLT-892
2. Pull emails → thread-release-32-notification (Sandra Lee, GlobalTech responded)
3. Pull HPLT-892 → fix deployed Dec 15
4. Pull email content → Sandra Lee asks about export bug, mentions nightly job
5. Draft response: HPLT-892 is fixed, they can test tonight

### Evidence Sources
- `emails.json` → thread-release-32-notification (Sandra Lee response about export bug)
- `customers.json` → cust-globaltech-solutions (HPLT-892 in openTickets)
- `jira_issues.json` → HPLT-892 (fix deployed Dec 15)

### Expected Recommendation
> "Response to GlobalTech/Sandra Lee: HPLT-892 is fixed and in production as of December 15. GlobalTech's nightly export job can run tonight — encourage them to test and confirm. Offer Slack beta access (as mentioned in Carlos's email) for early access to Release 3.2 features. GlobalTech at $320K ARR and 71 health score — not at risk, but proactive communication will strengthen the relationship."

### Expected ActionCard
```json
{
  "type": "email_reply",
  "title": "Reply to Sandra Lee — GlobalTech export fix confirmation",
  "connector": "gmail",
  "action": "GMAIL_REPLY",
  "payload": {
    "threadId": "thread-release-32-notification",
    "to": "sandra.lee@globaltech.com",
    "draft": "Good news — the export issue (HPLT-892) is fixed and deployed as of December 15. Your nightly job can run tonight. We'd also like to offer you early access to our Kronos analytics module as part of our beta program."
  }
}
```

### Pass/Fail Checklist
- [ ] HPLT-892 fix date cited correctly (Dec 15)
- [ ] GlobalTech ARR cited ($320K)
- [ ] Correct thread referenced (thread-release-32-notification)
- [ ] Kronos beta mentioned as offered in the original email
- [ ] Gmail connector used

---

## Scenario CS-04: Support Backlog Prioritization

**Goal:** Identify which open support tickets need immediate attention.

**Question:** "Which open support tickets are most urgent? Where should I focus?"

### Expected FLOW Reasoning
1. Pull jira_issues → open P1/P2 tickets with customer links
2. Pull customers → health scores of affected customers, renewal dates
3. Cross-reference: HPLT-847 (in-progress, Acme Corp, HPLT-892 (resolved), HGRD-234 (Meridian)
4. Rank by: (a) customer renewal proximity, (b) health score, (c) ARR
5. Surface: HPLT-847 is top priority because Acme Corp renewal is Dec 28

### Evidence Sources
- `jira_issues.json` → all open P1/P2 tickets with customer links
- `customers.json` → at-risk customer profiles

### Expected Recommendation
> "Urgent support tickets ranked by business impact: (1) HPLT-847 — Auth timeouts affecting Acme Corp (renewal Dec 28, $285K ARR, health 42). Fix in review. Escalated. (2) HGRD-234 — Security issue affecting Meridian Health (HIPAA, health 67). Requires security disclosure call. (3) HPLT-815 — SSO request, blocking 3 enterprise deals but not causing active failures. (4) HPLT-756 — Atlas auth refactor, internal, no direct customer impact. Action: verify HPLT-847 second reviewer is assigned today."

### Pass/Fail Checklist
- [ ] HPLT-847 ranked #1 with correct reasoning (Acme renewal)
- [ ] HGRD-234 ranked for Meridian (HIPAA context)
- [ ] Rankings are based on evidence (ARR, health, renewal)
- [ ] No invented ticket priorities

---

## Scenario CS-05: QBR Preparation — QuantumLeap AI

**Goal:** Prepare for a quarterly business review with QuantumLeap AI.

**Question:** "I have a QBR with QuantumLeap AI next week. Help me prepare."

### Expected FLOW Reasoning
1. Pull customers → cust-quantumleap (healthScore 88, tier: enterprise, $165K ARR)
2. Pull incidents → was QuantumLeap affected by any incidents?
3. Pull jira_issues → any open tickets for QuantumLeap
4. Pull meeting_transcripts → any prior QuantumLeap call notes
5. Pull news signals → "QuantumLeap AI announced a Series A" from meeting transcript

### Evidence Sources
- `customers.json` → cust-quantumleap (healthScore: 88, growth indicators)
- `incidents.json` → check affectedCustomers for QuantumLeap
- `meeting_transcripts.json` → Series A announcement mentioned
- `jira_issues.json` → QuantumLeap open tickets

### Expected Recommendation
> "QuantumLeap AI QBR prep: (1) Health score: 88 — healthy, strong relationship. (2) No active P1 tickets. (3) INC-076 check: QuantumLeap was not listed as affected. (4) Series A announced recently — growth signal. Expansion opportunity: QuantumLeap's Series A likely means headcount growth → more seats. Introduce Atlas (enterprise scale) as a roadmap item that aligns with their growth. Suggested QBR agenda: (1) Q4 usage review, (2) Release 3.2 preview, (3) Atlas GA timeline, (4) Expansion conversation."

### Pass/Fail Checklist
- [ ] QuantumLeap health score cited (88)
- [ ] INC-076 impact verified (not affected)
- [ ] Series A opportunity surfaced from meeting transcript
- [ ] QBR agenda is evidence-based
- [ ] No invented customer data

---

## Scenario CS-06: Executive Outreach Timing

**Goal:** Identify the right moment for executive-level outreach to at-risk accounts.

**Question:** "Should I get the CEO or CTO involved in any customer situations right now?"

### Expected FLOW Reasoning
1. Pull customers → identify at-risk accounts
2. Pull emails → existing executive involvement (Sarah Chen joined Acme Corp escalation)
3. Pull renewal dates → urgency calendar
4. Apply rule: escalate to C-level when ARR > $200K AND health < 50 AND renewal < 30 days
5. Surface: Acme Corp meets all three criteria; CEO should join Dec 16 call

### Evidence Sources
- `customers.json` → at-risk accounts with ARR and renewal dates
- `emails.json` → thread-acme-escalation-dec11 (Sarah already joined)
- `slack_threads.json` → slack-acme-escalation

### Expected Recommendation
> "Executive escalation needed NOW: (1) Acme Corp — meets all escalation criteria: $285K ARR, health score 42, renewal Dec 28 (14 days). Sarah Chen (CTO) is already on the Dec 16 call. Recommend CEO James Hollis also joins — this call can determine a $285K renewal. (2) Pinnacle Logistics — $178K ARR, at-risk, renewal Dec 31, no active escalation. Recommend VP Success outreach this week. No other accounts currently meet escalation criteria."

### Expected ActionCard
```json
{
  "type": "slack_message",
  "title": "Alert CEO to join Acme Corp call",
  "connector": "slack",
  "action": "SLACK_SEND_MESSAGE",
  "payload": {
    "recipient": "emp-001",
    "text": "James — strongly recommend joining the Acme Corp call December 16. This is a $285K renewal expiring December 28. Sarah and James Wilks will be there. Marcus Webb (Acme CTO) emailed you directly."
  }
}
```

### Pass/Fail Checklist
- [ ] Escalation criteria applied (ARR, health, renewal)
- [ ] Both Acme and Pinnacle surfaced
- [ ] Sarah Chen's existing involvement acknowledged
- [ ] CEO escalation recommendation has evidence
- [ ] Slack connector used for internal notification

---

## Scenario CS-07: Churn Risk Identification

**Goal:** Identify all customers at risk of churning in the next 90 days.

**Question:** "Which customers are most likely to churn in the next 90 days?"

### Expected FLOW Reasoning
1. Pull customers → filter health != 'healthy', sort by contractRenewalDate
2. Cross-reference: open P1 tickets + recent incident impact + renewal proximity
3. Calculate churn risk score: (1-healthScore/100) × ARR × urgency_factor
4. Surface: Acme Corp (highest urgency), Pinnacle Logistics, Meridian Health

### Evidence Sources
- `customers.json` → all customer health scores, renewal dates, ARR
- `incidents.json` → customer impact records
- `jira_issues.json` → open tickets by customer

### Expected Recommendation
> "Churn risk next 90 days: (1) Acme Corp — renewal Dec 28, health 42, $285K. CRITICAL. (2) Pinnacle Logistics — renewal Dec 31, at-risk, health 59, $178K. HIGH. (3) Meridian Health — no renewal soon, but HGRD-234 security issue could trigger early exit, $195K ARR. MEDIUM. (4) [Additional at-risk customers from filler data]. Combined at-risk ARR from these three: $658K. Recovery plans in progress for Acme and Meridian. Pinnacle needs CSM assignment today."

### Pass/Fail Checklist
- [ ] All 3 named at-risk customers surfaced
- [ ] Combined ARR at risk calculated
- [ ] Renewal dates cited for each
- [ ] Churn reasoning is evidence-based (not arbitrary)
- [ ] Pinnacle gap (no active CSM) flagged

---

## Scenario CS-08: Success Metrics Report

**Goal:** Prepare a CS team metrics report for the monthly leadership meeting.

**Question:** "What are our customer success metrics this month? What's the story?"

### Expected FLOW Reasoning
1. Pull customers → count by health segment, calculate ARR by segment
2. Pull incidents → customer-affecting incidents, MTTR
3. Pull jira_issues → P1/P2 ticket count, avg resolution time
4. Pull executive_reports → NPS, CSAT if available
5. Synthesize: headline metric + risk callout + wins

### Evidence Sources
- `customers.json` → health distribution across 210 customers
- `incidents.json` → customer-affecting P1s in December
- `jira_issues.json` → open P1/P2 count with customer links
- `executive_reports.json` → NPS, retention metrics

### Expected Recommendation
> "December CS metrics: (1) Health distribution: ~65% healthy, ~25% at-risk, ~10% churned. (2) ARR at risk: $658K (Acme, Pinnacle, Meridian). (3) Active P1 tickets: 2 (HPLT-847 and HGRD-234). Both in recovery. (4) Incident customer impact: 3 enterprise accounts affected by INC-076, all contacted and in recovery conversations. (5) Win: HPLT-892 resolved in 5 days, Acme's data export working. Story for leadership: we're managing a tough December — 3 converging incidents, 2 enterprise renewals, 1 security disclosure. Recovery plans are in motion."

### Pass/Fail Checklist
- [ ] Health distribution calculated from data
- [ ] $658K at-risk ARR cited
- [ ] Both open P1 tickets mentioned
- [ ] INC-076 customer impact acknowledged
- [ ] Narrative is balanced (challenge + recovery)

---

## Scenario CS-09: Renewal Calendar Audit

**Goal:** Ensure no renewals fall through the cracks in December and January.

**Question:** "What renewals are coming up in the next 60 days? Are they all covered?"

### Expected FLOW Reasoning
1. Pull customers → filter by contractRenewalDate in next 60 days
2. For each: health score, assigned CSM, active outreach status
3. Flag: renewals with no CSM, renewals with at-risk health, renewals with open P1s
4. Sort by: risk-weighted order

### Evidence Sources
- `customers.json` → all renewal dates, health, CSM assignments, ARR

### Expected Recommendation
> "Renewals in next 60 days (Dec 14 – Feb 12, 2026): (1) Acme Corp — Dec 28, $285K, health 42. James Wilks assigned. Recovery call Dec 16. (2) Pinnacle Logistics — Dec 31, $178K, at-risk. NO CSM ASSIGNED. (3) [Additional renewals from data]. Coverage gaps: Pinnacle Logistics is uncovered. Recommend: assign CSM to Pinnacle immediately, start outreach this week. Overall: 2 high-risk renewals, 1 with no coverage. Action required today."

### Pass/Fail Checklist
- [ ] Acme and Pinnacle surfaced as highest risk
- [ ] Pinnacle coverage gap identified
- [ ] Renewal dates cited correctly
- [ ] Actionable output (assign CSM)

---

## Scenario CS-10: Health Score Decline Investigation

**Goal:** Understand why three customers' health scores dropped in the same week.

**Question:** "Three customers dropped health scores this week. Is this connected?"

### Expected FLOW Reasoning
1. Pull customers → find accounts with recent health score changes
2. Cross-reference with inc-076 (affected Acme, Meridian, GlobalTech)
3. All three are in inc-076.affectedCustomers → the decline is INC-076-related
4. Synthesize: single incident caused correlated health score drops — not independent deterioration

### Evidence Sources
- `incidents.json` → inc-076 (affectedCustomers: Acme Corp, Meridian Health, GlobalTech)
- `customers.json` → health scores for affected accounts

### Expected Recommendation
> "The three health score declines are connected — all three customers (Acme Corp, Meridian Health, GlobalTech Solutions) were affected by INC-076 (Dec 14, 2:47 AM). This is a correlated drop from a single incident, not independent relationship problems. Recovery actions are already in motion for Acme (Dec 16 call) and Meridian (security disclosure pending). GlobalTech sent a concerned email about their export (now fixed). This is manageable — treat as one recovery campaign, not three separate accounts."

### Pass/Fail Checklist
- [ ] INC-076 identified as the common cause
- [ ] All 3 affected customers named
- [ ] Correlated vs. independent decline distinction made
- [ ] Recovery actions for each cited

---
