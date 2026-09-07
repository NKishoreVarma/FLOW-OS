# FLOW OS — Decision-Centric Experience Design
**Date:** 2026-07-18  
**Phase:** Phase 4 (UX) + Conversational Experience Redesign  
**Constraint:** No new AI, no new backend, no new databases, no new API calls that do not already exist.

---

## 1. Mission

Every screen in FLOW must answer one question: **"What should I do next?"** — in under 60 seconds.

FLOW is an Enterprise Operating System. The redesign does not sacrifice capability for minimalism. Every major feature must remain discoverable. The interaction model changes. The feature set does not shrink.

---

## 2. Information Architecture

### 2.1 Navigation Hierarchy

Two navigation tiers in the sidebar. Primary tier: the five daily-use surfaces. Platform tier: four expandable groups that expose every capability in the product.

```
PRIMARY
  Home            /
  Inbox           /inbox
  Engineering     /projects
  Meetings        /meetings
  Knowledge       /knowledge

PLATFORM
  Integrations ▶ (expandable)
    Connection Hub      /integrations
    Trust Center        /integrations/trust (alias: same page, tab)
    Sync Status         /integrations/sync

  Workspace ▶ (expandable)
    Users & Roles       /settings/iam
    Workspaces          /settings/workspaces
    Admin               /settings

  AI ▶ (expandable)
    Conversation History  /brain/history
    Memory               /brain/memory
    Preferences          /brain/preferences

  System ▶ (expandable)
    Workspace Health    /settings/health
    Audit Logs          /settings/audit
    Notifications       /activity
    Security            /settings/security
    API Keys            /settings/api-keys
```

**Behavior:** Clicking a group header toggles inline expansion. Groups persist their open/closed state in `localStorage`. The StickyCommandCenter at the bottom of the shell provides instant jump-to-any-page via `/` slash commands, making deep discoverability fast regardless of sidebar state.

### 2.2 Routes Added

| Path | Component | Replaces |
|---|---|---|
| `/integrations` | `TrustCenter` | `/settings/permissions` (kept as redirect) |
| `/integrations/sync` | `TrustCenter` with sync tab active | — |
| `/brain/history` | `BrainHistory` | — |
| `/brain/memory` | `BrainMemory` | — |
| `/brain/preferences` | `BrainPreferences` | — |

---

## 3. Component Architecture

Seven reusable primitives. No page-specific logic inside components.

```
src/components/decisions/
  DecisionCard.jsx        — atomic action card: situation · recommendation · impact · actions · evidence
  DecisionStream.jsx      — ordered card list, empty/loading states, max 5 cards
  DecisionSlideOver.jsx   — universal right-side action panel, reused on all pages
  ExecutiveHero.jsx       — page hero, same component/props across all 4 pages
  EvidencePanel.jsx       — collapsible evidence list (used inside cards AND slide-over)
  ActionBar.jsx           — primary + secondary action buttons with risk badges

src/components/command/
  StickyCommandCenter.jsx — persistent bottom composer, mounted in LayoutShell

src/components/integrations/
  TrustCenter.jsx         — connector overview + per-connector governance
  ConnectorPanel.jsx      — per-connector resource list (two-column: can see / cannot see)
  ResourceToggle.jsx      — individual resource row with toggle, last-sync, inclusion status
```

### 3.1 DecisionCard Data Shape

Compatible with existing `actionCardService.buildActionCard()` output. The mapper is a thin adapter — no backend change.

```js
{
  id: string,
  type: string,
  source: string,
  situation: string,        // e.g. "Release 2.5 is blocked"
  recommendation: string,   // e.g. "Approve the migration now"
  impact: 'critical' | 'high' | 'medium' | 'low',
  impactLabel: string,      // e.g. "Blocks 3 engineers, delayed 18h"
  primaryAction: { label: string, workflowId: string, risk: string },
  secondaryActions: [{ label: string, workflowId: string, risk: string }],
  evidence: [{ source: string, text: string, at: string }],
}
```

---

## 4. Homepage — Decision Stream

`MorningBriefing.jsx` becomes a thin orchestration layer. All UI comes from primitives.

**Above the fold — exactly this, nothing else:**
```
ExecutiveHero             (situation + priority + 1 recommended action)
DecisionCard #1 — critical
DecisionCard #2 — high
DecisionCard #3 — medium
StickyCommandCenter       (fixed bottom, mounted in LayoutShell)
```

**Data sources:**
- `GET /api/autonomous/chief-of-staff` → top 5 NOW items → mapped to DecisionCards
- `GET /api/workspace/snapshot` → WIC instant cache → ExecutiveHero
- Both have demo fallbacks; page never hangs in skeleton state

**Below the fold (scrollable secondary context):**
- Live feed (platform events, filtered to company-relevant events only via `isIntegrationEvent`)
- Department signal grid
- Weekly velocity indicators

**Removed from above the fold:**
- Dept signal card grid (moved below fold)
- Approvals counter (absorbed into DecisionCards)
- `ConversationInput` / "Ask FLOW" section (replaced by StickyCommandCenter)

---

## 5. DecisionSlideOver — Universal Action Surface

One component. Reused on every page. Never navigates away.

**Structure (420px right panel, full viewport height):**
```
[×]  Situation title                    [source badge]
─────────────────────────────────────────────────────
SITUATION
[Full situation description, 2–3 sentences]
─────────────────────────────────────────────────────
RISK          PEOPLE INVOLVED
Medium        Rahul · Alice · Marcus
─────────────────────────────────────────────────────
RECOMMENDED ACTION
[AI recommendation, 1–2 sentences]
─────────────────────────────────────────────────────
▶ Evidence   (collapsed by default)
─────────────────────────────────────────────────────
[Approve & Execute]   [Delegate]   [Investigate]
```

**Behavior:**
- Backdrop: `rgba(31,27,22,0.25)` — subtle, not alarming
- `Approve & Execute` → calls `executionApi.execute()` → Phase 14 governance pipeline → inline success state before close
- Escape or clicking backdrop closes
- Props: `{ card, isOpen, onClose, onComplete }`

---

## 6. StickyCommandCenter — The Operating Console

Mounted in `LayoutShell`. `position: fixed; bottom: 0; left: 220px; right: 0; z-index: 100`.

### 6.1 States

**Idle (~52px):**
```
[⌘] What's blocking today's release?_________________________[↵]
```
Placeholder rotates every 4s: "What's blocking today's release?" → "Prepare me for standup." → "Summarize customer escalations." → "Who needs help today?"

**Focused (~320px, expands upward):**
```
┌─ Recent ────────────────────────────────────────────────────┐
│  Review Auth PR · Approve migration · Prepare standup       │
├─ Suggested ─────────────────────────────────────────────────┤
│  What's at risk this week?  · Who's blocked?               │
│  Prepare my 2PM standup     · Draft Slack update            │
├─ Slash commands ────────────────────────────────────────────┤
│  /approve  /delegate  /summarize  /draft  /notify           │
├─────────────────────────────────────────────────────────────┤
│  [⌘] _________________________________________ [@] [#] [↵] │
└─────────────────────────────────────────────────────────────┘
```

### 6.2 Dual-Mode Routing

- Input starts with `/` → inline mode: response card expands above composer, stays on current page
- Natural language question → navigate to `/brain` with query pre-loaded via `sessionStorage.setItem('flow_pending_ask', q)`
- @mentions → suggest people from workspace
- #hashtags → suggest projects

### 6.3 Slash Commands

| Command | Action |
|---|---|
| `/approve` | Inline: list pending approvals, approve from Command Center |
| `/delegate` | Inline: assign work to teammate |
| `/summarize` | Inline: summarize current page context |
| `/draft` | Inline: draft email or Slack message |
| `/notify` | Inline: send notification to teammate |
| `/navigate` | Jump to any page |

### 6.4 Inline Response Panel

Appears between composer and page content when slash-command mode is active.
- Card-style, max 240px tall, scrollable
- Every response ends with 2–3 action buttons
- Dismiss: Escape or ✕

---

## 7. /brain Redesign — No Empty State

`BrainHome.jsx` pre-conversation state shows context, not an empty box.

### 7.1 Pre-Conversation State

```
ACTIVE CONTEXT
[Release 2.5] [Backend Team] [Sprint 18] [Customer ABC]     ← from /api/workspace/snapshot

SUGGESTED
[What's blocking the release?]  [Who needs attention today?]
[Prepare my 2PM standup]       [Summarize yesterday's activity]
```

Context chips sourced from WIC snapshot domain names + top prediction subjects. No AI call at load time.

### 7.2 BrainMessage Redesign

**Remove permanently:**
- Confidence scores
- Evidence counts ("found N records")
- Retrieval metadata
- "Based on my analysis of X chunks"
- Any reference to vector search, embeddings, retrieval

**Message sections (in order):**
1. Executive Summary (1–3 sentences, bold lead)
2. Key Insights (bulleted, max 3)
3. Recommended Actions (with inline ActionBar)
4. Evidence (collapsed: `▶ Show sources`)
5. Related (optional, suggested follow-ups)

**After every response:** `ActionBar` with 2–3 contextual actions.

**Streaming:** responses stream via existing SSE `/api/brain/copilot/stream`. Message renders progressively. ActionBar appears after the last token.

**Voice enforcement (client-side filter):** Strip prefix patterns: "I found", "Based on my analysis", "As an AI", "According to my retrieval". These never appear in user-facing messages.

---

## 8. Page Heroes (Inbox, Engineering, Meetings)

Same `ExecutiveHero` component on all three pages.

**Layout rule on all pages:**
```
ExecutiveHero         (fixed top, 140px)
DecisionStream / list (scrollable)
StickyCommandCenter   (fixed bottom, from LayoutShell)
```

### 8.1 Inbox Hero
- Situation: "3 approvals waiting · 1 merge conflict · 2 predictions need review"
- Priority: highest-impact pending item
- Action: `[Review all]` or `[Approve #1]` → opens SlideOver

### 8.2 Engineering Hero
- Situation: from `/api/workspace/snapshot` → `domains.engineering.status`
- Priority: highest-risk PR or deployment
- Action: `[Review PR]` or `[Approve deployment]`

### 8.3 Meetings Hero
- Situation: "Standup in 14 minutes · 3 action items outstanding"
- Priority: next meeting name + readiness status
- Action: `[View prep]` → meeting detail; `[Join now]` if within 5 min

---

## 9. Trust Center — Flagship Feature

Route: `/integrations` (replaces `/settings/permissions`). Elevated from a buried settings page to a primary product destination.

### 9.1 Mission Statement

FLOW must never assume it has permission to understand every calendar, document, channel, or repository. The Trust Center makes this explicit. It is not a settings page. It is a trust declaration.

> "What FLOW can see. What FLOW cannot see. What FLOW is allowed to reason about."

### 9.2 Landing View

Connector overview: one row per connector, showing connection status and resource inclusion ratio.

```
FLOW TRUST CENTER
These are the sources FLOW is allowed to reason about.
You are in full control of what enters the Operational Brain.

──────────────────────────────────────────────────────────────
● Google Calendar    Connected    4 of 9 calendars included
● GitHub             Connected    6 of 8 repositories included
● Gmail              Connected    3 of 12 labels included
● Slack              Connected    12 of 31 channels included
● Notion             Connected    2 of 7 workspaces included
● Jira               Connected    3 of 4 projects included

○ Google Drive       Not connected
○ Confluence         Not connected
○ Salesforce         Not connected
──────────────────────────────────────────────────────────────
```

Clicking any connected connector opens `ConnectorPanel`.

### 9.3 ConnectorPanel — Per-Connector Governance

Two-column layout. Left: FLOW CAN SEE (green). Right: FLOW CANNOT SEE (gray).

```
← Back    Google Calendar    🟢 Connected · Synced 2m ago

─────────────────────────────────────────────────────────────
FLOW CAN SEE (4)              FLOW CANNOT SEE (5)
─────────────────────────────────────────────────────────────
🟢 Engineering Team    ↔     ⚪ Personal
🟢 Product Planning    ↔     ⚪ Family
🟢 Company Holidays    ↔     ⚪ Birthdays
🟢 Customer Meetings   ↔     ⚪ Private
                              ⚪ Travel

[Include All]   [Exclude All]   [Re-authenticate]   [Disconnect]
─────────────────────────────────────────────────────────────
"Disabled resources are never ingested, indexed, summarized,
or referenced — not now, not in future syncs."
```

### 9.4 Resource Row — ResourceToggle

Each row shows:
- Resource name + type icon
- Toggle (green = included, gray = excluded)
- Last sync timestamp (included resources only)
- Source label

### 9.5 Connector Coverage

All 6 governed connectors (from existing Phase 13.1 backend):

| Connector | Resource Type |
|---|---|
| Gmail | Labels |
| Google Calendar | Calendars |
| GitHub | Repositories |
| Slack | Channels (+ DM policy) |
| Notion | Pages / Databases |
| Jira | Projects |

Ungoverned connectors (Teams, SharePoint, Salesforce, etc.) render as "Not connected" cards — no fabricated resources.

### 9.6 Backend Mapping

The Trust Center is a UI elevation of the existing `IntegrationPermissions` system (Phase 13.1). No backend changes required.

| UI Action | API Endpoint |
|---|---|
| Load overview | `GET /api/integration-permissions` |
| Load connector resources | `GET /api/integration-permissions/:connector` |
| Discover resources | `POST /api/integration-permissions/:connector/discover` |
| Update resource permissions | `PUT /api/integration-permissions/:connector/resources` |
| Bulk include/exclude | `POST /api/integration-permissions/:connector/bulk` |
| Re-authenticate | `POST /api/connectors/:id/auth/initiate` |

---

## 10. Sidebar Rewrite

`Sidebar.jsx` is replaced. Same visual language (Hermès Light, `var(--surface-1)`, burnt orange accent), new structure.

**Changes:**
- `NAV_GROUPS` restructured into `PRIMARY_ITEMS` (5 items) + `PLATFORM_GROUPS` (4 expandable groups)
- Each Platform group has a `ChevronRight` icon that rotates on expand
- Group open/closed state: `localStorage.getItem('flow_nav_expanded')` (JSON array of open group ids)
- Sub-items: same `NavItem` component, `paddingLeft: 28px` to indent under the group header

---

## 11. Non-Goals (Explicit Scope Boundaries)

- No new AI models or endpoints
- No new database tables or migrations
- No visual language changes (Hermès Light design tokens unchanged)
- No changes to backend governance logic
- No changes to the Privacy Gate or ingestion pipeline
- The Trust Center does not add new enforcement logic — Phase 13.1 already enforces deny-by-default at every ingestion door

---

## 12. Implementation Order

1. `Sidebar.jsx` — new IA structure (all other components depend on navigation working)
2. `ExecutiveHero.jsx` + `EvidencePanel.jsx` + `ActionBar.jsx` — primitives
3. `DecisionCard.jsx` + `DecisionSlideOver.jsx` + `DecisionStream.jsx` — core pattern
4. `MorningBriefing.jsx` — replace homepage with Decision Stream
5. `StickyCommandCenter.jsx` + wire into `LayoutShell.jsx`
6. `BrainHome.jsx` + `BrainMessage.jsx` — conversation redesign
7. Page heroes: `OperationalInbox.jsx`, `ProjectIntelligence.jsx`, `MeetingDashboard.jsx`
8. `ResourceToggle.jsx` + `ConnectorPanel.jsx` + `TrustCenter.jsx` — Trust Center
9. `App.jsx` — new routes
10. Build verification + regression check

---

## 13. Success Criteria

- Homepage answers "what should I do next?" in under 60 seconds with zero configuration
- Every major capability (Integrations, Workspace, AI, System) is reachable from the sidebar in ≤ 2 clicks
- Trust Center surfaces exactly "what FLOW can see" and "what FLOW cannot see" for every connected integration
- Command Center is visible on every page without any page importing or positioning it
- `/brain` never shows an empty chat box — context and suggestions are always present
- Build passes clean (`npm run build` in `flow-os-frontend/`)
- No backend changes, no migration required
