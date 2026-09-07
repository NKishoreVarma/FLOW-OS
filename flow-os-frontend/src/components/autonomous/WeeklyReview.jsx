import { useState, useEffect } from "react";
import { TrendingUp, TrendingDown, RefreshCw, AlertTriangle, Target, Zap, CheckCircle2, XCircle, Lightbulb, BarChart3, ArrowRight } from "lucide-react";
import InsightCard from "../intelligence/InsightCard";
import { fetchOperationalIntelligence, trackIntelligence } from "../../lib/operationalIntelligence";
import { useNavigate } from "react-router-dom";

function authHeaders() {
  return {
    Authorization: `Bearer ${localStorage.getItem("flow_os_token") || ""}`,
    "workspace-id": localStorage.getItem("flow_os_workspace_id") || "",
  };
}
async function getJSON(p) {
  const r = await fetch(p, { headers: authHeaders() });
  if (!r.ok) throw new Error(String(r.status));
  return r.json();
}

const SECTION = { background: "var(--bg-secondary)", border: "1px solid var(--border)", borderRadius: 10, padding: "16px 18px", marginBottom: 14 };
const LABEL = { fontSize: 10, fontWeight: 500, letterSpacing: "0.09em", textTransform: "uppercase", color: "var(--t4)", marginBottom: 12, display: "flex", alignItems: "center", gap: 6 };

// ─── Executive Report (Wins / Losses / Decisions) ─────────────────────────────
function ExecutiveReport({ weekly, intel }) {
  const navigate = useNavigate();
  const token = localStorage.getItem("flow_os_token") || "";
  const wsId  = localStorage.getItem("flow_os_workspace_id") || "";

  if (!weekly && !intel) return null;

  // Derive wins from the weekly data
  const execRate  = weekly?.executionSuccessRate?.rate;
  const prsMerged = weekly?.engineeringVelocity?.prsMerged ?? 0;
  const deploys   = weekly?.engineeringVelocity?.deploymentsCompleted ?? 0;
  const headline  = weekly?.summary?.headline || [];

  const wins = [
    prsMerged >= 3  && { text: `${prsMerged} PRs merged`,                 source: "GitHub"         },
    deploys >= 1    && { text: `${deploys} deployment${deploys > 1 ? "s" : ""} shipped`, source: "GitHub" },
    execRate >= 80  && { text: `${execRate}% execution success rate`,      source: "FLOW"           },
    headline.find(m => m.key === "tasksCompleted" && m.value > 0) && {
      text: `${headline.find(m => m.key === "tasksCompleted")?.value} tasks completed`,
      source: "FLOW",
    },
    ...(intel?.opportunities || []).map(o => ({ text: o.title, source: o.sources?.[0] || "FLOW" })),
  ].filter(Boolean).slice(0, 4);

  // Losses are the critical/high risks detected
  const losses = (intel?.risks || [])
    .filter(r => r.severity === "HIGH")
    .slice(0, 3)
    .map(r => ({ text: r.title, source: r.sources?.[0] || "FLOW" }));

  // Decisions = pending approvals resolved + notable actions from headline
  const timeSaved = headline.find(m => m.key === "timeSaved");
  const decisions = [
    timeSaved?.value > 0 && { text: `${timeSaved.value}h estimated time saved by FLOW automations`, type: "execution" },
    ...(weekly?.recommendedPriorities || []).slice(0, 2).map(p => ({ text: p.title, type: "priority" })),
  ].filter(Boolean).slice(0, 3);

  return (
    <>
      {/* Executive Summary */}
      <div style={SECTION}>
        <div style={LABEL}><BarChart3 style={{ width: 11, height: 11 }} /> Executive Summary</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
          {/* Wins */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 500, color: "var(--p-normal-text)", marginBottom: 8, display: "flex", alignItems: "center", gap: 5 }}>
              <CheckCircle2 style={{ width: 11, height: 11 }} /> Wins
            </div>
            {wins.length === 0 ? (
              <div style={{ fontSize: 11, color: "var(--t4)" }}>No data yet.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {wins.map((w, i) => (
                  <div key={i} style={{ fontSize: 11, color: "var(--t2)", display: "flex", gap: 5 }}>
                    <span style={{ color: "var(--p-normal-text)", flexShrink: 0 }}>·</span>
                    <span>{w.text}<span style={{ color: "var(--t5)", marginLeft: 4, fontSize: 9 }}>{w.source}</span></span>
                  </div>
                ))}
              </div>
            )}
          </div>
          {/* Losses / Risks */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 500, color: "var(--p-critical-text)", marginBottom: 8, display: "flex", alignItems: "center", gap: 5 }}>
              <XCircle style={{ width: 11, height: 11 }} /> Risks
            </div>
            {losses.length === 0 ? (
              <div style={{ fontSize: 11, color: "var(--t4)" }}>None detected.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {losses.map((l, i) => (
                  <div key={i} style={{ fontSize: 11, color: "var(--t2)", display: "flex", gap: 5 }}>
                    <span style={{ color: "var(--p-critical-text)", flexShrink: 0 }}>·</span>
                    <span>{l.text}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          {/* Decisions & Impact */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 500, color: "var(--t2)", marginBottom: 8, display: "flex", alignItems: "center", gap: 5 }}>
              <Target style={{ width: 11, height: 11 }} /> Decisions
            </div>
            {decisions.length === 0 ? (
              <div style={{ fontSize: 11, color: "var(--t4)" }}>No decisions logged.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {decisions.map((d, i) => (
                  <div key={i} style={{ fontSize: 11, color: "var(--t2)", display: "flex", gap: 5 }}>
                    <span style={{ color: "var(--brand)", flexShrink: 0 }}>·</span>
                    <span>{d.text}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Intelligence Insights */}
      {intel && (intel.risks.length > 0 || intel.trends.length > 0 || intel.predictions.length > 0) && (
        <div style={SECTION}>
          <div style={LABEL}><Lightbulb style={{ width: 11, height: 11 }} /> Operational Intelligence</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {/* Top risks */}
            {intel.risks.slice(0, 2).map(r => (
              <InsightCard
                key={r.id}
                insight={r}
                compact
                onAction={(ins) => {
                  trackIntelligence("intelligence.insight.acted", { id: ins.id, source: "weekly_review" }, token, wsId);
                  if (ins.actionRoute) navigate(ins.actionRoute);
                }}
              />
            ))}
            {/* Top prediction */}
            {intel.predictions.filter(p => p.confidence !== "LOW").slice(0, 1).map(p => (
              <InsightCard key={p.id} insight={p} compact />
            ))}
            {/* Positive trends */}
            {intel.trends.filter(t => t.direction === "UP").slice(0, 1).map(t => (
              <InsightCard key={t.id} insight={t} compact />
            ))}
          </div>
          {intel.sources?.length > 0 && (
            <div style={{ fontSize: 9, color: "var(--t5)", textTransform: "uppercase", letterSpacing: "0.07em", marginTop: 10 }}>
              Sources: {intel.sources.join(", ")}
            </div>
          )}
        </div>
      )}
    </>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function WeeklyReview() {
  const navigate = useNavigate();
  const [data, setData]   = useState(null);
  const [demo, setDemo]   = useState(false);
  const [loading, setLoading] = useState(true);
  const [intel, setIntel] = useState(null);

  const token = localStorage.getItem("flow_os_token") || "";
  const wsId  = localStorage.getItem("flow_os_workspace_id") || "";

  const load = async () => {
    setLoading(true);
    try {
      setData(await getJSON("/api/autonomous/weekly-review?days=7"));
      setDemo(false);
    } catch {
      setData({
        window: { days: 7 },
        summary: { headline: [
          { key: "timeSaved",       label: "Time Saved",        value: 3.5, unit: "hours", basis: "estimated" },
          { key: "tasksCompleted",  label: "Tasks Completed",   value: 12,  basis: "measured" },
          { key: "approvalsExecuted",label: "Approvals",        value: 4,   basis: "measured" },
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

  const loadIntel = async () => {
    try {
      const d = await fetchOperationalIntelligence(token, wsId);
      setIntel(d);
      trackIntelligence("intelligence.weekly.loaded", { risks: d.summary.riskCount, predictions: d.summary.predictionCount }, token, wsId);
    } catch { /* intel is additive */ }
  };

  useEffect(() => { load(); loadIntel(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const r = data;

  return (
    <div style={{ padding: "28px 24px 48px", maxWidth: 760, margin: "0 auto", fontFamily: "var(--font-ui)" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <TrendingUp style={{ width: 18, height: 18, color: "var(--brand)" }} />
          <h1 style={{ margin: 0, fontSize: 18, fontWeight: 500, color: "var(--t1)" }}>Weekly Review</h1>
          {demo && <span style={{ fontSize: 11, color: "var(--t4)", background: "var(--bg-secondary)", padding: "2px 8px", borderRadius: 10, border: "1px solid var(--border)" }}>Sample data</span>}
        </div>
        <button onClick={() => { load(); loadIntel(); }} style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 12px", borderRadius: 7, border: "1px solid var(--border)", background: "transparent", color: "var(--t3)", fontSize: 12, cursor: "pointer" }}>
          <RefreshCw style={{ width: 12, height: 12 }} /> Refresh
        </button>
      </div>

      {loading ? <div style={{ color: "var(--t4)", fontSize: 13 }}>Loading…</div> : r && (
        <>
          {/* Headline metrics (existing) */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px,1fr))", gap: 10, marginBottom: 14 }}>
            {(r.summary?.headline || []).map(m => (
              <div key={m.key} style={{ ...SECTION, marginBottom: 0, textAlign: "center" }}>
                <div style={{ fontSize: 26, fontWeight: 500, color: "var(--t1)" }}>{m.value}{m.unit ? ` ${m.unit}` : ""}</div>
                <div style={{ fontSize: 11, color: "var(--t4)", marginTop: 3 }}>{m.label}</div>
                <div style={{ fontSize: 10, color: "var(--t5)", marginTop: 2 }}>{m.basis}</div>
              </div>
            ))}
          </div>

          {/* Engineering velocity (existing) */}
          <div style={SECTION}>
            <div style={LABEL}><Zap style={{ width: 11, height: 11 }} /> Engineering Velocity</div>
            <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
              <div>
                <div style={{ fontSize: 22, fontWeight: 500, color: "var(--t1)" }}>{r.engineeringVelocity?.prsMerged ?? "—"}</div>
                <div style={{ fontSize: 11, color: "var(--t4)" }}>PRs Merged</div>
              </div>
              <div>
                <div style={{ fontSize: 22, fontWeight: 500, color: "var(--t1)" }}>{r.engineeringVelocity?.deploymentsCompleted ?? "—"}</div>
                <div style={{ fontSize: 11, color: "var(--t4)" }}>Deployments</div>
              </div>
              {r.executionSuccessRate?.rate != null && (
                <div>
                  <div style={{ fontSize: 22, fontWeight: 500, color: r.executionSuccessRate.rate >= 80 ? "var(--p-normal-text)" : "var(--p-high-text)" }}>
                    {r.executionSuccessRate.rate}%
                  </div>
                  <div style={{ fontSize: 11, color: "var(--t4)" }}>Execution Success</div>
                </div>
              )}
            </div>
          </div>

          {/* Operational risks from backend (existing) */}
          {r.operationalRisks?.length > 0 && (
            <div style={SECTION}>
              <div style={LABEL}><AlertTriangle style={{ width: 11, height: 11 }} /> Operational Risks</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {r.operationalRisks.map((risk, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: risk.probability >= 75 ? "var(--p-critical-text)" : "var(--p-high-text)", flexShrink: 0 }}>
                      {risk.probability}%
                    </div>
                    <div>
                      <div style={{ fontSize: 13, color: "var(--t1)" }}>{risk.prediction}</div>
                      {risk.timeHorizon && <div style={{ fontSize: 11, color: "var(--t4)" }}>{risk.timeHorizon} · {risk.trend}</div>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recommended priorities (existing) */}
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

          {/* Phase 7 — Workspace patterns (stale PRs, recurring incidents, meeting load) */}
          {r.patterns?.length > 0 && (
            <div style={SECTION}>
              <div style={LABEL}><Lightbulb style={{ width: 11, height: 11 }} /> Workspace Patterns</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {r.patterns.map((p, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 12px", borderRadius: 6, background: p.severity === "high" ? "rgba(255,151,65,0.05)" : "rgba(31,27,22,0.03)", border: `1px solid ${p.severity === "high" ? "rgba(255,151,65,0.18)" : "var(--border)"}` }}>
                    <AlertTriangle style={{ width: 13, height: 13, color: p.severity === "high" ? "var(--p-high-text)" : "var(--t4)", flexShrink: 0, marginTop: 1 }} />
                    <div>
                      <div style={{ fontSize: 13, color: "var(--t1)", fontWeight: 500 }}>{p.title}</div>
                      {p.detail && <div style={{ fontSize: 11, color: "var(--t4)", marginTop: 3, lineHeight: 1.5 }}>{p.detail}</div>}
                      {p.evidenceSource && <div style={{ fontSize: 9, color: "var(--t5)", marginTop: 4, textTransform: "uppercase", letterSpacing: "0.06em" }}>Source: {p.evidenceSource.replace(/_/g, " ")}</div>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Executive Report — Wins / Losses / Decisions + Intelligence ── */}
          <ExecutiveReport weekly={r} intel={intel} />
        </>
      )}
    </div>
  );
}
