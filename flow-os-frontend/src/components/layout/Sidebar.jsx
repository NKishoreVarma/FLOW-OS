import { useLocation, NavLink } from "react-router-dom";
import {
  Home, Search, Newspaper, Clock,
  LayoutDashboard, Calendar, Briefcase, Inbox, BookOpen,
  Building, Users, Bot,
  Plug, Activity, Download, Server, Shield,
  Settings, HelpCircle,
  ChevronLeft, ChevronRight,
} from "lucide-react";
import { useWebSocket } from "../../hooks/useWebSocket";
import GlassPanel from "../ui/GlassPanel";
import Avatar from "../ui/Avatar";
import StatusDot from "../ui/StatusDot";

const NAV_GROUPS = [
  {
    label: "HOME",
    items: [
      { label: "Home",       path: "/workfeed",  icon: Home },
      { label: "Search",     path: "/search",    icon: Search },
      { label: "AI Briefing",path: "/briefing",  icon: Newspaper },
      { label: "Timeline",   path: "/timeline",  icon: Clock },
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

// Paths that must match exactly (not startsWith) to determine active state
const EXACT_MATCH_PATHS = new Set(["/platform", "/admin"]);

function NavItem({ item, isCollapsed, onMobileClose, currentPath }) {
  const Icon = item.icon;

  const isActive =
    currentPath === item.path ||
    (item.path === "/workfeed" && currentPath === "/") ||
    (!EXACT_MATCH_PATHS.has(item.path) && currentPath.startsWith(item.path));

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
}

export const Sidebar = ({ isCollapsed, onToggle, mobileOpen, onMobileClose }) => {
  const location = useLocation();
  const { connectionStatus, workspaceId } = useWebSocket();

  const displayWorkspace = workspaceId
    ? workspaceId.replace("workspace_", "").replace(/_/g, "-").toUpperCase()
    : "NONE";

  const displayName =
    localStorage.getItem("flow_user_name") ||
    localStorage.getItem("flow_user_email") ||
    "FLOW User";

  const sidebarWidth = isCollapsed ? "w-16" : "w-64";

  const sidebarContent = (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Top Brand Header */}
      <div className="h-16 flex items-center justify-between px-4 border-b border-border-flow/80 flex-shrink-0">
        <div className="flex items-center space-x-3 overflow-hidden">
          <span className="text-ui-xl text-flow-purple flex-shrink-0 font-semibold select-none">◈</span>
          {!isCollapsed && (
            <span className="text-ui-md font-bold tracking-tight text-white select-none">
              FLOW<span className="text-flow-purple">OS</span>
            </span>
          )}
        </div>

        {/* Workspace badge */}
        {!isCollapsed && (
          <span className="text-[9px] font-bold bg-bg-secondary text-text-secondary border border-border-flow/90 px-1.5 py-0.5 rounded truncate max-w-[80px]">
            {displayWorkspace}
          </span>
        )}
      </div>

      {/* Navigation Groups */}
      <div className="flex-1 overflow-y-auto px-2 py-4">
        {NAV_GROUPS.map((group) => (
          <div key={group.label} className="pt-3 first:pt-0">
            {!isCollapsed && (
              <span className="block px-3 mb-1 text-[9px] font-bold text-text-muted uppercase tracking-wider">
                {group.label}
              </span>
            )}
            <ul className="space-y-1">
              {group.items.map((item) => (
                <NavItem
                  key={item.path}
                  item={item}
                  isCollapsed={isCollapsed}
                  onMobileClose={onMobileClose}
                  currentPath={location.pathname}
                />
              ))}
            </ul>
          </div>
        ))}
      </div>

      {/* Bottom User Tray */}
      <div className="p-3 border-t border-border-flow/80 bg-bg-secondary/40 flex-shrink-0 flex items-center justify-between">
        <div className="flex items-center space-x-3 overflow-hidden">
          <Avatar name={displayName} size="sm" />
          {!isCollapsed && (
            <div className="flex flex-col min-w-0">
              <span className="text-ui-sm font-semibold text-text-primary truncate">{displayName}</span>
              <div className="flex items-center space-x-1.5 text-[9px] text-text-muted font-bold tracking-wider">
                <span className="text-flow-purple bg-flow-purple/10 px-1 rounded border border-flow-purple/20">PRO</span>
                <span className="flex items-center gap-1">
                  <StatusDot status={connectionStatus === "ONLINE" ? "online" : "connecting"} />
                  <span>{connectionStatus}</span>
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Collapse toggle */}
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
      {/* Desktop / Tablet static sidebar */}
      <GlassPanel
        className={`hidden md:block h-screen flex-shrink-0 border-r border-border-flow/80 rounded-none shadow-none z-30 transition-all duration-300 ${sidebarWidth}`}
      >
        {sidebarContent}
      </GlassPanel>

      {/* Mobile drawer */}
      {mobileOpen && (
        <>
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-xs z-40 md:hidden"
            onClick={onMobileClose}
          />
          <GlassPanel
            className="fixed inset-y-0 left-0 w-64 h-full border-r border-border-flow rounded-none z-50 md:hidden animate-fade-in"
          >
            {sidebarContent}
          </GlassPanel>
        </>
      )}
    </>
  );
};

export default Sidebar;
