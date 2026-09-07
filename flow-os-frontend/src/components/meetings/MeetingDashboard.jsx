import { useState, useEffect, useRef } from "react";
import {
  Calendar, Search, FileText, CheckSquare,
  Clock, Video, Brain, Shield,
  ChevronRight, AlertTriangle, Star, RefreshCw, Zap
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import DataSourceBadge from "../ui/DataSourceBadge";
import { useWebSocket } from "../../hooks/useWebSocket";

// ── Demo data ─────────────────────────────────────────────────────────────────

const DEMO_UPCOMING = [
  { id: "m1", title: "Incident Postmortem: DB Connection Saturation", time: "2:00 PM – 3:00 PM", date: "Today",    attendees: ["James K.", "David O.", "Sarah C.", "Alex R."], type: "Postmortem", typeCfg: { color: "var(--p-critical)", bg: "rgba(255,87,87,0.06)",  border: "rgba(255,87,87,0.18)" }, aiPrep: "Review INC-A3F2 timeline. Bring pg connection pool metrics. Engineering expects RCA from David O.", relatedItems: ["INC-A3F2", "FLOW-247", "pgvector-limits.md"], urgency: "high",   videoUrl: null },
  { id: "m2", title: "Weekly Product Sync — Sprint 14 Review",        time: "4:00 PM – 4:30 PM", date: "Today",    attendees: ["Sarah Chen", "Priya N.", "Marcus W.", "You"],   type: "Recurring",  typeCfg: { color: "var(--p-info)",     bg: "rgba(91,158,255,0.06)", border: "rgba(91,158,255,0.18)" }, aiPrep: "Sprint 14 at 72% completion. 3 tickets infra-blocked. Prepare to discuss timeline slip.",     relatedItems: ["Sprint-14 Jira Board", "Q2 Roadmap"], urgency: "medium", videoUrl: null },
  { id: "m3", title: "Redis Cluster Migration Planning",               time: "10:00 AM – 11:00 AM",date: "Tomorrow",attendees: ["Alex R.", "David O.", "You"],                    type: "Planning",   typeCfg: { color: "var(--p-high)",     bg: "rgba(255,151,65,0.06)",border: "rgba(255,151,65,0.18)" }, aiPrep: "Single-node Redis failing under BullMQ load. Decision: Cluster vs Sentinel.",                 relatedItems: ["Redis architecture doc", "BullMQ reliability report"], urgency: "medium", videoUrl: null },
];

const DEMO_PAST = [
  { id: "p1", title: "Design System Review",            time: "Yesterday, 3:00 PM",    decisions: 3, actions: 5,  summary: "Finalized dark UI token system. Approved gradient card patterns. Postponed mobile responsive pass to v2.1.", participants: ["Sarah C.", "Marcus W.", "Priya N."],      aiScore: 94 },
  { id: "p2", title: "Q2 Board Update Prep",            time: "Monday, 11:00 AM",      decisions: 1, actions: 12, summary: "Reviewed Q2 metrics: ARR $180K (+34% QoQ). Decided to delay enterprise GA to August.",                   participants: ["James K.", "Priya N."],                   aiScore: 88 },
  { id: "p3", title: "Globex Corp Integration Kickoff", time: "Last Friday, 2:00 PM",  decisions: 4, actions: 8,  summary: "Engineering integration scope defined. Globex's 3 engineers joining FLOW team Aug 1.",                    participants: ["James K.", "Legal Team", "Globex CTO"],   aiScore: 97 },
  { id: "p4", title: "Sprint 13 Retrospective",         time: "Last Thursday, 4:00 PM",decisions: 2, actions: 6,  summary: "Sprint velocity 87%. Blocked tickets due to infra dependencies.",                                       participants: ["Sarah C.", "David O.", "Marcus W.", "+3"], aiScore: 82 },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatEventDate(startTime) {
  if (!startTime) return "Upcoming";
  const d = new Date(startTime);
  const today    = new Date(); today.setHours(0,0,0,0);
  const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
  const eventDay = new Date(d); eventDay.setHours(0,0,0,0);
  if (eventDay.getTime() === today.getTime())    return "Today";
  if (eventDay.getTime() === tomorrow.getTime()) return "Tomorrow";
  return d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
}

function formatEventTime(startTime, endTime) {
  if (!startTime) return "";
  const fmt = t => new Date(t).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return endTime ? `${fmt(startTime)} – ${fmt(endTime)}` : fmt(startTime);
}

function typeCfgFor(type) {
  const MAP = {
    Planning:      { color: "var(--p-high)",     bg: "rgba(255,151,65,0.06)",  border: "rgba(255,151,65,0.18)" },
    Retrospective: { color: "var(--brand)",       bg: "rgba(232,103,43,0.06)", border: "rgba(232,103,43,0.18)" },
    Postmortem:    { color: "var(--p-critical)",  bg: "rgba(255,87,87,0.06)",   border: "rgba(255,87,87,0.18)" },
    Review:        { color: "var(--p-info)",      bg: "rgba(91,158,255,0.06)",  border: "rgba(91,158,255,0.18)" },
    Recurring:     { color: "var(--p-info)",      bg: "rgba(91,158,255,0.06)",  border: "rgba(91,158,255,0.18)" },
    "Quick Sync":  { color: "var(--p-normal)",    bg: "rgba(76,175,130,0.06)",  border: "rgba(76,175,130,0.18)" },
  };
  return MAP[type] || { color: "var(--t4)", bg: "rgba(31,27,22,0.045)", border: "var(--border)" };
}

function normalizeUpcomingEvent(event) {
  const attendees = (event.participants || []).map(p => p.name || p.email).filter(Boolean).slice(0, 5);
  const dm = event.duration || 60;
  const type = dm <= 30 ? "Quick Sync"
    : event.title?.toLowerCase().includes("planning")     ? "Planning"
    : event.title?.toLowerCase().includes("retro")        ? "Retrospective"
    : event.title?.toLowerCase().includes("postmortem")   ? "Postmortem"
    : event.title?.toLowerCase().includes("review")       ? "Review"
    : event.title?.toLowerCase().includes("sync")         ? "Recurring"
    : "Meeting";
  return { id: event.id, title: event.title, date: formatEventDate(event.startTime), time: formatEventTime(event.startTime, event.endTime), attendees, type, typeCfg: typeCfgFor(type), aiPrep: event.agenda?.slice(0, 200) || null, relatedItems: [], urgency: "medium", videoUrl: event.videoUrl || null };
}

function normalizePastEvent(event) {
  const actions   = event.metadata?.actions   || [];
  const decisions = event.metadata?.decisions || [];
  const participants = (event.participants || []).map(p => p.name || p.email).filter(Boolean);
  return { id: event.id, title: event.title, time: formatEventDate(event.startTime) + (event.startTime ? `, ${formatEventTime(event.startTime, event.endTime)}` : ""), decisions: decisions.length, actions: actions.length, summary: event.metadata?.meetingSummary || event.agenda || "No summary recorded.", participants, aiScore: 75 + Math.floor(Math.random() * 20) };
}

// ── UpcomingCard ──────────────────────────────────────────────────────────────

function UpcomingCard({ meeting, onPrepare }) {
  const [h, setH] = useState(false);
  const { color, bg, border } = meeting.typeCfg;

  return (
    <div
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      style={{
        background:   "var(--bg-card)",
        border:       `1px solid ${meeting.urgency === "high" ? "rgba(255,87,87,0.20)" : h ? "var(--border-strong)" : "var(--border)"}`,
        borderLeft:   `2px solid ${meeting.urgency === "high" ? "var(--p-critical)" : color}`,
        borderRadius:  6,
        padding:       "14px",
        transition:   "border-color 150ms",
      }}
    >
      {/* Row 1: type badge + time + urgent flag */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{
            fontSize: 10, fontWeight: 500,
            textTransform: "uppercase", letterSpacing: "0.07em",
            padding: "2px 7px", borderRadius: 4,
            color, background: bg, border: `1px solid ${border}`,
          }}>
            {meeting.type}
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "var(--t4)" }}>
            <Clock style={{ width: 9, height: 9 }} />
            {meeting.date} · {meeting.time}
          </span>
        </div>
        {meeting.urgency === "high" && (
          <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, fontWeight: 500, color: "var(--p-critical)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
            <AlertTriangle style={{ width: 9, height: 9 }} />URGENT
          </span>
        )}
      </div>

      {/* Title */}
      <h3 style={{ fontSize: 13, fontWeight: 500, color: "var(--t1)", lineHeight: 1.35, marginBottom: 10 }}>
        {meeting.title}
      </h3>

      {/* Attendees */}
      {meeting.attendees.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 10 }}>
          {meeting.attendees.map((a, i) => (
            <span key={i} style={{
              fontSize: 11, fontWeight: 400,
              padding: "2px 7px", borderRadius: 4,
              background: "rgba(31,27,22,0.05)", border: "1px solid var(--border-strong)",
              color: "var(--t3)", letterSpacing: "-0.05px",
            }}>
              {a}
            </span>
          ))}
        </div>
      )}

      {/* AI prep */}
      {meeting.aiPrep && (
        <div style={{
          background: "rgba(232,103,43,0.06)", border: "1px solid var(--brand-line)",
          borderLeft: "2px solid var(--brand)",
          borderRadius: 4, padding: "8px 10px", marginBottom: 10,
          display: "flex", alignItems: "flex-start", gap: 8,
        }}>
          <Brain style={{ width: 11, height: 11, color: "var(--brand)", flexShrink: 0, marginTop: 1 }} />
          <p style={{ fontSize: 11, color: "var(--t2)", lineHeight: 1.6 }}>
            <span style={{ color: "var(--brand-text)", fontWeight: 500 }}>AI Prep: </span>
            {meeting.aiPrep}
          </p>
        </div>
      )}

      {/* Related */}
      {meeting.relatedItems.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 10 }}>
          {meeting.relatedItems.map((item, i) => (
            <span key={i} style={{
              display: "inline-flex", alignItems: "center", gap: 4,
              fontSize: 10, fontWeight: 400, color: "var(--t4)",
              background: "rgba(31,27,22,0.04)", border: "1px solid var(--border)",
              borderRadius: 4, padding: "2px 7px",
              letterSpacing: "-0.05px",
            }}>
              <FileText style={{ width: 8, height: 8 }} />{item}
            </span>
          ))}
        </div>
      )}

      {/* Actions */}
      <div style={{ display: "flex", gap: 8 }}>
        <button
          onClick={() => onPrepare(meeting.id)}
          style={{
            flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
            fontSize: 12, fontWeight: 500, padding: "7px 14px", borderRadius: 4,
            background: "var(--brand)", color: "#fff",
            border: "1px solid rgba(232,103,43,0.40)", cursor: "pointer",
            transition: "background 100ms",
          }}
          onMouseEnter={e => e.currentTarget.style.background = "#8C7EFF"}
          onMouseLeave={e => e.currentTarget.style.background = "var(--brand)"}
        >
          <Video style={{ width: 12, height: 12 }} />Join & Prepare
        </button>
        {meeting.videoUrl && (
          <a
            href={meeting.videoUrl}
            target="_blank"
            rel="noreferrer"
            style={{
              fontSize: 12, padding: "7px 14px", borderRadius: 4,
              color: "var(--t3)", border: "1px solid var(--border-strong)",
              textDecoration: "none", display: "flex", alignItems: "center",
              transition: "color 100ms",
            }}
            onMouseEnter={e => e.currentTarget.style.color = "var(--t1)"}
            onMouseLeave={e => e.currentTarget.style.color = "var(--t3)"}
          >
            Join Link
          </a>
        )}
      </div>
    </div>
  );
}

// ── PastCard ──────────────────────────────────────────────────────────────────

function PastCard({ meeting, onView }) {
  const [h, setH] = useState(false);

  return (
    <button
      onClick={() => onView(meeting.id)}
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      style={{
        width: "100%", textAlign: "left",
        background: h ? "var(--bg-card)" : "transparent",
        border: `1px solid ${h ? "var(--border-strong)" : "var(--border)"}`,
        borderRadius: 6, padding: "12px 14px",
        cursor: "pointer", transition: "all 100ms",
        display: "block",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, marginBottom: 6 }}>
        <h3 style={{ fontSize: 13, fontWeight: 500, color: h ? "var(--t1)" : "var(--t2)", lineHeight: 1.35, transition: "color 100ms" }}>
          {meeting.title}
        </h3>
        <span style={{
          display: "flex", alignItems: "center", gap: 4, flexShrink: 0,
          fontSize: 10, fontWeight: 500,
          color: "var(--p-normal)", background: "rgba(76,175,130,0.08)",
          border: "1px solid rgba(76,175,130,0.20)", borderRadius: 4,
          padding: "2px 7px",
        }}>
          <Star style={{ width: 8, height: 8 }} />{meeting.aiScore}%
        </span>
      </div>

      <p style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "var(--t4)", marginBottom: 6 }}>
        <Clock style={{ width: 9, height: 9 }} />{meeting.time}
      </p>

      <p style={{ fontSize: 12, color: "var(--t3)", lineHeight: 1.6, marginBottom: 10, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
        {meeting.summary}
      </p>

      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10, color: "var(--p-normal)" }}>
          <Shield style={{ width: 9, height: 9 }} />{meeting.decisions} decisions
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10, color: "var(--p-high)" }}>
          <CheckSquare style={{ width: 9, height: 9 }} />{meeting.actions} actions
        </span>
        <span style={{
          marginLeft: "auto", display: "flex", alignItems: "center", gap: 4,
          fontSize: 10, color: "var(--t4)",
          opacity: h ? 1 : 0, transition: "opacity 100ms",
        }}>
          View summary<ChevronRight style={{ width: 11, height: 11 }} />
        </span>
      </div>
    </button>
  );
}

// ── StatPill ──────────────────────────────────────────────────────────────────

function StatPill({ label, value }) {
  return (
    <div style={{ textAlign: "right" }}>
      <div style={{ fontSize: 15, fontWeight: 500, color: "var(--t1)", letterSpacing: "-0.3px" }}>{value}</div>
      <div style={{ fontSize: 10, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--t5)" }}>{label}</div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export const MeetingDashboard = () => {
  const navigate = useNavigate();
  const { token, workspaceId, isAuthLoading } = useWebSocket();

  const [upcoming, setUpcoming]       = useState(DEMO_UPCOMING);
  const [past, setPast]               = useState(DEMO_PAST);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading]         = useState(false);
  const [isDemo, setIsDemo]           = useState(true);
  const [focusedSearch, setFocusedSearch] = useState(false);

  const fetchRef = useRef(null);

  useEffect(() => {
    if (isAuthLoading) return;
    let cancelled = false;
    async function load() {
      if (!token || !workspaceId) return;
      setLoading(true);
      try {
        const headers = { Authorization: `Bearer ${token}`, "workspace-id": workspaceId };
        const [upRes, pastRes] = await Promise.all([
          fetch("/api/meetings/upcoming?days=7&limit=20",  { headers }),
          fetch("/api/meetings/past?days=30&limit=20",     { headers }),
        ]);
        if (!cancelled && upRes.ok && pastRes.ok) {
          const [upData, pastData] = await Promise.all([upRes.json(), pastRes.json()]);
          const upEvents   = (upData.result   || []).map(normalizeUpcomingEvent);
          const pastEvents = (pastData.result || []).map(normalizePastEvent);
          if (upEvents.length > 0 || pastEvents.length > 0) {
            setUpcoming(upEvents.length   > 0 ? upEvents   : DEMO_UPCOMING);
            setPast(pastEvents.length     > 0 ? pastEvents : DEMO_PAST);
            setIsDemo(false);
          }
        }
      } catch { /* stay on demo data */ } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchRef.current = load;
    load();
    return () => { cancelled = true; };
  }, [isAuthLoading, token, workspaceId]);

  const filteredPast = past.filter(m =>
    !searchQuery ||
    m.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    m.summary?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div style={{ padding: "24px", display: "flex", flexDirection: "column", gap: 0 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginBottom: 20 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
            <Calendar style={{ width: 16, height: 16, color: "var(--p-normal)" }} />
            <h1 style={{ fontSize: 16, fontWeight: 500, color: "var(--t1)", letterSpacing: "-0.3px" }}>
              Meeting Intelligence
            </h1>
            <DataSourceBadge mode={isDemo ? "demo" : "live"} />
          </div>
          <p style={{ fontSize: 12, color: "var(--t4)" }}>
            Permanent memory · AI summaries · Action tracking
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <StatPill label="Today" value={`${upcoming.filter(m => m.date === "Today").length} meetings`} />
          <StatPill label="Decisions this week" value={`${past.reduce((s, m) => s + m.decisions, 0)}`} />
          <StatPill label="Open actions" value={`${past.reduce((s, m) => s + m.actions, 0)}`} />
          <button
            onClick={() => fetchRef.current?.()}
            disabled={loading}
            style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              width: 30, height: 30, borderRadius: 4,
              background: "rgba(31,27,22,0.045)", border: "1px solid var(--border)",
              color: "var(--t4)", cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.5 : 1, transition: "all 100ms",
            }}
            title="Refresh from Google Calendar"
          >
            <RefreshCw style={{ width: 12, height: 12, ...(loading ? { animation: "spin 1s linear infinite" } : {}) }} />
          </button>
        </div>
      </div>

      {/* Search */}
      <div style={{ position: "relative", maxWidth: 640, marginBottom: 28 }}>
        <Search style={{
          position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)",
          width: 13, height: 13, color: focusedSearch ? "var(--brand)" : "var(--t5)",
          transition: "color 150ms",
        }} />
        <input
          type="text"
          placeholder='Search meeting memory… "What did we decide about Redis?"'
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          onFocus={() => setFocusedSearch(true)}
          onBlur={() => setFocusedSearch(false)}
          style={{
            width: "100%",
            background: focusedSearch ? "rgba(232,103,43,0.04)" : "var(--bg-card)",
            border: `1px solid ${focusedSearch ? "rgba(232,103,43,0.35)" : "var(--border-strong)"}`,
            borderRadius: 4, paddingLeft: 36, paddingRight: 14,
            paddingTop: 10, paddingBottom: 10,
            fontSize: 13, color: "var(--t1)",
            outline: "none", transition: "border-color 150ms, background 150ms",
            fontFamily: "'Instrument Sans', sans-serif",
          }}
        />
      </div>

      <style>{`input::placeholder { color: var(--t5); }`}</style>

      {/* Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "5fr 7fr", gap: 24 }}>
        {/* Upcoming */}
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
            <span style={{ fontSize: 10, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--t4)" }}>Upcoming</span>
            <span style={{ fontSize: 10, fontWeight: 500, color: "var(--t5)", background: "rgba(31,27,22,0.05)", padding: "1px 6px", borderRadius: 3 }}>
              {upcoming.length}
            </span>
            <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {upcoming.map(m => (
              <UpcomingCard key={m.id} meeting={m} onPrepare={id => navigate(`/meetings/${id}/prep`)} />
            ))}
          </div>
        </div>

        {/* Past */}
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
            <span style={{ fontSize: 10, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--t4)" }}>Past Meetings</span>
            <span style={{ fontSize: 10, fontWeight: 500, color: "var(--t5)", background: "rgba(31,27,22,0.05)", padding: "1px 6px", borderRadius: 3 }}>
              {filteredPast.length}
            </span>
            <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {filteredPast.map(m => (
              <PastCard key={m.id} meeting={m} onView={id => navigate(`/meetings/${id}/summary`)} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default MeetingDashboard;
