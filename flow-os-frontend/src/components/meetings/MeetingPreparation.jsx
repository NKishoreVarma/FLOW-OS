import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Calendar, Users, FileText, ArrowLeft, ArrowRight, HelpCircle, CheckCircle, Video, Brain } from "lucide-react";
import { useWebSocket } from "../../hooks/useWebSocket";

function getDemoContext(id) {
  return {
    title:     id === "m2" ? "PostgreSQL Migration Plan" : "Architecture Sync",
    time:      id === "m2" ? "Today, 2:30 PM"           : "Today, 10:00 AM",
    attendees: ["Kishore Varma", "Sarah Chen", "David O."],
    videoUrl:  null,
    agenda: [
      "Review current database latency metrics",
      "Discuss downtime windows",
      "Approve fallback strategy",
    ],
    docs: [
      { title: "RFC-17: Obsidian Vault Storage",  source: "notion" },
      { title: "DB Latency Report",               source: "gmail"  },
    ],
    questions: [
      "What is the hard deadline for the migration?",
      "Are there any blockers from the ops team?",
    ],
    aiPrep: null,
  };
}

function formatEventDateTime(startTime) {
  if (!startTime) return "";
  return new Date(startTime).toLocaleString([], {
    weekday: "short", month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit",
  });
}

function buildContextFromApi(event, prepData) {
  const agendaLines = event.agenda
    ? event.agenda.split(/\n+/).map(l => l.replace(/^[-*•]\s*/, "").trim()).filter(Boolean)
    : [];
  const relatedDocs = (prepData?.relatedChunks || []).map(c => ({
    title: c.excerpt?.slice(0, 60) || c.source,
    source: c.source || "flow",
  }));
  return {
    title:     event.title,
    time:      formatEventDateTime(event.startTime),
    attendees: (event.participants || []).map(p => p.name || p.email).filter(Boolean),
    videoUrl:  event.videoUrl || null,
    agenda:    agendaLines.length > 0 ? agendaLines : ["Agenda not set"],
    docs:      relatedDocs,
    questions: prepData?.suggestedQuestions || [],
    aiPrep:    prepData?.aiPrep || null,
  };
}

const SOURCE_COLORS = {
  notion: "var(--t4)", gmail: "#EA4335", github: "#e6edf3",
  slack: "#E01E5A", flow: "var(--brand)",
};

export const MeetingPreparation = () => {
  const { id }      = useParams();
  const navigate    = useNavigate();
  const { token, workspaceId, isAuthLoading } = useWebSocket();

  const [loading, setLoading] = useState(true);
  const [context, setContext] = useState(null);

  useEffect(() => {
    if (isAuthLoading) return;
    async function loadContext() {
      if (token && workspaceId) {
        const headers = { Authorization: `Bearer ${token}`, "workspace-id": workspaceId };
        try {
          const [eventRes, contextRes] = await Promise.all([
            fetch(`/api/meetings/event/${id}`,         { headers }),
            fetch(`/api/meetings/event/${id}/context`, { headers }),
          ]);
          if (eventRes.ok) {
            const eventData = await eventRes.json();
            const prepData  = contextRes.ok ? (await contextRes.json()).result : null;
            setContext(buildContextFromApi(eventData.result, prepData));
            setLoading(false);
            return;
          }
        } catch {}
      }
      setTimeout(() => { setContext(getDemoContext(id)); setLoading(false); }, 600);
    }
    loadContext();
  }, [id, token, workspaceId, isAuthLoading]);

  if (loading) {
    return (
      <div style={{ padding: "32px 24px", maxWidth: 960, margin: "0 auto" }}>
        {[120, 200, 200].map((h, i) => (
          <div key={i} style={{ height: h, borderRadius: 4, background: "var(--bg-card)", border: "1px solid var(--border)", marginBottom: 16, overflow: "hidden", position: "relative" }}>
            <div style={{ position: "absolute", inset: 0, background: "linear-gradient(90deg, transparent 0%, rgba(31,27,22,0.05) 50%, transparent 100%)", animation: "shimmer-sweep 1.6s ease-in-out infinite" }} />
          </div>
        ))}
      </div>
    );
  }

  const Card = ({ children, style = {} }) => (
    <div style={{ background: "var(--bg-card)", border: "1px solid var(--border-strong)", borderRadius: 4, padding: "18px", ...style }}>
      {children}
    </div>
  );

  const SectionHead = ({ icon: Icon, label, color = "var(--t4)", extra }) => (
    <div style={{ display: "flex", alignItems: "center", gap: 6, borderBottom: "1px solid var(--border)", paddingBottom: 10, marginBottom: 14 }}>
      <Icon style={{ width: 13, height: 13, color }} />
      <span style={{ fontSize: 10, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--t2)" }}>{label}</span>
      {extra}
    </div>
  );

  return (
    <div style={{ padding: "24px", maxWidth: 960, margin: "0 auto" }}>

      <button
        onClick={() => navigate("/meetings")}
        style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--t4)", background: "none", border: "none", cursor: "pointer", marginBottom: 20, padding: 0 }}
      >
        <ArrowLeft style={{ width: 13, height: 13 }} />
        Back to Dashboard
      </button>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, marginBottom: 24, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 500, color: "var(--t1)", letterSpacing: "-0.4px", marginBottom: 6 }}>{context.title}</h1>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "var(--t4)" }}>
              <Calendar style={{ width: 12, height: 12 }} /> {context.time}
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "var(--t4)" }}>
              <Users style={{ width: 12, height: 12 }} /> {context.attendees.length} Attendees
            </span>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {context.videoUrl && (
            <a
              href={context.videoUrl}
              target="_blank"
              rel="noreferrer"
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 4, border: "1px solid rgba(52,168,83,0.30)", background: "rgba(52,168,83,0.08)", color: "#34A853", fontSize: 12, fontWeight: 500, textDecoration: "none" }}
            >
              <Video style={{ width: 13, height: 13 }} /> Join Google Meet
            </a>
          )}
          <button
            onClick={() => navigate(`/meetings/${id}/live`)}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 4, background: "var(--brand)", border: "none", color: "#fff", fontSize: 12, fontWeight: 500, cursor: "pointer" }}
          >
            <Video style={{ width: 13, height: 13 }} /> Join Live Intelligence <ArrowRight style={{ width: 13, height: 13 }} />
          </button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "7fr 5fr", gap: 20 }}>

        {/* Left col */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          {context.aiPrep && (
            <Card style={{ border: "1px solid rgba(232,103,43,0.22)", background: "rgba(232,103,43,0.04)" }}>
              <SectionHead icon={Brain} label="AI Meeting Brief" color="var(--brand)"
                extra={<span style={{ marginLeft: "auto", fontSize: 9, fontWeight: 500, color: "var(--brand-text)", background: "rgba(232,103,43,0.10)", border: "1px solid rgba(232,103,43,0.22)", padding: "2px 7px", borderRadius: 3 }}>RAG Sourced</span>}
              />
              <p style={{ fontSize: 12, color: "var(--t3)", lineHeight: 1.6, whiteSpace: "pre-line" }}>{context.aiPrep}</p>
            </Card>
          )}

          <Card>
            <SectionHead icon={FileText} label="Meeting Agenda" color="var(--brand)" />
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
              {context.agenda.map((item, idx) => (
                <li key={idx} style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 13, color: "var(--t3)" }}>
                  <CheckCircle style={{ width: 13, height: 13, color: "var(--t5)", marginTop: 2, flexShrink: 0 }} />
                  {item}
                </li>
              ))}
            </ul>
          </Card>

          {context.questions.length > 0 && (
            <Card style={{ border: "1px solid rgba(96,165,250,0.20)", background: "rgba(96,165,250,0.03)" }}>
              <SectionHead icon={HelpCircle} label="Suggested Questions to Ask" color="var(--p-info)" />
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {context.questions.map((q, idx) => (
                  <div key={idx} style={{ background: "rgba(31,27,22,0.045)", border: "1px solid var(--border)", borderRadius: 3, padding: "8px 12px", fontSize: 12, color: "var(--p-info-text)", lineHeight: 1.5 }}>
                    "{q}"
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>

        {/* Right col */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          <Card>
            <SectionHead icon={Users} label="Attendees" />
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {context.attendees.map((a, i) => (
                <span key={i} style={{ fontSize: 11, fontWeight: 500, padding: "3px 8px", borderRadius: 10, background: "rgba(31,27,22,0.05)", border: "1px solid var(--border)", color: "var(--t3)" }}>{a}</span>
              ))}
            </div>
          </Card>

          {context.docs.length > 0 && (
            <Card>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid var(--border)", paddingBottom: 10, marginBottom: 14 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <FileText style={{ width: 13, height: 13, color: "var(--p-normal)" }} />
                  <span style={{ fontSize: 10, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--t2)" }}>Related Context</span>
                </div>
                <span style={{ fontSize: 9, fontWeight: 500, color: "var(--t5)", background: "rgba(31,27,22,0.05)", border: "1px solid var(--border)", padding: "2px 6px", borderRadius: 3 }}>RAG Sourced</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {context.docs.map((doc, idx) => (
                  <div key={idx} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 10px", background: "rgba(31,27,22,0.04)", border: "1px solid var(--border)", borderRadius: 3, cursor: "pointer" }}>
                    <span style={{ fontSize: 12, fontWeight: 500, color: "var(--t2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", paddingRight: 8 }}>{doc.title}</span>
                    <span style={{ fontSize: 9, fontWeight: 500, color: SOURCE_COLORS[doc.source] || "var(--t4)", flexShrink: 0, textTransform: "uppercase" }}>{doc.source}</span>
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

export default MeetingPreparation;
