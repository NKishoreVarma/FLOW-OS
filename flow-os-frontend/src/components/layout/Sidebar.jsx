import { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Home, Inbox, Calendar, BookOpen,
  BrainCircuit, BarChart2, Users, Building2, Crown,
  Plug, Activity, TrendingUp, ChevronDown, ChevronRight,
  Shield, FileText, Heart, CreditCard, UserPlus, Settings,
  Search, LayoutDashboard, Code2, HeadphonesIcon, Zap, Play, Cpu,
} from "lucide-react";
import { useWebSocket } from "../../hooks/useWebSocket";
import { useWorkspaceState } from "../../hooks/useWorkspaceState";

// ─── Navigation architecture (spec: BP-11, §Navigation Architecture) ──────────
const PRIMARY = [
  { label: "Home",        path: "/",         icon: Home,     exact: true },
  { label: "Inbox",       path: "/inbox",    icon: Inbox,    badge: "approvals" },
  { label: "Meetings",    path: "/meetings", icon: Calendar },
  { label: "Knowledge",   path: "/knowledge",icon: BookOpen },
];

const INTELLIGENCE = [
  { label: "Executive",         path: "/dashboard", icon: LayoutDashboard },
  { label: "Engineering",       path: "/engineering", icon: Code2 },
  { label: "Support",           path: "/support",   icon: HeadphonesIcon },
  { label: "Chief of Staff",    path: "/chief",     icon: BrainCircuit },
  { label: "Customers",         path: "/customers", icon: Building2 },
  { label: "People",            path: "/people",    icon: Users },
];

// Top-level platform items + expandable Settings sub-group.
// (Executive Council, Weekly Review, Launch Portal, Sales Demo, Value routes still
// exist and are reachable by URL — removed from the nav to reduce clutter.)
const PLATFORM_TOP = [
  { label: "Integrations", path: "/integrations", icon: Plug },
  { label: "Activity",     path: "/activity",     icon: Activity },
];

const SETTINGS_ITEMS = [
  { label: "IAM",               path: "/settings/iam",         icon: Shield },
  { label: "Governance",        path: "/settings/governance",  icon: Shield },
  { label: "Audit",             path: "/settings/audit",       icon: FileText },
  { label: "Security",          path: "/settings/security",    icon: Shield },
  { label: "Health",            path: "/settings/health",      icon: Heart },
  { label: "Billing",           path: "/settings/billing",     icon: CreditCard },
  { label: "Team",              path: "/settings/team",        icon: UserPlus },
  { label: "AI Orchestrator",   path: "/settings/ai",          icon: Cpu },
  { label: "Release Notes",     path: "/settings/releases",       icon: FileText },
  { label: "Pilot Readiness",   path: "/settings/readiness",      icon: Shield },
  { label: "Connectors",        path: "/settings/certification",   icon: Shield },
];

const SETTINGS_PATHS = new Set(SETTINGS_ITEMS.map((i) => i.path).concat(["/settings", "/settings/ai", "/settings/releases", "/settings/readiness", "/settings/certification"]));

// ─── NavItem ──────────────────────────────────────────────────────────────────
function NavItem({ item, currentPath, onNavigate, badge = 0, indent = false }) {
  const [hovered, setHovered] = useState(false);
  const Icon = item.icon;
  const isActive = item.path
    ? item.exact ? currentPath === item.path : currentPath.startsWith(item.path)
    : false;

  return (
    <li>
      <button
        onClick={() => onNavigate(item)}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        aria-current={isActive ? "page" : undefined}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 9,
          width: "100%",
          padding: indent ? "6px 16px 6px 28px" : "7px 16px",
          fontFamily: "var(--font-ui)",
          fontSize: indent ? 12 : 13,
          fontWeight: isActive ? 400 : 300,
          color: isActive ? "var(--t1)" : hovered ? "var(--t2)" : "var(--t3)",
          background: isActive ? "var(--accent-dim)" : hovered ? "rgba(31,27,22,0.04)" : "transparent",
          border: "none",
          borderLeft: `2px solid ${isActive ? "var(--accent)" : "transparent"}`,
          cursor: "pointer",
          textAlign: "left",
          transition: "color 80ms, background 80ms",
        }}
      >
        <Icon style={{ width: indent ? 12 : 14, height: indent ? 12 : 14, flexShrink: 0, opacity: isActive ? 1 : 0.65 }} strokeWidth={1.5} />
        <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.label}</span>
        {badge > 0 && (
          <span style={{
            minWidth: 16, height: 16, borderRadius: 8,
            background: "var(--accent)", color: "#fff",
            fontSize: 9, fontWeight: 600, lineHeight: "16px",
            textAlign: "center", padding: "0 4px", flexShrink: 0,
          }}>{badge > 99 ? "99+" : badge}</span>
        )}
      </button>
    </li>
  );
}

// ─── ExpandableGroup — Settings sub-group ────────────────────────────────────
function SettingsGroup({ currentPath, onNavigate }) {
  const isAnyActive = SETTINGS_PATHS.has(currentPath) || currentPath.startsWith("/settings");
  const [open, setOpen] = useState(isAnyActive);
  const [hovered, setHovered] = useState(false);

  useEffect(() => { if (isAnyActive) setOpen(true); }, [isAnyActive]);

  return (
    <li>
      <button
        onClick={() => setOpen((p) => !p)}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          display: "flex", alignItems: "center", gap: 9, width: "100%",
          padding: "7px 16px", fontFamily: "var(--font-ui)", fontSize: 13,
          fontWeight: 300, color: hovered ? "var(--t2)" : "var(--t3)",
          background: hovered ? "rgba(31,27,22,0.04)" : "transparent",
          border: "none", borderLeft: "2px solid transparent",
          cursor: "pointer", textAlign: "left", transition: "color 80ms, background 80ms",
        }}
      >
        <Settings style={{ width: 14, height: 14, flexShrink: 0, opacity: 0.65 }} strokeWidth={1.5} />
        <span style={{ flex: 1 }}>Settings</span>
        {open
          ? <ChevronDown style={{ width: 11, height: 11, color: "var(--t4)" }} />
          : <ChevronRight style={{ width: 11, height: 11, color: "var(--t4)" }} />
        }
      </button>
      {open && (
        <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {SETTINGS_ITEMS.map((item) => (
            <NavItem key={item.path} item={item} currentPath={currentPath} onNavigate={onNavigate} indent />
          ))}
        </ul>
      )}
    </li>
  );
}

// ─── NavGroup label ───────────────────────────────────────────────────────────
function GroupLabel({ label }) {
  return (
    <div style={{
      fontFamily: "var(--font-data)",
      fontSize: 10, fontWeight: 300, color: "var(--t4)",
      textTransform: "uppercase", letterSpacing: "0.08em",
      padding: "14px 16px 5px",
    }}>
      {label}
    </div>
  );
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────
export const Sidebar = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { workspaceId } = useWebSocket();
  const wsState = useWorkspaceState();
  const isReady = wsState.workspacePhase === 'READY';
  const [hidden, setHidden] = useState(false);
  const [trayHover, setTrayHover] = useState(false);
  const [pendingApprovals, setPendingApprovals] = useState(0);

  useEffect(() => {
    const toggle = () => setHidden((h) => !h);
    window.addEventListener("flow:toggle-sidebar", toggle);
    return () => window.removeEventListener("flow:toggle-sidebar", toggle);
  }, []);

  // Poll pending approvals for Inbox badge
  useEffect(() => {
    const token = localStorage.getItem("flow_os_token") || "";
    const wsId = workspaceId || localStorage.getItem("flow_os_workspace_id") || "";
    if (!token || !wsId) return;
    const load = () => {
      fetch("/api/approvals?workspaceId=" + wsId, {
        headers: { Authorization: `Bearer ${token}`, "workspace-id": wsId },
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => { if (d) setPendingApprovals((d.approvals || d.items || []).length); })
        .catch(() => {});
    };
    load();
    const id = setInterval(load, 60_000);
    return () => clearInterval(id);
  }, [workspaceId]);

  const displayWorkspace = (workspaceId || "")
    .replace("workspace_", "").replace(/_/g, "-").toLowerCase() || "none";

  const displayName =
    localStorage.getItem("flow_user_name") ||
    (localStorage.getItem("flow_user_email") || "").split("@")[0] ||
    "FLOW User";

  const initials = displayName
    .split(/[\s._-]+/).filter(Boolean).slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase()).join("") || "FU";

  const currentPath = location.pathname;

  function handleNavigate(item) {
    if (item.path) navigate(item.path);
  }

  function openCommandPalette() {
    window.dispatchEvent(new CustomEvent("flow:open-search"));
  }

  if (hidden) return null;

  return (
    <aside
      role="navigation"
      aria-label="Main navigation"
      style={{
        width: 220, height: "100vh",
        background: "var(--surface-1)",
        borderRight: "1px solid var(--line-0)",
        display: "flex", flexDirection: "column",
        flexShrink: 0, fontFamily: "var(--font-ui)",
        userSelect: "none", zIndex: 30,
      }}
    >
      {/* Logo + workspace chip */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "14px 16px", borderBottom: "1px solid var(--line-0)", flexShrink: 0,
      }}>
        <button
          onClick={() => navigate("/")}
          aria-label="FLOW OS home"
          style={{ display: "flex", alignItems: "center", gap: 10, background: "none", border: "none", padding: 0, cursor: "pointer" }}
        >
          <div style={{
            width: 24, height: 24, background: "var(--accent)", borderRadius: 0,
            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
          }}>
            <span style={{ fontFamily: "var(--font-display)", fontSize: 15, fontWeight: 500, color: "#FFFFFF", lineHeight: 1 }}>F</span>
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
            <span style={{ fontFamily: "var(--font-display)", fontSize: 16, fontWeight: 500, color: "var(--t1)", letterSpacing: "0.05em" }}>FLOW</span>
            <span style={{ fontFamily: "var(--font-data)", fontSize: 10, fontWeight: 300, color: "var(--t3)", letterSpacing: "0.06em" }}>OS</span>
          </div>
        </button>
        <span style={{
          fontFamily: "var(--font-data)", fontSize: 9, fontWeight: 300, color: "var(--t3)",
          border: "1px solid var(--line-1)", padding: "2px 6px", borderRadius: 3,
          maxWidth: 74, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {displayWorkspace}
        </span>
      </div>

      {/* Navigation */}
      <nav style={{ flex: 1, overflowY: "auto", paddingBottom: 8 }}>
        {isReady ? (
          <>
            {/* PRIMARY */}
            <GroupLabel label="Primary" />
            <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {PRIMARY.map((item) => (
                <NavItem
                  key={item.path}
                  item={item}
                  currentPath={currentPath}
                  onNavigate={handleNavigate}
                  badge={item.badge === "approvals" ? pendingApprovals : 0}
                />
              ))}
            </ul>

            {/* INTELLIGENCE */}
            <GroupLabel label="Intelligence" />
            <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {INTELLIGENCE.map((item) => (
                <NavItem
                  key={item.path}
                  item={item}
                  currentPath={currentPath}
                  onNavigate={handleNavigate}
                />
              ))}
            </ul>

            {/* PLATFORM */}
            <GroupLabel label="Platform" />
            <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {PLATFORM_TOP.map((item) => (
                <NavItem
                  key={item.path}
                  item={item}
                  currentPath={currentPath}
                  onNavigate={handleNavigate}
                />
              ))}
              <SettingsGroup currentPath={currentPath} onNavigate={handleNavigate} />
            </ul>
          </>
        ) : (
          <>
            {/* SETUP — minimal nav before workspace is ready */}
            <GroupLabel label="Setup" />
            <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
              <NavItem item={{ label: "Workspace Setup", path: "/setup", icon: Zap, exact: true }} currentPath={currentPath} onNavigate={handleNavigate} />
              <NavItem item={{ label: "Integrations", path: "/integrations", icon: Plug }} currentPath={currentPath} onNavigate={handleNavigate} />
              <NavItem item={{ label: "Help", path: "/help", icon: HeadphonesIcon }} currentPath={currentPath} onNavigate={handleNavigate} />
            </ul>

            {/* Readiness meter */}
            {!wsState.loading && (
              <div style={{ padding: "16px 16px 8px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                  <span style={{ fontFamily: "var(--font-data)", fontSize: 10, color: "var(--t4)" }}>
                    {wsState.connectedCount}/{wsState.minConnectorsRequired || 3} integrations
                  </span>
                  <span style={{ fontFamily: "var(--font-data)", fontSize: 10, color: "var(--accent)", fontWeight: 500 }}>
                    {wsState.readinessPercent || 0}%
                  </span>
                </div>
                <div style={{ height: 3, background: "var(--line-1)", borderRadius: 2 }}>
                  <div style={{
                    height: "100%", borderRadius: 2,
                    background: "var(--accent)",
                    width: `${wsState.readinessPercent || 0}%`,
                    transition: "width 600ms ease",
                  }} />
                </div>
              </div>
            )}
          </>
        )}
      </nav>

      {/* ⌘K hint */}
      <button
        onClick={openCommandPalette}
        title="Open command palette (⌘K)"
        style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "8px 16px",
          background: "transparent", border: "none",
          borderTop: "1px solid var(--line-0)",
          cursor: "pointer",
          transition: "background 80ms",
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(31,27,22,0.04)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
      >
        <Search style={{ width: 12, height: 12, color: "var(--t4)", flexShrink: 0 }} strokeWidth={1.5} />
        <span style={{ flex: 1, fontSize: 12, color: "var(--t4)", fontFamily: "var(--font-ui)", fontWeight: 300 }}>Search or ask FLOW</span>
        <kbd style={{ fontSize: 9, color: "var(--t5)", background: "rgba(31,27,22,0.05)", border: "1px solid var(--line-1)", borderRadius: 3, padding: "1px 4px", fontFamily: "var(--font-data)" }}>⌘K</kbd>
      </button>

      {/* User tray */}
      <button
        onClick={() => navigate("/settings/iam")}
        onMouseEnter={() => setTrayHover(true)}
        onMouseLeave={() => setTrayHover(false)}
        title="Account settings"
        style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: "12px 16px",
          background: trayHover ? "rgba(31,27,22,0.04)" : "transparent",
          border: "none",
          borderTop: "1px solid var(--line-0)",
          cursor: "pointer", textAlign: "left", flexShrink: 0,
          transition: "background 80ms",
        }}
      >
        <div style={{
          width: 24, height: 24,
          background: "var(--surface-3)", border: "1px solid var(--line-1)",
          borderRadius: 3, display: "flex", alignItems: "center", justifyContent: "center",
          flexShrink: 0, fontFamily: "var(--font-data)", fontSize: 9, fontWeight: 400, color: "var(--t2)",
        }}>
          {initials}
        </div>
        <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
          <span style={{ fontSize: 12, fontWeight: 400, color: "var(--t1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {displayName}
          </span>
          <span style={{ fontFamily: "var(--font-data)", fontSize: 9, fontWeight: 300, color: "var(--t3)", letterSpacing: "0.04em" }}>
            Admin · PRO
          </span>
        </div>
      </button>
    </aside>
  );
};

export default Sidebar;
