# FLOW OS — Command Center
**Document:** 08 of 20  
**Status:** Authoritative  
**Last updated:** 2026-07-18

---

## Overview

The Command Center is the always-present interface between the user and FLOW's intelligence. It appears on every page. It never moves. It is not a page — it is the operating console of FLOW.

Two surfaces constitute the Command Center:

1. **StickyCommandCenter** — the persistent composer fixed at the bottom of every page
2. **CommandPalette (⌘K)** — the modal overlay for navigation and executable actions

---

## StickyCommandCenter

### Position and Dimensions

```css
position: fixed;
bottom: 0;
left: 220px;        /* sidebar width */
right: 0;
z-index: 100;
background: var(--surface-0);
border-top: 1px solid var(--line-0);
box-shadow: 0 -4px 16px rgba(31,27,22,0.06);
```

When sidebar is hidden (`⌘B`): `left: 0`.

### States

**State 1 — Idle (52px height)**

The command center at rest. A single input line visible.

```
┌─────────────────────────────────────────────────────────────────┐
│ [⌘]  What's blocking today's release?________________________[↵] │
└─────────────────────────────────────────────────────────────────┘
```

Placeholder text rotates every 4 seconds with a 300ms fade:
1. "What's blocking today's release?"
2. "Prepare me for standup."
3. "Summarize customer escalations."
4. "Who needs help today?"
5. "What's the status of the Postgres migration?"
6. "Draft a Slack update for the engineering team."

The `[⌘]` icon is the FLOW accent square. `[↵]` is the submit key indicator.

**State 2 — Focused (320px height, expands upward)**

When user clicks the input or presses `/` to enter command mode.

```
┌─────────────────────────────────────────────────────────────────┐
│ RECENT                                                          │
│  Review Auth PR       · Approve migration  · Prepare standup   │
├─────────────────────────────────────────────────────────────────┤
│ SUGGESTED                                                       │
│  What's at risk this week?      Who's blocked?                  │
│  Prepare my 2PM standup         Draft Slack update              │
├─────────────────────────────────────────────────────────────────┤
│ QUICK ACTIONS   /approve · /delegate · /summarize · /draft      │
├─────────────────────────────────────────────────────────────────┤
│ [⌘]  _____________________________________________ [@] [#] [↵]  │
└─────────────────────────────────────────────────────────────────┘
```

**State 3 — Inline Response (max 240px above focused, scrollable)**

After submitting a `/slash` command, the response card appears between the focused input and the page content.

```
                    ┌─────────────────────────────────────────┐
                    │ ← 3 approvals pending                   │
                    │                                         │
                    │ Auth service migration — waiting 4 days │
                    │ [Review]                                │
                    │                                         │
                    │ PR #447 from Rahul — waiting 2 days     │
                    │ [Approve]                               │
                    │                                         │
                    │ Feature flag toggle — low risk          │
                    │ [Approve]                               │
                    │                                  [✕]   │
                    └─────────────────────────────────────────┘
[⌘]  _____________________________________________ [@] [#] [↵]
```

Dismissed with `Escape` or `✕`.

### Input Behavior

**Natural language input** (anything not starting with `/`):
- On `↵` or click `[↵]`: stores question in `sessionStorage.setItem('flow_pending_ask', question)` and navigates to `/brain`
- BrainHome picks up the stored question on mount and auto-submits it

**Slash command input** (starts with `/`):
- On `/` typed first, shows slash command autocomplete dropdown above the input
- On `↵`: resolves the command inline, shows State 3 response panel
- Never navigates away from the current page

### Dual-Mode Routing

| Input type | Behavior |
|---|---|
| Natural language question | → `/brain` with pre-loaded question |
| `/approve` | → Inline: show pending approvals, approve from command center |
| `/delegate` | → Inline: assign work item to teammate |
| `/summarize` | → Inline: summarize the current page context |
| `/draft` | → Inline: draft email or Slack message |
| `/notify` | → Inline: send notification to teammate |
| `/navigate [place]` | → Navigate to matched page |
| `@name` | → Mention and notify a person |
| `#project` | → Reference a project or entity |

### Slash Commands

| Command | Description | Inline Response |
|---|---|---|
| `/approve` | List and approve pending approvals | Card list of pending approvals |
| `/delegate` | Delegate a work item | Person picker → delegate confirmation |
| `/summarize` | Summarize the current page | Executive summary card |
| `/draft email` | Draft an email | Email composer card |
| `/draft slack` | Draft a Slack message | Slack composer card |
| `/notify @person` | Send a notification | Confirmation card |
| `/navigate [page]` | Jump to any page | Redirect immediately |

---

## CommandPalette (⌘K)

### Trigger

- `⌘K` (Mac) or `Ctrl+K` (Windows/Linux)
- Sidebar "Search" button dispatches `flow:open-search` custom event
- Slash in StickyCommandCenter (when not in input focus) → opens palette

### Anatomy

Full-width modal overlay. Dark backdrop: `rgba(31,27,22,0.5)`, blur: `backdrop-filter: blur(12px)`.

```
┌──────────────────────────────────────────────────────────────────┐
│ [⌘] Search everything or jump to a page…                        │
├──────────────────────────────────────────────────────────────────┤
│ NAVIGATE                                                         │
│  Home                    /                                       │
│  Chief of Staff          /chief                                  │
│  Inbox                   /inbox                                  │
│  Engineering             /projects                               │
│  Meetings                /meetings                               │
│  Knowledge               /knowledge                              │
│  AI Brain                /brain                                  │
│  Executive Council       /council                                │
│  Trust Center            /integrations                           │
│  ···                                                             │
├──────────────────────────────────────────────────────────────────┤
│ ACTIONS                                                          │
│  Ask FLOW — "what is at risk this week?"                         │
│  Approve pending approvals                                       │
│  Simulate: what if Alice resigns?                                │
│  Predict: engineering risks                                      │
│  Create Jira issue                                               │
│  Draft email                                                     │
├──────────────────────────────────────────────────────────────────┤
│  ↑↓ navigate  ↵ select  Esc close                               │
└──────────────────────────────────────────────────────────────────┘
```

### Navigation Commands (complete list)

All valid, live routes. No dead links.

| Label | Path |
|---|---|
| Home | `/` |
| Chief of Staff | `/chief` |
| Inbox | `/inbox` |
| Engineering | `/projects` |
| Meetings | `/meetings` |
| Knowledge | `/knowledge` |
| AI Brain | `/brain` |
| Conversation History | `/brain/history` |
| AI Memory | `/brain/memory` |
| Executive Council | `/council` |
| Weekly Review | `/review` |
| People | `/people` |
| Customers | `/customers` |
| Activity | `/activity` |
| Trust Center | `/integrations` |
| Users & Roles | `/settings/iam` |
| AI Governance | `/settings/governance` |
| Audit Logs | `/settings/audit` |
| Security | `/settings/security` |
| Workspace Health | `/settings/health` |
| Import | `/settings/import` |
| Success | `/success` |
| Admin | `/settings` |

### Action Commands (verb-first)

Derived from current workspace context. Not a static list.

| Trigger keywords | Action |
|---|---|
| "ask", "what", "why", "how", "who" | Ask FLOW brain query |
| "approve", "review approval" | List pending approvals |
| "simulate", "what if" | Open Simulation Workspace |
| "predict", "forecast" | Open Prediction Workspace |
| "jira", "create issue", "ticket" | Open Create Jira Modal |
| "email", "send", "draft" | Open Compose Email |
| "council", "strategic", "executives" | Go to Executive Council |
| "execute", "run workflow" | Open Execution Panel |
| "note", "remember" | Open Create Note |
| "delegate" | Delegate workflow |

### Search Behavior

- Keystroke filtering on all nav labels and action labels
- Minimum 2 characters to filter
- Fuzzy matching preferred over exact prefix matching
- Priority: exact match > prefix match > contains > fuzzy
- "Ask FLOW: [query]" appears at the top when no nav match found — clicking it sends the query to `/brain`

---

## Keyboard Navigation (Command Center)

| Key | Effect in StickyCommandCenter (focused) |
|---|---|
| `Tab` | Move to next suggested item |
| `↑` / `↓` | Navigate between suggestions |
| `↵` | Select suggestion or submit |
| `Escape` | Collapse to idle state / dismiss inline response |
| `@` | Trigger person mention |
| `#` | Trigger project reference |

| Key | Effect in CommandPalette |
|---|---|
| `↑` / `↓` | Navigate between items |
| `↵` | Select item |
| `Escape` | Close palette |
| `Tab` | Move between sections |

---

## Context Awareness

The StickyCommandCenter is context-aware. On different pages, the placeholder text and suggested prompts change:

| Page | Suggested prompt 1 | Suggested prompt 2 |
|---|---|---|
| `/` (Home) | "What's blocking today?" | "Who needs my attention?" |
| `/inbox` | "Approve all low-risk items" | "Summarize outstanding decisions" |
| `/projects` | "What's blocking the release?" | "Find the highest-risk PR" |
| `/meetings` | "Prepare me for the next meeting" | "Summarize action items from last week" |
| `/knowledge` | "What do we know about [entity]?" | "Find all decisions about the database" |
| `/chief` | "What should I do first?" | "What can wait until Friday?" |
| `/council` | "What is the biggest Q3 risk?" | "What does Engineering think about this?" |
| `/people` | "Who is at burnout risk?" | "Who knows the most about the auth service?" |

Page context is read from `useLocation().pathname`. Context-specific suggestions are a static map, not a server call.

---

## Pinned Prompts (Future)

The AI Preferences page (`/brain/preferences`) will allow users to pin up to 5 custom prompts that appear in the StickyCommandCenter "Suggested" section permanently. These are stored per-user in the workspace database.

The interface for adding a pinned prompt: any response in `/brain` has a `[⊞ Pin this prompt]` action. Clicking it saves the question text as a pinned prompt.

---

## Command Center Governance

The Command Center is governed by the same rules as the rest of FLOW:

- Actions dispatched from the Command Center flow through `executeAction()`
- Risk classification applies (LOW/MEDIUM/HIGH/CRITICAL)
- DENY results in an inline error: "This action is not permitted for your role."
- REQUIRE_APPROVAL results in an inline state: "Approval requested. [View approval]"
- All command executions are audited in the connector audit log
