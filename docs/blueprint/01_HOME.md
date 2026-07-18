# Blueprint: Home — `/`
**Document:** BP-01  
**Last updated:** 2026-07-18  
**Status:** Authoritative

---

## Purpose

Answer one question: **"What do I need to do right now?"**

Home is the Morning Brief. It is the first thing a user sees when they open FLOW. It surfaces the 3–5 highest-priority items across the entire workspace and offers an immediate action on each one. It does not ask the user to configure anything, navigate anywhere, or read through a dashboard.

---

## Target User

**Primary:** CTO, VP Engineering, Manager  
**Secondary:** Senior Engineers on high-severity items  
**Frequency:** Every session (the user lands here on every login)

---

## Entry Points

| Source | How |
|---|---|
| Login redirect | After successful auth → `/` |
| Sidebar | "Home" item (PRIMARY group, position 1) |
| `⌘K` → "Go to Home" | CommandPalette NAV_COMMANDS |
| Direct URL | `/` |
| Browser back | Returns here from any primary page |

---

## Layout Hierarchy

```
┌─────────────────────────────────────────────────────────────────┐
│ Sidebar (220px fixed left)                                      │
├──────────────────────────────────────────────────┬──────────────┤
│                                                  │  LiveFeed   │
│  ExecutiveHero (140px fixed top)                 │  Panel      │
│  ─────────────────────────────────────────────   │  (260px     │
│                                                  │  toggleable)│
│  DecisionStream                                  │             │
│  ├── NOW section (≤5 cards)                      │             │
│  ├── NEXT section (≤3 cards, collapsed default)  │             │
│  └── LATER section (text-only, no cards)         │             │
│                                                  │             │
│  [StickyCommandCenter — bottom bar, full width]  │             │
└──────────────────────────────────────────────────┴──────────────┘
```

**Column widths:**
- Sidebar: 220px, fixed, never collapses
- Content: `calc(100vw - 220px - 260px)` when LiveFeed open; `calc(100vw - 220px)` when closed
- LiveFeed: 260px, fixed right, default open ≥1280px, closed <1280px

---

## Information Hierarchy

```
Level 1  ExecutiveHero — workspace status in one sentence
Level 2  NOW cards — items requiring action today (ranked, max 5)
Level 3  NEXT cards — items to handle this week (collapsed, max 3)
Level 4  LATER — text list only, no interaction required
Level 5  StickyCommandCenter — always-present AI input
```

Items at each level are ranked by the composite score:
```
composite = (urgency × 0.35) + (businessImpact × 0.30) + (authorityWeight × 0.15) + (predictionSignal × 0.10) + (memorySignal × 0.10)
```
NOW threshold: ≥ 0.7 · NEXT: 0.4–0.69 · LATER: 0.15–0.39 · Omitted: < 0.15

---

## Components

| Component | File | Notes |
|---|---|---|
| `ExecutiveHero` | `components/decisions/ExecutiveHero.jsx` | Status dot + situation text + primary action button |
| `DecisionStream` | `components/decisions/DecisionStream.jsx` | Ordered NOW/NEXT/LATER list |
| `DecisionCard` | `components/decisions/DecisionCard.jsx` | Compact variant on Home |
| `DecisionSlideOver` | `components/decisions/DecisionSlideOver.jsx` | Opens on card click |
| `EvidencePanel` | `components/decisions/EvidencePanel.jsx` | Inside DecisionSlideOver, collapsed |
| `ActionBar` | `components/decisions/ActionBar.jsx` | Inside DecisionSlideOver |
| `RiskBadge` | `components/ui/RiskBadge.jsx` | On HIGH/CRITICAL cards |
| `SkeletonCard` | `components/ui/Skeleton.jsx` | During initial load |
| `StickyCommandCenter` | `components/command/StickyCommandCenter.jsx` | Bottom bar |
| `LiveFeedPanel` | `components/layout/LiveFeedPanel.jsx` | Right column |

---

## Data Sources

| Data | Source | Refresh |
|---|---|---|
| Workspace snapshot (hero text, priority) | `GET /api/workspace/snapshot` | On mount; re-fetch every 5 min |
| Decision cards (NOW/NEXT/LATER) | `GET /api/autonomous/chief-of-staff` | On mount; WebSocket `DECISION_UPDATED` |
| Live feed events | WebSocket `wic` + `event` bus | Real-time |

**Data shape expected from `/api/autonomous/chief-of-staff`:**
```js
{
  greeting: string,         // "Good morning, Rahul."
  workspaceStatus: string,  // "3 items need your attention."
  items: [{
    id, type, source, situation, description, recommendation,
    impact, impactLabel, primaryAction, secondaryActions,
    evidence, priority, composite, createdAt
  }]
}
```

---

## Primary Action

**"Handle the top item"** — clicking the primary button on the topmost NOW card.

The ExecutiveHero primary action button label matches the topmost NOW card's `primaryAction.label`. On click: opens the DecisionSlideOver for that card.

---

## Secondary Actions

- Click any card → open DecisionSlideOver
- Click evidence `▶ N sources` → expand EvidencePanel
- Press `⌘J` → open AI context for the current card
- Dismiss a card → `PATCH /api/notifications/:id/dismiss`
- Expand NEXT section → shows 3 NEXT cards
- Toggle LiveFeed → `⌘\`

---

## AI Behavior

### ExecutiveHero text
Generated by the Workspace Intelligence Cache (`/api/workspace/snapshot`). Not a live AI call — cached snapshot built ≤150ms from predictions, health score, and execution history.

**Format:**
```
[Status dot: critical/warning/nominal]  [Situation: "3 approvals waiting · 1 merge conflict"]
                                         [Priority: "PR #447 is blocking Release 2.5"]
                                         [Primary Action Button]
```

### Decision cards
Cards are generated by `chiefOfStaffService.getChiefOfStaffBriefing()`. Each card's `recommendation` is a 1-sentence executive directive. Evidence panel contains source citations.

### Brain (via StickyCommandCenter)
Typing a question routes to `/api/brain/copilot` (streaming). The response opens inline in the StickyCommandCenter (Focused → Inline Response state).

---

## Command Center Behavior

The StickyCommandCenter on this page shows **Home-specific suggestions**:

```
SUGGESTED:
  "What should I prioritize today?"
  "What's blocking the release?"
  "Show me pending approvals"
  "What happened overnight?"
```

Rotating placeholders cycle every 4 seconds.

---

## Loading State

**Initial load (skeleton phase — ≤1.5s expected):**

```
ExecutiveHero:  [████████████████████] [██████████] [Button skeleton]
                [████████████████]

Card 1:  [██████] [████████████████████] [█████]
Card 2:  [██████] [████████████████] [████████]
Card 3:  [██████] [████████████████████████] [██████]
```

- Use `SkeletonCard` component, variant `card`
- Shimmer animation plays for up to 8 seconds
- After 8 seconds: render demo fallback data with label `"Showing sample data — connect sources to go live."`
- Do NOT show a spinner

---

## Empty State

**When workspace has no items (composite < 0.15 for all):**

```
ExecutiveHero:  [nominal dot]  Your workspace is clear.
                               No decisions pending today.

                [What should I focus on?]  [Review predictions]  [Ask FLOW anything]
```

- Three action chips (not buttons) open the StickyCommandCenter with pre-filled queries
- No cards rendered
- LATER section hidden
- LiveFeed panel remains active

---

## Error State

**When `/api/autonomous/chief-of-staff` returns 5xx or times out:**

- ExecutiveHero renders with `status: 'nominal'` and text: `"Showing cached intelligence."`
- Demo fallback cards render with label at top: `"Unable to reach FLOW services. Showing last known state."`
- StickyCommandCenter remains functional
- Retry button in hero: `[Refresh]` — triggers re-fetch without full reload

---

## Success State

**After a primary action completes (ExecutionRecord created):**

- The card transitions to `success` state: green check icon, `"PR #447 merged. Release 2.5 is unblocked."`
- Card collapses out of NOW list with a 200ms ease-out opacity + height animation
- The next card in the list slides up to fill the position
- The ExecutiveHero updates (re-fetch `/api/workspace/snapshot`)
- A FlowToast appears: `"Done. PR #447 merged."` (5 seconds, top-right)

---

## Navigation Paths

| From Home | To |
|---|---|
| Card primary action (approved flow) | Connector action executes; card updates in place |
| Card primary action (approval required) | DecisionSlideOver shows approval-pending state |
| Click evidence source (e.g. "GitHub PR #447") | Opens GitHub in new tab |
| `Ask FLOW about this` chip | StickyCommandCenter expands with card context |
| LiveFeed event click | Opens relevant page (e.g., `/projects` for PR event) |
| Sidebar nav | Any destination page |

---

## Keyboard Shortcuts

| Key | Action |
|---|---|
| `↓` / `↑` | Move focus between NOW cards |
| `Enter` | Open DecisionSlideOver for focused card |
| `Space` | Execute primary action on focused card (with confirmation) |
| `Escape` | Close DecisionSlideOver |
| `⌘/` | Focus StickyCommandCenter |
| `⌘\` | Toggle LiveFeed panel |
| `⌘K` | Open CommandPalette |
| `1–5` | Focus card at position N in NOW list |

---

## Accessibility

- `<main>` landmark wraps the content area
- `<section aria-label="Now — Priority Actions">` wraps NOW cards
- Each DecisionCard: `role="article"`, `aria-label="{situation}"`, `tabindex="0"`
- ExecutiveHero primary button: `aria-live="polite"` — status updates are announced
- DecisionSlideOver: `role="dialog"`, `aria-modal="true"`, focus trap on open, return focus to triggering card on close
- Skeleton cards: `aria-hidden="true"`, `aria-busy="true"` on the containing section
- Color status (critical/warning/nominal): communicated via both `aria-label` on StatusDot and text in hero

---

## Responsive Behavior

| Viewport | Behavior |
|---|---|
| ≥1280px (desktop) | Full 3-column (Sidebar + Content + LiveFeed) |
| 1024px–1279px | LiveFeed closed by default; toggle available |
| 768px–1023px (tablet) | Sidebar collapses to icon-only (48px); LiveFeed hidden; Content full-width |
| <768px | Not supported in v1 (enterprise-desktop-first) |

On tablet: Sidebar icon-only mode shows 10 icons (primary + intelligence groups). Labels hidden. Tap to expand temporarily.

---

## Telemetry Events

All events published to the Unified Event Platform (`src/events/publish()`).

| Event | Trigger | Properties |
|---|---|---|
| `home.viewed` | Page mount | `{ workspaceId, itemCount, nowCount }` |
| `home.card.clicked` | Card click | `{ cardId, cardType, impact, position }` |
| `home.card.action.clicked` | Primary action on card | `{ cardId, actionType, riskLevel }` |
| `home.card.dismissed` | Card dismissed | `{ cardId, cardType }` |
| `home.empty_state.viewed` | Empty state renders | `{ workspaceId }` |
| `home.command.opened` | StickyCommandCenter focused | `{ trigger: 'keyboard' \| 'click' }` |
| `home.livefeed.toggled` | LiveFeed panel toggled | `{ open: boolean }` |

---

## Acceptance Criteria

- [ ] Page loads visible content within 1.5 seconds on fast network.
- [ ] After 8 seconds without data, demo fallback renders with correct label.
- [ ] NOW section shows maximum 5 cards.
- [ ] NEXT section is collapsed by default; expand shows maximum 3 cards.
- [ ] LATER section renders as text list (no card UI).
- [ ] Executive Hero status dot matches workspace health (critical/warning/nominal).
- [ ] DecisionSlideOver opens on card click; closes on Escape and backdrop click.
- [ ] Primary action on a card flows through ExecutionEngine governance.
- [ ] After successful execution, card animates out and the next card takes its position.
- [ ] FlowToast confirms the completed action.
- [ ] StickyCommandCenter is present and functional at all times.
- [ ] Keyboard navigation (↓/↑/Enter/Space) works on all cards.
- [ ] LiveFeed panel is open by default at ≥1280px.
- [ ] All telemetry events fire at the correct triggers.
- [ ] Empty state shows three action chips with correct pre-filled queries.
- [ ] Error state shows demo data with an honest label (never a crash or blank page).
