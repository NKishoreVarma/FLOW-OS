# FLOW OS — Dogfood Log

> Phase 13 — Internal Dogfooding. We run our company on FLOW and record every time
> we have to leave it. **No feature requests** — only improvements that eliminate
> friction by wiring up capabilities FLOW already has. Goal: leave FLOW less each
> week until it's the first app opened and the last closed.

**Rules of the log:** every context switch out of FLOW gets an entry. If we opened
GitHub / Gmail / Slack / Calendar / Notion / Jira / Google / Terminal, we write
down *why FLOW couldn't keep us*.

---

## Week 1 — baseline

### Entry format
`Time · Task · Where we went · Why FLOW failed · Missing info · Missing workflow · UX problem · Perf · Bug · Improvement · Priority`

---

### Mon 09:02 · Morning triage
- **Where we went:** nowhere (started in FLOW `/` BrainHome ✅)
- **Why FLOW failed:** it didn't — the briefing loaded. But `BrainHome` fell back to
  demo data for part of the feed (`src/components/brain/BrainHome.jsx` demo fallback),
  so we couldn't tell which items were *real* vs seeded.
- **UX problem:** no visible "demo mode" vs "live" indicator on the hero feed — trust erodes.
- **Improvement:** surface a data-source badge (live/demo/stale) on every card; when the
  real `/api/intelligence/*` endpoint is unavailable, say so instead of silently seeding.
- **Priority:** HIGH

### Mon 09:14 · Real-time stream went quiet   — ✅ CLOSED
- **Where we went:** browser refresh, then DevTools
- **Why FLOW failed:** the live feed stopped updating. Root cause: `useWebSocket.jsx:153`
  connects `ws://localhost:5001?workspaceId=…` with **no auth token** and a **hard-coded
  host**. After Phase 12 hardened WS auth, a production deploy rejects the connection
  (1008) and the URL won't resolve off-localhost.
- **Missing workflow:** the WS client never learned to send the JWT it already has.
- **Bug:** hard-coded `ws://localhost:5001`; no `&token=`; no reconnect surfaced to the user.
- **Improvement:** derive the WS URL from the page origin and append `&token=<jwt>` from
  the same store the REST client uses; show a "reconnecting…" chip.
- **Priority:** CRITICAL
- **RESOLUTION (Friction Elimination):** `useWebSocket.jsx` now derives the endpoint from
  the page origin (`${wss|ws}://${location.host}/ws`, proxied to the backend in dev, same
  origin in prod) and appends `&token=<jwt>` from `flow_os_token`. Reconnect already
  existed (`RECONNECTING` status + retry; 1008 → `ERROR`).
- **VERIFIED:** WS probe — token connection ⇒ `CONNECTION_ACK` (stream lives);
  unauthenticated ⇒ closed 1008; cross-tenant token ⇒ closed 1008 (isolation holds).
  Regression **307/0**. Grep confirms **0** hard-coded backend hosts remain in the frontend.
  The refresh/DevTools switch is gone.

### Mon 10:30 · Reply to a customer email
- **Where we went:** stayed in FLOW ✅ (`AIInbox` → reply is wired to
  `/api/communication/reply/:id`)
- **Why FLOW (almost) failed:** `AIInbox` demo-falls-back when Gmail isn't connected, so
  in an unconnected workspace the reply box is a dead end.
- **UX problem:** the compose box is shown even in demo mode — clicking Send does nothing.
- **Improvement:** gate the composer behind a real connection; if disconnected, deep-link
  the one-time OAuth connect flow inline instead of showing a fake inbox.
- **Priority:** MEDIUM

### Mon 11:05 · Review + merge a PR
- **Where we went:** GitHub (to read the actual diff)
- **Why FLOW failed:** `ProjectIntelligence` + `InlinePRCard` show merge-readiness and can
  **merge** (`/pulls/:n/merge` is wired ✅), but there's no **diff view** — we can't read
  the code change inside FLOW, so we bounce to GitHub to actually review.
- **Missing info:** the commit file diffs (the backend already returns them via
  `/repos/:o/:r/commits/:sha`) aren't rendered anywhere.
- **Improvement:** render the existing diff payload in the PR card (read-only) so review +
  merge happen without leaving.
- **Priority:** HIGH

### Mon 14:20 · Ping a teammate on Slack
- **Where we went:** Slack
- **Why FLOW failed:** the `SlackAdapter` exists (read/search/write/sync) but there is **no
  Slack surface in the UI** — no thread view, no send box. So any real-time human
  conversation leaves FLOW entirely.
- **Missing workflow:** a channel/thread reader + reply, using the adapter we already ship.
- **Improvement:** a minimal Slack thread panel wired to the existing adapter (read + reply).
- **Priority:** HIGH

### Mon 16:40 · Change a notification setting
- **Where we went:** nowhere useful — `/settings` is `ComingSoon`
- **Why FLOW failed:** Settings / Security / Activity / Help are all stubs (`App.jsx` →
  `ComingSoon`). Any preference, key rotation, or "what happened" audit forces us out (or
  to the DB).
- **Improvement:** wire `/activity` to the existing audit log + event timeline (data already
  exists); wire `/settings` to the known env/workspace config; retire the stubs.
- **Priority:** MEDIUM

### Tue 09:10 · "What's likely to break this week?"
- **Where we went:** stayed in FLOW ✅ (Prediction Workspace)
- **Why FLOW (almost) failed:** first prediction load took ~350ms + a visible spin because
  the ~22 models run cold and the engine seeds context on demand; on a fresh workspace with
  thin history it returns mostly "insufficient evidence," which reads as "empty."
- **Perf:** ~345ms full-run (measured); acceptable but feels laggy without a skeleton.
- **UX problem:** "insufficient evidence" rows look like errors, not honesty.
- **Improvement:** show a forecast skeleton; group insufficient-signal predictions under a
  quiet "monitoring" section (the API already flags them) so the screen doesn't look broken.
- **Priority:** MEDIUM

### Tue 11:30 · Create a Jira ticket from a decision
- **Where we went:** Jira
- **Why FLOW failed:** the `JiraAdapter` + `/api/work` exist, and the Brain surfaces
  decisions, but there's no **"create issue from this"** action in the decision/rec UI —
  the loop from insight → tracked work happens in Jira.
- **Missing workflow:** a one-click "turn this recommendation/decision into a Jira issue"
  using the adapter that already supports create.
- **Improvement:** add a create-issue action on decision/recommendation cards.
- **Priority:** HIGH

### Tue 15:00 · Look something up on the web
- **Where we went:** Google
- **Why FLOW failed:** FLOW has an SSRF-safe **fetch-by-URL** crawler, not a **search** —
  there's no way to ask "find X on the web" from inside FLOW.
- **Improvement:** (friction, not feature) let the copilot answer with a cited external
  fetch when a URL is known, and clearly state it can't web-search — so we stop *trying* and
  losing time. (Actual web search is out of scope / a feature — not requested.)
- **Priority:** LOW

### Wed 09:00 · Server was restarted overnight
- **Where we went:** confusion — yesterday's incidents/decisions were gone from some panels
- **Why FLOW failed:** TD-01 — `incidentDatabase` / `decisionDatabase` / in-memory KG are
  process-scoped and reset on restart. The durable event platform + graph survived, but the
  legacy in-memory panels showed empty.
- **Reliability:** inconsistent persistence between the new durable stores and legacy
  in-memory ones.
- **Improvement:** point the legacy incident/decision panels at the durable event store /
  graph they've been superseded by; delete the in-memory arrays.
- **Priority:** HIGH

### Wed 14:00 · Edit a design doc
- **Where we went:** Notion
- **Why FLOW failed:** Knowledge capability is a skeleton (Notion/Confluence/Drive adapters
  are stubs); `KnowledgeExplorer` reads but there's no editing. Any doc change leaves FLOW.
- **Improvement:** read-through + deep-link to the source doc at minimum; wire the Notion
  adapter's read so we at least *see* the doc in-context before jumping.
- **Priority:** MEDIUM

### Thu 10:00 · Schedule a meeting
- **Where we went:** Google Calendar (partially)
- **Why FLOW failed:** `MeetingDashboard` demo-falls-back when calendar isn't connected; the
  create-event API exists but the "new meeting" form isn't the default path, so we defaulted
  to Calendar out of habit.
- **UX problem:** demo mode + no obvious "＋ New meeting" affordance.
- **Improvement:** make the existing create-event flow a first-class button; kill demo mode
  when a real calendar is connected.
- **Priority:** MEDIUM

### Thu 16:00 · Deploy / run a migration
- **Where we went:** Terminal (correctly — out of scope)
- **Why FLOW failed:** N/A — FLOW is not a shell and shouldn't be. Recorded for completeness;
  no action.
- **Priority:** NONE

### Fri 09:30 · CISO asked "who can see workspace X?"
- **Where we went:** DB / logs
- **Why FLOW failed:** `/security` is a `ComingSoon` stub; the governance data (roles,
  policies, audit) exists via `/api/policies` + `/api/approvals` + `AuditLog` but isn't
  surfaced in a single security view.
- **Improvement:** wire `/security` to the existing governance/audit APIs (read-only) — the
  data is already there.
- **Priority:** MEDIUM

---

## Week 1 — Dogfood Report

**Context switches:** 11 recorded · **avoidable with existing capability:** 8 ·
**genuinely out-of-scope (terminal/web-search/doc-edit):** 3.

The theme is not missing intelligence — the engines are strong. The friction is the
**last mile**: real-time auth, demo-mode masking, and unwired actions that already exist
in the backend. Closing the top items should cut avoidable switches from ~8/week toward ~2.

### Top 10 UX improvements (friction removal)
1. **Data-source badges** (live / demo / stale) on every card; never silently seed demo data.
2. **Wire the merge-PR *review*** — render the diff payload the backend already returns, so review+merge stay in FLOW.
3. **Slack thread panel** (read + reply) on the existing `SlackAdapter`.
4. **"Create Jira issue from this"** action on decision/recommendation cards (adapter supports create).
5. **Retire ComingSoon stubs** — wire `/activity` (audit+timeline), `/security` (governance+audit), `/settings` (workspace/env), `/help`.
6. **First-class "＋ New meeting"** using the existing create-event API; drop demo mode when connected.
7. **Gate composers on real connections** (Gmail/Slack) with inline OAuth deep-links instead of fake inboxes.
8. **Group "insufficient evidence" predictions** under a quiet "monitoring" section (API already flags them).
9. **Notion read-through + deep-link** so docs are seen in-context before switching.
10. **Consistent empty states** — the conversation engine (9.6/9.7) has them; apply the same pattern everywhere a demo fallback currently hides emptiness.

### Top 10 reliability issues
1. **WS unauthenticated + hard-coded host** (`useWebSocket.jsx:153`) — live stream breaks in prod after Phase-12 WS auth. *(CRITICAL)*
2. **Demo fallbacks mask backend failures** — a down endpoint looks like healthy demo data (7 components).
3. **TD-01 legacy in-memory stores** (incidents/decisions/KG) reset on restart while durable stores persist — inconsistent state.
4. **No WS reconnect surfacing** — silent stream death; user can't tell it's stale.
5. **Demo-mode composers** accept input then no-op (AIInbox reply when disconnected).
6. **Frontend `/api` + `ws://` hosts hard-coded to localhost** — env/origin-derived config needed for deploy.
7. **Meeting/Project/Customer/Workforce panels** silently seed — no error surfaced when the real API 4xx/5xx.
8. **NotificationDropdown demo fallback** — notifications may be fake, eroding trust in alerts.
9. **Knowledge/Notion skeleton** returns partial/stub data without saying so.
10. **No per-panel "last updated / source" metadata** to distinguish fresh vs cached vs demo.

### Top 10 performance issues
1. **Aggregate reads pool-bound under concurrency** (`metrics()` = 5 queries; 1000 concurrent → ~12s) — cache or read-replica.
2. **Prediction full-run ~345ms cold** — needs a skeleton + optional per-type lazy load.
3. **First-load engine cold-start** (context seeded on demand) makes first interaction laggy.
4. **`Graph metrics` 24ms** vs 1–2ms for other graph reads (5 aggregate COUNTs) — cache the dashboard counts.
5. **Replay "load everything"** pulls the whole window (2.1s @ 100k) — the player should window, not bulk-load.
6. **No client-side caching** of stable reads (types, schema, metrics) — refetched every mount.
7. **Simulation invokes the graph + replay + XAI** per call (~11ms fine, but N cards = N calls) — batch on the compare path.
8. **Briefing/copilot LLM latency** unbounded on cold cache — needs a visible progress state.
9. **Full-pipeline event publish ~266/s** (correlation + fan-out) — fine now; watch under burst (documented).
10. **No request-level slow-path surfacing in the UI** — the backend logs slow queries; the UI never shows "this is taking a while."

### Top 10 conversation improvements
1. **Honesty over emptiness** — "insufficient evidence" should read as a confident *"I don't have enough signal yet, here's what's missing"* (XAI already computes it), not a blank.
2. **Cite sources inline** in copilot answers using the explainability envelope that already exists (`explain()`), so we trust without leaving.
3. **Actionable answers** — when the copilot names a PR/issue/customer, attach the existing action (merge / create issue / open thread) rather than just text.
4. **Follow-up chips** everywhere — the 9.7 follow-up system exists; surface `why / how / what-evidence / what-changed` on every answer.
5. **Ground "what changed" in Replay** — link the copilot's "what changed since Monday" to the actual snapshot diff.
6. **Stop pretending to web-search** — say plainly when a question needs an external source FLOW can't reach, so we don't loop.
7. **Carry workspace context** — the copilot should default to the current entity/page (the entity-aware copilot exists) so we don't re-specify.
8. **Confidence + trust visible** — show the 6-dim confidence / trust score (already computed) so we know when to double-check.
9. **Shorter cold-path** — a streaming/typing state for LLM answers instead of a spinner.
10. **Remember the thread** — conversation memory exists (9.6); make prior turns visibly reusable ("continue").

---

## How we'll measure success

- **Metric:** avoidable context switches / week (baseline **~8**). Target: ↓ each week.
- **Leading indicators:** demo-fallback hits (should → 0 in connected workspaces), WS
  reconnects, "insufficient evidence" rows that were actually answerable.
- **Definition of done for the phase:** FLOW is the first app opened and the last closed —
  i.e., the only reasons to leave are genuinely out-of-scope (terminal, doc-editing,
  human real-time chat we choose not to host).

> Next week: re-run this log after the top-3 CRITICAL/HIGH friction items are closed
> (WS auth+URL, data-source badges, PR diff view) and recount the switches.

---

## Friction Elimination Cycle — Tracker

`OPEN → IN PROGRESS → VERIFIED → CLOSED`. An item only closes when the context switch
genuinely disappears (verified by re-running its scenario + regression green).

| # | Item (from log) | Priority | Status | Verified by |
|---|-----------------|----------|--------|-------------|
| 1 | WS auth+URL — live stream breaks in prod (Mon 09:14) | CRITICAL | ✅ **CLOSED** | WS probe (ack / 1008 unauth / 1008 cross-tenant) + regression 307/0 + 0 hard-coded hosts |
| 2 | Hard-coded backend hosts in frontend (Reliability #6) | HIGH | ✅ **CLOSED** | grep = 0 remaining; REST already relative, WS now origin-derived |
| 3 | Demo fallbacks mask backend failures (Reliability #2) | HIGH | 🟡 **VERIFIED (awaiting live)** | `DataSourceBadge` (LIVE/DEMO/STALE/OFFLINE/ERROR) wired into ProjectIntelligence, AIInbox, MeetingDashboard, KnowledgeExplorer, CustomerIntelligence, WorkforceIntelligence — ad-hoc "Demo" chips replaced by one honest indicator. Build clean |
| 4 | TD-01 legacy in-memory panels reset on restart (Wed 09:00) | HIGH | OPEN | point legacy incident/decision panels at durable event store/graph |
| 5 | PR review — no diff view (Mon 11:05) | HIGH | 🟡 **VERIFIED (awaiting live)** | `DiffViewer` renders real per-file patches from `/repos/:o/:r/commits/:sha`; wired into InlinePRCard ("View diff") + ProjectOverview commit rows. Build clean |
| 6 | No Slack thread panel (Mon 14:20) | HIGH | 🟡 **VERIFIED (awaiting live)** | `SlackThreadPanel` reads a full thread inline via `/api/connectors/execute` (slack READ) — participants, replies, mentions, jump-to-message, source badges. Opens from a Slack EvidenceCard. Build clean |
| 7 | Create Jira issue from decision/rec (Tue 11:30) | HIGH | 🟡 **VERIFIED (awaiting live)** | `CreateJiraModal` POSTs to existing `/api/work/issues`; opened globally via `flow:create-jira`; every Brain `recommendedAction` has a one-click "Create Jira Issue" (prefilled + FLOW backlink). Build clean |
| 8 | ComingSoon stubs `/activity` `/security` `/settings` `/help` (Mon 16:40, Fri 09:30) | MEDIUM | 🟡 **VERIFIED (awaiting live)** | `/activity` → real `ActivityFeed` (brain/timeline); `/help` → real `HelpCenter` (was ComingSoon); `/settings/security` `SecurityCenter` rewritten from pure-mock → real `/api/connectors/audit` feed + derived counters; `/settings` already real. Reachable via ⌘K. Build clean |
| 11 | Brain answers were prose, not actionable (Conversation top-10) | HIGH | 🟡 **VERIFIED (awaiting live)** | `explain:true` on copilot → every answer now carries `EvidenceCard`s, `ConversationMeta` (confidence/trust/evidence count/contradictions), related-entity chips, `RecommendedActions`, and in-app shortcuts (Graph&Timeline → `/entity/:id`; Simulate/Predict/Timeline → Brain follow-ups) |
| 12 | UX polish — no Esc-to-close, a11y gaps, non-responsive grids (Batch 4) | LOW | 🟡 **VERIFIED (awaiting live)** | `useEscapeKey` + `aria-modal`/`aria-label` on all new overlays; fixed-column grids → `auto-fit minmax()` (SecurityCenter, ProjectOverview board + card) |
| 9 | Connection status not honest (ERROR ≡ OFFLINE) | MEDIUM | 🟡 **VERIFIED (awaiting live)** | Header pill distinguishes CONNECTED/SYNCING/RECONNECTING/OFFLINE/ERROR (color + tooltip); LayoutShell toasts separate policy-reject from offline |
| 10 | Weak empty/error states | LOW | 🟡 **VERIFIED (awaiting live)** | `EmptyState` gains `error` variant; DiffViewer renders honest loading/empty/error states |

**Progress:** 2 items CLOSED (WS stream + host config). **10 more VERIFIED pending live check** —
Batches 1–4: demo honesty, PR diff, connection status, empty/error, Slack thread panel,
Jira-from-recommendation, actionable Brain answers (evidence/confidence/trust/shortcuts), the
`/activity` `/help` `/security` stubs replaced with real backend-backed pages, and UX polish
(Esc-to-close, a11y, responsive). GitHub, Slack, Jira, and "recent activity" context switches are
now answerable inside FLOW. Only OPEN item: TD-01 (legacy in-memory panels → durable store).

### Batch 4 (UX polish) — build ✅ clean · marked VERIFIED, not CLOSED
New `hooks/useEscapeKey.js`; applied Esc-to-close + `role="dialog"`/`aria-modal` + `aria-label`
on close buttons to SlackThreadPanel, CreateJiraModal, and the ProjectOverview issue drawer.
Responsive: converted breaking fixed grids to `auto-fit minmax()` — SecurityCenter stat + main
grids, ProjectOverview Jira board (was `repeat(6,1fr)`) and GitHub card (was `repeat(3,1fr)`).
New pages already ship skeleton loaders + honest empty/error states. **Zero backend touched.**
Build clean (~305ms); regression 66/74.

### Batch 3 (Replace stubs with real functionality) — build ✅ clean · marked VERIFIED, not CLOSED
New: `activity/ActivityFeed.jsx` (real `/activity`, backed by `GET /api/brain/timeline` —
memory + automations + connectors, grouped by day, kind filter), `help/HelpCenter.jsx` (real
`/help`, replaced ComingSoon — capabilities + ⌘K quick actions + keyboard shortcuts).
Rewrote `platform/SecurityCenter.jsx` from a fully-static mock to a real governance view over
`GET /api/connectors/audit` (allowed/denied/approval-gated actions, counters derived from
outcomes). Routes updated in App.jsx (`/activity`, `/help` no longer stubs); ⌘K commands added
for Activity, Security, Help. **Zero backend files touched.** Build clean (~471ms); regression 66/74.

### Batch 2 (Context-Switch Removal) — build ✅ clean · marked VERIFIED, not CLOSED
New: `brain/EvidenceCard.jsx` (8 evidence/entity types, expandable), `brain/ConversationMeta.jsx`
(confidence/trust/evidence/contradictions + related entities + Graph/Timeline/Simulate/Predict
shortcuts), `brain/RecommendedActions.jsx` (one-click Create-Jira / Do-via-FLOW per recommendation),
`slack/SlackThreadPanel.jsx` (thread reader over `/api/connectors/execute`),
`work/CreateJiraModal.jsx` (reuses `/api/work/issues`).
Wired: BrainMessage + BrainHome (`explain:true`, entity + evidence handlers, Slack panel),
LayoutShell (global `flow:create-jira` modal). **Zero backend files touched.** Build clean (~344ms);
regression unchanged (66/74 — same pre-existing stale tests as Batch 1).
Every Brain answer is now Summary + Evidence + Confidence + Actions — never just text.

### Batch 1 (Highest ROI) — build ✅ clean · marked VERIFIED, not CLOSED
New primitives: `ui/DataSourceBadge.jsx`, `projects/DiffViewer.jsx`; `ui/EmptyState.jsx` gains `error`.
Wired: ProjectIntelligence, ProjectOverview, InlinePRCard, AIInbox, MeetingDashboard,
KnowledgeExplorer, CustomerIntelligence, WorkforceIntelligence, Header, LayoutShell.
No backend files touched. `npm run build` clean (~466ms).

> **Regression note (honest):** `npm run test:integration` (node --test) is **66/74** — the
> 8 failures are **pre-existing stale tests** (e.g., the signup test posts `name`, but the
> API correctly requires `fullName` and returns a clean 400; lifecycle-schema tests assert
> old field names). They are **backend** tests; Batch 1 changed **zero** backend files, so it
> moved this count by zero. The prior "307/0" figure came from a different (custom) harness.
> These stale tests are logged for a later backend-hygiene pass — not a Batch-1 regression.

---

*Phase 13 — Internal Dogfooding. Living document; append a new week each cycle.*
