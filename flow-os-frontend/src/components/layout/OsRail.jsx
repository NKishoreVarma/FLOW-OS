import { useLocation, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";
import {
  Home, Inbox, Calendar, Briefcase, Users, BookOpen,
  Search, Settings, Zap,
} from "lucide-react";

const NAV_ITEMS = [
  { label: "Home",      path: "/",          icon: Home,      exact: true },
  { label: "Inbox",     path: "/inbox",     icon: Inbox,     badge: false },
  { label: "Meetings",  path: "/meetings",  icon: Calendar },
  { label: "Projects",  path: "/projects",  icon: Briefcase },
  { label: "People",    path: "/people",    icon: Users },
  { label: "Knowledge", path: "/knowledge", icon: BookOpen },
];

const BOTTOM_ITEMS = [
  { label: "Search (⌘K)", path: null,        icon: Search,   action: "search" },
  { label: "Settings",    path: "/settings", icon: Settings },
];

function RailItem({ item, isActive, onClick }) {
  const [showTooltip, setShowTooltip] = useState(false);
  const Icon = item.icon;

  return (
    <li style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <button
        aria-label={item.label}
        onClick={onClick}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        style={{
          position: "relative",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 36,
          height: 36,
          borderRadius: 6,
          background: isActive ? "rgba(232,103,43,0.12)" : "transparent",
          border: isActive ? "1px solid rgba(232,103,43,0.22)" : "1px solid transparent",
          color: isActive ? "var(--brand)" : "var(--t5)",
          cursor: "pointer",
          transition: "all 120ms",
        }}
      >
        {isActive && (
          <span style={{ position: "absolute", left: -3, top: "50%", transform: "translateY(-50%)", width: 2, height: 18, background: "var(--brand)", borderRadius: "0 2px 2px 0" }} />
        )}
        <Icon style={{ width: 15, height: 15 }} strokeWidth={isActive ? 2 : 1.75} />
        {item.badge && (
          <span style={{ position: "absolute", top: 6, right: 6, width: 5, height: 5, borderRadius: "50%", background: "var(--brand)" }} />
        )}
      </button>

      <AnimatePresence>
        {showTooltip && (
          <motion.div
            initial={{ opacity: 0, x: -4 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -4 }}
            transition={{ duration: 0.1 }}
            style={{ position: "absolute", left: 46, zIndex: 50, padding: "5px 10px", background: "var(--bg-card)", border: "1px solid var(--border-strong)", borderRadius: 4, boxShadow: "0 8px 24px rgba(31,27,22,0.12)", whiteSpace: "nowrap", pointerEvents: "none" }}
          >
            <span style={{ fontSize: 12, color: "var(--t1)", fontWeight: 500 }}>{item.label}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </li>
  );
}

export default function OsRail() {
  const location = useLocation();
  const navigate = useNavigate();

  const workspaceId = localStorage.getItem("flow_os_workspace_id") || "";
  const wsLabel = workspaceId.replace("workspace_", "").slice(0, 2).toUpperCase() || "FL";

  function isActive(item) {
    if (item.exact) return location.pathname === "/" || location.pathname === "/workfeed";
    return location.pathname.startsWith(item.path);
  }

  function handleClick(item) {
    if (item.action === "search") window.dispatchEvent(new CustomEvent("flow:open-search"));
    else if (item.path) navigate(item.path);
  }

  return (
    <aside style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 52, height: "100vh", background: "var(--bg-sidebar)", borderRight: "1px solid var(--border)", flexShrink: 0, padding: "10px 0 12px", userSelect: "none", zIndex: 10 }}>

      <button
        onClick={() => navigate("/")}
        aria-label="FLOW OS Home"
        style={{ width: 36, height: 36, borderRadius: 6, background: "rgba(232,103,43,0.12)", border: "1px solid rgba(232,103,43,0.22)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--brand)", marginBottom: 12, cursor: "pointer", flexShrink: 0 }}
      >
        <Zap style={{ width: 15, height: 15 }} />
      </button>

      <nav aria-label="Primary navigation" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, flex: 1 }}>
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
          {NAV_ITEMS.map((item) => (
            <RailItem key={item.path || item.label} item={item} isActive={isActive(item)} onClick={() => handleClick(item)} />
          ))}
        </ul>
      </nav>

      <ul style={{ listStyle: "none", margin: 0, padding: "8px 0 0", display: "flex", flexDirection: "column", alignItems: "center", gap: 2, borderTop: "1px solid var(--border)" }}>
        {BOTTOM_ITEMS.map((item) => (
          <RailItem
            key={item.label}
            item={item}
            isActive={item.path ? location.pathname.startsWith(item.path) : false}
            onClick={() => handleClick(item)}
          />
        ))}
        <li style={{ marginTop: 4 }}>
          <div
            title={workspaceId}
            style={{ width: 28, height: 28, borderRadius: 5, background: "rgba(31,27,22,0.05)", border: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 500, color: "var(--t3)", fontFamily: "'IBM Plex Mono', monospace" }}
          >
            {wsLabel}
          </div>
        </li>
      </ul>
    </aside>
  );
}
