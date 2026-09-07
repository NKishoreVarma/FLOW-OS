import { useState, useEffect } from "react";
import { X, Calendar, Sparkles, ExternalLink, MessageCircleQuestion } from "lucide-react";
import { useEscapeKey } from "../../hooks/useEscapeKey";

/**
 * InlineMeetingPrep (Phase 16) — prep for a meeting without leaving the Inbox. Fetches
 * the AI prep context the Meeting Capability already produces
 * (`GET /api/meetings/event/:id/context`): a brief, related evidence, and suggested
 * questions. Each question is one click to hand off to the Operational Brain. Honest
 * demo fallback when no calendar is connected. No new backend.
 */
const DEMO = {
  brief: "Acme renewal is at risk — sentiment dipped after the March outage. Lead with the reliability fixes shipped since, then the expansion offer. David O. owns the technical relationship.",
  suggestedQuestions: [
    "What's the latest on Acme's open support tickets?",
    "What did we commit to Acme in the last QBR?",
    "Which features has Acme requested that we've shipped?",
  ],
};

export default function InlineMeetingPrep({ eventId, title, videoUrl, onClose, onAsk }) {
  const [state, setState] = useState({ loading: true, brief: null, questions: [], demo: false });
  useEscapeKey(onClose);

  useEffect(() => {
    if (!eventId) { setState({ loading: false, ...DEMO, questions: DEMO.suggestedQuestions, demo: true }); return; }
    let cancelled = false;
    (async () => {
      const token = localStorage.getItem("flow_os_token") || "";
      const wsId = localStorage.getItem("flow_os_workspace_id") || "";
      try {
        const res = await fetch(`/api/meetings/event/${encodeURIComponent(eventId)}/context`, {
          headers: { Authorization: `Bearer ${token}`, "workspace-id": wsId },
        });
        if (!res.ok) throw new Error(String(res.status));
        const data = await res.json();
        const ctx = data.context || data;
        const brief = ctx.brief || ctx.aiBrief || ctx.summary;
        const questions = ctx.suggestedQuestions || ctx.questions || [];
        if (cancelled) return;
        if (!brief && !questions.length) setState({ loading: false, ...DEMO, questions: DEMO.suggestedQuestions, demo: true });
        else setState({ loading: false, brief, questions, demo: false });
      } catch {
        if (!cancelled) setState({ loading: false, ...DEMO, questions: DEMO.suggestedQuestions, demo: true });
      }
    })();
    return () => { cancelled = true; };
  }, [eventId]);

  return (
    <div onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
      role="dialog" aria-modal="true" aria-label="Meeting prep"
      style={{ position: "fixed", inset: 0, background: "rgba(31,27,22,0.12)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 70, animation: "event-slide-in 0.15s ease" }}>
      <div style={{ width: "100%", maxWidth: 560, maxHeight: "82vh", background: "var(--bg-sidebar)", border: "1px solid var(--border)", borderRadius: 8, display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderBottom: "1px solid var(--border)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
            <Calendar style={{ width: 14, height: 14, color: "var(--p-normal)", flexShrink: 0 }} />
            <span style={{ fontSize: 13, fontWeight: 500, color: "var(--t1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title || "Meeting prep"}</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {videoUrl && <a href={videoUrl} target="_blank" rel="noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 500, color: "var(--p-normal-text)", textDecoration: "none", border: "1px solid rgba(76,175,130,0.3)", borderRadius: 4, padding: "4px 10px" }}>Join <ExternalLink style={{ width: 10, height: 10 }} /></a>}
            <button onClick={onClose} aria-label="Close prep" style={{ padding: 5, background: "transparent", border: "none", color: "var(--t4)", cursor: "pointer" }}><X style={{ width: 14, height: 14 }} /></button>
          </div>
        </div>

        <div style={{ padding: "16px", overflowY: "auto", display: "flex", flexDirection: "column", gap: 16 }}>
          {state.loading ? (
            <div style={{ fontSize: 12, color: "var(--t5)" }}>Preparing…</div>
          ) : (
            <>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                  <Sparkles style={{ width: 12, height: 12, color: "var(--brand)" }} />
                  <span style={{ fontSize: 10, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--brand-text)" }}>AI prep brief</span>
                </div>
                <p style={{ fontSize: 13, color: "var(--t2)", lineHeight: 1.65, margin: 0 }}>{state.brief}</p>
              </div>
              {state.questions.length > 0 && (
                <div>
                  <span style={{ fontSize: 10, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--t5)", display: "block", marginBottom: 8 }}>Questions to explore</span>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {state.questions.map((q, i) => (
                      <button key={i} onClick={() => { onAsk?.(q); onClose?.(); }}
                        style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 11px", borderRadius: 6, cursor: "pointer", textAlign: "left", background: "rgba(232,103,43,0.05)", border: "1px solid var(--brand-line)", color: "var(--t2)", fontSize: 12 }}>
                        <MessageCircleQuestion style={{ width: 12, height: 12, color: "var(--brand)", flexShrink: 0 }} /> {q}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
