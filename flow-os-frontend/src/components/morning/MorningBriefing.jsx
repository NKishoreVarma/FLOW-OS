import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { RefreshCw, ArrowRight } from "lucide-react";
import DataSourceBadge from "../ui/DataSourceBadge";
import { useWebSocket } from "../../hooks/useWebSocket";
import { isIntegrationEvent, eventSource, eventTitle, sourceDotColor, isCriticalEvent } from "../../lib/liveEvents";

/**
 * MorningBriefing (/) — the most important screen in FLOW: it should feel like a
 * Chief of Staff already did the work. Reads the instant Workspace Intelligence
 * Cache plus a real-time WebSocket feed. No expensive reasoning on this screen.
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
  engineering: { label: "Engineering", source: "GitHub" },
  sales:       { label: "Sales",       source: "Gmail" },
  operations:  { label: "Operations",  source: "Calendar" },
  security:    { label: "Security",    source: "FLOW" },
};
const CORE = ["engineering", "sales", "operations", "security"];
const STATUS = {
  healthy: { color: "var(--ok)" },
  ready:   { color: "var(--ok)" },
  watch:   { color: "var(--warn)",  word: "attention" },
  at_risk: { color: "var(--crit)",  word: "at risk" },
  unknown: { color: "var(--t4)",    word: "quiet" },
};

const DEMO_SNAP = {
  domains: {
    engineering: { status: "healthy", recentActivity: [{ title: "PR #447 merged 40 min ago" }, { title: "Deploy queued for staging" }], topRisks: [] },
    sales:       { status: "watch", recentActivity: [{ title: "TechCorp's VP emailed 2 hours ago" }], topRisks: ["TechCorp renewal is at risk"] },
    operations:  { status: "healthy", recentActivity: [{ title: "Standup in 14 minutes" }, { title: "Yesterday's action items are complete" }], topRisks: [] },
    security:    { status: "healthy", recentActivity: [{ title: "No open alerts in the last 24 hours" }], topRisks: [] },
  },
  recent: [
    { title: "Rahul commented on PR #447 — \"LGTM, merging\"", source: "github", at: new Date(Date.now() - 6e4).toISOString() },
    { title: "Sarah emailed TechCorp's VP — following up on the proposal", source: "gmail", at: new Date(Date.now() - 12e4).toISOString() },
    { title: "#engineering: deploy complete, staging is live", source: "slack", at: new Date(Date.now() - 24e4).toISOString() },
    { title: "Marcus opened FLOW-2847 — payment bug, P1", source: "jira", at: new Date(Date.now() - 108e4).toISOString() },
  ],
  counts: { pendingApprovals: 2 },
};
const DEMO_FOCUS = [
  { text: "Reply to TechCorp's VP", subtitle: "Sarah escalated — 22 hours pending", actionLabel: "Open draft" },
  { text: "Review PR #447 — Rahul is blocked", subtitle: "Merge readiness: 92%", actionLabel: "Open PR", route: "/projects" },
  { text: "Sprint planning at 2:00 PM", subtitle: "3 blockers unresolved", actionLabel: "View prep", route: "/meetings" },
];

function firstName() {
  const name = localStorage.getItem("flow_user_name") || (localStorage.getItem("flow_user_email") || "").split("@")[0] || "there";
  const first = name.split(/[\s._]+/)[0] || name;
  return first.charAt(0).toUpperCase() + first.slice(1);
}
function dayPart() {
  const h = new Date().getHours();
  return h < 12 ? "morning" : h < 18 ? "afternoon" : "evening";
}
function relTime(ts) {
  if (!ts) return "";
  const m = Math.round((Date.now() - new Date(ts).getTime()) / 60000);
  if (m < 1) return "just now"; if (m < 60) return `${m}m`; const h = Math.round(m / 60); if (h < 24) return `${h}h`; return `${Math.round(h / 24)}d`;
}
function sentence(s) {
  const t = String(s || "").trim();
  if (!t) return "";
  const cap = t.charAt(0).toUpperCase() + t.slice(1);
  return /[.!?]$/.test(cap) ? cap : `${cap}.`;
}
// The card shows the ONE most important signal as prose — risk first, then activity.
function buildSignal(card) {
  const risks = (card?.topRisks || []).filter(Boolean);
  const acts = (card?.recentActivity || []).map((a) => a?.title).filter(Boolean);
  const parts = [...risks, ...acts.filter((a) => !risks.includes(a))].slice(0, 2);
  if (!parts.length) return null;
  return parts.map(sentence).join(" ");
}

const LABEL_STYLE = {
  fontFamily: "var(--font-data)",
  fontSize: 10,
  fontWeight: 300,
  color: "var(--t4)",
  textTransform: "uppercase",
  letterSpacing: "0.08em",
};

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
      const q = await getJSON("/api/autonomous/chief-of-staff");
      const now    = q.now    || q.items?.filter((i) => i.priority === "now")  || [];
      const next   = q.next   || q.items?.filter((i) => i.priority === "next") || [];
      const later  = q.later  || q.items?.filter((i) => i.priority === "later")|| [];
      const ordered = [...now, ...next, ...later];
      if (!ordered.length) { setFocus({ loading: false, items: DEMO_FOCUS, demo: true, ignored: 0 }); return; }
      const items = ordered.slice(0, 5).map((c) => ({
        text: sentence(c.title).replace(/\.$/, ""),
        subtitle: c.subtitle || c.reasons?.[0] || "",
        route: c.actionRoute || "/inbox",
        actionLabel: /meeting/i.test(c.type) ? "View prep" : /approval/i.test(c.type) ? "Review" : /pr|conflict|project/i.test(c.type) ? "Open PR" : "Open",
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

  const askBrain = (q) => { window.dispatchEvent(new CustomEvent("flow:ask-brain", { detail: { question: q } })); };
  const doFocus = (item) => {
    if (item.route) navigate(item.route);
    else if (/reply|email|draft/i.test(item.text)) window.dispatchEvent(new CustomEvent("flow:open-compose"));
    else askBrain(item.text);
  };

  const data = snap.data || DEMO_SNAP;
  const approvals = data.counts?.pendingApprovals ?? 0;

  // Live feed: only real messages from real integrations — never system telemetry.
  const liveWs = (events || [])
    .filter(isIntegrationEvent)
    .slice(0, 5)
    .map((e, i) => ({
      id: `ws-${e.id || i}`,
      text: eventTitle(e),
      source: eventSource(e),
      critical: isCriticalEvent(e),
      at: null,
      live: true,
    }));
  const liveSeed = (data.recent || []).map((r, i) => ({
    id: `seed-${i}`,
    text: r.title,
    source: eventSource({ data: { source: r.source } }),
    at: r.at,
  }));
  const live = [...liveWs, ...liveSeed].slice(0, 6);

  const eyebrow = `${new Date().toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" })} · ${dayPart()}`;

  return (
    <div style={{ padding: "40px 32px 48px", maxWidth: 900, margin: "0 auto", display: "flex", flexDirection: "column", gap: 32, fontFamily: "var(--font-ui)" }}>

      {/* Greeting */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
        <div>
          <div style={{ ...LABEL_STYLE, marginBottom: 8 }}>{eyebrow}</div>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: 42, fontWeight: 500, color: "var(--t1)", letterSpacing: "-0.01em", lineHeight: 1.1, margin: "0 0 8px" }}>
            Good {dayPart()}, {firstName()}.
          </h1>
          <p style={{ fontSize: 13, fontWeight: 300, color: "var(--t3)", margin: 0 }}>
            FLOW has been watching. Here's what matters right now.
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
          <DataSourceBadge mode={snap.demo ? "demo" : "live"} />
          <button onClick={() => { loadSnap(); loadFocus(); }} title="Refresh"
            style={{ display: "flex", alignItems: "center", padding: "6px 10px", color: "var(--t3)", background: "transparent", border: "1px solid var(--line-1)", borderRadius: 6, cursor: "pointer" }}>
            <RefreshCw style={{ width: 11, height: 11 }} />
          </button>
        </div>
      </div>

      {/* Department signals */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 12 }}>
        {snap.loading
          ? CORE.map((d) => <CardSkeleton key={d} />)
          : CORE.map((d) => <DeptCard key={d} id={d} card={data.domains?.[d]} onAsk={askBrain} />)}
      </div>

      {/* Approvals + Live Workspace */}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1.4fr)", gap: 12, alignItems: "start" }}>

        {/* Approvals */}
        <button onClick={() => navigate("/inbox")}
          style={{
            textAlign: "left", cursor: "pointer",
            background: "var(--surface-2)",
            border: `1px solid ${approvals > 0 ? "var(--accent-line)" : "var(--line-1)"}`,
            borderRadius: 6, padding: 20,
          }}>
          <div style={{ ...LABEL_STYLE, marginBottom: 12 }}>Approvals</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <span style={{ fontFamily: "var(--font-data)", fontSize: 28, fontWeight: 300, color: approvals > 0 ? "var(--accent-text)" : "var(--t3)", lineHeight: 1 }}>{approvals}</span>
            <span style={{ fontSize: 13, fontWeight: 300, color: "var(--t3)" }}>waiting</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 4, fontFamily: "var(--font-data)", fontSize: 10, fontWeight: 300, color: approvals > 0 ? "var(--accent-text)" : "var(--t4)", marginTop: 12 }}>
            {approvals > 0 ? "Review now" : "Nothing needs you"} <ArrowRight style={{ width: 10, height: 10 }} />
          </div>
        </button>

        {/* Live Workspace — real integration messages only */}
        <section aria-label="Live Workspace Activity" style={{ background: "var(--surface-2)", border: "1px solid var(--line-1)", borderRadius: 6, padding: "16px 20px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 12 }}>
            <span style={LABEL_STYLE}>Live</span>
            <span style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--ok)", animation: "pulse-dot 2.5s ease-in-out infinite" }} />
          </div>
          {live.length === 0 ? (
            <p style={{ fontSize: 12, fontWeight: 300, color: "var(--t3)", margin: 0 }}>Quiet so far — no new messages from connected tools.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {live.map((e) => (
                <div key={e.id} style={{ display: "flex", alignItems: "flex-start", gap: 9 }}>
                  <span style={{
                    width: 5, height: 5, borderRadius: "50%", marginTop: 5, flexShrink: 0,
                    background: sourceDotColor(e.source, { critical: e.critical }),
                    ...(e.critical ? { animation: "pulse-dot 1s ease-in-out infinite" } : {}),
                  }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 300, color: "var(--t2)", lineHeight: 1.45, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.text}</div>
                    <div style={{ fontFamily: "var(--font-data)", fontSize: 10, fontWeight: 300, color: "var(--t4)", marginTop: 1 }}>
                      {e.source}{e.at ? ` · ${relTime(e.at)}` : e.live ? " · just now" : ""}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Today's Focus — NOW/NEXT/LATER priority items */}
      <section aria-label="Now — Priority Actions">
        <div style={{ ...LABEL_STYLE, marginBottom: 12 }}>Today's Focus</div>
        {focus.loading ? <CardSkeleton h={56} /> : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {focus.items.map((item, i) => <FocusItem key={i} item={item} rank={i + 1} onOpen={doFocus} />)}
            {focus.ignored > 0 && (
              <div style={{ fontSize: 11, fontWeight: 300, color: "var(--t4)", padding: "4px 2px" }}>
                FLOW handled the rest — {focus.ignored} other event{focus.ignored !== 1 ? "s" : ""} needed no attention.
              </div>
            )}
          </div>
        )}
      </section>

    </div>
  );
}

function DeptCard({ id, card, onAsk }) {
  const [hovered, setHovered] = useState(false);
  const meta = DEPT_META[id] || { label: id, source: "FLOW" };
  const st = STATUS[card?.status] || STATUS.unknown;
  const signal = buildSignal(card);
  const activeCount = (card?.recentActivity || []).length;
  const statusWord = st.word || (activeCount > 0 ? `${activeCount} active` : "quiet");

  return (
    <button onClick={() => onAsk(`Give me the ${meta.label.toLowerCase()} status in detail.`)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        textAlign: "left", cursor: "pointer", position: "relative",
        background: hovered ? "var(--surface-3)" : "var(--surface-2)",
        border: `1px solid ${hovered ? "var(--line-2)" : "var(--line-1)"}`,
        borderRadius: 6, padding: 20,
        transition: "background 100ms, border-color 100ms",
      }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <span style={{ fontFamily: "var(--font-display)", fontSize: 19, fontWeight: 500, color: "var(--t1)", lineHeight: 1 }}>{meta.label}</span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontFamily: "var(--font-data)", fontSize: 10, fontWeight: 300, letterSpacing: "0.04em", color: st.color }}>
          <span style={{ width: 5, height: 5, borderRadius: "50%", background: "currentColor" }} />
          {statusWord}
        </span>
      </div>

      <div style={{ fontSize: 13, fontWeight: 300, color: "var(--t2)", lineHeight: 1.6, marginBottom: 16, minHeight: 42 }}>
        {signal || "No new activity from connected sources today."}
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontFamily: "var(--font-data)", fontSize: 10, fontWeight: 300, color: "var(--t4)" }}>
        <span>{meta.source}</span>
        <span style={{ display: "flex", alignItems: "center", gap: 4, color: hovered ? "var(--accent-text)" : "var(--t4)", transition: "color 100ms" }}>
          {signal ? "just now" : ""} <ArrowRight style={{ width: 10, height: 10 }} />
        </span>
      </div>
    </button>
  );
}

function FocusItem({ item, rank, onOpen }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button onClick={() => onOpen(item)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex", alignItems: "flex-start", gap: 16,
        padding: "16px 20px",
        background: hovered ? "var(--surface-3)" : "var(--surface-2)",
        border: `1px solid ${hovered ? "var(--line-2)" : "var(--line-1)"}`,
        borderRadius: 6, cursor: "pointer", textAlign: "left",
        transition: "background 100ms, border-color 100ms",
      }}>
      <span style={{
        width: 22, height: 22, borderRadius: 3, flexShrink: 0,
        background: "var(--accent-dim)", border: "1px solid var(--accent-line)",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontFamily: "var(--font-data)", fontSize: 11, fontWeight: 400, color: "var(--accent-text)",
      }}>{rank}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 400, color: "var(--t1)", marginBottom: 3 }}>{item.text}</div>
        {item.subtitle && <div style={{ fontSize: 11, fontWeight: 300, color: "var(--t3)", marginBottom: 10 }}>{item.subtitle}</div>}
        <span style={{
          display: "inline-flex", alignItems: "center", gap: 4,
          fontFamily: "var(--font-data)", fontSize: 10, fontWeight: 300,
          color: "var(--accent-text)",
          padding: "3px 8px",
          background: hovered ? "rgba(232,103,43,0.14)" : "var(--accent-dim)",
          border: "1px solid var(--accent-line)",
          borderRadius: 3,
          transition: "background 80ms",
        }}>
          {item.actionLabel || "Open"} ↗
        </span>
      </div>
    </button>
  );
}

function CardSkeleton({ h = 128 }) {
  return (
    <div style={{ height: h, borderRadius: 6, background: "rgba(31,27,22,0.04)", border: "1px solid var(--line-1)", position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(90deg, transparent, rgba(31,27,22,0.05) 50%, transparent)", animation: "shimmer-sweep 1.6s ease-in-out infinite" }} />
    </div>
  );
}
