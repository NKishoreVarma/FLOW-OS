import { useState, useEffect, useRef } from "react";
import { X, MessageSquare, Users, CornerDownRight, Hash, Send } from "lucide-react";
import SourceBadge from "../ui/SourceBadge";
import DataSourceBadge from "../ui/DataSourceBadge";
import { EmptyState } from "../ui/EmptyState";
import { useEscapeKey } from "../../hooks/useEscapeKey";
import { useWorkspaceState } from "../../hooks/useWorkspaceState";

/**
 * SlackThreadPanel — read a full Slack thread inline (participants, replies,
 * mentions, jump-to-message) without opening Slack.
 *
 * Reuses the generic connector pipeline (no new backend):
 *   POST /api/connectors/execute { connectorId:'slack', actionType:'READ',
 *                                  payload:{ resourceType:'thread', channelId, threadTs } }
 * Falls back to a clearly-labelled demo thread when Slack isn't connected, so the
 * panel is fully usable in dev — same honesty pattern as the Batch-1 pages.
 */
const DEMO_THREAD = {
  channelName: "incidents",
  messages: [
    { id: "m1", from: { name: "Sarah Chen" }, body: "Payments API is throwing 500s in prod. Error rate at 12% and climbing.", timestamp: "2026-07-13T09:02:00Z", type: "message" },
    { id: "m2", from: { name: "David O." }, body: "On it. Looks like the pgvector migration lock is blocking writes. <@sarah> can you pause the deploy?", timestamp: "2026-07-13T09:04:00Z", type: "reply" },
    { id: "m3", from: { name: "Sarah Chen" }, body: "Paused. Rolling back the migration now.", timestamp: "2026-07-13T09:06:00Z", type: "reply" },
    { id: "m4", from: { name: "Priya N." }, body: "Confirmed error rate dropping — 3% and falling. Nice catch <@david>.", timestamp: "2026-07-13T09:11:00Z", type: "reply" },
  ],
};

function renderMentions(text) {
  const parts = String(text || "").split(/(<@[^>]+>|@[A-Za-z][\w.]*)/g);
  return parts.map((p, i) => {
    if (/^<@[^>]+>$/.test(p) || /^@[A-Za-z][\w.]*$/.test(p)) {
      const name = p.replace(/^<@|>$/g, "").replace(/^@/, "");
      return (
        <span key={i} style={{ color: "var(--brand-text)", background: "rgba(232,103,43,0.10)", borderRadius: 3, padding: "0 3px", fontWeight: 500 }}>
          @{name}
        </span>
      );
    }
    return <span key={i}>{p}</span>;
  });
}

function timeOf(ts) {
  try { return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); }
  catch { return ""; }
}

export default function SlackThreadPanel({ channelId, threadTs, title, onClose }) {
  const wsState = useWorkspaceState();
  const isDemoWorkspace = wsState.workspaceMode === 'demo';
  const [state, setState] = useState({ loading: true, messages: [], channelName: "", demo: false, error: false });
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const msgRefs = useRef({});
  useEscapeKey(onClose);

  async function sendReply() {
    const text = reply.trim();
    if (!text || sending) return;
    setSending(true);
    // Optimistic — show the reply immediately.
    const optimistic = { id: `tmp-${Date.now()}`, from: { name: "You" }, body: text, timestamp: new Date().toISOString(), type: "reply" };
    setState((s) => ({ ...s, messages: [...s.messages, optimistic] }));
    setReply("");
    if (!channelId || !threadTs) { setSending(false); return; } // demo thread — keep the optimistic reply
    const token = localStorage.getItem("flow_os_token") || "";
    const wsId = localStorage.getItem("flow_os_workspace_id") || "";
    try {
      await fetch("/api/connectors/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, "workspace-id": wsId },
        body: JSON.stringify({ connectorId: "slack", actionType: "send", payload: { channelId, threadTs, text } }),
      });
    } catch { /* optimistic reply stands; a failed send is rare and non-blocking */ }
    finally { setSending(false); }
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!channelId || !threadTs) {
        if (!cancelled) {
          if (isDemoWorkspace) setState({ loading: false, messages: DEMO_THREAD.messages, channelName: DEMO_THREAD.channelName, demo: true, error: false });
          else setState({ loading: false, messages: [], channelName: "", demo: false, error: false });
        }
        return;
      }
      const token = localStorage.getItem("flow_os_token") || "";
      const wsId  = localStorage.getItem("flow_os_workspace_id") || "";
      try {
        const res = await fetch("/api/connectors/execute", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, "workspace-id": wsId },
          body: JSON.stringify({ connectorId: "slack", actionType: "READ", payload: { resourceType: "thread", channelId, threadTs } }),
        });
        if (!res.ok) throw new Error(`status ${res.status}`);
        const data = await res.json();
        const result = data.result || data;
        const messages = result.messages || [];
        if (cancelled) return;
        if (!messages.length) {
          if (isDemoWorkspace) setState({ loading: false, messages: DEMO_THREAD.messages, channelName: DEMO_THREAD.channelName, demo: true, error: false });
          else setState({ loading: false, messages: [], channelName: "", demo: false, error: false });
        } else {
          setState({ loading: false, messages, channelName: messages[0]?.metadata?.channelName || "", demo: false, error: false });
        }
      } catch {
        if (!cancelled) {
          if (isDemoWorkspace) setState({ loading: false, messages: DEMO_THREAD.messages, channelName: DEMO_THREAD.channelName, demo: true, error: false });
          else setState({ loading: false, messages: [], channelName: "", demo: false, error: false });
        }
      }
    })();
    return () => { cancelled = true; };
  }, [channelId, threadTs]);

  const participants = [...new Set(state.messages.map(m => m.from?.name).filter(Boolean))];
  const jumpTo = (id) => msgRefs.current[id]?.scrollIntoView({ behavior: "smooth", block: "center" });

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose?.(); }}
      role="dialog" aria-modal="true" aria-label="Slack thread"
      style={{ position: "fixed", inset: 0, background: "rgba(31,27,22,0.12)", display: "flex", justifyContent: "flex-end", zIndex: 60, animation: "event-slide-in 0.2s ease" }}
    >
      <div style={{ width: "100%", maxWidth: 460, background: "var(--bg-sidebar)", borderLeft: "1px solid var(--border)", height: "100%", display: "flex", flexDirection: "column" }}>
        {/* Header */}
        <div style={{ padding: "16px 18px", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <MessageSquare style={{ width: 14, height: 14, color: "var(--p-high)" }} />
              <span style={{ fontSize: 13, fontWeight: 500, color: "var(--t1)" }}>Slack Thread</span>
              <SourceBadge source="slack" />
              <DataSourceBadge mode={state.demo ? "demo" : "live"} />
            </div>
            <button onClick={onClose} aria-label="Close thread" style={{ padding: 5, background: "transparent", border: "none", color: "var(--t4)", cursor: "pointer" }}>
              <X style={{ width: 14, height: 14 }} />
            </button>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--t4)" }}>
            <Hash style={{ width: 10, height: 10 }} />
            <span>{state.channelName || title || "thread"}</span>
          </div>
          {/* Participants + jump-to */}
          {participants.length > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
              <Users style={{ width: 11, height: 11, color: "var(--t5)" }} />
              {participants.map((p, i) => {
                const firstMsg = state.messages.find(m => m.from?.name === p);
                return (
                  <button key={i} onClick={() => firstMsg && jumpTo(firstMsg.id)}
                    title={`Jump to ${p}'s first message`}
                    style={{ padding: "2px 8px", borderRadius: 10, fontSize: 11, cursor: "pointer", background: "rgba(31,27,22,0.05)", border: "1px solid var(--border)", color: "var(--t3)" }}>
                    {p}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Messages */}
        <div style={{ flex: 1, overflowY: "auto", padding: "14px 18px" }}>
          {state.loading ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {[0, 1, 2].map(i => (
                <div key={i} style={{ height: 48, borderRadius: 6, background: "rgba(31,27,22,0.04)", border: "1px solid var(--border)", position: "relative", overflow: "hidden" }}>
                  <div style={{ position: "absolute", inset: 0, background: "linear-gradient(90deg, transparent 0%, rgba(31,27,22,0.05) 50%, transparent 100%)", animation: "shimmer-sweep 1.6s ease-in-out infinite" }} />
                </div>
              ))}
            </div>
          ) : state.messages.length === 0 ? (
            <EmptyState variant="inbox" message="Empty thread" description="No messages in this thread." />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {state.messages.map((m, i) => {
                const isReply = m.type === "reply" || (i > 0);
                return (
                  <div key={m.id || i} ref={el => { if (el) msgRefs.current[m.id] = el; }}
                    style={{ display: "flex", gap: 8, paddingLeft: isReply ? 14 : 0 }}>
                    {isReply && <CornerDownRight style={{ width: 12, height: 12, color: "var(--t5)", marginTop: 3, flexShrink: 0 }} />}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 3 }}>
                        <span style={{ fontSize: 12, fontWeight: 500, color: "var(--t2)" }}>{m.from?.name || "unknown"}</span>
                        <span style={{ fontSize: 10, color: "var(--t5)", fontVariantNumeric: "tabular-nums" }}>{timeOf(m.timestamp)}</span>
                      </div>
                      <p style={{ fontSize: 13, color: "var(--t2)", lineHeight: 1.6, margin: 0, whiteSpace: "pre-wrap" }}>
                        {renderMentions(m.body || m.subject)}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Reply in-thread — finish the Slack conversation inside FLOW (no Slack app) */}
        <div style={{ padding: "10px 14px", borderTop: "1px solid var(--border)", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 8 }}>
            <textarea
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendReply(); } }}
              placeholder="Reply in thread…"
              rows={1}
              style={{ flex: 1, resize: "none", background: "var(--bg-card)", border: "1px solid var(--border-strong)", borderRadius: 6, padding: "8px 10px", fontSize: 13, color: "var(--t1)", outline: "none", fontFamily: "inherit", maxHeight: 80 }}
            />
            <button onClick={sendReply} disabled={!reply.trim() || sending}
              style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "8px 12px", borderRadius: 6, fontSize: 12, fontWeight: 500, cursor: reply.trim() && !sending ? "pointer" : "default", background: reply.trim() ? "var(--brand)" : "rgba(232,103,43,0.3)", border: "none", color: "#fff" }}>
              <Send style={{ width: 12, height: 12 }} /> {sending ? "…" : "Send"}
            </button>
          </div>
          <div style={{ fontSize: 10, color: "var(--t5)", marginTop: 6 }}>
            {state.messages.length} message{state.messages.length !== 1 ? "s" : ""} · {participants.length} participant{participants.length !== 1 ? "s" : ""}
          </div>
        </div>
      </div>
    </div>
  );
}
