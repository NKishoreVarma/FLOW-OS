import { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Home, Search, Newspaper, Clock,
  GitMerge, Calendar, Inbox, BookOpen,
  Building, Users,
} from "lucide-react";
import { useWebSocket } from "../../hooks/useWebSocket";

const NAV_GROUPS = [
  {
    label: "Home",
    items: [
      { label: "Home",        path: "/",          icon: Home, exact: true },
      { label: "Search",      action: "search",   icon: Search },
      { label: "AI Briefing", path: "/brain",     icon: Newspaper },
      { label: "Timeline",    path: "/activity",  icon: Clock },
    ],
  },
  {
    label: "Workspace",
    items: [
      { label: "Engineering", path: "/projects",  icon: GitMerge },
      { label: "Meetings",    path: "/meetings",  icon: Calendar },
      { label: "Inbox",       path: "/inbox",     icon: Inbox },
      { label: "Knowledge",   path: "/knowledge", icon: BookOpen },
    ],
  },
  {
    label: "Company",
    items: [
      { label: "Overview", path: "/council", icon: Building },
      { label: "Team",     path: "/people",  icon: Users },
    ],
  },
];

function NavItem({ item, currentPath, onNavigate }) {
  const [hovered, setHovered] = useState(false);
  const Icon = item.icon;
  const isActive = item.path
    ? (item.exact ? currentPath === item.path : currentPath.startsWith(item.path))
    : false;

  return (
    <li>
      <button
        onClick={() => onNavigate(item)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 9,
          width: "100%",
          padding: "7px 16px",
          fontFamily: "var(--font-ui)",
          fontSize: 13,
          fontWeight: isActive ? 400 : 300,
          color: isActive ? "var(--t1)" : hovered ? "var(--t2)" : "var(--t3)",
          background: isActive ? "var(--accent-dim)" : hovered ? "rgba(31,27,22,0.04)" : "transparent",
          border: "none",
          borderLeft: `2px solid ${isActive ? "var(--accent)" : "transparent"}`,
          cursor: "pointer",
          textAlign: "left",
          transition: "color 80ms, background 80ms",
        }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <Icon style={{ width: 14, height: 14, flexShrink: 0, opacity: isActive ? 1 : 0.7 }} strokeWidth={1.5} />
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.label}</span>
      </button>
    </li>
  );
}

export const Sidebar = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { workspaceId } = useWebSocket();
  const [hidden, setHidden] = useState(false);
  const [trayHover, setTrayHover] = useState(false);

  useEffect(() => {
    const toggle = () => setHidden((h) => !h);
    window.addEventListener("flow:toggle-sidebar", toggle);
    return () => window.removeEventListener("flow:toggle-sidebar", toggle);
  }, []);

  const displayWorkspace = (workspaceId || "")
    .replace("workspace_", "").replace(/_/g, "-").toLowerCase() || "none";

  const displayName =
    localStorage.getItem("flow_user_name") ||
    (localStorage.getItem("flow_user_email") || "").split("@")[0] ||
    "FLOW User";
  const initials = displayName
    .split(/[\s._-]+/).filter(Boolean).slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase()).join("") || "FU";

  function handleNavigate(item) {
    if (item.action === "search") window.dispatchEvent(new CustomEvent("flow:open-search"));
    else if (item.path) navigate(item.path);
  }

  if (hidden) return null;

  return (
    <aside style={{
      width: 220,
      height: "100vh",
      background: "var(--surface-1)",
      borderRight: "1px solid var(--line-0)",
      display: "flex",
      flexDirection: "column",
      flexShrink: 0,
      fontFamily: "var(--font-ui)",
      userSelect: "none",
      zIndex: 30,
    }}>
      {/* Logo + workspace chip */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "14px 16px",
        borderBottom: "1px solid var(--line-0)",
        flexShrink: 0,
      }}>
        <button
          onClick={() => navigate("/")}
          aria-label="FLOW OS home"
          style={{ display: "flex", alignItems: "center", gap: 10, background: "none", border: "none", padding: 0, cursor: "pointer" }}
        >
          <div style={{
            width: 24, height: 24,
            background: "var(--accent)",
            borderRadius: 0,
            display: "flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0,
          }}>
            <span style={{ fontFamily: "var(--font-display)", fontSize: 15, fontWeight: 500, color: "#FFFFFF", lineHeight: 1 }}>F</span>
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
            <span style={{ fontFamily: "var(--font-display)", fontSize: 16, fontWeight: 500, color: "var(--t1)", letterSpacing: "0.05em" }}>FLOW</span>
            <span style={{ fontFamily: "var(--font-data)", fontSize: 10, fontWeight: 300, color: "var(--t3)", letterSpacing: "0.06em" }}>OS</span>
          </div>
        </button>

        <span style={{
          fontFamily: "var(--font-data)",
          fontSize: 9, fontWeight: 300,
          color: "var(--t3)",
          border: "1px solid var(--line-1)",
          padding: "2px 6px",
          borderRadius: 3,
          maxWidth: 74,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {displayWorkspace}
        </span>
      </div>

      {/* Navigation */}
      <nav style={{ flex: 1, overflowY: "auto", paddingBottom: 12 }}>
        {NAV_GROUPS.map((group) => (
          <div key={group.label}>
            <div style={{
              fontFamily: "var(--font-data)",
              fontSize: 10, fontWeight: 300,
              color: "var(--t4)",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              padding: "14px 16px 5px",
            }}>
              {group.label}
            </div>
            <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {group.items.map((item) => (
                <NavItem
                  key={item.label}
                  item={item}
                  currentPath={location.pathname}
                  onNavigate={handleNavigate}
                />
              ))}
            </ul>
          </div>
        ))}
      </nav>

      {/* User tray */}
      <button
        onClick={() => navigate("/settings")}
        onMouseEnter={() => setTrayHover(true)}
        onMouseLeave={() => setTrayHover(false)}
        title="Settings"
        style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: "12px 16px",
          borderTop: "1px solid var(--line-0)",
          background: trayHover ? "rgba(31,27,22,0.04)" : "transparent",
          border: "none",
          borderTopStyle: "solid",
          borderTopWidth: 1,
          borderTopColor: "var(--line-0)",
          cursor: "pointer",
          textAlign: "left",
          flexShrink: 0,
          transition: "background 80ms",
        }}
      >
        <div style={{
          width: 24, height: 24,
          background: "var(--surface-3)",
          border: "1px solid var(--line-1)",
          borderRadius: 3,
          display: "flex", alignItems: "center", justifyContent: "center",
          flexShrink: 0,
          fontFamily: "var(--font-data)",
          fontSize: 9, fontWeight: 400, color: "var(--t2)",
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
