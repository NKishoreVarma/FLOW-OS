import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Zap, Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import BrainMessage from "./BrainMessage";
import ConversationInput from "./ConversationInput";
import SlackThreadPanel from "../slack/SlackThreadPanel";
import { useWorkspaceState } from "../../hooks/useWorkspaceState";

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

// No demo brief — brief is always derived from live connector data or left null.

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

function readFirstEntryStats() {
  try {
    const raw = sessionStorage.getItem("flow_first_entry_stats");
    if (!raw) return null;
    const data = JSON.parse(raw);
    // Only use within 15 minutes of workspace entry
    if (Date.now() - data.ts > 15 * 60 * 1000) { sessionStorage.removeItem("flow_first_entry_stats"); return null; }
    sessionStorage.removeItem("flow_first_entry_stats");
    return data;
  } catch { return null; }
}

function buildOpeningMessage(brief) {
  const firstName = getFirstName();
  const lines = [`${getGreeting()}, ${firstName}.`];

  // First-time entry: personalized welcome with real workspace counts
  const firstStats = readFirstEntryStats();
  if (firstStats && (firstStats.repos > 0 || firstStats.emails > 0 || firstStats.events > 0)) {
    lines.push("Welcome to FLOW. I've analyzed your workspace. Here's what I found:");
    const discoveries = [];
    if (firstStats.repos  > 0) discoveries.push(`${firstStats.repos} repositor${firstStats.repos === 1 ? "y" : "ies"} with code history`);
    if (firstStats.emails > 0) discoveries.push(`${firstStats.emails}+ email conversations`);
    if (firstStats.events > 0) discoveries.push(`${firstStats.events} calendar events`);
    lines.push(discoveries.join(" · ") + ".");
    lines.push("I'm already building context across your systems. Ask me anything about your work — what to focus on, who's blocking what, or what's at risk.");
    return {
      id: "flow-opening",
      role: "assistant",
      content: lines.join("\n\n"),
      isOpening: true,
      streaming: false,
      streamed: false,
      status: null,
      actions: [
        { label: "What should I do today?", ask: "What are the most important things I should work on today?" },
        { label: "What's at risk?",          ask: "What's at risk in my projects right now?" },
      ],
    };
  }

  if (!brief) {
    // Real workspace with no briefing data yet
    lines.push("Your workspace is ready. Connect your first tool to get proactive insights, priority items, and your Morning Brief.");
    lines.push("Ask me anything about your team, projects, or what to work on — or head to Settings to connect GitHub, Gmail, or Calendar.");
    return {
      id: "flow-opening",
      role: "assistant",
      content: lines.join("\n\n"),
      isOpening: true,
      streaming: false,
      streamed: false,
      status: null,
      actions: [{ label: "Connect a tool", route: "/settings/integrations" }],
    };
  }

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

// ─── Indexing guard — shown while workspace is still syncing ──────────────────

function IndexingGuard({ phase, connectedCount = 0, minRequired = 3, readinessPercent = 0 }) {
  const navigate = useNavigate();
  const remaining = Math.max(0, minRequired - connectedCount);
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flex: 1, padding: "48px 24px", textAlign: "center", fontFamily: "var(--font-ui)" }}>
      <div style={{ width: 48, height: 48, borderRadius: 12, background: "rgba(232,103,43,0.1)", border: "1px solid rgba(232,103,43,0.25)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px" }}>
        <Loader2 size={24} color="var(--brand)" style={{ animation: "spin 1s linear infinite" }} />
      </div>
      <h2 style={{ fontSize: 20, fontWeight: 500, color: "var(--t1)", margin: "0 0 10px", letterSpacing: "-0.01em" }}>
        {phase === "UNINITIALIZED" ? "Workspace not set up" : "Preparing your workspace"}
      </h2>
      <p style={{ fontSize: 13, fontWeight: 300, color: "var(--t3)", maxWidth: 400, lineHeight: 1.65, margin: "0 0 6px" }}>
        {phase === "INDEXING"
          ? "FLOW is indexing your connected tools and building the Knowledge Graph. The AI will be ready in a moment."
          : `Connect your tools first — FLOW needs context before it can answer your questions accurately.`
        }
      </p>
      <p style={{ fontSize: 12, fontWeight: 300, color: "var(--t4)", maxWidth: 400, lineHeight: 1.65, margin: "0 0 24px" }}>
        {connectedCount}/{minRequired} integrations connected · Workspace readiness: {readinessPercent}%
        {remaining > 0 && ` · Connect ${remaining} more integration${remaining === 1 ? '' : 's'} to unlock FLOW`}
      </p>
      <button onClick={() => navigate("/setup")} style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "var(--brand)", color: "#fff", border: "none", borderRadius: 8, padding: "10px 18px", fontSize: 13, fontWeight: 500, cursor: "pointer" }}>
        {phase === "INDEXING" ? "View progress" : "Set up FLOW"}
      </button>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function BrainHome() {
  const wsState                         = useWorkspaceState();
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

  // Fetch brief — brain brief + live connector data merged together (Phase 4)
  useEffect(() => {
    const cached = loadBriefCache();
    if (cached) { setBrief(cached); setBriefLoading(false); return; }
    const token  = localStorage.getItem("flow_os_token") || localStorage.getItem("flow_token");
    const wsId   = localStorage.getItem("flow_os_workspace_id");
    const hdrs   = { Authorization: `Bearer ${token}`, "workspace-id": wsId || "" };

    Promise.allSettled([
      fetch("/api/brain/briefing",              { headers: hdrs }).then(r => r.ok ? r.json() : null),
      fetch("/api/autonomous/chief-of-staff",   { headers: hdrs }).then(r => r.ok ? r.json() : null),
      fetch("/api/meetings/upcoming?days=1&limit=5", { headers: hdrs }).then(r => r.ok ? r.json() : null),
      fetch("/api/workspace/snapshot",          { headers: hdrs }).then(r => r.ok ? r.json() : null),
    ]).then(([briefR, cosR, meetR, snapR]) => {
      const briefData = briefR.status === "fulfilled" ? briefR.value : null;
      const cosData   = cosR.status   === "fulfilled" ? cosR.value   : null;
      const meetData  = meetR.status  === "fulfilled" ? meetR.value  : null;
      const snapData  = snapR.status  === "fulfilled" ? snapR.value  : null;

      const base = normalizeBrief(briefData);

      // Enrich with live calendar data
      const liveHighlights = [];
      const meetings = meetData?.events || meetData?.items || [];
      if (meetings.length > 0) {
        const nextMeet = meetings[0];
        const start    = nextMeet.start?.dateTime || nextMeet.startTime;
        const title    = nextMeet.summary || nextMeet.title || "Meeting";
        let timeStr    = "";
        let minsUntil  = Infinity;
        if (start) {
          const d = new Date(start);
          const diffMs = d - Date.now();
          minsUntil = Math.round(diffMs / 60000);
          timeStr = minsUntil <= 0 ? " — happening now" :
                    minsUntil < 60 ? ` — in ${minsUntil} min` :
                    ` at ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
        }
        liveHighlights.push({
          label:    "Calendar",
          title:    `${meetings.length} meeting${meetings.length !== 1 ? "s" : ""} today — next: ${title}${timeStr}`,
          body:     meetings.slice(1, 3).map(m => m.summary || m.title || "Meeting").join(", ") || "",
          priority: minsUntil < 30 ? "high" : "medium",
          source:   "Google Calendar · live",
        });
      }

      // Enrich with Chief of Staff priority items
      const nowItems = cosData?.now || cosData?.topItems || [];
      nowItems.slice(0, 2).forEach(item => {
        if (!item.title) return;
        liveHighlights.push({
          label: item.type || "Action needed",
          title: item.title,
          body:  item.subtitle || item.body || item.reasons?.[0] || "",
          priority: item.priority || "high",
          source: item.source || null,
        });
      });

      // Workspace snapshot health signal
      if (snapData?.overall?.topActions?.length) {
        const topAction = snapData.overall.topActions[0];
        liveHighlights.push({
          label: "Workspace signal",
          title: topAction.title || topAction,
          body: topAction.description || "",
          priority: "medium",
          source: "FLOW AI · live",
        });
      }

      const enriched = {
        overview:   base?.overview || snapData?.overall?.summary || null,
        highlights: [...liveHighlights, ...(base?.highlights || [])].slice(0, 5),
      };

      // Only show real data — never fall back to demo content
      if (!enriched.overview && !enriched.highlights.length) {
        setBrief(null);
      } else {
        setBrief(enriched);
        saveBriefCache(enriched);
      }
    }).catch(() => {
      setBrief(null);
    }).finally(() => setBriefLoading(false));
  }, []); // eslint-disable-line

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
          // A reviewable draft (email / slack / jira / calendar) → render the governed
          // execute card from its recommendation. Nothing runs until the user approves.
          else if (evt.type === "draft")  patch(() => ({ plan: evt.draft?.recommendation || null, draft: evt.draft || null }));
          else if (evt.type === "done")   patch((m) => ({ content: evt.answer || m.content || "Request processed.", explanation: evt.explanation || m.explanation || null, plan: evt.draft?.recommendation || m.plan || null, draft: evt.draft || m.draft || null, streaming: false, status: null }));
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

  const handleCardAction = useCallback((type, data, extra) => {
    const prLabel = data.number ? `PR #${data.number}` : data.title || "PR";
    if (type === "summarize")    sendMessage(`Summarize ${prLabel}: ${data.title}`);
    // "merged" only arrives after the connector confirmed the merge (InlinePRCard checks
    // res.ok). Cite the commit SHA as the receipt when GitHub returned one.
    else if (type === "merged")       setMessages(p => [...p, { id: Date.now() + Math.random(), role: "assistant", content: `${prLabel} merged${extra ? ` — commit ${String(extra).slice(0, 7)}` : ""}.` }]);
    else if (type === "merge_failed") setMessages(p => [...p, { id: Date.now() + Math.random(), role: "assistant", content: `${prLabel} was not merged. ${extra || "Check for conflicts or reconnect GitHub."}` }]);
  }, [sendMessage]);

  // Greeting header only shows before the user has replied
  const conversationStarted = messages.some(m => m.role === "user");

  // Gate: AI is only available when the workspace is READY (≥3 integrations connected)
  const phase = wsState.workspacePhase;
  if (!wsState.loading && wsState.workspacePhase !== 'READY') {
    const connectedCount = wsState.connectedCount || 0;
    const minRequired = wsState.minConnectorsRequired || 3;
    const readinessPercent = wsState.readinessPercent || 0;
    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--bg-base)" }}>
        <IndexingGuard
          phase={phase}
          connectedCount={connectedCount}
          minRequired={minRequired}
          readinessPercent={readinessPercent}
        />
      </div>
    );
  }

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
  if (!data) return null;
  return {
    overview: data.overview || data.brief || data.summary || null,
    highlights: data.highlights?.map(h => ({
      label:    h.label || h.type || "Update",
      title:    h.title || h.headline || "",
      body:     h.body || h.description || h.content || "",
      priority: h.priority || "medium",
      source:   h.source || null,
    })) || [],
  };
}
