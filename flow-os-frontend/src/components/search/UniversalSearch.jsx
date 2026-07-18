import { useState, useRef, useEffect, useCallback } from "react";
import {
  Search as SearchIcon, Sparkles, MessageSquare, FileText,
  CheckSquare, GitCommit, Mail, Calendar, X, Clock,
  ArrowRight, Brain, Shield, Zap, ChevronRight
} from "lucide-react";
import { useWebSocket } from "../../hooks/useWebSocket";

const SOURCE_CFG = {
  slack:    { icon: MessageSquare, color: "#E01E5A",           bg: "rgba(224,30,90,0.10)",   label: "Slack"    },
  gmail:    { icon: Mail,          color: "#EA4335",           bg: "rgba(234,67,53,0.10)",   label: "Gmail"    },
  github:   { icon: GitCommit,     color: "var(--t4)",         bg: "rgba(31,27,22,0.06)", label: "GitHub"   },
  jira:     { icon: CheckSquare,   color: "#2684FF",           bg: "rgba(38,132,255,0.10)",  label: "Jira"     },
  notion:   { icon: FileText,      color: "var(--t4)",         bg: "rgba(31,27,22,0.06)", label: "Notion"   },
  vault:    { icon: Shield,        color: "var(--brand-text)", bg: "rgba(232,103,43,0.10)", label: "Vault"    },
  calendar: { icon: Calendar,      color: "#34A853",           bg: "rgba(52,168,83,0.10)",   label: "Calendar" },
  default:  { icon: FileText,      color: "var(--t5)",         bg: "rgba(31,27,22,0.05)", label: "Source"   },
};

const SUGGESTED_QUERIES = [
  "What database changes are pending this sprint?",
  "What did we decide about the API rate limits?",
  "Show me all incidents from the last 24 hours",
  "What is the status of the PostgreSQL migration?",
  "What engineering decisions were made this week?",
  "Who is blocking the deployment pipeline?",
];

const FILTER_OPTIONS = ["All", "Slack", "Gmail", "GitHub", "Jira", "Notion", "Vault"];

function SourceBadge({ source }) {
  const cfg = SOURCE_CFG[source?.toLowerCase()] ?? SOURCE_CFG.default;
  const Icon = cfg.icon;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 8px", borderRadius: 10, background: cfg.bg, border: `1px solid ${cfg.color}22`, fontSize: 8, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.10em", color: cfg.color }}>
      <Icon style={{ width: 9, height: 9 }} />
      {cfg.label}
    </span>
  );
}

function ResultCard({ result, index }) {
  const cfg = SOURCE_CFG[result.source?.toLowerCase()] ?? SOURCE_CFG.default;
  const Icon = cfg.icon;
  const [hov, setHov] = useState(false);
  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{ background: hov ? "var(--bg-hover)" : "var(--bg-card)", border: `1px solid ${hov ? "rgba(31,27,22,0.10)" : "var(--border-strong)"}`, borderRadius: 4, padding: "14px 16px", cursor: "default", transition: "background 80ms, border-color 80ms", animationDelay: `${index * 50}ms` }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        <div style={{ flexShrink: 0, width: 30, height: 30, borderRadius: 5, background: cfg.bg, border: `1px solid ${cfg.color}22`, display: "flex", alignItems: "center", justifyContent: "center", marginTop: 2 }}>
          <Icon style={{ width: 14, height: 14, color: cfg.color }} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 6, marginBottom: 6 }}>
            <SourceBadge source={result.source} />
            {result.authorityCoeff >= 1.5 && (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 8, fontWeight: 500, padding: "2px 7px", borderRadius: 10, background: "rgba(232,103,43,0.08)", border: "1px solid rgba(232,103,43,0.22)", color: "var(--brand-text)" }}>
                <Shield style={{ width: 9, height: 9 }} /> HIGH AUTH
              </span>
            )}
            {result.score && (
              <span style={{ marginLeft: "auto", fontSize: 9, color: "var(--t5)" }}>
                relevance {Math.round((result.finalScore || result.score || 0) * 100)}%
              </span>
            )}
          </div>
          <p style={{ fontSize: 12, color: "var(--t1)", lineHeight: 1.65, marginBottom: result.origin ? 6 : 0 }}>
            {result.content || result.text || result.markdown || "No content available."}
          </p>
          {result.origin && (
            <p style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: "var(--t5)" }}>
              <ChevronRight style={{ width: 9, height: 9 }} />
              {result.origin} · {result.channel || result.source}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function SynthesisBrief({ brief }) {
  if (!brief) return null;
  return (
    <div style={{ background: "rgba(232,103,43,0.06)", border: "1px solid var(--brand-line)", borderLeft: "2px solid var(--brand)", borderRadius: 4, padding: "14px 16px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <div style={{ width: 26, height: 26, borderRadius: 5, background: "rgba(232,103,43,0.10)", border: "1px solid var(--brand-line)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Brain style={{ width: 12, height: 12, color: "var(--brand)" }} />
        </div>
        <span style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--brand-text)" }}>AI Synthesis</span>
        <span style={{ fontSize: 9, color: "var(--t5)", marginLeft: "auto" }}>Executive brief</span>
      </div>
      <div style={{ fontSize: 13, color: "var(--t1)", lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{brief}</div>
    </div>
  );
}

export const UniversalSearch = () => {
  const { token, workspaceId } = useWebSocket();
  const [query, setQuery]               = useState("");
  const [activeFilter, setActiveFilter] = useState("All");
  const [isSearching, setIsSearching]   = useState(false);
  const [results, setResults]           = useState(null);
  const [synthesis, setSynthesis]       = useState(null);
  const [error, setError]               = useState(null);
  const [hFilter, setHFilter]           = useState(null);
  const [hRecent, setHRecent]           = useState(null);
  const [hSuggest, setHSuggest]         = useState(null);
  const [recentSearches, setRecentSearches] = useState(() => {
    try { return JSON.parse(localStorage.getItem("flow_recent_searches") || "[]"); }
    catch { return []; }
  });
  const inputRef = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const saveRecentSearch = useCallback((q) => {
    const updated = [q, ...recentSearches.filter(s => s !== q)].slice(0, 5);
    setRecentSearches(updated);
    localStorage.setItem("flow_recent_searches", JSON.stringify(updated));
  }, [recentSearches]);

  const handleSearch = useCallback(async (searchQuery) => {
    const q = searchQuery || query;
    if (!q.trim() || !token || !workspaceId) return;
    setIsSearching(true); setResults(null); setSynthesis(null); setError(null);
    saveRecentSearch(q.trim());
    try {
      const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}`, "workspace-id": workspaceId };
      const [ragRes, connRes] = await Promise.allSettled([
        fetch("/api/query", { method: "POST", headers, body: JSON.stringify({ queryText: q }) }),
        fetch("/api/connectors/search", { method: "POST", headers, body: JSON.stringify({ query: q, limit: 20 }) }),
      ]);
      let ragResults = [], synthesisBrief = null;
      if (ragRes.status === "fulfilled" && ragRes.value.ok) {
        const d = await ragRes.value.json();
        ragResults = d.results || [];
        synthesisBrief = d.synthesisBrief || null;
      }
      let connResults = [];
      if (connRes.status === "fulfilled" && connRes.value.ok) {
        const d = await connRes.value.json();
        connResults = (d.results || []).map(r => ({ id: r.id, source: r.connector, text: r.excerpt, title: r.title, score: r.score, authorityCoeff: 1.0, origin: `connector:${r.connector}`, channel: r.capability, timestamp: r.timestamp }));
      }
      const seen = new Set();
      let merged = [...connResults, ...ragResults].filter(r => {
        const key = (r.text || r.excerpt || "").slice(0, 60).toLowerCase().trim();
        if (seen.has(key)) return false;
        seen.add(key); return true;
      });
      if (activeFilter !== "All") merged = merged.filter(r => r.source?.toLowerCase() === activeFilter.toLowerCase());
      setResults(merged); setSynthesis(synthesisBrief);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSearching(false);
    }
  }, [query, token, workspaceId, activeFilter, saveRecentSearch]);

  const handleSubmit = e => { e.preventDefault(); handleSearch(); };
  const handleSuggest = q => { setQuery(q); handleSearch(q); };
  const clearSearch = () => { setQuery(""); setResults(null); setSynthesis(null); setError(null); inputRef.current?.focus(); };
  const hasResults = results !== null;

  return (
    <div style={{ padding: "24px", maxWidth: 800, margin: "0 auto", display: "flex", flexDirection: "column", gap: 24 }}>

      {/* Header — shown when no results */}
      {!hasResults && (
        <div style={{ textAlign: "center", paddingTop: 24 }}>
          <div style={{ width: 52, height: 52, borderRadius: 10, background: "rgba(232,103,43,0.10)", border: "1px solid rgba(232,103,43,0.22)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
            <Sparkles style={{ width: 24, height: 24, color: "var(--brand)" }} />
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 500, color: "var(--t1)", letterSpacing: "-0.4px", marginBottom: 6 }}>Universal Search</h1>
          <p style={{ fontSize: 12, color: "var(--t4)" }}>Ask anything across Slack, Gmail, Notion, Jira, and GitHub.</p>
        </div>
      )}

      {/* Search bar */}
      <form onSubmit={handleSubmit} style={{ position: "relative" }}>
        <div style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", zIndex: 1 }}>
          {isSearching
            ? <div style={{ width: 16, height: 16, borderRadius: "50%", border: "2px solid rgba(232,103,43,0.20)", borderTopColor: "var(--brand)", animation: "spin 0.7s linear infinite" }} />
            : <SearchIcon style={{ width: 16, height: 16, color: "var(--t4)" }} />
          }
        </div>
        <input
          ref={inputRef}
          type="text"
          placeholder='"What did we decide about the Postgres migration?"'
          value={query}
          onChange={e => setQuery(e.target.value)}
          onFocus={e => { e.target.style.borderColor = "rgba(232,103,43,0.40)"; e.target.style.background = "rgba(232,103,43,0.04)"; }}
          onBlur={e => { e.target.style.borderColor = "var(--border-strong)"; e.target.style.background = "var(--bg-card)"; }}
          style={{ width: "100%", background: "var(--bg-card)", border: "1px solid var(--border-strong)", borderRadius: 5, paddingLeft: 42, paddingRight: 110, paddingTop: 14, paddingBottom: 14, fontSize: 13, color: "var(--t1)", outline: "none", transition: "border-color 150ms, background 150ms", boxSizing: "border-box" }}
        />
        <div style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", display: "flex", alignItems: "center", gap: 6 }}>
          {query && (
            <button type="button" onClick={clearSearch} style={{ background: "transparent", border: "none", color: "var(--t4)", cursor: "pointer", padding: 4, borderRadius: 3, display: "flex", alignItems: "center" }}>
              <X style={{ width: 14, height: 14 }} />
            </button>
          )}
          <button type="submit" disabled={!query.trim() || isSearching}
            style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 14px", borderRadius: 4, fontSize: 11, fontWeight: 500, background: !query.trim() || isSearching ? "rgba(232,103,43,0.25)" : "var(--brand)", color: "#fff", border: "none", cursor: !query.trim() || isSearching ? "not-allowed" : "pointer", opacity: !query.trim() || isSearching ? 0.6 : 1 }}>
            <Zap style={{ width: 11, height: 11 }} /> Search
          </button>
        </div>
      </form>

      {/* Source filters */}
      {hasResults && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {FILTER_OPTIONS.map(f => (
            <button key={f} onClick={() => { setActiveFilter(f); handleSearch(); }}
              onMouseEnter={() => setHFilter(f)} onMouseLeave={() => setHFilter(null)}
              style={{ fontSize: 10, fontWeight: 500, padding: "4px 12px", borderRadius: 10, cursor: "pointer", transition: "all 80ms",
                background: activeFilter === f ? "rgba(232,103,43,0.10)" : "transparent",
                border: activeFilter === f ? "1px solid rgba(232,103,43,0.30)" : `1px solid ${hFilter === f ? "rgba(31,27,22,0.15)" : "var(--border)"}`,
                color: activeFilter === f ? "var(--brand-text)" : hFilter === f ? "var(--t2)" : "var(--t5)",
              }}>
              {f}
            </button>
          ))}
        </div>
      )}

      {/* Initial state — suggestions */}
      {!hasResults && !isSearching && (
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          {recentSearches.length > 0 && (
            <div>
              <p style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 8, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.10em", color: "var(--t5)", marginBottom: 10 }}>
                <Clock style={{ width: 10, height: 10 }} /> Recent searches
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                {recentSearches.map((s, i) => (
                  <button key={i} onClick={() => handleSuggest(s)}
                    onMouseEnter={() => setHRecent(i)} onMouseLeave={() => setHRecent(null)}
                    style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "9px 12px", borderRadius: 4, textAlign: "left", cursor: "pointer", background: hRecent === i ? "var(--bg-card)" : "transparent", border: `1px solid ${hRecent === i ? "var(--border-strong)" : "transparent"}`, transition: "all 80ms" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <Clock style={{ width: 12, height: 12, color: "var(--t5)", flexShrink: 0 }} />
                      <span style={{ fontSize: 12, color: hRecent === i ? "var(--t1)" : "var(--t3)" }}>{s}</span>
                    </div>
                    <ArrowRight style={{ width: 11, height: 11, color: "var(--t5)", opacity: hRecent === i ? 1 : 0, transition: "opacity 80ms" }} />
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <p style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 8, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.10em", color: "var(--t5)", marginBottom: 10 }}>
              <Brain style={{ width: 10, height: 10 }} /> Try asking
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {SUGGESTED_QUERIES.map((q, i) => (
                <button key={i} onClick={() => handleSuggest(q)}
                  onMouseEnter={() => setHSuggest(i)} onMouseLeave={() => setHSuggest(null)}
                  style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "12px 14px", borderRadius: 4, textAlign: "left", cursor: "pointer", background: hSuggest === i ? "rgba(232,103,43,0.06)" : "var(--bg-card)", border: `1px solid ${hSuggest === i ? "rgba(232,103,43,0.25)" : "var(--border-strong)"}`, transition: "all 80ms" }}>
                  <span style={{ fontSize: 11, color: hSuggest === i ? "var(--t1)" : "var(--t3)", lineHeight: 1.5 }}>{q}</span>
                  <ArrowRight style={{ width: 11, height: 11, color: hSuggest === i ? "var(--brand)" : "var(--t5)", flexShrink: 0, opacity: hSuggest === i ? 1 : 0, transition: "all 80ms" }} />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Loading */}
      {isSearching && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, color: "var(--t4)" }}>
            <div style={{ width: 12, height: 12, borderRadius: "50%", border: "2px solid rgba(232,103,43,0.20)", borderTopColor: "var(--brand)", animation: "spin 0.8s linear infinite", flexShrink: 0 }} />
            Searching across Slack, Gmail, GitHub, Jira, Vault…
          </div>
          {[100, 80, 80, 80].map((h, i) => (
            <div key={i} style={{ height: h, borderRadius: 4, background: "var(--bg-card)", border: "1px solid var(--border)", position: "relative", overflow: "hidden" }}>
              <div style={{ position: "absolute", inset: 0, background: "linear-gradient(90deg, transparent 0%, rgba(31,27,22,0.05) 50%, transparent 100%)", animation: "shimmer-sweep 1.6s ease-in-out infinite" }} />
            </div>
          ))}
        </div>
      )}

      {/* Error */}
      {error && !isSearching && (
        <div style={{ background: "rgba(255,87,87,0.05)", border: "1px solid rgba(255,87,87,0.22)", borderRadius: 4, padding: "16px", textAlign: "center" }}>
          <p style={{ fontSize: 12, color: "var(--p-critical-text)", fontWeight: 500 }}>{error}</p>
          <p style={{ fontSize: 10, color: "var(--t5)", marginTop: 4 }}>Make sure the backend is running and try again.</p>
        </div>
      )}

      {/* Results */}
      {hasResults && !isSearching && (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <SynthesisBrief brief={synthesis} />

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <p style={{ fontSize: 11, color: "var(--t5)" }}>
              {results.length} {results.length === 1 ? "result" : "results"} from your workspace
            </p>
            <button onClick={clearSearch} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: "var(--t5)", background: "transparent", border: "none", cursor: "pointer" }}>
              <X style={{ width: 11, height: 11 }} /> Clear
            </button>
          </div>

          {results.length === 0 ? (
            <div style={{ background: "var(--bg-card)", border: "1px solid var(--border-strong)", borderRadius: 4, padding: "40px 24px", textAlign: "center" }}>
              <SearchIcon style={{ width: 28, height: 28, color: "var(--t5)", margin: "0 auto 12px", opacity: 0.4 }} />
              <p style={{ fontSize: 12, fontWeight: 500, color: "var(--t3)", marginBottom: 4 }}>No results found</p>
              <p style={{ fontSize: 11, color: "var(--t5)" }}>Try a different search or ingest more data first.</p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {results.map((result, i) => <ResultCard key={result.id || i} result={result} index={i} />)}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default UniversalSearch;
