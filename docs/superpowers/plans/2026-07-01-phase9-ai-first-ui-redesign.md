# Phase 9: AI-First UI Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform FLOW from a dashboard-heavy tool into an AI-first Enterprise OS with a Linear/Huly-inspired three-column layout: narrow icon rail | center brain conversation | right live workspace feed.

**Architecture:** Three-column layout shell (OsRail 56px + main flex-1 + LiveFeedPanel 280px). Root route `/` renders `FlowHome` — a conversation-first interface where all AI interaction happens. The right panel streams live WebSocket events in real time. Legacy pages remain accessible as deep-links but are removed from primary navigation.

**Visual direction:** Linear sidebar typography + Huly's structural density + premium dark aesthetic (near-black backgrounds, purple AI accent, subtle borders, Inter font, JetBrains Mono for code). Every element earns its place. No empty chrome.

**Tech Stack:** React 18, Vite, Tailwind CSS v4, framer-motion 12.x, lucide-react 1.21, CSS custom properties (design tokens), React Router v6, useWebSocket hook, ESM-only.

## Global Constraints

- ESM only — all files use `import`/`export`. No `require()`.
- File extension: `.jsx` always. Never `.tsx`.
- Colors: CSS design tokens only — never raw hex in JSX. Use Tailwind classes: `text-flow-purple`, `bg-bg-card`, `border-border-flow`, etc.
- API calls: relative paths only — `/api/...`. Never `http://localhost:5001/...`.
- Every fetch must have a `.catch()` that falls back to static demo data so the UI never hangs.
- No new npm packages unless explicitly stated in a task.
- Framer Motion is available — use it for intentional transitions. No bounce/elastic easing.
- Every animation needs `@media (prefers-reduced-motion: reduce)` alternative.
- Tailwind v4 syntax: utility classes are in JSX. No `@apply` in CSS unless in globals/tokens.
- No nested cards — cards inside cards are always wrong.
- No gradient text (`background-clip: text`).
- No side-stripe border accents (`border-left` > 1px as colored decoration).
- Body text must be ≥4.5:1 contrast ratio against its background.

---

## File Map

### New files (create)
- `flow-os-frontend/src/components/layout/OsRail.jsx` — 56px icon rail sidebar
- `flow-os-frontend/src/components/layout/LiveFeedPanel.jsx` — 280px right live feed
- `flow-os-frontend/src/components/brain/ConversationInput.jsx` — Ask FLOW input
- `flow-os-frontend/src/components/brain/BrainMessage.jsx` — AI response renderer
- `flow-os-frontend/src/components/brain/InlinePRCard.jsx` — PR inline card
- `flow-os-frontend/src/components/brain/InlineMeetingCard.jsx` — Meeting inline card
- `flow-os-frontend/src/components/brain/InlineApprovalCard.jsx` — Approval inline card
- `flow-os-frontend/src/components/brain/InlineMetricCard.jsx` — Health/metric inline card
- `flow-os-frontend/src/components/brain/ConversationThread.jsx` — Thread container
- `flow-os-frontend/src/components/home/FlowHome.jsx` — Root home page
- `flow-os-frontend/src/components/settings/SettingsHub.jsx` — Settings layout hub
- `flow-os-frontend/src/components/people/PeopleIntelligence.jsx` — Workforce+CRM hub

### Modified files
- `flow-os-frontend/src/styles/colors.css` — refined palette + new tokens
- `flow-os-frontend/src/styles/globals.css` — scrollbar + selection styles
- `flow-os-frontend/src/components/layout/LayoutShell.jsx` — three-column shell
- `flow-os-frontend/src/App.jsx` — routing overhaul (new routes, redirects, removals)

### Deprecated (files kept, routes removed)
- `Sidebar.jsx` — replaced by `OsRail.jsx`; file kept for reference, not imported
- `Header.jsx` — removed from LayoutShell; file kept, not imported
- `DailyWorkfeed.jsx` — replaced by FlowHome at `/`; old route `/workfeed` redirects to `/`

---

### Task 1: Design Token Overhaul

**Files:**
- Modify: `flow-os-frontend/src/styles/colors.css`
- Modify: `flow-os-frontend/src/styles/globals.css`
- Modify: `flow-os-frontend/src/styles/tokens.css`

**Interfaces:**
- Consumes: nothing
- Produces: new CSS custom properties consumed by all other tasks

The current palette is good (#05070a base, #8b5cf6 purple) but needs new tokens for the three-column layout. The sidebar rail needs its own background (slightly lighter than base), the right panel needs a distinct surface, and the AI conversation region needs a subtle distinction.

- [ ] **Step 1: Update colors.css with new structural tokens**

Replace the entire `:root` block in `flow-os-frontend/src/styles/colors.css` with:

```css
:root {
  /* ─── Structural surfaces ─────────────────────────────── */
  --bg-primary:   #09090b;   /* Page base — near-black */
  --bg-rail:      #111113;   /* OsRail — 1-step lighter */
  --bg-secondary: #0d0d0f;   /* Panel backgrounds */
  --bg-card:      #141416;   /* Card surface */
  --bg-hover:     #1a1a1d;   /* Hover state */
  --bg-selected:  #1e1e26;   /* Active/selected state — purple tint */
  --bg-panel:     #0f0f12;   /* LiveFeedPanel */
  --bg-input:     #18181b;   /* Input backgrounds */

  /* ─── Borders ─────────────────────────────────────────── */
  --border:       rgba(255, 255, 255, 0.055);  /* Default border */
  --border-focus: rgba(139, 92, 246, 0.5);     /* Purple focus ring */
  --border-strong: rgba(255, 255, 255, 0.10);  /* Stronger border */

  /* ─── Typography ──────────────────────────────────────── */
  --text-primary:   #f4f4f5;   /* Body text — cool white */
  --text-secondary: #a1a1aa;   /* Secondary text */
  --text-muted:     #52525b;   /* Muted / disabled */
  --text-link:      #a78bfa;   /* Links — lighter purple */

  /* ─── Brand / AI accent ───────────────────────────────── */
  --color-flow-purple:     #8b5cf6;
  --color-flow-purple-dim: rgba(139, 92, 246, 0.12);
  --color-flow-purple-mid: rgba(139, 92, 246, 0.25);

  /* ─── Semantic status ─────────────────────────────────── */
  --color-critical: #f43f5e;
  --color-warning:  #f59e0b;
  --color-success:  #10b981;
  --color-info:     #3b82f6;

  /* ─── Glow utilities ──────────────────────────────────── */
  --glow-purple:   0 0 24px rgba(139, 92, 246, 0.18);
  --glow-critical: 0 0 16px rgba(244, 63, 94, 0.2);
  --glow-success:  0 0 16px rgba(16, 185, 129, 0.2);
  --glow-ai:       0 0 32px rgba(139, 92, 246, 0.10);

  /* ─── Source dot colors (live feed) ──────────────────── */
  --source-github:   #a78bfa;
  --source-gmail:    #f43f5e;
  --source-calendar: #10b981;
  --source-slack:    #f59e0b;
  --source-jira:     #3b82f6;
  --source-ai:       #8b5cf6;
  --source-auto:     #06b6d4;
}

/* Light theme — activate with <html class="light"> */
:root.light {
  --bg-primary:    #fafafa;
  --bg-rail:       #f4f4f5;
  --bg-secondary:  #f1f1f3;
  --bg-card:       #ffffff;
  --bg-hover:      #e4e4e7;
  --bg-selected:   #ede9fe;
  --bg-panel:      #f8f8fa;
  --bg-input:      #ffffff;
  --border:        rgba(0, 0, 0, 0.08);
  --border-focus:  rgba(124, 58, 237, 0.5);
  --border-strong: rgba(0, 0, 0, 0.14);
  --text-primary:  #09090b;
  --text-secondary:#52525b;
  --text-muted:    #a1a1aa;
  --text-link:     #7c3aed;
  --color-flow-purple:     #7c3aed;
  --color-flow-purple-dim: rgba(124, 58, 237, 0.1);
  --color-flow-purple-mid: rgba(124, 58, 237, 0.2);
}
```

- [ ] **Step 2: Add new Tailwind token mappings in tokens.css**

Append to the `@theme {}` block in `flow-os-frontend/src/styles/tokens.css`:

```css
@theme {
  /* ... existing tokens ... */

  /* New structural tokens */
  --color-bg-rail:      var(--bg-rail);
  --color-bg-panel:     var(--bg-panel);
  --color-bg-selected:  var(--bg-selected);
  --color-bg-input:     var(--bg-input);
  --color-border-strong: var(--border-strong);
  --color-border-focus: var(--border-focus);
  --color-text-link:    var(--text-link);
  --color-flow-purple-dim: var(--color-flow-purple-dim);
  --color-flow-purple-mid: var(--color-flow-purple-mid);

  /* Source colors */
  --color-source-github:   var(--source-github);
  --color-source-gmail:    var(--source-gmail);
  --color-source-calendar: var(--source-calendar);
  --color-source-slack:    var(--source-slack);
  --color-source-jira:     var(--source-jira);
  --color-source-ai:       var(--source-ai);
  --color-source-auto:     var(--source-auto);
}
```

- [ ] **Step 3: Update globals.css with custom scrollbar and selection styles**

Append to `flow-os-frontend/src/styles/globals.css`:

```css
/* Slim scrollbars — webkit only */
::-webkit-scrollbar { width: 4px; height: 4px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: var(--border-strong); border-radius: 2px; }
::-webkit-scrollbar-thumb:hover { background: var(--text-muted); }

/* Text selection */
::selection { background: var(--color-flow-purple-mid); color: var(--text-primary); }

/* Focus ring system */
:focus-visible { outline: 2px solid var(--color-flow-purple); outline-offset: 2px; }
```

- [ ] **Step 4: Verify no compilation errors**

```bash
cd flow-os-frontend && npx vite build --mode development 2>&1 | tail -20
```

Expected: zero errors. If Tailwind complains about unknown utility classes, check that `tokens.css` is imported in `main.jsx` or `index.css`.

- [ ] **Step 5: Commit**

```bash
git add flow-os-frontend/src/styles/
git commit -m "design: refine token palette for three-column OS layout"
```

---

### Task 2: OsRail — Icon Sidebar

**Files:**
- Create: `flow-os-frontend/src/components/layout/OsRail.jsx`

**Interfaces:**
- Consumes: `useWebSocket` hook (for unread dot on Inbox), `useLocation` from react-router-dom, lucide-react icons, framer-motion
- Produces: `<OsRail />` — drop-in replacement for `<Sidebar />`

The OsRail is a 56px-wide vertical icon strip. No text labels are visible. Each icon has an accessible `aria-label` and shows a tooltip on hover. The active item has a 2px purple left border and a subtle purple background tint. A thin 1px border-right separates it from the center content.

- [ ] **Step 1: Create OsRail.jsx**

Create `flow-os-frontend/src/components/layout/OsRail.jsx`:

```jsx
import { useLocation, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";
import {
  Home, Inbox, Calendar, Briefcase, Users, BookOpen,
  Search, Settings, Zap,
} from "lucide-react";
import { useWebSocket } from "../../hooks/useWebSocket";

const NAV_ITEMS = [
  { label: "Home",       path: "/",          icon: Home,      exact: true },
  { label: "Inbox",      path: "/inbox",     icon: Inbox,     badge: true },
  { label: "Meetings",   path: "/meetings",  icon: Calendar },
  { label: "Projects",   path: "/projects",  icon: Briefcase },
  { label: "People",     path: "/people",    icon: Users },
  { label: "Knowledge",  path: "/knowledge", icon: BookOpen },
];

const BOTTOM_ITEMS = [
  { label: "Search (⌘K)", path: null,          icon: Search,   action: "search" },
  { label: "Settings",    path: "/settings",   icon: Settings },
];

function RailItem({ item, isActive, onClick }) {
  const [showTooltip, setShowTooltip] = useState(false);
  const Icon = item.icon;

  return (
    <li className="relative flex items-center justify-center">
      <button
        aria-label={item.label}
        onClick={onClick}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        className={`relative flex items-center justify-center w-9 h-9 rounded-lg transition-all duration-150 group
          ${isActive
            ? "bg-bg-selected text-flow-purple"
            : "text-text-muted hover:text-text-secondary hover:bg-bg-hover"
          }`}
      >
        {/* Active indicator */}
        {isActive && (
          <span className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-3 w-0.5 h-5 bg-flow-purple rounded-r-full" />
        )}

        <Icon className="w-4 h-4" strokeWidth={isActive ? 2 : 1.75} />

        {/* Unread badge */}
        {item.badge && (
          <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-flow-purple" />
        )}
      </button>

      {/* Tooltip */}
      <AnimatePresence>
        {showTooltip && (
          <motion.div
            initial={{ opacity: 0, x: -4 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -4 }}
            transition={{ duration: 0.1 }}
            className="absolute left-12 z-50 px-2.5 py-1.5 bg-bg-card border border-border-flow rounded-md shadow-lg whitespace-nowrap pointer-events-none"
          >
            <span className="text-ui-sm text-text-primary font-medium">{item.label}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </li>
  );
}

export default function OsRail() {
  const location = useLocation();
  const navigate = useNavigate();
  const { events } = useWebSocket();

  const workspaceId = localStorage.getItem("flow_os_workspace_id") || "";
  const wsLabel = workspaceId.replace("workspace_", "").slice(0, 2).toUpperCase() || "FL";

  function isActive(item) {
    if (item.exact) return location.pathname === item.path;
    return location.pathname.startsWith(item.path);
  }

  function handleClick(item) {
    if (item.action === "search") {
      window.dispatchEvent(new CustomEvent("flow:open-search"));
    } else if (item.path) {
      navigate(item.path);
    }
  }

  return (
    <aside className="flex flex-col items-center w-14 h-screen bg-bg-rail border-r border-border-flow flex-shrink-0 py-3 gap-1 select-none">
      {/* Logo / workspace avatar */}
      <button
        onClick={() => navigate("/")}
        aria-label="FLOW OS Home"
        className="w-9 h-9 rounded-lg bg-flow-purple-dim border border-flow-purple/20 flex items-center justify-center text-flow-purple text-ui-sm font-bold mb-3 hover:bg-flow-purple-mid transition-colors"
      >
        <Zap className="w-4 h-4" />
      </button>

      {/* Primary nav */}
      <nav aria-label="Primary navigation" className="flex flex-col items-center gap-1 flex-1">
        <ul className="flex flex-col items-center gap-1">
          {NAV_ITEMS.map((item) => (
            <RailItem
              key={item.path}
              item={item}
              isActive={isActive(item)}
              onClick={() => handleClick(item)}
            />
          ))}
        </ul>
      </nav>

      {/* Bottom items */}
      <ul className="flex flex-col items-center gap-1 border-t border-border-flow pt-2 mt-2">
        {BOTTOM_ITEMS.map((item) => (
          <RailItem
            key={item.label}
            item={item}
            isActive={isActive(item)}
            onClick={() => handleClick(item)}
          />
        ))}

        {/* Workspace indicator */}
        <li className="mt-1">
          <div
            aria-label={`Workspace: ${workspaceId}`}
            title={workspaceId}
            className="w-7 h-7 rounded-md bg-bg-hover border border-border-flow flex items-center justify-center text-ui-xs font-bold text-text-secondary"
          >
            {wsLabel}
          </div>
        </li>
      </ul>
    </aside>
  );
}
```

- [ ] **Step 2: Verify it renders without error**

The component depends on `useWebSocket`, `react-router-dom`, `framer-motion`, and `lucide-react` — all already installed. Imports are correct.

- [ ] **Step 3: Commit**

```bash
git add flow-os-frontend/src/components/layout/OsRail.jsx
git commit -m "feat: add OsRail — 56px icon sidebar for three-column OS layout"
```

---

### Task 3: LiveFeedPanel — Right Sidebar

**Files:**
- Create: `flow-os-frontend/src/components/layout/LiveFeedPanel.jsx`

**Interfaces:**
- Consumes: `useWebSocket` hook (`events` array), framer-motion, lucide-react
- Produces: `<LiveFeedPanel isOpen onToggle />` — right panel showing live WebSocket events

Each event becomes a feed item. Events are grouped by time: "Now" (< 5 min), "Earlier" (today), "Yesterday". Source icons are colored dots matching the source type. The panel has a header with title and a collapse toggle. When collapsed, the panel hides and the toggle button remains visible.

- [ ] **Step 1: Create LiveFeedPanel.jsx**

Create `flow-os-frontend/src/components/layout/LiveFeedPanel.jsx`:

```jsx
import { useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Github, Mail, Calendar, Zap, AlertTriangle,
  CheckCircle, Activity, ChevronRight, Clock, X,
} from "lucide-react";
import { useWebSocket } from "../../hooks/useWebSocket";

const SOURCE_CONFIG = {
  github:       { color: "text-source-github",   bg: "bg-source-github/10",   icon: Github },
  gmail:        { color: "text-source-gmail",    bg: "bg-source-gmail/10",    icon: Mail },
  calendar:     { color: "text-source-calendar", bg: "bg-source-calendar/10", icon: Calendar },
  ai:           { color: "text-source-ai",       bg: "bg-source-ai/10",       icon: Zap },
  incident:     { color: "text-critical",        bg: "bg-critical/10",        icon: AlertTriangle },
  automation:   { color: "text-source-auto",     bg: "bg-source-auto/10",     icon: Activity },
  approval:     { color: "text-success",         bg: "bg-success/10",         icon: CheckCircle },
};

function getSourceConfig(type = "") {
  const key = type.toLowerCase();
  if (key.includes("github") || key.includes("pr") || key.includes("commit")) return SOURCE_CONFIG.github;
  if (key.includes("gmail") || key.includes("email") || key.includes("comm")) return SOURCE_CONFIG.gmail;
  if (key.includes("calendar") || key.includes("meeting")) return SOURCE_CONFIG.calendar;
  if (key.includes("incident") || key.includes("risk")) return SOURCE_CONFIG.incident;
  if (key.includes("approval")) return SOURCE_CONFIG.approval;
  if (key.includes("auto") || key.includes("action")) return SOURCE_CONFIG.automation;
  return SOURCE_CONFIG.ai;
}

function timeSince(ts) {
  const diff = Date.now() - ts;
  if (diff < 60000) return "just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
}

function FeedItem({ event }) {
  const ts = Math.floor(event.id);
  const cfg = getSourceConfig(event.type || "");
  const Icon = cfg.icon;
  const label = (event.type || "").replace(/_/g, " ").toLowerCase();
  const preview = event.data?.text || event.data?.message || event.data?.title || label;
  const shortPreview = typeof preview === "string" ? preview.slice(0, 72) : label;

  return (
    <motion.div
      initial={{ opacity: 0, x: 12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className="flex gap-2.5 px-3 py-2.5 hover:bg-bg-hover rounded-lg mx-1 cursor-default group transition-colors"
    >
      <div className={`w-6 h-6 rounded-md flex-shrink-0 flex items-center justify-center mt-0.5 ${cfg.bg}`}>
        <Icon className={`w-3 h-3 ${cfg.color}`} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-ui-sm text-text-primary font-medium leading-snug truncate">
          {shortPreview}
        </p>
        <div className="flex items-center gap-1.5 mt-0.5">
          <span className={`text-ui-xs font-medium ${cfg.color}`}>
            {label}
          </span>
          <span className="text-ui-xs text-text-muted">·</span>
          <span className="text-ui-xs text-text-muted">{timeSince(ts)}</span>
        </div>
      </div>
    </motion.div>
  );
}

function Group({ label, items }) {
  if (!items.length) return null;
  return (
    <div className="mb-1">
      <p className="px-4 py-1.5 text-ui-xs text-text-muted font-semibold uppercase tracking-widest">
        {label}
      </p>
      <div className="flex flex-col gap-0.5">
        {items.map((ev) => (
          <FeedItem key={ev.id} event={ev} />
        ))}
      </div>
    </div>
  );
}

// Demo events shown when no real events exist
const DEMO_EVENTS = [
  { id: Date.now() - 60000,    type: "INTEL_STORED",         data: { text: "GitHub PR #432 merged into main" } },
  { id: Date.now() - 300000,   type: "MEETING_SYNC",         data: { text: "Sprint planning starts in 15 min" } },
  { id: Date.now() - 900000,   type: "INCIDENT_CREATED",     data: { text: "Payment gateway latency spike" } },
  { id: Date.now() - 1800000,  type: "APPROVAL_REQUIRED",    data: { text: "Database migration needs approval" } },
  { id: Date.now() - 3600000,  type: "EXECUTIVE_SYNTHESIS_READY", data: { text: "3 AI recommendations generated" } },
  { id: Date.now() - 7200000,  type: "AUTOMATION_EXECUTED",  data: { text: "Daily email digest sent to 4 recipients" } },
];

export default function LiveFeedPanel({ isOpen, onToggle }) {
  const { events: wsEvents } = useWebSocket();

  const allEvents = useMemo(() => {
    return wsEvents.length > 0 ? [...wsEvents].reverse().slice(0, 40) : DEMO_EVENTS;
  }, [wsEvents]);

  const now = Date.now();
  const grouped = useMemo(() => {
    const fiveMin = now - 5 * 60 * 1000;
    const today   = now - 24 * 60 * 60 * 1000;
    return {
      live:     allEvents.filter((e) => Math.floor(e.id) > fiveMin),
      earlier:  allEvents.filter((e) => Math.floor(e.id) <= fiveMin && Math.floor(e.id) > today),
      older:    allEvents.filter((e) => Math.floor(e.id) <= today),
    };
  }, [allEvents, now]);

  const liveDot = grouped.live.length > 0;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.aside
          key="live-panel"
          initial={{ width: 0, opacity: 0 }}
          animate={{ width: 280, opacity: 1 }}
          exit={{ width: 0, opacity: 0 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="flex flex-col h-screen bg-bg-panel border-l border-border-flow flex-shrink-0 overflow-hidden"
        >
          {/* Panel header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border-flow flex-shrink-0">
            <div className="flex items-center gap-2">
              <span className="text-ui-sm font-semibold text-text-primary">Live Feed</span>
              {liveDot && (
                <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
              )}
            </div>
            <button
              onClick={onToggle}
              aria-label="Close live feed"
              className="w-6 h-6 rounded flex items-center justify-center text-text-muted hover:text-text-primary hover:bg-bg-hover transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Feed content */}
          <div className="flex-1 overflow-y-auto py-2">
            <Group label="Now" items={grouped.live} />
            <Group label="Earlier" items={grouped.earlier} />
            <Group label="Yesterday" items={grouped.older} />

            {allEvents.length === 0 && (
              <div className="flex flex-col items-center justify-center h-32 text-center px-4">
                <Clock className="w-5 h-5 text-text-muted mb-2" />
                <p className="text-ui-sm text-text-muted">No live events yet</p>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-border-flow px-4 py-2.5 flex-shrink-0">
            <button
              onClick={() => window.location.href = "/timeline"}
              className="flex items-center gap-1 text-ui-xs text-text-muted hover:text-text-secondary transition-colors"
            >
              <span>View full timeline</span>
              <ChevronRight className="w-3 h-3" />
            </button>
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add flow-os-frontend/src/components/layout/LiveFeedPanel.jsx
git commit -m "feat: add LiveFeedPanel — real-time right sidebar with WebSocket events"
```

---

### Task 4: LayoutShell Refactor — Three-Column Shell

**Files:**
- Modify: `flow-os-frontend/src/components/layout/LayoutShell.jsx`

**Interfaces:**
- Consumes: `OsRail` (from Task 2), `LiveFeedPanel` (from Task 3), `CommandPalette`, `ShortcutModal`, `AICopilot`, `EntityContextPanel`, `GlobalStatusBar`, `ToastProvider`, `WebSocketProvider`, `useWebSocket`
- Produces: updated `LayoutShell` with three-column layout

Remove `Sidebar` and `Header` from the shell. The three columns are:
1. `OsRail` — 56px fixed left
2. `main` — flex-1, all page content
3. `LiveFeedPanel` — 280px right (toggle button at bottom of OsRail or in GlobalStatusBar)

Keep all keyboard shortcuts and modals (note, email compose). Keep WebSocket connection toast alerts. Keep GlobalStatusBar at the bottom of the center column.

Add a `panelOpen` state (default `true` on wide screens, `false` on narrow). Add a toggle button in GlobalStatusBar or as a floating button above the right panel. On screens < 1280px, LiveFeedPanel defaults closed.

- [ ] **Step 1: Rewrite LayoutShell.jsx**

Full replacement of `flow-os-frontend/src/components/layout/LayoutShell.jsx`:

```jsx
import { useState, useEffect } from "react";
import OsRail from "./OsRail";
import LiveFeedPanel from "./LiveFeedPanel";
import CommandPalette from "../ui/CommandPalette";
import ShortcutModal from "../ui/ShortcutModal";
import AICopilot from "../ui/AICopilot";
import EntityContextPanel from "../workspace/EntityContextPanel";
import Button from "../ui/Button";
import Input from "../ui/Input";
import { WebSocketProvider, useWebSocket } from "../../hooks/useWebSocket";
import ToastProvider, { useToast } from "../ui/ToastProvider";
import GlobalStatusBar from "../ui/GlobalStatusBar";
import { WifiOff, FileText, Send, PanelRight } from "lucide-react";

const LayoutInner = ({ children }) => {
  const { connectionStatus, isAuthLoading } = useWebSocket();
  const { showToast } = useToast();

  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isShortcutOpen, setIsShortcutOpen] = useState(false);
  const [panelOpen, setPanelOpen] = useState(() => window.innerWidth >= 1280);

  const [isNoteOpen, setIsNoteOpen] = useState(false);
  const [noteTitle, setNoteTitle] = useState("");
  const [noteContent, setNoteContent] = useState("");

  const [isComposeOpen, setIsComposeOpen] = useState(false);
  const [emailTo, setEmailTo] = useState("");
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");

  // Keyboard bindings
  useEffect(() => {
    const handleKeyDown = (e) => {
      const isMeta = e.metaKey || e.ctrlKey;
      if (isMeta) {
        if (e.key.toLowerCase() === "k") { e.preventDefault(); setIsSearchOpen((p) => !p); }
        else if (e.key.toLowerCase() === "n") { e.preventDefault(); setIsNoteOpen(true); }
        else if (e.key.toLowerCase() === "e") { e.preventDefault(); setIsComposeOpen(true); }
        else if (e.key === "/") { e.preventDefault(); setIsShortcutOpen(true); }
        else if (e.key.toLowerCase() === "\\") { e.preventDefault(); setPanelOpen((p) => !p); }
      }
    };
    const openSearch  = () => setIsSearchOpen(true);
    const openCompose = () => setIsComposeOpen(true);
    const openNote    = () => setIsNoteOpen(true);

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("flow:open-search",  openSearch);
    window.addEventListener("flow:open-compose", openCompose);
    window.addEventListener("flow:open-note",    openNote);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("flow:open-search",  openSearch);
      window.removeEventListener("flow:open-compose", openCompose);
      window.removeEventListener("flow:open-note",    openNote);
    };
  }, []);

  // WebSocket connection toasts
  useEffect(() => {
    if (!isAuthLoading) {
      if (connectionStatus === "ONLINE") {
        showToast("Connected to FLOW live intelligence stream.", "success");
      } else if (connectionStatus === "RECONNECTING") {
        showToast("Connection lost. Reconnecting...", "warning");
      } else if (connectionStatus === "OFFLINE" || connectionStatus === "ERROR") {
        showToast("FLOW is currently offline. Local cache active.", "error");
      }
    }
  }, [connectionStatus, isAuthLoading, showToast]);

  const handleSaveNote = (e) => {
    e.preventDefault();
    if (!noteTitle.trim()) return;
    showToast("Note draft saved. Connect Obsidian to sync automatically.", "info");
    setNoteTitle(""); setNoteContent(""); setIsNoteOpen(false);
  };

  const handleSendEmail = (e) => {
    e.preventDefault();
    if (!emailTo.trim() || !emailSubject.trim()) return;
    showToast("Email draft staged. Connect Gmail to send from your account.", "info");
    setEmailTo(""); setEmailSubject(""); setEmailBody(""); setIsComposeOpen(false);
  };

  if (isAuthLoading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-bg-primary text-text-primary">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 rounded-full border-4 border-flow-purple/20 border-t-flow-purple animate-spin" />
          <span className="text-ui-sm font-semibold uppercase tracking-widest text-text-secondary">
            Syncing Cognitive Layer...
          </span>
        </div>
      </div>
    );
  }

  const isOffline = connectionStatus === "OFFLINE" || connectionStatus === "ERROR";

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-bg-primary text-text-primary">

      {/* 1. Left icon rail */}
      <OsRail />

      {/* 2. Center content column */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        {isOffline && (
          <div className="bg-critical/12 border-b border-critical/20 px-5 py-2 flex items-center gap-2 text-ui-sm text-critical flex-shrink-0">
            <WifiOff className="w-3.5 h-3.5" />
            <span className="font-semibold">Workspace offline.</span>
            <span className="text-ui-xs opacity-80">Viewing cached intelligence. Sync resumes on reconnect.</span>
          </div>
        )}

        <main className="flex-1 overflow-y-auto bg-bg-primary">
          {children}
        </main>

        <GlobalStatusBar onPanelToggle={() => setPanelOpen((p) => !p)} panelOpen={panelOpen} />
      </div>

      {/* 3. Right live feed panel */}
      <LiveFeedPanel isOpen={panelOpen} onToggle={() => setPanelOpen((p) => !p)} />

      {/* Global overlays */}
      <CommandPalette isOpen={isSearchOpen} onClose={() => setIsSearchOpen(false)} />
      <ShortcutModal isOpen={isShortcutOpen} onClose={() => setIsShortcutOpen(false)} />
      <AICopilot />
      <EntityContextPanel />

      {/* ⌘N — Create Note modal */}
      {isNoteOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setIsNoteOpen(false)}>
          <form onSubmit={handleSaveNote} className="w-full max-w-md bg-bg-card border border-border-flow rounded-xl p-5 gap-4 flex flex-col shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 text-ui-sm font-semibold text-text-primary">
              <FileText className="w-4 h-4 text-flow-purple" />
              <span>Create Note in Obsidian Vault</span>
            </div>
            <Input value={noteTitle} onChange={(e) => setNoteTitle(e.target.value)} placeholder="Note title" required />
            <textarea value={noteContent} onChange={(e) => setNoteContent(e.target.value)} rows={4} placeholder="Write your markdown note..." className="w-full bg-bg-input border border-border-flow focus:border-border-focus rounded-lg p-3 text-ui-sm text-text-primary font-mono focus:outline-none resize-none" />
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="secondary" size="sm" onClick={() => setIsNoteOpen(false)}>Cancel</Button>
              <Button type="submit" variant="primary" size="sm">Save Draft</Button>
            </div>
          </form>
        </div>
      )}

      {/* ⌘E — Compose Email modal */}
      {isComposeOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setIsComposeOpen(false)}>
          <form onSubmit={handleSendEmail} className="w-full max-w-md bg-bg-card border border-border-flow rounded-xl p-5 gap-4 flex flex-col shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 text-ui-sm font-semibold text-text-primary">
              <Send className="w-4 h-4 text-flow-purple" />
              <span>Compose Outbound Email</span>
            </div>
            <Input value={emailTo} onChange={(e) => setEmailTo(e.target.value)} placeholder="To: (recipient email)" required type="email" />
            <Input value={emailSubject} onChange={(e) => setEmailSubject(e.target.value)} placeholder="Subject" required />
            <textarea value={emailBody} onChange={(e) => setEmailBody(e.target.value)} rows={5} placeholder="Write email message body..." className="w-full bg-bg-input border border-border-flow focus:border-border-focus rounded-lg p-3 text-ui-sm text-text-primary focus:outline-none resize-none" />
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="secondary" size="sm" onClick={() => setIsComposeOpen(false)}>Cancel</Button>
              <Button type="submit" variant="primary" size="sm">Stage Draft</Button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

export const LayoutShell = ({ children }) => (
  <WebSocketProvider>
    <ToastProvider>
      <LayoutInner>{children}</LayoutInner>
    </ToastProvider>
  </WebSocketProvider>
);

export default LayoutShell;
```

Note: `GlobalStatusBar` now receives `onPanelToggle` and `panelOpen` props. Task 5 (GlobalStatusBar update) will add those props.

- [ ] **Step 2: Update GlobalStatusBar to accept panel toggle props**

In `flow-os-frontend/src/components/ui/GlobalStatusBar.jsx`, find the function signature and add the props. Add a panel toggle button. The function signature should be:

```jsx
export default function GlobalStatusBar({ onPanelToggle, panelOpen }) {
```

Add a panel toggle button at the far right of the status bar (before the workspace badge):

```jsx
<button
  onClick={onPanelToggle}
  title="Toggle live feed (⌘\)"
  className={`flex items-center gap-1 text-ui-xs transition-colors ${
    panelOpen ? "text-flow-purple" : "text-text-muted hover:text-text-secondary"
  }`}
>
  <PanelRight className="w-3 h-3" />
  <span className="hidden xl:inline">Feed</span>
</button>
```

Import `PanelRight` from lucide-react in GlobalStatusBar.jsx.

- [ ] **Step 3: Build to verify**

```bash
cd flow-os-frontend && npx vite build --mode development 2>&1 | tail -30
```

Expected: zero errors.

- [ ] **Step 4: Commit**

```bash
git add flow-os-frontend/src/components/layout/LayoutShell.jsx flow-os-frontend/src/components/ui/GlobalStatusBar.jsx
git commit -m "feat: three-column layout shell — OsRail + center + LiveFeedPanel"
```

---

### Task 5: ConversationInput Component

**Files:**
- Create: `flow-os-frontend/src/components/brain/ConversationInput.jsx`

**Interfaces:**
- Consumes: nothing external (pure UI)
- Produces: `<ConversationInput onSubmit={fn} isLoading={bool} />` — the Ask FLOW input bar

The input is a multi-line textarea that grows on content. It has a purple focus ring and a faint purple glow on focus. Quick-action chips below it trigger predefined messages. Send on Enter (Shift+Enter for newline). Shows a loading spinner when `isLoading` is true.

- [ ] **Step 1: Create ConversationInput.jsx**

Create `flow-os-frontend/src/components/brain/ConversationInput.jsx`:

```jsx
import { useState, useRef, useEffect } from "react";
import { ArrowUp, Loader2 } from "lucide-react";
import { motion } from "framer-motion";

const QUICK_CHIPS = [
  "What's urgent today?",
  "My meetings",
  "Review GitHub PRs",
  "Team health",
  "Recent incidents",
];

export default function ConversationInput({ onSubmit, isLoading }) {
  const [value, setValue] = useState("");
  const [focused, setFocused] = useState(false);
  const textareaRef = useRef(null);

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [value]);

  function handleSubmit(text) {
    const q = text.trim();
    if (!q || isLoading) return;
    onSubmit(q);
    setValue("");
  }

  function handleKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(value);
    }
  }

  return (
    <div className="w-full">
      {/* Input wrapper */}
      <div
        className={`relative flex items-end gap-2 bg-bg-input border rounded-xl px-4 py-3 transition-all duration-150 ${
          focused
            ? "border-border-focus shadow-[0_0_0_3px_rgba(139,92,246,0.10)] ring-1 ring-flow-purple/20"
            : "border-border-flow"
        }`}
      >
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder="Ask FLOW anything about your workspace..."
          rows={1}
          disabled={isLoading}
          className="flex-1 bg-transparent text-ui-base text-text-primary placeholder:text-text-muted resize-none focus:outline-none leading-relaxed max-h-40 overflow-y-auto"
          style={{ minHeight: "24px" }}
        />

        <button
          onClick={() => handleSubmit(value)}
          disabled={!value.trim() || isLoading}
          aria-label="Send message"
          className={`flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center transition-all ${
            value.trim() && !isLoading
              ? "bg-flow-purple text-white hover:bg-flow-purple/90"
              : "bg-bg-hover text-text-muted cursor-not-allowed"
          }`}
        >
          {isLoading
            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
            : <ArrowUp className="w-3.5 h-3.5" />
          }
        </button>
      </div>

      {/* Quick chips */}
      <div className="flex flex-wrap gap-1.5 mt-2.5">
        {QUICK_CHIPS.map((chip) => (
          <motion.button
            key={chip}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => handleSubmit(chip)}
            disabled={isLoading}
            className="px-3 py-1 rounded-full border border-border-flow text-ui-xs text-text-secondary hover:border-flow-purple/40 hover:text-text-primary hover:bg-bg-selected transition-colors disabled:opacity-40"
          >
            {chip}
          </motion.button>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add flow-os-frontend/src/components/brain/ConversationInput.jsx
git commit -m "feat: ConversationInput — Ask FLOW input with quick chips and auto-resize"
```

---

### Task 6: BrainMessage + Inline Renderers

**Files:**
- Create: `flow-os-frontend/src/components/brain/BrainMessage.jsx`
- Create: `flow-os-frontend/src/components/brain/InlinePRCard.jsx`
- Create: `flow-os-frontend/src/components/brain/InlineMeetingCard.jsx`
- Create: `flow-os-frontend/src/components/brain/InlineApprovalCard.jsx`
- Create: `flow-os-frontend/src/components/brain/InlineMetricCard.jsx`

**Interfaces:**
- Consumes: message objects `{ id, role: 'user'|'assistant', content: string, cards?: [] }`
- Produces: `<BrainMessage message={msg} />` — renders a single conversation message

`BrainMessage` handles both user messages (right-aligned, subtle bg) and assistant messages (left-aligned, with FLOW avatar). Assistant messages reveal word-by-word using a CSS animation. Cards (PR, meeting, approval, metric) render below the text body inline.

- [ ] **Step 1: Create InlinePRCard.jsx**

Create `flow-os-frontend/src/components/brain/InlinePRCard.jsx`:

```jsx
import { GitPullRequest, Circle, CheckCircle2, XCircle } from "lucide-react";

export default function InlinePRCard({ pr }) {
  const score = pr.mergeReadinessScore ?? 0;
  const scoreColor = score >= 80 ? "text-success" : score >= 50 ? "text-warning" : "text-critical";
  const statusIcon = pr.state === "merged"
    ? <CheckCircle2 className="w-3.5 h-3.5 text-success" />
    : pr.state === "closed"
      ? <XCircle className="w-3.5 h-3.5 text-critical" />
      : <Circle className="w-3.5 h-3.5 text-info" />;

  return (
    <div className="border border-border-flow rounded-lg p-3 bg-bg-card hover:bg-bg-hover transition-colors">
      <div className="flex items-start gap-2">
        <GitPullRequest className="w-4 h-4 text-info mt-0.5 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            {statusIcon}
            <span className="text-ui-sm font-medium text-text-primary truncate">{pr.title}</span>
            {pr.number && <span className="text-ui-xs text-text-muted flex-shrink-0">#{pr.number}</span>}
          </div>
          <div className="flex items-center gap-3 text-ui-xs text-text-secondary">
            {pr.author && <span>@{pr.author}</span>}
            {pr.mergeReadinessScore !== undefined && (
              <span className={`font-medium ${scoreColor}`}>Readiness: {score}%</span>
            )}
            {pr.repo && <span className="text-text-muted">{pr.repo}</span>}
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create InlineMeetingCard.jsx**

Create `flow-os-frontend/src/components/brain/InlineMeetingCard.jsx`:

```jsx
import { Calendar, Clock, Users } from "lucide-react";

function fmtTime(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch { return iso; }
}

export default function InlineMeetingCard({ event }) {
  const attendeeCount = event.attendees?.length ?? 0;
  return (
    <div className="border border-border-flow rounded-lg p-3 bg-bg-card hover:bg-bg-hover transition-colors">
      <div className="flex items-start gap-2">
        <Calendar className="w-4 h-4 text-source-calendar mt-0.5 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-ui-sm font-medium text-text-primary truncate">{event.title || event.summary}</p>
          <div className="flex items-center gap-3 text-ui-xs text-text-secondary mt-1">
            {event.start && (
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {fmtTime(event.start)}
                {event.end && ` – ${fmtTime(event.end)}`}
              </span>
            )}
            {attendeeCount > 0 && (
              <span className="flex items-center gap-1">
                <Users className="w-3 h-3" />
                {attendeeCount} attendees
              </span>
            )}
          </div>
        </div>
        {event.videoUrl && (
          <a href={event.videoUrl} target="_blank" rel="noreferrer"
            className="flex-shrink-0 px-2 py-1 rounded bg-success/10 text-success text-ui-xs font-medium hover:bg-success/20 transition-colors">
            Join
          </a>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create InlineApprovalCard.jsx**

Create `flow-os-frontend/src/components/brain/InlineApprovalCard.jsx`:

```jsx
import { ShieldCheck } from "lucide-react";

export default function InlineApprovalCard({ approval }) {
  async function act(action) {
    const token = localStorage.getItem("flow_os_token") || localStorage.getItem("flow_token");
    const ws = localStorage.getItem("flow_os_workspace_id");
    await fetch(`/api/approvals/${approval.id}/${action}`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "workspace-id": ws,
        "Content-Type": "application/json",
      },
    }).catch(() => {});
  }

  return (
    <div className="border border-warning/30 rounded-lg p-3 bg-warning/5">
      <div className="flex items-start gap-2 mb-2">
        <ShieldCheck className="w-4 h-4 text-warning mt-0.5 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-ui-sm font-medium text-text-primary">{approval.action || "Action requires approval"}</p>
          {approval.requestedBy && (
            <p className="text-ui-xs text-text-secondary mt-0.5">Requested by {approval.requestedBy}</p>
          )}
        </div>
      </div>
      <div className="flex gap-2 pl-6">
        <button onClick={() => act("approve")}
          className="px-3 py-1 rounded bg-success/10 text-success text-ui-xs font-medium hover:bg-success/20 transition-colors">
          Approve
        </button>
        <button onClick={() => act("reject")}
          className="px-3 py-1 rounded bg-critical/10 text-critical text-ui-xs font-medium hover:bg-critical/20 transition-colors">
          Reject
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Create InlineMetricCard.jsx**

Create `flow-os-frontend/src/components/brain/InlineMetricCard.jsx`:

```jsx
export default function InlineMetricCard({ title, value, delta, unit = "", status = "info" }) {
  const statusColors = {
    info:     "text-info",
    success:  "text-success",
    warning:  "text-warning",
    critical: "text-critical",
  };
  const deltaSign = delta > 0 ? "+" : "";
  return (
    <div className="border border-border-flow rounded-lg p-3 bg-bg-card inline-flex flex-col gap-0.5 min-w-28">
      <p className="text-ui-xs text-text-muted">{title}</p>
      <p className={`text-ui-xl font-bold ${statusColors[status] || statusColors.info}`}>
        {value}{unit}
      </p>
      {delta !== undefined && (
        <p className="text-ui-xs text-text-secondary">
          {deltaSign}{delta}{unit} <span className="text-text-muted">vs last period</span>
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Create BrainMessage.jsx**

Create `flow-os-frontend/src/components/brain/BrainMessage.jsx`:

```jsx
import { Zap } from "lucide-react";
import { motion } from "framer-motion";
import InlinePRCard from "./InlinePRCard";
import InlineMeetingCard from "./InlineMeetingCard";
import InlineApprovalCard from "./InlineApprovalCard";
import InlineMetricCard from "./InlineMetricCard";

function renderInlineCard(card, i) {
  if (!card || !card.type) return null;
  switch (card.type) {
    case "pr":       return <InlinePRCard key={i} pr={card.data} />;
    case "meeting":  return <InlineMeetingCard key={i} event={card.data} />;
    case "approval": return <InlineApprovalCard key={i} approval={card.data} />;
    case "metric":   return <InlineMetricCard key={i} {...card.data} />;
    default:         return null;
  }
}

// Reveals text word by word using staggered spans
function RevealText({ text }) {
  const words = text.split(" ");
  return (
    <span>
      {words.map((word, i) => (
        <motion.span
          key={i}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: i * 0.018, duration: 0.1 }}
          className="inline"
        >
          {word}{" "}
        </motion.span>
      ))}
    </span>
  );
}

export default function BrainMessage({ message, isLatest }) {
  const isUser = message.role === "user";

  if (isUser) {
    return (
      <div className="flex justify-end mb-4">
        <div className="max-w-xl px-4 py-2.5 rounded-2xl rounded-br-sm bg-bg-selected border border-border-flow">
          <p className="text-ui-base text-text-primary leading-relaxed whitespace-pre-wrap">{message.content}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-3 mb-4">
      {/* FLOW avatar */}
      <div className="w-7 h-7 rounded-lg bg-flow-purple-dim border border-flow-purple/20 flex items-center justify-center flex-shrink-0 mt-0.5">
        <Zap className="w-3.5 h-3.5 text-flow-purple" />
      </div>

      <div className="flex-1 min-w-0">
        {/* Text content */}
        <div className="text-ui-base text-text-primary leading-relaxed whitespace-pre-wrap">
          {isLatest
            ? <RevealText text={message.content} />
            : message.content
          }
        </div>

        {/* Inline cards */}
        {message.cards && message.cards.length > 0 && (
          <div className="mt-3 flex flex-col gap-2 max-w-lg">
            {message.cards.map((card, i) => renderInlineCard(card, i))}
          </div>
        )}

        {/* Action buttons */}
        {message.actions && message.actions.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-3">
            {message.actions.map((action, i) => (
              <button
                key={i}
                onClick={() => action.href ? window.location.href = action.href : null}
                className="px-3 py-1.5 rounded-lg border border-border-flow text-ui-xs text-text-secondary hover:border-flow-purple/40 hover:text-text-primary hover:bg-bg-selected transition-colors"
              >
                {action.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Commit**

```bash
git add flow-os-frontend/src/components/brain/
git commit -m "feat: BrainMessage and inline card renderers (PR, meeting, approval, metric)"
```

---

### Task 7: ConversationThread

**Files:**
- Create: `flow-os-frontend/src/components/brain/ConversationThread.jsx`

**Interfaces:**
- Consumes: `BrainMessage` (from Task 6), `ConversationInput` (from Task 5)
- Produces: `<ConversationThread />` — self-contained conversation state, input, and message history

ConversationThread owns the conversation state (messages array), makes API calls to `/api/brain/copilot`, and auto-scrolls to bottom on new messages. Session state lives in `sessionStorage` so it survives React re-renders but resets on browser refresh.

- [ ] **Step 1: Create ConversationThread.jsx**

Create `flow-os-frontend/src/components/brain/ConversationThread.jsx`:

```jsx
import { useState, useEffect, useRef, useCallback } from "react";
import { motion } from "framer-motion";
import BrainMessage from "./BrainMessage";
import ConversationInput from "./ConversationInput";

const SESSION_KEY = "flow_conversation";

function loadSession() {
  try {
    return JSON.parse(sessionStorage.getItem(SESSION_KEY) || "[]");
  } catch { return []; }
}

function saveSession(msgs) {
  try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(msgs.slice(-30))); } catch {}
}

// Local fallback response when API is unavailable
function buildFallbackResponse(question) {
  return {
    id: Date.now() + Math.random(),
    role: "assistant",
    content: `I received your question: "${question}"\n\nConnect to the FLOW backend to get real-time intelligence. In the meantime, I can tell you that your workspace has active pipelines monitoring GitHub, Calendar, and your communication channels.`,
    actions: [
      { label: "View Timeline →", href: "/timeline" },
      { label: "Check Health →",  href: "/platform/health" },
    ],
  };
}

export default function ConversationThread() {
  const [messages, setMessages] = useState(loadSession);
  const [isLoading, setIsLoading] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    saveSession(messages);
  }, [messages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  const sendMessage = useCallback(async (question) => {
    const userMsg = { id: Date.now() + Math.random(), role: "user", content: question };
    setMessages((prev) => [...prev, userMsg]);
    setIsLoading(true);

    const token = localStorage.getItem("flow_os_token") || localStorage.getItem("flow_token");
    const wsId  = localStorage.getItem("flow_os_workspace_id");

    try {
      const res = await fetch("/api/brain/copilot", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
          "workspace-id": wsId || "",
        },
        body: JSON.stringify({ question, pageContext: "home" }),
      });

      if (!res.ok) throw new Error(`API ${res.status}`);
      const data = await res.json();

      const assistantMsg = {
        id: Date.now() + Math.random(),
        role: "assistant",
        content: data.answer || data.response || data.brief || "I processed your request.",
        cards: data.cards || [],
        actions: data.actions || [],
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch {
      setMessages((prev) => [...prev, buildFallbackResponse(question)]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Message history */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {messages.length === 0 && !isLoading && (
          <div className="h-full flex items-center justify-center">
            <p className="text-ui-sm text-text-muted">Ask FLOW anything about your workspace.</p>
          </div>
        )}

        {messages.map((msg, i) => (
          <BrainMessage
            key={msg.id}
            message={msg}
            isLatest={i === messages.length - 1 && msg.role === "assistant"}
          />
        ))}

        {/* Typing indicator */}
        {isLoading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex gap-3 mb-4"
          >
            <div className="w-7 h-7 rounded-lg bg-flow-purple-dim border border-flow-purple/20 flex items-center justify-center flex-shrink-0">
              <span className="text-flow-purple text-ui-xs">◈</span>
            </div>
            <div className="flex items-center gap-1 pt-2">
              {[0, 1, 2].map((i) => (
                <motion.span
                  key={i}
                  className="w-1.5 h-1.5 rounded-full bg-text-muted"
                  animate={{ opacity: [0.3, 1, 0.3] }}
                  transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }}
                />
              ))}
            </div>
          </motion.div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input area */}
      <div className="px-6 pb-4 pt-2 border-t border-border-flow flex-shrink-0">
        <ConversationInput onSubmit={sendMessage} isLoading={isLoading} />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add flow-os-frontend/src/components/brain/ConversationThread.jsx
git commit -m "feat: ConversationThread — session-persisted conversation with copilot API"
```

---

### Task 8: FlowHome — Root Home Page

**Files:**
- Create: `flow-os-frontend/src/components/home/FlowHome.jsx`

**Interfaces:**
- Consumes: `ConversationThread` (Task 7), `/api/brain/briefing` endpoint
- Produces: `<FlowHome />` — the new root page replacing DailyWorkfeed at `/`

FlowHome has two sections: a morning brief block at the top, then the full-height `ConversationThread` below. The brief shows a FLOW-generated morning context. On load, it fetches `/api/brain/briefing`. If unavailable, it shows demo text. The brief is collapsible after first read. The conversation occupies the remaining viewport height.

- [ ] **Step 1: Create FlowHome.jsx**

Create `flow-os-frontend/src/components/home/FlowHome.jsx`:

```jsx
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, ChevronUp, Zap } from "lucide-react";
import ConversationThread from "../brain/ConversationThread";

const DEMO_BRIEF = "You have 2 meetings today — a sprint planning at 10am and a customer sync at 3pm. GitHub shows 3 PRs awaiting review, one of which is blocking the payment gateway deployment. No critical incidents overnight. Acme Corp opened a support ticket 4 hours ago.";

const GREETINGS = ["Good morning", "Good afternoon", "Good evening"];

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return GREETINGS[0];
  if (h < 18) return GREETINGS[1];
  return GREETINGS[2];
}

function BriefingBlock() {
  const [brief, setBrief] = useState(null);
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState(false);

  const userName = localStorage.getItem("flow_user_name") || localStorage.getItem("flow_user_email") || "";
  const firstName = userName.split(" ")[0] || userName.split("@")[0] || "there";
  const greeting = `${getGreeting()}, ${firstName}.`;

  useEffect(() => {
    const token = localStorage.getItem("flow_os_token") || localStorage.getItem("flow_token");
    const wsId  = localStorage.getItem("flow_os_workspace_id");

    fetch("/api/brain/briefing?role=EXECUTIVE", {
      headers: { "Authorization": `Bearer ${token}`, "workspace-id": wsId || "" },
    })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data) => {
        const text = data.summary || data.brief || data.content || DEMO_BRIEF;
        // Strip markdown headers, keep plain text
        setBrief(text.replace(/^#+\s*/gm, "").replace(/\*\*/g, "").slice(0, 320));
      })
      .catch(() => setBrief(DEMO_BRIEF))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="border-b border-border-flow px-6 py-4 flex-shrink-0">
      <div className="flex items-start justify-between gap-4 max-w-3xl">
        <div className="flex-1 min-w-0">
          <h1 className="text-ui-xl text-text-primary mb-1">{greeting}</h1>
          <AnimatePresence initial={false}>
            {!collapsed && (
              <motion.div
                key="brief-content"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                {loading ? (
                  <div className="space-y-1.5 mt-1">
                    <div className="h-3.5 bg-bg-hover rounded animate-pulse w-4/5" />
                    <div className="h-3.5 bg-bg-hover rounded animate-pulse w-3/5" />
                  </div>
                ) : (
                  <p className="text-ui-base text-text-secondary leading-relaxed mt-1 max-w-2xl">
                    {brief}
                  </p>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {!loading && brief && (
          <button
            onClick={() => setCollapsed((p) => !p)}
            aria-label={collapsed ? "Expand briefing" : "Collapse briefing"}
            className="flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-text-muted hover:text-text-secondary hover:bg-bg-hover transition-colors mt-0.5"
          >
            {collapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
          </button>
        )}
      </div>
    </div>
  );
}

export default function FlowHome() {
  return (
    <div className="flex flex-col h-full">
      <BriefingBlock />
      <ConversationThread />
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add flow-os-frontend/src/components/home/FlowHome.jsx
git commit -m "feat: FlowHome — conversation-first root page with morning brief"
```

---

### Task 9: Settings Hub

**Files:**
- Create: `flow-os-frontend/src/components/settings/SettingsHub.jsx`

**Interfaces:**
- Consumes: all existing platform page components (EnterpriseAdmin, IdentityManagement, WorkspaceManagement, SecurityCenter, AuditCompliance, AIGovernance, IntegrationHub, AnalyticsBilling, Marketplace, ImportDashboard, WorkspaceHealth, EvaluationPlatform)
- Produces: `<SettingsHub />` — mounted at `/settings`, hosts all platform admin pages in a unified tabbed layout

SettingsHub renders a left settings nav (160px) + right content area. The URL updates with a `?tab=` query param so tabs are deep-linkable. On first visit, defaults to the `integrations` tab.

- [ ] **Step 1: Create SettingsHub.jsx**

Create `flow-os-frontend/src/components/settings/SettingsHub.jsx`:

```jsx
import { lazy, Suspense } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Skeleton } from "../ui/Skeleton";

const TABS = [
  { id: "integrations",  label: "Integrations",   component: lazy(() => import("../platform/IntegrationHub")) },
  { id: "workspaces",    label: "Workspaces",      component: lazy(() => import("../platform/WorkspaceManagement")) },
  { id: "iam",           label: "Identity & Access", component: lazy(() => import("../platform/IdentityManagement")) },
  { id: "security",      label: "Security",        component: lazy(() => import("../platform/SecurityCenter")) },
  { id: "audit",         label: "Audit & Compliance", component: lazy(() => import("../platform/AuditCompliance")) },
  { id: "governance",    label: "AI Governance",   component: lazy(() => import("../platform/AIGovernance")) },
  { id: "billing",       label: "Billing",         component: lazy(() => import("../platform/AnalyticsBilling")) },
  { id: "marketplace",   label: "Marketplace",     component: lazy(() => import("../platform/Marketplace")) },
  { id: "import",        label: "Import Engine",   component: lazy(() => import("../platform/ImportDashboard")) },
  { id: "health",        label: "Workspace Health", component: lazy(() => import("../platform/WorkspaceHealth")) },
  { id: "evaluation",    label: "AI Evaluation",   component: lazy(() => import("../platform/EvaluationPlatform")) },
  { id: "company",       label: "Company",         component: lazy(() => import("../company/CompanyWorkspace")) },
];

export default function SettingsHub() {
  const [params, setParams] = useSearchParams();
  const activeTab = params.get("tab") || "integrations";

  const tab = TABS.find((t) => t.id === activeTab) || TABS[0];
  const Component = tab.component;

  function setTab(id) {
    setParams({ tab: id }, { replace: true });
  }

  return (
    <div className="flex h-full">
      {/* Settings nav */}
      <nav className="w-44 flex-shrink-0 border-r border-border-flow py-4 px-2 space-y-0.5">
        <p className="px-3 mb-2 text-ui-xs text-text-muted font-semibold uppercase tracking-widest">Settings</p>
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`w-full text-left px-3 py-1.5 rounded-lg text-ui-sm transition-colors ${
              activeTab === t.id
                ? "bg-bg-selected text-text-primary font-medium"
                : "text-text-secondary hover:text-text-primary hover:bg-bg-hover"
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <Suspense fallback={
          <div className="p-8 space-y-4">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        }>
          <Component />
        </Suspense>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add flow-os-frontend/src/components/settings/SettingsHub.jsx
git commit -m "feat: SettingsHub — unified settings with tabbed nav for all platform pages"
```

---

### Task 10: People Route

**Files:**
- Create: `flow-os-frontend/src/components/people/PeopleIntelligence.jsx`

**Interfaces:**
- Consumes: `CustomerIntelligence`, `WorkforceIntelligence` (both already exist at `components/company/`)
- Produces: `<PeopleIntelligence />` — mounted at `/people`, tabs for Workforce + Customers

- [ ] **Step 1: Create PeopleIntelligence.jsx**

Create `flow-os-frontend/src/components/people/PeopleIntelligence.jsx`:

```jsx
import { useState } from "react";
import { lazy, Suspense } from "react";
import { Skeleton } from "../ui/Skeleton";

const WorkforceIntelligence = lazy(() => import("../company/WorkforceIntelligence"));
const CustomerIntelligence  = lazy(() => import("../company/CustomerIntelligence"));

const TABS = [
  { id: "workforce", label: "Workforce" },
  { id: "customers", label: "Customers" },
];

export default function PeopleIntelligence() {
  const [activeTab, setActiveTab] = useState("workforce");

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="border-b border-border-flow px-6 py-4 flex-shrink-0">
        <h1 className="text-ui-xl text-text-primary mb-3">People</h1>
        <div className="flex gap-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`px-4 py-1.5 rounded-lg text-ui-sm transition-colors ${
                activeTab === t.id
                  ? "bg-bg-selected text-text-primary font-medium"
                  : "text-text-secondary hover:text-text-primary hover:bg-bg-hover"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <Suspense fallback={
          <div className="p-8 space-y-4">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        }>
          {activeTab === "workforce" ? <WorkforceIntelligence /> : <CustomerIntelligence />}
        </Suspense>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add flow-os-frontend/src/components/people/PeopleIntelligence.jsx
git commit -m "feat: PeopleIntelligence — unified workforce + customers page at /people"
```

---

### Task 11: App.jsx Routing Overhaul

**Files:**
- Modify: `flow-os-frontend/src/App.jsx`

**Interfaces:**
- Consumes: `FlowHome` (Task 8), `SettingsHub` (Task 9), `PeopleIntelligence` (Task 10), all existing route components
- Produces: updated `App.jsx` with 18 clean routes + redirects for all retired paths

Remove the 20+ redundant routes. Add `/` → FlowHome, `/people` → PeopleIntelligence, `/settings` (+ `/settings/*`) → SettingsHub. All `/admin/*`, `/company/*`, and `/platform/*` routes become Navigate redirects.

- [ ] **Step 1: Rewrite App.jsx**

Full replacement of `flow-os-frontend/src/App.jsx`:

```jsx
import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import LayoutShell from "./components/layout/LayoutShell";
import ErrorBoundary from "./components/ui/ErrorBoundary";
import PageSkeleton from "./components/ui/PageSkeleton";

// Core routes
const FlowHome           = lazy(() => import('./components/home/FlowHome'));
const AIInbox            = lazy(() => import('./components/inbox/AIInbox'));
const MeetingDashboard   = lazy(() => import('./components/meetings/MeetingDashboard'));
const MeetingPreparation = lazy(() => import('./components/meetings/MeetingPreparation'));
const LiveMeeting        = lazy(() => import('./components/meetings/LiveMeeting'));
const MeetingSummary     = lazy(() => import('./components/meetings/MeetingSummary'));
const ProjectIntelligence = lazy(() => import('./components/projects/ProjectIntelligence'));
const PeopleIntelligence = lazy(() => import('./components/people/PeopleIntelligence'));
const KnowledgeExplorer  = lazy(() => import('./components/knowledge/KnowledgeExplorer'));
const EntityWorkspace    = lazy(() => import('./components/workspace/EntityWorkspace'));
const OperationalTimeline = lazy(() => import('./components/workspace/OperationalTimeline'));

// Settings hub (contains all platform pages)
const SettingsHub        = lazy(() => import('./components/settings/SettingsHub'));

// Admin deep-links (still reachable, not in nav)
const DepartmentIntelligence = lazy(() => import('./components/company/DepartmentIntelligence'));

// Dev only
const DeveloperConsole   = lazy(() => import('./components/ui/DeveloperConsole'));

function App() {
  return (
    <BrowserRouter>
      <LayoutShell>
        <ErrorBoundary>
          <Suspense fallback={<PageSkeleton />}>
            <Routes>
              {/* ── Core navigation routes ─────────────────────────────── */}
              <Route path="/"          element={<FlowHome />} />
              <Route path="/inbox"     element={<AIInbox />} />
              <Route path="/meetings"  element={<MeetingDashboard />} />
              <Route path="/meetings/:id/prep"    element={<MeetingPreparation />} />
              <Route path="/meetings/:id/live"    element={<LiveMeeting />} />
              <Route path="/meetings/:id/summary" element={<MeetingSummary />} />
              <Route path="/projects"  element={<ProjectIntelligence />} />
              <Route path="/people"    element={<PeopleIntelligence />} />
              <Route path="/knowledge" element={<KnowledgeExplorer />} />
              <Route path="/timeline"  element={<OperationalTimeline />} />
              <Route path="/entity/:entityId" element={<EntityWorkspace />} />

              {/* ── Settings hub (all platform admin under one roof) ──── */}
              <Route path="/settings"  element={<SettingsHub />} />
              <Route path="/settings/*" element={<SettingsHub />} />

              {/* ── Department deep-link (still reachable from AI) ────── */}
              <Route path="/admin/departments/:id" element={<DepartmentIntelligence />} />

              {/* ── Developer console (dev-only) ──────────────────────── */}
              <Route path="/query"     element={<DeveloperConsole />} />

              {/* ── Retired routes — redirect to new destinations ──────── */}
              <Route path="/workfeed"          element={<Navigate to="/" replace />} />
              <Route path="/search"            element={<Navigate to="/" replace />} />
              <Route path="/assistant"         element={<Navigate to="/" replace />} />
              <Route path="/briefing"          element={<Navigate to="/" replace />} />
              <Route path="/dashboard"         element={<Navigate to="/" replace />} />
              <Route path="/activity"          element={<Navigate to="/timeline" replace />} />
              <Route path="/company"           element={<Navigate to="/" replace />} />
              <Route path="/company/*"         element={<Navigate to="/" replace />} />
              <Route path="/admin"             element={<Navigate to="/settings?tab=company" replace />} />
              <Route path="/admin/memory"      element={<Navigate to="/" replace />} />
              <Route path="/admin/advisor"     element={<Navigate to="/" replace />} />
              <Route path="/admin/crm"         element={<Navigate to="/people" replace />} />
              <Route path="/admin/workforce"   element={<Navigate to="/people" replace />} />
              <Route path="/platform"          element={<Navigate to="/settings" replace />} />
              <Route path="/platform/iam"      element={<Navigate to="/settings?tab=iam" replace />} />
              <Route path="/platform/workspaces" element={<Navigate to="/settings?tab=workspaces" replace />} />
              <Route path="/platform/security" element={<Navigate to="/settings?tab=security" replace />} />
              <Route path="/platform/audit"    element={<Navigate to="/settings?tab=audit" replace />} />
              <Route path="/platform/governance" element={<Navigate to="/settings?tab=governance" replace />} />
              <Route path="/platform/integrations" element={<Navigate to="/settings?tab=integrations" replace />} />
              <Route path="/platform/billing"  element={<Navigate to="/settings?tab=billing" replace />} />
              <Route path="/platform/marketplace" element={<Navigate to="/settings?tab=marketplace" replace />} />
              <Route path="/platform/import"   element={<Navigate to="/settings?tab=import" replace />} />
              <Route path="/platform/onboarding" element={<Navigate to="/settings?tab=company" replace />} />
              <Route path="/platform/health"   element={<Navigate to="/settings?tab=health" replace />} />
              <Route path="/platform/evaluation" element={<Navigate to="/settings?tab=evaluation" replace />} />
              <Route path="/security"          element={<Navigate to="/settings?tab=security" replace />} />
              <Route path="/help"              element={<Navigate to="/" replace />} />

              {/* ── Catch-all ─────────────────────────────────────────── */}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </ErrorBoundary>
      </LayoutShell>
    </BrowserRouter>
  );
}

export default App;
```

- [ ] **Step 2: Build to verify**

```bash
cd flow-os-frontend && npx vite build --mode development 2>&1 | tail -40
```

Expected: zero errors. If any lazy import paths are wrong, fix the path.

- [ ] **Step 3: Commit**

```bash
git add flow-os-frontend/src/App.jsx
git commit -m "refactor: routing overhaul — 18 clean routes, 25+ redirects, FlowHome at /"
```

---

### Task 12: Animation + Polish Pass

**Files:**
- Modify: `flow-os-frontend/src/styles/animations.css`
- Modify: `flow-os-frontend/src/styles/globals.css`
- Modify: `flow-os-frontend/src/components/layout/OsRail.jsx` (active state animation)

**Interfaces:**
- Consumes: all Task outputs
- Produces: polished motion, reduced-motion safety, keyboard nav, final production build

- [ ] **Step 1: Add keyframes to animations.css**

Append to `flow-os-frontend/src/styles/animations.css`:

```css
/* AI typing dot bounce */
@keyframes dot-pulse {
  0%, 80%, 100% { opacity: 0.3; transform: scale(0.8); }
  40% { opacity: 1; transform: scale(1); }
}

/* Feed item entrance */
@keyframes slide-in-right {
  from { opacity: 0; transform: translateX(10px); }
  to   { opacity: 1; transform: translateX(0); }
}

/* Conversation message entrance */
@keyframes message-appear {
  from { opacity: 0; transform: translateY(6px); }
  to   { opacity: 1; transform: translateY(0); }
}

/* OsRail active indicator */
@keyframes rail-glow {
  0%   { box-shadow: 0 0 0 rgba(139,92,246,0); }
  50%  { box-shadow: 0 0 8px rgba(139,92,246,0.3); }
  100% { box-shadow: 0 0 0 rgba(139,92,246,0); }
}

/* Reduced motion overrides */
@media (prefers-reduced-motion: reduce) {
  .animate-spin,
  .animate-pulse,
  .animate-shimmer,
  .animate-float,
  .animate-glow-pulse { animation: none !important; }

  /* Framer Motion: instant transitions when motion is reduced */
  [style*="transition"] { transition-duration: 0.01ms !important; }
}
```

- [ ] **Step 2: Verify production build passes**

```bash
cd flow-os-frontend && npm run build 2>&1 | tail -20
```

Expected: successful build, no TypeScript errors, no unresolved imports.

- [ ] **Step 3: Verify dev server starts**

```bash
cd flow-os-frontend && timeout 10 npm run dev 2>&1 | head -20
```

Expected: "Local: http://localhost:3000" or "http://localhost:5173".

- [ ] **Step 4: Final commit**

```bash
git add flow-os-frontend/src/styles/animations.css
git commit -m "polish: motion keyframes, reduced-motion safety, final production build ✓"
```

---

## Implementation Notes for Subagents

1. **All tasks are independent** — each can be read in isolation. Earlier task outputs become inputs to later tasks via file paths only.
2. **Build after Tasks 4 and 11** — these are the two integration points where the whole frontend wires together.
3. **Demo fallbacks are mandatory** — every API call must `.catch()` to static data. The UI must render without a running backend.
4. **Tailwind v4 quirk** — `bg-flow-purple-dim` maps from `--color-flow-purple-dim`. If a utility class fails, check `tokens.css` has the token and restart Vite.
5. **Do NOT import Sidebar.jsx or Header.jsx** anywhere after Task 4. They remain on disk but are fully replaced.
6. **Do NOT modify existing page components** (meetings, projects, inbox, knowledge, etc.) — they plug in unchanged.
7. **framer-motion v12** — uses `motion.div` (not `m.div`). `AnimatePresence` wraps conditional renders.
