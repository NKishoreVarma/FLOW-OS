# FLOW OS — Design Review
**Document:** GOV-03  
**Status:** Mandatory  
**Applies to:** All frontend changes visible to users  
**Last updated:** 2026-07-18

---

## Purpose

Design Review evaluates quality, consistency, and usability of any change a user will see. Product Review decides *whether* to build it. Design Review decides whether it is *built correctly*.

Design Review happens in two places: a synchronous review for new pages and components, and a checklist-based self-review for smaller changes.

---

## When Design Review Is Required

| Change type | Review type |
|---|---|
| New page or major component | Synchronous — Head of Design + one engineer |
| Changes to navigation, layout shell, or sidebar | Synchronous — Head of Design + Head of Product |
| New design token or color | Synchronous — Head of Design |
| New AI response pattern or message format | Synchronous — Head of Design + Head of Product |
| Component variant or modification | Self-review checklist |
| Copy changes (labels, empty states, error messages) | Self-review checklist + copywriting doc review |
| Bug fix with no visual change | None |

---

## Design Review Checklist

All changes must pass this checklist before a PR is opened. Self-reviewed by the implementing engineer. Verified by the reviewer during PR review.

### 1. Tokens and Design Language

- [ ] All colors reference CSS custom properties (`var(--accent)`, `var(--t1)`, `var(--surface-0)`). No raw hex values.
- [ ] All spacing uses the 8pt scale (`var(--space-1)` through `var(--space-8)` or 4px multiples).
- [ ] All typography uses semantic tokens (`var(--font-display)`, `var(--font-ui)`, `var(--font-data)`).
- [ ] All border-radius values match the design system (`var(--radius-sm)`, `var(--radius-md)`, `var(--radius-lg)`).
- [ ] No gradients, drop shadows beyond the elevation system, or decorative animations.
- [ ] No emojis unless explicitly required by feature spec.
- [ ] Design language is Hermès Light — ivory surfaces, ink text, burnt-orange accent. No bright colors, vibrant palettes, or consumer-app aesthetics.

### 2. Typography

- [ ] Display headings use Cormorant Garamond (`var(--font-display)`).
- [ ] UI text uses Instrument Sans (`var(--font-ui)`).
- [ ] Data/code uses IBM Plex Mono (`var(--font-data)`).
- [ ] Type hierarchy is clear: one H1/page, H2 for sections, body for content.
- [ ] No inline font-size or font-weight outside token variables.

### 3. Layout and Visual Hierarchy

- [ ] One primary action per screen (see Rule 1 in `docs/bible/20_PRODUCT_RULES.md`).
- [ ] Information hierarchy: most important thing is visually dominant. Not everything is the same size.
- [ ] Page has whitespace. Content does not fill every pixel.
- [ ] No horizontal scroll on any viewport ≥ 1280px.
- [ ] Sidebar is never collapsed by the feature (it is a global layout concern, not a per-page concern).

### 4. Interaction Design

- [ ] Hover states: all interactive elements have a hover state using the token system (`--hover-bg`, opacity shift, etc.).
- [ ] Hover transition: ≤ 80ms.
- [ ] Focus ring: all interactive elements are keyboard-accessible with `var(--focus-ring)` visible focus indicator.
- [ ] Active press: buttons and cards scale `transform: scale(0.98)` on `:active`.
- [ ] Loading states: skeleton placeholders, not empty space or spinners (spinners are allowed for action buttons only).
- [ ] All clickable elements have a pointer cursor.
- [ ] No click targets smaller than 40×40px on touch-capable viewports.

### 5. States

Every component that renders data must have all four states:

- [ ] **Loading:** skeleton card(s) matching the populated layout.
- [ ] **Empty:** explicit message + guidance action (never a blank div or null).
- [ ] **Error:** honest message with a recovery action. No "Something went wrong."
- [ ] **Populated:** the intended design.

### 6. Copywriting

- [ ] All copy reviewed against `docs/bible/19_COPYWRITING.md`.
- [ ] No banned phrases from the banned list.
- [ ] Button labels are verb-first, specific (not "Submit", "OK", "Confirm").
- [ ] Error messages say what went wrong and what to do.
- [ ] Empty states guide the user to a next action.
- [ ] Demo mode labels present where live data is not available.

### 7. AI Responses and Brain UI

- [ ] Confidence scores are never shown to users.
- [ ] Retrieval metadata ("found N records", "based on N chunks") is never shown.
- [ ] AI responses follow the structure: Executive Summary → Key Insights → Recommended Actions → Evidence (collapsed).
- [ ] Evidence panel is collapsed by default.
- [ ] Related prompts or follow-up chips are provided.

### 8. Navigation and Routing

- [ ] New pages have a sidebar entry in the correct group.
- [ ] CommandPalette `NAV_COMMANDS` updated with new route (if user-facing).
- [ ] No dead routes in `NAV_COMMANDS`.
- [ ] Routes follow the established pattern (`/chief`, `/review`, `/knowledge`, etc.).
- [ ] `<Link>` used for in-app navigation. Never `<a href>` for internal routes.
- [ ] Page title (document title) is set for new routes.

### 9. Accessibility

- [ ] All images have `alt` attributes (decorative images: `alt=""`).
- [ ] All interactive elements reachable by Tab key.
- [ ] Focus order follows visual reading order.
- [ ] Color contrast: AA minimum for all body text, AAA preferred for critical UI.
- [ ] No color used as the sole indicator of meaning (status must also have text/shape).
- [ ] ARIA labels on icon-only buttons (`aria-label="Close"`).
- [ ] Modal/slide-over traps focus and returns it on close.
- [ ] `role`, `aria-expanded`, `aria-selected` used where applicable.

### 10. Responsiveness

- [ ] Layout tested at 1280px, 1440px, and 1920px widths.
- [ ] No content overlaps at any tested width.
- [ ] Text does not overflow containers.
- [ ] Tables scroll horizontally on narrow viewports (never cut off).

### 11. Performance

- [ ] No layout shifts when data loads in (reserve space with skeleton, not after load).
- [ ] Images are lazy-loaded if below the fold.
- [ ] No unnecessary re-renders in hot paths (memoize with `useMemo`/`useCallback` if prop-stable).
- [ ] No N+1 data fetches in component trees. Fetch at the page level and pass down.

### 12. Demo Fallbacks

For every page that calls a real API:

- [ ] If the API is unavailable, the page renders demo/cached data with a `"Showing sample data — connect X to go live."` label.
- [ ] Demo fallback is defined (never a blank page or spinner loop).
- [ ] Demo data is realistic (matches the shape of real data, not lorem ipsum).

---

## Synchronous Design Review Process

1. Engineer opens a design PR or shares a Figma/screenshot of the proposed change.
2. Head of Design reviews against all 12 checklist items above.
3. Feedback is given as inline comments or verbal notes.
4. Engineer addresses all feedback.
5. Head of Design approves. Only then does the change proceed to implementation PR.

No feature PR for a new page or component is merged without design approval. This is not optional.

---

## Enterprise UX Standards

FLOW is enterprise software. Its design standards are different from consumer apps.

**What enterprise UX means:**
- **Density.** Enterprise users handle 50+ items per session. Cards are compact. Lists show 10–20 items without pagination banners.
- **Consistency.** Patterns repeat across pages. A user who learns DecisionCard on the Home page recognizes it in Inbox.
- **Trust over delight.** Subtle transitions. No celebration animations. No confetti. No congratulations modals. Success is communicated in one line.
- **Precision over decoration.** Typography scales convey hierarchy, not decoration. Sizes serve information density, not aesthetics.
- **Evidence of work, not magic.** When FLOW does something, it says what it did and cites the source. It does not present results as if by magic.

**What enterprise UX does not mean:**
- Gray, boring, utilitarian. The Hermès Light palette is warm, sophisticated, and premium.
- Dense to the point of anxiety. Whitespace is used intentionally.
- Complexity as a feature. Simple flows, clear primary actions, one thing per page.

---

## Motion Design Rules

Transitions in FLOW serve communication, not decoration.

| Purpose | Duration | Easing |
|---|---|---|
| State change (show/hide) | 120ms | ease-out |
| Slide-over / modal open | 200ms | ease-out |
| Slide-over / modal close | 160ms | ease-in |
| List item appear | 80ms (staggered +20ms) | ease-out |
| Skeleton to content | 0ms (instant, no crossfade) | — |
| Button press | 80ms | ease-in-out |
| Page transition | Not animated — instant | — |

**Never animate:**
- Text color transitions
- Font size or weight changes
- Background shimmer for more than 1.5s
- Parallax or scroll-driven effects
- Persistent pulsing or breathing animations

---

## Common Design Anti-Patterns

These have appeared in FLOW's past. Do not repeat them.

| Anti-pattern | Description | Prevention |
|---|---|---|
| Confidence Theater | Showing AI confidence %, vector scores, or retrieval counts in UI | Rule 3: strip before render in `BrainMessage.jsx` |
| Inline style creep | Using `style={{color: '#E8672B'}}` instead of design tokens | All colors via `var()`. PR review rejects inline hex. |
| Spinner hell | Showing a spinner with no skeleton, no timeout | Skeleton on load; demo fallback if > 8s |
| Empty page on error | Rendering nothing when an API fails | Every page has a fallback state |
| Consumer-app icons | Using emoji icons or colorful icon sets | IBM Carbon icons or SVG-only monochrome icons |
| No empty state | `{items.length > 0 && <List />}` — renders nothing when empty | Always render an explicit EmptyState component |
| Dead nav item | Adding a sidebar item that navigates to a 404 or ComingSoon stub | Never add a nav item without a working destination |
