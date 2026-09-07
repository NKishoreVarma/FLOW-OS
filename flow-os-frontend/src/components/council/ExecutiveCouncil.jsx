import { useState, useEffect, useCallback } from "react";
import { Landmark, RefreshCw, Send, Users, AlertTriangle, TrendingUp, ArrowRight, Scale, Loader2, Gauge } from "lucide-react";
import DataSourceBadge from "../ui/DataSourceBadge";
import { EmptyState } from "../ui/EmptyState";
import councilApi from "../../lib/councilApi";
import { useWebSocket } from "../../hooks/useWebSocket";

/**
 * ExecutiveCouncil (/council) — the executive leadership team view. Six domain health
 * cards + "Ask the Council": routes a question to the relevant executives, runs them in
 * parallel, and shows the synthesized answer, each executive's finding, and the debate.
 */
const AGENT_META = {
  engineering: "Engineering", operations: "Operations", sales: "Sales",
  hr: "HR", security: "Security", finance: "Finance",
};
const STATUS = {
  healthy: { color: "var(--p-normal-text)", bg: "rgba(76,175,130,0.10)", border: "rgba(76,175,130,0.25)", label: "Healthy" },
  watch:   { color: "var(--p-high-text)",   bg: "rgba(255,151,65,0.10)", border: "rgba(255,151,65,0.25)", label: "Watch" },
  at_risk: { color: "var(--p-critical-text)",bg: "rgba(255,87,87,0.10)",  border: "rgba(255,87,87,0.25)",  label: "At risk" },
  unknown: { color: "var(--t4)",             bg: "rgba(31,27,22,0.045)",border: "var(--border)",         label: "Unknown" },
};

const DEMO_CARDS = [
  { agent: "engineering", title: "Engineering COO", status: "watch", score: 62, topRisks: ["PR #128 blocked by merge conflict in auth.js", "Deploy readiness at 40%"], topOpportunities: ["Ship SSO once conflict resolved"], recommendedActions: [{ title: "Coordinate Rahul + Kishore before merge" }] },
  { agent: "operations", title: "Operations COO", status: "healthy", score: 78, topRisks: ["Meeting load rising for 2 teams"], topOpportunities: ["Automate weekly status rollup"], recommendedActions: [{ title: "Trim recurring syncs" }] },
  { agent: "sales", title: "Sales COO", status: "at_risk", score: 48, topRisks: ["Acme renewal at risk (churn signals)"], topOpportunities: ["Upsell TechCorp — expansion signals"], recommendedActions: [{ title: "Schedule Acme exec check-in" }] },
  { agent: "hr", title: "HR COO", status: "watch", score: 60, topRisks: ["David O. is bus-factor on payments DB"], topOpportunities: ["Cross-train a second owner"], recommendedActions: [{ title: "Assign backup owner for payments" }] },
  { agent: "security", title: "Security COO", status: "at_risk", score: 52, topRisks: ["Auth bypass risk in open PR", "2 approvals pending review"], topOpportunities: ["Enable required checks on main"], recommendedActions: [{ title: "Hold release until patched" }] },
  { agent: "finance", title: "Finance COO", status: "healthy", score: 74, topRisks: ["Cloud spend trending up 8%"], topOpportunities: ["Reserved-instance savings"], recommendedActions: [{ title: "Review infra commitments" }] },
];

export default function ExecutiveCouncil() {
  const { isAuthLoading } = useWebSocket();
  const [dash, setDash] = useState({ loading: true, cards: [], demo: false });
  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);
  const [result, setResult] = useState(null);

  const loadDash = useCallback(async () => {
    setDash((d) => ({ ...d, loading: true }));
    try {
      const data = await councilApi.dashboard();
      const cards = (data.cards || []).filter((c) => c.status);
      setDash({ loading: false, cards: cards.length ? cards : DEMO_CARDS, demo: !cards.length, overall: data.overall });
    } catch {
      setDash({ loading: false, cards: DEMO_CARDS, demo: true });
    }
  }, []);

  useEffect(() => { if (!isAuthLoading) loadDash(); }, [isAuthLoading, loadDash]);

  const ask = async () => {
    const q = question.trim();
    if (!q || asking) return;
    setAsking(true);
    setResult({ streaming: true, routedAgents: [], findings: [], working: {}, answer: "", debate: null, confidence: null });
    const upd = (fn) => setResult((r) => ({ ...(r || {}), ...fn(r || {}) }));
    const token = localStorage.getItem("flow_os_token") || "";
    const wsId = localStorage.getItem("flow_os_workspace_id") || "";

    try {
      const res = await fetch("/api/council/ask/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, "workspace-id": wsId },
        body: JSON.stringify({ question: q }),
      });
      if (!res.ok || !res.body) throw new Error("stream unavailable");
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const parts = buf.split("\n\n"); buf = parts.pop() || "";
        for (const p of parts) {
          const line = p.trim(); if (!line.startsWith("data:")) continue;
          let e; try { e = JSON.parse(line.slice(5).trim()); } catch { continue; }
          if (e.type === "routed") upd(() => ({ routedAgents: e.agents, working: Object.fromEntries(e.agents.map((a) => [a.id, "pending"])) }));
          else if (e.type === "agent_start") upd((r) => ({ working: { ...r.working, [e.agent]: "working" } }));
          else if (e.type === "agent_done") upd((r) => ({ findings: [...(r.findings || []), e.finding], working: { ...r.working, [e.agent]: "done" } }));
          else if (e.type === "agent_failed") upd((r) => ({ working: { ...r.working, [e.agent]: "failed" } }));
          else if (e.type === "debate") upd(() => ({ debate: e.debate }));
          else if (e.type === "token") upd((r) => ({ answer: (r.answer || "") + e.delta }));
          else if (e.type === "done") upd((r) => ({ streaming: false, answer: e.answer || r.answer, confidence: e.confidence, routedAgents: e.routedAgents || r.routedAgents, findings: e.findings || r.findings, debate: e.debate || r.debate }));
          else if (e.type === "error") upd(() => ({ streaming: false, error: e.error }));
        }
      }
      upd(() => ({ streaming: false }));
    } catch {
      // Fallback to the non-streaming council so the answer still arrives.
      try { setResult({ ...(await councilApi.ask(q)), streaming: false }); }
      catch (err2) { setResult({ error: err2.message }); }
    } finally { setAsking(false); }
  };

  return (
    <div style={{ padding: "24px", maxWidth: 1080, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
            <Landmark style={{ width: 16, height: 16, color: "var(--brand)" }} />
            <h1 style={{ fontSize: 16, fontWeight: 500, color: "var(--t1)", letterSpacing: "-0.3px" }}>Executive Council</h1>
            <DataSourceBadge mode={dash.demo ? "demo" : "live"} />
          </div>
          <p style={{ fontSize: 12, color: "var(--t4)" }}>Six specialized AI executives assess the company and debate the big calls.</p>
        </div>
        <button onClick={loadDash} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", fontSize: 12, color: "var(--t3)", background: "rgba(31,27,22,0.045)", border: "1px solid var(--border)", borderRadius: 4, cursor: "pointer" }}>
          <RefreshCw style={{ width: 11, height: 11 }} /> Refresh
        </button>
      </div>

      {/* Ask the Council */}
      <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && ask()}
          placeholder="Ask the council — e.g. 'Is the payments launch safe to ship this week?'"
          style={{ flex: 1, background: "var(--bg-card)", border: "1px solid var(--border-strong)", borderRadius: 6, padding: "10px 14px", fontSize: 13, color: "var(--t1)", outline: "none" }}
        />
        <button onClick={ask} disabled={asking || !question.trim()}
          style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "0 18px", borderRadius: 6, fontSize: 13, fontWeight: 500, cursor: asking ? "wait" : "pointer", background: "var(--brand)", border: "none", color: "#fff", opacity: asking || !question.trim() ? 0.6 : 1 }}>
          {asking ? <Loader2 style={{ width: 13, height: 13, animation: "spin 1s linear infinite" }} /> : <Send style={{ width: 13, height: 13 }} />}
          {asking ? "Convening…" : "Ask"}
        </button>
      </div>

      {asking && <p style={{ fontSize: 12, color: "var(--t5)", marginBottom: 20, fontStyle: "italic" }}>Convening the council — each executive runs a full analysis, this can take a moment…</p>}
      {result && <CouncilAnswer result={result} />}

      {/* Health cards */}
      <div style={{ fontSize: 10, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--t5)", margin: "8px 0 12px" }}>Executive health</div>
      {dash.loading ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 14 }}>
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} style={{ height: 160, borderRadius: 6, background: "rgba(31,27,22,0.04)", border: "1px solid var(--border)", position: "relative", overflow: "hidden" }}>
              <div style={{ position: "absolute", inset: 0, background: "linear-gradient(90deg, transparent, rgba(31,27,22,0.05) 50%, transparent)", animation: "shimmer-sweep 1.6s ease-in-out infinite" }} />
            </div>
          ))}
        </div>
      ) : dash.cards.length === 0 ? (
        <EmptyState variant="activity" message="No council data yet" />
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 14 }}>
          {dash.cards.map((c) => <HealthCard key={c.agent} card={c} />)}
        </div>
      )}
    </div>
  );
}

function HealthCard({ card }) {
  const s = STATUS[card.status] || STATUS.unknown;
  return (
    <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderLeft: `2px solid ${s.color}`, borderRadius: 6, padding: "16px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <span style={{ fontSize: 13, fontWeight: 500, color: "var(--t1)" }}>{card.title || AGENT_META[card.agent]}</span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 9, fontWeight: 500, textTransform: "uppercase", padding: "2px 8px", borderRadius: 3, color: s.color, background: s.bg, border: `1px solid ${s.border}` }}>
          {card.score != null && <><Gauge style={{ width: 9, height: 9 }} />{card.score}</>} {s.label}
        </span>
      </div>
      <CardSection icon={AlertTriangle} color="var(--p-high)" label="Top risks" items={card.topRisks} />
      <CardSection icon={TrendingUp} color="var(--p-normal)" label="Opportunities" items={card.topOpportunities} />
      {card.recommendedActions?.length > 0 && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--border)" }}>
          {card.recommendedActions.slice(0, 2).map((a, i) => (
            <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 6, fontSize: 12, color: "var(--brand-text)", marginBottom: 4 }}>
              <ArrowRight style={{ width: 11, height: 11, marginTop: 2, flexShrink: 0 }} />
              {typeof a === "string" ? a : a.title || a.action}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CardSection({ icon: Icon, color, label, items }) {
  if (!items?.length) return null;
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 5 }}>
        <Icon style={{ width: 10, height: 10, color }} />
        <span style={{ fontSize: 9, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--t5)" }}>{label}</span>
      </div>
      {items.slice(0, 2).map((it, i) => (
        <p key={i} style={{ fontSize: 12, color: "var(--t3)", lineHeight: 1.45, margin: "0 0 3px", paddingLeft: 15 }}>• {typeof it === "string" ? it : it.title || JSON.stringify(it)}</p>
      ))}
    </div>
  );
}

function CouncilAnswer({ result }) {
  if (result.error) {
    return <div style={{ marginBottom: 24, padding: "14px", border: "1px solid rgba(255,87,87,0.25)", borderRadius: 6, background: "rgba(255,87,87,0.05)", fontSize: 13, color: "var(--p-critical-text)" }}>The council could not answer: {result.error}</div>;
  }
  const findings = result.findings || [];
  const debate = result.debate;
  return (
    <div style={{ marginBottom: 24, border: "1px solid var(--brand-line)", borderRadius: 8, background: "rgba(232,103,43,0.04)", overflow: "hidden" }}>
      <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--brand-line)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <Landmark style={{ width: 13, height: 13, color: "var(--brand)" }} />
          <span style={{ fontSize: 11, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--brand-text)" }}>Council synthesis</span>
          {result.confidence != null && <span style={{ fontSize: 11, color: "var(--t4)" }}>· {result.confidence}% confidence</span>}
          {result.routedAgents?.length > 0 && <span style={{ fontSize: 11, color: "var(--t5)" }}>· {findings.length}/{result.routedAgents.length} responded</span>}
        </div>

        {/* Which executives are working — light up as each lands (perceived speed) */}
        {result.routedAgents?.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: result.answer ? 10 : 4 }}>
            {result.routedAgents.map((a) => {
              const id = a.id || a; const title = (a.title || a).toString().replace(/ COO$/, "");
              const st = result.working?.[id] || (findings.some((f) => f.agent === id) ? "done" : (result.streaming ? "pending" : "done"));
              const color = st === "done" ? "var(--p-normal-text)" : st === "working" ? "var(--p-high-text)" : "var(--t5)";
              const dot = st === "done" ? "var(--p-normal)" : st === "working" ? "var(--p-high)" : "var(--t5)";
              return (
                <span key={id} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, padding: "3px 9px", borderRadius: 10, border: "1px solid var(--border)", background: "rgba(31,27,22,0.04)", color, opacity: st === "failed" ? 0.5 : 1 }}>
                  <span style={{ width: 5, height: 5, borderRadius: "50%", background: dot, ...(st === "working" ? { animation: "pulse-dot 1s ease-in-out infinite" } : {}) }} />
                  {title}
                </span>
              );
            })}
          </div>
        )}

        {result.answer
          ? <div style={{ fontSize: 13, color: "var(--t1)", lineHeight: 1.65, whiteSpace: "pre-wrap" }}>{result.answer}{result.streaming && <span style={{ display: "inline-block", width: 2, height: "1em", background: "var(--brand)", marginLeft: 2, verticalAlign: "text-bottom", animation: "pulse-dot 1s ease-in-out infinite" }} />}</div>
          : result.streaming && <div style={{ fontSize: 12, color: "var(--t5)", fontStyle: "italic" }}>Consulting the executives…</div>}
      </div>

      {debate?.hasDisagreement && (
        <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", background: "rgba(255,151,65,0.04)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
            <Scale style={{ width: 12, height: 12, color: "var(--p-high)" }} />
            <span style={{ fontSize: 10, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--p-high-text)" }}>Executive debate</span>
          </div>
          {debate.conflicts.map((c, i) => (
            <div key={i} style={{ fontSize: 12, color: "var(--t3)", lineHeight: 1.5, marginBottom: 6 }}><strong style={{ color: "var(--t2)" }}>{c.topic}:</strong> {c.tradeoffs}</div>
          ))}
          {debate.recommendation && <div style={{ fontSize: 12, color: "var(--t1)", fontWeight: 500, marginTop: 4 }}>→ {debate.recommendation}</div>}
          {debate.minorityOpinions?.length > 0 && (
            <div style={{ fontSize: 11, color: "var(--t5)", fontStyle: "italic", marginTop: 6 }}>Minority preserved: {debate.minorityOpinions.map((m) => m.title).join(", ")}</div>
          )}
        </div>
      )}

      {findings.length > 0 && (
        <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
          {findings.map((f) => (
            <div key={f.agent} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
              <Users style={{ width: 12, height: 12, color: "var(--t4)", marginTop: 3, flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
                  <span style={{ fontSize: 12, fontWeight: 500, color: "var(--t2)" }}>{f.title}</span>
                  {f.confidence != null && <span style={{ fontSize: 10, color: "var(--t5)" }}>{f.confidence}%</span>}
                </div>
                <p style={{ fontSize: 12, color: "var(--t3)", lineHeight: 1.5, margin: 0 }}>{f.summary}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
