import { useState, useEffect, useCallback } from "react";
import {
  BarChart2, RefreshCw, Play, CheckCircle2, AlertTriangle, XCircle,
  Minus, Brain, Cpu, Network, Plug, FileText, TrendingUp, Users,
  Shield, Zap, ChevronRight, Clock, Activity,
} from "lucide-react";
import { useWebSocket } from "../../hooks/useWebSocket";

// ── Design tokens ─────────────────────────────────────────────────────────────
const card = { background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 10, padding: "18px 20px" };
const dimText = { fontSize: 11, color: "var(--t4)", fontWeight: 400 };

// ── Domain metadata ───────────────────────────────────────────────────────────
const DOMAIN_META = {
  executiveIntelligence: { label: "Executive Intelligence", icon: Brain,      color: "#9B6BCC", tab: "ai" },
  cognitiveBrain:        { label: "Cognitive Brain",        icon: Cpu,        color: "#5B9BD5", tab: "ai" },
  executiveReports:      { label: "Executive Reports",      icon: FileText,   color: "#7DC4A5", tab: "ai" },
  predictionEngine:      { label: "Prediction Engine",      icon: TrendingUp, color: "#E8A14F", tab: "ai" },
  knowledgeGraph:        { label: "Knowledge Graph",        icon: Network,    color: "#5B9BD5", tab: "engineering" },
  workflowRuntime:       { label: "Workflow Runtime",       icon: Zap,        color: "#E8672B", tab: "workflow" },
  connectors:            { label: "Connectors",             icon: Plug,       color: "#4CAF7D", tab: "connectors" },
  autonomy:              { label: "Autonomy",               icon: Activity,   color: "#9B6BCC", tab: "executive" },
  userExperience:        { label: "User Experience",        icon: Users,      color: "#E8A14F", tab: "ux" },
};

const TABS = [
  { id: "overview",     label: "Overview" },
  { id: "ai",          label: "AI Quality" },
  { id: "engineering", label: "Engineering Quality" },
  { id: "executive",   label: "Executive Quality" },
  { id: "connectors",  label: "Connector Reliability" },
  { id: "workflow",    label: "Workflow Reliability" },
];

// ── Score rendering helpers ───────────────────────────────────────────────────
function scoreBg(score, status) {
  if (status === "insufficient_data") return "var(--surface-2)";
  if (score === null) return "var(--surface-2)";
  if (score >= 75) return "rgba(76,175,125,0.12)";
  if (score >= 55) return "rgba(232,161,79,0.12)";
  return "rgba(229,57,53,0.12)";
}
function scoreColor(score, status) {
  if (status === "insufficient_data" || score === null) return "var(--t4)";
  if (score >= 75) return "var(--ok)";
  if (score >= 55) return "var(--warn)";
  return "var(--crit)";
}
function StatusIcon({ status, size = 14 }) {
  const s = { width: size, height: size };
  if (status === "passed")            return <CheckCircle2 style={{ ...s, color: "var(--ok)" }} />;
  if (status === "warning")           return <AlertTriangle style={{ ...s, color: "var(--warn)" }} />;
  if (status === "failed")            return <XCircle style={{ ...s, color: "var(--crit)" }} />;
  if (status === "insufficient_data") return <Minus style={{ ...s, color: "var(--t4)" }} />;
  return <Minus style={{ ...s, color: "var(--t4)" }} />;
}
function grade(score) {
  if (score === null || score === undefined) return "–";
  if (score >= 90) return "A+";
  if (score >= 80) return "A";
  if (score >= 70) return "B";
  if (score >= 60) return "C";
  return "D";
}

// ── ScoreRing ─────────────────────────────────────────────────────────────────
function ScoreRing({ score, size = 72 }) {
  const r = (size - 8) / 2;
  const circ = 2 * Math.PI * r;
  const pct = score !== null ? Math.max(0, Math.min(100, score)) / 100 : 0;
  const color = score === null ? "var(--border)" : score >= 75 ? "var(--ok)" : score >= 55 ? "var(--warn)" : "var(--crit)";
  return (
    <svg width={size} height={size} style={{ flexShrink: 0 }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-2)" strokeWidth={6} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={6}
        strokeDasharray={circ} strokeDashoffset={circ * (1 - pct)}
        strokeLinecap="round" transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      <text x={size / 2} y={size / 2 + 1} textAnchor="middle" dominantBaseline="middle"
        style={{ fontSize: size * 0.22, fontWeight: 500, fill: color, fontFamily: "var(--font-data)" }}>
        {score !== null ? score : "–"}
      </text>
    </svg>
  );
}

// ── DomainCard ────────────────────────────────────────────────────────────────
function DomainCard({ domain, score, status, threshold, metrics = {}, findings = [], compact = false }) {
  const meta = DOMAIN_META[domain] ?? { label: domain, icon: BarChart2, color: "var(--t3)" };
  const Icon = meta.icon;
  const [expanded, setExpanded] = useState(false);

  return (
    <div style={{ ...card, cursor: "pointer" }} onClick={() => setExpanded(e => !e)}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ width: 32, height: 32, borderRadius: 8, background: `${meta.color}18`,
          display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <Icon style={{ width: 15, height: 15, color: meta.color }} strokeWidth={1.5} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: "var(--t1)" }}>{meta.label}</div>
          {threshold && <div style={dimText}>Pass ≥ {threshold}</div>}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 20, fontWeight: 500, color: scoreColor(score, status), fontFamily: "var(--font-data)" }}>
              {score !== null ? score : "–"}
            </div>
            <div style={{ ...dimText, fontSize: 9 }}>{grade(score)}</div>
          </div>
          <StatusIcon status={status} size={16} />
          <ChevronRight style={{ width: 12, height: 12, color: "var(--t4)", transform: expanded ? "rotate(90deg)" : "none", transition: "transform 120ms" }} />
        </div>
      </div>

      {expanded && (
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--border)" }}>
          {findings.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ ...dimText, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em" }}>Findings</div>
              {findings.map((f, i) => (
                <div key={i} style={{ display: "flex", gap: 6, marginBottom: 4, alignItems: "flex-start" }}>
                  <AlertTriangle style={{ width: 11, height: 11, color: "var(--warn)", flexShrink: 0, marginTop: 2 }} />
                  <span style={{ fontSize: 12, color: "var(--t2)", lineHeight: 1.4 }}>{f}</span>
                </div>
              ))}
            </div>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 16px" }}>
            {Object.entries(metrics).slice(0, 8).map(([k, v]) => (
              <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "3px 0" }}>
                <span style={{ ...dimText, maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {k.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase())}
                </span>
                <span style={{ fontSize: 11, color: "var(--t1)", fontFamily: "var(--font-data)", fontWeight: 400 }}>
                  {v === null || v === undefined ? "–" : typeof v === "object" ? "..." : String(v)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── MetricBar ─────────────────────────────────────────────────────────────────
function MetricBar({ label, value, max = 100, color }) {
  const pct = Math.min(100, (value / max) * 100);
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
        <span style={{ fontSize: 12, color: "var(--t2)" }}>{label}</span>
        <span style={{ fontSize: 12, color: "var(--t1)", fontFamily: "var(--font-data)" }}>{value}{max === 100 ? "%" : ""}</span>
      </div>
      <div style={{ height: 4, background: "var(--surface-2)", borderRadius: 2 }}>
        <div style={{ height: "100%", width: `${pct}%`, background: color ?? "var(--brand)", borderRadius: 2, transition: "width 400ms" }} />
      </div>
    </div>
  );
}

// ── RegressionGates ───────────────────────────────────────────────────────────
function RegressionGates({ gates = [] }) {
  return (
    <div style={card}>
      <div style={{ fontSize: 12, fontWeight: 500, color: "var(--t2)", marginBottom: 12 }}>Release Gates</div>
      {gates.map((g, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0",
          borderBottom: i < gates.length - 1 ? "1px solid var(--border)" : "none" }}>
          <StatusIcon status={g.passed ? "passed" : "failed"} size={13} />
          <span style={{ flex: 1, fontSize: 12, color: "var(--t1)" }}>{g.gate}</span>
          <span style={dimText}>need {g.required}</span>
          <span style={{ fontSize: 12, fontFamily: "var(--font-data)", color: g.passed ? "var(--ok)" : "var(--crit)" }}>
            {g.actual}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── RunHistory ────────────────────────────────────────────────────────────────
function RunHistory({ runs = [] }) {
  return (
    <div style={card}>
      <div style={{ fontSize: 12, fontWeight: 500, color: "var(--t2)", marginBottom: 12 }}>Run History</div>
      {runs.length === 0 && <div style={dimText}>No runs yet. Click "Run Now" to start the first evaluation.</div>}
      {runs.map((r, i) => (
        <div key={r.id ?? i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0",
          borderBottom: i < runs.length - 1 ? "1px solid var(--border)" : "none" }}>
          <StatusIcon status={r.status} size={13} />
          <div style={{ flex: 1 }}>
            <span style={{ fontSize: 12, color: "var(--t1)" }}>
              {r.run_type ?? r.runType ?? "manual"}
              {r.release_version ? ` · ${r.release_version}` : ""}
            </span>
            <div style={dimText}>{new Date(r.started_at ?? r.startedAt).toLocaleString()}</div>
          </div>
          <span style={{ fontSize: 13, fontFamily: "var(--font-data)", color: scoreColor(r.quality_score, r.status) }}>
            {r.quality_score ?? "–"}
          </span>
          <span style={{ ...dimText, minWidth: 40, textAlign: "right" }}>
            {r.domains_passed}/{r.domains_total}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function EvaluationPlatform() {
  const { token, workspaceId } = useWebSocket();
  const [tab, setTab]           = useState("overview");
  const [scores, setScores]     = useState([]);
  const [runs, setRuns]         = useState([]);
  const [trends, setTrends]     = useState({});
  const [loading, setLoading]   = useState(true);
  const [running, setRunning]   = useState(false);
  const [lastRun, setLastRun]   = useState(null);

  const authHeaders = token
    ? { Authorization: `Bearer ${token}`, "workspace-id": workspaceId, "Content-Type": "application/json" }
    : {};

  const load = useCallback(async () => {
    if (!token || !workspaceId) { setLoading(false); return; }
    setLoading(true);
    try {
      const [scoreRes, runsRes, trendsRes] = await Promise.allSettled([
        fetch("/api/fvep/score",  { headers: authHeaders }).then(r => r.ok ? r.json() : null),
        fetch("/api/fvep/runs",   { headers: authHeaders }).then(r => r.ok ? r.json() : null),
        fetch("/api/fvep/trends", { headers: authHeaders }).then(r => r.ok ? r.json() : null),
      ]);
      if (scoreRes.status === "fulfilled"  && scoreRes.value)  setScores(scoreRes.value.domains ?? []);
      if (runsRes.status === "fulfilled"   && runsRes.value)   setRuns(runsRes.value.runs ?? []);
      if (trendsRes.status === "fulfilled" && trendsRes.value) setTrends(trendsRes.value.trends ?? {});
    } catch {}
    setLoading(false);
  }, [token, workspaceId]);

  useEffect(() => { load(); }, [load]);

  const handleRunNow = async () => {
    setRunning(true);
    try {
      const r = await fetch("/api/fvep/run", {
        method: "POST", headers: authHeaders,
        body: JSON.stringify({ runType: "manual" }),
      });
      if (r.ok) {
        const data = await r.json();
        setLastRun(data);
        await load();
      }
    } catch {}
    setRunning(false);
  };

  const handleRegression = async () => {
    setRunning(true);
    try {
      const r = await fetch("/api/fvep/regression", {
        method: "POST", headers: authHeaders,
        body: JSON.stringify({ releaseVersion: "manual", triggeredBy: "ui" }),
      });
      const data = await r.json();
      setLastRun(data.report);
      await load();
    } catch {}
    setRunning(false);
  };

  // Derived data
  const overallScore = scores.length > 0
    ? Math.round(scores.filter(s => s.score !== null).reduce((sum, s) => sum + (Number(s.score) || 0), 0) /
        Math.max(1, scores.filter(s => s.score !== null).length))
    : null;

  const domainsByTab = (tabId) =>
    scores.filter(s => {
      if (tabId === "overview") return true;
      return DOMAIN_META[s.domain]?.tab === tabId;
    });

  const overallStatus = overallScore === null ? "insufficient_data"
    : overallScore >= 75 ? "passed"
    : overallScore >= 55 ? "warning"
    : "failed";

  return (
    <div style={{ padding: "24px 28px 60px", maxWidth: 1000, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Shield style={{ width: 20, height: 20, color: "var(--brand)" }} strokeWidth={1.5} />
          <div>
            <h1 style={{ margin: 0, fontSize: 18, fontWeight: 500, color: "var(--t1)" }}>
              Validation & Evaluation Platform
            </h1>
            <p style={{ margin: 0, fontSize: 12, color: "var(--t3)" }}>
              Continuous quality benchmarks across all FLOW capabilities
            </p>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={handleRegression} disabled={running || !token}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 12px", borderRadius: 7,
              border: "1px solid var(--border)", background: "transparent", color: "var(--t2)",
              fontSize: 12, cursor: running ? "not-allowed" : "pointer", opacity: running ? 0.5 : 1 }}>
            <CheckCircle2 style={{ width: 13, height: 13 }} />
            Release Gate
          </button>
          <button onClick={handleRunNow} disabled={running || !token}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 7,
              background: "var(--brand)", color: "#fff", border: "none",
              fontSize: 12, fontWeight: 500, cursor: running ? "not-allowed" : "pointer", opacity: running ? 0.7 : 1 }}>
            {running
              ? <><RefreshCw style={{ width: 13, height: 13, animation: "spin 1s linear infinite" }} /> Running…</>
              : <><Play style={{ width: 13, height: 13 }} /> Run Now</>}
          </button>
        </div>
      </div>

      {/* Overall score banner */}
      <div style={{ ...card, display: "flex", alignItems: "center", gap: 20, marginBottom: 20 }}>
        <ScoreRing score={overallScore} size={80} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: "var(--t1)", marginBottom: 4 }}>
            Overall Quality Score
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <StatusIcon status={overallStatus} size={14} />
            <span style={{ fontSize: 12, color: "var(--t2)", textTransform: "capitalize" }}>{overallStatus.replace(/_/g, " ")}</span>
            {runs[0] && (
              <span style={{ ...dimText, marginLeft: 8 }}>
                Last run: {new Date(runs[0].started_at).toLocaleString()}
              </span>
            )}
          </div>
          <div style={{ display: "flex", gap: 16 }}>
            {["passed", "warning", "failed", "insufficient_data"].map(s => {
              const count = scores.filter(d => d.status === s).length;
              if (count === 0) return null;
              return (
                <div key={s} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <StatusIcon status={s} size={12} />
                  <span style={{ fontSize: 11, color: "var(--t3)" }}>{count} {s.replace(/_/g, " ")}</span>
                </div>
              );
            })}
          </div>
        </div>
        {lastRun && (
          <div style={{ textAlign: "right", padding: "8px 12px", borderLeft: "1px solid var(--border)" }}>
            <div style={{ fontSize: 11, color: "var(--t4)", marginBottom: 4 }}>Last Result</div>
            <div style={{ fontSize: 18, fontWeight: 500, color: scoreColor(lastRun.overallScore, lastRun.status ?? overallStatus), fontFamily: "var(--font-data)" }}>
              {lastRun.overallScore ?? "–"}/100
            </div>
            <div style={{ fontSize: 10, color: "var(--t4)" }}>
              {lastRun.domainsPassed}/{lastRun.domainsTotal} passed
            </div>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 0, borderBottom: "1px solid var(--border)", marginBottom: 20 }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{ padding: "8px 16px", background: "transparent", border: "none",
              borderBottom: tab === t.id ? "2px solid var(--brand)" : "2px solid transparent",
              color: tab === t.id ? "var(--t1)" : "var(--t3)",
              fontSize: 12, fontWeight: tab === t.id ? 500 : 400,
              cursor: "pointer", transition: "color 80ms" }}>
            {t.label}
            {t.id !== "overview" && (
              <span style={{ marginLeft: 5, fontSize: 9, color: "var(--t4)" }}>
                {domainsByTab(t.id).length}
              </span>
            )}
          </button>
        ))}
      </div>

      {loading && (
        <div style={{ textAlign: "center", padding: "48px 0", color: "var(--t4)", fontSize: 13 }}>
          Loading evaluation data…
        </div>
      )}

      {!loading && tab === "overview" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          {/* Domain score grid */}
          <div style={{ gridColumn: "1 / -1", display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
            {Object.entries(DOMAIN_META).map(([domain, meta]) => {
              const d = scores.find(s => s.domain === domain) ?? { domain, score: null, status: "insufficient_data" };
              return (
                <div key={domain} style={{ ...card, display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ width: 28, height: 28, borderRadius: 6, background: `${meta.color}18`,
                    display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <meta.icon style={{ width: 13, height: 13, color: meta.color }} strokeWidth={1.5} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 11, color: "var(--t2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {meta.label}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <span style={{ fontSize: 16, fontWeight: 500, color: scoreColor(d.score, d.status), fontFamily: "var(--font-data)" }}>
                        {d.score !== null ? d.score : "–"}
                      </span>
                      <span style={{ fontSize: 9, color: "var(--t4)" }}>{grade(d.score)}</span>
                    </div>
                  </div>
                  <StatusIcon status={d.status} size={14} />
                </div>
              );
            })}
          </div>
          {/* Run history */}
          <RunHistory runs={runs.slice(0, 8)} />
          {/* Last regression gates */}
          {lastRun?.gates && <RegressionGates gates={lastRun.gates} />}
        </div>
      )}

      {!loading && tab !== "overview" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {domainsByTab(tab).length === 0 && (
            <div style={{ ...card, color: "var(--t4)", fontSize: 13, textAlign: "center", padding: "32px" }}>
              No domains in this category. Run an evaluation to populate data.
            </div>
          )}
          {domainsByTab(tab).map(d => (
            <DomainCard key={d.domain}
              domain={d.domain}
              score={d.score !== null ? Number(d.score) : null}
              status={d.status}
              threshold={d.threshold}
              metrics={d.metrics ?? {}}
              findings={d.findings ?? []}
            />
          ))}

          {/* Tab-specific supplementary panels */}
          {tab === "workflow" && (
            <div style={card}>
              <div style={{ fontSize: 12, fontWeight: 500, color: "var(--t2)", marginBottom: 14 }}>Workflow Metrics</div>
              {(() => {
                const wf = scores.find(s => s.domain === "workflowRuntime");
                const m  = wf?.metrics ?? {};
                return (
                  <>
                    <MetricBar label="Success Rate"  value={m.successRate  ?? 0} color="var(--ok)" />
                    <MetricBar label="Retry Rate"    value={m.retryRate    ?? 0} color="var(--warn)" />
                    <MetricBar label="Rollback Rate" value={m.rollbackRate ?? 0} color="var(--crit)" />
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginTop: 12 }}>
                      {[
                        { label: "Total Executions", val: m.totalExecutions ?? "–" },
                        { label: "Avg Duration",     val: m.avgDurationSec ? `${m.avgDurationSec}s` : "–" },
                        { label: "P95 Duration",     val: m.p95DurationSec ? `${m.p95DurationSec}s` : "–" },
                        { label: "Pending Approvals >48h", val: m.approvalDelays ?? "–" },
                        { label: "Failed",           val: m.failedCount ?? "–" },
                        { label: "Rolled Back",      val: m.rolledBackCount ?? "–" },
                      ].map(({ label, val }) => (
                        <div key={label} style={{ textAlign: "center" }}>
                          <div style={{ fontSize: 18, fontWeight: 500, color: "var(--t1)", fontFamily: "var(--font-data)" }}>{val}</div>
                          <div style={dimText}>{label}</div>
                        </div>
                      ))}
                    </div>
                  </>
                );
              })()}
            </div>
          )}

          {tab === "connectors" && (
            <div style={card}>
              <div style={{ fontSize: 12, fontWeight: 500, color: "var(--t2)", marginBottom: 14 }}>Connector Reliability Metrics</div>
              {(() => {
                const cn = scores.find(s => s.domain === "connectors");
                const m  = cn?.metrics ?? {};
                return (
                  <>
                    <MetricBar label="Action Success Rate"    value={m.actionSuccessRate    ?? 0} color="var(--ok)" />
                    <MetricBar label="Sync Success Rate"      value={m.syncSuccessRate      ?? 0} color="var(--ok)" />
                    <MetricBar label="Connector Health Rate"  value={m.connectorHealthRate  ?? 0} color="var(--brand)" />
                    <MetricBar label="Webhook Reliability"    value={m.webhookReliability   ?? 0} color="var(--ok)" />
                    <MetricBar label="Auth Failure Rate"      value={m.authFailureRate      ?? 0} max={100} color="var(--crit)" />
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginTop: 12 }}>
                      {[
                        { label: "Healthy",  val: m.healthyConnectors  ?? "–" },
                        { label: "Degraded", val: m.degradedConnectors ?? "–" },
                        { label: "Down",     val: m.downConnectors     ?? "–" },
                        { label: "Webhooks", val: m.webhookTotal       ?? "–" },
                      ].map(({ label, val }) => (
                        <div key={label} style={{ textAlign: "center" }}>
                          <div style={{ fontSize: 18, fontWeight: 500, color: "var(--t1)", fontFamily: "var(--font-data)" }}>{val}</div>
                          <div style={dimText}>{label}</div>
                        </div>
                      ))}
                    </div>
                  </>
                );
              })()}
            </div>
          )}

          {tab === "ai" && (
            <div style={card}>
              <div style={{ fontSize: 12, fontWeight: 500, color: "var(--t2)", marginBottom: 14 }}>AI Quality Metrics</div>
              {(() => {
                const brain = scores.find(s => s.domain === "cognitiveBrain");
                const pred  = scores.find(s => s.domain === "predictionEngine");
                const mb = brain?.metrics ?? {};
                const mp = pred?.metrics  ?? {};
                return (
                  <>
                    <MetricBar label="Conversation Citation Rate"  value={mb.citationRate          ?? 0} color="var(--ok)" />
                    <MetricBar label="Avg Reasoning Confidence"    value={mb.avgReasoningConfidence ?? 0} color="var(--brand)" />
                    <MetricBar label="Prediction Accuracy"         value={mp.accuracyRate          ?? 0} color="var(--ok)" />
                    <MetricBar label="Prediction Confidence Calib" value={mp.calibration           ?? 0} color="var(--t3)" />
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginTop: 12 }}>
                      {[
                        { label: "Total Conversations", val: mb.totalConversations    ?? "–" },
                        { label: "Avg Depth",           val: mb.avgMessagesPerConv    ?? "–" },
                        { label: "Total Predictions",   val: mp.totalPredictions      ?? "–" },
                        { label: "Distinct Domains",    val: mp.distinctDomains       ?? "–" },
                        { label: "False Positives",     val: mp.falsePositives        ?? "–" },
                        { label: "Council Responses",   val: mb.councilResponses      ?? "–" },
                      ].map(({ label, val }) => (
                        <div key={label} style={{ textAlign: "center" }}>
                          <div style={{ fontSize: 16, fontWeight: 500, color: "var(--t1)", fontFamily: "var(--font-data)" }}>{val}</div>
                          <div style={dimText}>{label}</div>
                        </div>
                      ))}
                    </div>
                  </>
                );
              })()}
            </div>
          )}

          {tab === "executive" && (
            <div style={card}>
              <div style={{ fontSize: 12, fontWeight: 500, color: "var(--t2)", marginBottom: 14 }}>Executive Quality Metrics</div>
              {(() => {
                const ei = scores.find(s => s.domain === "executiveIntelligence");
                const au = scores.find(s => s.domain === "autonomy");
                const mi = ei?.metrics ?? {};
                const ma = au?.metrics ?? {};
                return (
                  <>
                    <MetricBar label="Citation Coverage"           value={mi.citationCoverage           ?? 0} color="var(--ok)" />
                    <MetricBar label="Recommendation Acceptance"   value={mi.recommendationAcceptance   ?? 0} color="var(--brand)" />
                    <MetricBar label="Hallucination Risk"          value={mi.hallucinationProxy         ?? 0} color="var(--crit)" />
                    <MetricBar label="Autonomy Acceptance"         value={ma.recommendationAcceptance   ?? 0} color="var(--ok)" />
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginTop: 12 }}>
                      {[
                        { label: "Briefings (30d)",    val: mi.totalBriefings    ?? "–" },
                        { label: "Recommendations",    val: mi.totalRecommendations ?? "–" },
                        { label: "Tasks Completed",    val: ma.tasksCompleted    ?? "–" },
                        { label: "Hours Saved (est.)", val: ma.estimatedHoursSaved ? `${ma.estimatedHoursSaved}h` : "–" },
                        { label: "Overrides",          val: ma.humanOverrides    ?? "–" },
                        { label: "Rollbacks",          val: ma.rolledBackCount   ?? "–" },
                      ].map(({ label, val }) => (
                        <div key={label} style={{ textAlign: "center" }}>
                          <div style={{ fontSize: 16, fontWeight: 500, color: "var(--t1)", fontFamily: "var(--font-data)" }}>{val}</div>
                          <div style={dimText}>{label}</div>
                        </div>
                      ))}
                    </div>
                  </>
                );
              })()}
            </div>
          )}

          {tab === "engineering" && (
            <div style={card}>
              <div style={{ fontSize: 12, fontWeight: 500, color: "var(--t2)", marginBottom: 14 }}>Knowledge Graph Metrics</div>
              {(() => {
                const kg = scores.find(s => s.domain === "knowledgeGraph");
                const m  = kg?.metrics ?? {};
                return (
                  <>
                    <MetricBar label="30-Day Freshness"      value={m.freshness30d    ?? 0} color="var(--ok)" />
                    <MetricBar label="Connectivity"          value={Math.min(100, (m.avgEdgesPerNode ?? 0) * 20)} color="var(--brand)" />
                    <MetricBar label="Orphan-Free Rate"      value={100 - (m.orphanRate ?? 0)} color="var(--ok)" />
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginTop: 12 }}>
                      {[
                        { label: "Total Nodes",      val: m.totalNodes       ?? "–" },
                        { label: "Total Edges",      val: m.totalEdges       ?? "–" },
                        { label: "Node Types",       val: m.distinctTypes    ?? "–" },
                        { label: "Orphan Nodes",     val: m.orphanNodes      ?? "–" },
                      ].map(({ label, val }) => (
                        <div key={label} style={{ textAlign: "center" }}>
                          <div style={{ fontSize: 16, fontWeight: 500, color: "var(--t1)", fontFamily: "var(--font-data)" }}>{val}</div>
                          <div style={dimText}>{label}</div>
                        </div>
                      ))}
                    </div>
                  </>
                );
              })()}
            </div>
          )}

          <RunHistory runs={runs.slice(0, 5)} />
        </div>
      )}
    </div>
  );
}
