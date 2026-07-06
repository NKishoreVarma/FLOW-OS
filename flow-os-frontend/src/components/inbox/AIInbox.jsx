import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Mail, CornerUpLeft, X, RefreshCw, Zap } from "lucide-react";
import SourceBadge from "../ui/SourceBadge";
import { useWebSocket } from "../../hooks/useWebSocket";

// ─── Demo data ────────────────────────────────────────────────────────────────

const DEMO_INBOX = [
  { id: "e1", from: "Acme Corp (Client)",   subject: "Escalation: Production API Latency",      priority: "critical",  snippet: "We are seeing 500ms+ latency on the primary ingestion endpoints.",                           timestamp: new Date(Date.now() - 10 * 60000).toISOString(),    aiSuggestion: "Acknowledge immediately. Offer a 1-hour update. Reference the DB migration as likely cause." },
  { id: "e2", from: "Sarah Chen",           subject: "Re: Design Tokens",                        priority: "high",      snippet: "I've attached the missing Figma tokens. Can you integrate them today?",                      timestamp: new Date(Date.now() - 2 * 3600000).toISOString(),   aiSuggestion: "Reply confirming timeline. Tokens are already integrated in this sprint." },
  { id: "e3", from: "GitHub Notifications", subject: "Dependabot: Bump react-router-dom",        priority: "low",       snippet: "Bumps react-router-dom from 6.22 to 6.23.",                                                  timestamp: new Date(Date.now() - 5 * 3600000).toISOString(),   aiSuggestion: "Low risk. Merge after quick review of changelog." },
  { id: "e4", from: "James K. (CTO)",       subject: "Q3 Architecture Review — Your Input Needed", priority: "high",   snippet: "Please prepare a 2-slide summary of our current vector DB strategy for the board.",          timestamp: new Date(Date.now() - 8 * 3600000).toISOString(),   aiSuggestion: "High priority. Reference the pgvector migration doc and Synapse Engine design." },
  { id: "e5", from: "TechStartup Inc.",     subject: "Partnership Inquiry — AI Integration",     priority: "low",       snippet: "We are building on top of FLOW's API and would love to discuss a partnership.",              timestamp: new Date(Date.now() - 24 * 3600000).toISOString(),  aiSuggestion: "Forward to business development. Promising enterprise lead." },
  { id: "e6", from: "On-Call Alert",        subject: "ALERT: CPU spike on prod-api-03",           priority: "critical", snippet: "CPU utilization at 94% for 5+ minutes. Auto-scaling triggered.",                              timestamp: new Date(Date.now() - 15 * 60000).toISOString(),    aiSuggestion: "Check ingestion queue backlog. Likely correlation with increased ingest volume." },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalizeMessage(msg) {
  return {
    id:           msg.id || msg.messageId,
    from:         msg.from || msg.sender || "Unknown",
    subject:      msg.subject || "(no subject)",
    snippet:      msg.snippet || (typeof msg.body === "string" ? msg.body.slice(0, 100) : ""),
    timestamp:    msg.timestamp || msg.date || new Date().toISOString(),
    priority:     msg.labels?.includes?.("important") ? "high" : "low",
    aiSuggestion: msg.aiSuggestion || null,
  };
}

function timeAgo(ts) {
  try {
    const d = Date.now() - new Date(ts).getTime();
    const m = Math.floor(d / 60000);
    if (m < 60)  return `${m}m ago`;
    if (m < 1440) return `${Math.floor(m / 60)}h ago`;
    return `${Math.floor(m / 1440)}d ago`;
  } catch { return ""; }
}

const P_COLOR = {
  critical: "var(--p-critical)",
  high:     "var(--p-high)",
  low:      "var(--t4)",
};

const P_LABEL = {
  critical: "Critical",
  high:     "Action Needed",
  low:      "FYI",
};

const TABS = ["Critical", "Action Needed", "FYI", "All"];

// ─── EmailRow ─────────────────────────────────────────────────────────────────

function EmailRow({ email, selected, onClick }) {
  const [h, setH] = useState(false);
  const color = P_COLOR[email.priority] || P_COLOR.low;
  const isActive = selected;

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      style={{
        position:     "relative",
        background:   isActive ? "var(--bg-hover)" : h ? "var(--bg-card)" : "transparent",
        border:       `1px solid ${isActive ? "rgba(124,110,255,0.35)" : h ? "var(--border-strong)" : "var(--border)"}`,
        borderLeft:   `2px solid ${isActive ? "var(--brand)" : color}`,
        borderRadius:  4,
        padding:      "12px 14px",
        marginBottom:  4,
        cursor:       "pointer",
        transition:   "background 100ms, border-color 100ms",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 5 }}>
        <span style={{
          fontFamily:   "'JetBrains Mono', monospace",
          fontSize:      9,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color,
        }}>
          {P_LABEL[email.priority] || "FYI"}
        </span>
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: "var(--t5)" }}>
          {timeAgo(email.timestamp)}
        </span>
      </div>
      <div style={{ fontSize: 13, fontWeight: 500, color: "var(--t1)", marginBottom: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {email.subject}
      </div>
      <div style={{ fontSize: 12, color: "var(--t3)", marginBottom: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {email.from}
      </div>
      <div style={{ fontSize: 12, color: "var(--t3)", lineHeight: 1.45, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
        {email.snippet}
      </div>
      {email.aiSuggestion && (
        <div style={{
          marginTop: 8, display: "inline-flex", alignItems: "center", gap: 5,
          fontSize: 10, color: "var(--brand-text)",
          background: "var(--brand-dim)", border: "1px solid var(--brand-line)",
          borderRadius: 3, padding: "3px 7px",
          fontFamily: "'JetBrains Mono', monospace",
        }}>
          <Zap style={{ width: 9, height: 9 }} />
          AI suggestion ready
        </div>
      )}
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export const AIInbox = () => {
  const { token, workspaceId, isAuthLoading } = useWebSocket();
  const [messages, setMessages]           = useState([]);
  const [loading, setLoading]             = useState(true);
  const [isDemo, setIsDemo]               = useState(false);
  const [selected, setSelected]           = useState(null);
  const [draftText, setDraftText]         = useState("");
  const [sending, setSending]             = useState(false);
  const [activeTab, setActiveTab]         = useState("All");
  const [focusedInput, setFocusedInput]   = useState(false);

  const headers = {
    Authorization: `Bearer ${token}`,
    "workspace-id": workspaceId || "workspace_corp_alpha",
    "Content-Type": "application/json",
  };

  const loadInbox = useCallback(async () => {
    if (isAuthLoading) return;
    setLoading(true);
    try {
      const res = await fetch("/api/communication/inbox?limit=20&provider=gmail", { headers });
      if (!res.ok) throw new Error();
      const data = await res.json();
      const raw  = data.result?.messages || data.result || [];
      const msgs = Array.isArray(raw) ? raw.map(normalizeMessage) : [];
      if (msgs.length > 0) { setMessages(msgs); setIsDemo(false); }
      else { setMessages(DEMO_INBOX); setIsDemo(true); }
    } catch {
      setMessages(DEMO_INBOX);
      setIsDemo(true);
    } finally {
      setLoading(false);
    }
  }, [token, workspaceId, isAuthLoading]);

  useEffect(() => { setTimeout(() => loadInbox(), 0); }, [loadInbox]);

  const handleSendReply = async () => {
    if (!selected || !draftText.trim()) return;
    if (isDemo) { alert("Sent! (demo)"); setDraftText(""); return; }
    setSending(true);
    try {
      const res = await fetch(`/api/communication/reply/${selected.id}?provider=gmail`, {
        method: "POST", headers,
        body: JSON.stringify({ body: draftText, provider: "gmail" }),
      });
      if (!res.ok) throw new Error();
      setDraftText("");
    } catch { alert("Failed to send reply."); } finally { setSending(false); }
  };

  const filteredMessages = messages.filter(m => {
    if (activeTab === "All")           return true;
    if (activeTab === "Critical")      return m.priority === "critical";
    if (activeTab === "Action Needed") return m.priority === "high";
    if (activeTab === "FYI")           return m.priority === "low";
    return true;
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--bg-base)" }}>
      {/* Page header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "20px 32px 0",
        flexShrink: 0,
      }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
            <Mail style={{ width: 16, height: 16, color: "var(--brand)" }} />
            <h1 style={{ fontSize: 16, fontWeight: 500, color: "var(--t1)", letterSpacing: "-0.3px" }}>
              Inbox
            </h1>
            {isDemo && (
              <span style={{
                fontFamily: "'JetBrains Mono', monospace", fontSize: 9,
                background: "rgba(255,255,255,0.04)", border: "1px solid var(--border)",
                borderRadius: 3, padding: "2px 6px", color: "var(--t5)",
                textTransform: "uppercase", letterSpacing: "0.06em",
              }}>Demo</span>
            )}
          </div>
          <p style={{ fontSize: 12, color: "var(--t4)" }}>
            Communications prioritized and drafted by FLOW
          </p>
        </div>

        <button
          onClick={loadInbox}
          disabled={loading}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "6px 12px", fontSize: 12, fontWeight: 500,
            color: "var(--t3)", background: "rgba(255,255,255,0.03)",
            border: "1px solid var(--border)", borderRadius: 4,
            cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.5 : 1,
            transition: "all 100ms",
          }}
          onMouseEnter={e => e.currentTarget.style.color = "var(--t1)"}
          onMouseLeave={e => e.currentTarget.style.color = "var(--t3)"}
        >
          <RefreshCw style={{ width: 11, height: 11, ...(loading ? { animation: "spin 1s linear infinite" } : {}) }} />
          Refresh
        </button>
      </div>

      {/* Tabs */}
      <div style={{
        display: "flex", borderBottom: "1px solid var(--border)",
        padding: "0 32px", marginTop: 16, flexShrink: 0,
      }}>
        {TABS.map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              padding: "8px 14px", fontSize: 13,
              fontWeight: activeTab === tab ? 500 : 400,
              color: activeTab === tab ? "var(--t1)" : "var(--t4)",
              borderBottom: `2px solid ${activeTab === tab ? "var(--brand)" : "transparent"}`,
              background: "none", border: "none",
              borderBottom: `2px solid ${activeTab === tab ? "var(--brand)" : "transparent"}`,
              cursor: "pointer", transition: "color 100ms", whiteSpace: "nowrap",
            }}
            onMouseEnter={e => { if (activeTab !== tab) e.currentTarget.style.color = "var(--t2)"; }}
            onMouseLeave={e => { if (activeTab !== tab) e.currentTarget.style.color = "var(--t4)"; }}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Body */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {/* Email list */}
        <div style={{
          width: 380, flexShrink: 0,
          borderRight: "1px solid var(--border)",
          overflowY: "auto",
          padding: "16px 16px",
        }}>
          {loading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <div key={i} style={{ marginBottom: 4 }}>
                <div style={{ height: 64, borderRadius: 4, background: "rgba(255,255,255,0.02)", border: "1px solid var(--border)", position: "relative", overflow: "hidden" }}>
                    <div style={{ position: "absolute", inset: 0, background: "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.04) 50%, transparent 100%)", animation: "shimmer-sweep 1.6s ease-in-out infinite" }} />
                  </div>
              </div>
            ))
          ) : filteredMessages.length === 0 ? (
            <div style={{ textAlign: "center", padding: "48px 0", color: "var(--t4)", fontSize: 13 }}>
              No messages in this folder.
            </div>
          ) : (
            filteredMessages.map(email => (
              <EmailRow
                key={email.id}
                email={email}
                selected={selected?.id === email.id}
                onClick={() => { setSelected(email); setDraftText(""); }}
              />
            ))
          )}
        </div>

        {/* Detail pane */}
        <div style={{ flex: 1, overflowY: "auto", padding: "24px 32px" }}>
          {selected ? (
            <motion.div
              key={selected.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
            >
              {/* Header */}
              <div style={{ marginBottom: 24 }}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 8 }}>
                  <h2 style={{ fontSize: 18, fontWeight: 500, color: "var(--t1)", letterSpacing: "-0.4px", lineHeight: 1.3, flex: 1, paddingRight: 16 }}>
                    {selected.subject}
                  </h2>
                  <SourceBadge source="gmail" />
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12, color: "var(--t3)" }}>
                  <span style={{ color: "var(--t2)", fontWeight: 500 }}>{selected.from}</span>
                  <span style={{ color: "var(--t5)" }}>·</span>
                  <span>{timeAgo(selected.timestamp)}</span>
                </div>
              </div>

              {/* Body */}
              <div style={{
                background: "var(--bg-card)", border: "1px solid var(--border)",
                borderRadius: 4, padding: "16px 18px",
                fontSize: 13, color: "var(--t2)", lineHeight: 1.7,
                marginBottom: 20,
              }}>
                {selected.snippet}
                <br /><br />
                <span style={{ color: "var(--t4)" }}>(Full thread available when Gmail is connected.)</span>
              </div>

              {/* AI suggestion */}
              {selected.aiSuggestion && (
                <div style={{
                  background: "rgba(124,110,255,0.06)", border: "1px solid var(--brand-line)",
                  borderLeft: "2px solid var(--brand)",
                  borderRadius: 4, padding: "12px 14px", marginBottom: 20,
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                    <Zap style={{ width: 11, height: 11, color: "var(--brand)" }} />
                    <span style={{
                      fontFamily: "'JetBrains Mono', monospace",
                      fontSize: 9, color: "var(--brand-text)",
                      textTransform: "uppercase", letterSpacing: "0.08em",
                    }}>
                      AI Suggestion
                    </span>
                  </div>
                  <p style={{ fontSize: 13, color: "var(--t2)", lineHeight: 1.6 }}>
                    {selected.aiSuggestion}
                  </p>
                </div>
              )}

              {/* Reply composer */}
              <div style={{
                background: "var(--bg-card)", border: "1px solid var(--border)",
                borderRadius: 4, padding: "14px",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
                  <CornerUpLeft style={{ width: 12, height: 12, color: "var(--brand)" }} />
                  <span style={{
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: 9, textTransform: "uppercase",
                    letterSpacing: "0.08em", color: "var(--t4)",
                  }}>
                    Reply
                  </span>
                </div>
                <textarea
                  value={draftText}
                  onChange={e => setDraftText(e.target.value)}
                  placeholder="Write your reply…"
                  rows={5}
                  onFocus={() => setFocusedInput(true)}
                  onBlur={() => setFocusedInput(false)}
                  style={{
                    width: "100%",
                    background: focusedInput ? "rgba(124,110,255,0.04)" : "rgba(255,255,255,0.02)",
                    border: `1px solid ${focusedInput ? "rgba(124,110,255,0.35)" : "var(--border-strong)"}`,
                    borderRadius: 4, padding: "10px 12px",
                    fontSize: 13, color: "var(--t1)", lineHeight: 1.6,
                    resize: "none", outline: "none", transition: "border-color 150ms, background 150ms",
                    fontFamily: "'Inter', -apple-system, sans-serif",
                    marginBottom: 10,
                  }}
                />
                <style>{`textarea::placeholder { color: var(--t5); }`}</style>
                <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                  <button
                    onClick={() => { setSelected(null); setDraftText(""); }}
                    style={{
                      padding: "6px 12px", fontSize: 12, fontWeight: 500,
                      background: "transparent", border: "1px solid var(--border-strong)",
                      borderRadius: 4, color: "var(--t3)", cursor: "pointer", transition: "all 100ms",
                    }}
                    onMouseEnter={e => e.currentTarget.style.color = "var(--t1)"}
                    onMouseLeave={e => e.currentTarget.style.color = "var(--t3)"}
                  >
                    Discard
                  </button>
                  <button
                    onClick={handleSendReply}
                    disabled={sending || !draftText.trim()}
                    style={{
                      padding: "6px 14px", fontSize: 12, fontWeight: 500,
                      background: sending || !draftText.trim() ? "rgba(124,110,255,0.15)" : "var(--brand)",
                      border: "1px solid rgba(124,110,255,0.40)",
                      borderRadius: 4, color: "#fff",
                      cursor: sending || !draftText.trim() ? "not-allowed" : "pointer",
                      opacity: sending || !draftText.trim() ? 0.6 : 1,
                      transition: "all 100ms",
                      display: "flex", alignItems: "center", gap: 6,
                    }}
                  >
                    {sending && <span style={{ width: 10, height: 10, borderRadius: "50%", border: "1.5px solid #fff", borderTopColor: "transparent", animation: "spin 0.7s linear infinite" }} />}
                    {sending ? "Sending…" : "Send reply"}
                  </button>
                </div>
              </div>
            </motion.div>
          ) : (
            <div style={{
              display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center",
              height: "100%", minHeight: 400,
            }}>
              <div style={{
                width: 40, height: 40, borderRadius: 6,
                background: "rgba(255,255,255,0.03)",
                border: "1px solid var(--border)",
                display: "flex", alignItems: "center", justifyContent: "center",
                marginBottom: 12,
              }}>
                <Mail style={{ width: 16, height: 16, color: "var(--t5)" }} />
              </div>
              <p style={{ fontSize: 13, color: "var(--t4)" }}>Select an email to read</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AIInbox;
