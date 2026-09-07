import { useState, useRef, useEffect, useCallback } from "react";
import { useLocation } from "react-router-dom";
import { Sparkles, X, Send, StopCircle, RotateCcw, Copy, ArrowUpRight, ChevronDown, Code2, Mail, Calendar, MessageSquare, FileText, Boxes } from "lucide-react";

// Friendly labels + icons for source/tool badges — proves connector-first answers.
const SOURCE_META = {
  github:            { label: "GitHub",   icon: Code2 },
  gmail:             { label: "Gmail",    icon: Mail },
  "google-calendar": { label: "Calendar", icon: Calendar },
  calendar:          { label: "Calendar", icon: Calendar },
  slack:             { label: "Slack",    icon: MessageSquare },
  jira:              { label: "Jira",     icon: Boxes },
  notion:            { label: "Notion",   icon: FileText },
  engineering:       { label: "GitHub",   icon: Code2 },
  communications:    { label: "Gmail",    icon: Mail },
  meetings:          { label: "Calendar", icon: Calendar },
};
function sourceMeta(s) {
  const key = String(s || "").toLowerCase();
  return SOURCE_META[key] || { label: key ? key.charAt(0).toUpperCase() + key.slice(1) : "Workspace", icon: Boxes };
}
function actionLabel(a) {
  if (typeof a === "string") return a;
  return a?.label || a?.title || a?.action || a?.text || "";
}

// FLOW speaks in plain prose — strip any markdown the model emits mid-stream.
function stripMd(t) {
  return String(t || "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")     // bold
    .replace(/(?<!\*)\*(?!\*)([^*\n]+)\*(?!\*)/g, "$1") // italic
    .replace(/^#{1,6}\s+/gm, "")            // headers
    .replace(/^\s*[-*•]\s+/gm, "")          // bullet leaders
    .replace(/\*\*Next Step:?\*\*/gi, "")   // bolded label
    .replace(/\bNext Steps?:\s*/gi, "");    // plain label
}

// ─── Per-page context (BP-11 §Page Context Awareness) ────────────────────────
const PAGE_CONTEXT = {
  "/":            { chip: "Workspace",      placeholders: ["What's my priority today?", "What's the biggest risk?", "What happened overnight?", "What should I focus on?"] },
  "/inbox":       { chip: "Inbox",          placeholders: ["What needs my attention?", "Summarize my approval requests", "What can I safely dismiss?"] },
  "/projects":    { chip: "Engineering",    placeholders: ["What PRs need review?", "What's blocking the release?", "Is the deploy safe?", "What's the team's velocity?"] },
  "/engineering": { chip: "Engineering",    placeholders: ["What's blocking Release 3.2?", "Which PRs are at risk?", "Is tonight's deploy safe?", "What's our test coverage trend?"] },
  "/dashboard":   { chip: "Executive",      placeholders: ["What's the company health score?", "What risks should I escalate?", "Which approvals are pending?", "Show me the top goals"] },
  "/support":     { chip: "Support",        placeholders: ["Which customers are at churn risk?", "What's Acme Corp's health?", "What SLAs are at risk?", "Show renewal pipeline"] },
  "/meetings":    { chip: "Meetings",       placeholders: ["What's my next meeting?", "Prep me for the 3pm call", "What action items are outstanding?"] },
  "/knowledge":   { chip: "Knowledge",      placeholders: ["Who knows about this?", "What depends on auth-service?", "Find design decisions on payments"] },
  "/chief":       { chip: "Chief of Staff", placeholders: ["What should I do first?", "What's blocking the team?", "Show me urgent items only"] },
  "/review":      { chip: "Weekly Review",  placeholders: ["How did this week go?", "What should I carry into next week?"] },
  "/people":      { chip: "People",         placeholders: ["Who's most overloaded?", "What if Alice leaves?", "Who owns the payments service?"] },
  "/customers":   { chip: "Customers",      placeholders: ["Which customers are at risk?", "What does Acme need?", "Summarize customer churn risk"] },
  "/activity":    { chip: "Activity",       placeholders: ["What happened in the last 24h?", "What caused the incident?", "Show me deployment history"] },
  "/integrations":{ chip: "Integrations",   placeholders: ["What does FLOW have access to?", "What should I restrict?"] },
  "/success":     { chip: "Value",          placeholders: ["How much time has FLOW saved this week?", "What's working best?"] },
  "/council":     { chip: "Council",        placeholders: ["Ask the executive council a question", "What does the CTO recommend?", "Get a second opinion on this decision"] },
  "/launch":      { chip: "Launch",         placeholders: ["Show partner health summary", "What's our MRR this month?", "Which partners are converting?"] },
  "/demo":        { chip: "Demo",           placeholders: ["Load the 15-minute demo", "Which industry should I lead with?", "What's the best demo for a CTO?"] },
};

function getCtx(pathname) {
  const base = "/" + (pathname.split("/")[1] || "");
  // Entity pages: use entity name when available
  if (base === "/entity") return { chip: "Entity", placeholders: ["What's the impact of this?", "Who else knows about this?", "What depends on it?"] };
  return PAGE_CONTEXT[base] || { chip: "FLOW", placeholders: ["Ask FLOW anything about your workspace..."] };
}

function authHeaders() {
  const token = localStorage.getItem("flow_os_token") || "";
  const wsId = localStorage.getItem("flow_os_workspace_id") || "";
  return { "Content-Type": "application/json", Authorization: `Bearer ${token}`, "workspace-id": wsId };
}

// ─── Streaming SSE parser ─────────────────────────────────────────────────────
// Surfaces every event the Brain emits: status (tool/reasoning stages), evidence
// (source badges), actions (suggested next steps), tokens (prose), done.
async function streamCopilot(question, pageContext, signal, handlers, history = []) {
  const { onToken, onStatus, onActions, onEvidence, onDraft, onDone } = handlers;
  const res = await fetch("/api/brain/copilot/stream", {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ question, pageContext, history, userName: localStorage.getItem("flow_user_name") || undefined }),
    signal,
  });
  if (!res.ok || !res.body) throw new Error("stream_failed");

  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const raw = line.slice(6).trim();
      if (raw === "[DONE]") { onDone?.(); return; }
      try {
        const p = JSON.parse(raw);
        switch (p.type) {
          case "status":   onStatus?.(p); break;
          case "actions":  onActions?.(p.actions || []); break;
          case "evidence": onEvidence?.(p.evidence || []); break;
          case "draft":    onDraft?.(p.draft || p); break;
          case "token":    { const t = p.delta ?? p.token ?? p.text ?? ""; if (t) onToken?.(t); break; }
          case "done":     onActions?.(p.actions || []); if (p.draft) onDraft?.(p.draft); onDone?.(); return;
          case "error":    throw new Error(p.error || "stream_error");
          default: { const t = p.delta ?? p.token ?? p.text ?? p.content ?? ""; if (t) onToken?.(t); }
        }
      } catch {
        if (raw && !raw.startsWith("{")) onToken?.(raw);
      }
    }
  }
  onDone?.();
}

// ─── Fallback to non-streaming copilot ───────────────────────────────────────
async function fetchCopilot(question, pageContext, history = []) {
  const res = await fetch("/api/brain/copilot", {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ question, pageContext, history, userName: localStorage.getItem("flow_user_name") || undefined }),
  });
  if (!res.ok) throw new Error("copilot_failed");
  const data = await res.json();
  return data.answer ?? data.response ?? data.synthesis ?? data.message ?? "";
}

// ─── Component ────────────────────────────────────────────────────────────────
export function StickyCommandCenter() {
  const { pathname } = useLocation();
  const ctx = getCtx(pathname);

  // Hide on /council — AskCouncilInput takes precedence (BP-11)
  if (pathname === "/council") return null;

  const [mode, setMode]           = useState("idle");    // idle | focused | responding
  const [input, setInput]         = useState("");
  const [question, setQuestion]   = useState("");
  const [response, setResponse]   = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [phIdx, setPhIdx]         = useState(0);
  const [suggestions, setSuggestions] = useState([]);   // suggested next actions
  const [sources, setSources]     = useState([]);        // evidence source names
  const [stages, setStages]       = useState([]);        // reasoning/tool stages
  const [showReasoning, setShowReasoning] = useState(false);
  const [draft, setDraft]         = useState(null);      // email draft awaiting approval

  const abortRef    = useRef(null);
  const inputRef    = useRef(null);
  const responseRef = useRef(null);
  const historyRef  = useRef([]); // conversation memory: [{role, content}, ...]
  const modeRef     = useRef(mode); // avoids stale closure in event handlers
  useEffect(() => { modeRef.current = mode; }, [mode]);

  // ── Placeholder rotation (6s) ───────────────────────────────────────────────
  useEffect(() => {
    setPhIdx(0);
    const id = setInterval(() => setPhIdx(i => (i + 1) % ctx.placeholders.length), 6000);
    return () => clearInterval(id);
  }, [pathname]); // reset when page changes

  // ── External event bus ──────────────────────────────────────────────────────
  useEffect(() => {
    const onFocus = () => {
      setMode("focused");
      setTimeout(() => inputRef.current?.focus(), 60);
    };
    const onAsk = (e) => {
      const q = e.detail?.question;
      if (!q) return;
      setInput(q);
      setMode("focused");
      setTimeout(() => doSubmit(q), 80);
    };
    const onCancel = () => {
      abortRef.current?.abort();
      setIsStreaming(false);
    };

    window.addEventListener("flow:focus-command-center", onFocus);
    window.addEventListener("flow:ask-brain", onAsk);
    window.addEventListener("flow:cancel-ai", onCancel);
    return () => {
      window.removeEventListener("flow:focus-command-center", onFocus);
      window.removeEventListener("flow:ask-brain", onAsk);
      window.removeEventListener("flow:cancel-ai", onCancel);
    };
  }, []); // mounted once — intentional

  // ── Scroll response to bottom as tokens arrive ──────────────────────────────
  useEffect(() => {
    if (responseRef.current) {
      responseRef.current.scrollTop = responseRef.current.scrollHeight;
    }
  }, [response]);

  // ── Submit ──────────────────────────────────────────────────────────────────
  const doSubmit = useCallback(async (overrideQ) => {
    const q = (overrideQ ?? input).trim();
    if (!q) return;

    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setQuestion(q);
    setResponse("");
    setSuggestions([]);
    setSources([]);
    setStages([]);
    setShowReasoning(false);
    setDraft(null);
    setMode("responding");
    setIsStreaming(true);
    setInput("");

    const pageContext = getCtx(pathname).chip.toLowerCase();
    // Send prior turns so FLOW can resolve "that / the first one / do it".
    const history = historyRef.current.slice(-10);
    let acc = "";

    try {
      await streamCopilot(q, pageContext, ctrl.signal, {
        onToken:  (tok) => { acc += tok; setResponse(r => r + tok); },
        onStatus: (s)   => setStages(prev => (s.message && prev[prev.length - 1] !== s.message) ? [...prev, s.message] : prev),
        onActions: (acts) => {
          const labels = (acts || []).map(actionLabel).filter(Boolean);
          if (labels.length) setSuggestions(labels.slice(0, 4));
        },
        onEvidence: (ev) => {
          // Only surface real connector tools — never internal engines (Memory,
          // Health, Vector, Predictions). If it isn't a known tool, hide it.
          const names = [...new Set(
            (ev || [])
              .map(e => (e.source || e.sourceType || "").toLowerCase())
              .filter(s => Object.prototype.hasOwnProperty.call(SOURCE_META, s))
          )];
          if (names.length) setSources(names.slice(0, 5));
        },
        onDraft: (d) => setDraft(d),
        onDone: () => setIsStreaming(false),
      }, history);
    } catch (err) {
      if (err.name === "AbortError") { setIsStreaming(false); return; }
      // Fallback to non-streaming
      try {
        acc = await fetchCopilot(q, pageContext, history);
        setResponse(acc || "FLOW couldn't generate a response. Try again.");
      } catch {
        setResponse("FLOW is temporarily unavailable. Check your connection and try again.");
      }
      setIsStreaming(false);
    }

    // Remember this exchange for the next turn's context.
    if (acc.trim()) {
      historyRef.current = [
        ...historyRef.current,
        { role: "user", content: q },
        { role: "assistant", content: acc.trim() },
      ].slice(-12);
    }
  }, [input, pathname]);

  const cancel  = () => { abortRef.current?.abort(); setIsStreaming(false); };
  const close   = () => { cancel(); setMode("idle"); setInput(""); setResponse(""); setQuestion(""); setSuggestions([]); setSources([]); setStages([]); setDraft(null); historyRef.current = []; };
  const copy    = () => { navigator.clipboard?.writeText(response).catch(() => {}); };
  const regen   = () => { doSubmit(question); };
  const expand  = () => {
    sessionStorage.setItem("flow_command_response", JSON.stringify({ question, response }));
    window.dispatchEvent(new CustomEvent("flow:open-brain-modal", { detail: { question, response } }));
  };

  const handleKeyDown = (e) => {
    if (e.key === "Escape") { close(); return; }
    // Enter sends; Shift+Enter is reserved for a newline (no-op in a single-line input).
    if (e.key === "Enter" && !e.shiftKey && input.trim()) { e.preventDefault(); doSubmit(); }
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div
      role="search"
      aria-label="Ask FLOW"
      style={{
        background: "var(--surface-0)",
        borderTop: "1px solid var(--line-0)",
        flexShrink: 0,
        transition: "none", // height set by content; BP-20 allows height here
      }}
    >

      {/* ── IDLE ─────────────────────────────────────────────────────────── */}
      {mode === "idle" && (
        <button
          onClick={() => { setMode("focused"); setTimeout(() => inputRef.current?.focus(), 60); }}
          style={{
            width: "100%", height: 52,
            display: "flex", alignItems: "center", gap: 10,
            padding: "0 20px",
            background: "transparent", border: "none", cursor: "text", textAlign: "left",
            transition: "background 80ms",
          }}
          onMouseEnter={e => { e.currentTarget.style.background = "rgba(31,27,22,0.03)"; }}
          onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
        >
          <Sparkles style={{ width: 13, height: 13, color: "var(--accent)", flexShrink: 0, opacity: 0.8 }} />
          <span style={{
            flex: 1, fontSize: 13, fontWeight: 300,
            color: "var(--t4)", fontFamily: "var(--font-ui)",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {ctx.placeholders[phIdx] || "Ask FLOW anything..."}
          </span>
          <kbd style={{
            fontSize: 9, color: "var(--t5)",
            background: "rgba(31,27,22,0.05)", border: "1px solid var(--line-1)",
            borderRadius: 3, padding: "2px 5px", fontFamily: "var(--font-data)", flexShrink: 0,
          }}>
            ⌘/
          </kbd>
        </button>
      )}

      {/* ── FOCUSED ──────────────────────────────────────────────────────── */}
      {mode === "focused" && (
        <div style={{ padding: "12px 20px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
          {/* Input row */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Sparkles style={{ width: 12, height: 12, color: "var(--accent)", flexShrink: 0, opacity: 0.7 }} />
            {/* Context chip */}
            <span style={{
              fontFamily: "var(--font-data)", fontSize: 10, fontWeight: 300,
              color: "var(--accent-text)", background: "var(--accent-dim)",
              border: "1px solid var(--accent-line)", borderRadius: 3,
              padding: "2px 7px", flexShrink: 0,
            }}>
              {ctx.chip}
            </span>
            <input
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={`Ask about ${ctx.chip.toLowerCase()}...`}
              aria-label={`Ask FLOW about ${ctx.chip}`}
              style={{
                flex: 1, background: "transparent", border: "none", outline: "none",
                fontSize: 13, fontWeight: 300, color: "var(--t1)", fontFamily: "var(--font-ui)",
              }}
            />
            <button
              onClick={close}
              title="Close (Esc)"
              style={{ background: "none", border: "none", cursor: "pointer", padding: 4, color: "var(--t4)", display: "flex", alignItems: "center", borderRadius: 3, flexShrink: 0 }}
            >
              <X style={{ width: 12, height: 12 }} />
            </button>
          </div>

          {/* Suggested chips */}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {ctx.placeholders.slice(0, 3).map((p, i) => (
              <button
                key={i}
                onClick={() => doSubmit(p)}
                style={{
                  fontFamily: "var(--font-ui)", fontSize: 11, fontWeight: 300,
                  color: "var(--t3)", background: "rgba(31,27,22,0.04)",
                  border: "1px solid var(--line-1)", borderRadius: 20,
                  padding: "4px 11px", cursor: "pointer",
                  transition: "background 80ms, color 80ms",
                }}
                onMouseEnter={e => { e.currentTarget.style.background = "rgba(31,27,22,0.07)"; e.currentTarget.style.color = "var(--t2)"; }}
                onMouseLeave={e => { e.currentTarget.style.background = "rgba(31,27,22,0.04)"; e.currentTarget.style.color = "var(--t3)"; }}
              >
                {p}
              </button>
            ))}
          </div>

          {/* Submit row */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 6 }}>
            <span style={{ fontSize: 10, color: "var(--t5)", fontFamily: "var(--font-data)" }}>⌘↵ to send · Esc to close</span>
            <button
              onClick={() => doSubmit()}
              disabled={!input.trim()}
              style={{
                display: "flex", alignItems: "center", gap: 5,
                padding: "5px 12px", borderRadius: 4, border: "none",
                background: input.trim() ? "var(--accent)" : "rgba(31,27,22,0.06)",
                cursor: input.trim() ? "pointer" : "not-allowed",
                transition: "background 80ms",
              }}
            >
              <Send style={{ width: 11, height: 11, color: input.trim() ? "#fff" : "var(--t4)" }} />
              <span style={{ fontSize: 11, fontWeight: 500, color: input.trim() ? "#fff" : "var(--t4)" }}>Ask</span>
            </button>
          </div>
        </div>
      )}

      {/* ── RESPONDING ───────────────────────────────────────────────────── */}
      {mode === "responding" && (
        <div style={{ padding: "14px 22px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
          {/* Question bar + controls */}
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 8, flex: 1, minWidth: 0 }}>
              <Sparkles style={{ width: 13, height: 13, color: "var(--accent)", flexShrink: 0, marginTop: 3, opacity: 0.85 }} />
              <span style={{
                fontSize: 14, fontWeight: 500, color: "var(--t1)",
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1,
              }}>
                {question}
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 2, flexShrink: 0 }}>
              {isStreaming ? (
                <IconBtn icon={StopCircle} title="Cancel (⌘.)" onClick={cancel} />
              ) : (
                <>
                  {response && <IconBtn icon={Copy} title="Copy response" onClick={copy} />}
                  <IconBtn icon={RotateCcw} title="Regenerate" onClick={regen} />
                  <IconBtn icon={ArrowUpRight} title="Expand conversation" onClick={expand} />
                </>
              )}
              <IconBtn icon={X} title="Close (Esc)" onClick={close} />
            </div>
          </div>

          {/* Reasoning — collapsible. Shows which systems FLOW queried. */}
          {stages.length > 0 && (
            <div>
              <button
                onClick={() => setShowReasoning(s => !s)}
                style={{
                  display: "flex", alignItems: "center", gap: 5, background: "none", border: "none",
                  cursor: "pointer", padding: 0, color: "var(--t4)", fontFamily: "var(--font-data)",
                  fontSize: 10, textTransform: "uppercase", letterSpacing: "0.07em",
                }}
              >
                <ChevronDown style={{ width: 11, height: 11, transform: showReasoning ? "none" : "rotate(-90deg)", transition: "transform 120ms" }} />
                {isStreaming && !response ? (stages[stages.length - 1] || "Thinking") : "How FLOW answered"}
              </button>
              {showReasoning && (
                <div style={{ marginTop: 8, paddingLeft: 16, display: "flex", flexDirection: "column", gap: 4, borderLeft: "1px solid var(--line-1)" }}>
                  {stages.map((s, i) => (
                    <div key={i} style={{ fontSize: 11, fontWeight: 300, color: "var(--t3)", fontFamily: "var(--font-ui)" }}>{s}</div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Response area — large, occupies most of the screen (Linear/Notion feel) */}
          <div
            ref={responseRef}
            role="region"
            aria-live="polite"
            style={{
              fontSize: 14.5, fontWeight: 300, color: "var(--t1)",
              lineHeight: 1.75, fontFamily: "var(--font-ui)",
              maxHeight: "min(52vh, 460px)", minHeight: 40, overflowY: "auto",
              paddingRight: 6, whiteSpace: "pre-wrap",
            }}
          >
            {response ? (
              <>
                {stripMd(response)}
                {isStreaming && <span style={{ animation: "cursor-blink 1s step-end infinite", color: "var(--accent)" }}>▌</span>}
              </>
            ) : (
              <span style={{ color: "var(--t4)" }}>
                {stages[stages.length - 1] || "Thinking"}{isStreaming ? <BlinkDots /> : "."}
              </span>
            )}
          </div>

          {/* Source badges — proves the answer came from live tools, not memory */}
          {sources.length > 0 && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
              <span style={{ fontFamily: "var(--font-data)", fontSize: 9, color: "var(--t5)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Checked</span>
              {sources.map((s, i) => {
                const { label, icon: Icon } = sourceMeta(s);
                return (
                  <span key={i} style={{
                    display: "inline-flex", alignItems: "center", gap: 4,
                    fontFamily: "var(--font-data)", fontSize: 10, color: "var(--t3)",
                    background: "rgba(31,27,22,0.04)", border: "1px solid var(--line-1)",
                    borderRadius: 4, padding: "2px 7px",
                  }}>
                    <Icon style={{ width: 10, height: 10, opacity: 0.7 }} /> {label}
                  </span>
                );
              })}
            </div>
          )}

          {/* Email draft — review, edit, and send with approval */}
          {draft?.recommendation && !isStreaming && (
            <DraftCard draft={draft} onClose={() => setDraft(null)} />
          )}

          {/* Suggested next actions — under every response */}
          {!isStreaming && suggestions.length > 0 && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {suggestions.map((s, i) => (
                <button
                  key={i}
                  onClick={() => doSubmit(s)}
                  style={{
                    fontFamily: "var(--font-ui)", fontSize: 11.5, fontWeight: 400,
                    color: "var(--accent-text)", background: "var(--accent-dim)",
                    border: "1px solid var(--accent-line)", borderRadius: 20,
                    padding: "5px 12px", cursor: "pointer", transition: "background 80ms",
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = "var(--accent-line)"; }}
                  onMouseLeave={e => { e.currentTarget.style.background = "var(--accent-dim)"; }}
                >
                  {s}
                </button>
              ))}
            </div>
          )}

          {/* Follow-up input — sticky, shown when streaming is done */}
          {!isStreaming && (
            <div style={{
              display: "flex", alignItems: "center", gap: 8,
              borderTop: "1px solid var(--line-0)", paddingTop: 12, marginTop: 2,
            }}>
              <Sparkles style={{ width: 12, height: 12, color: "var(--t4)", flexShrink: 0 }} />
              <input
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && input.trim()) doSubmit();
                  if (e.key === "Escape") close();
                }}
                placeholder="Ask a follow-up..."
                autoFocus
                style={{
                  flex: 1, background: "transparent", border: "none", outline: "none",
                  fontSize: 13, fontWeight: 300, color: "var(--t1)", fontFamily: "var(--font-ui)",
                }}
              />
              {input.trim() && (
                <button
                  onClick={() => doSubmit()}
                  style={{ background: "var(--accent)", border: "none", borderRadius: 4, padding: "4px 9px", cursor: "pointer", display: "flex", alignItems: "center" }}
                >
                  <Send style={{ width: 11, height: 11, color: "#fff" }} />
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Small utilities ──────────────────────────────────────────────────────────
// Email draft card — human reviews/edits, then approves the send. Nothing auto-sends.
// One card for every write action (email / GitHub issue / calendar event). Shows
// the draft, lets the user edit, then executes through the governed engine
// (/api/execution/execute). Nothing runs without the explicit approval click.
const DRAFT_META = {
  email:         { chip: "Draft email — review before sending",   verb: "Send now ↗",   verbing: "Sending…" },
  github_issue:  { chip: "New GitHub issue — review before creating", verb: "Create issue ↗", verbing: "Creating…" },
  calendar_event:{ chip: "New meeting — review before scheduling", verb: "Schedule ↗",   verbing: "Scheduling…" },
};

function DraftCard({ draft, onClose }) {
  const meta = DRAFT_META[draft.kind] || DRAFT_META.email;
  const [editing, setEditing] = useState(false);
  const [primary, setPrimary] = useState(draft.recommendation?.payload?.subject ?? draft.recommendation?.payload?.title ?? draft.fields?.title ?? "");
  const [body, setBody]       = useState(draft.recommendation?.payload?.body ?? draft.recommendation?.payload?.description ?? draft.fields?.body ?? "");
  const [busy, setBusy]       = useState(false);
  const [result, setResult]   = useState(null);
  const hasBody = draft.kind !== "calendar_event";

  async function execute() {
    setBusy(true); setResult(null);
    // Merge edits back into the governed recommendation payload.
    const payload = { ...draft.recommendation.payload };
    if (draft.kind === "email")        { payload.subject = primary; payload.body = body; }
    else if (draft.kind === "github_issue") { payload.title = primary; payload.body = body; }
    else if (draft.kind === "calendar_event") { payload.title = primary; }
    try {
      const r = await fetch("/api/execution/execute", {
        method: "POST", headers: authHeaders(),
        body: JSON.stringify({ recommendation: { ...draft.recommendation, payload }, confirmed: true }),
      });
      const d = await r.json();
      // TRUST INVARIANT: /api/execution/execute ALWAYS returns { results:[...] } at HTTP
      // 200 — even for a FAILED or DENIED step. So "there is a results array" is NOT
      // success. Read the actual step status, and for a send REQUIRE a real provider id
      // (messageId) before ever showing "Sent". No id → not sent.
      const step   = d.results?.[0] || {};
      const status = step.status || (d.completed ? "EXECUTED" : null);
      const receipt = step.result?.result || step.result || {};
      const providerId = receipt.messageId || receipt.id || receipt.number || receipt.key
        || receipt.eventId || receipt.threadId || receipt.sha || null;

      if (status === "EXECUTED") {
        if (draft.kind === "email") {
          // Gmail send is only real when Gmail returns a messageId.
          if (providerId) setResult({ ok: true, msg: `Sent to ${draft.to}`, receipt: { connector: "Gmail", id: providerId } });
          else setResult({ ok: false, msg: "Gmail accepted the request but returned no message ID — treating this as NOT sent. Check your Sent folder before retrying." });
        } else if (draft.kind === "github_issue") {
          setResult({ ok: true, msg: providerId ? `Issue created (#${providerId})` : "Issue created", receipt: providerId ? { connector: "GitHub", id: `#${providerId}` } : null });
        } else {
          setResult({ ok: true, msg: "Meeting scheduled", receipt: providerId ? { connector: "Calendar", id: providerId } : null });
        }
      }
      else if (status === "APPROVAL_REQUIRED" || step.approvalId || d.approvalId) {
        setResult({ ok: true, pending: true, msg: `Sent for approval — ${step.requiredApprovals || 1} approval(s) needed.` });
      }
      else if (status === "CONFIRM_REQUIRED") {
        setResult({ ok: false, msg: step.reason || "This action needs your confirmation." });
      }
      else {
        // DENIED / FAILED — surface the REAL reason from the step, not a generic message.
        const reason = step.error || step.result?.error || d.error?.userMessage || d.error?.message || d.error;
        setResult({ ok: false, msg: _connMsg({ error: reason }, draft.recommendation.connector) });
      }
    } catch { setResult({ ok: false, msg: "Action failed. Check your connection and try again." }); }
    finally { setBusy(false); }
  }

  if (result?.ok) {
    // Green ✓ only for a verified execution; approval-pending is amber, not "done".
    const accent = result.pending ? "var(--p-high-text, #b45309)" : "var(--ok)";
    return (
      <div style={{ border: "1px solid var(--border)", borderLeft: `2px solid ${accent}`, borderRadius: 8, padding: "12px 14px", background: "var(--bg-secondary)" }}>
        <div style={{ fontSize: 13, color: accent, fontWeight: 500 }}>{result.pending ? "⏳" : "✓"} {result.msg}</div>
        <div style={{ fontSize: 11.5, color: "var(--t4)", marginTop: 3 }}>{primary}</div>
        {result.receipt && (
          <div style={{ fontFamily: "var(--font-data)", fontSize: 10.5, color: "var(--t4)", marginTop: 6, letterSpacing: "0.02em" }}>
            Receipt — {result.receipt.connector} · {result.receipt.id}
          </div>
        )}
      </div>
    );
  }

  const L = { fontFamily: "var(--font-data)", fontSize: 10, color: "var(--t4)", width: 52, flexShrink: 0, textTransform: "uppercase" };
  const field = { flex: 1, background: "var(--surface-0)", border: "1px solid var(--line-1)", borderRadius: 4, padding: "5px 8px", fontSize: 13, color: "var(--t1)", outline: "none", fontFamily: "var(--font-ui)" };
  const rows = _draftRows(draft);

  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: 10, padding: 14, background: "var(--bg-secondary)" }}>
      <div style={{ ...L, width: "auto", marginBottom: 10, letterSpacing: "0.07em" }}>{meta.chip}</div>
      {rows.map(([label, value]) => (
        <div key={label} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <span style={L}>{label}</span><span style={{ fontSize: 13, color: "var(--t2)" }}>{value}</span>
        </div>
      ))}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, marginTop: 4 }}>
        <span style={L}>{draft.kind === "email" ? "Subj" : "Title"}</span>
        {editing ? <input value={primary} onChange={e => setPrimary(e.target.value)} style={field} /> : <span style={{ fontSize: 13, color: "var(--t2)", fontWeight: 500 }}>{primary}</span>}
      </div>
      {hasBody && <>
        <div style={{ height: 1, background: "var(--line-0)", marginBottom: 10 }} />
        {editing
          ? <textarea value={body} onChange={e => setBody(e.target.value)} rows={5} style={{ ...field, width: "100%", resize: "vertical", lineHeight: 1.6, marginBottom: 10 }} />
          : <div style={{ fontSize: 13, color: "var(--t2)", lineHeight: 1.7, whiteSpace: "pre-wrap", marginBottom: 12 }}>{body}</div>}
      </>}
      {result && !result.ok && <div style={{ fontSize: 12, color: "var(--crit)", marginBottom: 8 }}>{result.msg}</div>}
      <div style={{ display: "flex", gap: 8, marginTop: hasBody ? 0 : 6 }}>
        {!editing ? (
          <>
            <button onClick={execute} disabled={busy}
              style={{ padding: "7px 14px", background: "var(--accent)", border: "none", borderRadius: 6, fontSize: 12, fontWeight: 500, color: "#fff", cursor: busy ? "default" : "pointer" }}>
              {busy ? meta.verbing : meta.verb}
            </button>
            <button onClick={() => setEditing(true)} style={{ padding: "7px 12px", background: "transparent", border: "1px solid var(--border)", borderRadius: 6, fontSize: 12, color: "var(--t2)", cursor: "pointer" }}>Edit</button>
            <button onClick={onClose} style={{ padding: "7px 12px", background: "transparent", border: "none", fontSize: 12, color: "var(--t4)", cursor: "pointer" }}>Cancel</button>
          </>
        ) : (
          <button onClick={() => setEditing(false)} style={{ padding: "7px 14px", background: "var(--surface-1)", border: "1px solid var(--border)", borderRadius: 6, fontSize: 12, color: "var(--t1)", cursor: "pointer" }}>Done editing</button>
        )}
      </div>
    </div>
  );
}

function _draftRows(draft) {
  if (draft.kind === "email")          return [["To", draft.to]];
  if (draft.kind === "github_issue")   return [["Repo", draft.fields?.repo]];
  if (draft.kind === "calendar_event") return [["When", draft.fields?.when], ["With", draft.fields?.attendees]];
  return [];
}
function _connMsg(d, connector) {
  const raw = d.error?.userMessage || d.error?.message || d.error || d.message || "";
  if (/auth|reconnect|expired|not connected|invalid_grant/i.test(raw)) {
    const name = { gmail: "Gmail", "google-calendar": "Google Calendar", github: "GitHub" }[connector] || connector;
    return `${name} needs to be reconnected — do it in Settings → Integrations, then try again.`;
  }
  return raw || "Couldn't complete the action.";
}

function IconBtn({ icon: Icon, title, onClick }) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        background: "none", border: "none", cursor: "pointer", padding: 4,
        color: "var(--t4)", display: "flex", alignItems: "center", borderRadius: 3,
        transition: "color 80ms",
      }}
      onMouseEnter={e => { e.currentTarget.style.color = "var(--t2)"; }}
      onMouseLeave={e => { e.currentTarget.style.color = "var(--t4)"; }}
    >
      <Icon style={{ width: 13, height: 13 }} />
    </button>
  );
}

function BlinkDots() {
  const [dots, setDots] = useState(".");
  useEffect(() => {
    const id = setInterval(() => setDots(d => d.length >= 3 ? "." : d + "."), 400);
    return () => clearInterval(id);
  }, []);
  return <span>{dots}</span>;
}

export default StickyCommandCenter;
