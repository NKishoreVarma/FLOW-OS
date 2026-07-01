import { useState, useEffect, useRef } from "react";
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
  const [hasUnread, setHasUnread] = useState(true);
  const userMenuRef = useRef(null);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
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

  const toggleTheme = () => {
    setTheme((prev) => (prev === "dark" ? "light" : "dark"));
  };

  const displayName =
    localStorage.getItem("flow_user_name") ||
    localStorage.getItem("flow_user_email") ||
    "FLOW User";

  const rawWorkspaceId =
    localStorage.getItem("flow_workspace_id") ||
    localStorage.getItem("flow_os_workspace_id") ||
    "";
  const workspaceDisplay = rawWorkspaceId
    ? rawWorkspaceId.replace(/^workspace_/, "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
    : "No workspace";

  const handleLogout = () => {
    ["flow_token", "flow_user_name", "flow_user_email", "flow_workspace_id",
      "flow_os_token", "flow_os_workspace_id"].forEach((k) => localStorage.removeItem(k));
    navigate("/");
    window.location.reload();
  };

  // Count events received in the last 60 seconds. e.id = Date.now() + Math.random() at creation time.
  const recentAiCount = events
    ? events.filter((e) => Date.now() - Math.floor(e.id) < 60000).length
    : 0;

  const pageTitle = getPageTitle(location.pathname);

  const statusLabel =
    connectionStatus === "ONLINE" ? "CONNECTED" :
    connectionStatus === "CONNECTING" ? "SYNCING" :
    connectionStatus === "RECONNECTING" ? "RECONNECTING" :
    connectionStatus === "ERROR" ? "MAINTENANCE" :
    "OFFLINE";

  const statusDotStatus =
    connectionStatus === "ONLINE" ? "online" :
    connectionStatus === "CONNECTING" ? "connecting" :
    connectionStatus === "RECONNECTING" ? "warning" :
    "critical";

  return (
    <GlassPanel
      as="header"
      className="h-16 border-b border-border-flow/80 rounded-none shadow-none px-6 flex items-center justify-between sticky top-0 z-40 bg-bg-primary/60 backdrop-blur-md"
    >
      {/* Left: Hamburger (mobile only) + Breadcrumb */}
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

      {/* Center: Search bar (⌘K trigger) */}
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

      {/* Right: controls */}
      <div className="flex items-center space-x-3">

        {/* AI Activity badge — visible only when recent events exist */}
        {recentAiCount > 0 && (
          <div className="hidden sm:flex items-center space-x-1.5 bg-flow-purple/10 border border-flow-purple/20 px-2.5 py-1 rounded-full text-ui-xs font-semibold text-flow-purple select-none">
            <Cpu className="w-3 h-3" />
            <span>{recentAiCount} AI events</span>
          </div>
        )}

        {/* Connection status pill */}
        <div className="flex items-center space-x-2 bg-bg-secondary border border-border-flow px-2.5 py-1 rounded-full text-ui-xs font-semibold text-text-secondary select-none">
          <StatusDot status={statusDotStatus} />
          <span className="uppercase tracking-wider">{statusLabel}</span>
        </div>

        {/* Notification bell */}
        <div className="relative">
          <button
            onClick={() => { setIsNotifOpen((prev) => !prev); setHasUnread(false); }}
            className={`p-2 rounded-lg transition-apple border cursor-pointer ${
              isNotifOpen
                ? "bg-flow-purple/10 border-flow-purple/20 text-flow-purple"
                : "bg-transparent border-transparent text-text-secondary hover:text-text-primary hover:bg-bg-hover hover:border-white/5"
            }`}
          >
            <Bell className="w-4 h-4" />
            {hasUnread && (
              <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-flow-purple animate-pulse" />
            )}
          </button>
          <NotificationDropdown isOpen={isNotifOpen} onClose={() => setIsNotifOpen(false)} />
        </div>

        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          className="p-2 rounded-lg text-text-secondary hover:text-text-primary hover:bg-bg-hover border border-transparent hover:border-white/5 transition-apple cursor-pointer"
          title={theme === "dark" ? "Activate Light Mode" : "Activate Dark Mode"}
        >
          {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>

        {/* User avatar + dropdown */}
        <div className="relative" ref={userMenuRef}>
          <button
            onClick={() => setIsUserMenuOpen((prev) => !prev)}
            className="flex items-center space-x-1.5 p-1 rounded-xl hover:bg-bg-hover transition-colors cursor-pointer"
          >
            <Avatar name={displayName} size="sm" />
            <ChevronDown className={`w-3.5 h-3.5 text-text-muted transition-transform duration-200 ${isUserMenuOpen ? "rotate-180" : ""}`} />
          </button>

          {isUserMenuOpen && (
            <div className="absolute right-0 top-full mt-2 w-52 bg-bg-card border border-border-flow rounded-xl shadow-2xl z-50 overflow-hidden animate-fade-in">
              <div className="px-4 py-3 border-b border-border-flow/60">
                <p className="text-ui-sm font-semibold text-text-primary truncate">{displayName}</p>
                <p className="text-ui-xs text-text-muted truncate mt-0.5">{workspaceDisplay}</p>
              </div>
              <div className="py-1">
                <button
                  onClick={() => { setIsUserMenuOpen(false); navigate("/settings"); }}
                  className="w-full flex items-center space-x-3 px-4 py-2.5 text-ui-sm text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-colors text-left cursor-pointer"
                >
                  <User className="w-4 h-4" />
                  <span>Profile & Settings</span>
                </button>
                <button
                  onClick={() => { setIsUserMenuOpen(false); navigate("/platform/workspaces"); }}
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
