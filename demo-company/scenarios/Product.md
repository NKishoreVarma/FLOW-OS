# Product Manager Scenarios
# Helios Software Inc. — Operational Validation Suite

Roles: Chief Product Officer, Product Manager
Represented by: Jordan Kim (emp-249), Carlos Mendez (emp-252), Yuna Lee (emp-251)
FLOW Access Level: MEMBER / ADMIN
Connectors: Jira, Slack, Calendar, Notion, GitHub (read)

---

## Scenario PROD-01: Feature Behind Schedule

**Goal:** Understand why Release 3.2 slipped and communicate a credible updated timeline.

**Question:** "Release 3.2 missed December 15. What do I tell customers and what's the real ship date?"

### Expected FLOW Reasoning
1. Pull proj-release-3-2 → original Dec 15, new Dec 29, blockingIssues
2. Pull HPLT-847, HPLT-892, HGRD-234 → exact status of each blocker
3. Pull emails → release delay notification (thread-release-32-notification) — already sent
4. Pull slack-release-32-delay → announcement thread with customer-facing language
5. Synthesize: what's blocked, what's fixed, what's the honest timeline

### Evidence Sources
- `projects.json` → proj-release-3-2 (targetDate: 2025-12-29, blockingIssues)
- `jira_issues.json` → HPLT-847 (in-progress), HPLT-892 (resolved), HGRD-234 (in-progress)
- `emails.json` → thread-release-32-notification (delay notification sent Dec 12)
- `slack_threads.json` → slack-release-32-delay

### Expected Recommendation
> "Release 3.2 status for customer communication: (1) HPLT-892 (data export) is FIXED — deployed Dec 15. Tell customers this is resolved now. (2) HPLT-847 (auth fix) — in final review, expected merge this week. (3) HGRD-234 (security fix) — in review, ETA Dec 20. Full release: December 29. The customer notification email was already sent December 12. For enterprise accounts: offer Kronos beta access as a goodwill gesture during the delay."

### Expected ActionCard
```json
{
  "type": "email",
  "title": "Send Release 3.2 update to enterprise customers",
  "connector": "gmail",
  "action": "GMAIL_SEND",
  "payload": {
    "to": ["enterprise-customers"],
    "subject": "Release 3.2 Update — Confirmed December 29",
    "draft": true,
    "note": "HPLT-892 fix available now; Release 3.2 Dec 29"
  }
}
```

### Pass/Fail Checklist
- [ ] Dec 15 → Dec 29 slip correctly cited
- [ ] HPLT-892 correctly marked as already fixed
- [ ] 2 remaining open blockers identified
- [ ] Existing notification email acknowledged (not duplicated)
- [ ] Gmail connector used

---

## Scenario PROD-02: Customer Feature Request Triage

**Goal:** Understand which customer-requested features are most critical to prioritize.

**Question:** "Which customer feature requests should we add to the Q1 roadmap?"

### Expected FLOW Reasoning
1. Pull customers.json → at-risk customers and their open tickets
2. Pull jira_issues → feature requests from customer-reported tickets
3. Cross-reference: Acme Corp → data export fix (done), auth fix (in progress), next request = bulk operations
4. Pull HPLT-815 (SSO/SAML) → enterprise requirement from multiple accounts
5. Surface: SSO is the highest-leverage feature (blocks multiple enterprise deals)

### Evidence Sources
- `jira_issues.json` → HPLT-815 (SSO/SAML, enterprise requirement), feature request tickets
- `customers.json` → enterprise tier accounts, feature requests in notes
- `meeting_transcripts.json` → user research findings (top 3 pain points: SSO, bulk ops, audit log noise)

### Expected Recommendation
> "Top customer feature requests for Q1 roadmap: (1) SSO/SAML (HPLT-815) — requested by 3 enterprise accounts. Currently blocked by HPLT-847 merge. Titan project target: January 31. (2) Bulk operations — cited as top pain point in user research. Affects all accounts. (3) Audit log noise reduction — users report too many low-value audit events. (4) Data export performance — HPLT-892 fixed the crash; next request is performance at scale. Priority: SSO unblocks the most enterprise deals."

### Pass/Fail Checklist
- [ ] SSO identified from real ticket (HPLT-815)
- [ ] Evidence from user research cited
- [ ] Bulk operations mentioned (from meeting transcripts)
- [ ] No invented feature requests

---

## Scenario PROD-03: Roadmap Conflict Resolution

**Goal:** Resolve a conflict between Atlas GA timeline and Titan (SSO) delivery.

**Question:** "Engineering says we can't do both Atlas and Titan in Q1. Which do we pick?"

### Expected FLOW Reasoning
1. Pull proj-atlas → 42% complete, Q1 GA, 8-person team, David Park lead
2. Pull proj-titan (or equivalent) → SSO project, HPLT-815, dependency on auth fix
3. Pull customers.json → which customers are blocked by no SSO vs. no Atlas
4. Pull exec reports → ARR impact of each choice
5. Synthesize: tradeoff analysis with revenue evidence

### Evidence Sources
- `projects.json` → proj-atlas (March 31 GA, 8-person team), SSO project
- `jira_issues.json` → HPLT-815 (SSO, enterprise requirement)
- `customers.json` → enterprise accounts, deal blockers
- `executive_reports.json` → ARR by tier, enterprise ACV

### Expected Recommendation
> "Tradeoff analysis: Atlas GA: unlocks unlimited scalability and enterprise tier differentiation. Long-term ARR foundation. Currently 42% — compressing timeline risks quality. Titan (SSO): unblocks 3 specific enterprise deals now. Blocking revenue in the near term. Recommendation: continue Atlas at current pace (March 31). Ship Titan SSO as a standalone service by January 31 — it does not require Atlas completion. These are not mutually exclusive if team allocation is managed carefully. David Park's capacity is the constraint — verify he has Atlas focus."

### Pass/Fail Checklist
- [ ] Atlas completion (42%) cited
- [ ] SSO deal-blocking evidence cited
- [ ] Atlas and Titan correctly identified as potentially compatible
- [ ] David Park capacity identified as constraint
- [ ] No invented roadmap tradeoffs

---

## Scenario PROD-04: Sprint Planning Input

**Goal:** Provide product input for Sprint 9 capacity planning.

**Question:** "What should Sprint 9 focus on from a product perspective?"

### Expected FLOW Reasoning
1. Pull proj-release-3-2 → remaining gate blockers
2. Pull proj-atlas → current milestone (auth module extraction)
3. Pull jira_issues → carryover stories from Sprint 8
4. Pull slack-eng-velocity → capacity constraints (15% buffer, David off on-call)
5. Surface: Sprint 9 is a stabilization sprint — no new features

### Evidence Sources
- `projects.json` → proj-release-3-2 (blockers), proj-atlas (42%)
- `jira_issues.json` → HPLT-847, HPLT-892, HGRD-234 (carryover)
- `slack_threads.json` → slack-eng-velocity (sprint capacity discussion)

### Expected Recommendation
> "Sprint 9 product priorities: (1) NO new features — Sprint 9 is a stabilization sprint. Engineering capacity is allocated to: Release 3.2 gate blockers (HPLT-847, HGRD-234) and QA regression completion. (2) Atlas auth module extraction continues (David Park, 8 engineers). (3) 15% sprint buffer for unexpected stabilization. Product should hold all new requests until Sprint 10. Exception: if HPLT-815 (SSO) can be staffed from a non-Release 3.2 engineer, greenlight it."

### Pass/Fail Checklist
- [ ] No new features recommendation is correct
- [ ] 15% buffer referenced
- [ ] Atlas as ongoing work mentioned
- [ ] Exception path for SSO is sensible

---

## Scenario PROD-05: Decision Tracking

**Goal:** Identify what product decisions were made in the last week that need to be documented.

**Question:** "What product decisions were made last week? Are they documented?"

### Expected FLOW Reasoning
1. Pull meeting_transcripts.json → decisions from sprint review, executive meetings
2. Pull slack-exec-update-dec13 → weekly update with decisions
3. Pull slack-release-32-delay → announcement (decision: delay Release 3.2)
4. Pull documents → check if decisions are in Notion/decision log
5. Identify undocumented decisions that need archiving

### Evidence Sources
- `meeting_transcripts.json` → decisions arrays in sprint review, executive transcripts
- `slack_threads.json` → slack-exec-update-dec13 (Release 3.2 delay announcement)
- `documents.json` → existing decision documents

### Expected Recommendation
> "Product decisions made Dec 8-14: (1) Release 3.2 delayed Dec 15 → Dec 29 (Sarah Chen, Dec 12). (2) David Park pulled off on-call (Sarah Chen, Dec 12 sprint review). (3) 2 SRE hires approved (Q1 2026 start). (4) Acme Corp offered 15% credit + Kronos beta. (5) Sprint 9: no new features, stabilization focus. Documented status: decisions #1 and #4 have customer-facing communications (email + Slack). Decisions #2, 3, 5 are in Slack threads but not in the decision log. Recommend: create Notion entries for undocumented decisions."

### Expected ActionCard
```json
{
  "type": "document",
  "title": "Document Sprint 9 product decisions in Notion",
  "connector": "notion",
  "action": "NOTION_CREATE_PAGE",
  "payload": {
    "title": "Decision Log — Week of Dec 8, 2025",
    "content": "Auto-populated from Slack + meeting transcript decisions"
  }
}
```

### Pass/Fail Checklist
- [ ] 4+ decisions identified from actual evidence
- [ ] Documentation gap surfaced
- [ ] Notion connector used
- [ ] No invented decisions

---

## Scenario PROD-06: Atlas Milestone Review

**Goal:** Assess Project Atlas progress and identify any blocking risks.

**Question:** "Is Project Atlas on track for Q1 2026 GA? What's at risk?"

### Expected FLOW Reasoning
1. Pull proj-atlas → 42% complete, auth module blocker, March 31 target
2. Pull HPLT-756 (Atlas auth refactor) → blocked on PR #847
3. Pull HPLT-847 (PR #847) → 6 days open
4. Pull david-park resource → team lead overloaded
5. Calculate: if PR #847 merges Dec 15, HPLT-756 can proceed; auth milestone = Jan 2026

### Evidence Sources
- `projects.json` → proj-atlas (42%, milestones, blockingIssues)
- `jira_issues.json` → HPLT-756 (Atlas auth refactor, blocked on PR #847)
- `pull_requests.json` → pr-847 (open 6 days)
- `employees.json` → emp-013 (David Park, Atlas tech lead)

### Expected Recommendation
> "Atlas risk assessment: (1) Auth module milestone is blocked by PR #847 — if PR merges Dec 15, HPLT-756 can resume. (2) At 42% completion with March 31 target, we need ~58% more work in 15 weeks = 3.9% per week. Current rate estimate suggests we're on the edge. (3) David Park is the Atlas tech lead AND is currently overloaded. His capacity returning after Dec 15 (off on-call) is critical. Risk: if PR #847 takes 2+ more weeks, Atlas auth milestone slips to February and March 31 GA becomes tight."

### Pass/Fail Checklist
- [ ] 42% completion cited
- [ ] HPLT-756 blocked by PR #847 chain identified
- [ ] David Park resource risk noted
- [ ] March 31 target feasibility assessed
- [ ] No invented milestone data

---

## Scenario PROD-07: Customer Pain Point Synthesis

**Goal:** Synthesize the most common customer pain points from support, Slack, and emails.

**Question:** "What are customers most frustrated about right now?"

### Expected FLOW Reasoning
1. Pull jira_issues → open P1/P2 tickets with customer links
2. Pull emails → customer escalation content
3. Pull slack-acme-escalation → enterprise pain points
4. Pull meeting_transcripts → user research findings
5. Synthesize: rank frustrations by customer count and ARR impact

### Evidence Sources
- `jira_issues.json` → HPLT-847, HPLT-892 (open P1 tickets with customer impact)
- `emails.json` → thread-acme-escalation-dec11 (Acme Corp frustrations)
- `customers.json` → notes on at-risk customers
- `meeting_transcripts.json` → user research findings transcript

### Expected Recommendation
> "Top customer frustrations (December 2025): (1) Auth timeouts at login spike (HPLT-847) — affects enterprise accounts with large concurrent user bases. Acme Corp reports failures at 9 AM every day. (2) Data export failing for large datasets (HPLT-892) — fix deployed Dec 15, but 8 days of failures damaged trust. (3) SSO not available (HPLT-815) — enterprise accounts cite this as blocking broader rollout. (4) Dashboard load time at scale — Kronos should address in 3.2. Priority: SSO is the most frequently mentioned future blocker."

### Pass/Fail Checklist
- [ ] Auth timeout and data export cited with ticket IDs
- [ ] Acme Corp specifically mentioned with context
- [ ] SSO (HPLT-815) surfaced as forward-looking pain
- [ ] No invented customer frustrations

---

## Scenario PROD-08: Competitive Feature Gap Analysis

**Goal:** Identify product capabilities Helios lacks that competitors offer.

**Question:** "Where are we weakest compared to competitors based on what customers are asking for?"

### Expected FLOW Reasoning
1. Pull jira_issues → feature requests, especially with competitive labels
2. Pull customer notes → mentions of competitor capabilities
3. Pull meeting transcripts → user research competitive mentions
4. Pull documents → any competitive analysis documents
5. Acknowledge: limited competitive data without CRM connector enriched with competitive intel

### Evidence Sources
- `jira_issues.json` → feature request tickets mentioning competitive context
- `customers.json` → notes mentioning competitor usage
- `meeting_transcripts.json` → competitive mentions in product reviews

### Expected Recommendation
> "Competitive gaps (from customer evidence): (1) SSO/SAML — customers mention existing tools support SSO. Helios does not yet. HPLT-815 addresses this in Q1. (2) Bulk workflow operations — power users compare Helios unfavorably to automation platforms. (3) GraphQL API — developer customers mention REST-only as limiting for complex integrations. For deeper competitive intelligence, connect HubSpot CRM to pull deal lost reasons and competitor mentions."

### Expected ActionCard
```json
{
  "type": "connector_auth",
  "title": "Connect HubSpot for competitive deal intelligence",
  "connector": "hubspot",
  "action": "AUTH_INITIATE",
  "note": "Unlock deal loss reasons, competitor mentions in CRM notes"
}
```

### Pass/Fail Checklist
- [ ] SSO gap cited from real evidence (HPLT-815)
- [ ] FLOW acknowledges limited competitive data
- [ ] Does not invent competitor names or capabilities
- [ ] HubSpot connector surfaced as the right next step

---
