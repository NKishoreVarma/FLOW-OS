# Blueprint: Responsive Rules
**Document:** BP-18  
**Last updated:** 2026-07-18  
**Status:** Authoritative

---

## Breakpoint System

FLOW has 3 defined breakpoints:

| Name | Min-width | Target |
|---|---|---|
| `desktop` | ≥1280px | Primary target — all features visible |
| `laptop` | 1024px–1279px | Secondary target — sidebar and panels adapt |
| `tablet` | 768px–1023px | Tertiary target — single column, limited panels |

FLOW is **not a mobile application.** There is no `mobile` breakpoint. Viewports <768px show a "Use a larger screen" message — no feature is available on small phones in v1.

---

## Implementation

Tailwind CSS breakpoints. The project uses CSS modules + Tailwind utility classes:

```js
// Base = desktop (≥1280px)
// sm:  = 640px+  (not used)
// md:  = 768px+  → tablet
// lg:  = 1024px+ → laptop
// xl:  = 1280px+ → desktop (same as base)
```

Custom breakpoints in `tailwind.config.js`:
```js
screens: {
  'tablet': '768px',
  'laptop': '1024px',
  'desktop': '1280px',
}
```

---

## Layout Shell

### Sidebar

| Breakpoint | Behavior |
|---|---|
| Desktop (≥1280px) | Fixed, 220px wide, always visible |
| Laptop (1024–1279px) | Fixed, 220px wide, always visible |
| Tablet (768–1023px) | Hidden by default; toggled via hamburger menu (`☰`) |

**Sidebar collapse (tablet):**
- Hamburger icon in top-left of Header: 40px × 40px tap target
- On tap: sidebar slides in from left (240ms ease-out) as an overlay (z-index: 2000)
- Backdrop: `rgba(0,0,0,0.4)` — click dismisses
- Sidebar does NOT push content — it overlays
- State: local React state (not URL param)

### Header

| Breakpoint | Behavior |
|---|---|
| Desktop | No hamburger; search; user menu |
| Laptop | Same |
| Tablet | Hamburger (☰) on left; FLOW logo; user avatar |

---

## LiveFeed Panel

| Breakpoint | Behavior |
|---|---|
| Desktop (≥1280px) | 260px right column, always visible |
| Laptop (1024–1279px) | Hidden; toggleable via `[Live ▾]` button in PageHeader |
| Tablet (768–1023px) | Not available — hidden entirely |

On laptop, the LiveFeed toggle:
```
[Live ▾]  ← button in PageHeader right area
```
Opens LiveFeed as an overlay panel (same z-index as sidebar, from right).

---

## Content Area Width

| Breakpoint | Content area max-width | Padding |
|---|---|---|
| Desktop | `calc(100vw - 220px - 260px)` = main with LiveFeed | `24px` horizontal |
| Laptop | `calc(100vw - 220px)` = full minus sidebar | `20px` horizontal |
| Tablet | `100vw` | `16px` horizontal |

---

## Page-Specific Responsive Rules

### Home (`/`)

| Breakpoint | Layout |
|---|---|
| Desktop | 3 column: Sidebar + Content (cards) + LiveFeed |
| Laptop | 2 column: Sidebar + Content; no LiveFeed |
| Tablet | 1 column: no Sidebar (overlay); no LiveFeed; cards full-width |

---

### Inbox (`/inbox`)

| Breakpoint | Layout |
|---|---|
| Desktop | 2 column: ActionCard list (left) + ItemDetailPanel (right slide-over, 400px) |
| Laptop | Same; detail panel at 360px |
| Tablet | 1 column: list full-width; detail panel full-screen on select |

---

### Engineering (`/projects`)

| Breakpoint | Layout |
|---|---|
| Desktop | 2-column grid (PRs at-risk + Merge conflicts) |
| Laptop | 2-column grid (narrower) |
| Tablet | 1-column: cards stack; RepoSelector becomes a dropdown |

RepoSelector tab bar:
- Desktop: 5 tabs visible + overflow `[More ▾]`
- Laptop: 3 tabs + overflow
- Tablet: dropdown `[Select repo ▾]`

---

### Meetings (`/meetings`)

| Breakpoint | Layout |
|---|---|
| Desktop | 2-column: upcoming (left) + past (right) |
| Laptop | 2-column (narrower columns) |
| Tablet | 1-column: upcoming list; past events collapsed by default |

Sub-page `/prep`:
- Desktop/Laptop: 2-column (event details + AI brief)
- Tablet: 1-column; AI brief below event details

Sub-page `/live`:
- All breakpoints: single column, timer top, notes below

---

### Knowledge (`/knowledge`)

| Breakpoint | Layout |
|---|---|
| Desktop | EntityStream (left) + GraphPanel (right, fixed 440px) |
| Laptop | EntityStream (left) + GraphPanel (right, 340px) |
| Tablet | EntityStream full-width; GraphPanel rendered below entity list, collapsible |

---

### Chief of Staff (`/chief`)

| Breakpoint | Layout |
|---|---|
| Desktop | Content + LiveFeed |
| Laptop | Content only (LiveFeed closed) |
| Tablet | Single column; NEXT collapsed; LATER hidden |

LATER section hidden on tablet — available via StickyCommandCenter: `"Show me later items."`

---

### People (`/people`)

| Breakpoint | Layout |
|---|---|
| Desktop | 2-column cards (Workload + Knowledge Risk) + LiveFeed |
| Laptop | 2-column cards; no LiveFeed |
| Tablet | 1-column; panels stack (Workload first, Knowledge Risk second) |

PersonDetailPanel:
- Desktop/Laptop: 380px right slide-over
- Tablet: Full-screen overlay

---

### Customers (`/customers`)

| Breakpoint | Layout |
|---|---|
| Desktop | At-risk cards + Health Grid + Timeline + LiveFeed |
| Laptop | Same; no LiveFeed |
| Tablet | 1-column; Timeline scrolls horizontally |

Renewal Timeline horizontal scrolling on tablet:
```css
.renewal-timeline {
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  min-width: 600px; /* ensures the 90-day range has room */
}
```

---

### Executive Council (`/council`)

| Breakpoint | Layout |
|---|---|
| Desktop | 3×2 health grid; 2-column debate cards |
| Laptop | 3×2 health grid; 1-column debate cards |
| Tablet | 2×3 health grid (reflow); 1-column debate cards |

---

### Activity (`/activity`)

| Breakpoint | Layout |
|---|---|
| Desktop | Timeline full-width |
| Laptop | Same |
| Tablet | Same; EventDetailPanel full-screen |

---

### Trust Center (`/integrations`)

| Breakpoint | Layout |
|---|---|
| Desktop | 2-column ConnectorGrid |
| Laptop | 2-column ConnectorGrid (narrower) |
| Tablet | 1-column; panels stack |

---

### Settings (`/settings/*`)

| Breakpoint | Layout |
|---|---|
| Desktop | Sub-nav (160px) + content area |
| Laptop | Same |
| Tablet | Sub-nav becomes a tab bar at the top; content below |

---

## Panel Stacking Order (z-index)

| Layer | z-index | Elements |
|---|---|---|
| Base content | 0 | Page content, cards |
| Sticky elements | 100 | StickyCommandCenter, FilterBar |
| Side panels | 500 | EventDetailPanel, CustomerDetailPanel, PersonDetailPanel |
| Sidebar (mobile overlay) | 2000 | Sidebar on tablet |
| LiveFeed (laptop toggle) | 2000 | LiveFeed overlay on laptop |
| Modals | 3000 | Confirmation dialogs, invite modal |
| CommandPalette | 3000 | `⌘K` modal |
| Onboarding | 4000 | `FirstRunFlow` overlay |
| Toast notifications | 5000 | Toast stack |

---

## Touch Targets

All interactive elements on tablet:

| Element | Minimum tap target |
|---|---|
| Buttons | 44px × 44px |
| Navigation items | 44px height |
| Row items (lists) | 44px height |
| Toggle switches | 44px × 44px (hit area, not visual size) |
| Sidebar hamburger | 44px × 44px |
| Resource row toggle | 44px × 44px hit area |

CSS implementation:
```css
.touch-target {
  position: relative;
}
.touch-target::after {
  content: '';
  position: absolute;
  inset: -8px; /* expand hit area */
}
```

---

## StickyCommandCenter on Tablet

On tablet, the StickyCommandCenter:
- Remains at the bottom of the content area
- Height: 52px (same as desktop)
- Full viewport width (no sidebar offset)
- On focus: expands to 120px (reduced from 160px desktop — less room for suggestions)
- Shows 2 suggested chips instead of 3

---

## Horizontal Scroll Prevention

Content never causes horizontal scroll on any breakpoint. Tables that cannot collapse on tablet use horizontal scroll within their container, not on the page:

```css
.table-container {
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}
```

Tables that horizontal-scroll on tablet: Renewal Timeline, Audit Log, Commit history.

---

## Typography at Breakpoints

| Token | Desktop | Laptop | Tablet |
|---|---|---|---|
| Greeting text (Chief of Staff) | 28px | 28px | 24px |
| PageHeader | 22px | 22px | 20px |
| Card title | 16px | 16px | 15px |
| Body text | 14px | 14px | 14px |
| Section labels | 11px | 11px | 11px |

---

## <768px (Small Screens)

```
┌────────────────────────────────────┐
│  [FLOW logo]                       │
│                                    │
│  FLOW works best on a larger       │
│  screen.                           │
│                                    │
│  Open FLOW on your laptop or       │
│  desktop to access your            │
│  workspace.                        │
│                                    │
│  [Send a link to yourself →]       │
└────────────────────────────────────┘
```

No application features render below 768px. The "send a link" button pre-fills the user's email with the current URL (uses `mailto:`).

---

## Acceptance Criteria

- [ ] Sidebar is visible at Desktop and Laptop; hidden as overlay on Tablet.
- [ ] LiveFeed visible at Desktop; togglable at Laptop; hidden at Tablet.
- [ ] All 2-column layouts collapse to 1-column on Tablet.
- [ ] All touch targets are ≥44px × 44px on Tablet.
- [ ] Renewal Timeline scrolls horizontally on Tablet without page-level scroll.
- [ ] Onboarding overlay (z-index 4000) appears above all other UI layers.
- [ ] CommandPalette (z-index 3000) appears above modals.
- [ ] No horizontal page scroll on any breakpoint.
- [ ] Typography scale reduces correctly on Tablet.
- [ ] <768px shows the "use a larger screen" message; no app features visible.
