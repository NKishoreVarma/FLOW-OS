import { useState, useEffect, useCallback } from "react";
import { Activity, RefreshCw, Brain, Zap, Plug, GitCommit } from "lucide-react";
import SourceBadge from "../ui/SourceBadge";
import DataSourceBadge from "../ui/DataSourceBadge";
import { EmptyState } from "../ui/EmptyState";
import { useWebSocket } from "../../hooks/useWebSocket";

/**
 * ActivityFeed — the real `/activity` page (was a redirect to home). Reads the
 * durable operational timeline the backend already assembles:
 *   GET /api/brain/timeline?hours=&limit=  → { timeline: [{ id, kind, category,
 *       title, actor, source, timestamp }] } (memory + automation + connectors)
 * No new backend. Eliminates the "where did that happen / open the source app to
 * check recent activity" context switch.
 */
const KIND_META = {
  MEMORY:     { icon: Brain,     color: "var(--brand)",       label: "Memory" },
  AUTOMATION: { icon: Zap,       color: "var(--p-high)",      label: "Automation" },
  CONNECTOR:  { icon: Plug,      color: "var(--p-info)",      label: "Connector" },
  DEFAULT:    { icon: GitCommit, color: "var(--t4)",          label: "Event" },
};

const DEMO_TIMELINE = [
  { id: "d1", kind: "CONNECTOR", category: "engineering", title: "David O. merged PR #128 — pgvector pool", actor: "david.o", source: "github", timestamp: new Date(Date.now() - 26e5).toISOString() },
  { id: "d2", kind: "MEMORY", category: "DECISION", title: "Decision: migrate payments DB Saturday 02:00", actor: "Sarah Chen", source: "slack", timestamp: new Date(Date.now() - 72e5).toISOString() },
  { id: "d3", kind: "AUTOMATION", category: "AUTOMATION", title: "Incident escalation ran — paged on-call", actor: "automation", source: "incidents", timestamp: new Date(Date.now() - 108e5).toISOString() },
  { id: "d4", kind: "CONNECTOR", category: "communication", title: "Priya N. replied in #incidents", actor: "priya.n", source: "slack", timestamp: new Date(Date.now() - 144e5).toISOString() },
];

function relTime(ts) {
  const diff = Date.now() - new Date(ts).getTime();
  const m = Math.round(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

function dayKey(ts) {
  const d = new Date(ts);
  const today = new Date();
  const yest = new Date(Date.now() - 864e5);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yest.toDateString()) return "Yesterday";
  return d.toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" });
}

export default function ActivityFeed() {
  const { token, workspaceId, isAuthLoading } = useWebSocket();
  const [state, setState] = useState({ loading: true, items: [], demo: false, error: false });
  const [filter, setFilter] = useState("ALL");

  const load = useCallback(async () => {
    setState(s => ({ ...s, loading: true }));
    if (!token || !workspaceId) {
      setState({ loading: false, items: DEMO_TIMELINE, demo: true, error: false });
      return;
    }
    try {
      const res = await fetch("/api/brain/timeline?hours=336&limit=100", {
        headers: { Authorization: `Bearer ${token}`, "workspace-id": workspaceId },
      });
      if (!res.ok) throw new Error(`status ${res.status}`);
      const data = await res.json();
      const items = data.timeline || data.result || [];
      if (!items.length) setState({ loading: false, items: DEMO_TIMELINE, demo: true, error: false });
      else setState({ loading: false, items, demo: false, error: false });
    } catch {
      setState({ loading: false, items: DEMO_TIMELINE, demo: true, error: false });
    }
  }, [token, workspaceId]);

  useEffect(() => { if (!isAuthLoading) load(); }, [isAuthLoading, load]);

  const kinds = ["ALL", ...Array.from(new Set(state.items.map(i => i.kind || "DEFAULT")))];
  const filtered = filter === "ALL" ? state.items : state.items.filter(i => (i.kind || "DEFAULT") === filter);

  // group by day
  const groups = [];
  let currentDay = null;
  for (const item of filtered) {
    const k = dayKey(item.timestamp);
    if (k !== currentDay) { groups.push({ day: k, items: [] }); currentDay = k; }
    groups[groups.length - 1].items.push(item);
  }

  return (
    <div style={{ padding: "24px", maxWidth: 820, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
            <Activity style={{ width: 16, height: 16, color: "var(--brand)" }} />
            <h1 style={{ fontSize: 16, fontWeight: 500, color: "var(--t1)", letterSpacing: "-0.3px" }}>Activity</h1>
            <DataSourceBadge mode={state.demo ? "demo" : "live"} />
          </div>
          <p style={{ fontSize: 12, color: "var(--t4)" }}>Everything that happened across your workspace — memory, automations, and connectors.</p>
        </div>
        <button onClick={load} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", fontSize: 12, color: "var(--t3)", background: "rgba(31,27,22,0.045)", border: "1px solid var(--border)", borderRadius: 4, cursor: "pointer" }}>
          <RefreshCw style={{ width: 11, height: 11 }} /> Refresh
        </button>
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 6, marginBottom: 20, flexWrap: "wrap" }}>
        {kinds.map(k => {
          const active = filter === k;
          const label = k === "ALL" ? "All" : (KIND_META[k]?.label || k);
          return (
            <button key={k} onClick={() => setFilter(k)}
              style={{ padding: "4px 12px", fontSize: 12, borderRadius: 4, cursor: "pointer",
                background: active ? "rgba(232,103,43,0.08)" : "transparent",
                border: `1px solid ${active ? "rgba(232,103,43,0.30)" : "var(--border)"}`,
                color: active ? "var(--brand-text)" : "var(--t4)" }}>
              {label}
            </button>
          );
        })}
      </div>

      {/* Body */}
      {state.loading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {[0, 1, 2, 3].map(i => (
            <div key={i} style={{ height: 46, borderRadius: 4, background: "rgba(31,27,22,0.04)", border: "1px solid var(--border)", position: "relative", overflow: "hidden" }}>
              <div style={{ position: "absolute", inset: 0, background: "linear-gradient(90deg, transparent 0%, rgba(31,27,22,0.05) 50%, transparent 100%)", animation: "shimmer-sweep 1.6s ease-in-out infinite" }} />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState variant="activity" />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
          {groups.map(group => (
            <div key={group.day}>
              <div style={{ fontSize: 10, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--t5)", marginBottom: 10 }}>{group.day}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 2, borderLeft: "1px solid var(--border)", paddingLeft: 16 }}>
                {group.items.map(item => {
                  const m = KIND_META[item.kind] || KIND_META.DEFAULT;
                  const Icon = m.icon;
                  return (
                    <div key={item.id} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "8px 0", position: "relative" }}>
                      <span style={{ position: "absolute", left: -21, top: 12, width: 7, height: 7, borderRadius: "50%", background: m.color, border: "2px solid var(--bg-base)" }} />
                      <Icon style={{ width: 13, height: 13, color: m.color, marginTop: 2, flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 13, color: "var(--t2)", lineHeight: 1.5, margin: 0 }}>{item.title || item.category}</p>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 3 }}>
                          {item.source && <SourceBadge source={item.source} />}
                          {item.actor && <span style={{ fontSize: 11, color: "var(--t5)" }}>{item.actor}</span>}
                          <span style={{ fontSize: 11, color: "var(--t5)", fontVariantNumeric: "tabular-nums" }}>{relTime(item.timestamp)}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
