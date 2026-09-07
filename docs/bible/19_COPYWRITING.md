# FLOW OS — Copywriting
**Document:** 19 of 20  
**Status:** Authoritative  
**Last updated:** 2026-07-18

---

## Voice

FLOW's voice is the voice of a trusted Chief of Staff.

**Four qualities:**

**1. Authoritative.** FLOW speaks with confidence. It has read everything. It knows what matters. It does not qualify every statement with "it seems" or "I believe." It says what it knows.

**2. Brief.** Every word serves a purpose. If a sentence can be shorter without losing meaning, it must be shorter. Enterprise executives read at speed — they should be able to parse a FLOW message in 10 seconds and know exactly what to do.

**3. Specific.** FLOW names things. "PR #447 is blocking 3 engineers" not "there is a PR that may be causing delays." Specificity is respect. Vagueness wastes the user's time.

**4. Calm.** FLOW does not use alarm to make itself feel important. If a situation is critical, the facts communicate it. The language stays level.

---

## Tone Spectrum

FLOW adjusts tone based on context:

| Context | Tone | Example |
|---|---|---|
| Decision Stream / Chief of Staff | Direct, specific | "PR #447 is blocking 3 engineers." |
| Brain responses | Executive, narrative | "The engineering team is on track for Release 2.5, with one exception..." |
| Notifications | Actionable, brief | "Approval requested: merge PR #523 to production." |
| Error messages | Factual, helpful | "GitHub returned: branch protection requires 2 reviews." |
| Empty states | Honest, guiding | "No decisions pending. Your workspace is clear." |
| Onboarding | Warm, instructive | "Connect your first source to start building your workspace intelligence." |
| Success states | Confident, minimal | "PR #447 merged. Release 2.5 is unblocked." |
| Warning states | Direct, non-alarmist | "This action cannot be undone." |

---

## Page Labels

### Navigation Labels

These are the correct labels for all navigation items. Do not rename them.

| Label | Route | Notes |
|---|---|---|
| Home | `/` | Not "Dashboard" or "Overview" |
| Inbox | `/inbox` | Not "Notifications" or "Queue" |
| Engineering | `/projects` | Not "Projects" alone |
| Meetings | `/meetings` | Not "Calendar" |
| Knowledge | `/knowledge` | Not "Graph" or "Wiki" |
| Chief of Staff | `/chief` | Not "AI" or "Assistant" or "Daily" |
| Weekly Review | `/review` | Not "Reports" or "Weekly" |
| People | `/people` | Not "Team" or "Workforce" |
| Customers | `/customers` | Not "CRM" or "Accounts" |
| Executive Council | `/council` | Not "Agents" or "Overview" |
| Activity | `/activity` | Not "Log" or "History" (that's for brain) |
| Trust Center | `/integrations` | Not "Permissions" or "Settings" |
| Users & Roles | `/settings/iam` | Not "Identity" |
| AI Governance | `/settings/governance` | Not "Policies" |
| Audit Logs | `/settings/audit` | Not "Audit" alone |
| Security | `/settings/security` | |
| Workspace Health | `/settings/health` | |
| AI Brain | `/brain` | Not "Chat" or "Assistant" |
| Conversation History | `/brain/history` | |
| AI Memory | `/brain/memory` | |
| Preferences | `/brain/preferences` | |

### Section Labels

```
NOW             ← items requiring action today (Chief of Staff)
NEXT            ← items to handle this week
LATER           ← awareness only
ACTIVE CONTEXT  ← context chips in Brain
SUGGESTED       ← suggested prompts
FLOW CAN SEE    ← Trust Center included resources
FLOW CANNOT SEE ← Trust Center excluded resources
```

---

## Button Labels

### Action Buttons (verb first, specific)

Do not use generic labels. Every button says what will happen.

```
✓  [Approve PR #447]
✗  [Approve]

✓  [Merge via squash]
✗  [Merge]

✓  [Send to Sarah Chen]
✗  [Send]

✓  [Create Jira issue]
✗  [Create]

✓  [Schedule intro meeting]
✗  [Schedule]

✓  [Connect GitHub]
✗  [Connect]

✓  [Re-authenticate Google]
✗  [Reconnect]
```

### Navigation Buttons

```
[View prep]          ← Meeting detail
[View full PR]       ← Opens GitHub
[Show sources]       ← Evidence panel expand
[Ask FLOW about this] ← Opens brain with context
[Manage permissions] ← Trust Center
[See all]            ← Expand truncated list
[Load more]          ← Pagination
```

### Destructive Buttons

Always name what will be destroyed. Use Danger variant (red).

```
[Disconnect GitHub]       ← not "Disconnect"
[Delete workspace]        ← not "Delete"
[Revoke API key]          ← not "Revoke"
[Remove resource]         ← not "Remove"
[Clear conversation]      ← not "Clear"
[Delete all memory]       ← not "Reset"
```

---

## Notification Copy

### Format: [What happened] + [What to do] (optional)

```
✓  "PR #447 merged. Engineering team unblocked."
✓  "Approval requested: merge to production branch."
✓  "New escalation: Acme Corp — API latency."
✓  "1 of 2 approvals received. Awaiting second approver."
✓  "Prediction: sprint delay 83% likely next week."
✓  "Merge conflict detected in auth.js — 2 engineers affected."
✓  "GitHub sync failed. Re-authentication required."
```

```
✗  "You have a new notification."
✗  "Something happened with PR #447."
✗  "An approval was created for your action."
```

---

## Error Messages

### Principles

- Say what went wrong (specific)
- Say what to do (actionable)
- Never blame the user
- Never use technical error codes in user-facing messages unless necessary

**API errors:**
```
✓  "GitHub returned: branch protection requires 2 approving reviews."
✓  "Could not connect to Jira. Check your API token in Integrations."
✓  "Calendar sync failed. Re-authenticate Google Calendar."

✗  "Error 422: Unprocessable entity."
✗  "Something went wrong."
✗  "An unknown error occurred."
```

**Permission errors:**
```
✓  "This action is not permitted for your role. Contact your workspace admin."
✓  "AI Governance policy requires admin approval for this action."
✓  "This calendar is not included in Trust Center permissions."

✗  "Forbidden."
✗  "Access denied."
```

**Network errors:**
```
✓  "FLOW is offline. Showing cached intelligence."
✓  "Data is taking longer than expected. [Retry]"
✓  "Real-time connection lost. Reconnecting…"
```

---

## Empty States

Empty states are opportunities to guide the user. Never show a blank page.

```
Home (no decisions):
  "Your workspace is clear. No decisions pending today."
  [What should I focus on?]  [Review predictions]  [Ask FLOW anything]

Inbox (nothing pending):
  "All caught up. Nothing requires your attention."

Engineering (GitHub not connected):
  "Connect GitHub to surface PR and deployment intelligence."
  [Connect GitHub →]

Meetings (Calendar not connected):
  "Connect Google Calendar to see your schedule."
  [Connect Google Calendar →]

Knowledge (no data):
  "Start connecting sources to build your knowledge graph."
  [Go to Trust Center →]

Brain (pre-conversation):
  ACTIVE CONTEXT  [context chips]
  SUGGESTED       [4 prompt chips]
  (no text — just context and suggestions)

People (no predictions):
  "No workforce signals available. Connect HR systems to get started."

Customers (not connected):
  "Connect HubSpot or Salesforce to surface customer intelligence."
```

---

## Demo Mode Labels

When a page shows demo/fallback data, it must say so clearly. Never let the user mistake demo data for live data.

```
✓  "Showing sample data — connect GitHub to go live."
✓  "Demo mode · Connect Google Calendar for live data"
✓  "Sample data · No calendar connected"

✗  (no label — user thinks it's real)
✗  "Disconnected" (vague)
✗  "Preview mode" (unclear what this means)
```

---

## Time and Date Formatting

All dates and times in FLOW are displayed in natural language where possible.

```
Relative (recent):
  "2 minutes ago"
  "4 hours ago"
  "Yesterday at 3:15 PM"
  "Tuesday at 10:30 AM"

Absolute (older):
  "Jul 14, 2026"
  "Jul 14 at 10:30 AM"

Countdown (upcoming):
  "In 14 minutes"
  "In 3 hours"
  "Tomorrow at 9 AM"

Durations:
  "1h 14m" not "74 minutes"
  "3 days" not "72 hours"
```

Timestamps in `font-family: var(--font-data)` color `var(--t3)`.

---

## Numbers and Metrics

```
✓  "4 PRs" — always spelled out, not abbreviated
✓  "3 engineers" — not "3 people" (be specific)
✓  "$240K ARR" — financial values abbreviated above $10K
✓  "83%" — percentages to whole number unless decimals matter
✓  "~4.2 hours saved" — estimates with tilde prefix
✓  "1 of 2 approvals" — fractions for partial completion

✗  "A few PRs"
✗  "Some engineers"
✗  "Several hours"
✗  "Approximately 83.24%"
```

---

## What FLOW Never Says

These phrases are banned from all FLOW copy. Any occurrence in a UI string, AI response, or notification should be treated as a bug.

```
"I found N relevant records"     ← retrieval metadata
"Based on my analysis of..."     ← methodology
"As an AI language model..."     ← AI self-reference
"I believe..."                    ← hedging
"It seems like..."               ← hedging
"You might want to consider..."  ← weak recommendation
"Great question!"                ← filler
"Let me know if you need help!"  ← chatbot closing
"I'm not sure, but..."          ← uncertainty theater
"According to my training..."    ← AI self-reference
"Please note that..."            ← legal hedging
"Confidence: 87%"                ← raw score in UI
"Vector similarity: 0.84"        ← retrieval metadata
"Found in 14 document chunks"    ← retrieval metadata
```
