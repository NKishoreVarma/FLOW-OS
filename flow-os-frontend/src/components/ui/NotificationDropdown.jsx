import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { X, Bell, Zap, AlertTriangle, CheckCircle, Info, Plug, Brain } from "lucide-react";
import { useWebSocket } from "../../hooks/useWebSocket";

const TABS = ["All", "Action Required", "Incidents", "AI Insights"];

const TAB_FILTER = {
  "All":             () => true,
  "Action Required": (n) => n.type === "approval" || n.priority === "critical",
  "Incidents":       (n) => n.type === "incident",
  "AI Insights":     (n) => n.type === "recommendation" || n.type === "ai_insight",
};

const TYPE_META = {
  recommendation: { icon: Brain,         color: "var(--brand-text)",      bg: "rgba(232,103,43,0.10)" },
  approval:       { icon: CheckCircle,   color: "var(--p-high-text)",     bg: "rgba(255,151,65,0.10)"  },
  incident:       { icon: AlertTriangle, color: "var(--p-critical-text)", bg: "rgba(255,87,87,0.10)"   },
  connector:      { icon: Plug,          color: "var(--p-info-text)",     bg: "rgba(96,165,250,0.10)"  },
  ai_insight:     { icon: Zap,           color: "var(--p-normal-text)",   bg: "rgba(76,175,130,0.10)"  },
};

const DEMO_NOTIFICATIONS = [
  { id: "demo-1", type: "recommendation", title: "Deploy Review Needed",      body: "3 PRs are ready for merge but awaiting final review.",       href: "/projects",        time: new Date(Date.now() - 5 * 60000),  priority: "high"     },
  { id: "demo-2", type: "incident",       title: "Database Latency Spike",    body: "pgvector queries exceeding 500ms threshold.",                  href: "/platform/health", time: new Date(Date.now() - 12 * 60000), priority: "critical" },
  { id: "demo-3", type: "ai_insight",    title: "Weekly Intelligence Ready", body: "Your AI briefing for this week is ready.",                    href: "/briefing",        time: new Date(Date.now() - 30 * 60000), priority: "medium"   },
  { id: "demo-4", type: "connector",     title: "GitHub Sync Complete",      body: "Synced 24 commits and 6 PRs to FLOW intelligence.",           href: "/projects",        time: new Date(Date.now() - 60 * 60000), priority: "low"      },
  { id: "demo-5", type: "approval",      title: "Approval Required",         body: 'Action "send_email" to sales@acme.com requires your approval.',href: "/",                time: new Date(Date.now() - 3 * 60000),  priority: "high"     },
];

function relativeTime(date) {
  const diff = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export const NotificationDropdown = ({ isOpen, onClose }) => {
  const navigate = useNavigate();
  const { token, workspaceId, events } = useWebSocket();

  const [notifications, setNotifications] = useState([]);
  const [readIds, setReadIds]             = useState(new Set());
  const [activeTab, setActiveTab]         = useState("All");
  const fetchedRef = useRef(false);

  const addNotification = useCallback((n) => {
    setNotifications((prev) => {
      if (prev.some((x) => x.id === n.id)) return prev;
      return [n, ...prev];
    });
  }, []);

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;

    const headers = {
      Authorization: `Bearer ${token || localStorage.getItem("flow_token") || ""}`,
      "workspace-id": workspaceId || localStorage.getItem("flow_workspace_id") || "",
      "Content-Type": "application/json",
    };

    let loadedAny = false;

    const numToLabel = (p) => (p >= 80 ? "critical" : p >= 65 ? "high" : p >= 45 ? "medium" : "low");
    const hrefForNotif = (t) => (/MERGE_CONFLICT|CI_FAILED/i.test(t) ? "/projects" : /APPROVAL/i.test(t) ? "/" : "/activity");
    const typeForNotif = (t) => (/MERGE_CONFLICT|CI_FAILED|INCIDENT/i.test(t) ? "incident" : /APPROVAL/i.test(t) ? "approval" : "ai_insight");

    Promise.allSettled([
      fetch("/api/brain/recommendations", { headers }).then(r => r.ok ? r.json() : Promise.reject(r.status)),
      fetch("/api/approvals",             { headers }).then(r => r.ok ? r.json() : Promise.reject(r.status)),
      fetch("/api/notifications?limit=20", { headers }).then(r => r.ok ? r.json() : Promise.reject(r.status)),
    ]).then(([recResult, appResult, notifResult]) => {
      if (notifResult?.status === "fulfilled") {
        const notifs = Array.isArray(notifResult.value?.notifications) ? notifResult.value.notifications : [];
        notifs.slice(0, 20).forEach(n => {
          addNotification({ id: `nf-${n.id}`, type: typeForNotif(n.type), title: n.title, body: n.body || "", href: hrefForNotif(n.type), time: new Date(n.createdAt || Date.now()), priority: numToLabel(n.priority || 50) });
          loadedAny = true;
        });
      }
      if (recResult.status === "fulfilled") {
        const recs = Array.isArray(recResult.value?.recommendations) ? recResult.value.recommendations : Array.isArray(recResult.value) ? recResult.value : [];
        recs.slice(0, 10).forEach(rec => {
          addNotification({ id: `rec-${rec.id || rec.recommendationId || Math.random()}`, type: "recommendation", title: rec.title || rec.action || "AI Recommendation", body: rec.description || rec.reasoning || rec.body || "", href: "/", time: new Date(rec.createdAt || rec.timestamp || Date.now()), priority: rec.priority || "medium" });
          loadedAny = true;
        });
      }
      if (appResult.status === "fulfilled") {
        const apps = Array.isArray(appResult.value?.approvals) ? appResult.value.approvals : Array.isArray(appResult.value) ? appResult.value : [];
        apps.slice(0, 10).forEach(ap => {
          addNotification({ id: `ap-${ap.id || ap.approvalId || Math.random()}`, type: "approval", title: "Approval Required", body: ap.description || ap.reason || `Action "${ap.action || ap.actionType}" requires your approval.`, href: "/", time: new Date(ap.createdAt || ap.requestedAt || Date.now()), priority: "high" });
          loadedAny = true;
        });
      }
      if (!loadedAny) DEMO_NOTIFICATIONS.forEach(n => addNotification(n));
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addNotification]);

  useEffect(() => {
    if (!events) return;
    const recent = events.slice(-5);
    for (const ev of recent) {
      if (ev.type === "INCIDENT_CREATED") {
        addNotification({ id: `ws-incident-${ev.id || Date.now()}`, type: "incident", title: "Incident Detected", body: ev.data?.description || ev.data?.text || "A new incident was detected.", href: "/timeline", time: new Date(), priority: "critical" });
      } else if (ev.type === "RISK_DETECTED") {
        addNotification({ id: `ws-risk-${ev.id || Date.now()}`, type: "incident", title: "Risk Signal", body: ev.data?.text || "A risk signal was detected.", href: "/timeline", time: new Date(), priority: "high" });
      } else if (ev.type === "INTEL_STORED") {
        addNotification({ id: `ws-intel-${ev.id || Date.now()}`, type: "ai_insight", title: "Intelligence Captured", body: ev.data?.channel ? `New intel from ${ev.data.channel}` : "New operational intelligence captured.", href: "/", time: new Date(), priority: "medium" });
      } else if (ev.type === "NOTIFICATION_CREATED") {
        const d = ev.payload || ev.data || {};
        const isConflict = /MERGE_CONFLICT|CI_FAILED/i.test(d.type || "");
        addNotification({ id: `ws-nf-${d.id || ev.id || Date.now()}`, type: isConflict ? "incident" : /APPROVAL/i.test(d.type || "") ? "approval" : "ai_insight", title: d.title || "Notification", body: d.body || "", href: isConflict ? "/projects" : "/activity", time: new Date(), priority: (d.priority || 50) >= 80 ? "critical" : (d.priority || 50) >= 65 ? "high" : "medium" });
      }
    }
  }, [events, addNotification]);

  const filtered    = notifications.filter(TAB_FILTER[activeTab] || (() => true));
  const unreadCount = notifications.filter(n => !readIds.has(n.id)).length;
  const markRead    = (id) => setReadIds(prev => new Set([...prev, id]));
  const markAllRead = () => setReadIds(new Set(notifications.map(n => n.id)));

  const handleClick = (n) => { markRead(n.id); navigate(n.href); onClose(); };

  if (!isOpen) return null;

  return (
    <>
      <div style={{ position: "fixed", inset: 0, zIndex: 40 }} onClick={onClose} />

      <div style={{ position: "absolute", right: 0, top: "100%", marginTop: 8, width: 360, background: "var(--bg-sidebar)", border: "1px solid var(--border-strong)", borderRadius: 6, boxShadow: "0 20px 60px rgba(31,27,22,0.12)", zIndex: 50, overflow: "hidden", maxHeight: "80vh", display: "flex", flexDirection: "column" }}>

        {/* Header */}
        <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", background: "rgba(31,27,22,0.01)", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Bell style={{ width: 12, height: 12, color: "var(--t4)" }} />
            <span style={{ fontSize: 12, fontWeight: 500, color: "var(--t1)" }}>Notifications</span>
            {unreadCount > 0 && (
              <span style={{ fontSize: 9, fontWeight: 500, color: "var(--brand-text)", background: "rgba(232,103,43,0.10)", border: "1px solid rgba(232,103,43,0.22)", padding: "2px 6px", borderRadius: 3 }}>
                {unreadCount} New
              </span>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {unreadCount > 0 && (
              <button onClick={markAllRead} style={{ fontSize: 10, fontWeight: 500, color: "var(--brand-text)", background: "none", border: "none", cursor: "pointer" }}>
                Mark all read
              </button>
            )}
            <button onClick={onClose} style={{ padding: "3px", borderRadius: 3, background: "none", border: "none", color: "var(--t5)", cursor: "pointer", display: "flex" }}>
              <X style={{ width: 12, height: 12 }} />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ padding: "6px 8px", borderBottom: "1px solid var(--border)", background: "rgba(31,27,22,0.005)", display: "flex", gap: 4, overflowX: "auto", flexShrink: 0 }}>
          {TABS.map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{ padding: "3px 8px", borderRadius: 3, fontSize: 10, fontWeight: 500, cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0, transition: "all 80ms",
                background: activeTab === tab ? "rgba(232,103,43,0.10)" : "transparent",
                color:      activeTab === tab ? "var(--brand-text)" : "var(--t4)",
                border:     activeTab === tab ? "1px solid rgba(232,103,43,0.22)" : "1px solid transparent",
              }}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* List */}
        <div style={{ overflowY: "auto", flex: 1, minHeight: 0 }}>
          {filtered.length === 0 ? (
            <div style={{ padding: 32, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, color: "var(--t5)", textAlign: "center" }}>
              <Bell style={{ width: 28, height: 28, opacity: 0.3 }} />
              <span style={{ fontSize: 12, fontWeight: 300 }}>Nothing here — you're all caught up.</span>
            </div>
          ) : (
            filtered.map((n) => {
              const isUnread = !readIds.has(n.id);
              const meta  = TYPE_META[n.type] || TYPE_META.connector;
              const Icon  = meta.icon;
              return (
                <NotifRow key={n.id} n={n} isUnread={isUnread} meta={meta} Icon={Icon} onClick={() => handleClick(n)} />
              );
            })
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: "8px 14px", borderTop: "1px solid var(--border)", background: "rgba(31,27,22,0.01)", textAlign: "center", flexShrink: 0 }}>
          <button
            onClick={() => { navigate("/timeline"); onClose(); }}
            style={{ fontSize: 10, fontWeight: 500, color: "var(--brand-text)", background: "none", border: "none", cursor: "pointer" }}
          >
            View full AI Activity Timeline →
          </button>
        </div>
      </div>
    </>
  );
};

function NotifRow({ n, isUnread, meta, Icon, onClick }) {
  const [h, setH] = useState(false);
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      style={{ padding: "10px 14px", display: "flex", gap: 10, alignItems: "flex-start", cursor: "pointer", background: h ? "var(--bg-hover)" : isUnread ? "rgba(31,27,22,0.015)" : "transparent", borderBottom: "1px solid var(--border)", transition: "background 80ms" }}
    >
      <div style={{ marginTop: 2, padding: 6, borderRadius: 5, flexShrink: 0, background: meta.bg }}>
        <Icon style={{ width: 12, height: 12, color: meta.color }} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 2 }}>
          <span style={{ fontSize: 12, color: "var(--t1)", fontWeight: isUnread ? 600 : 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{n.title}</span>
          <span style={{ fontSize: 9, color: "var(--t5)", flexShrink: 0 }}>{relativeTime(n.time)}</span>
        </div>
        <p style={{ fontSize: 11, color: "var(--t4)", lineHeight: 1.4, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{n.body}</p>
        {n.priority === "critical" && (
          <span style={{ display: "inline-block", marginTop: 3, fontSize: 9, fontWeight: 500, color: "var(--p-critical-text)", background: "rgba(255,87,87,0.08)", border: "1px solid rgba(255,87,87,0.22)", padding: "1px 5px", borderRadius: 3 }}>CRITICAL</span>
        )}
      </div>
      {isUnread && (
        <span style={{ marginTop: 6, width: 6, height: 6, borderRadius: "50%", background: "var(--brand)", flexShrink: 0 }} />
      )}
    </div>
  );
}

export default NotificationDropdown;
