# Blueprint: Micro-Interactions
**Document:** BP-20  
**Last updated:** 2026-07-18  
**Status:** Authoritative

---

## Design Principles

1. **Motion is never decorative.** Every animation communicates something: position change, state transition, cause and effect.
2. **All motion uses `transform` and `opacity`.** Never animate `width`, `height`, `top`, `left`, or `margin` — these trigger layout and drop frames.
3. **80ms for hover, 120–200ms for transitions, 300ms for major state changes.** Faster feels instant; slower feels deliberate.
4. **Respect `prefers-reduced-motion`.** All animations reduce to instant or cross-fade when the user has this preference set.
5. **One easing curve family.** `ease-out` for things entering the screen; `ease-in` for things leaving; `ease-in-out` for transforms that stay on screen.

---

## Timing Reference

| Duration | Use case |
|---|---|
| 0ms | Instant (toggles, focus states with no visual move) |
| 80ms | Hover states (color, shadow) |
| 120ms | Expand/collapse within a card (evidence panel, NEXT section) |
| 200ms | Slide-overs entering (panels, modals) |
| 240ms | Page-level transitions (lazy-load route change) |
| 300ms | Overlay entrances (CommandPalette, Onboarding) |
| 500ms | Success state fade-out (card collapses after action) |
| 1500ms | Skeleton shimmer period |

---

## Easing Tokens

```css
--ease-out:     cubic-bezier(0, 0, 0.2, 1);  /* elements entering */
--ease-in:      cubic-bezier(0.4, 0, 1, 1);  /* elements leaving */
--ease-in-out:  cubic-bezier(0.4, 0, 0.2, 1); /* elements that stay */
```

---

## Reduced Motion

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

Cross-fade replacement for skeleton shimmer:
```css
@media (prefers-reduced-motion: reduce) {
  .skeleton {
    animation: skeleton-pulse 2s ease-in-out infinite;
  }
  @keyframes skeleton-pulse {
    0%, 100% { opacity: 0.6; }
    50% { opacity: 1; }
  }
}
```

---

## Hover States

All hoverable elements transition in `80ms ease-out`:

### Card / Row Hover
```css
.card {
  transition: box-shadow 80ms var(--ease-out);
}
.card:hover {
  box-shadow: var(--elevation-1);
}
```

No background color change on card hover — shadow only. Color changes imply interaction state (focus/selected), not hover.

### Button Hover
```css
.btn {
  transition: background-color 80ms var(--ease-out), 
              color 80ms var(--ease-out);
}
```

Primary button (`var(--accent)` bg): hover darkens bg by 8% (`color-mix(in srgb, var(--accent) 92%, black)`).  
Ghost button: hover applies `var(--hover-bg)` (`rgba(31,27,22,0.05)`).

### Navigation Item Hover
```css
.nav-item {
  transition: background-color 80ms var(--ease-out);
}
.nav-item:hover {
  background: var(--hover-bg);
}
```

---

## Focus Rings

All keyboard-focusable elements show a focus ring:

```css
:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
  border-radius: var(--radius-sm);
}
```

`outline-offset: 2px` — ring sits outside the element, never cuts into content.  
`var(--accent)` (#E8672B burnt orange) is high-contrast against both light and dark surfaces.  
`:focus` without `:focus-visible` — no ring (mouse clicks don't show ring; keyboard does).

---

## Button Press

```css
.btn:active {
  transform: scale(0.98);
  transition: transform 80ms var(--ease-in-out);
}
```

`scale(0.98)`: barely perceptible but confirms the click registered. Applies to all buttons, chips, and icon buttons.

---

## ActionCard Interactions

### Hover
- `box-shadow: var(--elevation-1)` — 80ms ease-out
- No position change, no scale

### Focus (keyboard)
- `outline: 2px solid var(--accent); outline-offset: 2px`

### Primary action click → confirming state (MEDIUM risk)
```
transform: none (no movement)
Content swap: 100ms cross-fade
  [Execute button] → [Confirm / Cancel]
```
`opacity: 0 → 1` on new content over 100ms.

### Executing state
```
Primary button: spinner replaces label
transition: opacity 80ms ease-out
Other buttons: opacity → 0.4, pointer-events: none
```

### Success state
```
1. Card bg: rgba(34,197,94,0.07) — fades in over 200ms
2. Text update: "Done. [outcome]." — cross-fade 100ms
3. After 3s delay: card collapses
   height: auto → 0, opacity: 1 → 0, margin-bottom: 16px → 0
   duration: 300ms ease-in
4. Other cards slide up to fill gap: 300ms ease-out
```

### Failed state
```
1. Card border-left: 3px solid var(--status-critical) — 120ms ease-out
2. Card bg: rgba(239,68,68,0.07) — 120ms ease-out
3. Error text cross-fades in: 100ms
4. Card stays — does not collapse
```

---

## Evidence Panel Expand/Collapse

```css
.evidence-panel {
  overflow: hidden;
  transition: height 120ms var(--ease-out);
}
/* collapsed */
.evidence-panel[aria-expanded="false"] { height: 0; }
/* expanded — height set dynamically via JS scrollHeight */
.evidence-panel[aria-expanded="true"] { height: var(--content-height); }
```

The `▶ Evidence` label rotates: `transform: rotate(0deg)` → `rotate(90deg)` over 120ms.

---

## NEXT Section (Chief of Staff) Expand/Collapse

Same pattern as evidence panel. Height transitions `0 → auto` (use `scrollHeight`). 120ms ease-out.

Section summary label cross-fades out as cards fade in (100ms stagger between label leave and cards enter).

---

## Slide-Over Panels (Right)

EventDetailPanel, CustomerDetailPanel, PersonDetailPanel, AuditLogPanel:

**Enter:**
```css
@keyframes slide-in-right {
  from { transform: translateX(100%); opacity: 0; }
  to   { transform: translateX(0);    opacity: 1; }
}
animation: slide-in-right 200ms var(--ease-out);
```

**Exit:**
```css
@keyframes slide-out-right {
  from { transform: translateX(0);    opacity: 1; }
  to   { transform: translateX(100%); opacity: 0; }
}
animation: slide-out-right 160ms var(--ease-in);
```

Backdrop (mobile/tablet): `opacity: 0 → 0.4` over 200ms. Exit: `0.4 → 0` over 160ms.

---

## CommandPalette

**Enter:**
```css
@keyframes palette-enter {
  from { opacity: 0; transform: scale(0.96) translateY(-8px); }
  to   { opacity: 1; transform: scale(1)    translateY(0); }
}
animation: palette-enter 200ms var(--ease-out);
```

**Exit:**
```css
@keyframes palette-exit {
  from { opacity: 1; transform: scale(1)    translateY(0); }
  to   { opacity: 0; transform: scale(0.96) translateY(-8px); }
}
animation: palette-exit 160ms var(--ease-in);
```

---

## StickyCommandCenter State Transitions

**Idle → Focused (expand):**
```
height: 52px → 160px
transition: height 120ms ease-out

Content inside: opacity: 0 → 1, delay: 60ms
```

**Focused → Response:**
```
Content swap: cross-fade 120ms
height: auto (may grow)
```

**Response → Idle (close × button):**
```
height: current → 52px, 120ms ease-in
content: opacity → 0 first (80ms), then height collapses
```

**Streaming text:**
- Tokens render immediately as they arrive
- No animation per-token — just character append
- Cursor `▌` blinks at 1s interval while streaming

---

## Toasts

```
Position: fixed, bottom: 24px, right: 24px
z-index: 5000
width: 320px
```

**Enter:**
```css
@keyframes toast-enter {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
}
animation: toast-enter 200ms var(--ease-out);
```

**Exit (auto-dismiss at 6s or on × click):**
```css
@keyframes toast-exit {
  from { opacity: 1; transform: translateY(0); }
  to   { opacity: 0; transform: translateY(8px); }
}
animation: toast-exit 200ms var(--ease-in);
```

**Stacking:** Multiple toasts stack. Each new toast enters at the bottom; older toasts slide up (`transform: translateY(-{n * 72}px)`, 200ms ease-out) to make room.

---

## Skeleton Shimmer

```css
@keyframes skeleton-shimmer {
  0%   { background-position: -200% 0; }
  100% { background-position:  200% 0; }
}

.skeleton {
  background: linear-gradient(
    90deg,
    var(--skeleton-base)     0%,
    var(--skeleton-highlight) 50%,
    var(--skeleton-base)     100%
  );
  background-size: 200% 100%;
  animation: skeleton-shimmer 1.5s ease-in-out infinite;
  border-radius: var(--radius-sm);
}
```

The highlight sweeps left-to-right. The gradient gives a realistic "light reflection" feel.

---

## Graph Visualization

**Node selection:**
```
Selected node radius: from base → base × 1.4
Ring (stroke): opacity: 0 → 1, stroke-width: 2
transition: r 160ms ease-out, stroke-opacity 160ms ease-out
```

**Non-selected nodes dimming (on selection):**
```
opacity: 1 → 0.2
transition: opacity 200ms ease-out
```

**Node hover:**
```
cursor: pointer
radius: base → base × 1.1, 80ms ease-out
```

**Edge on select:**
Connected edges: `stroke-opacity: 0.4 → 0.8`, 160ms ease-out.  
Disconnected edges: `stroke-opacity: 0.4 → 0.08`, 160ms ease-out.

---

## Sidebar Navigation (Active State)

```css
.nav-item.active {
  background: var(--surface-1);
  color: var(--t1);
}
```

Transition when navigating between pages:
- Active indicator (left bar): `transform: translateY({offset}px)`, 200ms ease-in-out
- Not color change — the active bar slides to the new position

---

## New Events (Activity Feed, LiveFeed)

When a new event arrives via WebSocket:

```
New event card enters from top:
@keyframes event-enter {
  from { opacity: 0; transform: translateY(-8px); }
  to   { opacity: 1; transform: translateY(0); }
}
animation: event-enter 120ms ease-out
```

Older events shift down: `transform: translateY(0) → translateY(72px)`, 120ms ease-out.  
Both transitions fire simultaneously.

---

## Page Transitions (Route Changes)

Lazy-loaded routes:
```
Exiting page: opacity: 1 → 0, 80ms ease-in
Entering page (skeleton): opacity: 0 → 1, 160ms ease-out
```

Total perceived transition: ~240ms.

---

## Onboarding Step Transitions

Step-to-step:
```
Exiting step: transform: translateX(0) → translateX(-40px), opacity: 1 → 0
  duration: 200ms ease-in

Entering step: transform: translateX(40px) → translateX(0), opacity: 0 → 1
  duration: 200ms ease-out
  delay: 100ms (after exit starts)
```

Back navigation: reverses the X direction (`translateX(40px)` out, `translateX(-40px)` in).

---

## Toggle Switches

All `role="switch"` toggles:

```
Track width: 36px, height: 20px
Thumb diameter: 16px
Thumb initial position: left: 2px
Thumb active position: left: 18px (36 - 16 - 2)

Transition: left 120ms ease-in-out, background-color 120ms ease-in-out
```

ON state: track `var(--accent)`, thumb white.  
OFF state: track `var(--border-strong)`, thumb white.

---

## Resource Row Toggle (Trust Center)

Same toggle spec as above. On change:
- Column assignment (CAN SEE / CANNOT SEE): row moves with:
  ```
  opacity: 1 → 0 (80ms), then re-renders in opposite column
  opacity: 0 → 1 (80ms)
  ```
- Not a physical cross-column animation — data refreshes, column re-renders

---

## Progress Bars (Onboarding Build)

```css
.progress-bar {
  height: 4px;
  background: var(--surface-2);
  border-radius: 2px;
  overflow: hidden;
}
.progress-bar-fill {
  height: 100%;
  background: var(--accent);
  border-radius: 2px;
  transition: width 400ms ease-out;
}
```

Width increments in real time as WebSocket `LIFECYCLE_STAGE_COMPLETED` events arrive.

---

## Council Agent Progress Bars

During Council analysis:
```
[Engineering COO]  ████████ Analyzing...
```

Progress bars are indeterminate (looping):
```css
@keyframes indeterminate {
  0%   { transform: translateX(-100%); }
  100% { transform: translateX(200%); }
}
.agent-loading {
  overflow: hidden;
  position: relative;
}
.agent-loading-bar {
  width: 40%;
  height: 4px;
  background: var(--accent);
  position: absolute;
  animation: indeterminate 1.2s ease-in-out infinite;
}
```

When agent responds: looping bar replaced by:  
`✓ Ready` — opacity transition 120ms ease-out.

---

## Morning Brief Hero Update (Home)

When WIC snapshot refreshes and scores change:
```
Health score counter: animates from old to new value
  duration: 800ms ease-out
  effect: count-up/down (number interpolation, not text swap)
```

If predicted score is higher than current:
```
"Predicted: → 78" counter animates to predicted value
color: var(--status-healthy)
opacity: 0 → 1, 200ms ease-out
```

---

## Acceptance Criteria

- [ ] All animations use `transform` and `opacity` only (no `width`, `height`, `top`, `left` animation).
- [ ] Hover states transition in 80ms ease-out.
- [ ] Card press (`active`) applies `scale(0.98)`.
- [ ] Focus rings use `var(--accent)` at 2px offset, only visible on `:focus-visible`.
- [ ] Evidence panel expands at 120ms ease-out, collapses at 120ms ease-in.
- [ ] Slide-over panels enter at 200ms ease-out, exit at 160ms ease-in.
- [ ] CommandPalette enters with scale+translateY at 200ms ease-out.
- [ ] Toasts enter from bottom-right at 200ms ease-out; stack correctly.
- [ ] Skeleton shimmer period is 1.5s; light sweeps left-to-right.
- [ ] Success cards collapse with height+opacity transition at 300ms ease-in after 3s.
- [ ] `prefers-reduced-motion: reduce` disables all keyframe animations; cross-fades remain.
- [ ] New events arriving via WebSocket slide in from top at 120ms.
- [ ] Page transitions are 240ms total (80ms out + 160ms in).
- [ ] Toggle switches animate thumb position at 120ms ease-in-out.
- [ ] Progress bars fill at 400ms ease-out driven by WebSocket events.
