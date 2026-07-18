# Blueprint: Empty States — All Pages
**Document:** BP-15  
**Last updated:** 2026-07-18  
**Status:** Authoritative

---

## Design Principles

1. **Empty ≠ broken.** An empty state is an invitation — not a failure. Copy should be calm, not apologetic.
2. **Explain why it's empty.** Always give a reason: new workspace, no connection, no match.
3. **Give one action.** One primary action only. Never two competing paths.
4. **Use real data when possible.** If demo data can make the page functional, prefer demo data with a banner over a blank slate.
5. **Never show raw JSON, undefined, or NaN.** These are bugs, not empty states.

---

## Empty State Anatomy

```
[Icon — 40px, color: var(--t4)]

[Heading — 18px, var(--t1), weight 500]
[Subtext — 14px, var(--t2), max 2 lines]

[Primary action chip or button]
```

Icon size: always 40px.  
Icon color: always `var(--t4)` (lightest text).  
Heading: `var(--font-ui)`, 18px, weight 500.  
Subtext: `var(--font-ui)`, 14px, `var(--t2)`.

---

## Page: Home (`/`)

**State: New workspace, no WIC snapshot:**
```
[Sunrise icon]

Good morning.
FLOW is still building your workspace.

[Check back in a minute]
```

**State: Snapshot available but all items scored < 0.15 (all clear):**
```
[Shield icon]

Your workspace is clear.
No priorities today.

[Review last week →]  [Ask FLOW what to focus on]
```

**State: WIC returned `status: building` (cold miss):**
```
[Hourglass icon]

Setting up your morning briefing...
This usually takes less than a minute.

[Refresh]
```

---

## Page: Inbox (`/inbox`)

**State: No items in queue:**
```
[Inbox tray icon]

Inbox zero.
Everything is handled.

[Review past actions →]
```

**State: No approvals (approvals filter active):**
```
[Checkmark icon]

No pending approvals.
All approval requests have been resolved.

[View approval history →]
```

**State: No emails (email filter active):**
```
[Email icon]

No emails.
Connect Gmail to surface email in your inbox.

[Connect Gmail →]
```

**State: No alerts:**
```
[Bell icon]

No alerts.
Your systems are healthy.
```

---

## Page: Engineering (`/projects`)

**State: GitHub not connected:**
```
[Git branch icon]

Connect GitHub to see your engineering intelligence.
Pull requests, deployments, and merge readiness — all in one place.

[Connect GitHub →]
```

**State: Connected but no repositories found:**
```
[Repository icon]

No repositories found.
Your GitHub account is connected but no repos are accessible.

[Check GitHub permissions →]
```

**State: No at-risk PRs:**
```
[Checkmark icon]

No pull requests at risk.
All PRs are on track.
```
(The rest of the page — commit history, deploy timeline — still renders.)

---

## Page: Meetings (`/meetings`)

**State: Google Calendar not connected:**
```
[Calendar icon]

Connect Google Calendar to surface your meetings.
Meeting prep, action items, and follow-ups — all here.

[Connect Calendar →]
```

**State: No upcoming meetings:**
```
[Calendar icon]

No upcoming meetings.
Your next 7 days are clear.
```

**State: No past meetings in range:**
```
[Calendar icon]

No meetings in this date range.
[Expand range →]
```

---

## Page: Knowledge (`/knowledge`)

**State: Graph is empty (no connected sources):**
```
[Graph icon]

Your knowledge graph is empty.
Connect sources and sync to build your company's Digital Twin.

[Go to Trust Center →]
```

**State: Search returns no results:**
```
No entities match "{query}".

[Clear search]  [Ask FLOW about "{query}"]
```

**State: Entity has no connections:**
```
[entity name] has no recorded connections yet.
Connections are built automatically as FLOW processes activity.
```

---

## Page: Chief of Staff (`/chief`)

**State: All items scored < 0.15:**
```
[Shield icon]

Your workspace is clear.
No priorities for today.

[What should I focus on?]
[Review predictions]
[Check this week's activity]
```

(Chips pre-fill the StickyCommandCenter.)

**State: All NOW cards resolved:**
```
[Checkmark icon]

All done for now.
NEXT items are now visible below.
```
(NEXT section auto-expands.)

---

## Page: People (`/people`)

**State: No workforce data:**
```
[People icon]

No workforce data available.
Connect GitHub or Jira to build your team intelligence.

[Go to Trust Center →]
```

**State: Search returns no results:**
```
No people match "{query}".

[Clear search]
```

**State: No overloaded team members:**
```
[Checkmark icon]

No workload alerts.
All team members are within normal capacity.
```
(Panel renders with "Normal" status on all bars.)

---

## Page: Customers (`/customers`)

**State: No CRM connected:**
```
[Building icon]

No customer data available.
Connect HubSpot or Salesforce to surface customer intelligence.

[Connect CRM →]
```

**State: No at-risk customers:**
```
[Checkmark icon]

No at-risk customers.
All accounts are healthy.
```
(Health grid and renewal timeline still render.)

**State: No renewals in 90-day window:**
```
No renewals in the next 90 days.
```
(Section not rendered — collapses entirely.)

---

## Page: Executive Council (`/council`)

**State: Before any question asked:**
```
[6 health cards — always rendered]

[AskCouncilInput]
What would you like the Council to analyze?

SUGGESTED QUESTIONS:
  [Should we postpone Release 2.5?]
  [What's the biggest risk to this quarter?]
  [Is the team ready to hire?]
```

(This is the default view, not a "true" empty state.)

---

## Page: Activity (`/activity`)

**State: No events match filter:**
```
[Calendar icon]

No events match this filter.
Try a wider date range or fewer filters.

[Clear filters]
```

**State: No events at all (new workspace):**
```
[Activity icon]

No activity yet.
FLOW starts recording events as soon as you connect sources.

[Go to Trust Center →]
```

---

## Settings Sub-Pages

**IAM — No team members besides self:**
```
[People icon]

You're the only one here.
Invite your team to get more out of FLOW.

[Invite a team member →]
```

**Governance — No policies:**
```
[Shield icon]

No governance policies.
FLOW runs with default role-based permissions.

[Create your first policy →]
```

**Audit — No log entries:**
```
[Log icon]

No audit entries yet.
Actions will appear here as FLOW executes work.
```

**Audit — No entries match filter:**
```
No entries match this filter.

[Clear filters]
```

---

## Panel-Level Empty States

**EventDetailPanel — Entity has no activity:**
```
No recent activity for {entity name}.
```

**CustomerDetailPanel — No health signals:**
```
No health signals recorded.
Connect your CRM to surface customer health data.
```

**PersonDetailPanel — No activity data:**
```
No activity data for {name}.
FLOW builds person context from GitHub, Jira, and Slack activity.
```

**AgentResponseCard — Agent timed out:**
```
{Agent name} did not respond in time.
```
(Greyed out card; synthesis proceeds with remaining agents.)

---

## Replay / Simulation / Predictions

**Replay — No events in date range:**
```
[Activity icon]

No events in this date range.
Try a wider range or a different mode.

[Expand to last 30 days]
```

**Simulation — No entity found:**
```
Unable to find "{entity name}" in your knowledge graph.
Make sure the name is spelled correctly or try an entity ID.
```

**Predictions — Insufficient data:**
```
[Chart icon]

Not enough data to generate predictions.
Connect more sources or let FLOW process more activity.
Predictions improve over time.
```

---

## Onboarding (Step-Specific Empty States)

**Step 2 Discover — No connectors connected yet:**
```
[Connect at least one source to continue.]
Or try with demo data →
```

**Step 3 Permissions — Nothing to configure:**
```
Nothing to configure yet.
You haven't connected any sources.

[← Go back and connect sources]  [Continue with demo mode]
```

---

## Success Dashboard (`/success`)

**State: No usage data (new workspace):**
```
[Chart icon]

No usage data yet.
This dashboard updates as your team uses FLOW.

[Load Demo Company →]
```

---

## Global Fallback (Unknown Empty)

When a component renders with no data and no specific empty state is defined:

```
[No data available]
```

`var(--t3)`, 14px, centered. This is the absolute minimum and should be treated as a bug — every surface should have a specific empty state.

---

## Implementation Notes

- Empty states are **not shown during loading** — use skeleton states (see BP-16) until data resolves.
- The 8-second timeout rule: if data has not loaded in 8 seconds, show the demo fallback with a `"Showing sample data — connect X to go live"` banner (not the empty state).
- Action chips in empty states pre-fill the StickyCommandCenter or navigate — never open a modal unless a connection flow is needed.
- Copy never uses "Oops", "Uh oh", "Nothing here", or "Something went wrong" — these are calm, informational, and clear.
