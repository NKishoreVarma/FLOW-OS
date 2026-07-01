import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { X, Bell, Zap, AlertTriangle, CheckCircle, Info, Plug, Brain } from "lucide-react";
import { useWebSocket } from "../../hooks/useWebSocket";

// ---------------------------------------------------------------------------
// Static config
// ---------------------------------------------------------------------------

const TABS = ["All", "Action Required", "Incidents", "AI Insights"];

const TAB_FILTER = {
  "All":             () => true,
  "Action Required": (n) => n.type === "approval" || n.priority === "critical",
  "Incidents":       (n) => n.type === "incident",
  "AI Insights":     (n) => n.type === "recommendation" || n.type === "ai_insight",
};

const TYPE_META = {
  recommendation: { icon: Brain,         color: "text-flow-purple", bg: "bg-flow-purple/10" },
  approval:       { icon: CheckCircle,   color: "text-warning",     bg: "bg-warning/10"     },
  incident:       { icon: AlertTriangle, color: "text-critical",    bg: "bg-critical/10"    },
  connector:      { icon: Plug,          color: "text-info",        bg: "bg-info/10"        },
  ai_insight:     { icon: Zap,           color: "text-success",     bg: "bg-success/10"     },
};

const DEMO_NOTIFICATIONS = [
  {
    id: "demo-1",
    type: "recommendation",
    title: "Deploy Review Needed",
    body: "3 PRs are ready for merge but awaiting final review.",
    href: "/projects",
    time: new Date(Date.now() - 5 * 60000),
    priority: "high",
  },
  {
    id: "demo-2",
    type: "incident",
    title: "Database Latency Spike",
    body: "pgvector queries exceeding 500ms threshold.",
    href: "/platform/health",
    time: new Date(Date.now() - 12 * 60000),
    priority: "critical",
  },
  {
    id: "demo-3",
    type: "ai_insight",
    title: "Weekly Intelligence Ready",
    body: "Your AI briefing for this week is ready.",
    href: "/briefing",
    time: new Date(Date.now() - 30 * 60000),
    priority: "medium",
  },
  {
    id: "demo-4",
    type: "connector",
    title: "GitHub Sync Complete",
    body: "Synced 24 commits and 6 PRs to FLOW intelligence.",
    href: "/projects",
    time: new Date(Date.now() - 60 * 60000),
    priority: "low",
  },
  {
    id: "demo-5",
    type: "approval",
    title: "Approval Required",
    body: 'Action "send_email" to sales@acme.com requires your approval.',
    href: "/workfeed",
    time: new Date(Date.now() - 3 * 60000),
    priority: "high",
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function relativeTime(date) {
  const diff = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const NotificationDropdown = ({ isOpen, onClose }) => {
  const navigate = useNavigate();
  const { token, workspaceId, events } = useWebSocket();

  const [notifications, setNotifications] = useState([]);
  const [readIds, setReadIds] = useState(new Set());
  const [activeTab, setActiveTab] = useState("All");

  // Only fetch once per session (panel may open/close many times)
  const fetchedRef = useRef(false);

  // Stable addNotification: deduplicates by id
  const addNotification = useCallback((n) => {
    setNotifications((prev) => {
      if (prev.some((x) => x.id === n.id)) return prev;
      return [n, ...prev];
    });
  }, []);

  // Fetch API data once
  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;

    const headers = {
      Authorization: `Bearer ${token || localStorage.getItem("flow_token") || ""}`,
      "workspace-id": workspaceId || localStorage.getItem("flow_workspace_id") || "",
      "Content-Type": "application/json",
    };

    let loadedAny = false;

    Promise.allSettled([
      fetch("/api/brain/recommendations", { headers }).then((r) =>
        r.ok ? r.json() : Promise.reject(r.status)
      ),
      fetch("/api/approvals", { headers }).then((r) =>
        r.ok ? r.json() : Promise.reject(r.status)
      ),
    ]).then(([recResult, appResult]) => {
      if (recResult.status === "fulfilled") {
        const recs = Array.isArray(recResult.value?.recommendations)
          ? recResult.value.recommendations
          : Array.isArray(recResult.value)
          ? recResult.value
          : [];
        recs.slice(0, 10).forEach((rec) => {
          addNotification({
            id: `rec-${rec.id || rec.recommendationId || Math.random()}`,
            type: "recommendation",
            title: rec.title || rec.action || "AI Recommendation",
            body: rec.description || rec.reasoning || rec.body || "",
            href: "/workfeed",
            time: new Date(rec.createdAt || rec.timestamp || Date.now()),
            priority: rec.priority || "medium",
          });
          loadedAny = true;
        });
      }

      if (appResult.status === "fulfilled") {
        const apps = Array.isArray(appResult.value?.approvals)
          ? appResult.value.approvals
          : Array.isArray(appResult.value)
          ? appResult.value
          : [];
        apps.slice(0, 10).forEach((ap) => {
          addNotification({
            id: `ap-${ap.id || ap.approvalId || Math.random()}`,
            type: "approval",
            title: "Approval Required",
            body: ap.description || ap.reason || `Action "${ap.action || ap.actionType}" requires your approval.`,
            href: "/workfeed",
            time: new Date(ap.createdAt || ap.requestedAt || Date.now()),
            priority: "high",
          });
          loadedAny = true;
        });
      }

      // Fall back to demo data if both APIs failed or returned nothing
      if (!loadedAny) {
        DEMO_NOTIFICATIONS.forEach((n) => addNotification(n));
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addNotification]);

  // Process incoming WebSocket events
  useEffect(() => {
    if (!events) return;
    const recent = events.slice(-5);
    for (const ev of recent) {
      if (ev.type === "INCIDENT_CREATED") {
        addNotification({
          id: `ws-incident-${ev.id || Date.now()}`,
          type: "incident",
          title: "Incident Detected",
          body: ev.data?.description || ev.data?.text || "A new incident was detected.",
          href: "/timeline",
          time: new Date(),
          priority: "critical",
        });
      } else if (ev.type === "RISK_DETECTED") {
        addNotification({
          id: `ws-risk-${ev.id || Date.now()}`,
          type: "incident",
          title: "Risk Signal",
          body: ev.data?.text || "A risk signal was detected.",
          href: "/timeline",
          time: new Date(),
          priority: "high",
        });
      } else if (ev.type === "INTEL_STORED") {
        addNotification({
          id: `ws-intel-${ev.id || Date.now()}`,
          type: "ai_insight",
          title: "Intelligence Captured",
          body: ev.data?.channel
            ? `New intel from ${ev.data.channel}`
            : "New operational intelligence captured.",
          href: "/workfeed",
          time: new Date(),
          priority: "medium",
        });
      }
    }
  }, [events, addNotification]);

  // Derived values
  const filtered = notifications.filter(TAB_FILTER[activeTab] || (() => true));
  const unreadCount = notifications.filter((n) => !readIds.has(n.id)).length;

  const markRead = (id) => setReadIds((prev) => new Set([...prev, id]));
  const markAllRead = () =>
    setReadIds(new Set(notifications.map((n) => n.id)));

  const handleClick = (n) => {
    markRead(n.id);
    navigate(n.href);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40" onClick={onClose} />

      {/* Panel */}
      <div className="absolute right-0 top-full mt-2 w-96 bg-bg-card border border-border-flow rounded-xl shadow-2xl z-50 overflow-hidden animate-fade-in max-h-[80vh] flex flex-col">

        {/* Header */}
        <div className="px-4 py-3 border-b border-border-flow/80 flex items-center justify-between bg-bg-secondary/40 select-none shrink-0">
          <div className="flex items-center gap-2">
            <Bell className="w-3.5 h-3.5 text-text-secondary" />
            <span className="text-ui-sm font-semibold text-text-primary">Notifications</span>
            {unreadCount > 0 && (
              <span className="text-[10px] font-bold text-flow-purple bg-flow-purple/10 px-1.5 py-0.5 rounded border border-flow-purple/25">
                {unreadCount} New
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                className="text-[10px] font-semibold text-flow-purple hover:underline cursor-pointer"
              >
                Mark all read
              </button>
            )}
            <button
              onClick={onClose}
              className="p-0.5 rounded text-text-muted hover:text-text-primary hover:bg-bg-hover transition-colors cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="px-2 py-1.5 border-b border-border-flow/60 bg-bg-secondary/20 flex gap-1 overflow-x-auto select-none shrink-0">
          {TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-2.5 py-0.5 rounded text-[10px] font-semibold transition-colors cursor-pointer whitespace-nowrap flex-shrink-0 ${
                activeTab === tab
                  ? "bg-flow-purple/10 text-flow-purple border border-flow-purple/20"
                  : "text-text-secondary hover:bg-bg-hover hover:text-text-primary border border-transparent"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Notification list */}
        <div className="overflow-y-auto divide-y divide-border-flow/40 flex-1 min-h-0">
          {filtered.length === 0 ? (
            <div className="p-8 flex flex-col items-center justify-center text-center gap-2 text-text-muted select-none">
              <Bell className="w-8 h-8 text-text-muted/50" />
              <span className="text-ui-xs">Nothing here — you're all caught up.</span>
            </div>
          ) : (
            filtered.map((n) => {
              const isUnread = !readIds.has(n.id);
              const meta = TYPE_META[n.type] || TYPE_META.connector;
              const Icon = meta.icon;

              return (
                <div
                  key={n.id}
                  onClick={() => handleClick(n)}
                  className={`px-4 py-3 flex gap-3 items-start cursor-pointer transition-colors hover:bg-bg-hover group ${
                    isUnread ? "bg-bg-secondary/30" : ""
                  }`}
                >
                  {/* Icon */}
                  <div className={`mt-0.5 p-1.5 rounded-lg shrink-0 ${meta.bg}`}>
                    <Icon className={`w-3.5 h-3.5 ${meta.color}`} />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0 space-y-0.5">
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={`text-ui-sm truncate ${
                          isUnread ? "font-bold text-text-primary" : "font-medium text-text-secondary"
                        }`}
                      >
                        {n.title}
                      </span>
                      <span className="text-[9px] text-text-muted shrink-0">
                        {relativeTime(n.time)}
                      </span>
                    </div>
                    <p className="text-ui-xs text-text-secondary leading-snug line-clamp-2">
                      {n.body}
                    </p>
                    {n.priority === "critical" && (
                      <span className="inline-block text-[9px] font-semibold text-critical bg-critical/10 px-1.5 py-0.5 rounded mt-0.5">
                        CRITICAL
                      </span>
                    )}
                  </div>

                  {/* Unread dot */}
                  {isUnread && (
                    <span className="mt-1.5 w-2 h-2 rounded-full bg-flow-purple shrink-0" />
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2.5 border-t border-border-flow/40 bg-bg-secondary/40 shrink-0">
          <button
            onClick={() => { navigate("/timeline"); onClose(); }}
            className="text-[10px] font-semibold text-flow-purple hover:underline cursor-pointer w-full text-center"
          >
            View full AI Activity Timeline →
          </button>
        </div>
      </div>
    </>
  );
};

export default NotificationDropdown;
