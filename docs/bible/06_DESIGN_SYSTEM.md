# FLOW OS — Design System
**Document:** 06 of 20  
**Status:** Authoritative  
**Last updated:** 2026-07-18

---

## Design Language

**Hermès Light** — the visual language of FLOW.

Warm ivory surfaces. Ink typography. Burnt orange accent. The precision of a luxury brand applied to enterprise software. Every decision serves clarity over ornamentation, calm over urgency, authority over busyness.

---

## Color System

All colors are CSS custom properties defined in `flow-os-frontend/src/styles/tokens.css`. No raw hex values appear in components.

### Surfaces (warm ivory stack)

```css
--surface-0: #F7F2E9    /* Page canvas, card backgrounds */
--surface-1: #F2ECDF    /* Sidebar, elevated panels */
--surface-2: #FDFBF6    /* Modals, high-elevation overlays */
--surface-3: #EDE8DD    /* Depressed areas, code backgrounds */
```

### Text (ink, opacity-based)

```css
--t1: rgba(31,27,22,0.92)    /* Primary text — headings, labels */
--t2: rgba(31,27,22,0.64)    /* Secondary text — supporting copy */
--t3: rgba(31,27,22,0.44)    /* Tertiary — captions, placeholder */
--t4: rgba(31,27,22,0.28)    /* Quaternary — group headers, metadata */
```

### Lines and Borders

```css
--line-0: rgba(31,27,22,0.08)    /* Subtle separators (sidebar border, card dividers) */
--line-1: rgba(31,27,22,0.14)    /* Standard borders (inputs, panels) */
--line-2: rgba(31,27,22,0.22)    /* Strong borders (active states, modals) */
```

### Accent (burnt orange — action and signal)

```css
--accent:     #E8672B    /* Primary brand color — active nav, primary buttons */
--accent-dim: rgba(232,103,43,0.08)   /* Active nav background */
--accent-low: rgba(232,103,43,0.12)   /* Hover states, selection */
```

### Semantic (status colors)

```css
/* Risk / Priority */
--p-critical:      rgba(220,38,38,0.08)    /* Background */
--p-critical-text: #B91C1C                 /* Text */
--p-critical-border: rgba(220,38,38,0.22) /* Border */

--p-high:          rgba(234,88,12,0.08)
--p-high-text:     #C2410C
--p-high-border:   rgba(234,88,12,0.22)

--p-medium:        rgba(202,138,4,0.08)
--p-medium-text:   #A16207
--p-medium-border: rgba(202,138,4,0.22)

--p-low:           rgba(31,27,22,0.06)
--p-low-text:      rgba(31,27,22,0.44)
--p-low-border:    rgba(31,27,22,0.14)

/* State */
--s-success:      rgba(22,163,74,0.08)
--s-success-text: #15803D

--s-warning:      rgba(202,138,4,0.08)
--s-warning-text: #A16207

--s-error:        rgba(220,38,38,0.08)
--s-error-text:   #B91C1C

/* Trust / Connection */
--connected:      rgba(22,163,74,1)       /* Green dot */
--disconnected:   rgba(31,27,22,0.28)     /* Gray dot */
--warning:        rgba(234,88,12,1)       /* Orange dot */
```

### Brand Glass

The brand-glass token is used for elevated panels with subtle warmth:

```css
--brand-glass: rgba(232,103,43,0.03)
```

---

## Typography

FLOW uses three typefaces, each with a distinct semantic role.

```css
--font-display: 'Cormorant Garamond', serif
  Used for: Page titles, greeting headers, ExecutiveHero headline
  Sizes: 28px, 36px, 42px
  Weight: 400 (regular) or 500 (medium)
  Letter spacing: 0.01em to 0.03em
  
--font-ui: 'Instrument Sans', sans-serif
  Used for: All navigation labels, body copy, descriptions, action labels, card content
  Sizes: 11px, 12px, 13px, 14px
  Weights: 300, 400, 500
  
--font-data: 'IBM Plex Mono', monospace
  Used for: Timestamps, badges, workspace IDs, API keys, code, technical identifiers, group headers
  Sizes: 9px, 10px, 11px, 12px
  Weight: 300, 400
```

### Type Scale

| Role | Family | Size | Weight | Color |
|---|---|---|---|---|
| Page greeting | Display | 36–42px | 400 | `--t1` |
| Page title | Display | 24–28px | 400 | `--t1` |
| Section header | UI | 14px | 500 | `--t1` |
| Card title | UI | 13px | 400 | `--t1` |
| Body copy | UI | 13px | 300 | `--t2` |
| Caption / meta | UI | 11px | 300 | `--t3` |
| Timestamp | Data | 10–11px | 300 | `--t3` |
| Group header | Data | 10px | 300 | `--t4` |
| Badge / chip | Data | 9–10px | 400 | `--t2` or semantic |
| Code | Data | 11–12px | 400 | `--t1` |

---

## Spacing System

8-point base unit. All spacing values are multiples of 4px.

```
4px    — icon-to-label gap, tight inline pairs
8px    — between related elements within a card
12px   — between card sections
16px   — standard padding (card interior, nav items)
20px   — section padding
24px   — between cards in a list
32px   — section gaps
48px   — major vertical rhythm (hero bottom margin)
```

Page content areas have a maximum width for readability:
- Decision cards / lists: `max-width: 720px`
- Brain conversation: `max-width: 680px`
- Settings forms: `max-width: 600px`
- Full-width tables (audit logs): `100%` with horizontal scroll

---

## Border Radius

```
2px    — chips, small badges
3px    — cards, modals, panels
4px    — inputs, buttons
5px    — larger modals, slide-overs
0px    — the FLOW logo mark (square)
```

---

## Elevation / Shadow

FLOW does not use large drop shadows. Elevation is communicated through border and background color contrast.

```css
/* Subtle card lift */
box-shadow: 0 1px 3px rgba(31,27,22,0.06);

/* Modal */
box-shadow: 0 8px 24px rgba(31,27,22,0.10), 0 2px 8px rgba(31,27,22,0.06);

/* SlideOver / overlay panel */
box-shadow: -4px 0 24px rgba(31,27,22,0.10);

/* Command Center */
box-shadow: 0 -1px 0 rgba(31,27,22,0.08), 0 -8px 24px rgba(31,27,22,0.06);
```

---

## Animation

All animations are defined in `flow-os-frontend/src/styles/animations.css`.

### Principles
- Duration: 80ms (micro-interactions) to 280ms (panel slides)
- Easing: `cubic-bezier(0.16, 1, 0.3, 1)` for exits; `cubic-bezier(0.22, 1, 0.36, 1)` for entrances
- Never animate color-only changes — always pair with transform or opacity
- Reduce motion: all animations respect `prefers-reduced-motion`

### Standard Animations

| Event | Duration | Easing | Properties |
|---|---|---|---|
| Nav item hover | 80ms | ease | color, background |
| Button hover | 80ms | ease | background, scale(1.01) |
| Modal open | 180ms | ease-out | opacity + scale(0.96→1) |
| SlideOver open | 280ms | cubic-bezier(0.22,1,0.36,1) | translateX(100%→0) |
| SlideOver close | 200ms | cubic-bezier(0.16,1,0.3,1) | translateX(0→100%) |
| Command Center expand | 200ms | ease-out | height, translateY |
| Command Center collapse | 150ms | ease-in | height, translateY |
| Toast enter | 220ms | ease-out | translateY(-8px→0) + opacity |
| Toast exit | 160ms | ease-in | translateY(0→-8px) + opacity |
| Card skeleton shimmer | 1600ms | linear, infinite | background-position |
| Streaming token | none | — | text appended in chunks |

### Shimmer Skeleton

```css
@keyframes shimmer-sweep {
  0%   { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

/* Applied to skeleton elements: */
background: linear-gradient(
  90deg,
  rgba(31,27,22,0.05) 25%,
  rgba(31,27,22,0.07) 50%,
  rgba(31,27,22,0.05) 75%
);
background-size: 200% 100%;
animation: shimmer-sweep 1.6s ease-in-out infinite;
```

---

## Components (Core Primitives)

### Button

Three variants:

```
Primary:    bg=var(--accent)         text=white        border=none
Secondary:  bg=rgba(31,27,22,0.06)   text=var(--t2)    border=1px var(--line-1)
Ghost:      bg=transparent           text=var(--t3)    border=none
Danger:     bg=rgba(220,38,38,0.08)  text=var(--p-critical-text) border=1px var(--p-critical-border)
```

Size: `padding: 6px 12px`, `font-size: 11–12px`, `border-radius: 4px`.  
Large variant: `padding: 8px 16px`, `font-size: 13px`.

### Input

```css
background: rgba(31,27,22,0.045);
border: 1px solid var(--line-1);
border-radius: 4px;
padding: 7px 10px;
font-size: 12px;
font-family: var(--font-ui);
color: var(--t1);
outline: none;

/* Focus */
border-color: var(--accent);
box-shadow: 0 0 0 2px rgba(232,103,43,0.12);
```

### Badge / Chip

Small information tags. `border-radius: 3px`. `font-family: var(--font-data)`. `font-size: 9–10px`.

```
Neutral:   bg=rgba(31,27,22,0.07)  text=var(--t3)
Accent:    bg=var(--accent-dim)    text=var(--accent)
Critical:  bg=var(--p-critical)    text=var(--p-critical-text)
High:      bg=var(--p-high)        text=var(--p-high-text)
Medium:    bg=var(--p-medium)      text=var(--p-medium-text)
Low:       bg=var(--p-low)         text=var(--p-low-text)
Success:   bg=var(--s-success)     text=var(--s-success-text)
```

### Card

```css
background: var(--surface-0);
border: 1px solid var(--line-0);
border-radius: 3px;
padding: 16px;
```

Hover state (clickable cards):
```css
border-color: var(--line-1);
background: var(--surface-1);
cursor: pointer;
```

### Toggle

```
OFF: bg=rgba(31,27,22,0.15)   knob=white
ON:  bg=var(--accent)          knob=white
Transition: 150ms ease
```

### Status Dot

10px circle. Colors: `var(--connected)` (green), `var(--disconnected)` (gray), `var(--warning)` (orange).

---

## Interaction Design

### Hover
All interactive elements respond to hover within 80ms. Background color change is the primary hover signal. Scale transforms are reserved for buttons and cards to avoid visual noise.

### Focus
Tab focus shows a `box-shadow: 0 0 0 2px rgba(232,103,43,0.40)` ring. No custom focus style hides the browser's default ring — FLOW's ring replaces it.

### Active / Pressed
Active state: `transform: scale(0.98)` on buttons. Duration: 60ms.

### Disabled
`opacity: 0.4`. `cursor: not-allowed`. No interaction feedback.

### Loading (within a button or action)
Replace button label with a 16px spinner (`border: 2px solid transparent; border-top-color: currentColor; border-radius: 50%; animation: spin 0.6s linear infinite`). Disable the button during load.

---

## Accessibility

- All color contrast ratios meet WCAG AA (4.5:1 for normal text, 3:1 for large text)
- All interactive elements are focusable and keyboard-operable
- All icons have `aria-label` or adjacent visible text
- All modals trap focus and restore focus on close
- All live regions (toast notifications, streaming content) use `aria-live="polite"`
- Screen reader announcements for: navigation changes, action results, error states
- `prefers-reduced-motion` reduces all animations to `opacity` transitions only

---

## Enterprise Design Language Guidelines

### Do not use emojis
FLOW is a professional enterprise product. No emojis appear in the interface. Status is communicated through semantic color, not emoji.

### Do not use rounded everything
FLOW's sharp `border-radius: 2–5px` is intentional. Excessive border-radius reads as consumer/playful. Enterprise authority comes from precision.

### Do not use gradient backgrounds
FLOW's surfaces are flat warm ivory. No gradient backgrounds on page canvases. Gradients are only used in status indicators and focus rings.

### Do not animate unless it communicates
Animation communicates entrance, exit, state change, or hierarchy. An animation that exists for delight that does not communicate meaning is noise in an enterprise context.

### Do not use large illustrations
FLOW is text and data. Empty states use brief, clear prose — not full-page illustrations. The one exception is the Onboarding Flow (`/welcome`), which may use subtle graphic elements to reduce cognitive friction for first-time users.

### Do show numbers precisely
When surfacing a metric, show the exact number, not a rounded approximation. "4 PRs" not "a few PRs". "2h 14m" not "about 2 hours".
