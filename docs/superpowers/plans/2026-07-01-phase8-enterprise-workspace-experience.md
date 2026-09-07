# Phase 8.0 — Enterprise Workspace Experience

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Make FLOW OS feel like a polished, real enterprise operating system — unified home dashboard, intelligent navigation, live status surfaces, notification center, consistent design language, and zero alert() stubs.

**Architecture:** All changes are frontend-only (flow-os-frontend/src/). No new backend services. Every new data fetch uses existing APIs: /api/brain/*, /api/connectors/*, /api/intelligence/*. Existing components are extended, not replaced.

**Tech Stack:** React 18, Vite, Tailwind CSS v4, Framer Motion, Lucide React, React Router v6, CSS custom properties (design tokens in styles/tokens.css).

## Global Constraints

- ESM only — all files use `import`/`export`. No `require()`.
- All component files are `.jsx` (NOT `.tsx`). Do not create TypeScript files.
- CSS custom properties only — never raw hex values in component files. Use `text-text-primary`, `bg-bg-card`, `border-border-flow`, `text-flow-purple`, `bg-critical`, etc.
- Tailwind v4 syntax — use `border-border-flow/80` for opacity, not `border-opacity-80`.
- Reuse existing primitives: Button, Card, Badge, Avatar, StatusDot, GlassPanel, Skeleton, LoadingSpinner, EmptyState, ToastProvider, PageContainer.
- Never duplicate a dashboard. `/workfeed` is home. `/dashboard` is executive.
- `useWebSocket()` provides `connectionStatus`, `workspaceId`, `token`, `isAuthLoading`.
- API calls: `Authorization: Bearer ${token}` + `'workspace-id': workspaceId` headers.
- All fetches need demo/fallback data — never leave a component in permanent skeleton state.
- Working directory: `/Users/kishorevarma/Desktop/flow-os-backend/flow-os-frontend/`
- Backend runs at `http://localhost:5001`.

---

## Task 1: Sidebar — Intelligence Module Navigation

**Files:**
- Modify: `src/components/layout/Sidebar.jsx` (currently 188 lines)

**What changes:**
The current sidebar has a flat list of 9 nav items + 2 personal + 2 system + 7 enterprise (hidden behind `dev_mode` flag). Reorganize into Intelligence Module groups that match FLOW's product structure. Remove the `dev_mode` gating (all items visible to authenticated users). Fix hardcoded "Kishore Varma" in the user tray.

**New navigation structure:**
```
[Brand Header]

HOME
  • Home          /workfeed          (Home icon)
  • Search        /search            (Search icon)
  • AI Briefing   /briefing          (Newspaper icon)
  • Timeline      /timeline          (Clock icon)

INTELLIGENCE
  • Exec Dashboard   /dashboard         (LayoutDashboard icon)
  • Meetings         /meetings          (Calendar icon)
  • Projects         /projects          (Briefcase icon)
  • Inbox            /inbox             (Inbox icon)
  • Knowledge        /knowledge         (BookOpen icon)

COMPANY
  • Company Overview /admin             (Building icon)
  • Team Dashboard   /company           (Users icon)
  • AI Advisor       /admin/advisor     (Bot icon)

PLATFORM (replaces "Enterprise" + removes dev_mode gate)
  • Integrations     /platform/integrations  (Plug icon)
  • Workspace Health /platform/health        (Activity icon)
  • Import Engine    /platform/import        (Download icon)
  • Platform Admin   /platform               (Server icon)
  • Security         /platform/security      (Shield icon)

SYSTEM
  • Settings         /settings          (Settings icon)
  • Help             /help              (HelpCircle icon)
```

**User tray fix:** Replace hardcoded "Kishore Varma" with a dynamic display name. Read from `localStorage.getItem('flow_user_name') || localStorage.getItem('flow_user_email') || 'FLOW User'`. The `useWebSocket` hook auto-authenticates; after auth succeeds the username can be stored.

**Implementation steps:**

- [ ] **Step 1: Update Sidebar.jsx**

Replace the entire file content with the new version below:

```jsx
import { useState, useEffect } from "react";
import { NavLink, useLocation } from "react-router-dom";
import {
  Home, Search, Calendar, BookOpen, Briefcase,
  Inbox, Settings, HelpCircle, Building,
  ChevronLeft, ChevronRight, Server, Activity, Download,
  Newspaper, LayoutDashboard, Clock, Users, Bot,
  Plug, Shield
} from "lucide-react";
import { useWebSocket } from "../../hooks/useWebSocket";
import GlassPanel from "../ui/GlassPanel";
import Avatar from "../ui/Avatar";
import StatusDot from "../ui/StatusDot";

const NAV_GROUPS = [
  {
    label: "HOME",
    items: [
      { label: "Home",        path: "/workfeed",   icon: Home },
      { label: "Search",      path: "/search",     icon: Search },
      { label: "AI Briefing", path: "/briefing",   icon: Newspaper },
      { label: "Timeline",    path: "/timeline",   icon: Clock },
    ],
  },
  {
    label: "INTELLIGENCE",
    items: [
      { label: "Exec Dashboard", path: "/dashboard", icon: LayoutDashboard },
      { label: "Meetings",       path: "/meetings",  icon: Calendar },
      { label: "Projects",       path: "/projects",  icon: Briefcase },
      { label: "Inbox",          path: "/inbox",     icon: Inbox },
      { label: "Knowledge",      path: "/knowledge", icon: BookOpen },
    ],
  },
  {
    label: "COMPANY",
    items: [
      { label: "Company Overview", path: "/admin",         icon: Building },
      { label: "Team Dashboard",   path: "/company",       icon: Users },
      { label: "AI Advisor",       path: "/admin/advisor", icon: Bot },
    ],
  },
  {
    label: "PLATFORM",
    items: [
      { label: "Integrations",     path: "/platform/integrations", icon: Plug },
      { label: "Workspace Health", path: "/platform/health",       icon: Activity },
      { label: "Import Engine",    path: "/platform/import",       icon: Download },
      { label: "Platform Admin",   path: "/platform",              icon: Server },
      { label: "Security",         path: "/platform/security",     icon: Shield },
    ],
  },
  {
    label: "SYSTEM",
    items: [
      { label: "Settings", path: "/settings", icon: Settings },
      { label: "Help",     path: "/help",     icon: HelpCircle },
    ],
  },
];

export const Sidebar = ({ isCollapsed, onToggle, mobileOpen, onMobileClose }) => {
  const location = useLocation();
  const { connectionStatus, workspaceId } = useWebSocket();

  const displayName = localStorage.getItem('flow_user_name')
    || localStorage.getItem('flow_user_email')
    || 'FLOW User';

  const displayWorkspace = workspaceId
    ? workspaceId.replace('workspace_', '').replace(/_/g, '-').toUpperCase()
    : 'NONE';

  const NavItem = ({ item }) => {
    const Icon = item.icon;
    const isActive = location.pathname === item.path
      || (item.path === "/workfeed" && location.pathname === "/")
      || (item.path !== "/platform" && location.pathname.startsWith(item.path) && item.path !== "/admin" && item.path.length > 1)
      || (item.path === "/admin" && location.pathname === "/admin");

    return (
      <li>
        <NavLink
          to={item.path}
          onClick={onMobileClose}
          className={`flex items-center rounded-lg px-3 py-2 transition-apple text-ui-sm text-left w-full select-none ${
            isActive
              ? "bg-flow-purple/10 text-white font-medium border-l-2 border-flow-purple rounded-l-none pl-2.5"
              : "text-text-secondary hover:bg-bg-hover hover:text-text-primary"
          }`}
          title={isCollapsed ? item.label : undefined}
        >
          <Icon className={`w-4 h-4 flex-shrink-0 ${isActive ? "text-flow-purple" : "text-text-muted"}`} />
          {!isCollapsed && <span className="ml-3 truncate">{item.label}</span>}
        </NavLink>
      </li>
    );
  };

  const sidebarContent = (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Brand Header */}
      <div className="h-16 flex items-center justify-between px-4 border-b border-border-flow/80 flex-shrink-0">
        <div className="flex items-center space-x-3 overflow-hidden">
          <span className="text-ui-xl text-flow-purple flex-shrink-0 font-semibold select-none">◈</span>
          {!isCollapsed && (
            <span className="text-ui-md font-bold tracking-tight text-white select-none">
              FLOW<span className="text-flow-purple">OS</span>
            </span>
          )}
        </div>
        {!isCollapsed && (
          <span className="text-[9px] font-bold bg-bg-secondary text-text-secondary border border-border-flow/90 px-1.5 py-0.5 rounded truncate max-w-[80px]">
            {displayWorkspace}
          </span>
        )}
      </div>

      {/* Navigation */}
      <div className="flex-1 overflow-y-auto px-2 py-3 space-y-1">
        {NAV_GROUPS.map((group) => (
          <div key={group.label} className="pt-3 first:pt-0">
            {!isCollapsed && (
              <span className="block px-3 mb-1 text-[9px] font-bold text-text-muted uppercase tracking-wider">
                {group.label}
              </span>
            )}
            <ul className="space-y-0.5">
              {group.items.map((item) => (
                <NavItem key={item.path} item={item} />
              ))}
            </ul>
          </div>
        ))}
      </div>

      {/* User Tray */}
      <div className="p-3 border-t border-border-flow/80 bg-bg-secondary/40 flex-shrink-0 flex items-center justify-between">
        <div className="flex items-center space-x-3 overflow-hidden">
          <Avatar name={displayName} size="sm" />
          {!isCollapsed && (
            <div className="flex flex-col min-w-0">
              <span className="text-ui-sm font-semibold text-text-primary truncate">{displayName}</span>
              <div className="flex items-center space-x-1.5 text-[9px] text-text-muted font-bold tracking-wider">
                <span className="text-flow-purple bg-flow-purple/10 px-1 rounded border border-flow-purple/20">PRO</span>
                <span className="flex items-center gap-1">
                  <StatusDot status={connectionStatus === 'ONLINE' ? 'online' : 'connecting'} />
                  <span>{connectionStatus}</span>
                </span>
              </div>
            </div>
          )}
        </div>
        <button
          onClick={onToggle}
          className="hidden md:flex items-center justify-center p-1 rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-hover transition-colors border border-transparent hover:border-white/5 cursor-pointer"
        >
          {isCollapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronLeft className="w-3.5 h-3.5" />}
        </button>
      </div>
    </div>
  );

  return (
    <>
      <GlassPanel
        className={`hidden md:block h-screen flex-shrink-0 border-r border-border-flow/80 rounded-none shadow-none z-30 transition-all duration-300 ${isCollapsed ? "w-16" : "w-64"}`}
      >
        {sidebarContent}
      </GlassPanel>

      {mobileOpen && (
        <>
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-xs z-40 md:hidden"
            onClick={onMobileClose}
          />
          <GlassPanel className="fixed inset-y-0 left-0 w-64 h-full border-r border-border-flow rounded-none z-50 md:hidden animate-fade-in">
            {sidebarContent}
          </GlassPanel>
        </>
      )}
    </>
  );
};

export default Sidebar;
```

- [ ] **Step 2: Verify no import errors**
Run: `cd flow-os-frontend && npx vite build --mode development 2>&1 | head -30`
Expected: No "Cannot find module" or "SyntaxError" lines.

- [ ] **Step 3: Commit**
```bash
git add flow-os-frontend/src/components/layout/Sidebar.jsx
git commit -m "feat(nav): reorganize sidebar into Intelligence Module groups, remove dev_mode gate"
```

---

## Task 2: Header — Breadcrumb, User Menu, Workspace Switcher

**Files:**
- Modify: `src/components/layout/Header.jsx` (currently 146 lines)

**What changes:**
1. Complete the `getPageTitle` switch to cover all routes (currently falls through to "Module" for most routes)
2. Replace hardcoded "Kishore Varma" Avatar with dynamic display name
3. Add a minimal workspace switcher dropdown (reads from localStorage, offers "Switch Workspace" link)
4. Add an "Active AI" indicator showing the WebSocket event count from the last 60s (badge on a Cpu icon)
5. Connector health indicator: a small colored dot beside the status pill showing how many connectors are healthy

**Full route breadcrumb map** (complete):
```
/workfeed, /         → "Home"
/search              → "Search"
/assistant           → "AI Assistant"
/briefing            → "AI Briefing"
/timeline            → "Timeline"
/dashboard           → "Executive Dashboard"
/meetings            → "Meetings"
/meetings/:id/prep   → "Meeting Prep"
/meetings/:id/live   → "Live Meeting"
/meetings/:id/summary→ "Meeting Summary"
/knowledge           → "Knowledge"
/projects            → "Projects"
/inbox               → "Inbox"
/admin               → "Company Overview"
/admin/advisor       → "AI Advisor"
/admin/departments/* → "Department"
/admin/memory        → "Company Memory"
/admin/crm           → "Customer Intelligence"
/admin/workforce     → "Workforce Intelligence"
/company             → "Team Dashboard"
/company/decisions   → "Decision Board"
/company/memory      → "Team Memory"
/company/collaboration → "Collaboration Hub"
/platform            → "Platform Admin"
/platform/iam        → "Identity & Access"
/platform/workspaces → "Workspaces"
/platform/security   → "Security Center"
/platform/audit      → "Audit & Compliance"
/platform/governance → "AI Governance"
/platform/integrations → "Integrations"
/platform/billing    → "Billing & Analytics"
/platform/marketplace→ "Marketplace"
/platform/import     → "Import Engine"
/platform/onboarding → "Onboarding"
/platform/health     → "Workspace Health"
/platform/evaluation → "AI Evaluation"
/security            → "Security"
/settings            → "Settings"
/activity            → "Activity"
/help                → "Help"
/entity/*            → "Entity Workspace"
/query               → "Developer Console"
default              → "FLOW"
```

**Implementation steps:**

- [ ] **Step 1: Rewrite Header.jsx**

```jsx
import { useState, useRef, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Bell, Sun, Moon, Search, Menu, Cpu, ChevronDown, LogOut, User, Building } from "lucide-react";
import { useWebSocket } from "../../hooks/useWebSocket";
import GlassPanel from "../ui/GlassPanel";
import Avatar from "../ui/Avatar";
import StatusDot from "../ui/StatusDot";
import NotificationDropdown from "../ui/NotificationDropdown";

const ROUTE_TITLES = {
  "/": "Home", "/workfeed": "Home", "/search": "Search",
  "/assistant": "AI Assistant", "/briefing": "AI Briefing", "/timeline": "Timeline",
  "/dashboard": "Executive Dashboard", "/meetings": "Meetings",
  "/knowledge": "Knowledge", "/projects": "Projects", "/inbox": "Inbox",
  "/admin": "Company Overview", "/admin/advisor": "AI Advisor",
  "/admin/memory": "Company Memory", "/admin/crm": "Customer Intelligence",
  "/admin/workforce": "Workforce Intelligence",
  "/company": "Team Dashboard", "/company/decisions": "Decision Board",
  "/company/memory": "Team Memory", "/company/collaboration": "Collaboration Hub",
  "/platform": "Platform Admin", "/platform/iam": "Identity & Access",
  "/platform/workspaces": "Workspaces", "/platform/security": "Security Center",
  "/platform/audit": "Audit & Compliance", "/platform/governance": "AI Governance",
  "/platform/integrations": "Integrations", "/platform/billing": "Billing & Analytics",
  "/platform/marketplace": "Marketplace", "/platform/import": "Import Engine",
  "/platform/onboarding": "Onboarding", "/platform/health": "Workspace Health",
  "/platform/evaluation": "AI Evaluation",
  "/security": "Security", "/settings": "Settings", "/activity": "Activity",
  "/help": "Help", "/query": "Developer Console",
};

function getPageTitle(pathname) {
  if (ROUTE_TITLES[pathname]) return ROUTE_TITLES[pathname];
  if (pathname.startsWith("/meetings/") && pathname.endsWith("/prep")) return "Meeting Prep";
  if (pathname.startsWith("/meetings/") && pathname.endsWith("/live")) return "Live Meeting";
  if (pathname.startsWith("/meetings/") && pathname.endsWith("/summary")) return "Meeting Summary";
  if (pathname.startsWith("/admin/departments/")) return "Department";
  if (pathname.startsWith("/entity/")) return "Entity Workspace";
  return "FLOW";
}

export const Header = ({ onMobileOpen, onSearchOpen }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { connectionStatus, events } = useWebSocket();

  const [theme, setTheme] = useState(() => localStorage.getItem("theme") || "dark");
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const userMenuRef = useRef(null);

  // Count AI events in the last 60 seconds
  const recentAiCount = events
    ? events.filter(e => Date.now() - new Date(e.timestamp || Date.now()).getTime() < 60000).length
    : 0;

  const displayName = localStorage.getItem('flow_user_name')
    || localStorage.getItem('flow_user_email')
    || 'FLOW User';

  const workspaceDisplay = (() => {
    const wsId = localStorage.getItem('flow_workspace_id') || '';
    return wsId.replace('workspace_', '').replace(/_/g, ' ').toUpperCase() || 'WORKSPACE';
  })();

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    localStorage.setItem("theme", theme);
  }, [theme]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target)) {
        setIsUserMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('flow_token');
    localStorage.removeItem('flow_user_name');
    localStorage.removeItem('flow_user_email');
    localStorage.removeItem('flow_workspace_id');
    navigate('/');
    window.location.reload();
  };

  const statusLabel = {
    ONLINE: 'CONNECTED', CONNECTING: 'SYNCING',
    RECONNECTING: 'RECONNECTING', ERROR: 'MAINTENANCE', OFFLINE: 'OFFLINE',
  }[connectionStatus] || connectionStatus;

  const statusDotState = {
    ONLINE: 'online', CONNECTING: 'connecting',
    RECONNECTING: 'warning', ERROR: 'critical', OFFLINE: 'critical',
  }[connectionStatus] || 'connecting';

  const pageTitle = getPageTitle(location.pathname);

  return (
    <GlassPanel
      as="header"
      className="h-16 border-b border-border-flow/80 rounded-none shadow-none px-6 flex items-center justify-between sticky top-0 z-40 bg-bg-primary/60 backdrop-blur-md"
    >
      {/* Left: Mobile hamburger + Breadcrumb */}
      <div className="flex items-center space-x-4">
        <button
          onClick={onMobileOpen}
          className="md:hidden p-1.5 rounded-lg text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-colors border border-transparent hover:border-white/5 cursor-pointer"
        >
          <Menu className="w-5 h-5" />
        </button>
        <div className="flex items-center space-x-2 text-ui-sm select-none">
          <span className="font-semibold text-text-muted">FLOW</span>
          <span className="text-text-muted">/</span>
          <span className="font-semibold text-text-primary">{pageTitle}</span>
        </div>
      </div>

      {/* Center: Search trigger */}
      <div className="hidden sm:block flex-1 max-w-sm mx-4">
        <button
          onClick={onSearchOpen}
          className="w-full flex items-center justify-between px-3 py-1.5 rounded-lg text-ui-sm text-text-muted hover:text-text-secondary bg-bg-primary border border-border-flow transition-apple text-left cursor-pointer"
        >
          <div className="flex items-center space-x-2">
            <Search className="w-3.5 h-3.5" />
            <span>Search intelligence...</span>
          </div>
          <kbd className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold text-text-muted bg-bg-secondary border border-border-flow/80">
            ⌘K
          </kbd>
        </button>
      </div>

      {/* Right controls */}
      <div className="flex items-center space-x-2">
        {/* AI Activity indicator */}
        {recentAiCount > 0 && (
          <div className="hidden sm:flex items-center space-x-1.5 bg-flow-purple/10 border border-flow-purple/20 px-2.5 py-1 rounded-full text-ui-xs font-semibold text-flow-purple select-none">
            <Cpu className="w-3 h-3" />
            <span>{recentAiCount} AI events</span>
          </div>
        )}

        {/* Connection status pill */}
        <div className="hidden sm:flex items-center space-x-2 bg-bg-secondary border border-border-flow px-2.5 py-1 rounded-full text-ui-xs font-semibold text-text-secondary select-none">
          <StatusDot status={statusDotState} />
          <span className="uppercase tracking-wider">{statusLabel}</span>
        </div>

        {/* Notifications */}
        <div className="relative">
          <button
            onClick={() => setIsNotifOpen((prev) => !prev)}
            className={`p-2 rounded-lg transition-apple border cursor-pointer relative ${
              isNotifOpen
                ? "bg-flow-purple/10 border-flow-purple/20 text-flow-purple"
                : "bg-transparent border-transparent text-text-secondary hover:text-text-primary hover:bg-bg-hover hover:border-white/5"
            }`}
          >
            <Bell className="w-4 h-4" />
            <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-flow-purple animate-pulse" />
          </button>
          <NotificationDropdown isOpen={isNotifOpen} onClose={() => setIsNotifOpen(false)} />
        </div>

        {/* Theme toggle */}
        <button
          onClick={() => setTheme(t => t === "dark" ? "light" : "dark")}
          className="p-2 rounded-lg text-text-secondary hover:text-text-primary hover:bg-bg-hover border border-transparent hover:border-white/5 transition-apple cursor-pointer"
          title={theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
        >
          {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>

        {/* User menu */}
        <div className="relative" ref={userMenuRef}>
          <button
            onClick={() => setIsUserMenuOpen(prev => !prev)}
            className="flex items-center space-x-2 p-1 rounded-lg hover:bg-bg-hover border border-transparent hover:border-white/5 transition-apple cursor-pointer"
          >
            <Avatar name={displayName} size="sm" />
            <ChevronDown className="hidden sm:block w-3 h-3 text-text-muted" />
          </button>

          {isUserMenuOpen && (
            <div className="absolute right-0 top-full mt-2 w-52 bg-bg-card border border-border-flow rounded-xl shadow-2xl z-50 overflow-hidden animate-fade-in">
              <div className="px-4 py-3 border-b border-border-flow/60">
                <p className="text-ui-sm font-semibold text-text-primary truncate">{displayName}</p>
                <p className="text-ui-xs text-text-muted truncate mt-0.5">{workspaceDisplay}</p>
              </div>
              <div className="py-1">
                <button
                  onClick={() => { setIsUserMenuOpen(false); navigate('/settings'); }}
                  className="w-full flex items-center space-x-3 px-4 py-2.5 text-ui-sm text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-colors text-left cursor-pointer"
                >
                  <User className="w-4 h-4" />
                  <span>Profile & Settings</span>
                </button>
                <button
                  onClick={() => { setIsUserMenuOpen(false); navigate('/platform/workspaces'); }}
                  className="w-full flex items-center space-x-3 px-4 py-2.5 text-ui-sm text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-colors text-left cursor-pointer"
                >
                  <Building className="w-4 h-4" />
                  <span>Switch Workspace</span>
                </button>
                <div className="border-t border-border-flow/60 mt-1 pt-1">
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center space-x-3 px-4 py-2.5 text-ui-sm text-critical hover:bg-critical/10 transition-colors text-left cursor-pointer"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>Sign Out</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </GlassPanel>
  );
};

export default Header;
```

- [ ] **Step 2: Verify build**
Run: `cd flow-os-frontend && npx vite build --mode development 2>&1 | grep -E "error|Error" | head -10`
Expected: No output (no errors).

- [ ] **Step 3: Commit**
```bash
git add flow-os-frontend/src/components/layout/Header.jsx
git commit -m "feat(header): complete breadcrumbs, user menu, workspace display, AI activity badge"
```

---

## Task 3: Global Status Bar

**Files:**
- Create: `src/components/ui/GlobalStatusBar.jsx`
- Modify: `src/components/layout/LayoutShell.jsx` (add status bar below main content, above the window edge)

**What it shows** (pinned to bottom of viewport, 32px tall, full width):
```
[● Connectors: 11 registered  |  ◎ AI: Active  |  ⟳ Queue: Ready  |  ↻ Last sync: 2m ago  |  ◈ Workspace: CORP-ALPHA]   [right: FLOW OS v2.0  |  ⌘K Search]
```

Data sources:
- Connector count + health: `GET /api/connectors` (fallback: "11 connectors")
- Queue/AI status: derived from `connectionStatus` from `useWebSocket()`
- Last sync: show time since last WebSocket event (`events` array)
- Workspace: from `workspaceId` via `useWebSocket()`

**Implementation steps:**

- [ ] **Step 1: Create GlobalStatusBar.jsx**

```jsx
import { useState, useEffect } from "react";
import { Circle, Cpu, RefreshCw, Wifi, Zap } from "lucide-react";
import { useWebSocket } from "../../hooks/useWebSocket";

function timeSince(date) {
  const seconds = Math.floor((Date.now() - date) / 1000);
  if (seconds < 10) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.floor(minutes / 60)}h ago`;
}

export function GlobalStatusBar() {
  const { connectionStatus, workspaceId, token, events } = useWebSocket();
  const [connectorCount, setConnectorCount] = useState(null);
  const [lastEventTime, setLastEventTime] = useState(Date.now());
  const [tick, setTick] = useState(0);

  // Update last event time whenever a new event arrives
  useEffect(() => {
    if (events && events.length > 0) {
      setLastEventTime(Date.now());
    }
  }, [events]);

  // Tick every 30s so "timeSince" display stays fresh
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 30000);
    return () => clearInterval(id);
  }, []);

  // Fetch connector count once on mount (non-critical — fails silently)
  useEffect(() => {
    if (!token || !workspaceId) return;
    fetch('http://localhost:5001/api/connectors', {
      headers: {
        Authorization: `Bearer ${token}`,
        'workspace-id': workspaceId,
      },
    })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data) {
          const list = data.connectors || data || [];
          setConnectorCount(Array.isArray(list) ? list.length : 11);
        }
      })
      .catch(() => {});
  }, [token, workspaceId]);

  const isOnline = connectionStatus === 'ONLINE';
  const wsDisplay = workspaceId
    ? workspaceId.replace('workspace_', '').replace(/_/g, '-').toUpperCase()
    : 'NO WORKSPACE';

  return (
    <div className="h-7 flex-shrink-0 border-t border-border-flow/60 bg-bg-secondary/80 backdrop-blur-sm flex items-center justify-between px-4 text-[10px] text-text-muted font-mono select-none z-20">
      <div className="flex items-center space-x-4 overflow-hidden">
        {/* Connector health */}
        <span className="flex items-center space-x-1.5">
          <Circle className={`w-2 h-2 fill-current ${isOnline ? 'text-success' : 'text-critical'}`} />
          <span>{connectorCount !== null ? connectorCount : '—'} connectors</span>
        </span>

        <span className="text-border-flow">|</span>

        {/* AI status */}
        <span className="flex items-center space-x-1.5">
          <Cpu className="w-2.5 h-2.5 text-flow-purple" />
          <span className="text-flow-purple">AI {isOnline ? 'Active' : 'Offline'}</span>
        </span>

        <span className="text-border-flow">|</span>

        {/* Queue */}
        <span className="flex items-center space-x-1.5">
          <Zap className="w-2.5 h-2.5 text-warning" />
          <span>Queue {isOnline ? 'Ready' : 'Paused'}</span>
        </span>

        <span className="text-border-flow hidden sm:inline">|</span>

        {/* Last sync */}
        <span className="hidden sm:flex items-center space-x-1.5">
          <RefreshCw className="w-2.5 h-2.5" />
          <span>Sync {timeSince(lastEventTime)}</span>
        </span>

        <span className="text-border-flow hidden md:inline">|</span>

        {/* Workspace */}
        <span className="hidden md:flex items-center space-x-1.5">
          <Wifi className="w-2.5 h-2.5" />
          <span className="truncate max-w-[120px]">{wsDisplay}</span>
        </span>
      </div>

      {/* Right side */}
      <div className="flex items-center space-x-4 flex-shrink-0">
        <span className="hidden sm:inline">FLOW OS v2.0</span>
        <span className="text-border-flow hidden sm:inline">|</span>
        <span className="flex items-center space-x-1">
          <kbd className="px-1 py-0.5 rounded bg-bg-primary border border-border-flow text-[9px]">⌘K</kbd>
          <span>Search</span>
        </span>
      </div>
    </div>
  );
}

export default GlobalStatusBar;
```

- [ ] **Step 2: Add GlobalStatusBar to LayoutShell.jsx**

In `src/components/layout/LayoutShell.jsx`:

Add the import at the top:
```jsx
import GlobalStatusBar from "../ui/GlobalStatusBar";
```

Inside the return of `LayoutInner`, the `<div className="flex flex-col flex-1 min-w-0 overflow-hidden relative">` currently has: Header → offline banner → main. Add GlobalStatusBar after main:
```jsx
        <main className="flex-1 overflow-y-auto bg-bg-primary transition-all duration-300">
          {children}
        </main>
        
        {/* Global Status Bar — pinned to bottom of viewport */}
        <GlobalStatusBar />
```

- [ ] **Step 3: Verify build**
Run: `cd flow-os-frontend && npx vite build --mode development 2>&1 | grep -E "error|Error" | head -10`
Expected: No output.

- [ ] **Step 4: Commit**
```bash
git add flow-os-frontend/src/components/ui/GlobalStatusBar.jsx flow-os-frontend/src/components/layout/LayoutShell.jsx
git commit -m "feat(status-bar): add global status bar showing connector/AI/queue/sync status"
```

---

## Task 4: Notification Center

**Files:**
- Rewrite: `src/components/ui/NotificationDropdown.jsx`

**What changes:**
The current component has 5 hardcoded notifications and 6 hardcoded tabs. Replace with a live notification center that:
1. Fetches real data from `/api/brain/recommendations` (AI insights, actions required)
2. Fetches from `/api/connectors/health` (connector alerts)
3. Has a local WebSocket event log showing recent INCIDENT_CREATED, RISK_DETECTED, APPROVAL_REQUIRED events
4. Deep-links each notification to the right FLOW page
5. Has 4 tabs: All, Action Required, Incidents, AI Insights

**Notification shape:**
```js
{
  id: string,
  type: 'recommendation' | 'approval' | 'incident' | 'connector' | 'ai_insight',
  title: string,
  body: string,
  href: string,       // deep-link route
  time: Date,
  read: boolean,
  priority: 'critical' | 'high' | 'medium' | 'low',
}
```

**Implementation steps:**

- [ ] **Step 1: Rewrite NotificationDropdown.jsx**

```jsx
import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { X, Bell, Zap, AlertTriangle, CheckCircle, Info, Plug, Brain } from "lucide-react";
import { useWebSocket } from "../../hooks/useWebSocket";

const TYPE_META = {
  recommendation: { icon: Brain,         color: "text-flow-purple", bg: "bg-flow-purple/10"  },
  approval:       { icon: CheckCircle,    color: "text-warning",     bg: "bg-warning/10"       },
  incident:       { icon: AlertTriangle,  color: "text-critical",    bg: "bg-critical/10"      },
  connector:      { icon: Plug,           color: "text-info",        bg: "bg-info/10"          },
  ai_insight:     { icon: Zap,           color: "text-success",     bg: "bg-success/10"       },
};

function timeAgo(date) {
  const s = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ago`;
}

const TABS = ['All', 'Action Required', 'Incidents', 'AI Insights'];

const TAB_FILTER = {
  'All':              () => true,
  'Action Required':  n => n.type === 'approval' || n.priority === 'critical',
  'Incidents':        n => n.type === 'incident',
  'AI Insights':      n => n.type === 'recommendation' || n.type === 'ai_insight',
};

export function NotificationDropdown({ isOpen, onClose }) {
  const navigate = useNavigate();
  const { token, workspaceId, events } = useWebSocket();
  const [notifications, setNotifications] = useState([]);
  const [activeTab, setActiveTab] = useState('All');
  const [readIds, setReadIds] = useState(new Set());
  const panelRef = useRef(null);
  const fetchedRef = useRef(false);

  const addNotification = useCallback((n) => {
    setNotifications(prev => {
      if (prev.find(x => x.id === n.id)) return prev;
      return [n, ...prev].slice(0, 50);
    });
  }, []);

  // Convert WebSocket events to notifications
  useEffect(() => {
    if (!events) return;
    const recent = events.slice(-5);
    for (const ev of recent) {
      if (ev.type === 'INCIDENT_CREATED') {
        addNotification({
          id: `ws-incident-${ev.timestamp || Date.now()}`,
          type: 'incident',
          title: 'Incident Detected',
          body: ev.data?.description || ev.data?.text || 'A new incident was detected in your workspace.',
          href: '/timeline',
          time: new Date(ev.timestamp || Date.now()),
          priority: 'critical',
        });
      } else if (ev.type === 'RISK_DETECTED') {
        addNotification({
          id: `ws-risk-${ev.timestamp || Date.now()}`,
          type: 'incident',
          title: 'Risk Signal',
          body: ev.data?.text || 'A risk signal was detected.',
          href: '/timeline',
          time: new Date(ev.timestamp || Date.now()),
          priority: 'high',
        });
      } else if (ev.type === 'INTEL_STORED') {
        addNotification({
          id: `ws-intel-${ev.timestamp || Date.now()}`,
          type: 'ai_insight',
          title: 'Intelligence Captured',
          body: ev.data?.channel ? `New intel from ${ev.data.channel}` : 'FLOW captured new operational intelligence.',
          href: '/workfeed',
          time: new Date(ev.timestamp || Date.now()),
          priority: 'medium',
        });
      }
    }
  }, [events, addNotification]);

  // Fetch recommendations once when opened
  useEffect(() => {
    if (!isOpen || !token || !workspaceId || fetchedRef.current) return;
    fetchedRef.current = true;

    // Fetch recommendations
    fetch('http://localhost:5001/api/brain/recommendations', {
      headers: { Authorization: `Bearer ${token}`, 'workspace-id': workspaceId },
    })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        const items = data?.recommendations || data?.items || [];
        if (Array.isArray(items)) {
          items.slice(0, 5).forEach((rec, i) => {
            addNotification({
              id: `rec-${rec.id || i}`,
              type: 'recommendation',
              title: rec.title || 'AI Recommendation',
              body: rec.summary || rec.description || rec.reasoning || 'FLOW has a new recommendation for you.',
              href: '/workfeed',
              time: new Date(rec.createdAt || Date.now() - i * 60000),
              priority: rec.priority === 'CRITICAL' ? 'critical' : rec.priority === 'HIGH' ? 'high' : 'medium',
            });
          });
        }
      })
      .catch(() => {
        // Demo fallback
        const demos = [
          { id: 'demo-1', type: 'recommendation', title: 'Deploy Review Needed', body: '3 PRs are ready for merge but awaiting final review.', href: '/projects', time: new Date(Date.now() - 5*60000), priority: 'high' },
          { id: 'demo-2', type: 'incident',        title: 'Database Latency Spike', body: 'pgvector queries exceeding 500ms threshold.', href: '/platform/health', time: new Date(Date.now() - 12*60000), priority: 'critical' },
          { id: 'demo-3', type: 'ai_insight',      title: 'Weekly Intelligence Ready', body: 'Your AI briefing for this week is ready.', href: '/briefing', time: new Date(Date.now() - 30*60000), priority: 'medium' },
          { id: 'demo-4', type: 'connector',       title: 'GitHub Sync Complete', body: 'Synced 24 commits and 6 PRs to FLOW intelligence.', href: '/projects', time: new Date(Date.now() - 60*60000), priority: 'low' },
        ];
        demos.forEach(addNotification);
      });

    // Fetch pending approvals
    fetch('http://localhost:5001/api/approvals', {
      headers: { Authorization: `Bearer ${token}`, 'workspace-id': workspaceId },
    })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        const approvals = data?.approvals || data || [];
        if (Array.isArray(approvals)) {
          approvals.slice(0, 3).forEach((a, i) => {
            addNotification({
              id: `approval-${a.id || i}`,
              type: 'approval',
              title: 'Approval Required',
              body: `Action "${a.actionType || 'connector action'}" requires your approval.`,
              href: '/workfeed',
              time: new Date(a.createdAt || Date.now() - i * 5*60000),
              priority: 'high',
            });
          });
        }
      })
      .catch(() => {});
  }, [isOpen, token, workspaceId, addNotification]);

  const markRead = (id) => setReadIds(prev => new Set([...prev, id]));
  const markAllRead = () => setReadIds(new Set(notifications.map(n => n.id)));

  const filtered = notifications.filter(TAB_FILTER[activeTab] || (() => true));
  const unreadCount = notifications.filter(n => !readIds.has(n.id)).length;

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div
        ref={panelRef}
        className="absolute right-0 top-full mt-2 w-96 bg-bg-card border border-border-flow rounded-xl shadow-2xl z-50 overflow-hidden animate-fade-in max-h-[80vh] flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border-flow/60">
          <div className="flex items-center space-x-2">
            <Bell className="w-4 h-4 text-flow-purple" />
            <span className="text-ui-sm font-semibold text-text-primary">Notifications</span>
            {unreadCount > 0 && (
              <span className="text-[10px] font-bold bg-flow-purple text-white px-1.5 py-0.5 rounded-full">
                {unreadCount}
              </span>
            )}
          </div>
          <div className="flex items-center space-x-2">
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                className="text-[10px] text-text-muted hover:text-flow-purple transition-colors cursor-pointer"
              >
                Mark all read
              </button>
            )}
            <button onClick={onClose} className="p-1 rounded hover:bg-bg-hover text-text-muted cursor-pointer">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border-flow/40 px-2">
          {TABS.map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-3 py-2 text-[11px] font-medium border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
                activeTab === tab
                  ? 'border-flow-purple text-flow-purple'
                  : 'border-transparent text-text-muted hover:text-text-secondary'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Notification list */}
        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center px-4">
              <Bell className="w-8 h-8 text-text-muted mb-3 opacity-40" />
              <p className="text-ui-sm font-medium text-text-secondary">All clear</p>
              <p className="text-ui-xs text-text-muted mt-1">No {activeTab.toLowerCase()} to show.</p>
            </div>
          ) : (
            <ul className="divide-y divide-border-flow/30">
              {filtered.map(n => {
                const meta = TYPE_META[n.type] || TYPE_META.ai_insight;
                const Icon = meta.icon;
                const isUnread = !readIds.has(n.id);
                return (
                  <li
                    key={n.id}
                    onClick={() => {
                      markRead(n.id);
                      onClose();
                      navigate(n.href);
                    }}
                    className={`flex items-start space-x-3 px-4 py-3 cursor-pointer hover:bg-bg-hover transition-colors ${isUnread ? 'bg-bg-secondary/30' : ''}`}
                  >
                    <div className={`flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center mt-0.5 ${meta.bg}`}>
                      <Icon className={`w-3.5 h-3.5 ${meta.color}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <p className={`text-ui-sm font-medium truncate ${isUnread ? 'text-text-primary' : 'text-text-secondary'}`}>
                          {n.title}
                        </p>
                        {isUnread && <span className="w-1.5 h-1.5 rounded-full bg-flow-purple flex-shrink-0 ml-2" />}
                      </div>
                      <p className="text-ui-xs text-text-muted mt-0.5 line-clamp-2">{n.body}</p>
                      <p className="text-[10px] text-text-muted mt-1">{timeAgo(n.time)}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2.5 border-t border-border-flow/40 bg-bg-secondary/30">
          <button
            onClick={() => { onClose(); navigate('/timeline'); }}
            className="text-[11px] text-flow-purple hover:text-flow-purple/80 font-medium cursor-pointer transition-colors"
          >
            View full AI Activity Timeline →
          </button>
        </div>
      </div>
    </>
  );
}

export default NotificationDropdown;
```

- [ ] **Step 2: Verify build**
Run: `cd flow-os-frontend && npx vite build --mode development 2>&1 | grep -E "error|Error" | head -10`
Expected: No output.

- [ ] **Step 3: Commit**
```bash
git add flow-os-frontend/src/components/ui/NotificationDropdown.jsx
git commit -m "feat(notifications): live notification center backed by brain/recommendations API"
```

---

## Task 5: Home Dashboard — Morning Brief Integration

**Files:**
- Modify: `src/components/workfeed/DailyWorkfeed.jsx`

**What changes:**
Add a "Morning Brief" section at the very top of the workfeed page, above the RecommendationEngine. The brief:
1. Fetches from `/api/brain/briefing?role=EXECUTIVE` (fallback: heuristic text)
2. Shows a 2–3 sentence AI-generated summary of what matters today
3. Has a "Read Full Briefing" link to `/briefing`
4. If fetch fails or is loading: shows a skeleton (2 lines, animated)
5. Shows the current date and greeting (already in WorkfeedHeader, so just the brief text block)

This does NOT replace the existing structure — it inserts a compact brief banner between the greeting header and the RecommendationEngine.

**Also fix in this task:** Remove the `dev_mode` gate on `QuickActionGrid`. Replace the 6 `alert()` calls with real navigation:
- "Compose" → navigate('/inbox') and optionally trigger ⌘E
- "Ask FLOW" → open CommandPalette (dispatch a custom event `flow:open-search`)
- "Task" → navigate('/projects')
- "Upload" → navigate('/platform/import')
- "Meeting" → navigate('/meetings')
- "Note" → dispatch event `flow:open-note`

Also fix: The WorkfeedHeader section currently hardcodes "Kishore Varma". Change it to read from localStorage.

**Implementation: Morning Brief Banner**

Find where `DailyWorkfeed.jsx` renders the greeting header and RecommendationEngine. Insert a `<MorningBriefBanner>` component (defined in the same file) between them.

```jsx
// Inside DailyWorkfeed.jsx — add this component at the top of the file after imports

function MorningBriefBanner({ token, workspaceId }) {
  const navigate = useNavigate();
  const [brief, setBrief] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token || !workspaceId) { setLoading(false); return; }
    fetch('http://localhost:5001/api/brain/briefing?role=EXECUTIVE', {
      headers: { Authorization: `Bearer ${token}`, 'workspace-id': workspaceId },
    })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        const text = data?.brief || data?.summary || data?.content || data?.text;
        if (text) setBrief(typeof text === 'string' ? text.slice(0, 300) : null);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [token, workspaceId]);

  if (!loading && !brief) return null;

  return (
    <div className="mb-6 px-5 py-4 rounded-xl bg-flow-purple/5 border border-flow-purple/15 flex items-start justify-between gap-4">
      <div className="flex-1 min-w-0">
        <p className="text-[10px] font-bold text-flow-purple uppercase tracking-wider mb-1.5">AI Morning Brief</p>
        {loading ? (
          <div className="space-y-2">
            <div className="h-3.5 bg-bg-hover rounded animate-pulse w-full" />
            <div className="h-3.5 bg-bg-hover rounded animate-pulse w-3/4" />
          </div>
        ) : (
          <p className="text-ui-sm text-text-secondary leading-relaxed">{brief}</p>
        )}
      </div>
      {!loading && (
        <button
          onClick={() => navigate('/briefing')}
          className="flex-shrink-0 text-[11px] font-semibold text-flow-purple hover:text-flow-purple/80 transition-colors cursor-pointer whitespace-nowrap"
        >
          Full Briefing →
        </button>
      )}
    </div>
  );
}
```

**QuickActionGrid fix:**

Rewrite `src/components/workfeed/QuickActionGrid.jsx`:
```jsx
import { useNavigate } from "react-router-dom";
import { Pencil, Search, CheckSquare, Upload, Calendar, FileText } from "lucide-react";

const ACTIONS = [
  { label: "Compose",  icon: Pencil,      event: "flow:open-compose" },
  { label: "Ask FLOW", icon: Search,      event: "flow:open-search"  },
  { label: "Task",     icon: CheckSquare, route: "/projects"         },
  { label: "Upload",   icon: Upload,      route: "/platform/import"  },
  { label: "Meeting",  icon: Calendar,    route: "/meetings"         },
  { label: "Note",     icon: FileText,    event: "flow:open-note"    },
];

export function QuickActionGrid() {
  const navigate = useNavigate();

  const handleAction = (action) => {
    if (action.route) {
      navigate(action.route);
    } else if (action.event) {
      window.dispatchEvent(new CustomEvent(action.event));
    }
  };

  return (
    <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
      {ACTIONS.map(({ label, icon: Icon, ...action }) => (
        <button
          key={label}
          onClick={() => handleAction({ label, icon: Icon, ...action })}
          className="flex flex-col items-center justify-center gap-1.5 py-3 px-2 rounded-xl bg-bg-secondary border border-border-flow hover:border-flow-purple/30 hover:bg-bg-hover transition-apple cursor-pointer group"
        >
          <div className="w-7 h-7 rounded-lg bg-bg-hover group-hover:bg-flow-purple/10 flex items-center justify-center transition-colors">
            <Icon className="w-3.5 h-3.5 text-text-muted group-hover:text-flow-purple transition-colors" />
          </div>
          <span className="text-[10px] font-medium text-text-muted group-hover:text-text-secondary transition-colors">
            {label}
          </span>
        </button>
      ))}
    </div>
  );
}

export default QuickActionGrid;
```

Wire the custom events in LayoutShell.jsx — add listeners for `flow:open-compose`, `flow:open-search`, `flow:open-note` beside the existing keyboard binding useEffect:
```jsx
// Add inside the existing useEffect for keyboard bindings (merge into same listener block)
window.addEventListener('flow:open-search', () => setIsSearchOpen(true));
window.addEventListener('flow:open-compose', () => setIsComposeOpen(true));
window.addEventListener('flow:open-note', () => setIsNoteOpen(true));
// (return cleanup removes these too)
```

**Implementation steps:**

- [ ] **Step 1: Rewrite QuickActionGrid.jsx** (as above)
- [ ] **Step 2: Add event listeners to LayoutShell.jsx** (in the existing keyboard useEffect)
- [ ] **Step 3: Add MorningBriefBanner to DailyWorkfeed.jsx** 
  - Add the component definition near the top of the file
  - Insert `<MorningBriefBanner token={token} workspaceId={workspaceId} />` after the greeting header section and before the RecommendationEngine
  - Add `import { useNavigate } from "react-router-dom"` if not already imported
  - Fix hardcoded "Kishore Varma" in WorkfeedHeader — read from localStorage
- [ ] **Step 4: Verify build**
Run: `cd flow-os-frontend && npx vite build --mode development 2>&1 | grep -E "error|Error" | head -10`
- [ ] **Step 5: Commit**
```bash
git add flow-os-frontend/src/components/workfeed/QuickActionGrid.jsx \
        flow-os-frontend/src/components/layout/LayoutShell.jsx \
        flow-os-frontend/src/components/workfeed/DailyWorkfeed.jsx
git commit -m "feat(home): morning brief banner, fix QuickActionGrid navigation, remove alert() stubs"
```

---

## Task 6: Design System — Fix Tokens, Theme, Dead Files

**Files:**
- Modify: `src/styles/tokens.css` — add missing animation mappings
- Modify: `src/styles/colors.css` — add light theme CSS variable overrides
- Delete: `src/components/ui/button.tsx` — dead TypeScript duplicate
- Modify: `src/components/workfeed/EmptyState.jsx` — use design-system tokens
- Modify: `src/components/workfeed/ErrorState.jsx` — use design-system tokens

**Implementation steps:**

- [ ] **Step 1: Fix tokens.css — add missing animations**

In `src/styles/tokens.css`, inside the `@theme` block, add after the existing animation mappings:
```css
  --animate-slide-right: slide-right 0.3s ease-out;
  --animate-glow-pulse: glow-pulse 2s ease-in-out infinite;
  --animate-shimmer: shimmer 1.5s ease-in-out infinite;
  --animate-float: float 3s ease-in-out infinite;
```

- [ ] **Step 2: Add light theme variables to colors.css**

Append at end of `src/styles/colors.css`:
```css
/* Light theme overrides — applied when <html class="light"> or no "dark" class */
:root.light {
  --color-bg-primary:    #f8fafc;
  --color-bg-secondary:  #f1f5f9;
  --color-bg-card:       #ffffff;
  --color-bg-hover:      #e2e8f0;
  --color-border-flow:   rgba(0, 0, 0, 0.08);
  --color-text-primary:  #0f172a;
  --color-text-secondary:#475569;
  --color-text-muted:    #94a3b8;
  --color-flow-purple:   #7c3aed;
}
```

- [ ] **Step 3: Delete dead button.tsx**
```bash
rm flow-os-frontend/src/components/ui/button.tsx
```
Verify nothing imports it:
```bash
grep -r "button.tsx\|from.*ui/button" flow-os-frontend/src --include="*.jsx" --include="*.tsx" --include="*.js"
```
Expected: no results (or only results pointing to `Button.jsx` with capital B, which is the correct one).

- [ ] **Step 4: Rewrite workfeed/EmptyState.jsx to use design tokens**
```jsx
import { Inbox } from "lucide-react";

export function EmptyState({ title = "Nothing here yet", description = "Check back after FLOW processes more intelligence.", icon: Icon = Inbox }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center px-4">
      <div className="w-12 h-12 rounded-2xl bg-bg-secondary border border-border-flow flex items-center justify-center mb-4">
        <Icon className="w-5 h-5 text-text-muted" />
      </div>
      <p className="text-ui-sm font-semibold text-text-secondary">{title}</p>
      {description && <p className="text-ui-xs text-text-muted mt-1.5 max-w-xs">{description}</p>}
    </div>
  );
}

export default EmptyState;
```

- [ ] **Step 5: Rewrite workfeed/ErrorState.jsx to use design tokens**
```jsx
import { AlertCircle, RefreshCw } from "lucide-react";

export function ErrorState({ message = "Something went wrong", onRetry }) {
  return (
    <div className="flex flex-col items-center justify-center py-10 text-center px-4">
      <div className="w-10 h-10 rounded-xl bg-critical/10 border border-critical/20 flex items-center justify-center mb-3">
        <AlertCircle className="w-5 h-5 text-critical" />
      </div>
      <p className="text-ui-sm font-semibold text-text-secondary">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-3 flex items-center space-x-1.5 text-ui-xs text-flow-purple hover:text-flow-purple/80 font-medium cursor-pointer transition-colors"
        >
          <RefreshCw className="w-3 h-3" />
          <span>Try again</span>
        </button>
      )}
    </div>
  );
}

export default ErrorState;
```

- [ ] **Step 6: Verify build**
Run: `cd flow-os-frontend && npx vite build --mode development 2>&1 | grep -E "error|Error" | head -10`
Expected: No output.

- [ ] **Step 7: Commit**
```bash
git add flow-os-frontend/src/styles/tokens.css \
        flow-os-frontend/src/styles/colors.css \
        flow-os-frontend/src/components/workfeed/EmptyState.jsx \
        flow-os-frontend/src/components/workfeed/ErrorState.jsx
git rm flow-os-frontend/src/components/ui/button.tsx
git commit -m "fix(design-system): add missing animation tokens, light theme vars, remove dead button.tsx, fix workfeed empty/error states"
```

---

## Task 7: Enterprise Polish Pass

**Files:**
- Modify: `src/components/ui/EmptyState.jsx` (canonical) — add variant prop
- Modify: `src/components/workspace/ReminderCard.jsx` — remove hardcoded items, add real API call
- Modify: `src/App.jsx` — ensure `/activity` route shows ActivityFeed (stub), not ComingSoon
- Create: `src/components/ui/Tabs.jsx` — shared tab primitive used in many places

**What changes:**

**1. Canonical EmptyState variant prop:**
The `ui/EmptyState.jsx` only shows a checkmark. Add `variant` prop so pages can show domain-specific empty states:
```jsx
// variants: 'default' | 'search' | 'inbox' | 'meetings' | 'projects' | 'knowledge'
// Each variant has a different icon and message
```

**2. Shared Tabs primitive:**
Many components (NotificationDropdown, CommandPalette, AIInbox, MeetingDashboard) each implement their own tab bar. Create a reusable:
```jsx
// src/components/ui/Tabs.jsx
export function Tabs({ tabs, activeTab, onTabChange, className = "" }) { ... }
```

**3. ReminderCard fix:**
Currently `ReminderCard.jsx` has 3 hardcoded reminder items. Make it fetch from `/api/brain/goals` and show real milestone deadlines. Keep hardcoded fallback.

**4. Activity route:**
`/activity` shows `ComingSoon`. Replace with a redirect to `/timeline` so it's not a dead end.

**Implementation steps:**

- [ ] **Step 1: Create shared Tabs primitive**

Create `src/components/ui/Tabs.jsx`:
```jsx
export function Tabs({ tabs, activeTab, onTabChange, className = "" }) {
  return (
    <div className={`flex border-b border-border-flow/40 ${className}`}>
      {tabs.map(tab => {
        const label = typeof tab === 'string' ? tab : tab.label;
        const count = typeof tab === 'object' ? tab.count : undefined;
        return (
          <button
            key={label}
            onClick={() => onTabChange(label)}
            className={`px-4 py-2.5 text-ui-sm font-medium border-b-2 transition-colors cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
              activeTab === label
                ? 'border-flow-purple text-flow-purple'
                : 'border-transparent text-text-muted hover:text-text-secondary'
            }`}
          >
            {label}
            {count !== undefined && count > 0 && (
              <span className="text-[10px] bg-flow-purple/10 text-flow-purple px-1.5 py-0.5 rounded-full font-semibold">
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export default Tabs;
```

- [ ] **Step 2: Enhance ui/EmptyState.jsx with variant support**

Rewrite `src/components/ui/EmptyState.jsx`:
```jsx
import { CheckCircle, Search, Inbox, Calendar, Briefcase, BookOpen, Activity, Bell } from "lucide-react";

const VARIANTS = {
  default:    { icon: CheckCircle, title: "All clear",          desc: "Nothing needs your attention right now." },
  search:     { icon: Search,      title: "No results found",   desc: "Try adjusting your search terms or filters." },
  inbox:      { icon: Inbox,       title: "Inbox is empty",     desc: "No messages require your attention." },
  meetings:   { icon: Calendar,    title: "No meetings",        desc: "Your calendar is clear for this period." },
  projects:   { icon: Briefcase,   title: "No projects",        desc: "Connect GitHub to see your projects here." },
  knowledge:  { icon: BookOpen,    title: "No documents",       desc: "Connect Notion or Drive to explore your knowledge base." },
  activity:   { icon: Activity,    title: "No activity yet",    desc: "Activity will appear here as FLOW processes intelligence." },
  notifications: { icon: Bell,     title: "No notifications",   desc: "You're all caught up." },
};

export function EmptyState({ variant = "default", message, description, icon: CustomIcon, action }) {
  const v = VARIANTS[variant] || VARIANTS.default;
  const Icon = CustomIcon || v.icon;
  const title = message || v.title;
  const desc = description || v.desc;

  return (
    <div className="flex flex-col items-center justify-center py-12 text-center px-6">
      <div className="w-12 h-12 rounded-2xl bg-bg-secondary border border-border-flow flex items-center justify-center mb-4">
        <Icon className="w-5 h-5 text-text-muted" />
      </div>
      <p className="text-ui-sm font-semibold text-text-secondary">{title}</p>
      <p className="text-ui-xs text-text-muted mt-1.5 max-w-xs leading-relaxed">{desc}</p>
      {action && (
        <button
          onClick={action.onClick}
          className="mt-4 px-4 py-2 text-ui-sm font-semibold text-flow-purple hover:text-white hover:bg-flow-purple rounded-lg border border-flow-purple/30 hover:border-flow-purple transition-apple cursor-pointer"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}

export default EmptyState;
```

- [ ] **Step 3: Fix /activity route in App.jsx**

In `src/App.jsx`, find:
```jsx
{ path: "/activity", element: <ComingSoon /> }
```
Replace with:
```jsx
{ path: "/activity", element: <Navigate to="/timeline" replace /> }
```
(Make sure `Navigate` is already imported from `react-router-dom` — it is used for the `/` redirect.)

- [ ] **Step 4: Update ReminderCard.jsx to fetch real goals**

Read the current file first, then replace the hardcoded items with an API call to `/api/brain/goals` with demo fallback.

```jsx
import { useState, useEffect } from "react";
import { Clock } from "lucide-react";
import { useWebSocket } from "../../hooks/useWebSocket";
import Card from "../ui/Card";

const DEMO_REMINDERS = [
  { id: 1, text: "Review Q3 OKRs", due: "Today" },
  { id: 2, text: "Approve pending PRs", due: "Today" },
  { id: 3, text: "Weekly team retrospective", due: "Tomorrow" },
];

export function ReminderCard() {
  const { token, workspaceId } = useWebSocket();
  const [reminders, setReminders] = useState(DEMO_REMINDERS);

  useEffect(() => {
    if (!token || !workspaceId) return;
    fetch('http://localhost:5001/api/brain/goals', {
      headers: { Authorization: `Bearer ${token}`, 'workspace-id': workspaceId },
    })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        const goals = data?.goals || data?.milestones || [];
        if (Array.isArray(goals) && goals.length > 0) {
          setReminders(goals.slice(0, 4).map((g, i) => ({
            id: g.id || i,
            text: g.title || g.name || 'Goal',
            due: g.targetDate ? new Date(g.targetDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'Soon',
          })));
        }
      })
      .catch(() => {});
  }, [token, workspaceId]);

  return (
    <Card className="p-4">
      <Card.Header className="mb-3">
        <Card.Title className="text-ui-sm font-semibold text-text-primary flex items-center space-x-2">
          <Clock className="w-3.5 h-3.5 text-flow-purple" />
          <span>Reminders</span>
        </Card.Title>
      </Card.Header>
      <ul className="space-y-2.5">
        {reminders.map(r => (
          <li key={r.id} className="flex items-center justify-between">
            <span className="text-ui-xs text-text-secondary truncate">{r.text}</span>
            <span className="text-[10px] text-text-muted ml-2 flex-shrink-0">{r.due}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export default ReminderCard;
```

- [ ] **Step 5: Verify build**
Run: `cd flow-os-frontend && npx vite build --mode development 2>&1 | grep -E "error|Error" | head -10`
Expected: No output.

- [ ] **Step 6: Commit**
```bash
git add flow-os-frontend/src/components/ui/Tabs.jsx \
        flow-os-frontend/src/components/ui/EmptyState.jsx \
        flow-os-frontend/src/components/workspace/ReminderCard.jsx \
        flow-os-frontend/src/App.jsx
git commit -m "feat(polish): shared Tabs primitive, EmptyState variants, live ReminderCard, fix /activity route"
```

---

## Task 8: Loading & Skeleton System

**Files:**
- Modify: `src/components/ui/Skeleton.jsx` — add compound components for common patterns
- Modify: `src/App.jsx` — improve the Suspense fallback from full-screen spinner to skeleton layout
- Create: `src/components/ui/PageSkeleton.jsx` — reusable page-level skeleton frame

**What changes:**

The current Suspense fallback in `App.jsx` shows a full-screen spinner while lazy chunks load. Replace with a skeleton that matches the page shell (sidebar + header shape), so the layout doesn't jump.

**Implementation steps:**

- [ ] **Step 1: Extend Skeleton.jsx**

Rewrite `src/components/ui/Skeleton.jsx`:
```jsx
export function Skeleton({ className = "", width, height }) {
  const style = {};
  if (width) style.width = width;
  if (height) style.height = height;
  return (
    <div
      className={`bg-bg-hover rounded animate-pulse ${className}`}
      style={style}
    />
  );
}

// Compound skeletons
Skeleton.Text = function SkeletonText({ lines = 3, className = "" }) {
  return (
    <div className={`space-y-2 ${className}`}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className={`h-3 rounded ${i === lines - 1 ? 'w-2/3' : 'w-full'}`} />
      ))}
    </div>
  );
};

Skeleton.Card = function SkeletonCard({ className = "" }) {
  return (
    <div className={`bg-bg-card border border-border-flow rounded-xl p-4 space-y-3 ${className}`}>
      <div className="flex items-center space-x-3">
        <Skeleton className="w-8 h-8 rounded-lg flex-shrink-0" />
        <div className="flex-1 space-y-1.5">
          <Skeleton className="h-3 w-1/2" />
          <Skeleton className="h-2.5 w-1/3" />
        </div>
      </div>
      <Skeleton.Text lines={2} />
    </div>
  );
};

Skeleton.Header = function SkeletonHeader() {
  return (
    <div className="h-16 border-b border-border-flow/80 px-6 flex items-center justify-between bg-bg-primary/60">
      <Skeleton className="h-4 w-32" />
      <Skeleton className="h-8 w-48 rounded-lg" />
      <div className="flex items-center space-x-3">
        <Skeleton className="h-6 w-24 rounded-full" />
        <Skeleton className="h-8 w-8 rounded-full" />
      </div>
    </div>
  );
};

export default Skeleton;
```

- [ ] **Step 2: Create PageSkeleton.jsx**

Create `src/components/ui/PageSkeleton.jsx`:
```jsx
import Skeleton from "./Skeleton";

export function PageSkeleton() {
  return (
    <div className="flex-1 overflow-hidden">
      {/* Page content skeleton */}
      <div className="p-6 space-y-6 max-w-7xl mx-auto">
        {/* Hero bar */}
        <div className="space-y-2">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-80" />
        </div>
        {/* Card grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Skeleton.Card />
          <Skeleton.Card />
          <Skeleton.Card />
        </div>
        {/* Content block */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          <div className="lg:col-span-3 space-y-4">
            <Skeleton.Card />
            <Skeleton.Card />
          </div>
          <div className="lg:col-span-2 space-y-4">
            <Skeleton.Card />
            <Skeleton.Card />
          </div>
        </div>
      </div>
    </div>
  );
}

export default PageSkeleton;
```

- [ ] **Step 3: Update Suspense fallback in App.jsx**

In `src/App.jsx`, find the `<Suspense>` wrapper. Change its fallback from a full-screen spinner to the PageSkeleton:

Before:
```jsx
<Suspense fallback={<div className="flex items-center justify-center h-screen ..."><LoadingSpinner size="lg" /></div>}>
```

After:
```jsx
import PageSkeleton from "./components/ui/PageSkeleton";
// ...
<Suspense fallback={<PageSkeleton />}>
```

- [ ] **Step 4: Verify build**
Run: `cd flow-os-frontend && npx vite build --mode development 2>&1 | grep -E "error|Error" | head -10`

- [ ] **Step 5: Commit**
```bash
git add flow-os-frontend/src/components/ui/Skeleton.jsx \
        flow-os-frontend/src/components/ui/PageSkeleton.jsx \
        flow-os-frontend/src/App.jsx
git commit -m "feat(loading): compound Skeleton components, PageSkeleton, replace Suspense spinner"
```

---

## Post-Build: Final Vite Production Build Verification

After all 8 tasks are committed, run a production build and confirm zero errors:

```bash
cd flow-os-frontend
npm run build 2>&1 | tail -20
```

Expected: `✓ built in X.XXs` with no error lines. Warnings about chunk size are acceptable.

---
