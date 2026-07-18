# FLOW OS — User Experience
**Document:** 03 of 20  
**Status:** Authoritative  
**Last updated:** 2026-07-18

---

## User Personas

FLOW serves six primary personas in an enterprise. Each has a distinct daily routine and a distinct set of needs. FLOW must serve all of them from the same interface — with personalized signal filtering, role-appropriate recommendations, and appropriately scoped access.

---

## Persona 1: The CTO

**Role:** Technical leader, 1:1s with VPs, owns engineering org  
**Primary concern:** Is the company shipping? What is at risk?  
**Time available:** 4–6 hours per day of focused work, balance in meetings  
**Information load:** 300+ Slack messages, 40+ emails, 12+ GitHub notifications daily  
**Decision frequency:** 15–25 decisions per day, most operational, some strategic  

### Morning Routine with FLOW

```
7:45 AM — Opens FLOW
          Sees: 3 decisions requiring action today
          Decision 1: PR #447 is blocking 3 engineers. Needs approval.
          Decision 2: Production incident opened at 2AM. Status: resolved. Review postmortem.
          Decision 3: Customer Acme Corp. renewsl call in 4h. AI prep context available.
          Time: 90 seconds to read all three.

8:00 AM — Approves PR #447 directly from FLOW (no GitHub tab)
          Sees postmortem summary (no Notion tab)
          Opens meeting prep for Acme call (no manual research)
          Time: 8 minutes.

8:10 AM — Opens /brain
          Types: "What's at risk in the Postgres migration?"
          Gets: Streaming executive brief with 3 key risks and 2 recommended actions.
          Time: 45 seconds.

Standups — Opens /meetings before each meeting
           Sees AI prep context, outstanding action items, attendees and their current PRs
           Takes notes inline, converts to action items

Evening — Weekly Review at /review
          Sees velocity, risk, team health, open decisions
```

### What FLOW Must Never Do to the CTO
- Show a list of 30 items and ask them to prioritize
- Start a conversation with "Hello! How can I help?"
- Make them open GitHub to review a PR FLOW already surfaced
- Lose their conversation from this morning
- Show confidence scores or vector retrieval metadata
- Require a page refresh to see new data

---

## Persona 2: The Manager / VP

**Role:** Team lead, 5–15 direct reports, owns delivery  
**Primary concern:** Is my team unblocked? Are we on schedule?  
**Information load:** 150+ Slack, 20+ emails, PR reviews, standup notes daily  
**Decision frequency:** 20–30 per day, mostly people and process  

### Morning Routine with FLOW

```
Morning:
  Decision Stream shows: blocked engineer, approval from last week still pending,
  merge conflict in auth.js between Rahul and Alice

  Actions: delegates review, approves outstanding approval, assigns conflict ownership

Throughout day:
  Chief of Staff at /chief surfaces changes — deploys to prod, failing CI, team calendar conflicts

Meetings:
  Standup prep from /meetings — who committed yesterday, who is blocked, velocity
  1:1 prep — recent decisions by this person, their open PRs, blockers

End of week:
  /review — sprint completion, predictions for next sprint, team engagement signals
```

---

## Persona 3: The Senior Engineer

**Role:** IC, owns 1–3 services, reviews PRs, leads tech decisions  
**Primary concern:** What do I work on next? What is blocked on me?  
**Information load:** PR review requests, Jira tickets, Slack DMs, failing tests daily  
**Decision frequency:** 8–15 per day, mostly technical  

### Daily Routine with FLOW

```
Morning:
  Decision Stream: 2 PRs waiting for review. One is blocking release 2.5.
  Opens PR directly from FLOW, approves.
  Second PR has merge conflict — MergeConflictCard shows files, owners, diff.

During work:
  ⌘K → "What changed in the auth service this week?" → Brain response with commit list
  ⌘K → /draft → "Send Rahul a message about the migration deadline"

Deployment:
  Engineering page shows deployment risk score for current PR
  FLOW flags off-hours deploy (Friday 5PM) with elevated risk badge
  Engineer defers to Monday via ActionCard
```

---

## Persona 4: The CEO / Executive

**Role:** Business leader, owns company outcomes  
**Primary concern:** Company health. Customers. Team. Risk.  
**Information load:** Reports, board prep, customer escalations  
**Decision frequency:** 5–10 strategic per day  

### Daily Routine with FLOW

```
Morning:
  Executive Council at /council — 6-agent strategic view of company health
  One ask: "What is the biggest risk to our Q3 goals?"
  Gets: structured multi-agent response with engineering/sales/HR signals combined

Customers:
  /customers — churn risk sorted first. Acme Corp shows 3 escalation signals.
  Asks brain for context. Sends prep brief to account team.

People:
  /people — burnout risk. One engineer at 94% context-switch score.
  Schedules 1:1 via calendar connector from FLOW.

Weekly:
  Chief of Staff weekly summary includes business metrics, not just engineering signals
```

---

## Persona 5: The Sales Leader / AE

**Role:** Owns revenue, manages accounts, runs deals  
**Primary concern:** Which deals are at risk? What do customers need?  
**Information load:** CRM updates, emails, customer Slack channels, Zoom calls  
**Decision frequency:** 10–20 per day, customer-focused  

### Daily Routine with FLOW

```
Morning:
  Decision Stream: renewal call in 2h, two deals went quiet, one escalation
  Customer Intelligence at /customers: health scores, activity timelines
  Asks brain: "What do I need to know before the Acme call?"

During calls:
  Meeting prep at /meetings: AI context from previous meeting notes, open action items

After calls:
  Notes and action items saved to calendar event from FLOW
  Follow-up email drafted from Command Center
  Deal stage updated via Jira/CRM action
```

---

## Persona 6: The HR Lead

**Role:** People operations, performance, hiring, culture  
**Primary concern:** Team health, attrition risk, compliance  
**Information load:** Workday/BambooHR, Slack signals, 1:1 notes, engagement surveys  

### Daily Routine with FLOW

```
Morning:
  Decision Stream: one engineer showing burnout signal (94% context switch score)
  /people — workforce intelligence with burnout risk, knowledge concentration, org gaps

Weekly:
  /review — team engagement, knowledge bus-factor by team
  Asks brain: "Who is at risk of leaving this quarter?"

Onboarding:
  Decision Stream surfaces new employee without system access
  ActionCard: create Jira onboarding ticket, schedule intro meetings
```

---

## Expected Experience Standards

### Time to Value

| Moment | Target |
|---|---|
| Login to first actionable decision | < 60 seconds |
| Login to completing first action | < 5 minutes |
| Asking brain a question to getting answer | < 30 seconds |
| Finding any page in the product | < 2 clicks from sidebar |
| Connecting first integration | < 10 minutes |
| Onboarding to operational | < 30 minutes |

### Freshness

All data visible on any FLOW page must be no older than the last sync cycle of the connected source. The Workspace Intelligence Cache provides sub-5ms reads. Live feed via WebSocket delivers real-time events without page refresh. Decision Stream refreshes when chief-of-staff data is invalidated.

### Accuracy

FLOW makes strong statements. It says "this PR is blocking 3 engineers" not "this PR might be blocking some engineers." Strong statements require high evidence quality. FLOW must only surface items it has evidence for. It must declare when evidence is insufficient — not fabricate confidence.

### Recovery

When any data source is unavailable:
- Demo fallbacks are used for display (clearly labeled "Showing sample data")
- The last-known real data is shown where available
- The system never shows an error page to replace a missing feature
- The StickyCommandCenter always works, even offline

---

## Emotional Design Goals

Every user who opens FLOW should feel:

**Calm.** Not overwhelmed. FLOW has already sorted through everything. The user sees three things, not thirty.

**Confident.** FLOW's recommendations come with evidence. The user acts knowing why.

**In control.** Every action requires human approval. Every permission is explicit. Nothing happens automatically.

**Respected.** FLOW does not dumb things down. It speaks to executives like executives — directly, authoritatively, briefly.

**Efficient.** A decision that used to require three tabs, two Slack threads, and a PM conversation now takes 45 seconds.

Every design decision — spacing, typography, motion, copy — serves these five emotional goals. When a design choice creates anxiety (dense data), confusion (missing labels), or friction (three clicks to reach a feature), it must be revisited.
