# HR Scenarios
# Helios Software Inc. — Operational Validation Suite

Role: HR Business Partner, Head of People
FLOW Access Level: ADMIN
Connectors: Workday, Slack, Calendar, Jira (read), Gmail

---

## Scenario HR-01: Hiring Pipeline Status — SRE Roles

**Goal:** Track the status of the approved SRE headcount and ensure the hiring pipeline is moving.

**Question:** "Two SRE positions were approved. Where are we in the hiring process?"

### Expected FLOW Reasoning
1. Pull emails → slack-sre-hiring-approval (Sarah approved, Elena Torres posting JDs)
2. Pull employees → current SRE team (emp-317, emp-318, emp-319 = Elena Torres + 2)
3. Pull documents → SRE job description (if posted)
4. Pull Workday → headcount approval record
5. Surface: JDs were to be posted Friday Dec 12 — check if posted

### Evidence Sources
- `slack_threads.json` → slack-eng-velocity (Sarah approved 2 SRE hires)
- `emails.json` → thread-sre-hiring-approval (Sarah approves, Elena accepts)
- `employees.json` → current SRE count (emp-317, emp-318, emp-319)

### Expected Recommendation
> "SRE hiring pipeline: (1) Verbal approval: Sarah Chen approved 2 SRE hires in the December 12 sprint review. (2) Elena Torres (Site Reliability Lead, emp-317) agreed to write JDs by Friday December 12. (3) CEO/Workday approval: formal headcount approval submitted. (4) Status check needed: verify JDs were posted on schedule. Next steps: if JDs are not yet posted, follow up with Elena Torres. Target start: Q1 2026."

### Expected ActionCard
```json
{
  "type": "workday_check",
  "title": "Verify SRE headcount in Workday",
  "connector": "workday",
  "action": "WORKDAY_GET_HEADCOUNT",
  "payload": {
    "department": "dept-devops",
    "status": "approved"
  }
}
```

### Pass/Fail Checklist
- [ ] 2 SRE positions cited
- [ ] Elena Torres' role in JDs identified
- [ ] Approval chain cited (Sarah → CEO → Workday)
- [ ] Q1 2026 start target mentioned
- [ ] Workday connector used

---

## Scenario HR-02: Burnout Signal Detection

**Goal:** Identify engineers showing signs of burnout before it causes turnover or performance issues.

**Question:** "Are any engineers showing signs of burnout that I should be aware of?"

### Expected FLOW Reasoning
1. Pull employees → find engineers with onCall: true, especially consecutive weeks
2. Pull incidents → engineers responding to multiple incidents (David Park in INC-076 AND INC-042)
3. Pull pull_requests → engineers with large PR queues (David Park: 7)
4. Pull meeting_transcripts → velocity discussion, workload mentions
5. Surface: David Park shows multiple burnout signals simultaneously

### Evidence Sources
- `employees.json` → emp-013 (onCall: true, 3 consecutive weeks)
- `incidents.json` → inc-076, inc-042 (both list David Park as responder)
- `pull_requests.json` → pr-847 (David Park author), high PR queue
- `slack_threads.json` → slack-eng-velocity (workload mentioned explicitly)

### Expected Recommendation
> "Burnout risk signals: David Park (emp-013, Staff Engineer) is the highest-risk engineer. Evidence: (1) On-call 3 consecutive weeks (typically rotates weekly). (2) Primary responder for INC-076 (Dec 14, 2:47 AM) and INC-042 (Dec 10). (3) 7 PRs awaiting his review. (4) Atlas tech lead (high cognitive load). (5) Author of emergency PR #894 at 3 AM. The sprint review explicitly discussed his overload. Action taken: Sarah Chen moved him off on-call. Recommend: HR checks in with David after the Dec 14 incident. No other engineers show comparable multi-signal burnout risk."

### Expected ActionCard
```json
{
  "type": "calendar_event",
  "title": "Schedule 1:1 check-in with David Park",
  "connector": "calendar",
  "action": "CALENDAR_CREATE_EVENT",
  "payload": {
    "title": "1:1 Check-in — David Park",
    "attendees": ["emp-013", "emp-009"],
    "purpose": "Burnout check-in following INC-076 and sustained overload",
    "timing": "this week"
  }
}
```

### Pass/Fail Checklist
- [ ] David Park named with specific burnout signals (not generic)
- [ ] At least 4 evidence points cited
- [ ] Blameless framing (structural, not performance issue)
- [ ] Calendar connector used for 1:1

---

## Scenario HR-03: Leave Conflicts During Release

**Goal:** Ensure no critical engineers have leave scheduled during the Release 3.2 deployment window.

**Question:** "Does anyone critical to the Release 3.2 deployment have leave scheduled around December 29?"

### Expected FLOW Reasoning
1. Pull employees → identify critical release roles (David Park, Priya Nair, Elena Torres, QA Lead)
2. Pull calendar_events → check for PTO/leave events for critical engineers around Dec 27-31
3. Pull proj-release-3-2 → deployment date Dec 29, roles needed
4. Surface: any leave conflicts; recommend coverage plans

### Evidence Sources
- `employees.json` → critical engineers for Release 3.2 (emp-013, emp-014, emp-317, emp-295)
- `calendar_events.json` → filter PTO/leave events, Dec 27-31 window
- `projects.json` → proj-release-3-2 (team list)

### Expected Recommendation
> "Release 3.2 deployment leave check (Dec 27-31): Pulling calendar events for critical engineers — David Park, Priya Nair, Elena Torres, QA Lead. [Based on calendar data: flag any PTO found in this window]. Recommended coverage minimum for Dec 29 deployment: (1) One SRE on-call (Priya or Elena). (2) David Park available for auth deployment support. (3) QA sign-off before deploy. If any of these engineers have PTO, ensure a trained backup is identified by Dec 22."

### Expected ActionCard
```json
{
  "type": "calendar_search",
  "title": "Check critical engineer availability Dec 27-31",
  "connector": "calendar",
  "action": "CALENDAR_LIST_EVENTS",
  "payload": {
    "attendeeIds": ["emp-013", "emp-014", "emp-317", "emp-295"],
    "dateRange": { "start": "2025-12-27", "end": "2025-12-31" },
    "eventTypes": ["time-off", "out-of-office"]
  }
}
```

### Pass/Fail Checklist
- [ ] Critical engineers correctly identified (not arbitrary)
- [ ] Calendar connector used
- [ ] Dec 29 deployment date cited
- [ ] Minimum coverage plan defined

---

## Scenario HR-04: Performance Review Schedule

**Goal:** Ensure the December performance review cycle is on track.

**Question:** "Are December performance reviews on schedule? Any risks?"

### Expected FLOW Reasoning
1. Pull calendar_events → filter for "performance review" events in December
2. Pull employees → count by department
3. Check: are reviews scheduled for all 450 employees before year-end?
4. Flag: busy December (INC-076, Release 3.2 delay) may conflict with review deadlines
5. Recommend: extend deadline for engineering if needed

### Evidence Sources
- `calendar_events.json` → performance review events in December
- `employees.json` → 450 employees across 12 departments
- `incidents.json` → inc-076 (engineering team pulled into incident response Dec 14)

### Expected Recommendation
> "Performance review risk: Engineering team is particularly stretched in December — INC-076 response (Dec 14), Release 3.2 pressure (Dec 29 target). Engineering managers may not have capacity for thorough reviews during this window. Recommendation: extend engineering performance review deadline from December 31 to January 15. Other departments: pull calendar data to verify reviews are scheduled. 450 employees × 30 min average = 225 hours of manager time needed."

### Expected ActionCard
```json
{
  "type": "slack_message",
  "title": "Notify engineering managers of review extension",
  "connector": "slack",
  "action": "SLACK_SEND_MESSAGE",
  "payload": {
    "channel": "#engineering-leads",
    "text": "Performance review deadline extension for engineering: extended to January 15 due to December release and incident workload. Prioritize INC-076 post-mortem and Release 3.2 deployment first."
  }
}
```

### Pass/Fail Checklist
- [ ] Engineering overload (INC-076 + release) cited as risk
- [ ] Employee count used in reasoning (450)
- [ ] Extension recommendation is specific (Jan 15)
- [ ] Slack used for internal notification

---

## Scenario HR-05: Onboarding Status

**Goal:** Check the onboarding status of recently hired engineers.

**Question:** "We hired 5 engineers in November. Where are they in onboarding?"

### Expected FLOW Reasoning
1. Pull employees → find employees with hire dates in November 2025
2. Pull documents → doc-onboarding-eng (week 1 checklist)
3. Pull calendar_events → filter for onboarding meetings
4. Cross-reference: are November hires assigned to Atlas or other active projects yet?

### Evidence Sources
- `employees.json` → employees with recent hire dates
- `documents.json` → doc-onboarding-eng (onboarding process)
- `calendar_events.json` → onboarding meeting events

### Expected Recommendation
> "November engineering hires: checking employee records for November hire dates. [Based on employee data: list newly hired engineers]. Per the engineering onboarding guide: week 1 = environment setup and team introductions; weeks 2-4 = first PR and oncall shadowing; 90 days before joining on-call rotation. Given the current December workload (INC-076, Release 3.2), recommend delaying new hire assignment to release-critical work until January. Assign them to Atlas non-critical tracks instead."

### Pass/Fail Checklist
- [ ] doc-onboarding-eng cited
- [ ] 90-day on-call rule mentioned
- [ ] December workload considered in recommendation
- [ ] No invented employee names

---

## Scenario HR-06: Org Chart Gaps

**Goal:** Identify open critical roles that need to be filled urgently.

**Question:** "What are our most critical open headcount gaps right now?"

### Expected FLOW Reasoning
1. Pull employees → count by department vs. target headcount
2. Cross-reference: incidents driven by understaffing (SRE team overloaded)
3. Pull exec_reports → headcount plan vs. actuals
4. Surface: SRE gap (approved), any other gaps from incident/project evidence

### Evidence Sources
- `employees.json` → department headcounts
- `incidents.json` → SRE overload signals
- `executive_reports.json` → headcount plans

### Expected Recommendation
> "Critical headcount gaps: (1) SRE (2 positions) — already approved, JDs being posted. Root cause of on-call overload and INC-076 response strain. (2) QA team — Release 3.2 regression suite had 2 critical failures; QA capacity is stretched with 450 employees to support. Check QA team size vs. team charter. (3) Atlas needs 1-2 additional engineers for the auth module — David Park is the single point of expertise. (4) Customer Success — Pinnacle Logistics renewal ($178K) has no assigned CSM."

### Pass/Fail Checklist
- [ ] SRE gap cited with evidence
- [ ] QA gap identified from Release 3.2 context
- [ ] CS gap (Pinnacle) surfaced from customer data
- [ ] No invented headcount needs

---

## Scenario HR-07: Team Morale Assessment

**Goal:** Assess the current morale of the engineering team after a difficult December.

**Question:** "How is engineering team morale after INC-076 and the release delay?"

### Expected FLOW Reasoning
1. Pull slack-oncall-handoff-dec14 → tone and sentiment of messages
2. Pull slack-eng-velocity → team discussion about sprint velocity
3. Pull meeting_transcripts → sprint retrospective tone
4. Pull incident response → fast resolution (47 min) = team performed well
5. Synthesize: team is under stress but executed well; needs acknowledgment

### Evidence Sources
- `slack_threads.json` → slack-oncall-handoff-dec14 (Priya's handoff), slack-eng-velocity
- `meeting_transcripts.json` → sprint retrospective (62% velocity, constructive tone)
- `incidents.json` → inc-076 (strong MTTR = team capability)

### Expected Recommendation
> "Team morale signals: (1) INC-076 response at 3 AM: Priya and David resolved a P1 in 47 minutes with a code fix and deployment — this is excellent execution. Morale is likely STRONG around incident response capability. (2) Sprint velocity at 62% is frustrating the team — the retrospective identified structural causes (on-call, PR queue) and made decisions. This shows a psychologically safe team that can discuss problems. (3) Risk: David Park has not had recovery time after the Dec 14 incident. Recommend: manager acknowledgment this week + 1-2 days buffer time for key responders."

### Pass/Fail Checklist
- [ ] INC-076 response cited as morale positive
- [ ] 62% velocity as morale concern
- [ ] Blameless, constructive framing
- [ ] Specific recovery recommendation (not generic "be supportive")

---

## Scenario HR-08: Compensation Review — Market Alignment

**Goal:** Identify if any engineering roles are at compensation risk given the market.

**Question:** "Are we at risk of losing key engineers to market competition?"

### Expected FLOW Reasoning
1. Pull employees → identify critical skill holders (David Park: auth/distributed systems)
2. Cross-reference: SPOF risk — David Park is single expert on auth service
3. Surface: retention risk is highest for engineers with rare skills and high current load
4. Recommend: compensation review for critical engineers + knowledge transfer plan

### Evidence Sources
- `employees.json` → emp-013 (David Park, skills: go, auth-service, distributed-systems)
- `incidents.json` → David Park as key responder to multiple incidents
- `projects.json` → Atlas tech lead = high institutional knowledge

### Expected Recommendation
> "Retention risk: David Park (emp-013) is the highest institutional knowledge risk. He is the primary author of the auth service fix, Atlas tech lead, and primary on-call responder. If he leaves, three critical areas are affected: auth service reliability, Atlas delivery, and PR review throughput. Recommend: (1) Compensation check vs. Go/distributed systems market rates (2026 bands). (2) Knowledge transfer: pair at least one engineer to shadow David on auth service. (3) Reduce burnout risk (already in motion with on-call reassignment). Note: FLOW cannot access salary data — connect Workday compensation module for specific bands."

### Pass/Fail Checklist
- [ ] David Park identified as highest retention risk with evidence
- [ ] Three impact areas of his departure enumerated
- [ ] Knowledge transfer recommended (not just salary)
- [ ] FLOW acknowledges salary data requires Workday

---
