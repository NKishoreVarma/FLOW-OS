import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Search, Sparkles, X, ArrowUpRight, Pin, History } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useWebSocket } from "../../hooks/useWebSocket";
import { useToast } from "./ToastProvider";
import SourceBadge from "../workfeed/SourceBadge";
import Skeleton from "./Skeleton";
import EmptyState from "./EmptyState";

const NAV_COMMANDS = [
  { label: "Open Executive Dashboard", route: "/dashboard", keywords: ["dashboard", "exec", "executive", "overview", "health"] },
  { label: "Open Daily Briefing", route: "/briefing", keywords: ["briefing", "brief", "daily", "priorities", "today"] },
  { label: "Open Operational Timeline", route: "/timeline", keywords: ["timeline", "history", "activity", "events", "story"] },
  { label: "Open Workfeed", route: "/workfeed", keywords: ["workfeed", "feed", "work", "home"] },
  { label: "Open Meetings", route: "/meetings", keywords: ["meeting", "meetings", "calendar"] },
  { label: "Open Projects", route: "/projects", keywords: ["project", "projects", "engineering", "repo", "pr"] },
  { label: "Open Knowledge", route: "/knowledge", keywords: ["knowledge", "docs", "document", "wiki"] },
  { label: "Open Inbox", route: "/inbox", keywords: ["inbox", "email", "mail", "messages"] },
  { label: "Open Universal Search", route: "/search", keywords: ["search", "find", "lookup"] },
  { label: "Open Team Dashboard", route: "/company", keywords: ["team", "company", "collaboration"] },
  { label: "Open Company Overview", route: "/admin", keywords: ["admin", "company overview", "departments"] },
  { label: "Open Platform Console", route: "/platform", keywords: ["platform", "enterprise", "governance", "iam"] }
];

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

  // Auto-focus on open
  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => {
        setQueryText("");
        setResults([]);
        setSynthesisAnswer("");
        setFocusedIndex(-1);
        inputRef.current?.focus();
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Debounced Search Dispatcher (300ms)
  const dispatchSearch = async (text) => {
    const q = text.trim();
    if (!q) {
      setResults([]);
      setSynthesisAnswer("");
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch("/api/query", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
          "workspace-id": workspaceId,
        },
        body: JSON.stringify({ queryText: q }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      setSynthesisAnswer(data.synthesisBrief || data.answer || "");
      
      const rawChunks = data.results || data.chunks || [];
      const normalized = rawChunks.map((c) => ({
        id: c.id || String(Math.random()),
        title: c.title || `${c.source?.toUpperCase() || 'Workspace'} Intelligence Node`,
        description: c.text || c.content || "",
        source: String(c.source || c.platform || "slack").toLowerCase(),
        timestamp: "Recently",
        score: c.score || 0.82,
        authority: c.authorityCoeff || (c.source?.toLowerCase() === "github" || c.source?.toLowerCase() === "vault" ? 1.5 : 0.8),
      }));
      setResults(normalized);

      // Save to history list
      setHistory((prev) => {
        const filtered = prev.filter((h) => h !== q);
        const updated = [q, ...filtered].slice(0, 10);
        localStorage.setItem("flow_os_search_history", JSON.stringify(updated));
        return updated;
      });

    } catch (err) {
      console.error("Universal Search failure:", err);
      showToast("RAG Search failed to retrieve brain logs.", "error");
    } finally {
      setIsLoading(false);
    }
  };

  const handleInputChange = (e) => {
    const val = e.target.value;
    setQueryText(val);

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      dispatchSearch(val);
    }, 300);
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

  const commandQuery = queryText.trim().toLowerCase().replace(/^(open|go to|show me|show|navigate to|navigate)\s+/i, "").trim();
  const matchedCommands = queryText.trim() === ""
    ? []
    : NAV_COMMANDS.filter((c) =>
        c.label.toLowerCase().includes(commandQuery) ||
        c.keywords.some((k) => k.includes(commandQuery) || commandQuery.includes(k))
      ).slice(0, 4);

  const runCommand = (route) => {
    navigate(route);
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop blur overlay */}
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex justify-center pt-20 px-4" onClick={onClose}>
            
            {/* Search console center dialog */}
            <motion.div
              initial={{ opacity: 0, scale: 0.97, y: -10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97, y: -10 }}
              transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
              className="w-full max-w-2xl h-fit max-h-[80vh] rounded-xl border border-white/10 bg-bg-card/95 shadow-2xl overflow-hidden flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Input section */}
              <div className="flex items-center space-x-3 px-4 py-3 border-b border-border-flow/80 bg-bg-secondary/20">
                <Search className="w-5 h-5 text-text-muted flex-shrink-0" />
                <input
                  ref={inputRef}
                  type="text"
                  placeholder="Ask anything (e.g. Where did we decide to migrate to PostgreSQL?)"
                  value={queryText}
                  onChange={handleInputChange}
                  className="w-full bg-transparent text-ui-sm text-text-primary placeholder:text-text-muted focus:outline-none"
                />
                {queryText && (
                  <button 
                    onClick={() => { setQueryText(""); setResults([]); setSynthesisAnswer(""); }}
                    className="p-1 rounded text-text-muted hover:text-text-primary hover:bg-bg-hover transition-colors cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
                <span className="text-[10px] text-text-muted font-bold bg-bg-secondary px-1.5 py-0.5 rounded border border-border-flow select-none">
                  ESC
                </span>
              </div>

              {/* Filters Tabs bar */}
              {queryText.trim() !== "" && (
                <div className="px-3 py-1.5 border-b border-border-flow/60 bg-bg-secondary/10 flex gap-1 overflow-x-auto select-none">
                  {filters.map((f) => (
                    <button
                      key={f.id}
                      onClick={() => setActiveFilter(f.id)}
                      className={`px-2.5 py-0.5 rounded text-[10px] font-semibold transition-colors cursor-pointer flex-shrink-0 ${
                        activeFilter === f.id
                          ? "bg-flow-purple/10 text-flow-purple border border-flow-purple/20"
                          : "text-text-secondary hover:bg-bg-hover hover:text-text-primary border border-transparent"
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              )}

              {/* Console Body scroll */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4 max-h-[50vh]">
                
                {/* 1. Loading skeletons */}
                {isLoading && (
                  <div className="space-y-4 animate-pulse">
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
                {!isLoading && queryText.trim() === "" && (
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
                {!isLoading && queryText.trim() !== "" && (
                  <div className="space-y-4">

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

                    {/* AI Answer Panel summary */}
                    {synthesisAnswer && (
                      <div className="relative overflow-hidden border border-flow-purple/20 bg-flow-purple/5 rounded-xl p-4 space-y-3">
                        <div className="absolute -right-16 -top-16 w-32 h-32 rounded-full bg-flow-purple/5 blur-xl pointer-events-none" />
                        <div className="flex items-center space-x-2 text-ui-xs text-flow-purple font-semibold select-none">
                          <Sparkles className="w-4 h-4 text-flow-purple animate-pulse" />
                          <span>FLOW Intelligence Synthesis</span>
                        </div>
                        <p className="text-ui-xs text-text-primary leading-relaxed select-text pr-2 font-normal">
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

              {/* Footer navigation cues */}
              <div className="px-4 py-2 border-t border-border-flow/60 bg-bg-secondary/40 flex items-center justify-between text-[10px] text-text-muted font-medium select-none">
                <div className="flex items-center space-x-3">
                  <span>↑↓ Navigate</span>
                  <span>↵ Select / Query</span>
                </div>
                <span>FLOW Search Engine v1.0</span>
              </div>

            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
};

export default CommandPalette;
