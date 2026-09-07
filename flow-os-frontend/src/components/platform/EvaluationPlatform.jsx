import { useState, useEffect } from "react";
import {
  BarChart3, RefreshCw, Cpu, Brain, Network, CheckCircle2,
  DollarSign, Clock, ListCollapse, ShieldCheck
} from "lucide-react";
import { useWebSocket } from "../../hooks/useWebSocket";

const EvaluationPlatform = () => {
  const { token, workspaceId, isAuthLoading } = useWebSocket();
  const [metrics, setMetrics]               = useState(null);
  const [loading, setLoading]               = useState(true);
  const [recommendations, setRecommendations] = useState([]);
  const [selectedRecId, setSelectedRecId]   = useState("");
  const [explainability, setExplainability] = useState(null);
  const [explainabilityLoading, setExplainabilityLoading] = useState(false);
  const [hRec, setHRec]                     = useState(null);
  const [hFb, setHFb]                       = useState(null);

  const authHeaders = token ? { Authorization: `Bearer ${token}`, "workspace-id": workspaceId } : {};

  const fetchMetrics = async () => {
    if (!token || !workspaceId) return;
    try {
      const res = await fetch("/api/evaluation/metrics", { headers: authHeaders });
      if (res.ok) { setMetrics(await res.json()); }
    } catch {}
  };

  const fetchRecommendations = async () => {
    if (!token || !workspaceId) { setLoading(false); return; }
    try {
      const res = await fetch("/api/intelligence/explainable-recommendations", { headers: authHeaders });
      if (res.ok) {
        const body = await res.json();
        setRecommendations(body || []);
        if (body.length > 0 && !selectedRecId) setSelectedRecId(body[0].id);
      }
    } catch {}
    finally { setLoading(false); }
  };

  const fetchExplainability = async (recId) => {
    if (!token || !recId) return;
    setExplainabilityLoading(true);
    try {
      const res = await fetch(`/api/evaluation/explainability/${recId}`, { headers: authHeaders });
      if (res.ok) { setExplainability(await res.json()); }
    } catch {}
    finally { setExplainabilityLoading(false); }
  };

  const handleFeedback = async (recId, outcome) => {
    if (!token) return;
    try {
      const res = await fetch(`/api/evaluation/feedback/${recId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({ feedback: outcome })
      });
      if (res.ok) {
        await fetchMetrics();
        await fetchRecommendations();
        if (recId === selectedRecId) { await fetchExplainability(recId); }
      }
    } catch {}
  };

  useEffect(() => {
    if (!isAuthLoading) { setTimeout(() => { fetchMetrics(); fetchRecommendations(); }, 0); }
  }, [isAuthLoading, token, workspaceId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (selectedRecId) { setTimeout(() => fetchExplainability(selectedRecId), 0); }
  }, [selectedRecId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) {
    return (
      <div style={{ padding: "32px 24px" }}>
        {[64, 400].map((h, i) => (
          <div key={i} style={{ height: h, borderRadius: 4, background: "var(--bg-card)", border: "1px solid var(--border)", marginBottom: 16, position: "relative", overflow: "hidden" }}>
            <div style={{ position: "absolute", inset: 0, background: "linear-gradient(90deg, transparent 0%, rgba(31,27,22,0.05) 50%, transparent 100%)", animation: "shimmer-sweep 1.6s ease-in-out infinite" }} />
          </div>
        ))}
      </div>
    );
  }

  const statLabel = (text) => (
    <span style={{ display: "block", fontSize: 9, fontWeight: 500, color: "var(--t5)", textTransform: "uppercase", letterSpacing: "0.10em", marginBottom: 6 }}>{text}</span>
  );

  const statusStyle = (status) => {
    if (status === "ACCEPTED") return { color: "var(--p-normal-text)", bg: "rgba(76,175,130,0.10)"  };
    if (status === "REJECTED") return { color: "var(--p-critical-text)", bg: "rgba(255,87,87,0.10)"  };
    return                           { color: "var(--t5)",               bg: "rgba(31,27,22,0.05)" };
  };

  return (
    <div style={{ padding: "24px", display: "flex", flexDirection: "column", gap: 24 }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 500, color: "var(--t1)", letterSpacing: "-0.4px", display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
            <BarChart3 style={{ width: 22, height: 22, color: "var(--brand)" }} />
            AI Evaluation & Explainability
          </h1>
          <p style={{ fontSize: 12, color: "var(--t4)", maxWidth: 520 }}>
            Audit evidence graphs, query reasoning lineages, authority weights, and user-action learning loops.
          </p>
        </div>
        <button
          onClick={() => { fetchMetrics(); fetchRecommendations(); }}
          style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--t3)", background: "rgba(31,27,22,0.05)", border: "1px solid var(--border)", borderRadius: 4, padding: "6px 12px", cursor: "pointer", flexShrink: 0 }}
        >
          <RefreshCw style={{ width: 12, height: 12 }} /> Refresh Analytics
        </button>
      </div>

      {/* Metrics cards */}
      {metrics && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
          {[
            { icon: CheckCircle2, iconColor: "var(--p-normal)", label: "Acceptance Rate",     value: `${metrics.recommendations.rates.acceptanceRate}%` },
            { icon: Clock,        iconColor: "var(--brand)",    label: "Productivity Saved",   value: `${metrics.recommendations.productivity.timeSavedHours} hrs` },
            { icon: DollarSign,   iconColor: "var(--brand)",    label: "Estimated Cost Saved", value: `$${metrics.recommendations.productivity.estimatedSavingsUSD}` },
            { icon: Cpu,          iconColor: "var(--brand)",    label: "Reasoning Latency",    value: `${metrics.copilot.averageLatencyMs} ms`, spin: true },
          ].map(({ icon: Icon, iconColor, label, value, spin }) => (
            <div key={label} style={{ background: "var(--bg-card)", border: "1px solid var(--border-strong)", borderRadius: 4, padding: "18px" }}>
              {statLabel(label)}
              <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 18, fontWeight: 500, color: "var(--t1)" }}>
                <Icon style={{ width: 18, height: 18, color: iconColor, animation: spin ? "spin 1.2s linear infinite" : "none" }} />
                {value}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Main grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 14 }}>

        {/* Recommendation list */}
        <div style={{ background: "var(--bg-card)", border: "1px solid var(--border-strong)", borderRadius: 4, padding: "20px" }}>
          <h2 style={{ fontSize: 9, fontWeight: 500, color: "var(--t1)", textTransform: "uppercase", letterSpacing: "0.10em", borderBottom: "1px solid var(--border)", paddingBottom: 10, marginBottom: 14 }}>Briefing Recommendations</h2>
          {recommendations.length === 0 ? (
            <p style={{ fontSize: 12, color: "var(--t5)", textAlign: "center", padding: "40px 0" }}>No recent recommendations generated.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 480, overflowY: "auto" }}>
              {recommendations.map(rec => {
                const isActive = selectedRecId === rec.id;
                const ss = statusStyle(rec.status);
                return (
                  <div
                    key={rec.id}
                    onClick={() => setSelectedRecId(rec.id)}
                    onMouseEnter={() => setHRec(rec.id)}
                    onMouseLeave={() => setHRec(null)}
                    style={{ padding: "10px 12px", borderRadius: 4, border: `1px solid ${isActive ? "rgba(232,103,43,0.40)" : "var(--border)"}`, background: isActive ? "rgba(232,103,43,0.08)" : hRec === rec.id ? "var(--bg-hover)" : "rgba(31,27,22,0.04)", cursor: "pointer", transition: "all 80ms" }}
                  >
                    <span style={{ display: "block", fontSize: 12, fontWeight: 500, color: isActive ? "var(--brand-text)" : "var(--t1)", marginBottom: 4 }}>{rec.title}</span>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: 9, fontWeight: 500, color: "var(--t5)" }}>Conf: {rec.confidence}%</span>
                      <span style={{ fontSize: 9, fontWeight: 500, color: ss.color, background: ss.bg, padding: "1px 6px", borderRadius: 3 }}>{rec.status}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Explainability trace */}
        <div style={{ background: "var(--bg-card)", border: "1px solid var(--border-strong)", borderRadius: 4, padding: "20px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid var(--border)", paddingBottom: 10, marginBottom: 18 }}>
            <h2 style={{ fontSize: 9, fontWeight: 500, color: "var(--t1)", textTransform: "uppercase", letterSpacing: "0.10em" }}>Explainability Trace</h2>
            {explainability && (
              <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 9, fontWeight: 500, color: "var(--brand-text)", background: "rgba(232,103,43,0.08)", border: "1px solid rgba(232,103,43,0.22)", padding: "3px 8px", borderRadius: 10 }}>
                <Brain style={{ width: 11, height: 11 }} /> Confidence: {explainability.confidence}%
              </span>
            )}
          </div>

          {explainabilityLoading ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: "32px 0" }}>
              {[32, 96, 128].map((h, i) => (
                <div key={i} style={{ height: h, borderRadius: 4, background: "rgba(31,27,22,0.045)", position: "relative", overflow: "hidden" }}>
                  <div style={{ position: "absolute", inset: 0, background: "linear-gradient(90deg, transparent 0%, rgba(31,27,22,0.05) 50%, transparent 100%)", animation: "shimmer-sweep 1.6s ease-in-out infinite" }} />
                </div>
              ))}
            </div>
          ) : explainability ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

              {/* Evidence nodes */}
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
                  <Network style={{ width: 12, height: 12, color: "var(--brand)" }} />
                  <span style={{ fontSize: 9, fontWeight: 500, color: "var(--t5)", textTransform: "uppercase", letterSpacing: "0.10em" }}>Evidence Graph References</span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  {explainability.graph.nodes.filter(n => n.type !== "RECOMMENDATION").map(node => (
                    <div key={node.id} style={{ background: "rgba(31,27,22,0.04)", border: "1px solid var(--border)", borderRadius: 4, padding: "10px 12px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div>
                        <span style={{ display: "block", fontSize: 12, fontWeight: 500, color: "var(--t1)" }}>{node.label}</span>
                        <span style={{ fontSize: 9, fontWeight: 500, color: "var(--t5)", textTransform: "uppercase" }}>{node.type}</span>
                      </div>
                      <span style={{ fontSize: 9, fontWeight: 500, color: "var(--brand-text)", background: "rgba(232,103,43,0.08)", border: "1px solid rgba(232,103,43,0.22)", padding: "2px 6px", borderRadius: 3 }}>Auth: {node.authority || 1.0}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Reasoning chain */}
              <div style={{ borderTop: "1px solid var(--border)", paddingTop: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 12 }}>
                  <ListCollapse style={{ width: 12, height: 12, color: "var(--brand)" }} />
                  <span style={{ fontSize: 9, fontWeight: 500, color: "var(--t5)", textTransform: "uppercase", letterSpacing: "0.10em" }}>Reasoning Chain Lineage</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {explainability.reasoningChain.map(step => (
                    <div key={step.step} style={{ display: "flex", gap: 12 }}>
                      <div style={{ width: 22, height: 22, borderRadius: "50%", background: "rgba(232,103,43,0.10)", border: "1px solid rgba(232,103,43,0.28)", color: "var(--brand-text)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 500, flexShrink: 0 }}>{step.step}</div>
                      <div>
                        <span style={{ display: "block", fontSize: 12, fontWeight: 500, color: "var(--t1)", marginBottom: 2 }}>{step.title}</span>
                        <span style={{ fontSize: 11, color: "var(--t4)", lineHeight: 1.5 }}>{step.desc}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Feedback buttons */}
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, borderTop: "1px solid var(--border)", paddingTop: 14 }}>
                <button
                  onClick={() => handleFeedback(explainability.recommendationId, "reject")}
                  onMouseEnter={() => setHFb("reject")}
                  onMouseLeave={() => setHFb(null)}
                  style={{ padding: "6px 14px", borderRadius: 4, background: hFb === "reject" ? "rgba(255,87,87,0.10)" : "rgba(31,27,22,0.05)", border: "1px solid var(--border)", color: "var(--p-critical-text)", fontSize: 11, cursor: "pointer" }}
                >Reject Recommendation</button>
                <button
                  onClick={() => handleFeedback(explainability.recommendationId, "accept")}
                  onMouseEnter={() => setHFb("accept")}
                  onMouseLeave={() => setHFb(null)}
                  style={{ padding: "6px 14px", borderRadius: 4, background: hFb === "accept" ? "rgba(76,175,130,0.85)" : "var(--p-normal)", border: "none", color: "#fff", fontSize: 11, fontWeight: 500, cursor: "pointer" }}
                >Accept & Execute</button>
              </div>
            </div>
          ) : (
            <p style={{ fontSize: 12, color: "var(--t5)", textAlign: "center", padding: "48px 0" }}>Select a recommendation to inspect reasoning.</p>
          )}
        </div>
      </div>

      {/* Learning loop weights */}
      {metrics?.recommendations?.rankingWeights && Object.keys(metrics.recommendations.rankingWeights).length > 0 && (
        <div style={{ background: "var(--bg-card)", border: "1px solid var(--border-strong)", borderRadius: 4, padding: "20px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, borderBottom: "1px solid var(--border)", paddingBottom: 10, marginBottom: 16 }}>
            <ShieldCheck style={{ width: 14, height: 14, color: "var(--brand)" }} />
            <h2 style={{ fontSize: 9, fontWeight: 500, color: "var(--t1)", textTransform: "uppercase", letterSpacing: "0.10em" }}>Learning Loop Adaptive Ranking Weights</h2>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
            {Object.entries(metrics.recommendations.rankingWeights).map(([tag, w]) => (
              <div key={tag} style={{ background: "rgba(31,27,22,0.04)", border: "1px solid var(--border)", borderRadius: 4, padding: "8px 12px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 12, fontWeight: 500, color: "var(--t2)" }}>{tag}</span>
                <span style={{ fontSize: 12, fontWeight: 500, color: "var(--brand-text)" }}>x{parseFloat(w).toFixed(2)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default EvaluationPlatform;
