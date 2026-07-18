# Blueprint: Customers — `/customers`
**Document:** BP-08  
**Last updated:** 2026-07-18  
**Status:** Authoritative

---

## Purpose

Answer one question: **"Which customers need attention right now?"**

Customers surfaces customer health signals — escalations, churn risk, renewal milestones, and relationship context — so that the CTO or Sales Leader can take action before a customer is lost. Its primary action is responding to the highest-risk customer signal.

---

## Target User

**Primary:** CTO, Sales Leader, VP Customer Success  
**Secondary:** Manager/VP  
**Frequency:** Daily for customer-facing roles; weekly for CTOs

---

## Entry Points

| Source | How |
|---|---|
| Sidebar | "Customers" item (INTELLIGENCE group, position 4) |
| `⌘K` → "Go to Customers" | CommandPalette |
| FLOW Brain | Customer escalation card → `/customers` |
| Simulation result | Customer churn simulation |
| Direct URL | `/customers` |

---

## Layout Hierarchy

```
┌─────────────────────────────────────────────────────────────────┐
│ Sidebar (220px)                                                 │
├──────────────────────────────────────────────┬──────────────────┤
│                                              │                  │
│  PageHeader: Customers [search] [filter ▾]  │  LiveFeed        │
│  ──────────────────────────────────────────  │  (260px)         │
│  ExecutiveHero                               │                  │
│  "1 at-risk customer · 2 renewals this week" │                  │
│  [Respond to Acme escalation]                │                  │
│  ──────────────────────────────────────────  │                  │
│  AtRiskList (≤3 cards, critical-first)       │                  │
│  ──────────────────────────────────────────  │                  │
│  HealthGrid (all customers, compact rows)    │                  │
│  ──────────────────────────────────────────  │                  │
│  RenewalTimeline (horizontal, next 90 days)  │                  │
│                                              │                  │
│  [StickyCommandCenter]                       │                  │
└──────────────────────────────────────────────┴──────────────────┘
```

---

## Information Hierarchy

```
Level 1  ExecutiveHero — at-risk count + renewal count
Level 2  At-Risk Customers (≤3 cards, actionable)
Level 3  Customer Health Grid (all, searchable)
Level 4  Renewal Timeline (next 90 days)
Level 5  StickyCommandCenter
```

---

## Components

| Component | File | Notes |
|---|---|---|
| Page orchestrator | `components/platform/CustomerIntelligence.jsx` | Currently shows demo data |
| `CustomerCard` | Inline | At-risk card with actions |
| `CustomerRow` | Inline | Health grid compact row |
| `RenewalTimeline` | Inline | Horizontal timeline with dots |
| `CustomerDetailPanel` | Right slide-over | Customer context on click |
| `ExecutiveHero` | `components/decisions/ExecutiveHero.jsx` | |

---

## Data Sources

| Data | Source | Notes |
|---|---|---|
| Customer health | `GET /api/crm/customers?workspaceId={ws}` (via HubSpotAdapter) | |
| At-risk predictions | `GET /api/predictions/run?domain=customers` | `CUSTOMER_CHURN` type |
| Renewals | `GET /api/crm/renewals?days=90` | From CRM adapter |
| Customer events | `GET /api/events/feed?type=CUSTOMER&workspaceId={ws}` | Recent escalations |

**Demo fallback:** When CRM (HubSpot/Salesforce) is not connected:
```
Banner: "Showing sample customer data — connect HubSpot or Salesforce to go live."
[Connect CRM →]  → `/integrations`
```
Demo data renders so the page is not blank. Clearly labeled `"Sample data"`.

---

## At-Risk Customer Card Layout

```
┌──────────────────────────────────────────────────────────────┐
│  [CRITICAL]  Acme Corporation                                │
│  Annual contract: $240K · Renewal: Aug 15 (28 days)          │
│  ────────────────────────────────────────────────            │
│  SIGNAL: 3 support tickets opened this week.                 │
│  API latency complaint unresolved for 4 days.                │
│  ────────────────────────────────────────────────            │
│  RECOMMENDED: Escalate to CTO. Schedule an EBR call.         │
│  ────────────────────────────────────────────────            │
│  [Schedule EBR Call]  [Send executive email]  [▶ Evidence]   │
└──────────────────────────────────────────────────────────────┘
```

Risk badge colors:
- `CRITICAL`: 3px left border `var(--status-critical)`, impact `critical`
- `HIGH`: 2px left border `var(--accent)`, impact `high`
- `MEDIUM`: default border, impact `medium`

---

## Customer Health Grid

Compact table of all customers sorted by health score (lowest first):

```
[search customers...]

NAME               HEALTH   ARR      RENEWAL    LAST CONTACT
Acme Corp          ●●○○○    $240K    Aug 15     2d ago
Helios Tech        ●●●○○    $180K    Nov 3      1w ago
TechFlow Inc       ●●●●○    $95K     Jan 8      3d ago
DataBridge         ●●●●●    $60K     Mar 2      5d ago
```

Health dots: 5 dots, filled dots = health score / 20. Colors:
- 1–2 filled: `var(--status-critical)`
- 3 filled: `var(--status-warning)`
- 4–5 filled: `var(--status-healthy)`

Click row → CustomerDetailPanel (right slide-over).

---

## Customer Detail Panel

```
[×]  Acme Corporation     [CRITICAL health]
─────────────────────────────────────────────
ARR: $240,000 · Contract ends: Aug 15, 2026
Primary contact: Jane Smith, CTO
─────────────────────────────────────────────
HEALTH SIGNALS
  ✗ 3 open support tickets (API latency)
  ✗ 0 product logins in 14 days
  ✓ Last EBR: 2 months ago

RECENT ACTIVITY
  • Support ticket #1247 opened — Jul 16
  • Login spike (unusual): Jul 10
  • Renewal reminder sent: Jul 1

AI SUMMARY
[1–2 sentence FLOW summary of customer relationship]

▶ Evidence (collapsed)
─────────────────────────────────────────────
[Schedule call]  [Send email]  [Run churn simulation]  [Ask FLOW]
```

`[Run churn simulation]` → `POST /api/simulation/run` with `{type: 'CUSTOMER_CHURN', targetEntityId: 'customer:{id}'}` → modal with result.

---

## Renewal Timeline

Horizontal timeline showing the next 90 days:

```
|----Jul 18----|---Aug 1----|---Aug 15----|---Sep 1----|---Sep 15--|
                              ●ACME         ●Helios
                              $240K         $180K
```

Each renewal dot:
- Red: ≤ 30 days and health < 3/5
- Yellow: ≤ 30 days and health ≥ 3/5
- Green: > 30 days

Click dot → customer detail panel for that customer.

---

## AI Behavior

### Predictions
`CUSTOMER_CHURN` predictions from `GET /api/predictions/run?domain=customers`:
- Probability percentage (shown as verbal assessment, not raw number)
- Drivers: ticket volume, login patterns, support escalation recency, days to renewal
- Drives At-Risk card ranking

### Command Center suggestions
```
SUGGESTED:
  "Which customers are most at risk this month?"
  "What does Acme Corp need right now?"
  "Summarize our renewal pipeline for the next 90 days"
  "What would happen if Acme churns?"
```

### Simulation via Command Center
`"What if Acme churns?"` → `POST /api/simulation/run` with `type: CUSTOMER_CHURN` → inline result:
```
SIMULATION: Acme churn impact
  Financial: ~$240K ARR loss (~14% of total)
  Timeline: Immediate upon contract end
  Risk: Referral pipeline at risk (Acme referred 2 customers)
[View full analysis →]
```

---

## Loading State

```
[Hero skeleton]
[2 CustomerCard skeletons]
[Health Grid: 4 row skeletons]
[Renewal Timeline skeleton: line + 3 dot placeholders]
```

---

## Empty State

**No customers:**
```
[Building icon, 40px, var(--t4)]
No customer data available.
Connect HubSpot or Salesforce to surface customer intelligence.
[Connect CRM →]
```

**No at-risk customers:**
At-Risk section renders:
```
No at-risk customers.
All accounts are healthy.
```
(Health Grid and Timeline still render)

---

## Error State

- CRM adapter failure: banner `"CRM data unavailable. Showing cached customer data."`
- Churn simulation failure: `"Unable to run simulation. [Retry]"` in modal

---

## Keyboard Shortcuts

| Key | Action |
|---|---|
| `⌘F` | Focus search |
| `↓` / `↑` | Navigate health grid |
| `Enter` | Open CustomerDetailPanel |
| `S` | Run churn simulation for focused customer |
| `Escape` | Close CustomerDetailPanel |

---

## Accessibility

- Customer rows: `role="row"` in `role="grid"`, `aria-label="{name}, health {N}/5"`
- Health dots: `aria-label="Health: {N} of 5"` (not color-only)
- Renewal dot on timeline: `aria-label="{name} renewal: {date}"`
- CustomerDetailPanel: `role="dialog"`, `aria-modal="true"`, focus trap

---

## Responsive Behavior

| Viewport | Behavior |
|---|---|
| ≥1280px | Full layout + LiveFeed |
| 1024px–1279px | Full layout, no LiveFeed |
| 768px–1023px (tablet) | Single column; timeline scrollable horizontally |

---

## Telemetry Events

| Event | Trigger | Properties |
|---|---|---|
| `customers.viewed` | Page mount | `{ connected, atRiskCount, renewalCount }` |
| `customers.customer.selected` | Row/card click | `{ customerId, health }` |
| `customers.simulation.triggered` | Churn simulation | `{ customerId }` |
| `customers.action.clicked` | Card action | `{ customerId, action }` |
| `customers.crm.connect_clicked` | CRM connect banner | `{}` |

---

## Acceptance Criteria

- [ ] At-risk cards ranked by churn probability; CRITICAL cards at top.
- [ ] Health grid shows all customers sorted by health score (lowest first).
- [ ] Health dots use 5-dot system with correct colors.
- [ ] Renewal timeline shows next 90 days with correct dot colors.
- [ ] CustomerDetailPanel shows health signals, recent activity, AI summary, and action buttons.
- [ ] Churn simulation runs and displays result in a modal.
- [ ] CRM not connected → demo data with banner.
- [ ] All keyboard shortcuts work.
- [ ] All telemetry events fire.
