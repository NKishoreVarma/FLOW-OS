# Blueprint: Onboarding — `/welcome`
**Document:** BP-14  
**Last updated:** 2026-07-18  
**Status:** Authoritative

---

## Purpose

Answer one question: **"How do I get FLOW working for my company in under 10 minutes?"**

The onboarding flow takes a new user from zero to a live Morning Brief with real company data. It is the primary first-impression of FLOW. Every step answers one decision and gives the user a reason to continue.

---

## Target User

**Primary:** OWNER (the person who installed FLOW — typically the CTO)  
**First use:** Always shown on first login when `onboarding.completed = false`  
**Re-access:** `/welcome` URL available at any time

---

## Entry Points

| Source | How |
|---|---|
| First login | `FirstRunGate` detects incomplete onboarding, redirects to `/welcome` |
| Sidebar | Platform group → "Get started" (visible until onboarding complete) |
| Direct URL | `/welcome` |

---

## First-Run Gate Behavior

`FirstRunGate.jsx` wraps the entire app. On mount:
1. Check `localStorage['flow_onboarding_complete']` — if `"true"`, pass through
2. If not, call `GET /api/onboarding/state?workspaceId={ws}`
3. If `completed: false`, redirect to `/welcome`
4. **Fail-open:** if the API call fails (network error, server down), set `localStorage['flow_onboarding_dismissed'] = "true"` and allow the user through — never trap a session

Manual skip: `[Skip for now →]` on any step sets `localStorage['flow_onboarding_dismissed'] = "true"`. User is not redirected again during the session. On next login, the gate checks again.

---

## Layout

```
┌─────────────────────────────────────────────────────────────────┐
│  position: fixed; inset: 0; z-index: 4000                       │
│  background: var(--surface-0)                                   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  [FLOW logo]              Step 2 of 5    [Skip for now] │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌──────────────────┐  ┌──────────────────────────────────┐    │
│  │  Step progress   │  │  Current step content            │    │
│  │  sidebar (200px) │  │  (main area)                     │    │
│  │                  │  │                                  │    │
│  │  ● 1. Welcome    │  │                                  │    │
│  │  ● 2. Discover   │  │                                  │    │
│  │  ○ 3. Permissions│  │                                  │    │
│  │  ○ 4. Build      │  │                                  │    │
│  │  ○ 5. Ready      │  │                                  │    │
│  └──────────────────┘  └──────────────────────────────────┘    │
│                                                                 │
│  [← Back]                                      [Continue →]    │
└─────────────────────────────────────────────────────────────────┘
```

---

## Step 1: Welcome

**Decision:** Use real company data or demo company data?

```
Welcome to FLOW.
Your company's operating system.

FLOW connects to the tools your team uses and turns the noise into a single 
executive view — priorities, risks, actions, and answers.

How do you want to start?

[ Connect your company ]          [ Try with Acme Corp demo data ]
  Your real GitHub, Gmail,          Full demo company with 30 days
  Calendar, Slack, and Jira.        of realistic activity. No setup.
  Start with what you already use.

[Skip for now →]
```

**Connect your company** → advance to Step 2 (Discover) in **live mode**  
**Try with Acme Corp demo data** → advance to Step 2 (Discover) in **demo mode** — seeds the Living Workspace Simulator

State is stored in: `PATCH /api/onboarding/state` with `{ step: 'discover', mode: 'live' | 'demo' }`

---

## Step 2: Discover (Live Mode)

**Decision:** Which connectors to connect.

```
What does your team use?

We'll connect to these tools and discover your resources.
You control exactly what FLOW can see in the next step.

GITHUB                           [Connect →]  / [✓ Connected]
Your code, PRs, and deployments.

GMAIL                            [Connect →]  / [✓ Connected]
Your email threads and context.

GOOGLE CALENDAR                  [Connect →]  / [✓ Connected]  
Your meetings and prep context.

SLACK                            [Connect →]  / [✓ Connected]
Your team conversations.

JIRA                             [Connect →]  / [✓ Connected]
Your issues and sprints.

NOTION                           [Connect →]  / [✓ Connected]
Your knowledge base.

[Connect later]   [Continue with N connected →]
```

`[Connect →]` triggers `POST /api/connectors/{id}/auth/initiate` → opens OAuth consent in a new tab. On OAuth completion, the tab closes and this page polls `GET /api/integration-permissions?workspaceId={ws}` to detect the new connection.

Each newly connected source shows a brief discovery animation:
```
[✓ GitHub]  Discovering... 12 repos found
```

`[Connect later]` = treat as `[Continue]` — user can connect after onboarding.

---

## Step 2: Discover (Demo Mode)

```
Meet Acme Corp.

Your demo company: 45 employees, 12 repos, 3 enterprise customers.
FLOW has 30 days of pre-built activity.

DISCOVERING...
  ✓ GitHub     12 repositories
  ✓ Gmail      847 emails
  ✓ Calendar   23 meetings
  ✓ Slack      34 channels
  ✓ Jira       156 issues
  ✓ Notion     89 pages

[Continue →]
```

Demo discovery calls `POST /api/simulator/seed` (Living Workspace Simulator) — no real OAuth. Discovery list is deterministic from the Acme Corp demo catalog.

---

## Step 3: Permissions

**Decision:** What exactly can FLOW read?

```
What can FLOW see?

Review the resources we discovered and decide what FLOW is allowed to understand.
Anything you hide will never be read, stored, or analyzed.

GITHUB — 12 repositories
✓ Allow all  /  [Review each →]

  ✓ flow-os-backend        ✓ flow-os-frontend
  ✓ infra-config           ✗ personal-notes  ← pre-hidden by name match
  ✓ auth-service           ✓ payments

GMAIL — Labels
✓ Inbox, Sent  ●  ✗ Social, Promotions ← pre-hidden by category

SLACK — 34 channels
✓ Allow all public channels  ●  ✗ Hide private channels (recommended)

[Apply and continue →]
```

Pre-hiding logic (client-side heuristic, not persisted until confirmed):
- Repository names containing: `personal`, `test`, `archive`, `scratch`, `backup` → pre-hidden
- Gmail labels: `Social`, `Promotions`, `Spam` → pre-hidden
- Slack channels: `private_channel` type → pre-hidden by default

`[Apply and continue →]` calls `PUT /api/integration-permissions/{connector}/resources` for each connector with the selected state.

Demo mode: same UI, but toggles affect the demo catalog only.

---

## Step 4: Build

**Decision:** None — narrated build process.

```
Building your workspace...

FLOW is processing your company's context.
This usually takes 1–3 minutes.

[ ✓ ] Validating workspace
[ ✓ ] Importing people and team structure
[ ✓ ] Syncing repositories and pull requests
[ ✓ ] Processing emails and conversations
[ ✓ ] Building calendar context
[  ●  ] Building knowledge graph     ████████████████░░ 80%
[   ] Generating embeddings
[   ] Computing predictions
[   ] Warming up your briefing
```

- Progress driven by `GET /api/lifecycle/history?workspaceId={ws}` — polls every 3s
- WebSocket `LIFECYCLE_STAGE_COMPLETED` events update the checklist in real time
- No spinner only — each item is a named stage (never "Loading...")
- On complete: transition to Step 5 with a 500ms fade

---

## Step 5: Ready

```
You're ready.

FLOW has finished processing Acme Corp.

YOUR MORNING BRIEF

[Morning brief preview card]
Good morning, Rahul.
3 priorities · 1 critical

• Release 2.5 blocked — Merge conflict in flow-os-backend
• Acme Corp at-risk — 3 support tickets this week
• Q3 review scheduled — Prep needed for tomorrow

[Open FLOW →]  [Invite your team →]
```

The Morning Brief preview reads from `GET /api/workspace/snapshot` — real WIC data.

`[Open FLOW →]` → `/` (Home, `localStorage['flow_onboarding_complete'] = 'true'`)  
`[Invite your team →]` → `/settings/team`

---

## Progress Persistence

Onboarding state is stored in Redis: `onboarding:state:{workspaceId}` with fields:
- `step`: current step name
- `mode`: `live` | `demo`
- `connectedSources`: array of connector IDs
- `completed`: boolean
- `startedAt`: ISO timestamp
- `completedAt`: ISO timestamp

If the user leaves mid-flow, returning to `/welcome` resumes at the last completed step.

`GET /api/onboarding/state?workspaceId={ws}` — reads state  
`PATCH /api/onboarding/state?workspaceId={ws}` — updates step

---

## Command Center on Onboarding Pages

StickyCommandCenter is disabled during onboarding. The overlay covers the full screen (z-index: 4000). No `⌘K`, no Brain queries during setup.

---

## Loading States

| Step | Loading |
|---|---|
| Welcome | Renders immediately (no API call needed) |
| Discover (live) | Connector status: `"Checking..."` per connector (1 API call) |
| Discover (demo) | `"Seeding Acme Corp..."` (500ms minimum display even if fast) |
| Permissions | Resource catalog loads; 5 row skeletons per connector |
| Build | Named stages with progress bars; never a bare spinner |
| Ready | Brief preview: skeleton card for ≤2s |

---

## Empty State

**No connector connected on Step 3:**
```
Nothing to configure yet.
You haven't connected any sources.
[← Go back and connect sources]  [Continue with demo mode]
```

---

## Error States

| Scenario | Message |
|---|---|
| OAuth fails (connector tab closes with error) | `"Unable to connect {connector}. [Retry] [Skip]"` |
| Discovery fails | `"Discovery unavailable. You can govern permissions later. [Continue]"` |
| Build fails (lifecycle stage fails) | `"Setup hit an issue at [stage name]. [Retry stage] [Contact support]"` |
| State API fails | Fail-open: allow through with `localStorage` flag |

---

## Keyboard Shortcuts

| Key | Action |
|---|---|
| `→` / `Enter` | Continue to next step |
| `←` | Back to previous step |
| `Escape` | `[Skip for now]` confirmation dialog |

---

## Accessibility

- Overlay: `role="dialog"`, `aria-modal="true"`, `aria-label="FLOW setup"`
- Step progress sidebar: `role="list"`, each item `role="listitem"`, completed items `aria-label="{step} — complete"`
- Connector toggles: `role="checkbox"`, `aria-checked`
- Build stage list: `role="list"`, each stage `aria-label="{stage} — {status}"`
- Progress bars (Build step): `role="progressbar"`, `aria-valuenow`, `aria-valuemax="100"`

---

## Responsive Behavior

| Viewport | Behavior |
|---|---|
| ≥1280px | Full layout with progress sidebar |
| 1024px–1279px | Same |
| 768px–1023px (tablet) | Progress bar replaces step sidebar; steps stack |

---

## Telemetry Events

| Event | Trigger | Properties |
|---|---|---|
| `onboarding.started` | Step 1 mount | `{}` |
| `onboarding.mode.selected` | Welcome choice | `{ mode: 'live' \| 'demo' }` |
| `onboarding.connector.connected` | OAuth complete | `{ connector }` |
| `onboarding.permissions.applied` | Step 3 continue | `{ connectors, allowedCount, hiddenCount }` |
| `onboarding.build.completed` | Step 4 complete | `{ durationMs }` |
| `onboarding.completed` | Step 5 mount | `{ mode, connectedCount, durationMs }` |
| `onboarding.skipped` | Skip link clicked | `{ stepAtSkip }` |
| `onboarding.team_invite.clicked` | Step 5 invite button | `{}` |

---

## Acceptance Criteria

- [ ] `FirstRunGate` redirects to `/welcome` when `onboarding.completed = false`; fails open on API error.
- [ ] `[Skip for now]` sets localStorage flag and does not trap the session.
- [ ] Step 1 choice (live/demo) persists to Redis via API.
- [ ] Live mode: OAuth connect opens in new tab; page detects completion via polling.
- [ ] Demo mode: `POST /api/simulator/seed` called; Acme Corp resources displayed.
- [ ] Step 3: pre-hiding logic hides `personal/test/archive` repos and Social/Spam Gmail labels.
- [ ] Step 4: uses named lifecycle stages, never a bare spinner; WebSocket updates in real time.
- [ ] Step 5: Morning Brief preview reads real WIC data.
- [ ] Returning mid-flow resumes at last completed step.
- [ ] StickyCommandCenter and `⌘K` are disabled during onboarding.
- [ ] All telemetry events fire.
