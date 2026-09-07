# Customer Intelligence — Solution Specification
## FLOW OS Solutions Library

> **STATUS: DESIGN ONLY**
> Capability layer: Phase 5.9 (HubSpotAdapter, SalesforceAdapter)

---

## Problem Statement

Companies lose customers because they don't know they're losing them. By the time churn shows up in the dashboard, the customer has already decided to leave — 6 weeks ago, in a support ticket that nobody flagged, in a meeting where the tone changed, in an email where the response time doubled.

CRM systems are systems of record for deals and contacts. They don't synthesize relationship health from actual communication signals. They don't know that the customer went from responding in 2 hours to responding in 3 days. They don't know that the champion who bought your product just left the company. They don't know that the support thread from last month maps to the same root cause as 3 other enterprise customers.

**FLOW's advantage:** It ingests the actual communication: email threads, meeting recordings, support escalations, Slack channels with customers. It correlates this against the CRM record, the relationship graph, and org memory. Customer Intelligence is the layer that turns this into actionable relationship intelligence.

---

## Module Scope

```
Customer Intelligence
├── Customer Health Scoring          — real-time health from communication signals
├── Churn Risk Detection             — early warning system
├── Relationship Mapping             — who at your company knows who at the customer
├── Expansion Intelligence           — upsell + cross-sell signal detection
├── Customer Handover Workflows      — when the AE or CSM leaves (see Workforce Intel)
└── Portfolio Intelligence           — account health across the full book of business
```

---

## Signature Workflows

### 1. Real-Time Customer Health Score

**Trigger:** Continuous (updated on every new signal ingested)  
**FLOW action:**
- Score each customer account (0–100) from composite signals:
  - **Engagement velocity:** response time trend, meeting frequency, email open/response rate
  - **Communication sentiment:** Gemini sentiment analysis on recent email/Slack threads (no PII stored)
  - **Support signal:** ticket volume, escalation rate, time-to-resolution trend
  - **Champion stability:** has the primary contact's communication pattern changed? Did their email domain change? (signals possible departure)
  - **Product signal:** (if product analytics connected) feature usage trend, login frequency
- Surface: Per-account health card with trend arrow and primary risk driver

**Example:** "Acme Corp: Health 42 ↓ (was 78 last month). Primary driver: Response time increased from 4h to 2.7d. Champion Marcus W. hasn't replied since June 15. Last meeting was 47 days ago (was every 2 weeks)."

### 2. Churn Risk Early Warning

**Trigger:** Health score drops below threshold (configurable); or specific signal patterns  
**FLOW action:**
- Fire alert when:
  - Health score drops > 20 points in 14 days
  - Champion stops responding for > 10 business days
  - Support escalation from C-level contact
  - Contract renewal is within 90 days AND health < 60
- Alert routed to: account owner in CRM + Slack DM + FLOW briefing
- Copilot context: "What's the history with Acme Corp?" → pulls all emails, meetings, decisions, support tickets

**What no other tool does:** FLOW detected Marcus (the champion) changed his email signature 3 weeks ago — a signal he may be leaving the company. No CRM does this.

### 3. Relationship Mapping

**Trigger:** CRM account view + FLOW graph query  
**FLOW action:**
- Build relationship graph: all FLOW users who have communicated with customer contacts (email, meeting, Slack)
- Score relationship strength: recency, frequency, depth (async email vs. scheduled meeting vs. Slack)
- Surface: "Who at our company knows who at Acme Corp?"
  - James K. (CTO) → Marcus W. (VP Eng at Acme) — 14 meetings, strong
  - Sarah C. — Marcus W. — 3 emails, weak
  - No one has a relationship with new CTO (joined Acme 30 days ago)
- Alert when: key relationship goes inactive

**Differentiation:** CRMs store who the assigned AE is. FLOW maps who has an actual working relationship and how strong it is.

### 4. Expansion Signal Detection

**Trigger:** Communication ingestion pipeline; weekly intelligence pass  
**FLOW action:**
- Detect expansion signals in ingested communication:
  - Keywords: "additional team", "scale up", "enterprise plan", "more seats", "other departments"
  - Behavioral: increasing meeting frequency, new contacts from customer org
  - Org signal: customer company raised a round (if news connected)
- Surface in: AE's daily briefing, account view, expansion opportunity queue
- Copilot: "Which customers are showing expansion signals?" → returns ranked list with evidence

### 5. Customer Onboarding Intelligence

**Trigger:** Deal closed in CRM (webhook)  
**FLOW action:**
- Auto-create customer node in Operational Graph
- Generate onboarding brief for CSM: "TechCorp uses Salesforce, GitHub, and Slack. Recommended integrations to show first: GitHub (they're a developer-focused team). Previous enterprise customers in this segment averaged 22 days to first value delivery."
- Track onboarding health: are integration milestones being hit? Is customer asking questions that suggest confusion?
- Alert CSM: "TechCorp hasn't logged in for 8 days during their first month. Risk: early churn signal."

---

## Reused FLOW Components

| Component | Role |
|---|---|
| HubSpotAdapter / SalesforceAdapter | CRM data source + action execution |
| GmailAdapter | Email communication analysis |
| GoogleCalendarAdapter | Meeting frequency + attendance |
| Operational Graph | Relationship mapping |
| Org Memory | Historical customer decisions + incidents |
| Vector Store | Communication semantic search |
| Operational Brain | Copilot queries + briefing for AEs/CSMs |
| Incident Engine | Support escalation detection |
| Execution Engine | Update CRM records, create tasks, send emails |

---

## New Services Required

| Service | Purpose |
|---|---|
| `customerHealthService.js` | Compute health score from all signals |
| `churnRiskService.js` | Alert logic + threshold management |
| `relationshipMapService.js` | Build + score relationship graph from communication |
| `expansionSignalService.js` | Detect expansion keywords + behavioral signals |
| `customerOnboardingService.js` | Onboarding brief generation + milestone tracking |

---

## Data Architecture Additions

```prisma
model CustomerAccount {
  id              String   @id @default(cuid())
  orgId           String
  workspaceId     String
  crmId           String                  // HubSpot/Salesforce record ID
  name            String
  domain          String?
  arrCents        Int      @default(0)    // Annual recurring revenue in cents
  healthScore     Int      @default(50)   // 0-100 current health score
  churnRiskLevel  String   @default("LOW") // LOW | MEDIUM | HIGH | CRITICAL
  renewalDate     DateTime?
  primaryContactId String?                // GraphNode ID of champion
  assignedOwnerId  String?               // FLOW User.id of account owner
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  healthHistory   CustomerHealthSnapshot[]
}

model CustomerHealthSnapshot {
  id            String   @id @default(cuid())
  accountId     String
  score         Int
  signals       Json     // { engagementVelocity, sentiment, supportSignal, ... }
  primaryDriver String?  // main factor behind score
  recordedAt    DateTime @default(now())
}
```

---

## API Additions

```
GET  /api/crm/customers/health               — All accounts with health scores + risk levels
GET  /api/crm/customers/:id/health           — Single account health + signal breakdown
GET  /api/crm/customers/:id/relationships    — Relationship map with strength scores
GET  /api/crm/customers/churn-risk           — Accounts above churn risk threshold
GET  /api/crm/customers/expansion-signals    — Accounts showing expansion signals
POST /api/crm/customers/:id/refresh          — Refresh health score on demand
```

---

## Competitive Differentiation

**vs. Gainsight / ChurnZero (customer success):** They track product usage + NPS surveys. FLOW adds communication intelligence: the actual email thread where the customer went quiet, the meeting where the tone changed, the relationship graph showing you've lost your champion.

**vs. Gong / Chorus (conversation intelligence):** They analyze recorded sales calls. FLOW analyzes the full relationship lifecycle: pre-sale, post-sale, support, renewal — across email, meetings, and Slack.

**vs. Salesforce Einstein:** Native to Salesforce, limited to CRM data. FLOW synthesizes across all communication channels and internal context.

**FLOW's moat:** The correlation layer. FLOW can answer "Is TechCorp at risk?" by pulling: their CRM record, the last 12 email threads, the last 3 meetings, the support tickets, the champion's communication pattern change, and the fact that our AE who owned the relationship just left the company. No other tool has all of this in one reasoning layer.

---

## Roadmap Stage

**Phase 5.9** (Current): HubSpot/Salesforce adapters — skeleton exists  
**Phase 8.0** (Beta): Customer Health Score + Churn Risk dashboard  
**Phase 11.5** (Post-Beta): Full Customer Intelligence module (all 5 workflows)

---

*Last updated: 2026-07-01 · Status: DESIGN ONLY*
