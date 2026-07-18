# Blueprint: Inbox — `/inbox`
**Document:** BP-02  
**Last updated:** 2026-07-18  
**Status:** Authoritative

---

## Purpose

Answer one question: **"What is waiting for me across every channel?"**

Inbox is the unified queue of items requiring attention — emails, approvals, notifications, escalations, and AI-surfaced communications — all normalized into a single prioritized list. It is not a raw message reader. It is an AI-curated action queue.

---

## Target User

**Primary:** CTO, Manager/VP, Senior Engineer  
**Secondary:** All users with pending approvals or escalations  
**Frequency:** Multiple times per day; often the second stop after Home

---

## Entry Points

| Source | How |
|---|---|
| Sidebar | "Inbox" item (PRIMARY group, position 2); shows unread badge count |
| `⌘K` → "Go to Inbox" | CommandPalette |
| `⌘I` | Global shortcut |
| Notification click | Any `NOTIFICATION_CREATED` WS event → opens Inbox at the relevant item |
| NotificationDropdown | Bell icon → "View all" → `/inbox` |
| Direct URL | `/inbox` |

---

## Layout Hierarchy

```
┌────────────────────────────────────────────────────────────────┐
│ Sidebar (220px)                                                │
├──────────────────────────────────────────┬─────────────────────┤
│                                          │                     │
│  InboxHeader (60px)                      │  ItemDetailPanel    │
│  [Inbox]  [N pending]  [Mark all read]   │  (420px right)      │
│  ──────────────────────────────────────  │  Opens on item      │
│  FilterBar (40px)                        │  click; replaces    │
│  [All ▾] [Approvals] [Emails] [Alerts]   │  LiveFeed on this   │
│  ──────────────────────────────────────  │  page               │
│  InboxList                               │                     │
│  ├── [Pinned/Urgent section]             │                     │
│  ├── Item rows (compact, scrollable)     │                     │
│  └── Load more (pagination, not scroll)  │                     │
│                                          │                     │
│  [StickyCommandCenter — bottom bar]      │                     │
└──────────────────────────────────────────┴─────────────────────┘
```

**No LiveFeed on Inbox** — the ItemDetailPanel occupies the right column when an item is selected. LiveFeed is not shown on this page.

---

## Information Hierarchy

```
Level 1  InboxHeader — count of pending items + bulk action
Level 2  FilterBar — type filters (All / Approvals / Emails / Alerts / Mentions)
Level 3  Pinned/Urgent — items with impact=critical (always at top regardless of filter)
Level 4  Inbox list — all other items, sorted by composite score descending
Level 5  ItemDetailPanel — right panel for selected item
Level 6  StickyCommandCenter — always-present
```

---

## Components

| Component | File | Notes |
|---|---|---|
| `InboxList` | `components/inbox/OperationalInbox.jsx` | Container for all inbox rows |
| `InboxItem` | `components/inbox/ActionCard.jsx` | Compact row variant |
| `ItemDetailPanel` | `components/inbox/AIInbox.jsx` | Right panel (replaces LiveFeed) |
| `FilterBar` | Inline in `OperationalInbox.jsx` | Chip-style filters |
| `ApprovalCard` | `components/workfeed/ApprovalCard.jsx` | For `type: 'approval'` items |
| `RiskBadge` | `components/ui/RiskBadge.jsx` | On HIGH/CRITICAL approvals |
| `NotificationDropdown` | `components/notifications/NotificationDropdown.jsx` | In Header |
| `SkeletonCard` | variant `row` | Loading state |

---

## Item Types and Sources

| Type | Source API | Icon | Can execute? |
|---|---|---|---|
| `approval` | `GET /api/approvals?status=pending` | Shield | Yes — approve/reject |
| `email` | `GET /api/communication/inbox` | Mail | Yes — reply/archive/forward |
| `alert` | `GET /api/notifications` | Bell | Yes — dismiss/act |
| `prediction` | `GET /api/predictions/run` | Trend | Yes — acknowledge/act |
| `incident` | WebSocket `INCIDENT_CREATED` | Warning | Yes — acknowledge |
| `mention` | Slack/email mention surface | At | Yes — reply |
| `decision_needed` | `GET /api/brain/recommendations` | Checkmark | Yes — decide |

**Normalization:** All item types are normalized to the `ActionCard` shape before rendering:
```js
{
  id, type, source, situation, description, recommendation,
  impact: 'critical' | 'high' | 'medium' | 'low',
  impactLabel,          // "Blocking 3 engineers"
  primaryAction: { label, riskLevel },
  secondaryActions: [],
  evidence: [],
  isRead: boolean,
  isPinned: boolean,
  createdAt
}
```

---

## Data Sources

| Data | Source | Refresh |
|---|---|---|
| Approval items | `GET /api/approvals?status=pending` | On mount |
| Email items | `GET /api/communication/inbox?limit=20` | On mount |
| Notifications | `GET /api/notifications?unread=true` | On mount |
| Predictions (action-needed) | `GET /api/predictions/run?domain=all` | On mount |
| Real-time additions | WebSocket `NOTIFICATION_CREATED`, `INCIDENT_CREATED` | Streaming |

All fetches are parallelized with `Promise.allSettled()`. Failed sources are skipped silently — a failed email fetch does not prevent approvals from rendering.

---

## Primary Action

**"Process the top item"** — clicking the primary action button on the highest-priority Pinned/Urgent item.

The button label is the item's `primaryAction.label` (e.g., `"Approve PR #523 merge"` or `"Reply to Acme escalation"`).

---

## Secondary Actions

- Click item row → open ItemDetailPanel
- Filter buttons → filter list by type (no page reload, client-side)
- Mark all as read → `PATCH /api/notifications/read-all`
- Dismiss a notification → `PATCH /api/notifications/:id/dismiss`
- Archive an email → calls `GmailAdapter` via `POST /api/communication/label/:id` with `action: 'archive'`
- Star email → `action: 'star'`
- Reply from ItemDetailPanel → `POST /api/communication/reply/:messageId`
- Approve from ItemDetailPanel → `POST /api/approvals/:id/approve`
- Reject from ItemDetailPanel → `POST /api/approvals/:id/reject`

---

## Filter Bar Behavior

| Filter | Items shown |
|---|---|
| All (default) | Everything sorted by composite score |
| Approvals | `type: 'approval'` only |
| Emails | `type: 'email'` only |
| Alerts | `type: 'alert'` + `type: 'incident'` |
| Mentions | `type: 'mention'` |

Active filter chip: filled background `var(--accent)`, text `var(--surface-0)`.  
Inactive: border `var(--border)`, text `var(--t2)`.

Filter state is preserved in the URL query string: `/inbox?filter=approvals`. Browser back restores the filter.

---

## Item Row Layout

```
[source icon] [impact badge]  Situation text (truncated to 1 line)
              [type chip]      Description preview (1 line, var(--t3))
                               [primaryAction.label btn]   [time]
```

- Unread items: background `var(--surface-1)`, left border 2px `var(--accent)`
- Read items: background transparent
- CRITICAL impact: left border 2px `var(--status-critical)`
- Row height: 72px fixed
- Hover: background `var(--hover-bg)`, transition 80ms

---

## ItemDetailPanel Behavior

Slides in from the right (200ms ease-out `transform: translateX`) when an item row is clicked.

Panel content varies by item type:

**For `approval`:**
```
[Close ×]   Approval Request
─────────────────────────────
ACTION: Merge PR #523 to main
RISK: HIGH (requires 1 admin approval)
REQUESTED BY: Rahul Kumar • 2h ago
─────────────────────────────
WHAT THIS DOES
[description of the action]
─────────────────────────────
RELATED
[PR detail card: title, merge readiness, reviewers]
─────────────────────────────
[Approve]   [Reject]   [Ask FLOW about this]
```

**For `email`:**
```
[Close ×]   [Subject line]
─────────────────────────────
FROM: Name <email>   TIME: relative timestamp
─────────────────────────────
[Email body — rendered as text, no HTML execution]
─────────────────────────────
AI SUMMARY: [1–2 sentence FLOW summary]
RECOMMENDED: [Reply / Archive / Forward]
─────────────────────────────
[Reply]   [Archive]   [Forward]   [Ask FLOW about this]
```

**For `alert` / `incident`:**
```
[Close ×]   [Alert title]
─────────────────────────────
SEVERITY: Critical / High / Medium
SOURCE: Connector or system that generated it
─────────────────────────────
[description]
─────────────────────────────
EVIDENCE: [EvidencePanel collapsed]
─────────────────────────────
[Take action]   [Acknowledge]   [Ask FLOW about this]
```

---

## AI Behavior

### AI Summary
Every email and alert in the ItemDetailPanel includes an AI-generated 1–2 sentence summary. Generated by `POST /api/brain/copilot` with the content as context, cached for 5 minutes. Never shown as loading — if not ready, summary panel is hidden (not a spinner).

### AI Recommendation
Each item carries a `recommendation` string from the decision engine. Shown as:  
`RECOMMENDED: [text]` in a muted treatment above the action buttons.

### Command Center context
When an item is selected and the StickyCommandCenter is focused, the item's context is automatically injected:  
`ACTIVE CONTEXT: [item situation]`

---

## Command Center Behavior

Page-specific suggestions when no item is selected:
```
SUGGESTED:
  "What approvals are waiting for me?"
  "Summarize my unread emails"
  "What's the most urgent item in my inbox?"
  "Show me only critical alerts"
```

When an item is selected in ItemDetailPanel, context changes to that item:
```
ACTIVE CONTEXT: Approval — Merge PR #523 to main
SUGGESTED:
  "Should I approve this?"
  "What's the risk of merging this PR?"
  "Who else reviewed this?"
```

---

## Loading State

```
[InboxHeader skeleton: ████████ (40px)]
[FilterBar skeleton: 4 chip outlines]
Row 1: [circle] [████████████████] [████]
Row 2: [circle] [████████████] [████████]
Row 3: [circle] [████████████████████] [██]
Row 4: [circle] [██████████████] [████████]
Row 5: [circle] [████████████████] [██████]
```

Shimmer animation. Max 8 seconds before demo fallback.

---

## Empty State

**When all filters yield zero items:**

```
         [Inbox icon, 40px, var(--t4)]

         All caught up.
         Nothing requires your attention.

         [What should I focus on?]   [Review this week's activity]
```

**When a specific filter yields zero items:**
```
No [filter name] items.
[Clear filter]  ← resets to "All"
```

---

## Error State

- Parallel fetch failures are silenced per-source. A banner shows: `"Some sources are unavailable. Showing partial inbox."` (non-blocking, dismissible)
- Full failure (all sources fail): demo fallback renders with `"Unable to load inbox. Showing sample data."`
- Individual item action failure: FlowToast `"Action failed: [error from API]"` — item state reverts

---

## Success State

After an approval is approved:
- ItemDetailPanel updates to show `"Approved. Action is executing."` with a loading state
- On `ExecutionRecord EXECUTED`: panel shows `"Merged. PR #523 is now on main."` (green check)
- Item row transitions to `success` state (green tint, 3 seconds), then animates out of list
- FlowToast: `"PR #523 merged."` (5 seconds)

After an email is archived:
- Item row animates out (opacity 0 + height 0, 200ms)
- ItemDetailPanel closes
- FlowToast: `"Archived."` (3 seconds)

---

## Unread Badge

- Sidebar "Inbox" item shows a badge with the count of unread items
- Badge max display: `99+` for counts > 99
- Badge updates in real-time via WebSocket `NOTIFICATION_CREATED`
- Badge clears when the item is opened (marked read on `GET` of item)
- Badge uses `var(--accent)` background, `var(--surface-0)` text

---

## Keyboard Shortcuts

| Key | Action |
|---|---|
| `⌘I` | Go to Inbox (global) |
| `↓` / `↑` | Navigate between item rows |
| `Enter` | Open ItemDetailPanel for focused item |
| `A` | Approve focused approval item |
| `R` | Reject focused approval item |
| `E` | Archive focused email item |
| `M` | Mark focused item as read/unread |
| `Escape` | Close ItemDetailPanel; deselect item |
| `1–5` | Quick-filter (1=All, 2=Approvals, 3=Emails, 4=Alerts, 5=Mentions) |
| `⌘/` | Focus StickyCommandCenter |

---

## Accessibility

- `<main>` contains the InboxList; `role="feed"` on the list
- Each inbox row: `role="article"`, `aria-label="{situation}"`, `aria-describedby="{id}-desc"`
- Unread items: `aria-label="Unread: {situation}"`
- ItemDetailPanel: `role="complementary"`, `aria-label="Item detail"`, focus moves to first action button on open
- Filter buttons: `role="tab"`, `aria-selected`, `aria-controls="inbox-list"`
- Unread count badge: `aria-label="{N} unread items"`
- Live count updates: `aria-live="polite"` on the header count

---

## Responsive Behavior

| Viewport | Behavior |
|---|---|
| ≥1280px | 2-column: list left, ItemDetailPanel right |
| 1024px–1279px | 2-column with narrower panel (340px) |
| 768px–1023px (tablet) | Single column; ItemDetailPanel slides full-width from right |
| <768px | Not supported v1 |

---

## Telemetry Events

| Event | Trigger | Properties |
|---|---|---|
| `inbox.viewed` | Page mount | `{ totalCount, approvalCount, emailCount, alertCount }` |
| `inbox.item.selected` | Item row click | `{ itemId, itemType, impact, isRead }` |
| `inbox.item.action` | Action button clicked | `{ itemId, itemType, action, riskLevel }` |
| `inbox.filter.changed` | Filter chip clicked | `{ filter, resultCount }` |
| `inbox.mark_all_read` | Mark all read clicked | `{ count }` |
| `inbox.empty_state.viewed` | Empty state renders | `{ filter }` |
| `inbox.ai_summary.viewed` | AI summary shown in detail panel | `{ itemType }` |

---

## Acceptance Criteria

- [ ] All item types (approvals, emails, alerts, predictions) render in a unified normalized list.
- [ ] Items sorted by composite score; CRITICAL items pinned to top regardless of filter.
- [ ] Filter chips work client-side without a page reload; state preserved in URL query string.
- [ ] ItemDetailPanel opens with 200ms slide animation; closes on Escape or `×` click.
- [ ] Approval approve/reject calls the correct API and updates item state.
- [ ] Email archive/reply calls the correct API via GmailAdapter.
- [ ] Unread badge in sidebar updates in real-time via WebSocket.
- [ ] Parallel API failures per source are silent; partial inbox renders with a banner.
- [ ] Empty state (all items) and per-filter empty state both render correctly.
- [ ] After 8 seconds loading, demo fallback renders with an honest label.
- [ ] All keyboard shortcuts work.
- [ ] Focus moves to ItemDetailPanel first action on open; returns to row on close.
