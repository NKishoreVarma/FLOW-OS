# Blueprint: Chief of Staff — `/chief`
**Document:** BP-06  
**Last updated:** 2026-07-18  
**Status:** Authoritative

---

## Purpose

Answer one question: **"What should I do next, and why?"**

Chief of Staff is FLOW's most direct surface — a prioritized agenda for the user's day. Every item is an executable recommendation. The page never shows information for its own sake; every card has an action path.

---

## Target User

**Primary:** CTO, VP Engineering, Manager/VP  
**Secondary:** Any user who needs a guided daily agenda  
**Frequency:** Start of day; between contexts during the day

---

## Entry Points

| Source | How |
|---|---|
| Sidebar | "Chief of Staff" item (INTELLIGENCE group, position 1) |
| `⌘K` → "Chief of Staff" | CommandPalette |
| Home hero primary action (in some states) | Redirects here |
| Direct URL | `/chief` |

---

## Layout Hierarchy

```
┌─────────────────────────────────────────────────────────────────┐
│ Sidebar (220px)                                                 │
├─────────────────────────────────────────────┬───────────────────┤
│                                             │                   │
│  Greeting (80px)                            │  LiveFeed         │
│  "Good morning, Rahul."                     │  (260px)          │
│  "3 items need your attention."             │                   │
│  ──────────────────────────────────────     │                   │
│  SectionLabel: NOW                          │                   │
│  ActionCard × 5 (max)                       │                   │
│  ──────────────────────────────────────     │                   │
│  SectionLabel: NEXT                         │                   │
│  ActionCard × 3 (max, collapsed default)    │                   │
│  ──────────────────────────────────────     │                   │
│  SectionLabel: LATER                        │                   │
│  TextList (no cards, awareness only)        │                   │
│                                             │                   │
│  [StickyCommandCenter]                      │                   │
└─────────────────────────────────────────────┴───────────────────┘
```

---

## Information Hierarchy

```
Level 1  Greeting — personalized opener + item count
Level 2  NOW (≤5 ActionCards) — composite ≥ 0.70
Level 3  NEXT (≤3 ActionCards, collapsed) — composite 0.40–0.69
Level 4  LATER (text list) — composite 0.15–0.39
Level 5  StickyCommandCenter
```

---

## Components

| Component | File | Notes |
|---|---|---|
| `ChiefOfStaff` | `components/autonomous/ChiefOfStaff.jsx` | Page orchestrator |
| `ActionCard` | `components/inbox/ActionCard.jsx` | Multi-option card with inline execution |
| `WeeklyReview` | `components/autonomous/WeeklyReview.jsx` | `/review` page (separate) |
| `RiskBadge` | `components/ui/RiskBadge.jsx` | On HIGH/CRITICAL action cards |
| `ExecutableActionCard` | `components/execution/ExecutableActionCard.jsx` | For execution-capable cards |
| `SkeletonCard` | variant `card` | Loading |

---

## Data Source

All cards come from `GET /api/autonomous/chief-of-staff`:

```js
{
  greeting: "Good morning, Rahul.",
  summary: "3 items need your attention. 1 is critical.",
  items: [
    {
      id: string,
      type: 'approval' | 'pr_review' | 'conflict' | 'prediction' | 'goal' | 'incident' | 'notification',
      source: string,        // connector name
      situation: string,     // 5–8 word title
      description: string,   // 2–3 sentences
      recommendation: string,// 1 sentence directive
      impact: 'critical' | 'high' | 'medium' | 'low',
      impactLabel: string,
      composite: number,     // 0–1 scoring
      priority: 'now' | 'next' | 'later',
      primaryAction: { label, workflowId, riskLevel },
      secondaryActions: [{ label, workflowId, riskLevel }],
      evidence: [{ source, text, at }],
      createdAt: string
    }
  ]
}
```

Refresh: on mount, then every 5 minutes. WebSocket `DECISION_UPDATED` triggers an immediate re-fetch.

---

## Greeting Block

```
Good morning, Rahul.
3 items need your attention.
```

- Font: `var(--font-display)`, size 28px, weight 400
- Summary line: `var(--font-ui)`, size 15px, color `var(--t2)`
- Greeting text from API. If `user.name` unavailable: `"Good morning."`
- Time-based: "Good morning" (before 12), "Good afternoon" (12–17), "Good evening" (after 17)
- Greeting block height: 80px, padding-bottom: 24px

---

## Section Labels

```
NOW
```

- Font: `var(--font-ui)`, size 11px, weight 600, letter-spacing 0.08em
- Color: `var(--t3)`
- `UPPERCASE`
- Spacing above section: 32px; spacing below label: 12px

---

## ActionCard Layout (Standard Variant)

```
┌─────────────────────────────────────────────────────────────┐
│  [source icon]  [impact badge: Critical/High/Medium/Low]    │
│  Situation title (16px, var(--t1), weight 500)              │
│  ─────────────────────────────────────────────              │
│  Description (14px, var(--t2), 2 lines max)                 │
│  ─────────────────────────────────────────────              │
│  RECOMMENDED                                                │
│  Recommendation text (14px, var(--t1), italic)              │
│  ─────────────────────────────────────────────              │
│  [Primary Action btn] [Option 2] [Option 3] [▶ Evidence]    │
│  [timestamp var(--t3) var(--font-data) 12px]                │
└─────────────────────────────────────────────────────────────┘
```

Card height: auto, min 120px.  
Card background: `var(--surface-1)`.  
Card border: 1px `var(--border)`.  
Border-radius: `var(--radius-md)`.  
Hover: `box-shadow: var(--elevation-1)`, transition 80ms.  
CRITICAL impact: left border 3px `var(--status-critical)`.  
HIGH impact: left border 2px `var(--accent)`.

---

## ActionCard State Machine

```
default → (click primary action) → confirming → executing → success | failed
                                             ↘ requires_approval → approval_pending → (resolved) → success | denied
```

**default:** Primary action button + secondary options visible.

**confirming (MEDIUM risk):** Primary button replaced with:
```
This will [what it does].
[Confirm]   [Cancel]
```

**executing:** Primary button shows spinner. Other buttons disabled. Text: `"Executing..."`.

**success:** Card turns green tint (bg `rgba(34,197,94,0.07)`). Text: `"Done. [outcome]."`  
Card collapses out of list after 3 seconds with animation.

**failed:** Card turns red tint. Text: `"Failed: [error from API]."` + `[Retry]` button.

**requires_approval:** Card shows: `"Waiting for [N] approval(s)."` + progress indicators.

**approval_pending:** Shows `"1 of 2 approvals received."` If user is an approver: shows `[Approve]` button.

**denied:** `"Not permitted: [policy reason]."` No retry.

---

## Multi-Option Actions

When a card has `secondaryActions.length > 0`:

Primary button renders as a split-button:
```
[Primary label ▾]
├── Option 2
└── Option 3
```

On dropdown open: options render below primary button. Each option shows its risk level badge. Selecting an option runs that workflow (same state machine as primary).

---

## Evidence Panel

Clicking `[▶ Evidence]` expands an inline EvidencePanel below the card:
```
▼ 3 sources
  Slack · "Marcus flagged this in #engineering"  · 2h ago
  GitHub · "PR #447: changes requested"          · 3h ago
  Jira · "Issue FLOW-142: blocked"               · 4h ago
```

EvidencePanel is always collapsed by default. Expand/collapse is animated (120ms ease-out height).

---

## NEXT Section (Collapsed Default)

NEXT section renders collapsed by default with a summary:

```
NEXT
[+] 3 items for later this week — expand  ← collapsed label
```

On expand (click or keyboard):
- 3 ActionCards render (compact variant, slightly reduced padding)
- Label changes to `[-] This week`

---

## LATER Section (Text Only)

```
LATER
· Security audit scheduled for Thursday
· Quarterly review preparation due Friday
· Team 1:1s — this week (all confirmed)
```

Plain text list. No cards, no actions. `color: var(--t3)`. Font 14px. Each bullet is one item's `situation` text. Not interactive.

---

## AI Behavior

### Card generation
`chiefOfStaffService.getChiefOfStaffBriefing(workspaceId, user)`:
- Reads pending approvals, notifications, predictions (risk ≥ 65%), failed executions, connector health warnings, incidents
- Scores each by composite formula
- Returns top 11 items (5 NOW + 3 NEXT + 3 LATER)
- No Gemini call — deterministic

### Recommendation text
Generated deterministically from item type + metadata. Not a Gemini call per item.

### Command Center suggestions
```
SUGGESTED:
  "What's the most important thing right now?"
  "What's blocking the team today?"
  "What's my biggest risk this week?"
  "Show me what to prepare for this afternoon"
```

When a card is focused:
```
ACTIVE CONTEXT: [situation]
SUGGESTED:
  "Why is this a priority?"
  "What happens if I don't act on this?"
  "Who else is involved?"
```

---

## Loading State

```
[Greeting skeleton: 80px block]
[Section label: NOW]
[Card 1 skeleton: 140px]
[Card 2 skeleton: 120px]
[Card 3 skeleton: 120px]
```

Shimmer. Max 8 seconds → demo fallback.

---

## Empty State

**No items (all composite < 0.15):**

```
[Shield icon, 40px, var(--t4)]

Your workspace is clear.
No priorities for today.

[What should I focus on?]  [Review predictions]  [Check this week's activity]
```

Chips pre-fill the StickyCommandCenter.

---

## Error State

API failure:
- `"Unable to load your priorities. Showing cached items."` — banner above cards
- Last successful response shown (localStorage cached, TTL 10 min)
- Retry button triggers re-fetch

---

## Success States

**All NOW cards resolved:**
```
[Section label: NOW]

Great — all done for now.
[What else should I do?]

[Section label: NEXT — now visible, uncollapsed]
```

---

## Navigation Paths

| From Chief of Staff | To |
|---|---|
| Evidence source link | External system (GitHub, Slack, etc.) — new tab |
| `[Ask FLOW about this]` | StickyCommandCenter with card context |
| LATER item (future: clickable) | Relevant system page |
| Approval card after execution | Shows approval-pending state in-place |

---

## Keyboard Shortcuts

| Key | Action |
|---|---|
| `↓` / `↑` | Navigate between cards (within NOW, then NEXT) |
| `Enter` | Open card detail / expand multi-option actions |
| `Space` | Execute primary action on focused card |
| `E` | Expand evidence panel on focused card |
| `D` | Dismiss focused card (mark as later) |
| `⌘/` | Focus StickyCommandCenter |
| `N` | Expand/collapse NEXT section |
| `Escape` | Collapse expanded card; deselect |

---

## Accessibility

- `<main>` with `aria-label="Chief of Staff"`
- `<section aria-label="Now — Priority Actions">`, `<section aria-label="Next">`, `<section aria-label="Later — Awareness">`
- ActionCard: `role="article"`, `tabindex="0"`, `aria-label="{situation}, {impact} priority"`
- Primary action buttons: `aria-describedby="{card-id}-rec"` (links to recommendation text)
- Card state changes: `aria-live="polite"` on status text ("Executing...", "Done.", "Failed:")
- Evidence panel: `aria-expanded="{bool}"`, `aria-controls="{card-id}-evidence"`
- LATER section: `role="list"`, `aria-label="Later this week"`

---

## Responsive Behavior

| Viewport | Behavior |
|---|---|
| ≥1280px | Content + LiveFeed |
| 1024px–1279px | Content only (LiveFeed closed) |
| 768px–1023px (tablet) | Single column; NEXT collapsed; LATER hidden |

---

## Telemetry Events

| Event | Trigger | Properties |
|---|---|---|
| `chief.viewed` | Page mount | `{ nowCount, nextCount, laterCount }` |
| `chief.card.action.clicked` | Primary or secondary action | `{ cardId, actionType, riskLevel, priority }` |
| `chief.card.dismissed` | Card dismissed | `{ cardId, cardType, priority }` |
| `chief.evidence.expanded` | Evidence panel opened | `{ cardId }` |
| `chief.next.expanded` | NEXT section expanded | `{}` |
| `chief.empty_state.viewed` | No NOW items | `{}` |
| `chief.action.success` | Execution succeeded | `{ cardId, actionType }` |
| `chief.action.failed` | Execution failed | `{ cardId, actionType, error }` |

---

## Acceptance Criteria

- [ ] Greeting text is time-appropriate (morning/afternoon/evening) and uses user's first name.
- [ ] NOW section shows maximum 5 cards sorted by composite score.
- [ ] NEXT section is collapsed by default; expand shows maximum 3 cards.
- [ ] LATER section is a plain text list with no cards or actions.
- [ ] CRITICAL impact cards have a 3px left border in `var(--status-critical)`.
- [ ] Multi-option actions render as a split-button dropdown.
- [ ] Card state machine transitions are correct: default → confirming (MEDIUM) → executing → success/failed.
- [ ] Evidence panel is collapsed by default and expands with correct animation.
- [ ] After all NOW cards are resolved, the empty NOW message renders.
- [ ] All keyboard shortcuts work.
- [ ] API failure shows cached data with an honest banner.
- [ ] All telemetry events fire at correct triggers.
