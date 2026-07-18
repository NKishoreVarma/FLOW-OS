# FLOW OS — QA Checklist
**Document:** GOV-07  
**Status:** Mandatory  
**Applies to:** All features before staging deployment  
**Last updated:** 2026-07-18

---

## How to Use This Checklist

QA is run on a local or shared QA environment by either a dedicated QA engineer or the implementing engineer + a peer. Every item must be explicitly checked — not assumed. Items marked N/A must have a written reason.

The QA checklist is attached to the PR as a comment. It is not embedded in the code.

---

## Section 1: Functional Testing

### 1.1 Primary Path

- [ ] The feature's primary use case works end-to-end as specified.
- [ ] The primary action button completes successfully and shows a confirmation.
- [ ] The result of the action is reflected in the UI without a full-page reload.
- [ ] Refreshing the page after an action preserves the result (not ephemeral state).

### 1.2 Edge Cases

- [ ] Empty input handled gracefully (form validation shows message, not a crash).
- [ ] Maximum input (long strings, many items) handled without UI overflow.
- [ ] Special characters in input (apostrophes, quotes, angle brackets) do not break rendering or cause injection.
- [ ] Concurrent actions (two users performing the same action simultaneously) do not produce duplicate records or silent failures.

### 1.3 States

- [ ] **Loading state** renders correctly (skeleton, not blank space).
- [ ] **Empty state** renders with a guidance message and at least one action.
- [ ] **Error state** renders with an honest message and a recovery path.
- [ ] **Demo/fallback state** renders with correct `"Showing sample data — connect X to go live."` label.
- [ ] Transitions between states are smooth (no flicker or unexpected blank moments).

### 1.4 Permissions

- [ ] Feature is inaccessible to users without the required role (403 returned, not a blank screen).
- [ ] ADMIN-only features do not render controls for MEMBER users (not just hidden — not fetched).
- [ ] OWNER-only governance actions (policy create/delete) rejected for ADMIN users.
- [ ] Cross-workspace data access returns 403 (not data from the wrong workspace).

### 1.5 Tenant Isolation

- [ ] API endpoints return data only for the workspace in the `workspace-id` header.
- [ ] Changing the workspace-id header to a different workspace returns either 403 or 404, never data from the other workspace.

---

## Section 2: UX Testing

### 2.1 Navigation

- [ ] New page is accessible from the sidebar in the correct group.
- [ ] New route appears in `⌘K` CommandPalette.
- [ ] No dead routes in the sidebar or CommandPalette (every item navigates to a working page).
- [ ] Browser back button works correctly from the new page.
- [ ] Deep link to the new page loads correctly (no redirect to home).

### 2.2 Interactions

- [ ] All interactive elements respond to hover within 80ms.
- [ ] All buttons show feedback (loading state) when an action is in progress.
- [ ] No action can be double-submitted (button is disabled while processing).
- [ ] Slide-overs and modals open and close correctly (backdrop click + Escape key).
- [ ] Forms preserve state if the user closes and reopens within the same session.

### 2.3 Copy and Language

- [ ] All UI copy reviewed against `docs/bible/19_COPYWRITING.md`.
- [ ] No banned phrases in any visible string.
- [ ] Button labels are verb-first and specific.
- [ ] Error messages say what went wrong, not "something went wrong."
- [ ] Notifications follow the `[What happened] + [What to do]` format.
- [ ] No AI confidence scores, retrieval counts, or vector similarity scores visible.

### 2.4 Demo Mode

- [ ] When the connector is not authenticated, demo data renders with the correct label.
- [ ] Demo data is realistic (matches real data shape, not placeholder text).
- [ ] Real data replaces demo data when the connector is authenticated (no stale demo labels).

---

## Section 3: Accessibility

### 3.1 Keyboard Navigation

- [ ] All interactive elements reachable with Tab key in logical order.
- [ ] No "keyboard trap" — Tab can exit every focus context.
- [ ] Modal/slide-over traps focus correctly while open; returns focus to trigger on close.
- [ ] Primary actions reachable without a mouse.
- [ ] Enter and Space keys activate buttons and checkboxes.
- [ ] Arrow keys navigate lists and menus where expected.

### 3.2 Visual Accessibility

- [ ] Focus indicator visible on all focusable elements (using `var(--focus-ring)` or equivalent).
- [ ] Color contrast meets WCAG AA for all body text.
- [ ] Status indicators use shape/text in addition to color (not color alone).
- [ ] Text does not overlap at any zoom level from 100% to 150%.
- [ ] No content hidden using `visibility: hidden` or `opacity: 0` that is still in the tab order.

### 3.3 Screen Reader

- [ ] Icon-only buttons have `aria-label`.
- [ ] Dynamic content (lists that update, live notifications) have appropriate ARIA live regions.
- [ ] Form inputs have associated labels (not just placeholder text).
- [ ] Error messages are associated with their input fields via `aria-describedby`.

---

## Section 4: Performance

### 4.1 Load Time

- [ ] New page loads visible content within 1.5 seconds on fast connection.
- [ ] New API endpoint responds in ≤200ms p95 (measured locally with `time curl`).
- [ ] No page-level loading spinner persists beyond 8 seconds (demo fallback kicks in).

### 4.2 AI Endpoints

- [ ] AI endpoints respond within the timeout budget (see `09_PERFORMANCE_BUDGET.md`).
- [ ] Streaming AI responses start delivering within 3 seconds.
- [ ] Fallback activates if AI takes >60 seconds (council, simulation) or >30 seconds (copilot, briefing).

### 4.3 Memory and CPU

- [ ] New feature does not cause memory growth in a steady-state loop (check via `/metrics/infra`).
- [ ] No visible CPU spike from animation or polling in the frontend.

---

## Section 5: Security

### 5.1 Authentication

- [ ] Unauthenticated requests to protected routes return 401.
- [ ] Expired JWT returns 401 (not 500 or a crash).
- [ ] JWT from one organization cannot be used to access another organization's workspace.

### 5.2 Authorization

- [ ] ADMIN actions blocked for MEMBER role.
- [ ] OWNER actions blocked for ADMIN role.
- [ ] Governance DENY returns 403 with a useful message.
- [ ] Approval-required actions return the `approvalId` (not silently succeed or fail).

### 5.3 Input Validation

- [ ] No SQL injection vector in new inputs (parameterized queries verified in code review).
- [ ] No XSS in rendered AI output (output rendered as text, not `dangerouslySetInnerHTML`).
- [ ] No SSRF — outbound URL fetches go through `crawlerService.js`.
- [ ] File uploads (if any) validate type and size before processing.

### 5.4 Sensitive Data

- [ ] API responses do not include JWT tokens, passwords, or API keys.
- [ ] Server logs do not contain PII, email body text, or Slack message content.
- [ ] `PRIVATE_PERSONAL` classified content does not appear in any DB table or log.

---

## Section 6: AI Behavior

### 6.1 Response Quality

- [ ] AI responses follow the structure: Executive Summary → Key Insights → Recommended Actions → Evidence.
- [ ] No AI self-reference ("As an AI...", "I'm an AI language model...").
- [ ] No confidence scores in user-facing response.
- [ ] No retrieval metadata in user-facing response.
- [ ] Response is actionable — at least one action is recommended.

### 6.2 Fallback Behavior

- [ ] Feature works without `GEMINI_API_KEY` set (local fallback produces useful output).
- [ ] Feature works when Gemini API returns an error (fallback activates, no crash).
- [ ] Fallback output is clearly different from no output (never a blank message or undefined).

### 6.3 Privacy

- [ ] AI calls do not include raw PII in the prompt beyond what is necessary.
- [ ] Content classified as `PRIVATE_PERSONAL` is never passed to Gemini.

---

## Section 7: Integration (Connector) Testing

(Run only for features that touch connectors or the Universal Connector Framework)

### 7.1 Connected State

- [ ] Feature works correctly when the connector is authenticated.
- [ ] OAuth flow initiates correctly and returns to the right callback URL.
- [ ] Token refresh works when the access token expires.
- [ ] Disconnect/revoke clears credentials and returns to unauthenticated state.

### 7.2 Disconnected State

- [ ] Feature renders demo data when connector is not authenticated.
- [ ] Demo label is present and accurate.
- [ ] No API call is made when the connector is not connected (no unnecessary error logs).

### 7.3 Governance

- [ ] Trust Center permission controls which resources are included in the feature.
- [ ] Excluded resources do not appear in the feature's data (denied at the gate, not filtered in UI).
- [ ] Governance DENY returns 403 before any connector action executes.

---

## Section 8: Regression Testing

- [ ] Home page (`/`) — Decision Stream and Command Center work correctly.
- [ ] Brain (`/brain`) — Sends a question, receives a streaming response.
- [ ] Chief of Staff (`/chief`) — Action cards render with correct priorities.
- [ ] Inbox (`/inbox`) — Items load and mark-as-done works.
- [ ] Engineering (`/projects`) — Repo list loads (or demo fallback shows).
- [ ] Meetings (`/meetings`) — Upcoming events show (or demo fallback shows).
- [ ] Trust Center (`/integrations`) — Connector cards render with correct health status.
- [ ] `/api/health` — Returns 200.
- [ ] `/health/ready` — Returns 200 (staging only; requires DB + Redis).
- [ ] WebSocket — Real-time events arrive in the live feed panel.

---

## Bug Severity Classification

| Severity | Definition | Response time |
|---|---|---|
| S1 (Critical) | Data loss, security breach, production down, PII exposed | Hotfix; same-day |
| S2 (High) | Feature completely broken, governance bypass, crash | Blocks release; fix before staging |
| S3 (Medium) | Feature partially broken, wrong data shown, performance regression | Fix before production |
| S4 (Low) | Visual glitch, copy error, minor UX issue | Fix in next sprint |

Only S3 and below may proceed to staging with a tracked ticket. S1 and S2 block all progress.
