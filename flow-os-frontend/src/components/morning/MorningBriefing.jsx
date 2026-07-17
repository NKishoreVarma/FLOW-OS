import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Sun, RefreshCw, Radio, CheckCircle2, Clock, ArrowRight, Eye, CornerUpLeft,
  Calendar, GitMerge, ShieldCheck, TrendingDown, Activity, Sparkles, Bell,
} from "lucide-react";
import DataSourceBadge from "../ui/DataSourceBadge";
import ConversationInput from "../brain/ConversationInput";
import { useWebSocket } from "../../hooks/useWebSocket";

/**
 * MorningBriefing (/) — "The Perfect Morning" (Sprint 1). The most important screen in
 * FLOW: it should feel like a Chief of Staff already did the work. Reads the instant
 * Workspace Intelligence Cache (department health + recent activity + approvals + live
 * feed seed) plus a real-time WebSocket feed. No expensive reasoning on this screen.
 */
function authHeaders() {
  const token = localStorage.getItem("flow_os_token") || "";
  const workspaceId = localStorage.getItem("flow_os_workspace_id") || "workspace_corp_alpha";
  return { Authorization: `Bearer ${token}`, "workspace-id": workspaceId, "Content-Type": "application/json" };
}
async function getJSON(p) { const r = await fetch(p, { headers: authHeaders() }); if (!r.ok) throw new Error(String(r.status)); return r.json(); }

function trackPilot(event, properties = {}) {
  const token = localStorage.getItem("flow_os_token") || "";
  const wsId = localStorage.getItem("flow_os_workspace_id") || "";
  if (!token || !wsId) return;
  fetch("/api/analytics/event", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "workspace-id": wsId, "Content-Type": "application/json" },
    body: JSON.stringify({ event, properties }),
  }).catch(() => { /* fire-and-forget */ });
}

const DEPT_META = {
  engineering: { label: "Engineering", icon: GitMerge },
  sales:       { label: "Sales",       icon: TrendingDown },
  operations:  { label: "Operations",  icon: Activity },
  security:    { label: "Security",     icon: ShieldCheck },
};
const CORE = ["engineering", "sales", "operations", "security"];
const STATUS = {
  healthy: { dot: "var(--p-normal)", word: "Healthy", color: "var(--p-normal-text)" },
  watch:   { dot: "var(--p-high)",   word: "Attention", color: "var(--p-high-text)" },
  at_risk: { dot: "var(--p-critical)", word: "At risk", color: "var(--p-critical-text)" },
  ready:   { dot: "var(--p-normal)", word: "Ready", color: "var(--p-normal-text)" },
  unknown: { dot: "var(--t5)",       word: "—", color: "var(--t5)" },
};

const DEMO_SNAP = {
  domains: {
    engineering: { status: "healthy", recentActivity: [{ title: "PR #447 merged" }, { title: "CI passed" }, { title: "Deployment queued" }], topRisks: [] },
    sales:       { status: "watch", recentActivity: [{ title: "TechCorp renewal at risk" }, { title: "VP emailed 2 hours ago" }], topRisks: ["TechCorp renewal at risk"] },
    operations:  { status: "healthy", recentActivity: [{ title: "Standup in 14 min" }, { title: "Yesterday's action items complete" }], topRisks: [] },
    security:    { status: "healthy", recentActivity: [{ title: "No open alerts" }], topRisks: [] },
  },
  recent: [
    { title: "Rahul resolved a merge conflict", source: "github", at: new Date(Date.now() - 6e5).toISOString() },
    { title: "CI completed", source: "github", at: new Date(Date.now() - 9e5).toISOString() },
    { title: "Deployment queued", source: "github", at: new Date(Date.now() - 12e5).toISOString() },
    { title: "Meeting starts in 14 minutes", source: "calendar", at: new Date().toISOString() },
  ],
  counts: { pendingApprovals: 2 },
};
const DEMO_FOCUS = [
  { icon: Eye, text: "Review Auth PR", kind: "pr" },
  { icon: CornerUpLeft, text: "Reply to TechCorp", kind: "email" },
  { icon: Calendar, text: "Standup", kind: "meeting" },
];

function greeting() {
  const h = new Date().getHours();
  const name = localStorage.getItem("flow_user_name") || (localStorage.getItem("flow_user_email") || "").split("@")[0] || "there";
  const part = h < 12 ? "Good Morning" : h < 18 ? "Good Afternoon" : "Good Evening";
  return `${part}, ${name.charAt(0).toUpperCase() + name.slice(1)}`;
}
function relTime(ts) {
  if (!ts) return "";
  const m = Math.round((Date.now() - new Date(ts).getTime()) / 60000);
  if (m < 1) return "now"; if (m < 60) return `${m}m`; const h = Math.round(m / 60); if (h < 24) return `${h}h`; return `${Math.round(h / 24)}d`;
}
function friendlyEvent(ev) {
  const d = ev.payload || ev.data || {};
  const map = {
    NOTIFICATION_CREATED: d.title || "New notification",
    INCIDENT_CREATED: "Incident detected",
    RISK_DETECTED: "Risk signal",
    INTEL_STORED: d.channel ? `New intel from ${d.channel}` : "New intelligence captured",
    EXECUTION_COMPLETED: d.title || "Action executed",
    ACTION_EXECUTED: d.title || "Action executed",
  };
  return map[ev.type] || (ev.type || "Event").replace(/_/g, " ").toLowerCase();
}

export default function MorningBriefing() {
  const { isAuthLoading, events } = useWebSocket();
  const navigate = useNavigate();
  const [snap, setSnap] = useState({ loading: true, data: null, demo: false });
  const [focus, setFocus] = useState({ loading: true, items: [], demo: false });

  const loadSnap = useCallback(async function load(retried) {
    const t0 = Date.now();
    try {
      const s = await getJSON("/api/workspace/snapshot");
      if (s.status === "building" || !s.domains) {
        setSnap({ loading: false, data: DEMO_SNAP, demo: true });
        if (!retried) setTimeout(() => load(true), 3000);
        return;
      }
      setSnap({ loading: false, data: s, demo: false });
      trackPilot("morning_brief.loaded", { loadTimeMs: Date.now() - t0 });
    } catch {
      setSnap({ loading: false, data: DEMO_SNAP, demo: true });
      trackPilot("morning_brief.failed", { errorCode: "FETCH_ERROR" });
    }
  }, []);

  // Today's Focus IS the Adaptive Workday Engine's queue — "what should I do next?",
  // priority-ordered (NOW/NEXT/LATER), not a list of everything that happened.
  const loadFocus = useCallback(async () => {
    try {
      const q = await getJSON("/api/workday/queue");
      const ordered = [...(q.now || []), ...(q.next || []), ...(q.later || [])];
      if (!ordered.length) { setFocus({ loading: false, items: DEMO_FOCUS, demo: true, ignored: 0 }); return; }
      const items = ordered.slice(0, 5).map((c) => ({
        text: c.title, subtitle: c.subtitle || c.reasons?.[0] || "", route: c.actionRoute || "/inbox",
        tier: q.now.includes(c) ? "NOW" : q.next.includes(c) ? "NEXT" : "LATER",
        icon: /project|pr|conflict/i.test(c.type) ? GitMerge : /meeting/i.test(c.type) ? Calendar : /approval/i.test(c.type) ? CheckCircle2 : ArrowRight,
      }));
      setFocus({ loading: false, items, demo: false, ignored: q.ignoredCount || 0 });
    } catch { setFocus({ loading: false, items: DEMO_FOCUS, demo: true, ignored: 0 }); }
  }, []);

  useEffect(() => {
    if (!isAuthLoading) {
      trackPilot("session.start");
      loadSnap();
      loadFocus();
    }
  }, [isAuthLoading, loadSnap, loadFocus]);

  const askBrain = (q) => { sessionStorage.setItem("flow_pending_ask", q); navigate("/brain"); };
  const doFocus = (item) => {
    if (item.route) navigate(item.route);
    else if (item.kind === "email") window.dispatchEvent(new CustomEvent("flow:open-compose"));
    else askBrain(item.text);
  };

  const data = snap.data || DEMO_SNAP;
  const approvals = data.counts?.pendingApprovals ?? 0;
  // Live feed: real-time WS events first, then the cache's recent seed.
  const liveWs = (events || []).slice(0, 5).map((e, i) => ({ id: `ws-${e.id || i}`, text: friendlyEvent(e), at: null, live: true }));
  const liveSeed = (data.recent || []).map((r, i) => ({ id: `seed-${i}`, text: r.title, at: r.at, source: r.source }));
  const live = [...liveWs, ...liveSeed].slice(0, 6);

  return (
    <div style={{ padding: "28px 24px 40px", maxWidth: 900, margin: "0 auto", display: "flex", flexDirection: "column", gap: 26 }}>
      {/* Greeting */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
          <Sun style={{ width: 22, height: 22, color: "var(--p-high)" }} />
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 600, color: "var(--t1)", letterSpacing: "-0.5px", lineHeight: 1 }}>{greeting()} 👋</h1>
            <p style={{ fontSize: 12, color: "var(--t5)", marginTop: 5 }}>
              {new Date().toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" })} · Here's your morning.
            </p>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <DataSourceBadge mode={snap.demo ? "demo" : "live"} />
          <button onClick={() => { loadSnap(); loadFocus(); }} title="Refresh" style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 11px", fontSize: 12, color: "var(--t4)", background: "rgba(255,255,255,0.03)", border: "1px solid var(--border)", borderRadius: 5, cursor: "pointer" }}>
            <RefreshCw style={{ width: 11, height: 11 }} />
          </button>
        </div>
      </div>

      {/* Department Health — the "someone already did the work" grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 14 }}>
        {snap.loading
          ? CORE.map((d) => <CardSkeleton key={d} />)
          : CORE.map((d) => <DeptCard key={d} id={d} card={data.domains?.[d]} onAsk={askBrain} />)}
      </div>

      {/* Approvals + Live Workspace */}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1.4fr)", gap: 14, alignItems: "start" }}>
        {/* Approvals */}
        <button onClick={() => navigate("/inbox")}
          style={{ textAlign: "left", cursor: "pointer", background: approvals > 0 ? "rgba(124,110,255,0.06)" : "var(--bg-card)", border: `1px solid ${approvals > 0 ? "var(--brand-line)" : "var(--border)"}`, borderRadius: 10, padding: "18px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <CheckCircle2 style={{ width: 14, height: 14, color: "var(--brand)" }} />
            <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--t5)" }}>Approvals</span>
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <span style={{ fontSize: 30, fontWeight: 700, color: approvals > 0 ? "var(--brand-text)" : "var(--t3)", lineHeight: 1 }}>{approvals}</span>
            <span style={{ fontSize: 13, color: "var(--t4)" }}>{approvals === 1 ? "waiting" : "waiting"}</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "var(--brand-text)", marginTop: 10 }}>
            {approvals > 0 ? "Review now" : "You're clear"} <ArrowRight style={{ width: 10, height: 10 }} />
          </div>
        </button>

        {/* Live Workspace */}
        <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 10, padding: "16px 18px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 12 }}>
            <Radio style={{ width: 13, height: 13, color: "var(--p-normal)" }} />
            <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--t5)" }}>Live Workspace</span>
            <span style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--p-normal)", animation: "pulse-dot 1.4s ease-in-out infinite" }} />
          </div>
          {live.length === 0 ? (
            <p style={{ fontSize: 12, color: "var(--t5)" }}>Quiet so far this morning.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
              {live.map((e) => (
                <div key={e.id} style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 12.5, color: "var(--t2)" }}>
                  <span style={{ width: 5, height: 5, borderRadius: "50%", background: e.live ? "var(--p-normal)" : "var(--t5)", flexShrink: 0 }} />
                  <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.text}</span>
                  {e.at && <span style={{ fontSize: 10, color: "var(--t5)", flexShrink: 0 }}>{relTime(e.at)}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Today's Focus */}
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 12 }}>
          <Clock style={{ width: 13, height: 13, color: "var(--brand)" }} />
          <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--t5)" }}>Today's Focus</span>
        </div>
        {focus.loading ? <CardSkeleton h={44} /> : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {focus.items.map((item, i) => {
              const Icon = item.icon || ArrowRight;
              const tierColor = item.tier === "NOW" ? "var(--p-critical-text)" : item.tier === "NEXT" ? "var(--p-high-text)" : "var(--t5)";
              return (
                <button key={i} onClick={() => doFocus(item)}
                  style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 8, cursor: "pointer", textAlign: "left", transition: "border-color 100ms" }}
                  onMouseEnter={(e) => e.currentTarget.style.borderColor = "var(--brand-line)"}
                  onMouseLeave={(e) => e.currentTarget.style.borderColor = "var(--border)"}>
                  <span style={{ width: 22, height: 22, borderRadius: 6, background: "rgba(124,110,255,0.08)", border: "1px solid var(--brand-line)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: "var(--brand-text)", flexShrink: 0 }}>{i + 1}</span>
                  <Icon style={{ width: 14, height: 14, color: "var(--t4)", flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 500, color: "var(--t1)" }}>{item.text}</div>
                    {item.subtitle && <div style={{ fontSize: 11.5, color: "var(--t4)", marginTop: 2 }}>{item.subtitle}</div>}
                  </div>
                  {item.tier && <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.06em", color: tierColor, flexShrink: 0 }}>{item.tier}</span>}
                  <ArrowRight style={{ width: 13, height: 13, color: "var(--t5)" }} />
                </button>
              );
            })}
            {focus.ignored > 0 && (
              <div style={{ fontSize: 11.5, color: "var(--t5)", padding: "4px 2px", fontStyle: "italic" }}>
                FLOW handled the rest — you can safely ignore {focus.ignored} other event{focus.ignored !== 1 ? "s" : ""}.
              </div>
            )}
          </div>
        )}
      </div>

      {/* Ask FLOW */}
      <div style={{ marginTop: 4 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 10 }}>
          <Sparkles style={{ width: 13, height: 13, color: "var(--brand)" }} />
          <span style={{ fontSize: 12, color: "var(--t3)", fontStyle: "italic" }}>What should we tackle next, {(localStorage.getItem("flow_user_name") || "").split(" ")[0] || "?"}</span>
        </div>
        <ConversationInput onSubmit={askBrain} isLoading={false} />
      </div>
    </div>
  );
}

function DeptCard({ id, card, onAsk }) {
  const meta = DEPT_META[id] || { label: id, icon: Activity };
  const Icon = meta.icon;
  const st = STATUS[card?.status] || STATUS.unknown;
  const bullets = (card?.recentActivity?.length ? card.recentActivity.map((a) => a.title) : (card?.topRisks || [])).slice(0, 3);
  const clean = bullets.filter(Boolean);
  return (
    <button onClick={() => onAsk(`Give me the ${meta.label.toLowerCase()} status in detail.`)}
      style={{ textAlign: "left", cursor: "pointer", background: "var(--bg-card)", border: "1px solid var(--border)", borderLeft: `2px solid ${st.dot}`, borderRadius: 10, padding: "16px 18px", transition: "border-color 100ms" }}
      onMouseEnter={(e) => e.currentTarget.style.borderColor = "var(--border-strong)"}
      onMouseLeave={(e) => e.currentTarget.style.borderColor = "var(--border)"}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 11 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <Icon style={{ width: 15, height: 15, color: "var(--t3)" }} />
          <span style={{ fontSize: 14, fontWeight: 600, color: "var(--t1)" }}>{meta.label}</span>
        </div>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 600, color: st.color }}>
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: st.dot }} /> {st.word}
        </span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        {clean.length ? clean.map((b, i) => (
          <div key={i} style={{ display: "flex", alignItems: "baseline", gap: 7, fontSize: 12.5, color: "var(--t3)" }}>
            <span style={{ color: st.dot, flexShrink: 0 }}>•</span>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b}</span>
          </div>
        )) : <span style={{ fontSize: 12, color: "var(--t5)" }}>All clear.</span>}
      </div>
    </button>
  );
}

function CardSkeleton({ h = 128 }) {
  return (
    <div style={{ height: h, borderRadius: 10, background: "rgba(255,255,255,0.02)", border: "1px solid var(--border)", position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.04) 50%, transparent)", animation: "shimmer-sweep 1.6s ease-in-out infinite" }} />
    </div>
  );
}
