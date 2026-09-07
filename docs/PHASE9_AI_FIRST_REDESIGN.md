# FLOW OS — Phase 9: AI-First Redesign Spec

> Design brief produced by `/impeccable shape`. Awaiting implementation approval.
> 
> **Directive**: Transform FLOW from a dashboard-heavy enterprise tool into an AI-first enterprise operating system. The Operational Brain is the product. Everything else serves it.

---

## 1. UX Audit — Current State

### Surface count
- **40 routes** registered in App.jsx
- **94 JSX component files** across 11 directories
- **21 sidebar navigation items** (after Phase 8 reorganization)

### Page-by-page verdict

| Route | Component | Verdict | Reason |
|-------|-----------|---------|--------|
| `/workfeed` | DailyWorkfeed | **TRANSFORM** | Good intent, wrong form. Cards, graphs, and status bars replace conversation. Becomes the new Home with conversational shell. |
| `/assistant` | WorkspaceIntelligence | **MERGE → HOME** | Duplicates what Home should be. DailyBriefCard + WeeklyReview + InsightCard = the center column of Home. |
| `/briefing` | DailyBriefing | **MERGE → HOME** | The morning brief IS the home screen opening. Not a separate page. |
| `/search` | UniversalSearch | **MERGE → HOME** | "Ask FLOW" IS universal search. Conversation input handles both. Keep as deep-link for power users only. |
| `/dashboard` | ExecutiveDashboard | **KEEP (conditional)** | Valid when a user asks "show engineering health" — but must not be a primary nav destination. Becomes an AI-generated contextual dashboard only. |
| `/timeline` | OperationalTimeline | **KEEP → RIGHT PANEL** | Move into the live right sidebar. Not a separate page. Keep `/timeline` as a full-page fallback. |
| `/meetings` | MeetingDashboard | **KEEP (simplified)** | Navigation endpoint. Calendar view. But individual events accessed through conversation. |
| `/meetings/:id/prep` | MeetingPreparation | **KEEP** | Deep-link destination after conversational entry. |
| `/meetings/:id/live` | LiveMeeting | **KEEP** | Deep-link during live meeting context. |
| `/meetings/:id/summary` | MeetingSummary | **KEEP** | Post-meeting deep-link. |
| `/knowledge` | KnowledgeExplorer | **KEEP (diagnostic)** | Valid as a graph exploration tool — but not in primary nav. Surfaced by conversation: "show knowledge graph." |
| `/projects` | ProjectIntelligence | **KEEP (simplified)** | Navigation endpoint. Repository list. Detail accessed through conversation. |
| `/inbox` | AIInbox | **KEEP** | Communication center. Nav accessible. |
| `/company` | TeamDashboard | **REMOVE → CONVERSATION** | Exposes implementation detail. "How is the team doing?" handles this. |
| `/company/decisions` | DecisionBoard | **REMOVE → CONVERSATION** | "Show recent decisions" handles this. |
| `/company/memory` | TeamMemory | **REMOVE → CONVERSATION** | "What did the team decide last week?" handles this. |
| `/company/collaboration` | CollaborationHub | **REMOVE** | Undefined purpose. No user job to be done. |
| `/admin` | CompanyWorkspace | **SIMPLIFY → SETTINGS** | Org overview belongs in Settings → Company, not primary nav. |
| `/admin/advisor` | ExecutiveAdvisor | **MERGE → HOME** | AI chat with strategic context = Home conversation with executive role. |
| `/admin/departments/:id` | DepartmentIntelligence | **KEEP (deep-link)** | Useful detail surface, but only accessible from conversation or company settings. |
| `/admin/memory` | CompanyMemory | **REMOVE → CONVERSATION** | "What does FLOW remember about our company?" |
| `/admin/crm` | CustomerIntelligence | **KEEP (simplified)** | Legitimate CRM surface if user has CRM connector. Otherwise hidden. |
| `/admin/workforce` | WorkforceIntelligence | **KEEP (simplified)** | Legitimate HR surface if user has HR connector. Otherwise hidden. |
| `/platform` | EnterpriseAdmin | **KEEP → SETTINGS** | Move all platform admin under Settings. Not a primary nav item. |
| `/platform/iam` | IdentityManagement | **KEEP → SETTINGS** | |
| `/platform/workspaces` | WorkspaceManagement | **KEEP → SETTINGS** | |
| `/platform/security` | SecurityCenter | **KEEP → SETTINGS** | |
| `/platform/audit` | AuditCompliance | **KEEP → SETTINGS** | |
| `/platform/governance` | AIGovernance | **KEEP → SETTINGS** | |
| `/platform/integrations` | IntegrationHub | **KEEP → SETTINGS** | |
| `/platform/billing` | AnalyticsBilling | **KEEP → SETTINGS** | |
| `/platform/marketplace` | Marketplace | **KEEP → SETTINGS** | |
| `/platform/import` | ImportDashboard | **KEEP → SETTINGS** | |
| `/platform/onboarding` | OnboardingWizard | **KEEP** | First-run only. |
| `/platform/health` | WorkspaceHealth | **KEEP → SETTINGS** | |
| `/platform/evaluation` | EvaluationPlatform | **KEEP → SETTINGS** | Developer/admin tool only. |
| `/entity/:entityId` | EntityWorkspace | **KEEP** | Cross-capability deep-link. Valid. |
| `/settings`, `/help`, `/security`, `/activity` | ComingSoon | **WIRE/KEEP** | Settings → all platform admin. Others as-needed. |
| `/query` | DeveloperConsole | **KEEP (dev-only)** | Behind dev flag. |

### Core audit finding

**19 of 40 routes** are navigation dead-ends that expose implementation architecture to users who just want answers. The current frontend asks users to navigate a system they don't understand instead of just asking what they need.

---

## 2. New Information Architecture

### The Three-Region OS

```
┌─────────────────────────────────────────────────────────────────────┐
│  FLOW OS                                                             │
├──────┬──────────────────────────────────────────┬───────────────────┤
│      │                                          │                   │
│  NAV │           OPERATIONAL BRAIN              │   LIVE FEED       │
│      │                                          │                   │
│  48px│         Conversation-first               │   280px           │
│  or  │         center column                    │                   │
│ 200px│                                          │   Real-time       │
│      │         • Morning brief                  │   WebSocket       │
│  8   │         • Ask FLOW input                 │   events          │
│ items│         • Streaming AI responses         │                   │
│      │         • Rich inline content            │   Always alive    │
│      │         • Progressive disclosure         │   No refresh      │
│      │                                          │                   │
├──────┴──────────────────────────────────────────┴───────────────────┤
│  FLOW OS v2.0   ●  AI Active   ⟳ Sync  just now   ⌘K Search       │
└─────────────────────────────────────────────────────────────────────┘
```

### Hierarchy

```
FLOW OS
├── Home (/)                          ← Conversation + Brief + Actions
│   ├── [AI generates inline]         ← Any dashboard, report, table
│   └── [Progressive disclosure]      ← Details on demand
│
├── Inbox (/inbox)                    ← Emails + threads + AI drafts
│
├── Meetings (/meetings)              ← Calendar view
│   ├── Meeting Prep (/meetings/:id/prep)
│   ├── Live Meeting (/meetings/:id/live)
│   └── Summary (/meetings/:id/summary)
│
├── Projects (/projects)              ← Repo/PR list (GitHub connected)
│
├── People (/people) ← NEW            ← Workforce + CRM unified
│
├── Knowledge (/knowledge)            ← Semantic graph (diagnostic tool)
│
├── Entity Workspace (/entity/:id)    ← Cross-capability deep-link
│
└── Settings (/settings)              ← Everything administrative
    ├── Integrations
    ├── Workspace Management
    ├── Identity & Access
    ├── AI Governance
    ├── Security
    ├── Audit
    ├── Billing
    └── Import Engine
```

**Total primary nav items: 8** (previously 21 across 5 groups).

All platform admin, company management, and analytics dashboards move under Settings. They remain reachable but are not in the user's face during their work.

---

## 3. Navigation Redesign

### Current sidebar (21 items, 5 groups)
```
HOME: Home, Search, AI Briefing, Timeline
INTELLIGENCE: Exec Dashboard, Meetings, Projects, Inbox, Knowledge
COMPANY: Company Overview, Team Dashboard, AI Advisor
PLATFORM: Integrations, Workspace Health, Import Engine, Platform Admin, Security
SYSTEM: Settings, Help
```

### New sidebar (8 items, no group labels)

```
◈

🏠  Home
📥  Inbox
📅  Meetings
⚡  Projects
👥  People
📚  Knowledge

────

⚙️  Settings
```

The sidebar has two modes:
- **Collapsed** (default): 48px wide, icon-only
- **Expanded** (hover or pin): 200px wide, icon + label

**Workspace switcher** moves to the bottom of the sidebar (below the divider), a single-click dropdown. Not in the header.

**No group labels.** Eight items don't need categories. Labels add noise.

**`/search` as a nav item is removed.** Search is the Home input. `⌘K` remains as the global shortcut from anywhere.

**`/timeline` as a nav item is removed.** The right panel IS the timeline. Full-page `/timeline` is still accessible from the right panel's "view all" footer.

---

## 4. Home Screen Wireframe

The new `/` route renders `FlowHome.jsx` — the operating system shell.

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ ◈  [48px sidebar: icons only]                                                │
│                                                                              │
│   🏠  ←                                                                      │
│   📥                                                                         │
│   📅                                                                         │
│   ⚡                                                                         │
│   👥                                                                         │
│   📚                                                                         │
│   ──                                                                         │
│   ⚙️                                                                         │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘

CENTER COLUMN (flex-1):
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│   Tuesday, July 1                                               │
│                                                                 │
│   Good morning, Kishore.                      [text-2xl, 600]  │
│   Here's what happened overnight.             [text-muted]     │
│                                                                 │
│   ┌─────────────────────────────────────────────────────┐      │
│   │ ● Rahul merged 3 pull requests in flow-os-backend    │      │
│   │ ● Acme Corp opened a P1 support ticket               │      │
│   │ ● Payment deployment is blocked                      │      │
│   │ ● You have 2 meetings today                          │      │
│   │ ● Security recommends rotating API key #3            │      │
│   │                                          [View more] │      │
│   └─────────────────────────────────────────────────────┘      │
│                                                                 │
│   ┌─────────────────────────────────────────────────────┐      │
│   │  ◈  Ask FLOW anything about your workspace...       │      │
│   │                                               [→]   │      │
│   └─────────────────────────────────────────────────────┘      │
│                                                                 │
│   Quick:  [Show PRs]  [My meetings]  [Team health]  [Inbox]   │
│                                                                 │
│   ────────────────── Conversation History ──────────────────   │
│                                                                 │
│   [10:42 AM] You: Show me what's blocking deployment           │
│                                                                 │
│   ◈ FLOW:                                                      │
│   The payment-gateway deployment (PR #432) is blocked          │
│   because:                                                      │
│                                                                 │
│   ┌────────────────────────────────────────────────┐           │
│   │ PR #432 — fix: payment-gateway env config      │           │
│   │ Author: @rahul · 2 reviewers needed            │           │
│   │ Status: 1 approved, 1 changes requested        │           │
│   │                         [View PR]  [Assign →]  │           │
│   └────────────────────────────────────────────────┘           │
│                                                                 │
│   Additionally, the `STRIPE_WEBHOOK_SECRET` env var            │
│   is not set in the production environment.                    │
│                                                                 │
│   [Show deployment logs]  [Open Env Config]  [Escalate]        │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

RIGHT PANEL (280px):
┌─────────────────────────┐
│ Live Feed               │
│ ─────────────────────── │
│                         │
│ Now                     │
│ ● GitHub                │
│   PR #432 merged        │
│   rahul/flow-os · 2m    │
│                         │
│ ● Calendar              │
│   Sprint planning       │
│   starts in 15 min      │
│                         │
│ ● Customer              │
│   Acme escalated        │
│   incident #89          │
│                         │
│ Earlier today           │
│ ● AI                    │
│   3 recommendations     │
│   generated             │
│                         │
│ ● Automation            │
│   Email digest sent     │
│   to 4 recipients       │
│                         │
│ ● Security              │
│   API key #3 rotation   │
│   recommended           │
│                         │
│ [View full timeline →]  │
└─────────────────────────┘
```

### Home interaction model

1. **Page loads** → Fetch `/api/brain/briefing` → Render morning brief as streaming text (token-by-token if API supports it, or fade-in paragraph)
2. **Input focused** → Cursor blinks, subtle ring glow, quick-action chips fade slightly
3. **User types** → No debounce on UI; send on Enter or click →
4. **Response streams** → Token-by-token, cursor character at end; inline cards/tables/buttons appear inline as AI surfaces structured data
5. **Conversation grows down** → Chronological; user messages right-aligned, FLOW responses left-aligned (like Claude.ai)
6. **Right panel** → Persistent; updates in real-time from WebSocket; no user interaction needed
7. **Quick-action chips** → Contextual; change based on time of day, pending approvals count, current conversation context

### Progressive disclosure in conversation

```
User:  "What is blocking the deployment?"

FLOW:  "The payment-gateway deployment is blocked for two reasons:
        1. PR #432 needs one more review
        2. STRIPE_WEBHOOK_SECRET missing from prod env

        [Show deployment logs]  [Assign reviewer]  [Open environment config]"

User clicks [Show deployment logs]:

FLOW:  [Inline table: last 5 deployment logs with status, duration, error]
        [Show full log]  [Compare with last success]
```

---

## 5. Component Migration Plan

### New components to build

| Component | Path | Purpose |
|-----------|------|---------|
| `FlowHome.jsx` | `components/home/FlowHome.jsx` | New root home page — three-column OS shell |
| `BriefingBlock.jsx` | `components/home/BriefingBlock.jsx` | Morning brief streaming display |
| `ConversationThread.jsx` | `components/home/ConversationThread.jsx` | Chat history: user messages + FLOW responses |
| `ConversationInput.jsx` | `components/home/ConversationInput.jsx` | "Ask FLOW..." input with quick-action chips |
| `BrainResponse.jsx` | `components/home/BrainResponse.jsx` | Renders inline AI response with cards/tables/buttons |
| `InlineCard.jsx` | `components/home/InlineCard.jsx` | Data card generated inside conversation (PR, event, incident) |
| `LiveFeed.jsx` | `components/home/LiveFeed.jsx` | Right panel: real-time WebSocket event stream |
| `LiveFeedItem.jsx` | `components/home/LiveFeedItem.jsx` | Single feed item with source icon, title, time |
| `NarrowSidebar.jsx` | `components/layout/NarrowSidebar.jsx` | 8-item sidebar replacing current Sidebar.jsx |
| `PeopleIntelligence.jsx` | `components/people/PeopleIntelligence.jsx` | Unified workforce + CRM surface at `/people` |

### Components to retire (remove from routing, keep files)

These are not deleted — they are removed from primary navigation and only reachable as deep-links from conversation or Settings. Their files remain for progressive disclosure:

| Component | Status |
|-----------|--------|
| `DailyWorkfeed.jsx` | **Replace** with `FlowHome.jsx` at `/` |
| `WorkspaceIntelligence.jsx` | **Retire route** → merged into Home |
| `DailyBriefing.jsx` | **Retire route** → merged into Home |
| `ExecutiveDashboard.jsx` | **Move** → generated contextually by FLOW brain when asked |
| `TeamDashboard.jsx` | **Retire route** → conversation handles this |
| `DecisionBoard.jsx` | **Retire route** → "show decisions" prompt |
| `TeamMemory.jsx` | **Retire route** → "what does FLOW remember?" |
| `CollaborationHub.jsx` | **Remove route** entirely |
| `CompanyWorkspace.jsx` | **Move** → Settings → Company |
| `CompanyMemory.jsx` | **Retire route** → conversation |
| `ExecutiveAdvisor.jsx` | **Retire route** → Home IS the advisor |
| All `/platform/*` pages | **Move** → Settings sub-pages |

### Components to keep (as deep-link destinations)

| Component | Accessed from |
|-----------|--------------|
| `MeetingPreparation.jsx` | Conversation: "prep for my 3pm meeting" |
| `LiveMeeting.jsx` | Meeting card → Join Meeting |
| `MeetingSummary.jsx` | Post-meeting notification |
| `KnowledgeExplorer.jsx` | Conversation: "show knowledge graph" |
| `EntityWorkspace.jsx` | Any entity deep-link |
| `AIInbox.jsx` | Nav: Inbox |
| `MeetingDashboard.jsx` | Nav: Meetings |
| `ProjectIntelligence.jsx` | Nav: Projects |
| `CustomerIntelligence.jsx` | Nav: People (if CRM connected) |
| `WorkforceIntelligence.jsx` | Nav: People (if HR connected) |
| `DeveloperConsole.jsx` | Dev flag only |

### Components to simplify in-place

| Component | Change |
|-----------|--------|
| `Sidebar.jsx` | Replace with `NarrowSidebar.jsx` (8 items, icon-first) |
| `Header.jsx` | Remove breadcrumb. Show only: workspace badge + user avatar. All navigation happens from sidebar + conversation. |
| `GlobalStatusBar.jsx` | Keep as-is. Already clean. |
| `CommandPalette.jsx` | Keep as-is. ⌘K = Ask FLOW shortcut. |
| `NotificationDropdown.jsx` | Intelligent notifications (already Phase 8). Keep. |
| `AICopilot.jsx` | Floating FAB becomes secondary after Home IS the copilot. **Demote** to compact icon on non-home pages only. |

---

## 6. Page Merge / Removal Recommendations

### Routes to remove from App.jsx

```
/assistant          → redirect to /
/briefing           → redirect to /
/dashboard          → redirect to / (Home generates dashboard on request)
/search             → redirect to / (Home IS search)
/company            → redirect to /settings/company
/company/decisions  → redirect to /
/company/memory     → redirect to /
/company/collaboration → REMOVE entirely
/admin              → redirect to /settings/company
/admin/memory       → redirect to /
/admin/advisor      → redirect to /
/platform           → redirect to /settings
/platform/iam       → redirect to /settings/iam
/platform/workspaces → redirect to /settings/workspaces
/platform/security  → redirect to /settings/security
/platform/audit     → redirect to /settings/audit
/platform/governance → redirect to /settings/governance
/platform/integrations → redirect to /settings/integrations
/platform/billing   → redirect to /settings/billing
/platform/marketplace → redirect to /settings/marketplace
/platform/import    → redirect to /settings/import
/platform/health    → redirect to /settings/health
/platform/evaluation → redirect to /settings/evaluation
/activity           → (already redirects to /timeline; keep)
/security           → redirect to /settings/security
```

**After removal: 18 primary routes** (down from 40). The app feels like a product, not an implementation.

### New routes to add

```
/                   → FlowHome (conversation OS)
/people             → PeopleIntelligence (workforce + CRM unified)
/settings           → Settings hub (collects all /platform/* + /admin/* pages)
/settings/:page     → Sub-pages rendered within Settings shell
```

---

## 7. Design Direction

**Color strategy**: Restrained. One accent (purple) for AI surfaces. DESIGN.md palette holds.

**Theme scene sentence**: *A senior engineer at 8am, in a dark home office, one monitor, coffee in hand, about to start the day — they need to know what matters in the next 2 hours, not see a system status dashboard.*

**Named anchor references**:
1. **Claude.ai** — conversation thread, streaming response, inline card generation
2. **Linear** — sidebar density, keyboard-first, fast interaction feedback, earned whitespace
3. **Arc Browser** — ambient right panel, the browser fades into the content

**What this is not**:
- Salesforce (no side-by-side dashboards with 12 KPI widgets per view)
- Notion (no block-level editing; FLOW generates, not composes)
- Slack (FLOW speaks first; user responds)

**Motion**: Conversation responses stream token-by-token (CSS animation on new characters, or requestAnimationFrame reveal). Right panel items slide in from the right on new events, 200ms ease-out. No page transition animations.

---

## 8. API Contract for Conversation

The Home conversation UI maps to these existing endpoints:

| User intent | API call |
|-------------|----------|
| Morning brief on load | `GET /api/brain/briefing?role={userRole}` |
| Free-form question | `POST /api/brain/copilot { question, pageContext }` |
| "Show PRs" quick action | `GET /api/engineering/repos` + response includes PR inline cards |
| "My meetings" | `GET /api/meetings/upcoming?days=1` |
| "Team health" | `GET /api/intelligence/health-score` |
| Inline approval action | `POST /api/approvals/:id/approve` |
| Right panel events | WebSocket `events` from `useWebSocket()` |

**No new backend endpoints needed.** The conversation UI is a new orchestration layer over existing APIs.

---

## 9. Implementation Sequence (post-approval)

These phases are sequential. Do not begin Phase B until Phase A is complete and verified.

### Phase A — Shell (3 components, no routing changes yet)
1. `NarrowSidebar.jsx` — 8-item icon sidebar
2. `LiveFeed.jsx` + `LiveFeedItem.jsx` — right panel, WebSocket-driven
3. `ConversationInput.jsx` — the Ask FLOW input bar

### Phase B — Home (conversation interface)
1. `BriefingBlock.jsx` — morning brief with streaming reveal
2. `ConversationThread.jsx` — user/FLOW message history
3. `BrainResponse.jsx` — inline response renderer
4. `InlineCard.jsx` — generated PR/event/incident cards
5. `FlowHome.jsx` — assembles A + B into the complete home page

### Phase C — Routing cleanup
1. Redirect all removed routes to their new destinations
2. Wire `/settings` hub with tab navigation for all platform pages
3. Add `/people` route with `PeopleIntelligence.jsx`
4. Update App.jsx root route to FlowHome

### Phase D — Polish
1. Demote AICopilot FAB to non-home pages only
2. Simplify Header (remove breadcrumb text, keep user avatar + workspace badge)
3. Quick-action chips (contextual, generated from pending work counts)
4. Keyboard shortcut: `⌘/` focuses the conversation input from anywhere

---

## 10. Open Questions

None that require user input. Defaults are asserted:

- **Conversation history persistence**: Session-only (localStorage), not server-persisted. Users can clear it. This avoids a new backend table.
- **Streaming**: Use `ReadableStream` / `EventSource` if copilot endpoint supports SSE; otherwise reveal full response with a staggered word-by-word CSS animation simulating streaming.
- **Right panel width on narrow screens** (< 1280px): collapses to hidden. User opens via a panel toggle button in the status bar. Below 768px: right panel is removed entirely.
- **Quick-action chips**: 4 chips max, hard-coded initial set (Show PRs, My meetings, Team health, Open inbox). Contextual personalization is Phase E.
- **People route**: Renders `CustomerIntelligence` + `WorkforceIntelligence` in a tabbed layout. Both are already built.

---

*Ready for implementation approval. Once approved, Phase A begins with `NarrowSidebar.jsx`.*
