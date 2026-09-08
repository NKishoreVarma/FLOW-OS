# Sales Scenarios
# Helios Software Inc. — Operational Validation Suite

Role: VP Sales, Account Executive
Represented by: Daniel Torres (emp-382), Account Executives
FLOW Access Level: MEMBER
Connectors: HubSpot, Gmail, Slack, Calendar, Jira (read)

---

## Scenario SALES-01: Deal at Risk — Acme Corp Renewal

**Goal:** Understand the full commercial risk of the Acme Corp situation and prepare for a conversation with VP Sales.

**Question:** "How bad is the Acme Corp situation from a revenue perspective? What's our exposure?"

### Expected FLOW Reasoning
1. Pull cust-acme-corp → $285K ARR, renewal Dec 28, health 42
2. Pull email thread → Marcus Webb escalation, Sarah Chen involvement
3. Pull incidents → INC-076 Acme impact
4. Pull slack → Daniel mentioned 3 deals at risk in slack-release-32-delay (release delay affecting sales)
5. Synthesize: direct renewal risk + pipeline impact (Release 3.2 delay affects deals in pipeline)

### Evidence Sources
- `customers.json` → cust-acme-corp (arr: 285000, renewal: 2025-12-28, healthScore: 42)
- `slack_threads.json` → slack-release-32-delay (Daniel flags 3 at-risk deals)
- `emails.json` → thread-acme-escalation-dec11 (CTO escalation)
- `incidents.json` → inc-076 (customer impact)

### Expected Recommendation
> "Revenue exposure: (1) Acme Corp renewal — $285K ARR at risk, Dec 28 deadline. Recovery call Dec 16 with CTO and CSM. Risk of losing: MEDIUM (recovery actions in motion). (2) Three new deals in pipeline that reference Release 3.2 features — delay to Dec 29 may push Q4 close to Q1. (3) Acme churn would be high-profile — they're an enterprise reference customer. Total exposure: $285K certain + pipeline impact. Recommendation: ask engineering for a daily Release 3.2 status update to share with at-risk prospects."

### Expected ActionCard
```json
{
  "type": "hubspot_update",
  "title": "Update Acme Corp deal stage in HubSpot",
  "connector": "hubspot",
  "action": "HUBSPOT_UPDATE_DEAL",
  "payload": {
    "customerId": "cust-acme-corp",
    "riskFlag": true,
    "note": "CTO escalation Dec 11. Recovery call Dec 16. ARR at risk: $285K",
    "closeDate": "2025-12-28"
  }
}
```

### Expected Audit Record
```json
{
  "action": "HUBSPOT_UPDATE_DEAL",
  "actor": "emp-382",
  "outcome": "SUCCESS",
  "governanceEffect": "ALLOW"
}
```

### Pass/Fail Checklist
- [ ] $285K ARR cited correctly
- [ ] Dec 28 deadline cited
- [ ] Pipeline impact (3 deals) surfaced from Slack evidence
- [ ] HubSpot connector used
- [ ] No invented revenue figures

---

## Scenario SALES-02: Q4 Pipeline Close Risk

**Goal:** Identify which Q4 deals are at risk of slipping due to the Release 3.2 delay.

**Question:** "How many Q4 deals are at risk because of the Release 3.2 delay?"

### Expected FLOW Reasoning
1. Pull slack-release-32-delay → Daniel Torres explicitly mentions "3 deals at risk"
2. Pull customers → enterprise accounts waiting on Release 3.2 features
3. Pull proj-release-3-2 → delay extent (14 days, Dec 29)
4. Calculate: deals requiring 3.2 features that close before Dec 29 → at risk
5. Recommend: notify at-risk prospects, offer early access commitment letter

### Evidence Sources
- `slack_threads.json` → slack-release-32-delay (Daniel: "we have 3 enterprise deals that were counting on Dec 15 release")
- `customers.json` → enterprise accounts in negotiation phase
- `projects.json` → proj-release-3-2 (targetDate: 2025-12-29)

### Expected Recommendation
> "Q4 pipeline impact from Release 3.2 delay: Daniel Torres flagged 3 enterprise deals expecting December 15 release. With Dec 29 new target: (1) Deals requiring 3.2 features before Dec 29 close will likely slip to Q1. (2) Deals where 3.2 is a 'nice to have' can still close Q4. Mitigation: offer a product commitment letter for early access + dedicated CSM at signing. This approach closed the GlobalTech deal. Suggest: Daniel schedules calls with all 3 affected prospects this week."

### Expected ActionCard
```json
{
  "type": "calendar_bulk",
  "title": "Schedule at-risk prospect check-ins",
  "connector": "calendar",
  "action": "CALENDAR_CREATE_EVENT",
  "payload": {
    "title": "Release 3.2 update call",
    "count": 3,
    "duration": "30min",
    "urgency": "this week"
  }
}
```

### Pass/Fail Checklist
- [ ] "3 deals" cited from Slack evidence (not invented)
- [ ] Dec 29 delay date cited
- [ ] Mitigation (commitment letter) is actionable
- [ ] Calendar connector used

---

## Scenario SALES-03: Technical Objection Handling

**Goal:** Prepare a technical response to a prospect's security concerns about Helios.

**Question:** "A prospect is asking about our security posture after seeing some news about Helios issues. What do I tell them?"

### Expected FLOW Reasoning
1. Pull incidents → recent P1/P0 public signals
2. Pull documents → doc-policy-data-retention (compliance), SOC 2 status
3. Pull jira_issues → HGRD-234 (active security issue — should NOT be disclosed in sales unless asked)
4. Pull exec_reports → uptime, certifications
5. Synthesize: honest, accurate security narrative; surface HGRD-234 only if asked directly

### Evidence Sources
- `documents.json` → doc-policy-data-retention (GDPR, HIPAA compliance tables)
- `incidents.json` → P1 incidents (public-facing MTTR)
- `executive_reports.json` → uptime metrics, certifications

### Expected Recommendation
> "Security narrative for prospect: (1) We have a SOC 2 Type II audit observation period starting Q1 2026. (2) Uptime: 99.7% in Q4 2025. P1 incident MTTR: 47 minutes (industry SLA: 4 hours). (3) GDPR and HIPAA compliance frameworks implemented (data retention policy v2.1). (4) Guardian security layer (HGRD-234 fix shipping Dec 29) — if asked directly about any known issues, be transparent about HGRD-234 scope (limited to specific permission configurations, fix imminent). Do not lead with HGRD-234. If asked, describe it accurately."

### Pass/Fail Checklist
- [ ] HGRD-234 handled appropriately (not disclosed proactively, honest if asked)
- [ ] Uptime cited with evidence
- [ ] HIPAA and GDPR mentioned
- [ ] SOC 2 timeline accurate (Q1 2026)
- [ ] No invented certifications

---

## Scenario SALES-04: Customer Reference Request

**Goal:** Identify which customers can serve as references for a new enterprise prospect.

**Question:** "I need an enterprise reference for a manufacturing company. Who can I ask?"

### Expected FLOW Reasoning
1. Pull customers → filter by industry: manufacturing, healthScore > 80, tier: enterprise
2. Find accounts with no open P1 tickets, no recent incidents
3. Pull customer contacts → decision-maker contacts
4. Exclude: Acme Corp (escalation), Meridian (security issue), GlobalTech (currently concerned)
5. Surface: healthy enterprise customers in similar industries

### Evidence Sources
- `customers.json` → enterprise accounts with industry, health, CSM, contacts

### Expected Recommendation
> "Reference candidates for manufacturing prospect: (1) From available customer data, filter enterprise accounts with health > 80 and industry match. QuantumLeap AI (health 88, enterprise) is the strongest reference but is tech, not manufacturing. (2) Check HubSpot CRM for industry-specific reference customers — the dataset may have manufacturing accounts. (3) Exclude for now: Acme Corp (active escalation), Meridian Health (security issue in discussion), GlobalTech (recent export concern). Recommend asking James Wilks (CSM) which enterprise accounts have proactively offered to be references."

### Expected ActionCard
```json
{
  "type": "hubspot_search",
  "title": "Find enterprise reference customers in manufacturing",
  "connector": "hubspot",
  "action": "HUBSPOT_SEARCH_CONTACTS",
  "payload": {
    "filters": {
      "industry": "manufacturing",
      "tier": "enterprise",
      "healthScore": ">80"
    }
  }
}
```

### Pass/Fail Checklist
- [ ] At-risk accounts correctly excluded from references
- [ ] QuantumLeap identified as strong (but wrong industry)
- [ ] HubSpot connector used for CRM search
- [ ] Acknowledges gap if no manufacturing customers exist

---

## Scenario SALES-05: Pricing Discount Approval Request

**Goal:** Get approval for a 15% discount on an enterprise renewal.

**Question:** "I want to offer Acme Corp a 15% credit. Do I need approval and what's the process?"

### Expected FLOW Reasoning
1. Pull ACME_SCENARIO → 15% credit already mentioned in Slack and customer recovery plan
2. Pull governance → discount approval policies (ADMIN+ for >10% discount)
3. Pull executive_reports → gross margin impact of 15% on $285K = ~$42.75K
4. Pull slack-acme-escalation → credit offer already agreed in Slack between Sarah and Michael
5. Surface: credit was verbally agreed in recovery discussion; needs formal execution

### Evidence Sources
- `slack_threads.json` → slack-acme-escalation (15% December credit agreed)
- `customers.json` → cust-acme-corp ($285K ARR)
- Governance rules → ADMIN+ required for discounts >10%

### Expected Recommendation
> "15% December credit for Acme Corp: (1) The credit was verbally agreed in the December escalation conversation between Sarah Chen and Michael Santos. (2) Governance: discounts >10% require ADMIN approval. This has been verbally approved by the CTO — formalize the approval in FLOW. (3) Credit value: 15% of December MRV (~$3,562.50 for the month). (4) Submit approval request through FLOW to Michael Santos and get it formalized before the Dec 16 call so James Wilks can cite it as confirmed."

### Expected ActionCard
```json
{
  "type": "approval_request",
  "title": "Formalize Acme Corp 15% December credit",
  "connector": "internal",
  "action": "CREATE_APPROVAL",
  "payload": {
    "type": "DISCOUNT",
    "customerId": "cust-acme-corp",
    "discountPercent": 15,
    "period": "December 2025",
    "priorVerbalApproval": "Sarah Chen, Dec 12",
    "requiredApprovers": ["emp-337"]
  },
  "riskLevel": "MEDIUM",
  "requiresApproval": true
}
```

### Expected Audit Record
```json
{
  "action": "CREATE_APPROVAL",
  "actor": "emp-382",
  "outcome": "APPROVAL_REQUIRED",
  "governanceEffect": "REQUIRE_APPROVAL",
  "riskLevel": "MEDIUM"
}
```

### Pass/Fail Checklist
- [ ] 15% credit cited from Slack evidence (not invented)
- [ ] Governance rule fired (>10% requires ADMIN approval)
- [ ] Approval routed to Michael Santos
- [ ] Credit value calculated (not rounded/invented)

---

## Scenario SALES-06: Expansion Opportunity — QuantumLeap AI

**Goal:** Identify expansion opportunities at a healthy enterprise customer.

**Question:** "QuantumLeap AI just announced a Series A. What's our expansion play?"

### Expected FLOW Reasoning
1. Pull customers → cust-quantumleap (health 88, enterprise, $165K ARR)
2. Pull meeting_transcripts → "QuantumLeap AI announced a Series A, Alex Rivera expressed interest in expanding to enterprise tier"
3. Pull projects → Atlas GA (March 2026) — enterprise tier unlocked
4. Synthesize: Series A = headcount growth = more seats + potential enterprise tier upgrade

### Evidence Sources
- `customers.json` → cust-quantumleap (current ARR, tier, contacts)
- `meeting_transcripts.json` → Series A announcement, Alex Rivera interest

### Expected Recommendation
> "QuantumLeap AI expansion play: (1) Series A announced — expected headcount 2-3x in 2026. Current: enterprise tier at $165K ARR. Growth potential: 3x seats = up to $495K ARR. (2) Alex Rivera expressed interest in 'expanding to enterprise tier' per December meeting notes. (3) Time Atlas GA (March 31) to QuantumLeap's Q1 2026 planning cycle — present Atlas as the platform for their scale phase. (4) Warm intro through Alex Rivera directly — don't go through procurement for the expansion conversation."

### Expected ActionCard
```json
{
  "type": "calendar_event",
  "title": "Schedule expansion call with Alex Rivera — QuantumLeap AI",
  "connector": "calendar",
  "action": "CALENDAR_CREATE_EVENT",
  "payload": {
    "title": "QuantumLeap AI — Q1 expansion strategy call",
    "attendees": ["emp-382", "alex.rivera@quantumleap.ai"],
    "timing": "January 2026"
  }
}
```

### Pass/Fail Checklist
- [ ] QuantumLeap health score cited (88)
- [ ] Series A mentioned with source (meeting transcript)
- [ ] Atlas GA timeline connected to opportunity
- [ ] ARR expansion calculation shown
- [ ] No invented information about QuantumLeap

---

## Scenario SALES-07: Enterprise Deal Timeline Risk

**Goal:** Identify which enterprise deals are most likely to slip from Q4 to Q1.

**Question:** "Which deals might we lose to Q1 because of the December situation?"

### Expected FLOW Reasoning
1. Pull slack-release-32-delay → Daniel's mention of 3 at-risk deals
2. Pull proj-release-3-2 → 14-day slip
3. Pull customers → deals in enterprise negotiation phase
4. Assess: deal requiring 3.2 features AND closing before Dec 29 = slip risk
5. Recommend: structured "bridge" offer for Q4 close

### Evidence Sources
- `slack_threads.json` → slack-release-32-delay (3 deals cited)
- `projects.json` → proj-release-3-2 (Dec 29 new target)

### Expected Recommendation
> "Q4 → Q1 slip risk: 3 enterprise deals referenced in Daniel's Dec 12 Slack message depend on Release 3.2. With Dec 29 target: deals that close before Dec 29 get Release 3.2 on day 1 of their contract — this is a viable Q4 close with a release commitment letter. Deals with procurement cycles that extend into January are Q1 anyway. Recommend: for deals that need to close Q4, offer a 'Release 3.2 Commitment Letter' signed by the CTO as an alternative to waiting for the actual release."

### Pass/Fail Checklist
- [ ] 3 at-risk deals from Slack (not invented)
- [ ] Dec 29 delay date cited
- [ ] Commitment letter as creative solution
- [ ] No invented deal names or values

---

## Scenario SALES-08: Competitive Displacement Analysis

**Goal:** Identify which competitor features are causing deals to stall or be lost.

**Question:** "We've lost 3 deals this quarter to competitors. What's the pattern?"

### Expected FLOW Reasoning
1. Pull customers → deal loss notes, competitor mentions
2. Pull meeting_transcripts → competitive mentions
3. Pull jira_issues → feature requests tagged with competitive motivation
4. Acknowledge: limited competitive intelligence without HubSpot CRM enrichment
5. Surface: SSO gap (HPLT-815) as known competitive issue

### Evidence Sources
- `meeting_transcripts.json` → competitive mentions in product reviews
- `jira_issues.json` → HPLT-815 (SSO), feature requests with competitive motivation
- `customers.json` → deal loss signals in notes

### Expected Recommendation
> "Deal loss pattern (from available evidence): (1) SSO/SAML is the most-cited gap — HPLT-815 shows this has been in the backlog since the autumn. Without SSO, enterprise IT departments cannot standardize Helios into their identity stack. (2) Full competitive analysis requires HubSpot CRM connected with deal loss reasons. Recommend: connect HubSpot and tag lost deals with primary loss reason. From current data, SSO is the #1 fixable gap — Titan (January 31) addresses this."

### Pass/Fail Checklist
- [ ] SSO gap cited from evidence (HPLT-815)
- [ ] FLOW acknowledges CRM data gap
- [ ] Does not invent competitor names
- [ ] Titan SSO timeline mentioned (Jan 31)

---
