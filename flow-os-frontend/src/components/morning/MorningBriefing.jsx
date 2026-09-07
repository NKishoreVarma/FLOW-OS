import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { RefreshCw, ArrowRight, AlertTriangle, TrendingUp, Lightbulb, Zap, Code2, Mail, Calendar, MessageSquare, FileText, BookOpen, PlugZap } from "lucide-react";
import DataSourceBadge from "../ui/DataSourceBadge";
import WhatsNew from "../ui/WhatsNew";
import { useWebSocket } from "../../hooks/useWebSocket";
import { isIntegrationEvent, eventSource, eventTitle, sourceDotColor, isCriticalEvent } from "../../lib/liveEvents";
import InsightCard from "../intelligence/InsightCard";
import { fetchOperationalIntelligence, trackIntelligence } from "../../lib/operationalIntelligence";
import { useWorkspaceState } from "../../hooks/useWorkspaceState";

/**
 * MorningBriefing (/) — the most important screen in FLOW: it should feel like a
 * Chief of Staff already did the work. Reads the instant Workspace Intelligence
 * Cache plus a real-time WebSocket feed. No expensive reasoning on this screen.
 */
function authHeaders() {
  const token = localStorage.getItem("flow_os_token") || "";
  const workspaceId = localStorage.getItem("flow_os_workspace_id") || "";
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
  const wsState = useWorkspaceState();
  const { isAuthLoading, events, token, workspaceId } = useWebSocket();
  const navigate = useNavigate();
  const [snap, setSnap]   = useState({ loading: true, data: null, demo: false });
  const [focus, setFocus] = useState({ loading: true, items: [], demo: false });
  const [intel, setIntel] = useState({ loading: true, data: null, dismissed: new Set() });
  const [conseq, setConseq] = useState({ loading: true, items: [] });

  const loadConseq = useCallback(async () => {
    try {
      const d = await getJSON("/api/consequences");
      setConseq({ loading: false, items: d.consequences || [] });
    } catch {
      setConseq({ loading: false, items: [] });
    }
  }, []);

  const loadSnap = useCallback(async function load(retried) {
    const t0 = Date.now();
    try {
      const s = await getJSON("/api/workspace/snapshot");
      if (s.status === "building" || !s.domains) {
        // Real workspace: show empty state, not demo data
        const isDemoMode = wsState.mode === 'demo';
        setSnap({ loading: false, data: isDemoMode ? DEMO_SNAP : null, demo: isDemoMode });
        if (!retried) setTimeout(() => load(true), 3000);
        return;
      }
      setSnap({ loading: false, data: s, demo: false });
      trackPilot("morning_brief.loaded", { loadTimeMs: Date.now() - t0 });
    } catch {
      const isDemoMode = wsState.mode === 'demo';
      setSnap({ loading: false, data: isDemoMode ? DEMO_SNAP : null, demo: isDemoMode });
      trackPilot("morning_brief.failed", { errorCode: "FETCH_ERROR" });
    }
  }, [wsState.mode]);

  // Today's Focus IS the Adaptive Workday Engine's queue — "what should I do next?",
  // priority-ordered (NOW/NEXT/LATER), not a list of everything that happened.
  const loadFocus = useCallback(async () => {
    try {
      const q = await getJSON("/api/autonomous/chief-of-staff");
      const now    = q.now    || q.items?.filter((i) => i.priority === "now")  || [];
      const next   = q.next   || q.items?.filter((i) => i.priority === "next") || [];
      const later  = q.later  || q.items?.filter((i) => i.priority === "later")|| [];
      const ordered = [...now, ...next, ...later];
      if (!ordered.length) {
        const isDemoMode = wsState.mode === 'demo';
        setFocus({ loading: false, items: isDemoMode ? DEMO_FOCUS : [], demo: isDemoMode, ignored: 0 });
        return;
      }
      const items = ordered.slice(0, 5).map((c) => ({
        text: sentence(c.title).replace(/\.$/, ""),
        subtitle: c.subtitle || c.reasons?.[0] || "",
        route: c.actionRoute || "/inbox",
        actionLabel: /meeting/i.test(c.type) ? "View prep" : /approval/i.test(c.type) ? "Review" : /pr|conflict|project/i.test(c.type) ? "Open PR" : "Open",
      }));
      setFocus({ loading: false, items, demo: false, ignored: q.ignoredCount || 0 });
    } catch {
      const isDemoMode = wsState.mode === 'demo';
      setFocus({ loading: false, items: isDemoMode ? DEMO_FOCUS : [], demo: isDemoMode, ignored: 0 });
    }
  }, []);

  const loadIntel = useCallback(async () => {
    const tok = token || localStorage.getItem("flow_os_token") || "";
    const wsId = workspaceId || localStorage.getItem("flow_os_workspace_id") || "";
    if (!tok) return;
    try {
      const data = await fetchOperationalIntelligence(tok, wsId);
      setIntel(prev => ({ loading: false, data, dismissed: prev.dismissed }));
      if (data.summary.riskCount > 0)
        trackIntelligence("intelligence.morning.risks", { count: data.summary.riskCount }, tok, wsId);
    } catch {
      setIntel(prev => ({ ...prev, loading: false }));
    }
  }, [token, workspaceId]);

  useEffect(() => {
    if (!isAuthLoading) {
      trackPilot("session.start");
      loadSnap();
      loadFocus();
      loadIntel();
      loadConseq();
    }
  }, [isAuthLoading, loadSnap, loadFocus, loadIntel, loadConseq]);

  const askBrain = (q) => { window.dispatchEvent(new CustomEvent("flow:ask-brain", { detail: { question: q } })); };
  const doFocus = (item) => {
    if (item.route) navigate(item.route);
    else if (/reply|email|draft/i.test(item.text)) window.dispatchEvent(new CustomEvent("flow:open-compose"));
    else askBrain(item.text);
  };

  // Real workspace with no integrations → show setup home instead of demo data
  const isRealWorkspace = wsState.mode !== 'demo';
  const hasConnections   = wsState.connectedCount > 0;
  if (!wsState.loading && isRealWorkspace && !hasConnections && !snap.loading && !snap.data) {
    return <SetupHome connectors={wsState.connectedConnectors} navigate={navigate} />;
  }

  const data = snap.data || (wsState.mode === 'demo' ? DEMO_SNAP : {});
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

      {/* What's new — dismissible, only shows on first visit after each version */}
      <WhatsNew version="1.0.0" />

      {/* Greeting */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
        <div>
          <div style={{ ...LABEL_STYLE, marginBottom: 8 }}>{eyebrow}</div>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: 42, fontWeight: 500, color: "var(--t1)", letterSpacing: "-0.01em", lineHeight: 1.1, margin: "0 0 8px" }}>
            Good {dayPart()}, {firstName()}.
          </h1>
          <p style={{ fontSize: 13, fontWeight: 300, color: "var(--t3)", margin: 0 }}>
            {snap.demo
              ? "Showing sample data — connect your tools to see live insights."
              : "FLOW has been watching. Here's what matters right now."
            }
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

      {/* Approvals + Live Workspace. When there's nothing waiting, don't show the
          empty "0 waiting" card — give the live feed the full width instead. */}
      <div style={{ display: "grid", gridTemplateColumns: approvals > 0 ? "minmax(0, 1fr) minmax(0, 1.4fr)" : "minmax(0, 1fr)", gap: 12, alignItems: "start" }}>

        {/* Approvals — only when something actually needs the user */}
        {approvals > 0 && (
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
            Review now <ArrowRight style={{ width: 10, height: 10 }} />
          </div>
        </button>
        )}

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

      {/* FLOW DETECTED — proactive cross-tool consequences (nobody asked) */}
      {!conseq.loading && conseq.items.length > 0 && (
        <section aria-label="FLOW Detected" style={{ marginBottom: 32 }}>
          <div style={{ ...LABEL_STYLE, marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--crit)", animation: "pulse-dot 1.6s ease-in-out infinite" }} />
            FLOW Detected
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {conseq.items.slice(0, 4).map((c) => (
              <ConsequenceCard key={c.id} c={c} onAct={askBrain} />
            ))}
          </div>
        </section>
      )}

      {/* Today's Focus — NOW/NEXT/LATER priority items */}
      <section aria-label="Now — Priority Actions">
        <div style={{ ...LABEL_STYLE, marginBottom: 12 }}>Today's Focus</div>
        {focus.loading ? <CardSkeleton h={56} /> : focus.items.length === 0 ? (
          <div style={{ padding: "20px 0", fontSize: 13, fontWeight: 300, color: "var(--t3)" }}>
            {hasConnections
              ? "Nothing urgent right now — all clear."
              : "Connect your tools to get your priority items here."
            }
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {focus.demo && (
              <div style={{ fontSize: 10, fontWeight: 300, color: "var(--t4)", marginBottom: 4, fontFamily: "var(--font-data)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                Sample data — connect your tools to see real items
              </div>
            )}
            {focus.items.map((item, i) => <FocusItem key={i} item={item} rank={i + 1} onOpen={doFocus} />)}
            {focus.ignored > 0 && (
              <div style={{ fontSize: 11, fontWeight: 300, color: "var(--t4)", padding: "4px 2px" }}>
                FLOW handled the rest — {focus.ignored} other event{focus.ignored !== 1 ? "s" : ""} needed no attention.
              </div>
            )}
          </div>
        )}
      </section>

      {/* Operational Intelligence — proactive risks, trends, predictions */}
      <IntelligenceSection intel={intel} setIntel={setIntel} navigate={navigate} token={token} workspaceId={workspaceId} />

    </div>
  );
}

function IntelligenceSection({ intel, setIntel, navigate, token, workspaceId }) {
  const { loading, data, dismissed } = intel;
  const tok = token || localStorage.getItem("flow_os_token") || "";
  const wsId = workspaceId || localStorage.getItem("flow_os_workspace_id") || "";

  if (loading) {
    return (
      <section>
        <div style={{ ...LABEL_STYLE, marginBottom: 12 }}>Operational Intelligence</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <CardSkeleton h={80} />
          <CardSkeleton h={80} />
        </div>
      </section>
    );
  }

  if (!data || data.summary.totalInsights === 0) return null;

  const dismiss = (insight) => {
    setIntel(prev => ({ ...prev, dismissed: new Set([...prev.dismissed, insight.id]) }));
    trackIntelligence("intelligence.insight.dismissed", { id: insight.id, type: insight.type }, tok, wsId);
  };

  const act = (insight) => {
    trackIntelligence("intelligence.insight.acted", { id: insight.id, type: insight.type, category: insight.category }, tok, wsId);
    if (insight.actionRoute) navigate(insight.actionRoute);
    else window.dispatchEvent(new CustomEvent("flow:ask-brain", { detail: { question: insight.suggestedAction || insight.title } }));
  };

  // Surface: top 2 risks + top 1 opportunity + top 1 prediction (max 4 cards)
  const topRisks   = data.risks.filter(r => !dismissed.has(r.id)).slice(0, 2);
  const topOpp     = data.opportunities.filter(o => !dismissed.has(o.id)).slice(0, 1);
  const topPred    = data.predictions.filter(p => !dismissed.has(p.id) && p.confidence !== "LOW").slice(0, 1);
  const cards      = [...topRisks, ...topOpp, ...topPred].slice(0, 4);
  const remaining  = data.summary.totalInsights - cards.length;

  if (cards.length === 0) return null;

  return (
    <section aria-label="Operational Intelligence">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <div style={{ ...LABEL_STYLE }}>
          Operational Intelligence
          {data.summary.criticalCount > 0 && (
            <span style={{ marginLeft: 8, fontSize: 9, fontWeight: 500, color: "var(--p-critical-text)", background: "rgba(255,87,87,0.10)", border: "1px solid rgba(255,87,87,0.22)", padding: "1px 6px", borderRadius: 99 }}>
              {data.summary.criticalCount} critical
            </span>
          )}
        </div>
        {remaining > 0 && (
          <button onClick={() => navigate("/chief")} style={{ fontSize: 11, color: "var(--t4)", background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
            +{remaining} more <ArrowRight style={{ width: 10, height: 10 }} />
          </button>
        )}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {cards.map(insight => (
          <InsightCard
            key={insight.id}
            insight={insight}
            onAction={act}
            onDismiss={dismiss}
          />
        ))}
      </div>
      {/* Internal source labels (WORKSPACE, CHIEF-OF-STAFF, CONNECTORS…) are
          implementation detail — never shown to the user. */}
    </section>
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

// A proactive cross-tool consequence: what FLOW connected, why it matters, the action.
function ConsequenceCard({ c, onAct }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(null);   // { kind, preview, recommendation, executable }
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null); // { ok, message }
  const critical = c.severity === "critical";
  const accent = critical ? "var(--crit)" : "var(--warn)";

  // Layer 5 — prepare a reviewable resolution (LLM drafts it, human approves).
  async function prepare() {
    setBusy(true); setResult(null);
    try {
      const r = await fetch("/api/consequences/resolve", {
        method: "POST", headers: authHeaders(), body: JSON.stringify({ consequence: c }),
      });
      const d = await r.json();
      if (d.success) setDraft(d);
      else setResult({ ok: false, message: "Couldn't prepare a draft." });
    } catch { setResult({ ok: false, message: "Couldn't prepare a draft." }); }
    finally { setBusy(false); }
  }

  // Approve → run through the governed Execution Engine. Honest about the outcome.
  async function approve() {
    if (!draft?.recommendation) return;
    setBusy(true);
    try {
      const r = await fetch("/api/execution/execute", {
        method: "POST", headers: authHeaders(),
        body: JSON.stringify({ recommendation: draft.recommendation, confirmed: true }),
      });
      const d = await r.json();
      if (d.success || d.status === "executed") setResult({ ok: true, message: "Done — action executed." });
      else if (d.status === "approval_required" || d.approvalId) setResult({ ok: true, message: "Sent for approval." });
      else setResult({ ok: false, message: d.error || d.message || `${draft.recommendation.connector} isn't connected — connect it to send.` });
    } catch { setResult({ ok: false, message: "Execution failed. Check the connection and try again." }); }
    finally { setBusy(false); setDraft(null); }
  }
  return (
    <div style={{
      border: "1px solid var(--border)", borderLeft: `2px solid ${accent}`,
      borderRadius: 10, padding: "14px 16px", background: "var(--bg-secondary)",
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
            <span style={{ fontFamily: "var(--font-data)", fontSize: 9, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.07em", color: accent }}>
              {c.severity}
            </span>
            {c.crossTool && c.sources?.length > 1 && (
              <span style={{ fontFamily: "var(--font-data)", fontSize: 9, color: "var(--t4)" }}>
                {c.sources.join(" + ")}
              </span>
            )}
            {c.probability != null && (
              <span style={{ fontFamily: "var(--font-data)", fontSize: 9, color: "var(--t4)" }}>{c.probability}%</span>
            )}
          </div>
          <div style={{ fontSize: 14, fontWeight: 500, color: "var(--t1)" }}>{c.title}</div>
        </div>
      </div>

      {open && c.evidenceChain?.length > 0 && (
        <div style={{ marginTop: 10, paddingLeft: 12, borderLeft: "1px solid var(--line-1)", display: "flex", flexDirection: "column", gap: 5 }}>
          {c.evidenceChain.slice(0, 6).map((e, i) => (
            <div key={i} style={{ fontSize: 11.5, fontWeight: 300, color: "var(--t3)" }}>
              <span style={{ color: "var(--t5)", fontFamily: "var(--font-data)", fontSize: 9, textTransform: "uppercase" }}>{e.source}</span>{"  "}
              {e.text}
            </div>
          ))}
        </div>
      )}

      {/* Prepared draft — human reviews and approves; nothing auto-sends */}
      {draft && (
        <div style={{ marginTop: 12, padding: 12, borderRadius: 8, background: "var(--surface-1)", border: "1px solid var(--border)" }}>
          {draft.preview?.subject && (
            <div style={{ fontSize: 12, fontWeight: 500, color: "var(--t2)", marginBottom: 6 }}>{draft.preview.subject}</div>
          )}
          <div style={{ fontSize: 12.5, fontWeight: 300, color: "var(--t2)", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
            {draft.preview?.body || draft.preview?.text}
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            {draft.executable && (
              <button onClick={approve} disabled={busy}
                style={{ fontSize: 12, fontWeight: 500, color: "#fff", background: accent, border: "none", borderRadius: 6, padding: "6px 12px", cursor: busy ? "default" : "pointer" }}>
                {busy ? "Working…" : `Approve & ${draft.kind === "email" ? "send" : draft.kind === "event" ? "schedule" : "send"}`}
              </button>
            )}
            <button onClick={() => setDraft(null)} style={{ fontSize: 12, color: "var(--t3)", background: "none", border: "1px solid var(--border)", borderRadius: 6, padding: "6px 12px", cursor: "pointer" }}>Cancel</button>
          </div>
        </div>
      )}

      {result && (
        <div style={{ marginTop: 10, fontSize: 12, color: result.ok ? "var(--ok)" : "var(--t3)" }}>{result.message}</div>
      )}

      {!draft && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12 }}>
          <button
            onClick={prepare}
            disabled={busy}
            style={{ fontSize: 12, fontWeight: 500, color: "#fff", background: accent, border: "none", borderRadius: 6, padding: "6px 12px", cursor: busy ? "default" : "pointer" }}
          >
            {busy ? "Preparing…" : (c.recommendedAction?.label || "Take action")}
          </button>
          {c.evidenceChain?.length > 0 && (
            <button onClick={() => setOpen(o => !o)} style={{ fontSize: 12, color: "var(--t3)", background: "none", border: "none", cursor: "pointer" }}>
              {open ? "Hide chain" : "See what FLOW connected"}
            </button>
          )}
          <button onClick={() => onAct(c.followUp || `Tell me more about: ${c.title}`)} style={{ fontSize: 12, color: "var(--t4)", background: "none", border: "none", cursor: "pointer", marginLeft: "auto" }}>
            {c.followUp ? c.followUp.replace(/^Want me to /, "").replace(/\?$/, "") : "Ask FLOW"}
          </button>
        </div>
      )}
    </div>
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

// ─── Setup Home — shown when real workspace has no connected tools ─────────────

const SUGGESTED_CONNECTORS = [
  { id: "github",          Icon: Code2,         name: "GitHub",         desc: "PRs, commits, repos" },
  { id: "gmail",           Icon: Mail,          name: "Gmail",          desc: "Inbox, threads, contacts" },
  { id: "google-calendar", Icon: Calendar,      name: "Google Calendar", desc: "Meetings, events" },
  { id: "slack",           Icon: MessageSquare, name: "Slack",          desc: "Channels, threads" },
  { id: "jira",            Icon: FileText,      name: "Jira",           desc: "Issues, sprints, projects" },
  { id: "notion",          Icon: BookOpen,      name: "Notion",         desc: "Docs, wikis, databases" },
];

function SetupHome({ navigate }) {
  return (
    <div style={{ padding: "48px 32px", maxWidth: 760, margin: "0 auto", fontFamily: "var(--font-ui)" }}>
      {/* Header */}
      <div style={{ marginBottom: 40 }}>
        <div style={{ fontSize: 10, fontWeight: 300, color: "var(--t4)", fontFamily: "var(--font-data)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>
          {new Date().toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" })}
        </div>
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: 40, fontWeight: 500, color: "var(--t1)", letterSpacing: "-0.01em", lineHeight: 1.1, margin: "0 0 10px" }}>
          Good {dayPart()}, {firstName()}.
        </h1>
        <p style={{ fontSize: 14, fontWeight: 300, color: "var(--t3)", maxWidth: 480, margin: 0, lineHeight: 1.6 }}>
          FLOW is ready — connect your first tool to start getting live insights, priority items, and your Morning Brief.
        </p>
      </div>

      {/* Connect CTA */}
      <div style={{ background: "var(--surface-2)", border: "1px solid var(--brand-line)", borderRadius: 8, padding: "24px 28px", marginBottom: 28 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
          <div style={{ width: 36, height: 36, borderRadius: 8, background: "var(--brand-dim)", border: "1px solid var(--brand-line)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <PlugZap size={18} color="var(--brand)" />
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 500, color: "var(--t1)", marginBottom: 2 }}>Connect your tools</div>
            <div style={{ fontSize: 12, fontWeight: 300, color: "var(--t3)" }}>Takes under 3 minutes. You choose exactly what FLOW may access.</div>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 18 }}>
          {SUGGESTED_CONNECTORS.map(({ id, Icon, name, desc }) => (
            <div key={id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", background: "var(--surface-3)", border: "1px solid var(--line-1)", borderRadius: 6 }}>
              <Icon size={15} color="var(--t3)" />
              <div>
                <div style={{ fontSize: 12, fontWeight: 500, color: "var(--t2)", marginBottom: 1 }}>{name}</div>
                <div style={{ fontSize: 10, fontWeight: 300, color: "var(--t4)" }}>{desc}</div>
              </div>
            </div>
          ))}
        </div>
        <button
          onClick={() => navigate("/settings/integrations")}
          style={{
            display: "inline-flex", alignItems: "center", gap: 8,
            background: "var(--brand)", color: "#fff", border: "none", borderRadius: 8,
            padding: "11px 20px", fontSize: 13, fontWeight: 500, cursor: "pointer",
          }}>
          Connect a tool <ArrowRight size={14} />
        </button>
      </div>

      {/* What you'll get */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
        {[
          { icon: <Zap size={15} color="var(--brand)" />, title: "Morning Brief", body: "Priority actions, risks, and opportunities every morning — tailored to your role." },
          { icon: <TrendingUp size={15} color="var(--ok)" />, title: "Live Activity", body: "Real-time feed of what's happening across your tools, filtered to what matters." },
          { icon: <Lightbulb size={15} color="var(--warn)" />, title: "Smart Focus", body: "FLOW surfaces the 3–5 things that actually need you today, ranked by urgency." },
        ].map((card, i) => (
          <div key={i} style={{ padding: "18px 20px", background: "var(--surface-2)", border: "1px solid var(--line-1)", borderRadius: 6 }}>
            <div style={{ marginBottom: 10 }}>{card.icon}</div>
            <div style={{ fontSize: 13, fontWeight: 500, color: "var(--t1)", marginBottom: 6 }}>{card.title}</div>
            <div style={{ fontSize: 12, fontWeight: 300, color: "var(--t3)", lineHeight: 1.5 }}>{card.body}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
