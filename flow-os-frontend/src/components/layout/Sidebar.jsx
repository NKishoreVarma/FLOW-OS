import { useState, useEffect } from "react";
import { NavLink, useLocation } from "react-router-dom";
import {
  Home, Search, Bot, Calendar, BookOpen, Briefcase,
  Inbox, Activity, Settings, HelpCircle, ShieldAlert,
  Building, Lock, ChevronLeft, ChevronRight, Terminal, Server, Newspaper, LayoutDashboard, Clock
} from "lucide-react";
import { useWebSocket } from "../../hooks/useWebSocket";
import GlassPanel from "../ui/GlassPanel";
import Avatar from "../ui/Avatar";
import StatusDot from "../ui/StatusDot";

export const Sidebar = ({ isCollapsed, onToggle, mobileOpen, onMobileClose }) => {
  const location = useLocation();
  const { connectionStatus, workspaceId } = useWebSocket();
  const [devMode, setDevMode] = useState(() => localStorage.getItem('dev_mode') === 'true');

  useEffect(() => {
    const handleDevModeChange = () => {
      setDevMode(localStorage.getItem('dev_mode') === 'true');
    };
    window.addEventListener('dev-mode-change', handleDevModeChange);
    return () => {
      window.removeEventListener('dev-mode-change', handleDevModeChange);
    };
  }, []);

  const navigationItems = [
    { label: "Workfeed", path: "/workfeed", icon: Home },
    { label: "Exec Dashboard", path: "/dashboard", icon: LayoutDashboard },
    { label: "Daily Briefing", path: "/briefing", icon: Newspaper },
    { label: "Search", path: "/search", icon: Search },
    { label: "AI Assistant", path: "/assistant", icon: Bot },
    { label: "Meetings", path: "/meetings", icon: Calendar },
    { label: "Knowledge", path: "/knowledge", icon: BookOpen },
    { label: "Projects", path: "/projects", icon: Briefcase },
    { label: "Timeline", path: "/timeline", icon: Clock },
  ];

  const personalItems = [
    { label: "Inbox", path: "/inbox", icon: Inbox },
    { label: "Recent Activity", path: "/activity", icon: Activity },
  ];

  const settingsItems = [
    { label: "Settings", path: "/settings", icon: Settings },
    { label: "Help", path: "/help", icon: HelpCircle },
    ...(devMode ? [{ label: "Console", path: "/query", icon: Terminal }] : [])
  ];

  const enterpriseItems = [
    { label: "Platform Console", path: "/platform", icon: Server },
    { label: "Company Overview", path: "/admin", icon: Building },
    { label: "Team Dashboard", path: "/company", icon: ShieldAlert },
    { label: "Security", path: "/security", icon: Lock },
  ];

  const renderNavGroup = (items, title) => {
    return (
      <div className="space-y-1.5 pt-4">
        {title && !isCollapsed && (
          <span className="block px-3 text-[9px] font-bold text-text-muted uppercase tracking-wider">
            {title}
          </span>
        )}
        <ul className="space-y-1">
          {items.map((item) => {
            const Icon = item.icon;
            // Support exact matching or subpath highlight
            const isActive = location.pathname === item.path || (item.path === "/workfeed" && location.pathname === "/");

            return (
              <li key={item.label}>
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
          })}
        </ul>
      </div>
    );
  };

  const sidebarWidth = isCollapsed ? "w-16" : "w-64";
  const displayWorkspace = workspaceId ? workspaceId.replace('workspace_', '').replace('_', '-').toUpperCase() : "NONE";

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

        {/* Workspace Switcher/Badge */}
        {!isCollapsed && (
          <span className="text-[9px] font-bold bg-bg-secondary text-text-secondary border border-border-flow/90 px-1.5 py-0.5 rounded truncate max-w-[80px]">
            {displayWorkspace}
          </span>
        )}
      </div>

      {/* Navigation Group Items */}
      <div className="flex-1 overflow-y-auto px-2 space-y-2 py-4 divide-y divide-border-flow/20">
        {renderNavGroup(navigationItems)}
        {renderNavGroup(personalItems, "Personal")}
        {renderNavGroup(settingsItems, "System")}
        {devMode && renderNavGroup(enterpriseItems, "Enterprise")}
      </div>

      {/* Bottom User Avatar Box */}
      <div className="p-3 border-t border-border-flow/80 bg-bg-secondary/40 flex-shrink-0 flex items-center justify-between">
        <div className="flex items-center space-x-3 overflow-hidden">
          <Avatar name="Kishore Varma" size="sm" />
          {!isCollapsed && (
            <div className="flex flex-col min-w-0">
              <span className="text-ui-sm font-semibold text-text-primary truncate">Kishore Varma</span>
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

        {/* Collapsible toggle arrow */}
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
      {/* 1. Desktop & Tablet Static Sidebar */}
      <GlassPanel
        className={`hidden md:block h-screen flex-shrink-0 border-r border-border-flow/80 rounded-none shadow-none z-30 transition-all duration-300 ${sidebarWidth}`}
      >
        {sidebarContent}
      </GlassPanel>

      {/* 2. Mobile Drawer Navigation Overlay */}
      {mobileOpen && (
        <>
          {/* Mobile backdrop */}
          <div 
            className="fixed inset-0 bg-black/60 backdrop-blur-xs z-40 md:hidden"
            onClick={onMobileClose}
          />
          {/* Slide-out drawer panel */}
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
