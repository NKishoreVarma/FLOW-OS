import { useState, useRef, useEffect, useCallback } from "react";
import { useLocation } from "react-router-dom";
import { Sparkles, X, Send, StopCircle, RotateCcw, Copy, ArrowUpRight } from "lucide-react";

// ─── Per-page context (BP-11 §Page Context Awareness) ────────────────────────
const PAGE_CONTEXT = {
  "/":           { chip: "Workspace",      placeholders: ["What's my priority today?", "What's the biggest risk?", "What happened overnight?", "What should I focus on?"] },
  "/inbox":      { chip: "Inbox",          placeholders: ["What needs my attention?", "Summarize my approval requests", "What can I safely dismiss?"] },
  "/projects":   { chip: "Engineering",    placeholders: ["What PRs need review?", "What's blocking the release?", "Is the deploy safe?", "What's the team's velocity?"] },
  "/meetings":   { chip: "Meetings",       placeholders: ["What's my next meeting?", "Prep me for the 3pm call", "What action items are outstanding?"] },
  "/knowledge":  { chip: "Knowledge",      placeholders: ["Who knows about this?", "What depends on auth-service?", "Find design decisions on payments"] },
  "/chief":      { chip: "Chief of Staff", placeholders: ["What should I do first?", "What's blocking the team?", "Show me urgent items only"] },
  "/review":     { chip: "Weekly Review",  placeholders: ["How did this week go?", "What should I carry into next week?"] },
  "/people":     { chip: "People",         placeholders: ["Who's most overloaded?", "What if Alice leaves?", "Who owns the payments service?"] },
  "/customers":  { chip: "Customers",      placeholders: ["Which customers are at risk?", "What does Acme need?", "Summarize customer churn risk"] },
  "/activity":   { chip: "Activity",       placeholders: ["What happened in the last 24h?", "What caused the incident?", "Show me deployment history"] },
  "/integrations":{ chip: "Integrations",  placeholders: ["What does FLOW have access to?", "What should I restrict?"] },
  "/success":    { chip: "Value",          placeholders: ["How much time has FLOW saved this week?", "What's working best?"] },
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
async function streamCopilot(question, pageContext, signal, onToken, onDone) {
  const res = await fetch("/api/brain/copilot/stream", {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ question, pageContext }),
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
      if (raw === "[DONE]") { onDone(); return; }
      try {
        const parsed = JSON.parse(raw);
        const tok = parsed.token ?? parsed.text ?? parsed.delta ?? parsed.content ?? "";
        if (tok) onToken(tok);
      } catch {
        if (raw) onToken(raw);
      }
    }
  }
  onDone();
}

// ─── Fallback to non-streaming copilot ───────────────────────────────────────
async function fetchCopilot(question, pageContext) {
  const res = await fetch("/api/brain/copilot", {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ question, pageContext }),
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

  const abortRef    = useRef(null);
  const inputRef    = useRef(null);
  const responseRef = useRef(null);
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
    setMode("responding");
    setIsStreaming(true);
    setInput("");

    const pageContext = getCtx(pathname).chip.toLowerCase();

    try {
      await streamCopilot(q, pageContext, ctrl.signal,
        (tok) => setResponse(r => r + tok),
        ()    => setIsStreaming(false),
      );
    } catch (err) {
      if (err.name === "AbortError") { setIsStreaming(false); return; }
      // Fallback to non-streaming
      try {
        const ans = await fetchCopilot(q, pageContext);
        setResponse(ans || "FLOW couldn't generate a response. Try again.");
      } catch {
        setResponse("FLOW is temporarily unavailable. Check your connection and try again.");
      }
      setIsStreaming(false);
    }
  }, [input, pathname]);

  const cancel  = () => { abortRef.current?.abort(); setIsStreaming(false); };
  const close   = () => { cancel(); setMode("idle"); setInput(""); setResponse(""); setQuestion(""); };
  const copy    = () => { navigator.clipboard?.writeText(response).catch(() => {}); };
  const regen   = () => { doSubmit(question); };
  const expand  = () => {
    sessionStorage.setItem("flow_command_response", JSON.stringify({ question, response }));
    window.dispatchEvent(new CustomEvent("flow:open-brain-modal", { detail: { question, response } }));
  };

  const handleKeyDown = (e) => {
    if (e.key === "Escape")                           { close(); return; }
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); doSubmit(); }
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
        <div style={{ padding: "12px 20px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
          {/* Question bar + controls */}
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 7, flex: 1, minWidth: 0 }}>
              <Sparkles style={{ width: 12, height: 12, color: "var(--accent)", flexShrink: 0, marginTop: 2, opacity: 0.8 }} />
              <span style={{
                fontSize: 12, fontWeight: 400, color: "var(--t2)",
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

          {/* Response area — scrollable, max 240px */}
          <div
            ref={responseRef}
            role="region"
            aria-live="polite"
            style={{
              fontSize: 13, fontWeight: 300, color: "var(--t1)",
              lineHeight: 1.7, fontFamily: "var(--font-ui)",
              maxHeight: 240, overflowY: "auto",
              paddingRight: 4,
            }}
          >
            {response ? (
              <>
                {response}
                {isStreaming && <span style={{ animation: "cursor-blink 1s step-end infinite", color: "var(--accent)" }}>▌</span>}
              </>
            ) : (
              <span style={{ color: "var(--t4)" }}>
                Thinking{isStreaming ? <BlinkDots /> : "."}
              </span>
            )}
          </div>

          {/* Follow-up input — shown when streaming is done */}
          {!isStreaming && (
            <div style={{
              display: "flex", alignItems: "center", gap: 8,
              borderTop: "1px solid var(--line-0)", paddingTop: 10,
            }}>
              <Sparkles style={{ width: 11, height: 11, color: "var(--t4)", flexShrink: 0 }} />
              <input
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && input.trim()) doSubmit();
                  if (e.key === "Escape") close();
                }}
                placeholder="Ask a follow-up..."
                style={{
                  flex: 1, background: "transparent", border: "none", outline: "none",
                  fontSize: 12, fontWeight: 300, color: "var(--t1)", fontFamily: "var(--font-ui)",
                }}
              />
              {input.trim() && (
                <button
                  onClick={() => doSubmit()}
                  style={{ background: "var(--accent)", border: "none", borderRadius: 3, padding: "3px 8px", cursor: "pointer", display: "flex", alignItems: "center" }}
                >
                  <Send style={{ width: 10, height: 10, color: "#fff" }} />
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
