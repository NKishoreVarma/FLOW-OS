# FLOW OS — Design System Reference

## Visual Identity

**Aesthetic**: Premium enterprise dark UI — dense information at rest, alive on interaction. Inspired by Linear, Vercel, and Raycast. Not corporate blue, not startup gradient soup.

**Primary feel**: Precision, speed, trust. Every pixel justifies its existence.

## Color System

All values use CSS custom properties from `flow-os-frontend/src/styles/tokens.css`.

### Core Palette
- `--color-bg-primary`: `#0a0a0f` — near-black app background
- `--color-bg-secondary`: `#111118` — card/panel backgrounds
- `--color-bg-tertiary`: `#1a1a24` — elevated surfaces, hover states
- `--color-border`: `rgba(255,255,255,0.06)` — subtle dividers
- `--color-border-strong`: `rgba(255,255,255,0.12)` — card outlines

### Text
- `--color-text-primary`: `#f1f1f5` — headlines, primary labels
- `--color-text-secondary`: `#8b8b9a` — supporting metadata
- `--color-text-muted`: `#5a5a6e` — disabled, placeholder

### Accent Colors
- `--color-accent-purple`: `#7c3aed` — primary CTA, AI surfaces
- `--color-accent-blue`: `#3b82f6` — info, links
- `--color-accent-green`: `#22c55e` — success, online status
- `--color-accent-amber`: `#f59e0b` — warnings, P1 priority
- `--color-accent-red`: `#ef4444` — critical, destructive actions
- `--color-accent-cyan`: `#06b6d4` — data, metrics

### Priority System
| Priority | Text | Background | Border |
|----------|------|-----------|--------|
| CRITICAL | #ef4444 | rgba(239,68,68,0.1) | rgba(239,68,68,0.25) |
| P1 | #f59e0b | rgba(245,158,11,0.1) | rgba(245,158,11,0.25) |
| P2 | #3b82f6 | rgba(59,130,246,0.1) | rgba(59,130,246,0.2) |
| P3 | #8b8b9a | rgba(139,139,154,0.1) | rgba(139,139,154,0.2) |

## Typography

Scale defined in `flow-os-frontend/src/styles/typography.css`.

- **Headlines**: `--font-size-xl` (20px) / `--font-size-lg` (18px) — weight 600, tight tracking
- **Body**: `--font-size-sm` (14px) — weight 400, relaxed leading
- **Labels/Meta**: `--font-size-xs` (12px) — weight 500, `0.5px` letter-spacing
- **Monospace**: `font-family: 'JetBrains Mono', monospace` — used in dev console, traces, IDs

**Rule**: Never use raw `px` in components. Always use token variables.

## Spacing

Grid: 4px base unit. Everything is a multiple of 4 (or 8 for section gaps).
- `--space-1`: 4px
- `--space-2`: 8px
- `--space-3`: 12px
- `--space-4`: 16px
- `--space-6`: 24px
- `--space-8`: 32px

## Component Patterns

### Cards
- Background: `--color-bg-secondary`
- Border: `1px solid --color-border`
- Border radius: `12px` (regular) / `8px` (compact)
- Hover: border transitions to `--color-border-strong`, subtle translateY(-1px)
- Never use `box-shadow` as primary depth — use border + background contrast

### Priority Chips / Badges
- Small, uppercase, `--font-size-xs`, `font-weight: 600`
- Color-coded background + border (see Priority System above)
- `border-radius: 4px`, `padding: 2px 6px`

### Buttons
- Primary CTA: purple gradient, white text, `border-radius: 8px`
- Secondary: transparent + border, muted text
- Destructive: red border, red text, no fill at rest
- Loading state: spinner replaces text, same dimensions (no layout shift)

### Slide-over Panels (ActionCenter)
- `width: 480px` on desktop, full-screen on mobile
- Backdrop: `rgba(0,0,0,0.6)` with `backdrop-filter: blur(4px)`
- Enter animation: slide from right with spring easing (framer-motion)
- Header: source-colored accent strip at top edge

### Health Score / Metric Displays
- Large number: `--font-size-3xl` (36px), weight 700
- Trend arrow: green (↑) or red (↓), `--font-size-sm`
- Progress bar: `height: 4px`, `border-radius: 2px`, track + fill with accent color
- Animated counter: cubic ease-out, 800ms duration, `requestAnimationFrame`

## Motion Principles

- **Purposeful only** — animation communicates state change, not decoration
- **Duration**: 150ms (micro), 250ms (transitions), 400ms (entrance), 600ms (data)
- **Easing**: `cubic-bezier(0.16, 1, 0.3, 1)` (spring-like) for enter; `ease-in` for exit
- **No bounce** on data-heavy interfaces (use spring with high damping)
- **Stagger** list items: 50ms between items, cap at 300ms total delay
- **framer-motion** is the animation library — use `AnimatePresence` for mount/unmount

## Layout Structure

```
LayoutShell
  Sidebar (fixed, 240px)
  Main
    Header (sticky, 56px)
    Page content (scrollable)
      — max-width: 1280px, centered
      — padding: 24px
```

Page columns: 12-column grid at 1280px, collapses to single column at 768px.

## Source / Connector Colors

| Source | Color | Icon |
|--------|-------|------|
| github | #f0f6ff / blue | GitBranch |
| gmail | #fee2e2 / red | Mail |
| slack | #fef9c3 / amber | MessageSquare |
| jira | #eff6ff / blue | Briefcase |
| calendar | #f0fdf4 / green | Calendar |
| vault | #f5f3ff / purple | Shield |
| notion | #f8fafc / slate | FileText |

## Anti-Patterns

- No raw hex values in component JSX — always use token vars
- No `!important` — fix specificity issues properly
- No hardcoded widths on text containers — let text flow
- No generic "card" shadows — use border contrast
- No full-page loading spinners — skeleton load per section
- No 500ms+ transitions on interactive elements (feels sluggish)
- No `Github` from lucide-react — use `GitBranch` (not exported in v1.21.0)
- No TypeScript files — codebase is JavaScript only (exception: `button.tsx`, legacy)
