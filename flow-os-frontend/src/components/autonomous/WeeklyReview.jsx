import { useState, useEffect } from "react";
import { TrendingUp, RefreshCw, AlertTriangle, Target, Zap, CheckCircle2 } from "lucide-react";

function authHeaders() {
  return {
    Authorization: `Bearer ${localStorage.getItem("flow_os_token") || ""}`,
    "workspace-id": localStorage.getItem("flow_os_workspace_id") || "workspace_corp_alpha",
  };
}
async function getJSON(p) {
  const r = await fetch(p, { headers: authHeaders() });
  if (!r.ok) throw new Error(String(r.status));
  return r.json();
}

const SECTION = { background: "var(--bg-secondary)", border: "1px solid var(--border)", borderRadius: 10, padding: "16px 18px", marginBottom: 14 };
const LABEL = { fontSize: 10, fontWeight: 700, letterSpacing: "0.09em", textTransform: "uppercase", color: "var(--t4)", marginBottom: 12, display: "flex", alignItems: "center", gap: 6 };

export default function WeeklyReview() {
  const [data, setData] = useState(null);
  const [demo, setDemo] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      setData(await getJSON("/api/autonomous/weekly-review?days=7"));
      setDemo(false);
    } catch {
      setData({
        window: { days: 7 },
        summary: { headline: [
          { key: "timeSaved", label: "Time Saved", value: 3.5, unit: "hours", basis: "estimated" },
          { key: "tasksCompleted", label: "Tasks Completed", value: 12, basis: "measured" },
          { key: "approvalsExecuted", label: "Approvals", value: 4, basis: "measured" },
        ]},
        engineeringVelocity: { prsMerged: 8, deploymentsCompleted: 3 },
        executionSuccessRate: { rate: 92, executed: 11, failed: 1, total: 12 },
        operationalRisks: [
          { prediction: "Sprint delay likely if PR backlog grows", probability: 72, trend: "rising" },
          { prediction: "Knowledge loss risk — David is sole owner of payments module", probability: 85, trend: "stable" },
        ],
        recommendedPriorities: [
          { title: "Review Auth PR — blocked 2 days", type: "conflict", reason: "Blocking 2 engineers" },
          { title: "Approve deployment to production", type: "approval", reason: "HIGH risk · 2 approvals required" },
        ],
      });
      setDemo(true);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const r = data;
  return (
    <div style={{ padding: "28px 24px 48px", maxWidth: 760, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <TrendingUp style={{ width: 18, height: 18, color: "var(--brand)" }} />
          <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "var(--t1)" }}>Weekly Review</h1>
          {demo && <span style={{ fontSize: 11, color: "var(--t4)", background: "var(--bg-secondary)", padding: "2px 8px", borderRadius: 10, border: "1px solid var(--border)" }}>Sample data</span>}
        </div>
        <button onClick={load} style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 12px", borderRadius: 7, border: "1px solid var(--border)", background: "transparent", color: "var(--t3)", fontSize: 12, cursor: "pointer" }}>
          <RefreshCw style={{ width: 12, height: 12 }} /> Refresh
        </button>
      </div>

      {loading ? <div style={{ color: "var(--t4)", fontSize: 13 }}>Loading…</div> : r && (
        <>
          {/* Headline metrics */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px,1fr))", gap: 10, marginBottom: 14 }}>
            {(r.summary?.headline || []).map((m) => (
              <div key={m.key} style={{ ...SECTION, marginBottom: 0, textAlign: "center" }}>
                <div style={{ fontSize: 26, fontWeight: 700, color: "var(--t1)" }}>{m.value}{m.unit ? ` ${m.unit}` : ""}</div>
                <div style={{ fontSize: 11, color: "var(--t4)", marginTop: 3 }}>{m.label}</div>
                <div style={{ fontSize: 10, color: "var(--t5)", marginTop: 2 }}>{m.basis}</div>
              </div>
            ))}
          </div>

          {/* Engineering velocity */}
          <div style={SECTION}>
            <div style={LABEL}><Zap style={{ width: 11, height: 11 }} /> Engineering Velocity</div>
            <div style={{ display: "flex", gap: 24 }}>
              <div><div style={{ fontSize: 22, fontWeight: 700, color: "var(--t1)" }}>{r.engineeringVelocity?.prsMerged ?? "—"}</div><div style={{ fontSize: 11, color: "var(--t4)" }}>PRs Merged</div></div>
              <div><div style={{ fontSize: 22, fontWeight: 700, color: "var(--t1)" }}>{r.engineeringVelocity?.deploymentsCompleted ?? "—"}</div><div style={{ fontSize: 11, color: "var(--t4)" }}>Deployments</div></div>
              {r.executionSuccessRate?.rate != null && (
                <div><div style={{ fontSize: 22, fontWeight: 700, color: "var(--p-normal-text)" }}>{r.executionSuccessRate.rate}%</div><div style={{ fontSize: 11, color: "var(--t4)" }}>Execution Success</div></div>
              )}
            </div>
          </div>

          {/* Operational risks */}
          {r.operationalRisks?.length > 0 && (
            <div style={SECTION}>
              <div style={LABEL}><AlertTriangle style={{ width: 11, height: 11 }} /> Operational Risks</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {r.operationalRisks.map((risk, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: risk.probability >= 75 ? "var(--p-critical-text)" : "var(--p-high-text)", flexShrink: 0 }}>{risk.probability}%</div>
                    <div>
                      <div style={{ fontSize: 13, color: "var(--t1)" }}>{risk.prediction}</div>
                      {risk.timeHorizon && <div style={{ fontSize: 11, color: "var(--t4)" }}>{risk.timeHorizon} · {risk.trend}</div>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recommended priorities */}
          {r.recommendedPriorities?.length > 0 && (
            <div style={SECTION}>
              <div style={LABEL}><Target style={{ width: 11, height: 11 }} /> Recommended Priorities</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {r.recommendedPriorities.map((p, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                    <CheckCircle2 style={{ width: 13, height: 13, color: "var(--brand)", flexShrink: 0, marginTop: 1 }} />
                    <div>
                      <div style={{ fontSize: 13, color: "var(--t1)", fontWeight: 500 }}>{p.title}</div>
                      {p.reason && <div style={{ fontSize: 11, color: "var(--t4)" }}>{p.reason}</div>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
