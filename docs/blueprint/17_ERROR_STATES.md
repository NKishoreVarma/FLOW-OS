# Blueprint: Error States — All Surfaces
**Document:** BP-17  
**Last updated:** 2026-07-18  
**Status:** Authoritative

---

## Design Principles

1. **Be honest, not technical.** Never show stack traces, raw error codes, or HTTP status codes in the UI.
2. **Give one action.** Every error has a recovery path. If no recovery is possible, say so clearly.
3. **Preserve what works.** Partial data renders; only the broken section shows an error.
4. **Never block the user.** If a feature fails, the rest of the application continues to work.
5. **Log, don't show.** Security-sensitive errors (auth failures, governance denials) give minimal UI copy. Full detail goes to the server-side audit log.

---

## Error Taxonomy

| Code | Name | User-visible | Recovery |
|---|---|---|---|
| E-01 | API failure (5xx) | "Something went wrong. [Retry]" | Retry |
| E-02 | Network offline | "Check your connection. [Retry]" | Retry |
| E-03 | Auth expired (401) | Auto-redirect to login | Login again |
| E-04 | Insufficient role (403) | "You don't have access to this." | Contact OWNER |
| E-05 | Governance DENY | "This action is not permitted." | View policy |
| E-06 | Governance REQUIRE_APPROVAL | "This requires approval." + approvalId | Wait or escalate |
| E-07 | Connector offline/DEGRADED | Banner in connector section | Check connector |
| E-08 | AI provider unavailable | "FLOW is running in limited mode. Analysis may be incomplete." | None — fallback active |
| E-09 | Rate limited (429) | "You're moving fast. Try again in a moment." | Wait and retry |
| E-10 | Not found (404) | "This page doesn't exist." | Go home |
| E-11 | Workspace not found | "This workspace is unavailable." | Contact OWNER |

---

## Error Display Patterns

### Inline Error (within a card, section, or panel)

Used when only part of the page fails:

```
[Error icon — 20px, var(--status-critical)]
[Error message — 13px, var(--t2)]
[Retry link — 13px, var(--accent), underline]
```

Example:
```
Unable to load pull requests. Retry →
```

### Page-Level Banner

Used when a major data source fails but the page partially renders:

```
┌────────────────────────────────────────────────────────────┐
│  ⚠  GitHub data is temporarily unavailable.                │
│     Showing the last successful data from 2h ago.  [Retry] │
└────────────────────────────────────────────────────────────┘
```

Position: sticky below PageHeader.  
Background: `rgba(var(--status-warning-rgb), 0.08)`.  
Border-left: 3px `var(--status-warning)`.

### Full-Page Error

Used when the entire page cannot load:

```
[Error icon — 40px, var(--t4)]

[Heading: "Something went wrong."]
[Subtext: specific description]

[Primary action button]
[Secondary: go home]
```

### Toast Notification (action errors)

Used for action execution failures:

```
[Toast — bottom right, 320px]
[✗ icon] Failed to merge PR #445.
         Permission denied.
[Retry]  [Dismiss]
```

Auto-dismisses after 6s. `[Dismiss]` clears immediately.

---

## API Failures (E-01)

### Page: Home

**WIC snapshot fails (5xx):**
```
[Banner above content]
⚠ Workspace data is temporarily unavailable.
Showing your last briefing. [Refresh →]
```
Last successful snapshot read from `localStorage['wic_snapshot_cache']` (TTL 10 min). If cache empty: empty state (see BP-15).

### Page: Inbox

**Approvals API fails:**
```
[Inline in approvals section]
Unable to load approval requests. [Retry]
```
Notifications and predictions still render (parallel fetch, isolated).

### Page: Engineering

**GitHub API fails:**
```
[Page-level banner]
⚠ GitHub is temporarily unavailable.
PR data may be stale. [Retry]
```

**GitHub rate limit hit (429):**
```
[Banner]
⚠ GitHub rate limit reached.
Showing cached data. Rate limit resets in 12 minutes.
```
Reads from `X-RateLimit-Reset` header.

### Page: Meetings

**Calendar API fails:**
```
[Banner]
⚠ Google Calendar is temporarily unavailable.
Showing cached meetings. [Retry]
```
Meeting list from last sync (`localStorage` or server-cached response).

### Page: Knowledge

**Graph API fails:**
```
[Inline in EntityStream]
Unable to load entities. [Retry]
```
Graph panel clears. EntityStream shows cached data if available.

### Page: Chief of Staff

**Chief of Staff API fails:**
```
[Banner above cards]
⚠ Unable to load your priorities.
Showing items from 8 minutes ago. [Refresh →]
```
Uses `localStorage['chief_cache']` (TTL 10 min).

### Page: People

**Graph API fails:**
```
[Full-page inline]
Unable to load team data. [Retry]
```
No partial render — data is too interconnected.

### Page: Customers

**CRM API fails:**
```
[Banner]
⚠ CRM data unavailable. Showing cached customer data.
[Retry]
```
If no cache: demo data with banner.

### Page: Executive Council

**Council request fails (all agents timeout):**
```
The Council was unable to complete analysis in time.
The workspace may need more connected data sources.
[Try again]  [Ask a single agent instead]
```

### Page: Activity

**Event feed fails:**
```
[Banner]
Activity feed unavailable. [Retry]
```
Last 100 events from cache if available.

### Settings — Audit

**Audit API fails:**
```
[Inline in table]
Unable to load audit log. [Retry]
```

---

## Network Offline (E-02)

Global handler. When `navigator.onLine` is false:

```
[Persistent banner at top of all pages]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ○ No internet connection. FLOW is showing cached data.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

When `navigator.onLine` returns true: banner auto-dismisses + background refresh.

---

## Authentication Errors (E-03)

**JWT expired (401 from any API call):**
```
[Toast]
Your session has expired. Signing you in again...
```
Auto-redirect to login page with `?returnTo={currentPath}`. On login success: redirect back.

**No JWT present (app loads without token):**
Redirect to login immediately. No error shown — this is normal.

---

## Authorization / Role Errors (E-04)

**Accessing a settings sub-page without the required role:**
```
[Full-page]

[Lock icon — 40px, var(--t4)]

You don't have access to this page.
This section requires the Admin or Owner role.

Contact {workspace OWNER name} to request access.

[Go home →]
```

**API returns 403 for a data endpoint (not governance):**
```
[Inline in the section]
You don't have permission to view this.
```

---

## Governance DENY (E-05)

**Action button triggers DENY:**
```
[Card error state]
Not permitted: [policy reason from API].

[View policy →]  → opens /settings/governance with the relevant policy highlighted
```

Toast (if action was initiated from a non-card surface):
```
[Toast]
[✗] Action denied: [policy name].
[View policy]  [Dismiss]
```

DENY decisions are **permanent for this request** — no retry button on the denied action itself. The user must escalate via governance.

---

## Governance REQUIRE_APPROVAL (E-06)

**Action triggers approval requirement:**

Card transitions to `requires_approval` state:
```
Waiting for approval.
[N] approval(s) required · approval ID: apr_xxxx

[Cancel request]
```

If the current user is an eligible approver:
```
Waiting for approval.
[N] approval(s) required

You can approve this:
[Approve]  [Reject]
```

Toast also fires:
```
[Toast]
Approval request sent. Waiting for [N] approval(s).
[View in Inbox →]
```

The approval card appears in `/inbox` for eligible approvers.

---

## Connector Offline / DEGRADED (E-07)

Connectors report `HEALTHY`, `DEGRADED`, or `DOWN`:

**DEGRADED (partial failure):**
```
[Section header of that connector's content]
⚠ GitHub connection is degraded.
Some data may be stale or incomplete.
```

**DOWN (complete failure):**
```
[Section header]
✗ GitHub is unavailable.
[Check connection status →]  → /settings/health
```

These appear inline in the sections that depend on that connector. Other connectors' sections are unaffected.

---

## AI Provider Unavailable (E-08)

**Gemini API down or key missing:**
```
[StickyCommandCenter response area]
FLOW is running in limited mode.
AI analysis is temporarily unavailable.
Questions will be answered with available data only.
```

The copilot still responds using the deterministic fallback in `ExecutiveSynthesisAgent`. The response is less rich but always present. No full failure.

**Council with AI unavailable:**
```
[Below DebatePanel]
Note: AI synthesis is unavailable. Agent findings are shown individually above.
```

---

## Rate Limited (E-09)

```
[Toast]
You're moving fast. Please wait a moment before trying again.
[Dismiss]
```

If the rate-limited action was governance-critical (approval action): also show:
```
[Banner]
⚠ Action throttled. Your request has been queued.
It will execute automatically in approximately 30 seconds.
```

---

## Not Found (E-10)

Route-level 404 (invalid URL):
```
[Full page]
[Compass icon — 40px, var(--t4)]

This page doesn't exist.

[← Go home]
```

Entity not found (`/entity/:id` with missing node):
```
[Inline in EntityContextPanel]
Entity not found. It may have been removed or renamed.
[← Back to Knowledge]
```

---

## Workspace Not Found (E-11)

When `workspace-id` header resolves to an unknown workspace:
```
[Full page]
[Building icon — 40px, var(--t4)]

This workspace is unavailable.
It may have been deleted or you may not have access.

[Contact your administrator]  [← Go home]
```

---

## Error Boundary (Global)

`ErrorBoundary.jsx` wraps the entire app. If an uncaught React error crashes a component tree:

```
[Full page]
[Warning icon — 40px, var(--t4)]

Something went wrong.
FLOW encountered an unexpected error.

[Reload the page]  [Report issue →]
```

`[Report issue →]` links to the GitHub issue tracker.

Error details are captured by the error boundary and sent to `POST /api/events/feed` with `type: ERROR` for observability.

---

## Acceptance Criteria

- [ ] No page shows a raw error code, stack trace, or HTTP status number in the UI.
- [ ] Every error state has at least one recovery action.
- [ ] API failures (5xx) show stale data with a banner rather than a blank page (when cache available).
- [ ] Auth expiry (401) auto-redirects to login with `returnTo` param.
- [ ] Role errors (403) show the "Contact owner" message, not a generic error.
- [ ] Governance DENY shows the policy reason and a `[View policy]` link.
- [ ] Governance REQUIRE_APPROVAL transitions the card to the correct state and fires a toast.
- [ ] AI unavailability degrades gracefully (deterministic fallback, no full failure).
- [ ] Network offline shows the persistent banner; auto-dismisses on reconnect.
- [ ] ErrorBoundary catches uncaught React errors and renders the fallback page.
- [ ] Partial page failures do not break other sections of the page.
