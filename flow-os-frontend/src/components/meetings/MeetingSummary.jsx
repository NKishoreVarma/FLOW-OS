import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Users, FileText, CheckSquare, Clock, Download, Share2, Mail } from "lucide-react";
import DecisionCard from "./DecisionCard";
import ActionCard from "./ActionCard";
import { useWebSocket } from "../../hooks/useWebSocket";

function getDemoSummary(id) {
  return {
    title: id === "m2" ? "PostgreSQL Migration Plan" : "Architecture Sync",
    time:  "Today, 10:00 AM - 10:45 AM",
    attendees: ["Kishore Varma", "Sarah Chen", "David O."],
    executiveSummary:
      "The team reviewed current database latency metrics and agreed that the transaction lock volume poses a high risk to operational stability during peak hours. It was decided to schedule the PostgreSQL migration for Saturday 2AM to minimize impact. David O. will coordinate with ops to prepare rollback scripts.",
    decisions: [{ decision: "Schedule Postgres migration for Saturday 2AM", evidence: "We decided to schedule the migration for Saturday 2AM to minimize impact.", time: "10:03 AM", confidence: "High" }],
    actions: [{ action: "Notify ops team and prepare rollback scripts", owner: "David O.", deadline: "Friday", evidence: "David, can you notify the ops team and prepare the rollback scripts by Friday?", time: "10:04 AM" }],
    timeline: [
      { time: "10:00 AM", event: "Meeting started",                            type: "system"   },
      { time: "10:01 AM", event: "Risk detected regarding transaction lock volume", type: "risk" },
      { time: "10:03 AM", event: "Migration window decided",                   type: "decision" },
      { time: "10:04 AM", event: "Action assigned to David O.",                type: "action"   },
      { time: "10:45 AM", event: "Meeting ended",                              type: "system"   },
    ],
    followUpDraft: "Hi David, confirming our decision to schedule the Postgres migration for Saturday 2AM. Please prepare the rollback scripts by Friday. Thanks.",
    jiraProposal: null,
  };
}

function buildSummaryFromApi(event) {
  const metadata  = event.metadata || {};
  const actions   = (metadata.actions   || []).map((a, i) => ({ action: typeof a === "string" ? a : a.text || a.action || `Action ${i + 1}`, owner: a.owner || "TBD", deadline: a.deadline || "TBD", evidence: a.evidence || "", time: a.time || "" }));
  const decisions = (metadata.decisions || []).map((d, i) => ({ decision: typeof d === "string" ? d : d.text || d.decision || `Decision ${i + 1}`, evidence: d.evidence || "", time: d.time || "", confidence: d.confidence || "Medium" }));
  const startFmt  = event.startTime ? new Date(event.startTime).toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "";
  const endFmt    = event.endTime   ? new Date(event.endTime).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "";
  return {
    title: event.title,
    time: startFmt + (endFmt ? ` - ${endFmt}` : ""),
    attendees: (event.participants || []).map(p => p.name || p.email).filter(Boolean),
    executiveSummary: metadata.meetingSummary || event.agenda || "No summary recorded for this meeting.",
    decisions,
    actions,
    timeline: [
      event.startTime && { time: new Date(event.startTime).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }), event: "Meeting started", type: "system" },
      ...decisions.map(d => d.time ? { time: d.time, event: d.decision, type: "decision" } : null),
      ...actions.map(a => a.time ? { time: a.time, event: `Action: ${a.action}`, type: "action" } : null),
      event.endTime && { time: new Date(event.endTime).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }), event: "Meeting ended", type: "system" },
    ].filter(Boolean),
    followUpDraft: actions.length > 0 ? `Hi ${actions[0].owner || "team"}, following up on our meeting "${event.title}". ${actions.map(a => `Action: ${a.action} (due ${a.deadline}).`).join(" ")} Thanks.` : null,
    jiraProposal: actions.length > 0 ? { title: actions[0].action, owner: actions[0].owner, due: actions[0].deadline } : null,
  };
}

const TL_COLOR = { decision: "var(--brand)", action: "var(--p-high)", risk: "var(--p-critical)", system: "var(--t5)" };

export const MeetingSummary = () => {
  const { id }      = useParams();
  const navigate    = useNavigate();
  const { token, workspaceId, isAuthLoading } = useWebSocket();

  const [loading, setLoading]       = useState(true);
  const [summaryData, setSummaryData] = useState(null);

  useEffect(() => {
    if (isAuthLoading) return;
    async function loadSummary() {
      if (token && workspaceId) {
        const headers = { Authorization: `Bearer ${token}`, "workspace-id": workspaceId };
        try {
          const res = await fetch(`/api/meetings/event/${id}`, { headers });
          if (res.ok) { const data = await res.json(); setSummaryData(buildSummaryFromApi(data.result)); setLoading(false); return; }
        } catch {}
      }
      setTimeout(() => { setSummaryData(getDemoSummary(id)); setLoading(false); }, 600);
    }
    loadSummary();
  }, [id, token, workspaceId, isAuthLoading]);

  if (loading) {
    return (
      <div style={{ padding: "32px 24px", maxWidth: 960, margin: "0 auto" }}>
        {[80, 280, 280].map((h, i) => (
          <div key={i} style={{ height: h, borderRadius: 4, background: "var(--bg-card)", border: "1px solid var(--border)", marginBottom: 16, overflow: "hidden", position: "relative" }}>
            <div style={{ position: "absolute", inset: 0, background: "linear-gradient(90deg, transparent 0%, rgba(31,27,22,0.05) 50%, transparent 100%)", animation: "shimmer-sweep 1.6s ease-in-out infinite" }} />
          </div>
        ))}
      </div>
    );
  }

  const handleSaveActions = async () => {
    if (!token || !workspaceId) return;
    try {
      await fetch(`/api/meetings/event/${id}/actions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "workspace-id": workspaceId, "Content-Type": "application/json" },
        body: JSON.stringify({ actions: summaryData.actions }),
      });
    } catch {}
  };

  const Card = ({ children, style = {} }) => (
    <div style={{ background: "var(--bg-card)", border: "1px solid var(--border-strong)", borderRadius: 4, padding: "18px", ...style }}>
      {children}
    </div>
  );

  const SectionHead = ({ icon: Icon, label, color = "var(--t4)" }) => (
    <div style={{ display: "flex", alignItems: "center", gap: 6, borderBottom: "1px solid var(--border)", paddingBottom: 10, marginBottom: 14 }}>
      <Icon style={{ width: 13, height: 13, color }} />
      <span style={{ fontSize: 10, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--t2)" }}>{label}</span>
    </div>
  );

  const Btn = ({ children, onClick, style = {} }) => {
    const [h, setH] = useState(false);
    return (
      <button onClick={onClick} onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
        style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 14px", borderRadius: 4, background: h ? "rgba(31,27,22,0.07)" : "rgba(31,27,22,0.05)", border: "1px solid var(--border-strong)", color: "var(--t2)", fontSize: 12, fontWeight: 500, cursor: "pointer", transition: "all 100ms", ...style }}>
        {children}
      </button>
    );
  };

  return (
    <div style={{ padding: "24px", maxWidth: 960, margin: "0 auto" }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, marginBottom: 24, flexWrap: "wrap" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
            <CheckSquare style={{ width: 13, height: 13, color: "var(--brand)" }} />
            <span style={{ fontSize: 10, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--brand-text)" }}>Meeting Memory Recorded</span>
          </div>
          <h1 style={{ fontSize: 20, fontWeight: 500, color: "var(--t1)", letterSpacing: "-0.4px", marginBottom: 6 }}>{summaryData.title}</h1>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            {summaryData.time && (
              <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "var(--t4)" }}>
                <Clock style={{ width: 12, height: 12 }} /> {summaryData.time}
              </span>
            )}
            <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "var(--t4)" }}>
              <Users style={{ width: 12, height: 12 }} /> {summaryData.attendees.length} Attendees
            </span>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Btn onClick={handleSaveActions}><Share2 style={{ width: 13, height: 13 }} /> Save</Btn>
          <Btn><Download style={{ width: 13, height: 13 }} /> Export</Btn>
          <button onClick={() => navigate("/meetings")} style={{ padding: "6px 14px", borderRadius: 4, background: "var(--brand)", border: "none", color: "#fff", fontSize: 12, fontWeight: 500, cursor: "pointer" }}>
            Return to Dashboard
          </button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "7fr 5fr", gap: 20 }}>

        {/* Left */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <Card>
            <SectionHead icon={FileText} label="Executive Summary" />
            <p style={{ fontSize: 13, color: "var(--t3)", lineHeight: 1.6, fontWeight: 300 }}>{summaryData.executiveSummary}</p>
          </Card>

          {summaryData.decisions.length > 0 && (
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
                <FileText style={{ width: 13, height: 13, color: "var(--brand)" }} />
                <span style={{ fontSize: 11, fontWeight: 500, color: "var(--t2)" }}>Key Decisions ({summaryData.decisions.length})</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {summaryData.decisions.map((d, i) => <DecisionCard key={i} {...d} />)}
              </div>
            </div>
          )}

          {summaryData.actions.length > 0 && (
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
                <CheckSquare style={{ width: 13, height: 13, color: "var(--p-high)" }} />
                <span style={{ fontSize: 11, fontWeight: 500, color: "var(--t2)" }}>Action Items ({summaryData.actions.length})</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {summaryData.actions.map((a, i) => (
                  <ActionCard key={i} {...a} onApprove={() => alert("Synced to tracker.")} onReject={() => alert("Action dismissed.")} />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          {(summaryData.followUpDraft || summaryData.jiraProposal) && (
            <Card style={{ border: "1px solid rgba(96,165,250,0.20)", background: "rgba(96,165,250,0.03)" }}>
              <SectionHead icon={Mail} label="Suggested Follow-Up" color="var(--p-info)" />
              {summaryData.followUpDraft && (
                <div style={{ background: "rgba(31,27,22,0.045)", border: "1px solid var(--border)", borderRadius: 4, padding: "12px", marginBottom: 10 }}>
                  <span style={{ display: "block", fontSize: 9, fontWeight: 500, color: "var(--t5)", textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 6 }}>Draft Follow-Up</span>
                  <p style={{ fontSize: 11, color: "var(--t3)", fontStyle: "italic", lineHeight: 1.5 }}>"{summaryData.followUpDraft}"</p>
                  <div style={{ display: "flex", justifyContent: "flex-end", paddingTop: 10 }}>
                    <button style={{ display: "flex", alignItems: "center", gap: 4, padding: "5px 12px", borderRadius: 3, background: "rgba(232,103,43,0.10)", border: "1px solid rgba(232,103,43,0.28)", color: "var(--brand-text)", fontSize: 11, fontWeight: 500, cursor: "pointer" }}>
                      <CheckSquare style={{ width: 10, height: 10 }} /> Approve &amp; Send
                    </button>
                  </div>
                </div>
              )}
              {summaryData.jiraProposal && (
                <div style={{ background: "rgba(31,27,22,0.045)", border: "1px solid var(--border)", borderRadius: 4, padding: "12px" }}>
                  <span style={{ display: "block", fontSize: 9, fontWeight: 500, color: "var(--t5)", textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 6 }}>Jira Ticket Proposal</span>
                  <p style={{ fontSize: 12, fontWeight: 500, color: "var(--t1)", marginBottom: 4 }}>{summaryData.jiraProposal.title}</p>
                  <p style={{ fontSize: 11, color: "var(--t4)" }}>Assignee: {summaryData.jiraProposal.owner} | Due: {summaryData.jiraProposal.due}</p>
                  <div style={{ display: "flex", justifyContent: "flex-end", paddingTop: 10 }}>
                    <button style={{ display: "flex", alignItems: "center", gap: 4, padding: "5px 12px", borderRadius: 3, background: "rgba(255,151,65,0.10)", border: "1px solid rgba(255,151,65,0.28)", color: "var(--p-high-text)", fontSize: 11, fontWeight: 500, cursor: "pointer" }}>
                      <CheckSquare style={{ width: 10, height: 10 }} /> Create Issue
                    </button>
                  </div>
                </div>
              )}
            </Card>
          )}

          {summaryData.timeline.length > 0 && (
            <Card>
              <SectionHead icon={Clock} label="Meeting Timeline" />
              <div style={{ borderLeft: "1px solid var(--border)", marginLeft: 8, paddingTop: 4, paddingBottom: 4 }}>
                {summaryData.timeline.map((item, i) => (
                  <div key={i} style={{ position: "relative", paddingLeft: 20, paddingBottom: i < summaryData.timeline.length - 1 ? 20 : 0 }}>
                    <div style={{ position: "absolute", left: -5, top: 4, width: 9, height: 9, borderRadius: "50%", background: TL_COLOR[item.type] || "var(--t5)", border: "2px solid var(--bg-card)" }} />
                    <span style={{ display: "block", fontSize: 9, fontWeight: 500, color: "var(--t5)", marginBottom: 2 }}>{item.time}</span>
                    <span style={{ fontSize: 12, fontWeight: 500, color: TL_COLOR[item.type] || "var(--t2)" }}>{item.event}</span>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
};

export default MeetingSummary;
