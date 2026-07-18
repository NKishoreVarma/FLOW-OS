import { useEffect, useRef, useState, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Search, Sparkles, X, ArrowUpRight, Pin, History, FlaskConical, TrendingUp, CheckSquare, Mail, FileText, Zap, Users, Building2, GitBranch, Boxes } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useWebSocket } from "../../hooks/useWebSocket";
import { useToast } from "./ToastProvider";
import SourceBadge from "../ui/SourceBadge";
import Skeleton from "./Skeleton";
import EmptyState from "./EmptyState";

// Navigation commands — mirrors exact sidebar architecture (BP-11)
const NAV_COMMANDS = [
  // PRIMARY
  { label: "Home",             route: "/",           keywords: ["home", "morning", "briefing", "workfeed", "start", "today", "priorities"] },
  { label: "Inbox",            route: "/inbox",      keywords: ["inbox", "approvals", "conflicts", "alerts", "tasks", "notifications", "work"] },
  { label: "Engineering",      route: "/projects",   keywords: ["engineering", "projects", "repo", "pr", "pull request", "github", "code", "branches", "commits"] },
  { label: "Meetings",         route: "/meetings",   keywords: ["meeting", "meetings", "calendar", "schedule", "events"] },
  { label: "Knowledge",        route: "/knowledge",  keywords: ["knowledge", "docs", "document", "wiki", "graph", "entities", "notes"] },
  // INTELLIGENCE
  { label: "Chief of Staff",   route: "/chief",      keywords: ["chief", "staff", "priorities", "now", "actions", "today", "coo"] },
  { label: "Weekly Review",    route: "/review",     keywords: ["weekly", "review", "week", "retrospective", "velocity", "summary"] },
  { label: "People",           route: "/people",     keywords: ["people", "team", "employees", "workforce", "workload", "hr", "headcount"] },
  { label: "Customers",        route: "/customers",  keywords: ["customers", "crm", "accounts", "churn", "renewal", "sales", "health"] },
  { label: "Executive Council",route: "/council",    keywords: ["council", "executive", "agents", "coo", "debate", "leadership", "advisors"] },
  // PLATFORM
  { label: "Integrations",     route: "/integrations", keywords: ["integrations", "trust", "permissions", "connectors", "allow", "deny", "slack", "gmail", "github"] },
  { label: "Activity",         route: "/activity",   keywords: ["activity", "recent", "history", "events", "feed", "timeline", "replay", "audit"] },
  { label: "Value",            route: "/success",    keywords: ["value", "success", "roi", "metrics", "time saved", "impact"] },
  // SETTINGS
  { label: "IAM",              route: "/settings/iam",        keywords: ["iam", "identity", "users", "roles", "access", "members"] },
  { label: "Governance",       route: "/settings/governance", keywords: ["governance", "policies", "rules", "ai governance", "approvals"] },
  { label: "Audit Log",        route: "/settings/audit",      keywords: ["audit", "log", "compliance", "history", "records"] },
  { label: "Security",         route: "/settings/security",   keywords: ["security", "threats", "vulnerabilities", "risk"] },
  { label: "Health",           route: "/settings/health",     keywords: ["health", "workspace health", "status", "connector health"] },
  { label: "Billing",          route: "/settings/billing",    keywords: ["billing", "subscription", "plan", "usage", "cost"] },
  { label: "Team",             route: "/settings/team",       keywords: ["team", "invite", "members", "colleagues"] },
  { label: "Help & Shortcuts", route: "/help",                keywords: ["help", "shortcuts", "keyboard", "getting started", "guide", "support"] },
];

// ─── Slash commands (BP-11 §Slash Mode) ──────────────────────────────────────
const SLASH_COMMANDS = [
  { cmd: "/chief",    label: "Open Chief of Staff",         route: "/chief",                desc: "See your top priorities for today" },
  { cmd: "/review",   label: "Open Weekly Review",           route: "/review",               desc: "Engineering velocity + execution summary" },
  { cmd: "/inbox",    label: "Open Inbox",                   route: "/inbox",                desc: "Approvals, conflicts, and alerts" },
  { cmd: "/brief",    label: "Go to Morning Briefing",       route: "/",                     desc: "Today's executive summary" },
  { cmd: "/simulate", label: "Run a simulation",             route: "/simulation-workspace", desc: "What-if scenario analysis" },
  { cmd: "/replay",   label: "Open Activity replay",         route: "/activity",             desc: "Replay workspace history" },
  { cmd: "/snapshot", label: "Compare workspace snapshots",  route: "/activity",             desc: "Before/after diff view" },
  { cmd: "/council",  label: "Ask the Executive Council",    route: "/council",              desc: "6 AI domain executives" },
  { cmd: "/settings", label: "Go to Settings",               route: "/settings",             desc: "Workspace configuration" },
  { cmd: "/sync",     label: "Sync all connectors",          action: "sync",                 desc: "Pull latest from all integrations" },
];

// Entity type → icon lookup
const ENTITY_ICONS = { user: Users, person: Users, employee: Users, customer: Building2, repository: GitBranch, repo: GitBranch };
function EntityIcon({ type }) {
  const lo = (type || "").toLowerCase();
  const Icon = ENTITY_ICONS[lo] || Boxes;
  return <Icon style={{ width: 13, height: 13, color: "var(--t4)", flexShrink: 0 }} />;
}

/**
 * Verb-first executable commands — ⌘K is the OS, not just navigation (Phase 16).
 * A query that starts with (or reads as) an action produces a command that RUNS on
 * Enter: ask the Brain, simulate, predict, create a Jira issue, compose, review
 * approvals. Everything routes through existing surfaces — no new backend.
 */
function deriveActions(raw, h) {
  const q = raw.trim();
  if (!q) return [];
  const lo = q.toLowerCase();
  const after = (re) => { const m = q.match(re); return m ? m[1].trim() : ""; };
  const A = [];

  const askText = after(/^(?:ask flow|ask)\s+(.+)/i);
  if (askText) A.push({ id: "ask", label: `Ask FLOW: “${askText}”`, hint: "Operational Brain", icon: Sparkles, run: () => h.ask(askText) });

  const sim = after(/^simulate\s+(.+)/i);
  if (sim) A.push({ id: "sim", label: `Simulate: ${sim}`, hint: "What-if", icon: FlaskConical, run: () => h.ask(`Simulate: what happens if ${sim}?`) });

  if (/^predict\b/.test(lo)) { const p = after(/^predict\s+(.+)/i); A.push({ id: "pred", label: p ? `Predict: ${p}` : "Predict — what happens next", hint: "Prediction", icon: TrendingUp, run: () => h.ask(`What is likely to happen next${p ? ` with ${p}` : ""}?`) }); }

  if (/^(create jira|jira|new issue|new ticket)\b/.test(lo)) A.push({ id: "jira", label: "Create Jira issue", hint: "Jira", icon: CheckSquare, run: () => h.fire("flow:create-jira", { title: q.replace(/^(create jira|jira|new issue|new ticket)\s*/i, "") }) });
  if (/^(compose|email|new email|reply)\b/.test(lo)) A.push({ id: "email", label: "Compose email", hint: "Email", icon: Mail, run: () => h.fire("flow:open-compose") });
  if (/^(note|new note|jot)\b/.test(lo)) A.push({ id: "note", label: "New note", hint: "Note", icon: FileText, run: () => h.fire("flow:open-note") });
  if (/^(approve|approvals|review|inbox)\b/.test(lo)) A.push({ id: "inbox", label: "Review approvals & inbox", hint: "Inbox", icon: CheckSquare, run: () => h.go("/inbox") });
  if (/^(council|debate|executives?)\b/.test(lo)) A.push({ id: "council", label: "Convene the Executive Council", hint: "Council", icon: Zap, run: () => h.go("/council") });
  const exec = after(/^execute\s+(.+)/i);
  if (exec) A.push({ id: "exec", label: `Execute: ${exec}`, hint: "Governed", icon: Zap, run: () => h.ask(`Plan and execute this, respecting governance: ${exec}`) });
  if (/^(replay|history|timeline)\b/.test(lo)) A.push({ id: "replay", label: "Open activity & replay", hint: "Timeline", icon: TrendingUp, run: () => h.go("/activity") });

  // Universal: a question with no verb → offer Ask FLOW.
  if (A.length === 0 && (/[?]$/.test(q) || /^(what|who|why|how|when|where|is|are|should|can|did|does|will)\b/.test(lo)))
    A.push({ id: "askq", label: `Ask FLOW: “${q}”`, hint: "Operational Brain", icon: Sparkles, run: () => h.ask(q) });

  return A.slice(0, 3);
}

export const CommandPalette = ({ isOpen, onClose }) => {
  const { token, workspaceId } = useWebSocket();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [queryText, setQueryText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  
  // Results
  const [synthesisAnswer, setSynthesisAnswer] = useState("");
  const [results, setResults] = useState([]);
  
  // Tabs & History
  const [activeFilter, setActiveFilter] = useState("all");
  const [history, setHistory] = useState(() => {
    try {
      const saved = localStorage.getItem("flow_os_search_history");
      return saved ? JSON.parse(saved) : ["Where did we decide to migrate to PostgreSQL?", "Who owns Project Atlas?"];
    } catch {
      return [];
    }
  });

  const [pinned, setPinned] = useState(["Summarize customer complaints about payments.", "Show production incidents from this week."]);

  // Keyboard navigation index
  const [focusedIndex, setFocusedIndex] = useState(-1);

  // Entity search state (BP-11 §Entity Search)
  const [entityResults, setEntityResults] = useState([]);
  const entityAbortRef = useRef(null);
  const entityTimerRef = useRef(null);

  const inputRef = useRef(null);
  const debounceTimerRef = useRef(null);

  const filters = [
    { id: "all", label: "All" },
    { id: "slack", label: "Messages" },
    { id: "gmail", label: "Emails" },
    { id: "calendar", label: "Meetings" },
    { id: "vault", label: "Vault Docs" },
    { id: "jira", label: "Tasks" },
    { id: "github", label: "Commits" },
  ];

  const faqs = [
    "Where did we decide to migrate to PostgreSQL?",
    "Show production incidents from this week.",
    "Who owns Project Atlas?",
    "What meetings discussed Redis?",
    "Find the Stripe API document."
  ];

  // Reset on open
  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => {
        setQueryText("");
        setResults([]);
        setSynthesisAnswer("");
        setEntityResults([]);
        setFocusedIndex(-1);
        inputRef.current?.focus();
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Debounced entity search (200ms, cancels stale requests)
  const searchEntities = useCallback((q) => {
    clearTimeout(entityTimerRef.current);
    entityAbortRef.current?.abort();
    if (!q || q.trim().length < 2) { setEntityResults([]); return; }
    entityTimerRef.current = setTimeout(async () => {
      const ctrl = new AbortController();
      entityAbortRef.current = ctrl;
      try {
        const wsId = localStorage.getItem("flow_os_workspace_id") || "";
        const token = localStorage.getItem("flow_os_token") || "";
        const res = await fetch(
          `/api/graph/search?q=${encodeURIComponent(q.trim())}&workspaceId=${encodeURIComponent(wsId)}&limit=5`,
          { headers: { Authorization: `Bearer ${token}`, "workspace-id": wsId }, signal: ctrl.signal }
        );
        if (!res.ok) { setEntityResults([]); return; }
        const data = await res.json();
        setEntityResults((data.nodes || data.results || []).slice(0, 5));
      } catch {
        // AbortError or network fail — silently hidden per BP-11
        setEntityResults([]);
      }
    }, 200);
  }, []);

  // Debounced Search Dispatcher (300ms)
  const dispatchSearch = async (text) => {
    const q = text.trim();
    if (!q) {
      setResults([]);
      setSynthesisAnswer("");
      return;
    }

    setIsLoading(true);
    const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}`, "workspace-id": workspaceId };
    try {
      // One search across BOTH the RAG memory (/api/query) AND every connected
      // connector (/api/connectors/search fan-out) — one query, all sources (Phase 16).
      const [ragRes, connRes] = await Promise.allSettled([
        fetch("/api/query", { method: "POST", headers, body: JSON.stringify({ queryText: q }) }).then((r) => (r.ok ? r.json() : Promise.reject(r.status))),
        fetch("/api/connectors/search", { method: "POST", headers, body: JSON.stringify({ query: q, limit: 20 }) }).then((r) => (r.ok ? r.json() : Promise.reject(r.status))),
      ]);

      const merged = [];
      if (ragRes.status === "fulfilled") {
        setSynthesisAnswer(ragRes.value.synthesisBrief || ragRes.value.answer || "");
        (ragRes.value.results || ragRes.value.chunks || []).forEach((c) => merged.push({
          id: c.id || String(Math.random()),
          title: c.title || `${(c.source || "Workspace").toUpperCase()} intel`,
          description: c.text || c.content || "",
          source: String(c.source || c.platform || "vault").toLowerCase(),
          timestamp: "Memory", score: c.score || 0.82,
          authority: c.authorityCoeff || (["github", "vault"].includes(String(c.source).toLowerCase()) ? 1.5 : 0.8),
        }));
      }
      if (connRes.status === "fulfilled") {
        (connRes.value.results || connRes.value.items || []).forEach((r) => merged.push({
          id: r.id || String(Math.random()),
          title: r.title || `${(r.connector || "source").toUpperCase()} result`,
          description: r.excerpt || r.snippet || "",
          source: String(r.connector || "system").toLowerCase(),
          timestamp: r.timestamp ? new Date(r.timestamp).toLocaleDateString() : "Live",
          score: r.score || 0.7, authority: 1.0, url: r.url || null,
        }));
      }
      // Dedup by title+source, keep highest score first.
      const seen = new Set();
      const deduped = merged.sort((a, b) => b.score - a.score).filter((r) => {
        const k = `${r.source}:${(r.title || "").slice(0, 60)}`;
        if (seen.has(k)) return false; seen.add(k); return true;
      });
      setResults(deduped);

      if (ragRes.status === "rejected" && connRes.status === "rejected") throw new Error("all sources failed");

      setHistory((prev) => {
        const updated = [q, ...prev.filter((h) => h !== q)].slice(0, 10);
        localStorage.setItem("flow_os_search_history", JSON.stringify(updated));
        return updated;
      });
    } catch {
      showToast("Search is unavailable right now.", "error");
    } finally {
      setIsLoading(false);
    }
  };

  const handleInputChange = (e) => {
    const val = e.target.value;
    setQueryText(val);

    clearTimeout(debounceTimerRef.current);

    // In slash mode don't trigger the heavy RAG search
    if (val.startsWith("/")) {
      setResults([]); setSynthesisAnswer(""); setEntityResults([]);
      return;
    }

    debounceTimerRef.current = setTimeout(() => {
      dispatchSearch(val);
    }, 300);

    // Entity search (200ms debounce, independent)
    searchEntities(val);
  };

  // Keyboard navigation triggers (ArrowUp, ArrowDown, Enter, Esc)
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!isOpen) return;

      const totalItems = filteredResults.length + (queryText.trim() === "" ? pinned.length + history.length : 0);

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setFocusedIndex((prev) => (prev + 1 >= totalItems ? 0 : prev + 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setFocusedIndex((prev) => (prev - 1 < 0 ? totalItems - 1 : prev - 1));
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (focusedIndex >= 0) {
          // Select suggestion or results
          if (queryText.trim() === "") {
            const allSugs = [...pinned, ...history];
            const selectedSug = allSugs[focusedIndex];
            if (selectedSug) {
              setQueryText(selectedSug);
              dispatchSearch(selectedSug);
              setFocusedIndex(-1);
            }
          } else {
            const selectedRes = filteredResults[focusedIndex];
            if (selectedRes) {
              showToast(`Opening: ${selectedRes.title}`, "info");
              onClose();
            }
          }
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, focusedIndex, results, queryText, history, pinned]);

  const handlePin = (q, e) => {
    e.stopPropagation();
    if (pinned.includes(q)) {
      setPinned((prev) => prev.filter((p) => p !== q));
    } else {
      setPinned((prev) => [...prev, q]);
    }
  };

  const handleDeleteHistory = (q, e) => {
    e.stopPropagation();
    setHistory((prev) => {
      const updated = prev.filter((h) => h !== q);
      localStorage.setItem("flow_os_search_history", JSON.stringify(updated));
      return updated;
    });
  };

  const filteredResults = results.filter(
    (r) => activeFilter === "all" || r.source === activeFilter
  );

  // Slash mode: query starts with "/"
  const isSlashMode = queryText.startsWith("/");
  const slashMatched = isSlashMode
    ? SLASH_COMMANDS.filter((c) => c.cmd.startsWith(queryText.toLowerCase()))
    : [];

  const commandQuery = queryText.trim().toLowerCase().replace(/^(open|go to|show me|show|navigate to|navigate)\s+/i, "").trim();
  const matchedCommands = (queryText.trim() === "" || isSlashMode)
    ? []
    : NAV_COMMANDS.filter((c) =>
        c.label.toLowerCase().includes(commandQuery) ||
        c.keywords.some((k) => k.includes(commandQuery) || commandQuery.includes(k))
      ).slice(0, 4);

  const runCommand = (route) => {
    navigate(route);
    onClose();
  };

  // Executable action layer — verb-first commands that RUN (Phase 16).
  const actionHelpers = {
    ask:  (q) => { window.dispatchEvent(new CustomEvent("flow:ask-brain", { detail: { question: q } })); onClose(); },
    fire: (name, detail) => { window.dispatchEvent(new CustomEvent(name, detail ? { detail } : undefined)); onClose(); },
    go:   (route) => { navigate(route); onClose(); },
  };
  const actionCommands = deriveActions(queryText, actionHelpers);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            onClick={onClose}
            style={{ position: "fixed", inset: 0, background: "rgba(31,27,22,0.35)", backdropFilter: "blur(8px)", zIndex: 50, display: "flex", justifyContent: "center", paddingTop: 80, paddingLeft: 16, paddingRight: 16 }}
          >
            {/* Dialog */}
            <motion.div
              initial={{ opacity: 0, scale: 0.97, y: -10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97, y: -10 }}
              transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
              onClick={e => e.stopPropagation()}
              style={{
                width: "100%", maxWidth: 640,
                background: "var(--surface-2)",
                border: "1px solid var(--border-strong)",
                borderRadius: 6,
                boxShadow: "0 24px 64px rgba(31,27,22,0.35)",
                overflow: "hidden",
                display: "flex", flexDirection: "column",
                maxHeight: "80vh",
              }}
            >
              {/* Input row */}
              <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderBottom: "1px solid var(--border)", background: "rgba(31,27,22,0.04)" }}>
                <Search style={{ width: 16, height: 16, color: "var(--t4)", flexShrink: 0 }} />
                <input
                  ref={inputRef}
                  type="text"
                  placeholder="Search, ask, or act — 'ask is the launch safe?', 'simulate Rahul leaves', 'create jira …'"
                  value={queryText}
                  onChange={handleInputChange}
                  onKeyDown={(e) => { if (e.key === "Enter" && focusedIndex < 0 && actionCommands.length) { e.preventDefault(); actionCommands[0].run(); } }}
                  style={{ flex: 1, background: "transparent", color: "var(--t1)", fontSize: 14, border: "none", outline: "none", fontFamily: "'Instrument Sans', sans-serif" }}
                />
                {queryText && (
                  <button
                    onClick={() => { setQueryText(""); setResults([]); setSynthesisAnswer(""); }}
                    style={{ background: "transparent", border: "none", color: "var(--t4)", cursor: "pointer", padding: 4, borderRadius: 3 }}
                  >
                    <X style={{ width: 13, height: 13 }} />
                  </button>
                )}
                <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: "var(--t5)", background: "rgba(31,27,22,0.05)", border: "1px solid var(--border)", borderRadius: 4, padding: "2px 6px", flexShrink: 0 }}>
                  ESC
                </span>
              </div>

              {/* Filter tabs */}
              {queryText.trim() !== "" && (
                <div style={{ display: "flex", gap: 4, padding: "8px 12px", borderBottom: "1px solid var(--border)", overflowX: "auto" }}>
                  {filters.map(f => (
                    <button
                      key={f.id}
                      onClick={() => setActiveFilter(f.id)}
                      style={{
                        padding: "3px 9px", borderRadius: 4, fontSize: 11, fontWeight: 500, flexShrink: 0,
                        cursor: "pointer", transition: "all 100ms", letterSpacing: "-0.05px",
                        background: activeFilter === f.id ? "rgba(232,103,43,0.10)" : "transparent",
                        color: activeFilter === f.id ? "var(--brand-text)" : "var(--t4)",
                        border: `1px solid ${activeFilter === f.id ? "rgba(232,103,43,0.25)" : "transparent"}`,
                      }}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              )}

              {/* Body */}
              <div style={{ flex: 1, overflowY: "auto", padding: "14px 16px", display: "flex", flexDirection: "column", gap: 14, maxHeight: "50vh" }}>

                {/* 0. Slash command mode (BP-11 §Slash Mode) */}
                {isSlashMode && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <span style={{ fontSize: 9, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--t5)", paddingLeft: 2 }}>Slash Commands</span>
                    {(slashMatched.length ? slashMatched : SLASH_COMMANDS).map((sc) => (
                      <button
                        key={sc.cmd}
                        onClick={() => { if (sc.route) { navigate(sc.route); onClose(); } else if (sc.action === "sync") { window.dispatchEvent(new CustomEvent("flow:sync-connectors")); onClose(); } }}
                        style={{
                          display: "flex", alignItems: "center", justifyContent: "space-between",
                          padding: "9px 12px", borderRadius: 5, cursor: "pointer", textAlign: "left",
                          background: "rgba(31,27,22,0.03)", border: "1px solid var(--line-1)", color: "var(--t1)",
                        }}
                        onMouseEnter={e => { e.currentTarget.style.background = "rgba(232,103,43,0.07)"; e.currentTarget.style.borderColor = "var(--accent-line)"; }}
                        onMouseLeave={e => { e.currentTarget.style.background = "rgba(31,27,22,0.03)"; e.currentTarget.style.borderColor = "var(--line-1)"; }}
                      >
                        <span style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                          <kbd style={{ fontFamily: "var(--font-data)", fontSize: 11, fontWeight: 500, color: "var(--accent)", background: "var(--accent-dim)", border: "1px solid var(--accent-line)", borderRadius: 3, padding: "1px 6px", flexShrink: 0 }}>{sc.cmd}</kbd>
                          <span style={{ fontSize: 13, fontWeight: 400 }}>{sc.label}</span>
                        </span>
                        <span style={{ fontSize: 11, color: "var(--t4)", flexShrink: 0 }}>{sc.desc}</span>
                      </button>
                    ))}
                  </div>
                )}

                {/* 1. Loading skeletons */}
                {!isSlashMode && isLoading && (<div className="space-y-4 animate-pulse">
                    <div className="bg-bg-secondary/40 border border-border-flow rounded-xl p-4 space-y-3">
                      <Skeleton className="w-24 h-4" />
                      <Skeleton className="w-full h-12" />
                    </div>
                    <div className="space-y-2">
                      <Skeleton className="w-full h-16" />
                      <Skeleton className="w-full h-16" />
                    </div>
                  </div>
                )}

                {/* 2. Empty query / history / FAQs suggestions */}
                {!isSlashMode && !isLoading && queryText.trim() === "" && (
                  <div className="space-y-4 select-none">
                    
                    {/* Suggested / FAQs list */}
                    <div className="space-y-1.5">
                      <span className="block text-[8px] font-bold text-text-muted uppercase tracking-widest pl-1">
                        Suggested Inquiries
                      </span>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        {faqs.slice(0, 4).map((faq, idx) => (
                          <button
                            key={idx}
                            onClick={() => {
                              setQueryText(faq);
                              dispatchSearch(faq);
                            }}
                            className="flex items-center justify-between p-2.5 rounded-lg border border-border-flow bg-bg-secondary/20 hover:border-flow-purple/20 hover:bg-bg-hover text-ui-xs text-text-secondary hover:text-text-primary text-left cursor-pointer transition-apple"
                          >
                            <span className="truncate pr-4">{faq}</span>
                            <ArrowUpRight className="w-3.5 h-3.5 text-text-muted flex-shrink-0" />
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Pinned list */}
                    {pinned.length > 0 && (
                      <div className="space-y-1">
                        <span className="block text-[8px] font-bold text-text-muted uppercase tracking-widest pl-1">
                          Pinned Queries
                        </span>
                        {pinned.map((pin, idx) => {
                          const isFocused = focusedIndex === idx;
                          return (
                            <div
                              key={idx}
                              onClick={() => { setQueryText(pin); dispatchSearch(pin); }}
                              className={`flex items-center justify-between px-3 py-2 rounded-lg text-ui-sm text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-apple cursor-pointer ${isFocused ? "bg-bg-hover text-text-primary" : ""}`}
                            >
                              <div className="flex items-center space-x-2.5 truncate">
                                <Pin className="w-3.5 h-3.5 text-flow-purple flex-shrink-0" />
                                <span className="truncate pr-4">{pin}</span>
                              </div>
                              <button 
                                onClick={(e) => handlePin(pin, e)}
                                className="text-[10px] text-text-muted hover:text-flow-purple cursor-pointer select-none"
                              >
                                Unpin
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* History list */}
                    {history.length > 0 && (
                      <div className="space-y-1">
                        <span className="block text-[8px] font-bold text-text-muted uppercase tracking-widest pl-1">
                          Recent Searches
                        </span>
                        {history.map((hist, idx) => {
                          const baseIdx = pinned.length + idx;
                          const isFocused = focusedIndex === baseIdx;
                          return (
                            <div
                              key={idx}
                              onClick={() => { setQueryText(hist); dispatchSearch(hist); }}
                              className={`flex items-center justify-between px-3 py-2 rounded-lg text-ui-sm text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-apple cursor-pointer ${isFocused ? "bg-bg-hover text-text-primary" : ""}`}
                            >
                              <div className="flex items-center space-x-2.5 truncate">
                                <History className="w-3.5 h-3.5 text-text-muted flex-shrink-0" />
                                <span className="truncate pr-4">{hist}</span>
                              </div>
                              <div className="flex items-center space-x-2 select-none">
                                <button 
                                  onClick={(e) => handlePin(hist, e)}
                                  className="text-[10px] text-text-muted hover:text-flow-purple cursor-pointer"
                                >
                                  Pin
                                </button>
                                <button 
                                  onClick={(e) => handleDeleteHistory(hist, e)}
                                  className="text-[10px] text-text-muted hover:text-critical cursor-pointer"
                                >
                                  Clear
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                  </div>
                )}

                {/* 3. Search Results & AI Synthesis Answer */}
                {!isSlashMode && !isLoading && queryText.trim() !== "" && (
                  <div className="space-y-4">

                    {actionCommands.length > 0 && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 4 }}>
                        <span style={{ fontSize: 9, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--t5)", paddingLeft: 2 }}>Actions</span>
                        {actionCommands.map((a, i) => {
                          const Icon = a.icon;
                          return (
                            <button key={a.id} onClick={a.run}
                              style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 12px", borderRadius: 6, cursor: "pointer", textAlign: "left",
                                background: i === 0 ? "rgba(232,103,43,0.10)" : "rgba(31,27,22,0.04)",
                                border: `1px solid ${i === 0 ? "var(--brand-line)" : "var(--border)"}`, color: "var(--t1)" }}>
                              <span style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 0 }}>
                                <Icon style={{ width: 14, height: 14, color: "var(--brand)", flexShrink: 0 }} />
                                <span style={{ fontSize: 13, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.label}</span>
                              </span>
                              <span style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                                <span style={{ fontSize: 10, color: "var(--t5)" }}>{a.hint}</span>
                                {i === 0 && <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: "var(--t5)", border: "1px solid var(--border)", borderRadius: 4, padding: "1px 5px" }}>↵</span>}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {matchedCommands.length > 0 && (
                      <div className="space-y-1.5">
                        <span className="block text-[8px] font-bold text-text-muted uppercase tracking-widest pl-1 select-none">
                          Quick Commands
                        </span>
                        {matchedCommands.map((cmd) => (
                          <button
                            key={cmd.route}
                            onClick={() => runCommand(cmd.route)}
                            className="w-full flex items-center justify-between px-3 py-2 rounded-lg border border-border-flow bg-bg-secondary/20 hover:border-flow-purple/30 hover:bg-bg-hover text-ui-sm text-text-secondary hover:text-text-primary text-left cursor-pointer transition-apple"
                          >
                            <div className="flex items-center space-x-2.5 truncate">
                              <ArrowUpRight className="w-3.5 h-3.5 text-flow-purple flex-shrink-0" />
                              <span className="truncate">{cmd.label}</span>
                            </div>
                            <span className="text-[10px] text-text-muted font-mono flex-shrink-0">{cmd.route}</span>
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Entity search results (BP-11 §Entity Search) */}
                    {entityResults.length > 0 && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        <span style={{ fontSize: 9, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--t5)", paddingLeft: 2 }}>Entities</span>
                        {entityResults.map((entity) => (
                          <button
                            key={entity.id || entity.nodeId}
                            onClick={() => { navigate(`/entity/${entity.id || entity.nodeId}`); onClose(); }}
                            style={{
                              display: "flex", alignItems: "center", gap: 10,
                              padding: "8px 12px", borderRadius: 5, cursor: "pointer", textAlign: "left",
                              background: "rgba(31,27,22,0.03)", border: "1px solid var(--line-1)",
                            }}
                            onMouseEnter={e => { e.currentTarget.style.background = "rgba(31,27,22,0.06)"; }}
                            onMouseLeave={e => { e.currentTarget.style.background = "rgba(31,27,22,0.03)"; }}
                          >
                            <EntityIcon type={entity.type} />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 13, fontWeight: 400, color: "var(--t1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{entity.name || entity.label || entity.id}</div>
                              {entity.subtitle && <div style={{ fontSize: 11, color: "var(--t4)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{entity.subtitle}</div>}
                            </div>
                            <span style={{ fontSize: 10, color: "var(--t5)", flexShrink: 0, background: "rgba(31,27,22,0.05)", border: "1px solid var(--line-1)", borderRadius: 3, padding: "1px 5px" }}>{entity.type || "entity"}</span>
                          </button>
                        ))}
                      </div>
                    )}

                    {/* AI synthesis answer */}
                    {synthesisAnswer && (
                      <div style={{ background: "rgba(232,103,43,0.06)", border: "1px solid var(--brand-line)", borderLeft: "2px solid var(--brand)", borderRadius: 4, padding: "12px 14px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 8 }}>
                          <Sparkles style={{ width: 12, height: 12, color: "var(--brand)" }} />
                          <span style={{ fontSize: 10, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--brand-text)" }}>
                            FLOW Intelligence Synthesis
                          </span>
                        </div>
                        <p style={{ fontSize: 13, color: "var(--t2)", lineHeight: 1.65 }}>
                          {synthesisAnswer}
                        </p>
                      </div>
                    )}

                    {/* Results list */}
                    {filteredResults.length === 0 ? (
                      <EmptyState message="No results matched this category filter." />
                    ) : (
                      <div className="space-y-2">
                        <span className="block text-[8px] font-bold text-text-muted uppercase tracking-widest pl-1 select-none">
                          Workspace Results ({filteredResults.length})
                        </span>
                        
                        <div className="space-y-2">
                          {filteredResults.map((item, idx) => {
                            const isFocused = focusedIndex === idx;
                            return (
                              <div
                                key={item.id}
                                className={`p-3 bg-bg-card border rounded-lg flex flex-col justify-between transition-apple hover:border-border-flow/90 cursor-pointer ${
                                  isFocused ? "border-flow-purple bg-bg-hover" : "border-border-flow"
                                }`}
                              >
                                <div className="space-y-1">
                                  {/* Item metadata headers */}
                                  <div className="flex items-center justify-between text-[10px] select-none">
                                    <div className="flex items-center space-x-2">
                                      <SourceBadge source={item.source} className="scale-90" />
                                      <span className="text-[10px] font-semibold text-flow-purple bg-flow-purple/10 px-1 py-0.5 rounded border border-flow-purple/20">
                                        Score: {(item.score).toFixed(2)}
                                      </span>
                                      {item.authority > 1.2 && (
                                        <span className="text-[9px] font-bold text-success bg-success/10 px-1 py-0.5 rounded border border-success/25">
                                          HIGH AUTHORITY
                                        </span>
                                      )}
                                    </div>
                                    <span className="text-text-muted font-light">{item.timestamp}</span>
                                  </div>

                                  {/* Result text context snippet */}
                                  <p className="text-ui-xs text-text-secondary leading-relaxed font-light whitespace-pre-wrap break-words select-text">
                                    {item.description}
                                  </p>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                  </div>
                )}

              </div>

              {/* Footer */}
              <div style={{ padding: "8px 16px", borderTop: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
                <div style={{ display: "flex", gap: 12, fontSize: 10, color: "var(--t5)", letterSpacing: "-0.05px" }}>
                  <span>↑↓ Navigate</span>
                  <span>↵ Run / Select</span>
                  <span>ESC Close</span>
                </div>
                <span style={{ fontSize: 10, color: "var(--t5)", letterSpacing: "-0.05px" }}>FLOW Command Bar</span>
              </div>

            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
};

export default CommandPalette;
