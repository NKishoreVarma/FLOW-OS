# FLOW OS — Navigation
**Document:** 05 of 20  
**Status:** Authoritative  
**Last updated:** 2026-07-18

---

## Navigation Principles

1. **Every major capability is reachable in ≤ 2 clicks from the sidebar.** No exceptions.
2. **The sidebar never hides built features.** If a feature is shipped and working, it has a sidebar entry.
3. **Labels describe destinations, not concepts.** "Chief of Staff" not "AI". "Trust Center" not "Permissions".
4. **Platform groups are expandable, not hidden.** Clicking a group header reveals sub-items inline. Groups persist their open/closed state across sessions.
5. **The Command Center is always present.** It is mounted globally. It never requires navigation.
6. **Deep links always work.** Any URL in FLOW is bookmarkable and shareable within the same organization.

---

## Sidebar Architecture

### Structure

The sidebar has three zones:

1. **Header** — Logo + Workspace chip (top, fixed)
2. **Navigation** — Scrollable nav groups (middle, fills remaining height)
3. **User Tray** — User avatar + name + role + Settings link (bottom, fixed)

### Width

**220px.** Fixed. Not resizable. Hidden via `⌘B` toggle (state persists in `localStorage`).

### Visual Language

- Background: `var(--surface-1)` — slightly warmer than the main canvas
- Active item: `var(--accent-dim)` background + `2px var(--accent)` left border
- Active label: `var(--t1)` at `font-weight: 400`
- Inactive label: `var(--t3)` at `font-weight: 300`
- Hovered item: `rgba(31,27,22,0.04)` background, `var(--t2)` label
- Icon size: 14×14px, `strokeWidth: 1.5`
- Group headers: 10px, `var(--font-data)`, `var(--t4)`, uppercase, `letter-spacing: 0.08em`

---

## Complete Navigation Structure

### PRIMARY (5 items — daily-use surfaces)

```
Home             /              Home icon (exact match)
Inbox            /inbox         Inbox icon
Engineering      /projects      GitMerge icon
Meetings         /meetings      Calendar icon
Knowledge        /knowledge     BookOpen icon
```

No group label above PRIMARY. These are the five surfaces a user visits every day.

### INTELLIGENCE (5 items + expandable sub-items)

```
Chief of Staff   /chief         Brain icon
Weekly Review    /review        BarChart2 icon
People           /people        Users icon
Customers        /customers     Building2 icon
Executive Council /council      Layers icon
```

The `INTELLIGENCE` group label appears above these items as a section divider.

### PLATFORM (4 expandable groups)

Group headers are clickable. Clicking expands or collapses the group inline. State persists in `localStorage` under `flow_nav_expanded` (JSON array of open group IDs).

```
PLATFORM

Integrations ▶
  Connection Hub     /integrations
  Trust Center       /integrations (trust tab active)
  Sync Status        /integrations/sync

Workspace ▶
  Users & Roles      /settings/iam
  Workspaces         /settings/workspaces
  Admin              /settings

AI ▶
  Conversation       /brain/history
  Memory             /brain/memory
  Preferences        /brain/preferences

System ▶
  Workspace Health   /settings/health
  Audit Logs         /settings/audit
  Security           /settings/security
  AI Governance      /settings/governance
  API Keys           /settings/api-keys
  Billing            /settings/billing
```

Expanded sub-items are indented by 12px beyond the normal item left padding (28px total from sidebar edge).

### User Tray (bottom, fixed)

```
[KV]  Kishore Varma
      Admin · PRO         → navigates to /settings on click
```

---

## Command Center (Global)

The `StickyCommandCenter` is mounted once in `LayoutShell`. It is not mounted per-page. It appears on every page.

**Position:** `position: fixed; bottom: 0; left: 220px; right: 0; z-index: 100`

When the sidebar is hidden (`⌘B`), the command center adjusts: `left: 0`.

When the live feed panel is open (on wide screens), the command center does not adjust — it overlaps the feed panel's bottom. The feed panel scrolls behind it.

See `08_COMMAND_CENTER.md` for full specification.

---

## Top Bar (Contextual Header)

No persistent global top bar exists in FLOW. The top bar was removed in the Hermès redesign and is not restored. Page-level context is communicated through:

- The ExecutiveHero component at the top of each primary page
- The StickyCommandCenter at the bottom
- The sidebar active state

The only global UI outside the sidebar is the StickyCommandCenter.

---

## Search

Search in FLOW has two modes:

### ⌘K — Command Palette
Opens a full-width modal overlay. Three sections:
1. **Navigation** — jump to any page
2. **Actions** — verb-first executable commands (approve, draft, delegate, simulate, predict)
3. **Brain** — ask FLOW anything inline (resolves to `/brain` with pre-loaded question)

The sidebar "Search" button dispatches `flow:open-search` custom event, which opens the Command Palette. There is no separate search page.

### Brain Search (semantic)
All semantic search over workspace data runs through the brain. `/brain` accepts any natural language query and returns intelligence from the RAG pipeline.

Knowledge search at `/knowledge` accepts natural language and triggers a local graph traversal + semantic search.

---

## Keyboard Shortcuts

### Global (available everywhere)

| Shortcut | Action |
|---|---|
| `⌘K` | Open Command Palette |
| `⌘B` | Toggle Sidebar |
| `⌘N` | Create Note |
| `⌘E` | Compose Email |
| `⌘/` | View All Shortcuts (modal) |
| `⌘\` | Toggle Live Feed Panel |
| `Escape` | Close any open modal, panel, or slide-over |

### Brain / Command Center

| Shortcut | Action |
|---|---|
| `/` in Command Center | Enter slash-command mode |
| `⌘↵` | Submit current input |
| `↑` | Navigate to previous message in brain |
| `@` | Mention a person |
| `#` | Mention a project |

### Page-Specific

| Page | Shortcut | Action |
|---|---|---|
| `/inbox` | `A` | Approve highlighted item |
| `/inbox` | `D` | Delegate highlighted item |
| `/inbox` | `Escape` | Close slide-over |
| `/brain` | `⌘L` | Clear conversation (start new) |
| `/projects` | `P` | New pull request |

---

## Deep Links

Every route in FLOW is a stable deep link. All deep links require authentication. Unauthenticated access redirects to login, which redirects back to the original URL after login.

### Link patterns

| Pattern | Destination |
|---|---|
| `/` | Home (Decision Stream) |
| `/inbox` | Operational Inbox |
| `/projects` | Engineering (GitHub) |
| `/meetings` | Meeting Dashboard |
| `/meetings/:id/prep` | Meeting Prep for event ID |
| `/knowledge` | Knowledge Explorer |
| `/chief` | Chief of Staff |
| `/review` | Weekly Review |
| `/brain` | AI Brain |
| `/brain/history` | Conversation History |
| `/brain/memory` | AI Memory |
| `/council` | Executive Council |
| `/people` | People Intelligence |
| `/customers` | Customer Intelligence |
| `/activity` | Activity Timeline |
| `/integrations` | Trust Center |
| `/settings` | Admin |
| `/settings/iam` | Users & Roles |
| `/settings/governance` | AI Governance |
| `/settings/audit` | Audit Logs |
| `/settings/security` | Security Center |
| `/entity/:entityId` | Entity Workspace (cross-capability view of one node) |
| `/welcome` | First-Run Onboarding |

### Deprecated routes (redirect targets)

| Old Route | Redirects To |
|---|---|
| `/workfeed` | `/` |
| `/assistant` | `/brain` |
| `/briefing` | `/brain` |
| `/dashboard` | `/` |
| `/timeline` | `/activity` |
| `/search` | `/` (⌘K opens on load) |
| `/company` | `/council` |
| `/admin` | `/settings` |
| `/platform` | `/settings` |

Deprecated routes must redirect permanently (301 equivalent via React Router `<Navigate replace>`). They must never show a 404 or a dead page.

---

## Navigation Rules

### Rule 1: Active state accuracy
A nav item is active when the current path starts with its `path` value (or exactly matches for exact-match items like Home). A nav item must never be "active" when the user is on a different page.

### Rule 2: Group label accuracy
Group labels (`HOME`, `INTELLIGENCE`, `PLATFORM`) must describe what's in them. Do not put Intelligence features in the Workspace group. Do not put Settings in the Primary group.

### Rule 3: Item label accuracy
Nav labels must describe the destination, not a concept. "Chief of Staff" (the page) not "AI" (too broad). "Trust Center" (the feature) not "Permissions" (too vague). "Executive Council" (the AI panel) not "Overview" (misleading).

### Rule 4: No dead items
Every nav item must go to a live, working page. Clicking a nav item and seeing a "Coming Soon" component is a product failure. Either the feature is ready and linked, or the item is not in the nav.

### Rule 5: No infinite scroll navigation
The sidebar must never require scrolling to find an important destination. Primary items (5) are always visible. Intelligence items (5) are always visible. Platform groups (4) are collapsible precisely to keep the nav scannable. If the total nav height exceeds 80% of viewport height with all groups expanded, the design needs revision.

### Rule 6: Platform groups default-closed
On first visit (no `localStorage` state), Platform groups are collapsed. Intelligence and Primary items are always visible. A new user is not overwhelmed with 25 nav items.
