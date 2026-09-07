import { useState, useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Bell, Search, Menu, Cpu, ChevronDown, LogOut, User, Building, Zap } from "lucide-react";
import { useWebSocket } from "../../hooks/useWebSocket";
import Avatar from "../ui/Avatar";
import StatusDot from "../ui/StatusDot";
import NotificationDropdown from "../ui/NotificationDropdown";
import QuickCreateMenu from "../ui/QuickCreateMenu";

const ROUTE_TITLES = {
  "/": "Home", "/workfeed": "Home", "/search": "Search",
  "/assistant": "Assistant", "/briefing": "Briefing", "/timeline": "Timeline",
  "/dashboard": "Executive Dashboard", "/meetings": "Meetings",
  "/knowledge": "Knowledge", "/projects": "Projects", "/inbox": "Inbox",
  "/admin": "Company", "/admin/advisor": "AI Advisor",
  "/admin/memory": "Company Memory", "/admin/crm": "Customer Intelligence",
  "/admin/workforce": "Workforce Intelligence",
  "/company": "Team", "/company/decisions": "Decisions",
  "/company/memory": "Team Memory", "/company/collaboration": "Collaboration",
  "/platform": "Platform", "/platform/iam": "Identity & Access",
  "/platform/workspaces": "Workspaces", "/platform/security": "Security",
  "/platform/audit": "Audit", "/platform/governance": "AI Governance",
  "/platform/integrations": "Integrations", "/platform/billing": "Billing",
  "/platform/marketplace": "Marketplace", "/platform/import": "Import Engine",
  "/platform/onboarding": "Onboarding", "/platform/health": "Workspace Health",
  "/platform/evaluation": "AI Evaluation",
  "/security": "Security", "/settings": "Settings", "/activity": "Activity",
  "/help": "Help", "/query": "Developer Console",
};

function getPageTitle(pathname) {
  if (ROUTE_TITLES[pathname]) return ROUTE_TITLES[pathname];
  if (pathname.startsWith("/meetings/") && pathname.endsWith("/prep"))    return "Meeting Prep";
  if (pathname.startsWith("/meetings/") && pathname.endsWith("/live"))    return "Live Meeting";
  if (pathname.startsWith("/meetings/") && pathname.endsWith("/summary")) return "Meeting Summary";
  if (pathname.startsWith("/admin/departments/")) return "Department";
  if (pathname.startsWith("/entity/")) return "Entity Workspace";
  return "FLOW";
}

export const Header = ({ onMobileOpen, onSearchOpen }) => {
  const location = useLocation();
  const navigate  = useNavigate();
  const { connectionStatus, events } = useWebSocket();

  const [isNotifOpen,   setIsNotifOpen]   = useState(false);
  const [isUserMenuOpen,setIsUserMenuOpen] = useState(false);
  const [hasUnread,     setHasUnread]     = useState(true);
  const [searchHov,     setSearchHov]     = useState(false);
  const userMenuRef = useRef(null);

  useEffect(() => {
    const handler = e => { if (userMenuRef.current && !userMenuRef.current.contains(e.target)) setIsUserMenuOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const displayName     = localStorage.getItem("flow_user_name") || localStorage.getItem("flow_user_email") || "FLOW User";
  const rawWorkspaceId  = localStorage.getItem("flow_workspace_id") || localStorage.getItem("flow_os_workspace_id") || "";
  const workspaceDisplay= rawWorkspaceId ? rawWorkspaceId.replace(/^workspace_/, "").replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()) : "No workspace";

  const handleLogout = () => {
    ["flow_token","flow_user_name","flow_user_email","flow_workspace_id","flow_os_token","flow_os_workspace_id"]
      .forEach(k => localStorage.removeItem(k));
    navigate("/");
    window.location.reload();
  };

  const recentAiCount = events ? events.filter(e => Date.now() - Math.floor(e.id) < 60000).length : 0;
  const pageTitle     = getPageTitle(location.pathname);

  const statusDotStatus =
    connectionStatus === "ONLINE"       ? "online"     :
    connectionStatus === "CONNECTING"   ? "connecting" :
    connectionStatus === "RECONNECTING" ? "reconnecting" :
    connectionStatus === "OFFLINE"      ? "offline"    : "error";

  const statusLabel =
    connectionStatus === "ONLINE"       ? "CONNECTED"    :
    connectionStatus === "CONNECTING"   ? "SYNCING"      :
    connectionStatus === "RECONNECTING" ? "RECONNECTING" :
    connectionStatus === "OFFLINE"      ? "OFFLINE"      : "ERROR";

  const statusColor =
    connectionStatus === "ONLINE"       ? "var(--p-normal-text)" :
    connectionStatus === "CONNECTING"   ? "var(--t4)"            :
    connectionStatus === "RECONNECTING" ? "var(--p-high-text)"   :
    connectionStatus === "OFFLINE"      ? "var(--t4)"            : "var(--p-critical-text)";

  const statusTitle =
    connectionStatus === "ONLINE"       ? "Live — receiving real-time events" :
    connectionStatus === "CONNECTING"   ? "Establishing the real-time connection…" :
    connectionStatus === "RECONNECTING" ? "Connection dropped — retrying automatically" :
    connectionStatus === "OFFLINE"      ? "No workspace selected or backend unreachable" :
    "Real-time connection rejected — sign in again or check access";

  const iconBtn = (content, onClick, title, active = false) => (
    <button
      onClick={onClick}
      title={title}
      style={{
        width: 30, height: 30, borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center",
        background: active ? "rgba(232,103,43,0.10)" : "transparent",
        border: `1px solid ${active ? "rgba(232,103,43,0.25)" : "transparent"}`,
        color: active ? "var(--brand)" : "var(--t4)", cursor: "pointer", transition: "all 100ms",
      }}
      onMouseEnter={e => { if (!active) { e.currentTarget.style.background = "rgba(31,27,22,0.05)"; e.currentTarget.style.color = "var(--t2)"; } }}
      onMouseLeave={e => { if (!active) { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--t4)"; } }}
    >
      {content}
    </button>
  );

  return (
    <header style={{
      height: 52, borderBottom: "1px solid var(--border)",
      background: "rgba(17,17,19,0.85)", backdropFilter: "blur(12px)",
      position: "sticky", top: 0, zIndex: 40,
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "0 20px", flexShrink: 0,
    }}>
      {/* Left: breadcrumb */}
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <button onClick={onMobileOpen} style={{ display: "none" }}>
          <Menu style={{ width: 16, height: 16 }} />
        </button>
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, userSelect: "none" }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <rect x="6" y="5" width="3.4" height="14" rx="1.7" fill="var(--brand)"/>
            <rect x="6" y="5" width="12" height="3.4" rx="1.7" fill="var(--brand)"/>
            <rect x="9" y="10.3" width="8" height="3.4" rx="1.7" fill="var(--brand)"/>
            <circle cx="19" cy="6.7" r="2.2" fill="var(--brand)" fillOpacity="0.6"/>
          </svg>
          <span style={{ color: "var(--t5)" }}>/</span>
          <span style={{ color: "var(--t2)", fontWeight: 500 }}>{pageTitle}</span>
        </div>
      </div>

      {/* Center: search trigger */}
      <button
        onClick={onSearchOpen}
        onMouseEnter={() => setSearchHov(true)}
        onMouseLeave={() => setSearchHov(false)}
        style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "5px 12px", minWidth: 240,
          background: searchHov ? "var(--bg-hover)" : "var(--bg-card)",
          border: `1px solid ${searchHov ? "var(--border-strong)" : "var(--border)"}`,
          borderRadius: 4, cursor: "pointer", transition: "all 100ms",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--t5)" }}>
          <Search style={{ width: 12, height: 12 }} />
          <span style={{ fontSize: 12 }}>Search intelligence…</span>
        </div>
        <kbd style={{
          fontFamily: "'IBM Plex Mono', monospace", fontSize: 9,
          color: "var(--t5)", background: "rgba(31,27,22,0.05)",
          border: "1px solid var(--border)", borderRadius: 3,
          padding: "1px 5px", flexShrink: 0,
        }}>⌘K</kbd>
      </button>

      {/* Right: controls */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {/* Global quick-create */}
        <QuickCreateMenu />

        {/* AI event badge */}
        {recentAiCount > 0 && (
          <div style={{
            display: "flex", alignItems: "center", gap: 5,
            padding: "3px 9px", borderRadius: 4,
            background: "rgba(232,103,43,0.08)", border: "1px solid rgba(232,103,43,0.20)",
            color: "var(--brand-text)", fontSize: 11, fontWeight: 500,
          }}>
            <Cpu style={{ width: 10, height: 10 }} />
            {recentAiCount} AI events
          </div>
        )}

        {/* Connection status */}
        <div
          title={statusTitle}
          style={{
            display: "flex", alignItems: "center", gap: 5,
            padding: "3px 9px", borderRadius: 4,
            background: "rgba(31,27,22,0.045)", border: "1px solid var(--border)",
            fontSize: 11, fontWeight: 500,
            color: statusColor,
            userSelect: "none", cursor: "default",
          }}>
          <StatusDot status={statusDotStatus} size={5} />
          {statusLabel}
        </div>

        {/* Bell */}
        <div style={{ position: "relative" }}>
          {iconBtn(
            <>
              <Bell style={{ width: 14, height: 14 }} />
              {hasUnread && <span style={{ position: "absolute", top: 6, right: 6, width: 5, height: 5, borderRadius: "50%", background: "var(--brand)" }} />}
            </>,
            () => { setIsNotifOpen(p => !p); setHasUnread(false); },
            "Notifications",
            isNotifOpen
          )}
          <NotificationDropdown isOpen={isNotifOpen} onClose={() => setIsNotifOpen(false)} />
        </div>

        {/* User avatar + dropdown */}
        <div style={{ position: "relative" }} ref={userMenuRef}>
          <button
            onClick={() => setIsUserMenuOpen(p => !p)}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "4px 6px", borderRadius: 4, background: "transparent", border: "none",
              cursor: "pointer", transition: "background 100ms",
            }}
            onMouseEnter={e => e.currentTarget.style.background = "rgba(31,27,22,0.05)"}
            onMouseLeave={e => e.currentTarget.style.background = "transparent"}
          >
            <Avatar name={displayName} size="sm" />
            <ChevronDown style={{ width: 12, height: 12, color: "var(--t5)", transform: isUserMenuOpen ? "rotate(180deg)" : "none", transition: "transform 200ms" }} />
          </button>

          {isUserMenuOpen && (
            <div style={{
              position: "absolute", right: 0, top: "100%", marginTop: 6,
              width: 200, background: "var(--bg-sidebar)",
              border: "1px solid var(--border-strong)", borderRadius: 5,
              boxShadow: "0 8px 32px rgba(31,27,22,0.12)",
              zIndex: 50, overflow: "hidden",
              animation: "event-slide-in 0.15s ease",
            }}>
              <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)" }}>
                <p style={{ fontSize: 12, fontWeight: 500, color: "var(--t1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{displayName}</p>
                <p style={{ fontSize: 10, color: "var(--t5)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: "'IBM Plex Mono', monospace", marginTop: 2 }}>{workspaceDisplay}</p>
              </div>
              <div style={{ padding: "4px 0" }}>
                {[
                  { icon: User,     label: "Profile & Settings",  onClick: () => { setIsUserMenuOpen(false); navigate("/settings"); } },
                  { icon: Building, label: "Switch Workspace",    onClick: () => { setIsUserMenuOpen(false); navigate("/platform/workspaces"); } },
                ].map(({ icon: Icon, label, onClick }) => (
                  <button key={label} onClick={onClick} style={{
                    width: "100%", display: "flex", alignItems: "center", gap: 10,
                    padding: "8px 14px", fontSize: 12, color: "var(--t3)",
                    background: "transparent", border: "none", cursor: "pointer",
                    textAlign: "left", transition: "all 100ms",
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = "rgba(31,27,22,0.045)"; e.currentTarget.style.color = "var(--t1)"; }}
                  onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--t3)"; }}
                  >
                    <Icon style={{ width: 13, height: 13 }} />{label}
                  </button>
                ))}
                <div style={{ borderTop: "1px solid var(--border)", marginTop: 4, paddingTop: 4 }}>
                  <button onClick={handleLogout} style={{
                    width: "100%", display: "flex", alignItems: "center", gap: 10,
                    padding: "8px 14px", fontSize: 12, color: "var(--p-critical-text)",
                    background: "transparent", border: "none", cursor: "pointer", textAlign: "left",
                    transition: "background 100ms",
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = "rgba(255,87,87,0.06)"}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                  >
                    <LogOut style={{ width: 13, height: 13 }} />Sign Out
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};

export default Header;
