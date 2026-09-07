import { useState, useEffect } from "react";
import { Star, RefreshCw, Zap, AlertTriangle, TrendingUp, Lightbulb } from "lucide-react";
import ActionCard from "../inbox/ActionCard";
import InsightCard from "../intelligence/InsightCard";
import { fetchOperationalIntelligence, trackIntelligence } from "../../lib/operationalIntelligence";
import { useNavigate } from "react-router-dom";

function authHeaders() {
  return {
    Authorization: `Bearer ${localStorage.getItem("flow_os_token") || ""}`,
    "workspace-id": localStorage.getItem("flow_os_workspace_id") || "",
    "Content-Type": "application/json",
  };
}
async function getJSON(p) {
  const r = await fetch(p, { headers: authHeaders() });
  if (!r.ok) throw new Error(String(r.status));
  return r.json();
}

// No demo constant — ChiefOfStaff shows real data or an empty state.

// ─── Proactive Intelligence Banner ───────────────────────────────────────────
function ProactiveBanner({ intel, loading, onAction, onDismiss }) {
  const token = localStorage.getItem("flow_os_token") || "";
  const wsId  = localStorage.getItem("flow_os_workspace_id") || "";

  if (loading) {
    return (
      <div style={{ background: "rgba(232,103,43,0.04)", border: "1px solid rgba(232,103,43,0.15)", borderRadius: 8, padding: "14px 18px", marginBottom: 20, animation: "shimmer-sweep 1.6s ease-in-out infinite" }}>
        <div style={{ height: 10, width: 160, borderRadius: 3, background: "rgba(31,27,22,0.06)" }} />
      </div>
    );
  }

  if (!intel || intel.summary.totalInsights === 0) return null;

  const { summary } = intel;

  // Show max 3 top insights (critical risks first, then predictions, then opportunities)
  const topInsights = [
    ...intel.risks.filter(r => r.severity === "HIGH"),
    ...intel.risks.filter(r => r.severity === "MEDIUM"),
    ...intel.predictions.filter(p => p.confidence === "HIGH"),
    ...intel.opportunities,
    ...intel.trends.filter(t => t.direction === "DOWN"),
  ].slice(0, 3);

  return (
    <div style={{ marginBottom: 24 }}>
      {/* Banner header */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <div style={{ width: 6, height: 6, borderRadius: "50%", background: summary.criticalCount > 0 ? "var(--p-critical-text)" : "var(--p-high-text)", animation: summary.criticalCount > 0 ? "pulse-dot 1.5s ease-in-out infinite" : "none" }} />
        <span style={{ fontSize: 12, fontWeight: 500, color: "var(--t2)" }}>
          FLOW identified{" "}
          <strong style={{ color: summary.criticalCount > 0 ? "var(--p-critical-text)" : "var(--t1)" }}>
            {summary.totalInsights} thing{summary.totalInsights !== 1 ? "s" : ""}
          </strong>{" "}
          that need{summary.totalInsights === 1 ? "s" : ""} your attention
        </span>
        {summary.criticalCount > 0 && (
          <span style={{ fontSize: 9, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.07em", padding: "2px 7px", borderRadius: 99, background: "rgba(255,87,87,0.10)", color: "var(--p-critical-text)", border: "1px solid rgba(255,87,87,0.22)" }}>
            {summary.criticalCount} critical
          </span>
        )}
      </div>

      {/* Insight cards */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {topInsights.map(insight => (
          <InsightCard
            key={insight.id}
            insight={insight}
            compact={false}
            onDismiss={onDismiss}
            onAction={(ins) => {
              trackIntelligence("intelligence.insight.acted", { id: ins.id, type: ins.type, category: ins.category }, token, wsId);
              onAction(ins);
            }}
          />
        ))}
      </div>

      {/* Source attribution */}
      {intel.sources.length > 0 && (
        <div style={{ fontSize: 9, color: "var(--t5)", textTransform: "uppercase", letterSpacing: "0.07em", marginTop: 10 }}>
          Cross-connector analysis: {intel.sources.join(", ")}
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function ChiefOfStaff() {
  const navigate = useNavigate();
  const [data, setData]       = useState(null);
  const [demo, setDemo]       = useState(false);
  const [loading, setLoading] = useState(true);
  const [items, setItems]     = useState([]);

  const [intel, setIntel]             = useState(null);
  const [intelLoading, setIntelLoading] = useState(true);
  const [dismissed, setDismissed]     = useState(new Set());

  const token = localStorage.getItem("flow_os_token") || "";
  const wsId  = localStorage.getItem("flow_os_workspace_id") || "";

  const loadCoS = async () => {
    setLoading(true);
    try {
      const d = await getJSON("/api/autonomous/chief-of-staff");
      setData(d);
      setItems(d.topItems || []);
      setDemo(false);
    } catch {
      setData(null);
      setItems([]);
      setDemo(true);
    } finally { setLoading(false); }
  };

  const loadIntel = async () => {
    setIntelLoading(true);
    try {
      const intel = await fetchOperationalIntelligence(token, wsId);
      setIntel(intel);
      // Telemetry: count what was shown
      if (intel.summary.riskCount > 0)
        trackIntelligence("intelligence.risks.shown", { count: intel.summary.riskCount, critical: intel.summary.criticalCount }, token, wsId);
      if (intel.summary.predictionCount > 0)
        trackIntelligence("intelligence.predictions.shown", { count: intel.summary.predictionCount }, token, wsId);
    } catch { /* intel is additive — failure is non-fatal */ }
    finally { setIntelLoading(false); }
  };

  const load = () => { loadCoS(); loadIntel(); };

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function handleInsightAction(insight) {
    if (insight.actionRoute) navigate(insight.actionRoute);
    else window.dispatchEvent(new CustomEvent("flow:ask-brain", { detail: { question: insight.suggestedAction || insight.title } }));
  }

  function dismissInsight(insight) {
    setDismissed(prev => new Set([...prev, insight.id]));
    trackIntelligence("intelligence.insight.dismissed", { id: insight.id, type: insight.type }, token, wsId);
  }

  const filteredIntel = intel ? {
    ...intel,
    risks:         intel.risks.filter(r => !dismissed.has(r.id)),
    predictions:   intel.predictions.filter(p => !dismissed.has(p.id)),
    opportunities: intel.opportunities.filter(o => !dismissed.has(o.id)),
    trends:        intel.trends.filter(t => !dismissed.has(t.id)),
    summary: {
      ...intel.summary,
      totalInsights: [
        ...(intel.risks.filter(r => !dismissed.has(r.id))),
        ...(intel.predictions.filter(p => !dismissed.has(p.id))),
        ...(intel.opportunities.filter(o => !dismissed.has(o.id))),
        ...(intel.trends.filter(t => !dismissed.has(t.id))),
      ].length,
      criticalCount: intel.risks.filter(r => !dismissed.has(r.id) && r.severity === "HIGH").length,
    },
  } : null;

  return (
    <div style={{ padding: "28px 24px 48px", maxWidth: 720, margin: "0 auto", fontFamily: "var(--font-ui)" }}>
      {/* Page header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Star style={{ width: 18, height: 18, color: "var(--brand)" }} />
          <h1 style={{ margin: 0, fontSize: 18, fontWeight: 500, color: "var(--t1)" }}>Chief of Staff</h1>
          {demo && (
            <span style={{ fontSize: 11, color: "var(--t4)", background: "var(--bg-secondary)", padding: "2px 8px", borderRadius: 10, border: "1px solid var(--border)" }}>
              Sample data
            </span>
          )}
        </div>
        <button
          onClick={load}
          style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 12px", borderRadius: 7, border: "1px solid var(--border)", background: "transparent", color: "var(--t3)", fontSize: 12, cursor: "pointer" }}
        >
          <RefreshCw style={{ width: 12, height: 12 }} /> Refresh
        </button>
      </div>

      {/* ── Proactive Intelligence Banner (Task 9) ── */}
      <ProactiveBanner
        intel={filteredIntel}
        loading={intelLoading}
        onAction={handleInsightAction}
        onDismiss={dismissInsight}
      />

      {/* ── CoS Greeting + Action Items (existing, unchanged) ── */}
      {loading ? (
        <div style={{ color: "var(--t4)", fontSize: 13 }}>Loading actions…</div>
      ) : (
        <>
          {data?.greeting && (
            <div style={{ marginBottom: 6 }}>
              <p style={{ margin: 0, fontSize: 20, fontWeight: 500, color: "var(--t1)" }}>{data.greeting}</p>
              <p style={{ margin: "6px 0 20px", fontSize: 14, color: "var(--t3)" }}>{data.summary}</p>
            </div>
          )}

          {items.length === 0 ? (
            <div style={{ padding: 32, textAlign: "center", color: "var(--t4)", background: "var(--bg-secondary)", borderRadius: 10, border: "1px solid var(--border)" }}>
              <Zap style={{ width: 24, height: 24, marginBottom: 8, opacity: 0.4 }} />
              <p style={{ margin: 0, fontSize: 14 }}>Nothing urgent — FLOW is watching your connected tools.</p>
            </div>
          ) : (
            <div>
              {items.map(card => (
                <ActionCard
                  key={card.id}
                  card={card}
                  onExecute={() => setItems(prev => prev.filter(i => i.id !== card.id))}
                  onDismiss={() => setItems(prev => prev.filter(i => i.id !== card.id))}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* ── Trends (bonus: show if there are downward trends) ── */}
      {filteredIntel && filteredIntel.trends.filter(t => t.direction === "DOWN").length > 0 && !intelLoading && (
        <div style={{ marginTop: 28 }}>
          <div style={{ fontSize: 10, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--t5)", marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
            <TrendingUp style={{ width: 11, height: 11 }} /> Downward Trends to Watch
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {filteredIntel.trends.filter(t => t.direction === "DOWN").map(t => (
              <InsightCard key={t.id} insight={t} compact onAction={handleInsightAction} onDismiss={dismissInsight} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
