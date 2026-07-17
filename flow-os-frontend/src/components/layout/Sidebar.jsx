import { useState, useCallback, useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  Home, Inbox, Calendar, FolderOpen, Users, DollarSign,
  BookOpen, Code2, ShieldCheck, Search, Building2, Settings, Lock,
  ChevronLeft, ChevronRight, Zap, ChevronsUpDown, Plus, Landmark, TrendingUp, Star,
} from "lucide-react";
import { useWebSocket } from "../../hooks/useWebSocket";

const PRIMARY = [
  { label: "Home",      path: "/",           icon: Home,       exact: true, badge: null },
  { label: "Brain",     path: "/brain",       icon: Zap,                    badge: null },
  { label: "Inbox",     path: "/inbox",       icon: Inbox,                  badge: 3 },
  { label: "Meetings",  path: "/meetings",    icon: Calendar,               badge: 2 },
  { label: "Projects",  path: "/projects",    icon: FolderOpen,             badge: null },
  { label: "People",    path: "/people",      icon: Users,                  badge: null },
  { label: "Customers", path: "/customers",   icon: DollarSign,             badge: null },
  { label: "Knowledge", path: "/knowledge",   icon: BookOpen,               badge: null },
  { label: "Chief of Staff", path: "/chief",  icon: Star,                   badge: null },
];

const INTEL = [
  { label: "Value",       path: "/success",           icon: TrendingUp,  badge: null },
  { label: "Weekly Review", path: "/review",          icon: TrendingUp,  badge: null },
  { label: "Council",     path: "/council",           icon: Landmark,    badge: null },
  { label: "Engineering", path: "/engineering",       icon: Code2,       badge: null },
  { label: "Security",    path: "/settings/security", icon: ShieldCheck, badge: null },
];

const UTIL = [
  { label: "Search",      path: null,                       icon: Search,   action: "search", badge: null },
  { label: "Workspace",   path: "/settings/workspaces",     icon: Building2,                 badge: null },
  { label: "Permissions", path: "/settings/permissions",    icon: Lock,                      badge: null },
  { label: "Settings",    path: "/settings",                icon: Settings,                  badge: null },
];

function NavItem({ item, isCollapsed, isActive, onClick }) {
  const [hovered, setHovered] = useState(false);
  const [showTip, setShowTip] = useState(false);
  const Icon = item.icon;

  const color = isActive
    ? "rgba(255,255,255,0.92)"
    : hovered
    ? "rgba(255,255,255,0.65)"
    : "rgba(255,255,255,0.35)";

  const bg = isActive
    ? "rgba(255,255,255,0.05)"
    : hovered
    ? "rgba(255,255,255,0.03)"
    : "transparent";

  return (
    <li style={{ listStyle: "none", position: "relative" }}>
      <button
        onClick={onClick}
        aria-label={item.label}
        onMouseEnter={() => { setHovered(true); isCollapsed && setShowTip(true); }}
        onMouseLeave={() => { setHovered(false); setShowTip(false); }}
        style={{
          display:     "flex",
          alignItems:  "center",
          gap:          8,
          padding:      "5px 10px",
          margin:       "0 4px",
          width:        "calc(100% - 8px)",
          borderRadius: 4,
          fontSize:     13,
          fontWeight:   isActive ? 500 : 400,
          color,
          background:   bg,
          border:       "none",
          cursor:       "pointer",
          textAlign:    "left",
          outline:      "none",
          transition:   "color 100ms, background 100ms",
          userSelect:   "none",
          position:     "relative",
          letterSpacing: "-0.1px",
        }}
      >
        {isActive && (
          <span style={{
            position:   "absolute",
            left:        -4,
            top:          4,
            bottom:       4,
            width:        2,
            background:  "var(--brand)",
            borderRadius: 2,
          }} />
        )}

        <Icon
          style={{
            width: 14, height: 14, flexShrink: 0,
            opacity: isActive ? 0.9 : hovered ? 0.6 : 0.4,
          }}
          strokeWidth={isActive ? 2 : 1.75}
        />

        <span style={{
          opacity:    isCollapsed ? 0 : 1,
          maxWidth:   isCollapsed ? 0 : 140,
          overflow:   "hidden",
          whiteSpace: "nowrap",
          transition: "opacity 0.18s, max-width 0.18s",
          flex:       1,
        }}>
          {item.label}
        </span>

        {!isCollapsed && item.badge && (
          <span style={{
            marginLeft:  "auto",
            fontSize:    10,
            color:       "rgba(255,255,255,0.20)",
            background:  "rgba(255,255,255,0.06)",
            padding:     "1px 5px",
            borderRadius: 3,
            flexShrink:  0,
            fontVariantNumeric: "tabular-nums",
          }}>
            {item.badge}
          </span>
        )}
      </button>

      <AnimatePresence>
        {showTip && isCollapsed && (
          <motion.div
            initial={{ opacity: 0, x: -4 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.1 }}
            style={{
              position:     "absolute",
              left:          48, top: "50%",
              transform:    "translateY(-50%)",
              zIndex:        50,
              padding:       "5px 10px",
              background:   "var(--bg-elevated)",
              border:       "1px solid var(--border-strong)",
              borderRadius:  4,
              whiteSpace:   "nowrap",
              pointerEvents:"none",
              fontSize:      12,
              color:        "rgba(255,255,255,0.85)",
              boxShadow:    "0 8px 24px rgba(0,0,0,0.4)",
            }}
          >
            {item.label}
            {item.badge && (
              <span style={{
                marginLeft: 6,
                fontSize:   10,
                color:      "rgba(255,255,255,0.20)",
                background: "rgba(255,255,255,0.06)",
                padding:    "1px 5px",
                borderRadius: 3,
              }}>
                {item.badge}
              </span>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </li>
  );
}

function SectionLabel({ label, isCollapsed }) {
  if (isCollapsed) return (
    <div style={{ height: 1, background: "var(--border)", margin: "6px 12px" }} />
  );
  return (
    <div style={{
      fontSize:       10,
      fontWeight:     500,
      textTransform:  "uppercase",
      letterSpacing:  "0.07em",
      color:          "rgba(255,255,255,0.18)",
      padding:        "10px 16px 4px",
      userSelect:     "none",
    }}>
      {label}
    </div>
  );
}

export default function Sidebar() {
  const [isPinned, setIsPinned] = useState(
    () => localStorage.getItem("flow_sidebar_pinned") === "true"
  );
  const [isHovered, setIsHovered] = useState(false);
  const [wsDropOpen, setWsDropOpen] = useState(false);
  const wsDropRef = useRef(null);
  const location = useLocation();
  const navigate = useNavigate();
  const { workspaceId, workspaces, switchWorkspace } = useWebSocket();

  const isExpanded = isPinned || isHovered;
  const isCollapsed = !isExpanded;

  const workspaceRaw  = workspaceId || localStorage.getItem("flow_os_workspace_id") || "corp_alpha";
  const activeWs      = workspaces.find(w => w.externalId === workspaceRaw);
  const workspaceName = activeWs?.name || workspaceRaw
    .replace(/^workspace_/, "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, c => c.toUpperCase());
  const wsInitials = workspaceName.split(" ").map(w => w[0]).filter(Boolean).join("").slice(0, 2).toUpperCase() || "FL";

  useEffect(() => {
    if (!wsDropOpen) return;
    const handler = (e) => { if (wsDropRef.current && !wsDropRef.current.contains(e.target)) setWsDropOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [wsDropOpen]);

  const toggle = useCallback(() => {
    setIsPinned(prev => {
      const next = !prev;
      localStorage.setItem("flow_sidebar_pinned", String(next));
      return next;
    });
  }, []);

  useEffect(() => {
    const h = () => toggle();
    window.addEventListener("flow:toggle-sidebar", h);
    return () => window.removeEventListener("flow:toggle-sidebar", h);
  }, [toggle]);

  function isActive(item) {
    if (item.exact) return location.pathname === "/" || location.pathname === "/workfeed";
    return Boolean(item.path && location.pathname.startsWith(item.path));
  }

  function handleClick(item) {
    if (item.action === "search") window.dispatchEvent(new CustomEvent("flow:open-search"));
    else if (item.path) navigate(item.path);
  }

  return (
    <motion.aside
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.28, ease: [0.25, 0.46, 0.45, 0.94] }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => { setIsHovered(false); setWsDropOpen(false); }}
      style={{
        width:         isExpanded ? 220 : 52,
        background:    "var(--bg-sidebar)",
        borderRight:   "1px solid var(--border)",
        display:       "flex",
        flexDirection: "column",
        height:        "100vh",
        flexShrink:    0,
        overflow:      "hidden",
        zIndex:        10,
        userSelect:    "none",
        transition:    "width 200ms cubic-bezier(0.4,0,0.2,1)",
      }}
    >
      {/* Header */}
      <div style={{
        display:       "flex",
        alignItems:    "center",
        height:        48,
        padding:        "0 10px 0 14px",
        borderBottom:  "1px solid var(--border)",
        flexShrink:    0,
        gap:            8,
      }}>
        <button
          onClick={() => navigate("/")}
          aria-label="FLOW OS Home"
          style={{
            display:    "flex",
            alignItems: "center",
            gap:         9,
            flex:        1,
            minWidth:    0,
            overflow:    "hidden",
            background:  "none",
            border:      "none",
            cursor:      "pointer",
            padding:     0,
          }}
        >
          <motion.div
            animate={{
              boxShadow: [
                "0 0 0px 0px rgba(124,110,255,0)",
                "0 0 12px 2px rgba(124,110,255,0.25)",
                "0 0 0px 0px rgba(124,110,255,0)",
              ],
            }}
            transition={{ duration: 4, repeat: Infinity, ease: "easeInOut", delay: 1.5 }}
            style={{
              width:          22,
              height:         22,
              borderRadius:    5,
              background:     "var(--brand)",
              display:        "flex",
              alignItems:     "center",
              justifyContent: "center",
              flexShrink:     0,
            }}
          >
            {/* FLOW OS mark — F built from offset flow-streams + intelligence node */}
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <rect x="6" y="5" width="3.4" height="14" rx="1.7" fill="#fff"/>
              <rect x="6" y="5" width="12" height="3.4" rx="1.7" fill="#fff"/>
              <rect x="9" y="10.3" width="8" height="3.4" rx="1.7" fill="#fff"/>
              <circle cx="19" cy="6.7" r="2.2" fill="#fff" fillOpacity="0.72"/>
            </svg>
          </motion.div>

          <div style={{
            opacity:    isCollapsed ? 0 : 1,
            maxWidth:   isCollapsed ? 0 : 130,
            overflow:   "hidden",
            transition: "opacity 0.18s, max-width 0.18s",
          }}>
            <div style={{
              fontSize:      13,
              fontWeight:    700,
              letterSpacing: "-0.02em",
              color:         "rgba(255,255,255,0.92)",
              lineHeight:    1,
            }}>
              FLOW<span style={{ fontWeight: 300, color: "rgba(255,255,255,0.4)", marginLeft: 3 }}>OS</span>
            </div>
            <div style={{
              fontSize:     11,
              fontWeight:   400,
              color:        "rgba(255,255,255,0.22)",
              lineHeight:   1,
              marginTop:    3,
              whiteSpace:   "nowrap",
              overflow:     "hidden",
              textOverflow: "ellipsis",
              letterSpacing: "-0.1px",
            }}>
              {workspaceName}
            </div>
          </div>
        </button>

        <button
          onClick={toggle}
          aria-label={isPinned ? "Unpin sidebar" : "Pin sidebar open"}
          style={{
            width:          20,
            height:         20,
            borderRadius:    3,
            display:        "flex",
            alignItems:     "center",
            justifyContent: "center",
            color:          "rgba(255,255,255,0.20)",
            background:     "none",
            border:         "none",
            cursor:         "pointer",
            flexShrink:     0,
            transition:     "color 100ms, background 100ms",
            opacity:        isCollapsed ? 0 : 1,
            pointerEvents:  isCollapsed ? "none" : "auto",
          }}
          onMouseEnter={e => {
            e.currentTarget.style.color = "rgba(255,255,255,0.55)";
            e.currentTarget.style.background = "rgba(255,255,255,0.05)";
          }}
          onMouseLeave={e => {
            e.currentTarget.style.color = "rgba(255,255,255,0.20)";
            e.currentTarget.style.background = "none";
          }}
        >
          {isPinned
            ? <ChevronLeft  style={{ width: 11, height: 11 }} />
            : <ChevronRight style={{ width: 11, height: 11 }} />
          }
        </button>
      </div>

      {/* Primary nav */}
      <nav style={{ flex: 1, overflowY: "auto", padding: "6px 0" }}>
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column" }}>
          {PRIMARY.map(item => (
            <NavItem
              key={item.label}
              item={item}
              isCollapsed={isCollapsed}
              isActive={isActive(item)}
              onClick={() => handleClick(item)}
            />
          ))}
        </ul>

        <div style={{ marginTop: 4 }}>
          <SectionLabel label="Intelligence" isCollapsed={isCollapsed} />
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column" }}>
            {INTEL.map(item => (
              <NavItem
                key={item.label}
                item={item}
                isCollapsed={isCollapsed}
                isActive={isActive(item)}
                onClick={() => handleClick(item)}
              />
            ))}
          </ul>
        </div>
      </nav>

      {/* Utility nav */}
      <div style={{ borderTop: "1px solid var(--border)", padding: "4px 0" }}>
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column" }}>
          {UTIL.map(item => (
            <NavItem
              key={item.label}
              item={item}
              isCollapsed={isCollapsed}
              isActive={item.path ? isActive(item) : false}
              onClick={() => handleClick(item)}
            />
          ))}
        </ul>
      </div>

      {/* User footer / Workspace switcher */}
      <div style={{ borderTop: "1px solid var(--border)", padding: "8px 4px", position: "relative" }}>
        <button
          onClick={() => { if (workspaces.length > 1) setWsDropOpen(p => !p); else navigate("/settings/workspaces"); }}
          style={{
            display:     "flex",
            alignItems:  "center",
            gap:          9,
            padding:      "6px 10px",
            width:        "100%",
            background:  wsDropOpen ? "rgba(255,255,255,0.03)" : "none",
            border:      "none",
            cursor:      "pointer",
            borderRadius: 4,
            transition:  "background 100ms",
          }}
          onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.03)"}
          onMouseLeave={e => { if (!wsDropOpen) e.currentTarget.style.background = "none"; }}
        >
          <div style={{
            width: 24, height: 24, borderRadius: "50%",
            background: "rgba(124,110,255,0.18)",
            border: "1px solid rgba(124,110,255,0.25)",
            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
          }}>
            <span style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 9, fontWeight: 500,
              color: "var(--brand-text)", letterSpacing: "0.04em",
            }}>
              {wsInitials}
            </span>
          </div>

          <div style={{
            opacity:    isCollapsed ? 0 : 1,
            maxWidth:   isCollapsed ? 0 : 130,
            overflow:   "hidden",
            transition: "opacity 0.18s, max-width 0.18s",
            textAlign:  "left",
            flex:        1,
            minWidth:    0,
          }}>
            <div style={{
              fontSize: 12, fontWeight: 500,
              color: "rgba(255,255,255,0.65)",
              lineHeight: 1, whiteSpace: "nowrap",
              letterSpacing: "-0.1px",
              overflow: "hidden", textOverflow: "ellipsis",
            }}>
              {workspaceName}
            </div>
            <div style={{
              fontSize: 10, fontWeight: 400,
              color: "rgba(255,255,255,0.22)",
              lineHeight: 1, marginTop: 3,
              letterSpacing: "-0.05px",
            }}>
              {workspaces.length > 1 ? `${workspaces.length} workspaces` : "Workspace"}
            </div>
          </div>

          {!isCollapsed && workspaces.length > 1 && (
            <ChevronsUpDown style={{ width: 12, height: 12, color: "rgba(255,255,255,0.20)", flexShrink: 0 }} />
          )}
        </button>

        {wsDropOpen && !isCollapsed && (
          <div
            ref={wsDropRef}
            style={{
              position: "absolute", bottom: "calc(100% + 6px)", left: 8, right: 8,
              background: "var(--bg-card)",
              border: "1px solid var(--border-strong)",
              borderRadius: 5,
              boxShadow: "0 8px 24px rgba(0,0,0,0.45)",
              zIndex: 100, overflow: "hidden",
            }}
          >
            <div style={{
              padding: "8px 10px 6px",
              fontSize: 10, fontWeight: 500,
              textTransform: "uppercase", letterSpacing: "0.07em",
              color: "var(--t5)",
              borderBottom: "1px solid var(--border)",
            }}>
              Switch Workspace
            </div>
            <div style={{ maxHeight: 220, overflowY: "auto" }}>
              {workspaces.map(ws => {
                const active = ws.externalId === workspaceRaw;
                const initials = ws.name.split(" ").map(w => w[0]).filter(Boolean).join("").slice(0, 2).toUpperCase();
                return (
                  <button
                    key={ws.externalId}
                    onClick={() => { switchWorkspace(ws.externalId); setWsDropOpen(false); }}
                    style={{
                      display: "flex", alignItems: "center", gap: 8,
                      width: "100%", padding: "9px 10px",
                      background: active ? "rgba(124,110,255,0.08)" : "transparent",
                      border: "none", cursor: "pointer", textAlign: "left",
                      transition: "background 80ms",
                    }}
                    onMouseEnter={e => { if (!active) e.currentTarget.style.background = "rgba(255,255,255,0.03)"; }}
                    onMouseLeave={e => { if (!active) e.currentTarget.style.background = "transparent"; }}
                  >
                    <div style={{
                      width: 22, height: 22, borderRadius: "50%",
                      background: active ? "rgba(124,110,255,0.22)" : "rgba(255,255,255,0.06)",
                      display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                    }}>
                      <span style={{
                        fontFamily: "'JetBrains Mono', monospace",
                        fontSize: 8, fontWeight: 700,
                        color: active ? "var(--brand-text)" : "var(--t4)",
                      }}>
                        {initials}
                      </span>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <span style={{
                        display: "block", fontSize: 11, fontWeight: 500,
                        color: active ? "var(--t1)" : "var(--t3)",
                        whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                      }}>
                        {ws.name}
                      </span>
                      <span style={{
                        fontSize: 9, color: "var(--t5)",
                        fontFamily: "'JetBrains Mono', monospace",
                      }}>
                        {ws.externalId?.slice(0, 20)}
                      </span>
                    </div>
                    {active && <div style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--brand)", flexShrink: 0 }} />}
                  </button>
                );
              })}
            </div>
            <div style={{ borderTop: "1px solid var(--border)", padding: "6px 8px" }}>
              <button
                onClick={() => { navigate("/settings/workspaces"); setWsDropOpen(false); }}
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  width: "100%", padding: "6px 8px",
                  background: "transparent", border: "none",
                  cursor: "pointer", fontSize: 10, color: "var(--t5)", borderRadius: 3,
                }}
                onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.03)"}
                onMouseLeave={e => e.currentTarget.style.background = "transparent"}
              >
                <Plus style={{ width: 10, height: 10 }} /> Manage workspaces
              </button>
            </div>
          </div>
        )}
      </div>
    </motion.aside>
  );
}
