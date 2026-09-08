# FLOW OS — Customer Pilot Guide

> For the Customer Success team. One document covers the full pilot journey from first call to signed contract.

---

## Pilot Overview

A FLOW OS pilot runs 30 days. By day 30, the customer has answered one question with confidence: **is FLOW OS the operating system their company should run on?**

**What the customer gets:**
- FLOW connected to their real tools (GitHub, Gmail, Slack, Jira, Calendar)
- A live Morning Briefing showing real company activity every morning
- A Chief of Staff that tells them what to do next, with one click to act
- An Executive Dashboard showing company health across Engineering, Sales, and Customers
- A complete audit trail of everything FLOW touched

**Success criteria (agree on these at kickoff):**
1. CEO/CTO opens FLOW before checking email at least 3 days per week by day 21
2. At least 3 autonomous actions completed through FLOW (not manually)
3. At least 1 decision made that referenced FLOW's context panel
4. User would recommend FLOW to a peer (NPS ≥ 8)

---

## Week-by-Week Pilot Playbook

### Week 0 — Pre-pilot setup (CSM + SE)

**Day -7 to Day 0**

1. **Technical kickoff call** (1 hour)
   - Confirm technical contact (usually VP Eng or IT Director)
   - Verify they have: GitHub PAT, Google OAuth access, Jira admin rights
   - Walk through the [Admin Setup Guide](#admin-setup-guide) live on the call
   - Goal: all connectors green before the pilot "day 1" call

2. **Executive sponsor call** (30 min)
   - Identify the champion (usually CTO or VP Operations)
   - Understand their top 3 pain points
   - Set expectations: FLOW works best when it's a daily habit from day 1
   - Schedule day-1 onboarding call and day-15 checkpoint call

3. **Data seeding**
   - If connectors aren't ready: seed with Demo Company data so the pilot starts with signal
   - Go to `/settings/import` → Load Demo Company → "Helios Software Inc."
   - This gives them a working company to explore while real data connects

**Checklist before pilot day 1:**
- [ ] GitHub PAT stored (`POST /api/engineering/auth`)
- [ ] Gmail OAuth completed (follow `GET /api/communication/oauth/callback` flow)
- [ ] Google Calendar OAuth completed
- [ ] Jira connected (Composio OAuth)
- [ ] At least one connector shows green in `/integrations`
- [ ] Executive sponsor has their login and can access `/`
- [ ] Demo company loaded (or real data visible in Morning Briefing)

---

### Week 1 — Foundation (Days 1-7)

**Goal:** Customer uses FLOW every morning. Connectors are live. Morning Briefing shows real data.

**Day 1 — Onboarding call (1 hour, screen share)**

Walk through in this order (never reverse):

1. **Home (`/`)** — Start here. Ask: "What did you ship yesterday? Find it here." Validate Morning Briefing shows their actual GitHub commits, emails, and Jira tickets.

2. **Inbox (`/inbox`)** — Click the first email. Ask: "Is this real?" Have them click Reply. Show AI-drafted reply. Ask: "Does this match how you'd write it?"

3. **Engineering (`/engineering`)** — If they're technical: point to the PR review queue. Ask: "Which of these PRs is blocking a release?" Show merge readiness score.

4. **Chief of Staff (`/chief`)** — Ask: "If your Chief of Staff could tell you one thing right now, what would it be?" Show them the NOW section. Have them complete one action.

5. **Weekly Review (`/review`)** — Show velocity + top risks. Ask: "Does this match what you saw last week?"

**Common day-1 objections:**

| Objection | Response |
|-----------|----------|
| "The data doesn't look right" | "Let's sync — what's missing? GitHub sync runs every 6 hours. Calendar sync is real-time." |
| "I don't have time to learn a new tool" | "You don't learn FLOW. You open it instead of your email. That's it." |
| "How does it know this?" | "Click the source badge on any insight — it shows you the exact email, PR, or ticket it came from." |
| "Is my data secure?" | "Everything runs on your infrastructure. FLOW reads; it never stores full email bodies. Show them `/integrations`." |

**Days 2-7 — Daily check-ins (5 min async via Slack)**

Send one message each morning: "What did FLOW surface for you today? Screenshot if anything looks off."

Track in your CRM:
- Did they open FLOW? (check adoption metrics at `/api/onboarding/metrics`)
- What did they click?
- Any complaints about data freshness or accuracy?

---

### Week 2 — Depth (Days 8-14)

**Goal:** Customer completes their first autonomous action. They trust the data.

**Day 8 — First autonomous action call (30 min)**

1. Go to `/chief` → show the action queue
2. Pick an action with LOW or MEDIUM risk
3. Walk them through the Execution preview: "FLOW will [do X] — do you want to approve this?"
4. Complete the action together
5. Show the audit trail in `/activity`

**Day 10 — Executive Dashboard tour (20 min)**

Go to `/dashboard`. Show:
- Company health score and what's driving it
- Top risks (connect to what they already knew)
- Pending approvals
- Upcoming renewals / deadlines

Ask: "If you showed this to your board right now, what's missing?"

**Day 12 — Customer Intelligence tour (20 min)**

If they have customers: go to `/support`. Show:
- Customer health portfolio
- Escalation cards (should show real data if CRM is connected or demo is seeded)
- Upcoming renewals

Ask: "Which customer is most at risk right now? Is FLOW right about that?"

---

### Week 3 — Value (Days 15-21)

**Goal:** Customer can articulate ROI. Champion is advocating internally.

**Day 15 — Checkpoint call (45 min)**

Agenda:
1. Usage review (you pull from `/api/onboarding/metrics` and share)
   - Days opened, actions completed, decisions made
   - Time saved estimate (from `/api/success/summary`)
2. What's working well (ask, don't assume)
3. What's frustrating (write it down — this is product feedback)
4. Has anyone else on the team started using it?
5. What would make you feel confident recommending this to your board?

**Champion email template (send after day 15 call):**

```
Subject: FLOW OS — Week 2 summary + what's next

Hi [Name],

Quick recap of what FLOW surfaced this week:
- [X] autonomous actions completed (saving ~[Y] hours of manual work)
- [Z] decisions made with context from FLOW
- Key insight: [one thing FLOW surfaced that they didn't already know]

I've attached a short deck with your Value page data. 
The time saved estimate is conservative — your actual number is likely higher.

For week 3, I'd love to help you:
1. Connect [next connector] so FLOW has more signal
2. Schedule a demo for [other stakeholder] if they haven't seen it yet

Any questions? Happy to jump on a call.
```

---

### Week 4 — Decision (Days 22-30)

**Goal:** Signed contract or clear next steps.

**Day 22 — Expansion discovery call (30 min)**

- Who else in the company should see this?
- What teams are still doing manually what FLOW could automate?
- Any compliance or security requirements for broader rollout?

**Day 28 — Renewal call (45 min)**

Agenda:
1. Show `/success` dashboard together — let them see the ROI number
2. Present the Value Story deck (see [Sales Materials](#sales-materials))
3. Discuss seat count + plan for full company rollout
4. Address procurement requirements (security questionnaire, DPA, MSA)

**If they're hesitant:**

| Scenario | Response |
|----------|----------|
| "Price is too high" | "What's the value of [the specific action they completed]? Let's work back from there." |
| "Not enough adoption yet" | "Who on your team should be using this but isn't? Let's do a 15-min demo for them now." |
| "Need more connectors" | "Which connectors are critical? I'll put them in the product roadmap for Q1." |
| "Need IT approval" | "Let's schedule a security review call. I can have our CISO join." |

---

## Admin Setup Guide

*For the customer's technical contact (VP Eng, IT Director, or DevOps lead)*

### Step 1 — Create workspace and admin account

1. Go to your FLOW OS URL
2. Click "Sign up" → fill in company name, your email, and a strong password
3. You're now the workspace OWNER with full admin rights

### Step 2 — Connect GitHub

```bash
# Store your GitHub Personal Access Token
# Required scopes: repo, read:user, read:org
curl -X POST https://[your-flow-url]/api/engineering/auth \
  -H "Authorization: Bearer [your-jwt]" \
  -H "workspace-id: [your-workspace-id]" \
  -H "Content-Type: application/json" \
  -d '{"token":"ghp_your_github_pat_here"}'
```

Or via the UI: `/integrations` → GitHub → Enter PAT

### Step 3 — Connect Gmail

1. Go to `/integrations` → Gmail → "Connect"
2. You'll be redirected to Google's OAuth consent screen
3. Grant access to Gmail (read + send)
4. You'll be redirected back to FLOW with a green checkmark

### Step 4 — Connect Google Calendar

Same flow as Gmail — `/integrations` → Google Calendar → "Connect"

### Step 5 — Connect Jira

1. Go to `/integrations` → Jira → "Connect with Composio"
2. Enter your Jira instance URL (e.g., `yourcompany.atlassian.net`)
3. Complete the OAuth flow

### Step 6 — Verify all connectors

Go to `/integrations`. Every connected tool should show a green "Healthy" badge.

If any show "Degraded" or "Error":
- Check the connector credentials are still valid
- For GitHub: verify the PAT hasn't expired
- For Gmail: re-authorize if the token was revoked
- For Jira: re-connect if the Composio token expired

### Step 7 — Set integration permissions

Go to `/settings/permissions`. For each connector:
- Review which repositories/labels/calendars FLOW can see
- Remove any you don't want FLOW to index (e.g., HR-confidential repos)
- Enable "Auto-allow new resources" if you want all future repos/channels included automatically

### Step 8 — Invite team members

Go to `/settings/team`. Invite:
1. Your executive sponsor (role: ADMIN)
2. Key team leads (role: MEMBER)
3. CSM from Helios (role: MEMBER, for support access)

### Step 9 — Test with a question

Go to `/` and ask: "What did my team ship this week?"

A good answer means: FLOW is indexing your data. A generic answer means: check connector sync status at `/settings/health`.

---

## End User Guide

*For team members who are not admins*

### Getting started (5 minutes)

1. Accept your invitation email → set your password
2. Go to your FLOW OS URL and log in
3. You land on the Morning Briefing — this is your home

### The Morning Briefing

Every morning, FLOW shows you:
- **What happened** while you were offline (commits, emails, Jira updates, incidents)
- **What needs your attention** today (meetings, deadlines, blocked teammates)
- **What FLOW recommends** you do first

You don't configure this. It learns from your activity.

### Asking FLOW questions

The chat bar is at the bottom of every page. Ask in plain English:

- "What's blocking our release?"
- "Is Acme Corp at risk of churning?"
- "Who should review PR #847?"
- "Summarize what happened in the incident last night"
- "What are the top 3 engineering risks this week?"

FLOW always shows you the sources it used (emails, PRs, tickets). Click any source to see the original.

### Taking actions

When FLOW recommends an action (e.g., "Approve PR #847"), you'll see an action card with:
- **Risk level** (LOW/MEDIUM/HIGH/CRITICAL) — this tells you how careful to be
- **What FLOW will do** — exact description, no surprises
- **Confirm/Reject** — you're always in control

**FLOW never acts without your approval** for HIGH or CRITICAL risk actions.

### The Chief of Staff

Go to `/chief` for a prioritized "what should I do right now?" view. This shows:
- The top 5 actions waiting for you, sorted by urgency
- One-click execution for approved actions
- Why each item is urgent (always linked to real data)

### Privacy

FLOW does not:
- Store full email bodies (only metadata and AI summaries)
- Read messages marked private or with certain labels (configured by your admin)
- Share your data with anyone outside your company

You can see everything FLOW has stored about your workspace at `/activity`.

---

## Sales Materials

### The Value Story (for procurement/finance)

**The problem FLOW solves:**

Enterprise companies lose 2-4 hours per executive per day to context switching — reading email to understand what happened, then switching to Slack, then to Jira, then to GitHub. That's $150-$300K/year of executive time per company at $150K average comp.

FLOW reduces this to 15 minutes per morning.

**What customers have said:**

- "I used to spend 45 minutes reading Slack before my first meeting. Now I open FLOW for 10 minutes and I'm done." — CTO, Series B SaaS company
- "FLOW caught a customer churn risk I would have missed for another week." — VP Customer Success, enterprise software company
- "The audit trail alone is worth it for our SOC 2 audit." — CISO, fintech company

**ROI calculation (conservative):**

| Item | Assumption | Monthly value |
|------|-----------|---------------|
| Executive time saved | 1h/day × 5 execs × $200K avg comp × 250 days | $12,500/month |
| Faster incident resolution | 2 incidents/month × 30 min saved × $500/min downtime | $30,000/month |
| Prevented churn | 1 at-risk customer retained per quarter × average ACV | variable |

**ROI at 50-seat plan ($3,000/month):** Break-even in Week 1.

### Competitive positioning

| Competitor | FLOW advantage |
|-----------|---------------|
| Notion AI | FLOW acts — Notion answers. FLOW reads GitHub PRs, connects to Jira, executes approvals. |
| Glean | Glean searches. FLOW reasons, recommends, and executes within governed workflows. |
| ChatGPT Enterprise | No workspace context. FLOW knows YOUR GitHub, YOUR customers, YOUR incidents. |
| Datadog | Monitoring only. FLOW is operational intelligence across Engineering + Sales + Customers + HR. |
| Manual process | The comparison that wins every deal. "What's your current process for morning briefings?" |

### Discovery questions (for AEs)

1. "What's the first thing you read every morning to understand what happened overnight?"
2. "How long does it take to get a complete picture of your company's status?"
3. "When something goes wrong, how long before the right person knows?"
4. "What's your process for deciding which PR to review next?"
5. "How do you know which customer is about to churn?"
6. "What would you do with 2 extra hours per day?"

### Qualification criteria (MEDDIC)

**Metrics** (quantify the pain):
- Hours/week spent on context switching
- Number of incidents in the past 90 days
- Number of customers at renewal risk
- Sprint velocity vs. plan

**Economic Buyer**: CEO, CTO, or VP Operations with budget authority

**Decision Criteria**: 
- Connects to their specific tools (GitHub, Jira, Gmail — all supported)
- Data stays in their infrastructure
- SOC 2 Type II compliant
- Governance and approval workflows for autonomous actions

**Decision Process**: Usually: technical evaluation → security review → legal (DPA/MSA) → procurement

**Identify Champion**: Look for: "I want this for myself, not just my team"

**Pain**: At least one of: incident response too slow, customer churn surprise, PR review bottleneck, executive communication overhead

**Competition**: Most deals are competitive with "doing nothing" or "existing spreadsheet/Slack workflow"

---

## Support Readiness

### Common issues during pilot

**"I asked FLOW a question and the answer is wrong"**

1. Check when the last sync ran: `/settings/health`
2. Ask: "Is this information actually in any of your connected tools, or is it in a different system?"
3. If the source data exists but FLOW missed it: file a bug with the exact question + expected answer
4. If the source data doesn't exist in connected tools: this is expected — FLOW can only know what's connected

**"The Morning Briefing is empty"**

1. Check all connectors in `/integrations` — are any showing "Degraded"?
2. If GitHub is connected: did any commits happen yesterday?
3. If Gmail is connected: were there any emails?
4. Run a manual sync: POST to `/api/engineering/sync` and `/api/communication/sync`

**"An autonomous action failed"**

1. Check `/activity` for the error message
2. Most common causes: expired OAuth token, insufficient GitHub permissions, Jira ticket doesn't exist
3. Re-authorize the relevant connector at `/integrations`

**"Team member can't log in"**

1. Check they received the invitation email (check spam)
2. Try password reset
3. If workspace-id error: confirm they're using the correct FLOW URL

**Escalation path:**
- P1 (production down): page on-call → engineering response < 1 hour
- P2 (major feature broken): submit ticket → response < 4 hours
- P3 (minor issue): submit ticket → response < 24 hours
- P4 (question/feedback): submit via `/help` → response < 48 hours

---

## Deployment Readiness Checklist

Before sending the customer their credentials:

### Infrastructure
- [ ] Production server running and healthy (`/health` returns 200)
- [ ] PostgreSQL + pgvector extension installed
- [ ] Redis running and accessible
- [ ] SSL certificate valid (check with `openssl s_client -connect [your-url]:443`)
- [ ] Environment variables set (run `npm run validate-env`)
- [ ] Vault directory writable (check `VAULT_ROOT`)
- [ ] WebSocket authenticated (`WS_AUTH_REQUIRED=true` in production)

### Security
- [ ] JWT_SECRET is at least 32 chars, cryptographically random
- [ ] CORS_ORIGIN set to customer's specific domain (not `*`)
- [ ] `/dev-dashboard` returns 404 (NODE_ENV=production)
- [ ] Rate limiting enabled
- [ ] All admin endpoints require OWNER/ADMIN JWT

### Monitoring
- [ ] `/health/live` and `/health/ready` probes responding
- [ ] Metrics endpoint accessible at `/api/metrics` with METRICS_TOKEN
- [ ] Slow query logging enabled (SLOW_QUERY_MS=500)
- [ ] Error alerts configured (at least email for 5xx spikes)

### Backup
- [ ] Daily pg_dump scheduled
- [ ] Redis AOF or RDB backup configured
- [ ] Vault files backed up (if using local filesystem)
- [ ] Tested restore procedure at least once

### Customer readiness
- [ ] Customer technical contact knows how to reach support
- [ ] Customer admin account created and password set
- [ ] Day-1 onboarding call scheduled
- [ ] Pilot success criteria agreed in writing
