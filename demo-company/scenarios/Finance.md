# Finance Scenarios
# Helios Software Inc. — Operational Validation Suite

Role: CFO, Finance Business Partner
FLOW Access Level: ADMIN
Connectors: Gmail, Slack, Jira (read), Calendar, Notion

---

## Scenario FIN-01: Q4 ARR Forecast Accuracy

**Goal:** Assess whether Q4 ARR targets are achievable given current customer risk.

**Question:** "What's our Q4 ARR forecast? Are we going to hit the number?"

### Expected FLOW Reasoning
1. Pull executive_reports.json → ARR run rate, Q4 target, YoY growth (18%)
2. Pull customers.json → at-risk ARR: Acme ($285K, Dec 28), Pinnacle ($178K, Dec 31)
3. Pull Sales Slack → Daniel mentions 3 pipeline deals at risk from Release 3.2 delay
4. Calculate: base ARR ± at-risk renewals ± pipeline slippage
5. Synthesize: range forecast (base case, downside case)

### Evidence Sources
- `executive_reports.json` → Q4 ARR target, current run rate, YoY growth
- `customers.json` → cust-acme-corp ($285K), cust-pinnacle-logistics ($178K)
- `slack_threads.json` → slack-release-32-delay (3 pipeline deals at risk)

### Expected Recommendation
> "Q4 ARR forecast: Base case — ARR +18% YoY, on track if Acme Corp ($285K) and Pinnacle ($178K) renew. Downside case — if both churn: ~$463K ARR gap. Pipeline risk: 3 deals may slip to Q1 due to Release 3.2 delay. Quantifying pipeline risk requires CRM data (connect HubSpot for deal values). Confidence: HIGH on base case if Dec 16 Acme call goes well; MEDIUM on Pinnacle (no active recovery plan). Recommend: CEO/CTO joins Acme Dec 16 call, and Pinnacle gets an outreach call this week."

### Expected ActionCard
```json
{
  "type": "document",
  "title": "Q4 ARR Scenario Analysis",
  "connector": "notion",
  "action": "NOTION_CREATE_PAGE",
  "payload": {
    "title": "Q4 ARR Forecast — December 2025",
    "sections": [
      "Base Case (both renew)",
      "Downside Case (both churn)",
      "Pipeline Slip Impact",
      "Recovery Actions"
    ]
  }
}
```

### Expected Audit Record
```json
{
  "action": "NOTION_CREATE_PAGE",
  "actor": "finance-user",
  "outcome": "SUCCESS",
  "governanceEffect": "ALLOW"
}
```

### Pass/Fail Checklist
- [ ] $285K and $178K ARR cited correctly
- [ ] $463K combined at-risk calculated
- [ ] Pipeline risk from Slack cited (3 deals)
- [ ] HubSpot gap acknowledged for deal values
- [ ] Two scenarios presented (base + downside)
- [ ] No invented ARR numbers

---

## Scenario FIN-02: Customer Credit Approval — Acme Corp

**Goal:** Formally approve the 15% December credit offer for Acme Corp.

**Question:** "I need to approve a 15% December credit for Acme Corp. What's the financial impact?"

### Expected FLOW Reasoning
1. Pull cust-acme-corp → $285K ARR = ~$23,750 MRR
2. Calculate 15% credit: 15% × $23,750 = $3,562.50 for one month
3. Pull slack-acme-escalation → verbal agreement context
4. Pull governance → credits >10% require ADMIN approval (CFO sign-off)
5. Assess: $3,562 one-time vs. risk of losing $285K ARR — clear ROI

### Evidence Sources
- `customers.json` → cust-acme-corp (arr: 285000)
- `slack_threads.json` → slack-acme-escalation (15% credit agreed verbally)
- Governance policies → ADMIN approval for discounts >10%

### Expected Recommendation
> "Credit analysis: 15% of December MRR for Acme Corp = $3,562.50 one-time credit. Context: Acme's CTO escalated Dec 11 due to 2 P1 tickets + overnight incident. Renewal is Dec 28 ($285K ARR). ROI: if this credit secures the renewal, it returns 80x its cost. The credit was verbally agreed by Sarah Chen and Michael Santos on December 12. Recommend: approve. Financial impact is minimal relative to retention value."

### Expected ActionCard
```json
{
  "type": "approval_grant",
  "title": "Approve 15% December credit — Acme Corp",
  "connector": "internal",
  "action": "APPROVAL_RESOLVE",
  "payload": {
    "approvalId": "pending-acme-credit",
    "decision": "APPROVED",
    "approvedBy": "emp-cfr",
    "note": "Approved: $3,562.50 credit. ROI clear given $285K renewal at stake."
  }
}
```

### Expected Audit Record
```json
{
  "action": "APPROVAL_RESOLVE",
  "actor": "finance-user",
  "outcome": "SUCCESS",
  "governanceEffect": "ALLOW",
  "approvalDecision": "APPROVED"
}
```

### Pass/Fail Checklist
- [ ] Credit amount calculated correctly ($3,562.50)
- [ ] ROI framing (80x) presented
- [ ] Governance approval gate used
- [ ] Verbal agreement evidence cited
- [ ] Renewal value ($285K) cited as context

---

## Scenario FIN-03: Engineering Headcount Budget Impact

**Goal:** Calculate the budget impact of the approved SRE headcount additions.

**Question:** "Two SREs were approved. What's the budget impact for Q1?"

### Expected FLOW Reasoning
1. Pull slack → SRE hire announcement (2 FTEs, Q1 2026 start)
2. Pull employees → current SRE compensation range (emp-317, emp-318, emp-319)
3. Estimate: SRE market rate Q1 2026 (explicitly label as estimate)
4. Calculate: 2 FTEs × market rate × (3 months Q1) = Q1 headcount cost
5. Flag: benefits, equipment, onboarding overhead typically +20-25%

### Evidence Sources
- `slack_threads.json` → slack-eng-velocity (2 SRE hires approved)
- `employees.json` → SRE team (emp-317, 318, 319) for reference
- `executive_reports.json` → headcount cost data if available

### Expected Recommendation
> "SRE headcount budget impact (ESTIMATE): (1) Market rate for Senior SRE (San Francisco / remote): ~$170K–$200K base salary. (2) 2 FTEs × $185K midpoint × (3/12 Q1 prorated) = ~$92,500 Q1 cost. (3) Add 25% for benefits + equipment + onboarding = ~$115,600 total Q1 impact. (4) Full year: ~$460K. NOTE: These are market estimates — actual offers depend on candidate levels. Connect Workday to get approved comp band for the SRE roles. Recommend: reserve $120K in Q1 headcount budget as a buffer."

### Pass/Fail Checklist
- [ ] Salary figures clearly labeled as ESTIMATE
- [ ] Q1 prorating applied correctly
- [ ] 25% overhead factor mentioned
- [ ] Workday connector recommended for actual data
- [ ] No claimed exact salary from FLOW

---

## Scenario FIN-04: Infrastructure Cost Review

**Goal:** Understand current infrastructure costs and compare to ARR growth.

**Question:** "Are our infrastructure costs growing proportionally to our revenue?"

### Expected FLOW Reasoning
1. Pull executive_reports → ARR growth (18% YoY), infrastructure cost line
2. Pull incidents → INC-076 caused by scale issue (12,400 templates vs. 500 test) = capacity gap
3. Pull projects → Atlas GA will require infrastructure scaling
4. Acknowledge: specific cost data requires cloud billing connector
5. Recommend: connect AWS Cost Explorer; surface structural signals from available data

### Evidence Sources
- `executive_reports.json` → financial metrics
- `incidents.json` → inc-076 (scale = infrastructure sizing gap)
- `projects.json` → proj-atlas (will drive infrastructure scale requirements)

### Expected Recommendation
> "Infrastructure cost assessment: Available signals suggest costs may lag the growth: (1) INC-076 was caused by a capacity miscalibration — 500-template load test vs. 12,400-template reality. This suggests infrastructure was provisioned for a smaller customer profile than actual. (2) ARR +18% YoY implies customer scale growth. If infrastructure didn't scale proportionally, the next large customer onboarding could trigger similar incidents. (3) Atlas GA will require significant infrastructure expansion (Q1 2026). Budget now. (4) For precise numbers: connect AWS Cost Explorer or GCP Billing."

### Pass/Fail Checklist
- [ ] INC-076 cited as infrastructure sizing signal
- [ ] Atlas scaling requirement flagged
- [ ] FLOW honest about needing billing connector for precise data
- [ ] No invented cost figures

---

## Scenario FIN-05: Contract Renewal Revenue Recognition

**Goal:** Understand the revenue recognition timeline for December renewals.

**Question:** "When does Acme Corp's renewal revenue hit the books if they renew December 28?"

### Expected FLOW Reasoning
1. Pull cust-acme-corp → $285K ARR, renewal Dec 28, enterprise tier
2. Pull contract terms (if available) → annual vs. monthly billing
3. Apply revenue recognition rules → SaaS ARR recognition (monthly ratable)
4. Calculate: Dec 28 renewal = Dec MRR partial + Jan 2026 MRR full
5. Surface: for Q4 close, determine if renewal counts in Dec or starts Jan 1

### Evidence Sources
- `customers.json` → cust-acme-corp (arr: 285000, contractRenewalDate: 2025-12-28)
- Contract billing cycle data (if in CRM)

### Expected Recommendation
> "Revenue recognition for Acme Corp Dec 28 renewal: (1) $285K ARR = $23,750 MRR. (2) If renewed Dec 28 with annual billing: Q4 books the full contract value as a booking; revenue recognized monthly starting January. (3) December partial MRR: $23,750 × (3/31) = ~$2,298 for the remaining 3 days of December. (4) For Q4 bookings close: renewal signed Dec 28 counts in Q4. (5) For credit consideration: the 15% December credit reduces Dec recognized revenue by $3,562. Confirm billing terms with the signed contract. Note: precise recognition requires connecting the billing system."

### Pass/Fail Checklist
- [ ] MRR calculated correctly ($285K ÷ 12 = $23,750)
- [ ] Partial month correctly calculated (3/31 days)
- [ ] Q4 booking vs. revenue recognition distinction made
- [ ] Credit interaction noted
- [ ] Billing system connector recommended

---

## Scenario FIN-06: Revenue at Risk — December

**Goal:** Calculate the total revenue at risk in December.

**Question:** "How much revenue is at risk in December? Give me a number."

### Expected FLOW Reasoning
1. Pull customers → all December renewals, at-risk accounts
2. Pull pipeline slack → 3 deals at risk from Release 3.2 delay
3. Calculate: Acme ($285K) + Pinnacle ($178K) = $463K renewal ARR at risk
4. Add pipeline: 3 deals × unknown value = TBD (need HubSpot)
5. Total: minimum $463K, potentially higher with pipeline slip

### Evidence Sources
- `customers.json` → December renewal dates and ARR for at-risk accounts
- `slack_threads.json` → slack-release-32-delay (3 pipeline deals)

### Expected Recommendation
> "Revenue at risk in December: (1) Renewals at risk: Acme Corp ($285K, Dec 28) + Pinnacle Logistics ($178K, Dec 31) = $463K ARR. Both are at-risk health scores with renewal this month. (2) Pipeline slippage: 3 enterprise deals mentioned by Daniel Torres may slip to Q1 due to Release 3.2 delay. Deal values unknown without HubSpot connector. (3) Minimum at-risk: $463K. (4) Upside: if Acme renews (recovery call Dec 16), risk drops to $178K. Focus: Acme recovery is the highest-leverage action."

### Pass/Fail Checklist
- [ ] $463K calculated from real data
- [ ] Pipeline risk flagged but not invented
- [ ] Highest-leverage action identified (Acme recovery)
- [ ] HubSpot gap acknowledged

---

## Scenario FIN-07: Burn Rate Assessment

**Goal:** Assess whether the company's burn rate is sustainable given the current state.

**Question:** "Is our burn rate sustainable through Q1 2026?"

### Expected FLOW Reasoning
1. Pull executive_reports → revenue, headcount costs, infrastructure costs
2. Pull new headcount → 2 SREs approved, Q1 start
3. Pull projects → Atlas = 8-person team through March
4. Assess: ARR growth (+18%) vs. headcount growth vs. infrastructure
5. Acknowledge: burn rate calculation requires finance system connector

### Evidence Sources
- `executive_reports.json` → financial health metrics
- `employees.json` → current headcount (450)
- `slack_threads.json` → 2 SRE hires approved

### Expected Recommendation
> "Burn rate assessment: From available signals: (1) Revenue growing: ARR +18% YoY. (2) Headcount additions: 2 SREs (Q1 2026, ~$460K/year). (3) Atlas: 8 engineers on multi-quarter project — this is a large R&D investment. (4) If ARR growth exceeds headcount growth rate, burn is contracting. Precise burn rate requires P&L access — connect accounting system. From the investor-facing perspective: +18% ARR growth with a disciplined Q4 release (3.2 ships Dec 29) signals healthy unit economics."

### Pass/Fail Checklist
- [ ] 18% ARR growth cited
- [ ] SRE headcount cost quantified
- [ ] Atlas investment mentioned
- [ ] FLOW honest about needing accounting connector
- [ ] No invented burn rate figure

---

## Scenario FIN-08: Quarterly Close Checklist

**Goal:** Ensure all Q4 financial activities are completed before December 31.

**Question:** "What do I need to close before December 31? What might I miss?"

### Expected FLOW Reasoning
1. Pull calendar_events → scheduled Q4 close activities
2. Pull customers → December renewals (Acme Dec 28, Pinnacle Dec 31)
3. Pull slack → pending approvals (Acme credit, SRE headcount)
4. Pull projects → Connect Marketplace (88% complete, targeting Dec 31)
5. Synthesize: Q4 close checklist with priorities

### Evidence Sources
- `calendar_events.json` → Q4 close meetings
- `customers.json` → December renewals
- `slack_threads.json` → pending decisions
- `projects.json` → proj-marketplace (88%, Dec 31 target)

### Expected Recommendation
> "Q4 close checklist — December 31 deadline: (1) Acme Corp renewal — Dec 28. Recovery call Dec 16. CRITICAL for Q4 close. (2) Pinnacle Logistics renewal — Dec 31. No active outreach. URGENT: assign CSM today. (3) Acme Corp 15% credit — approval pending. Must formalize before renewal. (4) SRE headcount in Workday — CEO approval received, confirm it's in the system. (5) Connect Marketplace launch — targeting Dec 31, 88% complete. (6) Engineering: Release 3.2 (Dec 29) — late December deployment could affect Q4 infrastructure costs. (7) Performance reviews — engineering deadline may need extension."

### Pass/Fail Checklist
- [ ] Both December renewals cited with dates
- [ ] Acme credit approval gap flagged
- [ ] Connect Marketplace Dec 31 target mentioned
- [ ] Release 3.2 Dec 29 deployment flagged as infrastructure cost event
- [ ] No invented financial deadlines

---
