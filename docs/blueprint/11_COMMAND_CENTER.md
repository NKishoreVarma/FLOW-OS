# Blueprint: Command Center (Global)
**Document:** BP-11  
**Last updated:** 2026-07-18  
**Status:** Authoritative

---

## Purpose

Answer one question: **"What do I want to do right now?"**

The Command Center is FLOW's universal input interface — always available, always in context. It exists in two forms: the **StickyCommandCenter** (persistent bottom bar) and the **CommandPalette** (full-screen modal). Together they give every user keyboard-native access to navigation, actions, and the AI Brain without leaving the current page.

---

## Target User

**All users.** The Command Center is global — it is always visible regardless of which page the user is on.

---

## Entry Points

| Entry | Method |
|---|---|
| StickyCommandCenter | Always visible at bottom of content area |
| CommandPalette | `⌘K` anywhere in the application |
| StickyCommandCenter → full expand | `⌘Enter` or click expand icon |

---

## Architecture

The Command Center is two distinct components:

| Component | State | Purpose |
|---|---|---|
| `StickyCommandCenter` | Persistent, always mounted | Inline Brain queries with page context |
| `CommandPalette` | Modal, opens on `⌘K` | Navigation + global actions + search |

These are separate UX surfaces. `⌘K` always opens the CommandPalette — never expands the StickyCommandCenter.

---

## StickyCommandCenter — 3 States

### State 1: Idle (collapsed)

```
┌───────────────────────────────────────────────────────────────────┐
│  Ask FLOW anything about your workspace...          [⌘/]  [⌘K]   │
└───────────────────────────────────────────────────────────────────┘
```

Height: 52px  
Position: `position: sticky; bottom: 0` within the content area (not fixed — respects sidebar)  
Background: `var(--surface-0)`, `border-top: 1px solid var(--border)`  
Placeholder rotates every 6s (per-page set, see below)

### State 2: Focused / Active

User clicks the bar or presses `⌘/`:

```
┌───────────────────────────────────────────────────────────────────┐
│  [Page context chip]                                               │
│  Ask FLOW...                                              [⌘Enter] │
│                                                                    │
│  SUGGESTED:                                                        │
│  [Suggested chip 1]  [Suggested chip 2]  [Suggested chip 3]       │
└───────────────────────────────────────────────────────────────────┘
```

Height: 160px (expands upward with 120ms ease-out animation)  
Context chip: shows current page (e.g., `Engineering`, `Chief of Staff`, `Acme Corp`)  
Suggested chips: tap to pre-fill and submit

### State 3: Response (inline)

After submitting a question:

```
┌───────────────────────────────────────────────────────────────────┐
│  [Question text]                               [×] [Expand ↗]    │
│  ──────────────────────────────────────────────────────────────   │
│  [Streaming AI response text — up to 3 lines before truncation]   │
│  [Read more →]  (if response > 3 lines)                           │
│  ──────────────────────────────────────────────────────────────   │
│  [Suggested follow-ups as chips]                                  │
│  ──────────────────────────────────────────────────────────────   │
│  [Ask FLOW anything else...]                                      │
└───────────────────────────────────────────────────────────────────┘
```

Height: auto (up to 280px, scrollable if longer)  
Response streams as tokens arrive (SSE via `/api/brain/copilot/stream`)  
`[Expand ↗]` opens a full-screen BrainResponse modal with complete response  
`[×]` closes and resets to Idle state  
`[Read more →]` expands the response in-place (no modal)

---

## StickyCommandCenter — Page Context Awareness

Each page provides a context object to the StickyCommandCenter:

| Page | Context chip | Placeholder (rotates) |
|---|---|---|
| `/` (Home) | `Workspace` | "What's my priority today?" / "What's the biggest risk?" |
| `/inbox` | `Inbox` | "What needs my attention?" / "Summarize my approval requests" |
| `/projects` | `Engineering` | "What PRs need review?" / "What's blocking the release?" |
| `/meetings` | `Meetings` | "What's my next meeting?" / "Prep me for the 3pm call" |
| `/knowledge` | `Knowledge` | "Who knows about {entity}?" / "What depends on auth-service?" |
| `/chief` | `Chief of Staff` | "What should I do first?" / "What's blocking the team?" |
| `/people` | `People` | "Who's most overloaded?" / "What if Alice leaves?" |
| `/customers` | `Customers` | "Which customers are at risk?" / "What does Acme need?" |
| `/council` | `Council` | Disabled — AskCouncilInput takes precedence |
| `/activity` | `Activity` | "What happened in the last 24h?" / "What caused the incident?" |
| `/entity/:id` | `[entity name]` | "What's the impact of this?" / "Who else knows about this?" |

---

## StickyCommandCenter — AI Behavior

All StickyCommandCenter queries route to `POST /api/brain/copilot` (or `/api/brain/copilot/stream` for streaming):

```js
{
  question: "user input",
  pageContext: "engineering",       // current page slug
  entityId: "github:pr:445"         // if viewing an entity
}
```

Response includes optional `plan` field when actionable intent is detected. If `plan` is present, the response renders as an `ExecutableActionCard` with risk badge and action buttons (see BP-14 Execution Engine).

---

## CommandPalette (`⌘K`)

Full-screen modal overlay. Three modes:

### Navigation mode (default)

```
┌────────────────────────────────────────────────────────────────────┐
│  [⌘K]  Search or jump to...                              [Escape]  │
├────────────────────────────────────────────────────────────────────┤
│                                                                    │
│  NAVIGATION                                                        │
│  → Home                              /               ↩            │
│  → Inbox                             /inbox          ↩            │
│  → Chief of Staff                    /chief          ↩            │
│  → Engineering                       /projects       ↩            │
│  → Meetings                          /meetings       ↩            │
│  → Knowledge                         /knowledge      ↩            │
│  → People                            /people         ↩            │
│  → Customers                         /customers      ↩            │
│  → Executive Council                 /council        ↩            │
│  → Activity                          /activity       ↩            │
│  → Trust Center                      /integrations   ↩            │
│  → Settings — IAM                    /settings/iam   ↩            │
│  → Settings — Governance             /settings/governance ↩       │
│  → Settings — Audit                  /settings/audit ↩            │
│  → Settings — Security               /settings/security ↩         │
│  → Settings — Health                 /settings/health ↩           │
│  → Weekly Review                     /review         ↩            │
│  → Success Dashboard                 /success        ↩            │
│  → Onboarding                        /welcome        ↩            │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
```

23 navigation items. All keyboard-navigable (`↓`/`↑` + `Enter`).

### Search mode (typing)

When the user types into the CommandPalette input, results filter in real time:

```
┌────────────────────────────────────────────────────────────────────┐
│  [⌘K]  engineering                                       [Escape]  │
├────────────────────────────────────────────────────────────────────┤
│                                                                    │
│  NAVIGATION MATCHES                                                │
│  → Engineering                       /projects                    │
│  → Settings — Governance             /settings/governance         │
│                                                                    │
│  ACTIONS                                                           │
│  ⚡ Sync GitHub now                                                │
│  ⚡ Review open PRs                                                │
│                                                                    │
│  ENTITIES (from knowledge graph)                                   │
│  [REPO] flow-os-backend                                            │
│  [REPO] flow-os-frontend                                           │
│  [PERSON] Alice Chen — Senior Engineer                             │
│                                                                    │
│  ASK FLOW                                                          │
│  "engineering" — Ask FLOW about this →                             │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
```

Results: navigation matches > global actions > entity results > "Ask FLOW" fallback.

### Slash command mode (`/`)

When the user types `/`, special commands render:

```
┌────────────────────────────────────────────────────────────────────┐
│  /                                                        [Escape]  │
├────────────────────────────────────────────────────────────────────┤
│                                                                    │
│  SLASH COMMANDS                                                    │
│  /chief      Open Chief of Staff                                   │
│  /review     Open Weekly Review                                    │
│  /inbox      Open Inbox                                            │
│  /sync       Sync all connectors                                   │
│  /simulate   Run a simulation                                      │
│  /brief      Generate morning briefing                             │
│  /replay     Open Activity Replay                                  │
│  /snapshot   Compare two workspace snapshots                       │
│  /council    Ask the Executive Council                             │
│  /settings   Go to settings                                        │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
```

Typing `/sync` narrows to that command; pressing `Enter` executes it.

---

## CommandPalette — Global Actions (10)

These appear in the ACTIONS section when their keyword is typed:

| Keyword | Action | Endpoint |
|---|---|---|
| `sync`, `refresh` | Sync all connectors | `POST /api/connectors/search` (triggers sync) |
| `simulate`, `what if` | Run simulation | Opens `/simulation-workspace` |
| `brief`, `briefing` | Generate briefing | `GET /api/workspace/snapshot` + opens Home |
| `replay` | Start replay | Opens `/activity?mode=replay` |
| `snapshot` | Compare snapshots | Opens `/activity?mode=compare` |
| `council`, `ask council` | Ask the Council | Opens `/council` + focuses AskCouncilInput |
| `approve` | View pending approvals | `GET /api/approvals` + opens Inbox |
| `invite`, `team` | Invite team member | Opens `/settings/team` |
| `onboard`, `setup` | Go to onboarding | `/welcome` |
| `health` | Workspace health | `GET /api/workspace/health` + opens `/settings/health` |

---

## CommandPalette — Behavior Details

- **Open:** `⌘K` (Mac) / `Ctrl+K` (Windows). Opens instantly (no API call on open).
- **Dismiss:** `Escape` or click outside
- **Input:** Auto-focused on open. Clears on close.
- **Keyboard navigation:** `↓`/`↑` navigates items; `Enter` executes focused item; `Tab` does nothing (keyboard navigation stays within the palette).
- **Recent items:** Top 5 most-used navigation items surface first before the user types.
- **Entity search:** Calls `GET /api/graph/search?q={input}&workspaceId={ws}&limit=5` with 200ms debounce.
- **Ask FLOW:** Always present at the bottom. Pressing `Enter` on it submits the current input text to the StickyCommandCenter Brain.

---

## CommandPalette — Backdrop

```
background: rgba(0,0,0,0.4)
backdrop-filter: blur(4px)
z-index: 3000
```

Palette modal:
```
background: var(--surface-0)
border: 1px solid var(--border)
border-radius: var(--radius-lg)
box-shadow: var(--elevation-2)
width: 560px
max-height: 520px
overflow-y: auto
```

---

## Conflict Resolution

| Shortcut | Owner | Notes |
|---|---|---|
| `⌘K` | CommandPalette | Global, always |
| `⌘/` | StickyCommandCenter focus | Global |
| `⌘Enter` | Submit in focused input | Context-sensitive |
| `⌘.` | Cancel AI request | Global |
| `Escape` | Close modal / deselect | Layered: palette > panel > page |

No page-level shortcut should override `⌘K`, `⌘/`, or `⌘.`.

---

## Loading State

- StickyCommandCenter: visible instantly (no loading state)
- CommandPalette: opens instantly; entity search results appear after 200ms debounce

---

## Empty State

CommandPalette with no matching results:
```
No results for "{input}".

ASK FLOW
"{input}" — Ask FLOW about this →
```

---

## Error State

- Entity search API failure: entity section hidden silently; navigation and actions still work
- Brain API failure on StickyCommandCenter: `"FLOW is temporarily unavailable. [Retry]"` in the response area

---

## Accessibility

- CommandPalette: `role="dialog"`, `aria-modal="true"`, `aria-label="Command palette"`, focus trap
- Input: `role="searchbox"`, `aria-label="Search or jump to..."`, `aria-autocomplete="list"`
- Results list: `role="listbox"`, each item `role="option"`, `aria-selected`
- Navigation section header: `role="group"`, `aria-labelledby`
- StickyCommandCenter: `role="search"`, `aria-label="Ask FLOW"`
- Response area: `role="region"`, `aria-live="polite"` (streams response)

---

## Responsive Behavior

| Viewport | StickyCommandCenter | CommandPalette |
|---|---|---|
| ≥1280px | Full width (minus sidebar 220px) | 560px centered modal |
| 1024px–1279px | Same | 480px centered modal |
| 768px–1023px (tablet) | Full width | 90vw modal |

---

## Telemetry Events

| Event | Trigger | Properties |
|---|---|---|
| `command_center.palette.opened` | `⌘K` | `{ page }` |
| `command_center.palette.closed` | Escape or click outside | `{ inputLength }` |
| `command_center.nav.clicked` | Navigation item selected | `{ destination }` |
| `command_center.action.clicked` | Global action selected | `{ action }` |
| `command_center.entity.clicked` | Entity result selected | `{ entityId, type }` |
| `command_center.slash.used` | Slash command executed | `{ command }` |
| `command_center.brain.submitted` | Query submitted | `{ queryLength, page, hasEntityContext }` |
| `command_center.brain.responded` | Response received | `{ durationMs, hasExecutableAction }` |
| `command_center.brain.expanded` | `[Expand ↗]` clicked | `{ page }` |

---

## Acceptance Criteria

- [ ] StickyCommandCenter is visible at the bottom of all pages except `/council`.
- [ ] StickyCommandCenter has 3 correct states: Idle, Focused, and Response.
- [ ] Idle placeholder rotates per-page every 6 seconds.
- [ ] Focused state shows page context chip and suggested chips.
- [ ] Response streams as tokens arrive; `[Expand ↗]` opens full-screen modal.
- [ ] `⌘K` opens CommandPalette from any page; `Escape` closes it.
- [ ] CommandPalette shows 23 navigation items in order.
- [ ] Typing filters results: navigation matches > actions > entities > Ask FLOW.
- [ ] Typing `/` shows slash commands.
- [ ] Entity search calls `/api/graph/search` with 200ms debounce.
- [ ] `⌘.` cancels in-progress Brain request.
- [ ] All keyboard shortcuts documented work; no conflicts with page shortcuts.
- [ ] CommandPalette has correct ARIA roles and focus trap.
- [ ] All telemetry events fire.
