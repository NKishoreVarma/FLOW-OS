import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Zap } from "lucide-react";
import { useNavigate } from "react-router-dom";
import BrainMessage from "./BrainMessage";
import ConversationInput from "./ConversationInput";
import SlackThreadPanel from "../slack/SlackThreadPanel";

// ─── Cache ────────────────────────────────────────────────────────────────────

const BRIEF_KEY   = "flow_brief_v5";
const SESSION_KEY = "flow_home_msgs_v4";
const BRIEF_TTL   = 4 * 60 * 60 * 1000;

function loadBriefCache() {
  try {
    const raw = sessionStorage.getItem(BRIEF_KEY);
    if (!raw) return null;
    const { brief, ts } = JSON.parse(raw);
    if (Date.now() - ts > BRIEF_TTL) { sessionStorage.removeItem(BRIEF_KEY); return null; }
    return brief;
  } catch { return null; }
}
function saveBriefCache(b) {
  try { sessionStorage.setItem(BRIEF_KEY, JSON.stringify({ brief: b, ts: Date.now() })); } catch {}
}
function loadMessages() {
  try { return JSON.parse(sessionStorage.getItem(SESSION_KEY) || "[]"); } catch { return []; }
}
function saveMessages(msgs) {
  try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(msgs.slice(-30))); } catch {}
}

// ─── Demo data ────────────────────────────────────────────────────────────────

const DEMO_BRIEF = {
  overview: "Two deployments completed without issues yesterday. Sales closed one enterprise account. One customer renewal may need your attention today.",
  highlights: [
    {
      label: "Action needed",
      title: "Payment gateway PR #447 is blocking the 2pm release",
      body: "Rahul has been waiting for your review since yesterday. Merge readiness 78%.",
      priority: "high",
      source: "GitHub · #engineering",
    },
    {
      label: "Meetings",
      title: "2 meetings today, starting in 47 minutes",
      body: "Standup at 10:00 AM · 1:1 with Rahul at 2:00 PM",
      priority: "medium",
      source: "Google Calendar",
    },
    {
      label: "Inbox",
      title: "TechCorp replied to your proposal — marked urgent",
      body: "3 threads need reply. Escalated by their VP of Engineering.",
      priority: "low",
      source: "Gmail",
    },
  ],
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getGreeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}
function getFirstName() {
  const stored = localStorage.getItem("flow_user_name") || "";
  if (stored) return stored.split(/[\s._]+/)[0];
  const wsRaw = localStorage.getItem("flow_os_workspace_id") || "Corp Alpha";
  return wsRaw.replace(/^workspace_/, "").replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()).split(" ")[0];
}
function formatDate() {
  const d = new Date();
  return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })
    + " · "
    + d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
}

// ─── Build the proactive FLOW opening message ─────────────────────────────────

function buildOpeningMessage(brief) {
  const firstName = getFirstName();
  const lines = [`${getGreeting()}, ${firstName}.`];

  if (brief?.overview) {
    lines.push(brief.overview);
  } else {
    lines.push("I've been monitoring your workspace. Here's what needs your attention.");
  }

  if (brief?.highlights?.length) {
    brief.highlights.slice(0, 3).forEach((hl) => {
      if (!hl.title) return;
      const detail = hl.body ? hl.body.split(".")[0] : null;
      lines.push(detail ? `${hl.title} — ${detail}.` : `${hl.title}.`);
    });
  }

  lines.push("Would you like a 2-minute executive briefing?");

  return {
    id: "flow-opening",
    role: "assistant",
    content: lines.join("\n\n"),
    isOpening: true,
    streaming: false,
    streamed: false,
    status: null,
    actions: [],
  };
}

// ─── Extract active context entities from conversation ────────────────────────

function extractContextChips(messages) {
  const chips = new Set();
  const text = messages.map(m => m.content || "").join(" ");
  for (const m of text.matchAll(/\bPR\s*#(\d+)/gi))        chips.add(`PR #${m[1]}`);
  for (const m of text.matchAll(/\bRelease\s+([\d.]+\w*)/gi)) chips.add(`Release ${m[1]}`);
  for (const m of text.matchAll(/\bSprint\s+(\w+)/gi))      chips.add(`Sprint ${m[1]}`);
  for (const m of text.matchAll(/\bIncident\s+(\w+-?\d+)/gi)) chips.add(`Incident ${m[1]}`);
  return [...chips].slice(0, 4);
}

// ─── BlurText ─────────────────────────────────────────────────────────────────

function BlurText({ text, delay = 0, size = 30, weight = 500, color = "var(--t1)", tracking = "-0.01em" }) {
  const words = text.split(" ");
  return (
    <span style={{ display: "block" }}>
      {words.map((word, i) => (
        <motion.span
          key={i}
          initial={{ opacity: 0, filter: "blur(8px)", y: 6 }}
          animate={{ opacity: 1, filter: "blur(0px)", y: 0 }}
          transition={{ duration: 0.45, delay: delay + i * 0.08, ease: [0.4, 0, 0.2, 1] }}
          style={{
            display: "inline-block",
            fontFamily: "var(--font-display)",
            fontSize: size,
            fontWeight: weight,
            color,
            letterSpacing: tracking,
            lineHeight: 1.2,
            marginRight: "0.26em",
          }}
        >
          {word}
        </motion.span>
      ))}
    </span>
  );
}

// ─── Slim ambient greeting header ─────────────────────────────────────────────

function GreetingHeader() {
  return (
    <div style={{ marginBottom: 36 }}>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
        style={{
          fontFamily: "var(--font-data)",
          fontSize: 10,
          fontWeight: 300,
          color: "var(--t4)",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          marginBottom: 10,
        }}
      >
        {formatDate()}
      </motion.div>

      <BlurText
        text={`${getGreeting()}, ${getFirstName()}.`}
        delay={0.1}
        size={38}
        weight={500}
        color="var(--t1)"
      />

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5, duration: 0.3 }}
        style={{ height: 1, background: "var(--line-0)", marginTop: 20 }}
      />
    </div>
  );
}

// ─── Skeleton while brief fetches ─────────────────────────────────────────────

function OpeningSkeleton() {
  return (
    <div style={{ display: "flex", gap: 12, marginBottom: 24 }}>
      <div style={{
        width: 20, height: 20, borderRadius: 0, flexShrink: 0, marginTop: 2,
        background: "var(--accent-dim)",
      }} />
      <div style={{ flex: 1, paddingTop: 2 }}>
        <style>{`@keyframes shimmer-sweep{0%{background-position:200% 0}100%{background-position:-200% 0}}`}</style>
        {[140, 300, 240, 200].map((w, i) => (
          <div key={i} style={{
            height: 12, width: w, borderRadius: 3,
            marginBottom: i === 1 ? 16 : 8,
            background: "linear-gradient(90deg, var(--line-0) 25%, var(--line-1) 50%, var(--line-0) 75%)",
            backgroundSize: "200% 100%",
            animation: `shimmer-sweep 1.6s ease-in-out infinite`,
            animationDelay: `${i * 0.08}s`,
          }} />
        ))}
        <div style={{ display: "flex", gap: 6, marginTop: 16 }}>
          {[110, 110, 96].map((w, i) => (
            <div key={i} style={{
              height: 32, width: w, borderRadius: 4,
              background: "linear-gradient(90deg, var(--line-0) 25%, var(--line-1) 50%, var(--line-0) 75%)",
              backgroundSize: "200% 100%",
              animation: `shimmer-sweep 1.6s ease-in-out infinite`,
              animationDelay: `${i * 0.1}s`,
            }} />
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function BrainHome() {
  const [brief, setBrief]               = useState(null);
  const [briefLoading, setBriefLoading] = useState(true);
  const [messages, setMessages]         = useState(loadMessages);
  const [isLoading, setIsLoading]       = useState(false);
  const [slackThread, setSlackThread]   = useState(null);
  const [contextChips, setContextChips] = useState([]);
  const bottomRef                       = useRef(null);
  const navigate                        = useNavigate();

  const openEntity = useCallback((entityId) => {
    if (entityId) navigate(`/entity/${encodeURIComponent(entityId)}`);
  }, [navigate]);

  const openEvidence = useCallback((evidence) => {
    const kind = String(evidence?.sourceType || evidence?.source || "").toLowerCase();
    if (kind.includes("slack")) {
      setSlackThread({
        channelId: evidence.metadata?.channelId || evidence.channelId || null,
        threadTs:  evidence.metadata?.threadTs || evidence.threadTs || null,
        title:     (evidence.content || "Slack thread").split("\n")[0].slice(0, 80),
      });
    } else if (evidence?.entityId) {
      openEntity(evidence.entityId);
    }
  }, [openEntity]);

  // Fetch brief
  useEffect(() => {
    const cached = loadBriefCache();
    if (cached) { setBrief(cached); setBriefLoading(false); return; }
    const token = localStorage.getItem("flow_os_token") || localStorage.getItem("flow_token");
    const wsId  = localStorage.getItem("flow_os_workspace_id");
    fetch("/api/brain/briefing", {
      headers: { Authorization: `Bearer ${token}`, "workspace-id": wsId || "" },
    })
      .then(r => r.ok ? r.json() : null)
      .then(data => { const b = normalizeBrief(data); setBrief(b); saveBriefCache(b); })
      .catch(() => setBrief(DEMO_BRIEF))
      .finally(() => setBriefLoading(false));
  }, []);

  // Inject proactive opening message once brief loads and no conversation exists
  useEffect(() => {
    if (!briefLoading && messages.length === 0) {
      setMessages([buildOpeningMessage(brief)]);
    }
  }, [briefLoading]); // eslint-disable-line

  // Track context entities from ongoing conversation
  useEffect(() => {
    setContextChips(extractContextChips(messages));
  }, [messages]);

  useEffect(() => { saveMessages(messages); }, [messages]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, isLoading]);

  const sendMessage = useCallback(async (question) => {
    const aid = Date.now() + Math.random();
    setMessages(prev => [...prev,
      { id: Date.now() + Math.random(), role: "user", content: question },
      { id: aid, role: "assistant", content: "", streaming: true, streamed: true, status: "Thinking…", actions: [], explanation: null },
    ]);
    setIsLoading(false);
    const patch = (fn) => setMessages(prev => prev.map(m => (m.id === aid ? { ...m, ...fn(m) } : m)));
    const token = localStorage.getItem("flow_os_token") || localStorage.getItem("flow_token");
    const wsId  = localStorage.getItem("flow_os_workspace_id");
    const hdrs  = { "Content-Type": "application/json", Authorization: `Bearer ${token}`, "workspace-id": wsId || "" };

    // Workday Engine shortcut — instant answer for "what should I work on?"
    if (/what should i (work on|do|focus|prioriti|tackle)|what'?s next|my (top )?priorit|where should i start/i.test(question)) {
      try {
        const res = await fetch("/api/workday/queue", { headers: hdrs });
        if (res.ok) {
          const q = await res.json();
          const lines = [];
          if (q.now?.length) { lines.push("**Right now:**"); q.now.forEach(c => lines.push(`- **${c.title}** — ${c.subtitle || c.reasons?.[0] || ""}`)); }
          if (q.next?.length) { lines.push("\n**Up next:**"); q.next.forEach(c => lines.push(`- ${c.title} — ${c.subtitle || ""}`)); }
          if (!q.now?.length && !q.next?.length) lines.push("Nothing urgent right now — you're in a clear stretch.");
          if (q.ignoredCount) lines.push(`\n_${q.ignoredCount} other event${q.ignoredCount !== 1 ? "s" : ""} can safely wait._`);
          patch(() => ({ content: lines.join("\n"), streaming: false, status: null }));
          return;
        }
      } catch { /* fall through to Brain */ }
    }

    try {
      const res = await fetch("/api/brain/copilot/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, "workspace-id": wsId || "" },
        body: JSON.stringify({ question, pageContext: "home" }),
      });
      if (!res.ok || !res.body) throw new Error("stream unavailable");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let gotToken = false;

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() || "";
        for (const part of parts) {
          const line = part.trim();
          if (!line.startsWith("data:")) continue;
          let evt; try { evt = JSON.parse(line.slice(5).trim()); } catch { continue; }
          if (evt.type === "status")   patch(() => ({ status: evt.message || "Working…" }));
          else if (evt.type === "actions")  patch((m) => ({ streamActions: m.streamActions?.length ? m.streamActions : (evt.actions || []) }));
          else if (evt.type === "evidence") patch((m) => ({ streamEvidence: m.streamEvidence?.length ? m.streamEvidence : (evt.evidence || []) }));
          else if (evt.type === "token")  { gotToken = true; patch((m) => ({ content: (m.content || "") + evt.delta, status: null })); }
          else if (evt.type === "done")   patch((m) => ({ content: evt.answer || m.content || "Request processed.", explanation: evt.explanation || m.explanation || null, streaming: false, status: null }));
          else if (evt.type === "error")  patch((m) => ({ content: m.content || "Something went wrong reasoning over your workspace.", streaming: false, status: null }));
        }
      }
      patch((m) => ({ streaming: false, status: null, content: m.content || (gotToken ? m.content : "Request processed.") }));
    } catch {
      try {
        const res = await fetch("/api/brain/copilot", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, "workspace-id": wsId || "" },
          body: JSON.stringify({ question, pageContext: "home", explain: true }),
        });
        const data = res.ok ? await res.json() : {};
        patch(() => ({
          content: data.answer || data.response || data.brief || `I received your question: "${question}"`,
          actions: data.actions || [], explanation: data.explanation || null,
          streaming: false, status: null,
        }));
      } catch {
        patch(() => ({
          content: `I received your question about "${question}".\n\nConnect to the FLOW backend to get live workspace intelligence.`,
          streaming: false, status: null,
        }));
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const onAsk = (e) => { const q = e.detail?.question; if (q) sendMessage(q); };
    const onFocus = () => document.querySelector("[data-flow-input]")?.focus();
    window.addEventListener("flow:ask-brain", onAsk);
    window.addEventListener("flow:focus-input", onFocus);
    const pending = sessionStorage.getItem("flow_pending_ask");
    if (pending) { sessionStorage.removeItem("flow_pending_ask"); sendMessage(pending); }
    return () => {
      window.removeEventListener("flow:ask-brain", onAsk);
      window.removeEventListener("flow:focus-input", onFocus);
    };
  }, [sendMessage]);

  const handleCardAction = useCallback((type, data) => {
    if (type === "summarize")    sendMessage(`Summarize PR #${data.number || ""}: ${data.title}`);
    else if (type === "merged")       setMessages(p => [...p, { id: Date.now() + Math.random(), role: "assistant", content: `PR #${data.number} merged successfully.` }]);
    else if (type === "merge_failed") setMessages(p => [...p, { id: Date.now() + Math.random(), role: "assistant", content: `Merge failed for PR #${data.number}. Check for conflicts.` }]);
  }, [sendMessage]);

  // Greeting header only shows before the user has replied
  const conversationStarted = messages.some(m => m.role === "user");

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--bg-base)" }}>
      <div style={{ flex: 1, overflowY: "auto" }}>
        <div style={{ maxWidth: 680, margin: "0 auto", padding: "48px 48px 40px" }}>

          {!conversationStarted && <GreetingHeader />}

          {briefLoading && messages.length === 0 && <OpeningSkeleton />}

          {messages.map((msg, i) => (
            <BrainMessage
              key={msg.id}
              message={msg}
              isLatest={i === messages.length - 1 && msg.role === "assistant"}
              onAction={handleCardAction}
              onFollowUp={sendMessage}
              onOpenEntity={openEntity}
              onOpenEvidence={openEvidence}
              onNavigate={navigate}
            />
          ))}

          <AnimatePresence>
            {isLoading && (
              <motion.div
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                style={{ display: "flex", gap: 10, marginBottom: 20, alignItems: "flex-start" }}
              >
                <div style={{
                  width: 26, height: 26, borderRadius: 4,
                  background: "var(--brand-dim)", border: "1px solid var(--brand-line)",
                  display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                }}>
                  <Zap style={{ width: 11, height: 11, color: "var(--brand)" }} />
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 4, paddingTop: 8 }}>
                  {[0, 1, 2].map(j => (
                    <motion.span
                      key={j}
                      style={{ display: "inline-block", width: 4, height: 4, borderRadius: "50%", background: "var(--t4)" }}
                      animate={{ opacity: [0.3, 1, 0.3], scale: [1, 1.3, 1] }}
                      transition={{ duration: 1.1, repeat: Infinity, delay: j * 0.18 }}
                    />
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div ref={bottomRef} />
        </div>
      </div>

      <div style={{
        flexShrink: 0,
        background: "linear-gradient(to bottom, transparent, var(--bg-base) 30%)",
        padding: "16px 48px 20px",
      }}>
        <div style={{ maxWidth: 680, margin: "0 auto" }}>
          <ConversationInput
            onSubmit={sendMessage}
            isLoading={isLoading}
            contextChips={contextChips}
            onClearChip={(chip) => setContextChips(prev => prev.filter(c => c !== chip))}
            hasConversation={messages.length > 1}
          />
        </div>
      </div>

      {slackThread && (
        <SlackThreadPanel
          channelId={slackThread.channelId}
          threadTs={slackThread.threadTs}
          title={slackThread.title}
          onClose={() => setSlackThread(null)}
        />
      )}
    </div>
  );
}

function normalizeBrief(data) {
  if (!data) return DEMO_BRIEF;
  return {
    overview: data.overview || data.brief || data.summary || DEMO_BRIEF.overview,
    highlights: data.highlights?.map(h => ({
      label:    h.label || h.type || "Update",
      title:    h.title || h.headline || "",
      body:     h.body || h.description || h.content || "",
      priority: h.priority || "medium",
      source:   h.source || null,
    })) || DEMO_BRIEF.highlights,
  };
}
