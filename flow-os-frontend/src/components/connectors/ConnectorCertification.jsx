import { useState, useEffect, useCallback } from "react";
import { CheckCircle, XCircle, AlertCircle, Clock, RefreshCw, ChevronDown, ChevronRight, Shield, Zap, Activity } from "lucide-react";

const API = (path) => {
  const token = localStorage.getItem("flow_os_token") || "";
  const wsId  = localStorage.getItem("flow_os_workspace_id") || "";
  return fetch(path, { headers: { Authorization: `Bearer ${token}`, "workspace-id": wsId } });
};

const POST = (path, body) => {
  const token = localStorage.getItem("flow_os_token") || "";
  const wsId  = localStorage.getItem("flow_os_workspace_id") || "";
  return fetch(path, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "workspace-id": wsId, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
};

// ─── Status helpers ───────────────────────────────────────────────────────────
const STATUS_CONFIG = {
  CERTIFIED:               { label: "Certified",       color: "#1d7a3c", bg: "rgba(29,122,60,0.08)",   dot: "#1d7a3c" },
  PROVISIONALLY_CERTIFIED: { label: "Provisional",     color: "#92600a", bg: "rgba(146,96,10,0.08)",   dot: "#d4911f" },
  PENDING:                 { label: "Pending",         color: "#4b5563", bg: "rgba(75,85,99,0.08)",    dot: "#9ca3af" },
  NOT_CERTIFIED:           { label: "Not Certified",   color: "#b91c1c", bg: "rgba(185,28,28,0.08)",   dot: "#ef4444" },
  ERROR:                   { label: "Error",           color: "#b91c1c", bg: "rgba(185,28,28,0.08)",   dot: "#ef4444" },
};

const HEALTH_CONFIG = {
  healthy:  { label: "Healthy",  color: "#1d7a3c" },
  degraded: { label: "Degraded", color: "#92600a" },
  down:     { label: "Down",     color: "#b91c1c" },
  unknown:  { label: "Unknown",  color: "#6b7280" },
};

const TIER_LABEL = { 1: "Tier 1 — Core", 2: "Tier 2 — Extended", 3: "Tier 3 — Enterprise" };

function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.PENDING;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      padding: "2px 8px", borderRadius: 99,
      background: cfg.bg, color: cfg.color,
      fontSize: 11, fontWeight: 500, fontFamily: "var(--font-data)",
      whiteSpace: "nowrap",
    }}>
      <span style={{ width: 5, height: 5, borderRadius: "50%", background: cfg.dot, flexShrink: 0 }} />
      {cfg.label}
    </span>
  );
}

function ScoreRing({ score, size = 40 }) {
  if (score === null || score === undefined) {
    return <span style={{ fontSize: 11, color: "var(--t5)", fontFamily: "var(--font-data)" }}>—</span>;
  }
  const color = score >= 90 ? "#1d7a3c" : score >= 70 ? "#92600a" : score >= 50 ? "#4b5563" : "#b91c1c";
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 1 }}>
      <div style={{
        width: size, height: size, borderRadius: "50%",
        background: `conic-gradient(${color} ${score}%, rgba(31,27,22,0.08) 0%)`,
        display: "flex", alignItems: "center", justifyContent: "center", position: "relative",
      }}>
        <div style={{
          width: size - 8, height: size - 8, borderRadius: "50%",
          background: "var(--surface-1)", display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <span style={{ fontSize: 11, fontWeight: 600, color, fontFamily: "var(--font-data)" }}>{score}</span>
        </div>
      </div>
    </div>
  );
}

function DomainBar({ domain, data }) {
  const s = data?.score ?? 0;
  const color = s >= 90 ? "#1d7a3c" : s >= 70 ? "#d4911f" : "#ef4444";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
      <span style={{ width: 96, fontSize: 11, color: "var(--t3)", fontFamily: "var(--font-data)", textTransform: "capitalize", flexShrink: 0 }}>{domain}</span>
      <div style={{ flex: 1, height: 4, background: "rgba(31,27,22,0.08)", borderRadius: 2, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${s}%`, background: color, borderRadius: 2, transition: "width 0.6s ease" }} />
      </div>
      <span style={{ width: 28, fontSize: 10, color, fontFamily: "var(--font-data)", textAlign: "right", flexShrink: 0 }}>{s}%</span>
    </div>
  );
}

function CheckRow({ check }) {
  const icon = check.skipped
    ? <span style={{ fontSize: 11, color: "var(--t4)" }}>N/A</span>
    : check.passed
      ? <CheckCircle size={12} color="#1d7a3c" />
      : <XCircle size={12} color="#ef4444" />;
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 6, padding: "3px 0", borderBottom: "1px solid var(--border)" }}>
      <span style={{ flexShrink: 0, marginTop: 1 }}>{icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <span style={{ fontSize: 11, color: check.passed ? "var(--t2)" : "var(--t1)", fontFamily: "var(--font-data)" }}>{check.name}</span>
        {check.detail && !check.passed && (
          <div style={{ fontSize: 10, color: "#b91c1c", marginTop: 1, fontFamily: "var(--font-data)" }}>{check.detail}</div>
        )}
        {check.detail && check.skipped && (
          <div style={{ fontSize: 10, color: "var(--t5)", marginTop: 1, fontFamily: "var(--font-data)" }}>{check.detail}</div>
        )}
      </div>
    </div>
  );
}

function ConnectorRow({ connector, onRun, running }) {
  const [expanded, setExpanded] = useState(false);
  const health = HEALTH_CONFIG[connector.healthStatus] || HEALTH_CONFIG.unknown;

  return (
    <>
      <tr
        onClick={() => connector.domains && setExpanded(p => !p)}
        style={{ cursor: connector.domains ? "pointer" : "default", transition: "background 80ms" }}
        onMouseEnter={e => { if (!expanded) e.currentTarget.style.background = "rgba(31,27,22,0.02)"; }}
        onMouseLeave={e => { if (!expanded) e.currentTarget.style.background = "transparent"; }}
      >
        <td style={TD}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {connector.domains
              ? (expanded ? <ChevronDown size={11} color="var(--t4)" /> : <ChevronRight size={11} color="var(--t4)" />)
              : <span style={{ width: 11 }} />
            }
            <div>
              <div style={{ fontSize: 12, fontWeight: 500, color: "var(--t1)" }}>{connector.connectorName}</div>
              <div style={{ fontSize: 10, color: "var(--t5)", fontFamily: "var(--font-data)" }}>{connector.connectorId}</div>
            </div>
          </div>
        </td>
        <td style={TD}>
          <span style={{ fontSize: 10, color: "var(--t4)", fontFamily: "var(--font-data)" }}>
            {TIER_LABEL[connector.tier] || "Tier 3"}
          </span>
        </td>
        <td style={TD}><StatusBadge status={connector.certificationStatus} /></td>
        <td style={{ ...TD, textAlign: "center" }}><ScoreRing score={connector.certificationScore} /></td>
        <td style={TD}>
          <span style={{ fontSize: 11, color: health.color, fontFamily: "var(--font-data)" }}>
            {health.label}
            {connector.latencyMs != null && <span style={{ color: "var(--t5)", marginLeft: 4 }}>{connector.latencyMs}ms</span>}
          </span>
        </td>
        <td style={TD}>
          <span style={{ fontSize: 10, color: "var(--t4)", fontFamily: "var(--font-data)" }}>
            {connector.oauthStatus === "connected" ? "✓ Connected" : "—"}
          </span>
        </td>
        <td style={TD}>
          <span style={{ fontSize: 10, color: "var(--t4)", fontFamily: "var(--font-data)" }}>
            {connector.testedAt ? new Date(connector.testedAt).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "Never"}
          </span>
        </td>
        <td style={{ ...TD, paddingRight: 0 }}>
          <button
            onClick={e => { e.stopPropagation(); onRun(connector.connectorId); }}
            disabled={running === connector.connectorId}
            style={{
              padding: "3px 10px", fontSize: 10, fontFamily: "var(--font-data)",
              background: "transparent", border: "1px solid var(--border)", borderRadius: 4,
              cursor: running === connector.connectorId ? "default" : "pointer",
              color: "var(--t3)", display: "flex", alignItems: "center", gap: 4,
            }}
          >
            {running === connector.connectorId
              ? <><RefreshCw size={9} style={{ animation: "spin 0.8s linear infinite" }} /> Running…</>
              : "Run"
            }
          </button>
        </td>
      </tr>

      {expanded && connector.domains && (
        <tr>
          <td colSpan={8} style={{ padding: "0 0 12px 28px", background: "rgba(31,27,22,0.01)" }}>
            <div style={{ display: "flex", gap: 24, paddingTop: 12 }}>
              {/* Domain score bars */}
              <div style={{ flex: "0 0 280px" }}>
                <div style={{ fontSize: 10, fontWeight: 600, color: "var(--t4)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8, fontFamily: "var(--font-data)" }}>Domain Scores</div>
                {Object.entries(connector.domains).map(([domain, data]) => (
                  <DomainBar key={domain} domain={domain} data={data} />
                ))}
              </div>

              {/* Per-domain check detail */}
              <div style={{ flex: 1, minWidth: 0 }}>
                {Object.entries(connector.domains).map(([domain, data]) => {
                  const failed = data.checks?.filter(c => !c.passed && !c.skipped) || [];
                  if (failed.length === 0) return null;
                  return (
                    <div key={domain} style={{ marginBottom: 10 }}>
                      <div style={{ fontSize: 10, fontWeight: 600, color: "#b91c1c", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4, fontFamily: "var(--font-data)" }}>
                        {domain} — {failed.length} failing
                      </div>
                      {failed.map((c, i) => <CheckRow key={i} check={c} />)}
                    </div>
                  );
                })}
                {Object.values(connector.domains).every(d => (d.checks || []).filter(c => !c.passed && !c.skipped).length === 0) && (
                  <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#1d7a3c", fontSize: 11, fontFamily: "var(--font-data)", paddingTop: 4 }}>
                    <CheckCircle size={13} /> All checks passed
                  </div>
                )}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

const TH = { fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--t5)", padding: "0 12px 10px 0", borderBottom: "1px solid var(--border)", textAlign: "left", whiteSpace: "nowrap", fontFamily: "var(--font-data)" };
const TD = { padding: "11px 12px 11px 0", borderBottom: "1px solid var(--border)", verticalAlign: "middle" };

// ─── Main component ───────────────────────────────────────────────────────────
export default function ConnectorCertification() {
  const [data, setData]     = useState(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(null);
  const [runAll, setRunAll]   = useState(false);
  const [tier, setTier]       = useState("all");

  const load = useCallback(() => {
    setLoading(true);
    API("/api/connectors/certification")
      .then(r => r.ok ? r.json() : null)
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleRun = async (connectorId) => {
    setRunning(connectorId);
    try {
      await POST("/api/connectors/certification/run", { connectorId });
      await load();
    } finally {
      setRunning(null);
    }
  };

  const handleRunAll = async () => {
    setRunAll(true);
    try {
      await POST("/api/connectors/certification/run", {});
      await load();
    } finally {
      setRunAll(false);
    }
  };

  const connectors = (data?.connectors || []).filter(c =>
    tier === "all" ? true : String(c.tier) === tier
  );
  const summary = data?.summary || {};

  return (
    <div style={{ padding: "32px 40px", maxWidth: 1100, margin: "0 auto", fontFamily: "var(--font-ui)" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 28 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
            <Shield size={18} color="var(--accent)" strokeWidth={1.5} />
            <h1 style={{ fontSize: 20, fontWeight: 400, color: "var(--t1)", fontFamily: "var(--font-display)", margin: 0 }}>Connector Certification</h1>
          </div>
          <p style={{ fontSize: 13, color: "var(--t4)", margin: 0 }}>Enterprise readiness across auth, sync, actions, reliability, webhooks, and observability</p>
        </div>
        <button
          onClick={handleRunAll}
          disabled={runAll}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "8px 16px", fontSize: 12, fontFamily: "var(--font-ui)",
            background: "var(--accent)", color: "#fff", border: "none", borderRadius: 6,
            cursor: runAll ? "default" : "pointer", opacity: runAll ? 0.7 : 1,
          }}
        >
          {runAll ? <><RefreshCw size={12} style={{ animation: "spin 0.8s linear infinite" }} /> Running all…</> : "Run All Connectors"}
        </button>
      </div>

      {/* Summary KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 28 }}>
        {[
          { label: "Total Connectors",    value: summary.total ?? "—",     icon: Zap,          color: "var(--t2)" },
          { label: "Certified",           value: summary.certified ?? "—", icon: CheckCircle,   color: "#1d7a3c" },
          { label: "Provisional",         value: summary.provisional ?? "—", icon: AlertCircle, color: "#d4911f" },
          { label: "Untested",            value: summary.untested ?? "—",  icon: Clock,         color: "var(--t5)" },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 8, padding: "14px 16px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
              <Icon size={13} color={color} strokeWidth={1.5} />
              <span style={{ fontSize: 10, color: "var(--t5)", textTransform: "uppercase", letterSpacing: "0.06em", fontFamily: "var(--font-data)" }}>{label}</span>
            </div>
            <div style={{ fontSize: 24, fontWeight: 300, color, fontFamily: "var(--font-display)" }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Tier filter */}
      <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
        {[["all", "All Tiers"], ["1", "Tier 1 — Core"], ["2", "Tier 2 — Extended"], ["3", "Tier 3 — Enterprise"]].map(([val, label]) => (
          <button
            key={val}
            onClick={() => setTier(val)}
            style={{
              padding: "4px 12px", fontSize: 11, fontFamily: "var(--font-data)",
              background: tier === val ? "var(--accent)" : "transparent",
              color: tier === val ? "#fff" : "var(--t3)",
              border: `1px solid ${tier === val ? "var(--accent)" : "var(--border)"}`,
              borderRadius: 4, cursor: "pointer",
            }}
          >
            {label}
          </button>
        ))}
        <button onClick={load} style={{ marginLeft: "auto", padding: "4px 10px", fontSize: 11, background: "transparent", border: "1px solid var(--border)", borderRadius: 4, cursor: "pointer", color: "var(--t4)", display: "flex", alignItems: "center", gap: 4 }}>
          <RefreshCw size={10} /> Refresh
        </button>
      </div>

      {/* Connector table */}
      <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
        {loading ? (
          <div style={{ padding: 32, display: "flex", flexDirection: "column", gap: 8 }}>
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} style={{ height: 44, borderRadius: 4, background: "rgba(31,27,22,0.04)", position: "relative", overflow: "hidden" }}>
                <div style={{ position: "absolute", inset: 0, background: "linear-gradient(90deg, transparent 0%, rgba(31,27,22,0.05) 50%, transparent 100%)", animation: "shimmer-sweep 1.6s ease-in-out infinite" }} />
              </div>
            ))}
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", padding: "0 16px" }}>
              <thead>
                <tr>
                  <th style={{ ...TH, paddingLeft: 16 }}>Connector</th>
                  <th style={TH}>Tier</th>
                  <th style={TH}>Status</th>
                  <th style={{ ...TH, textAlign: "center" }}>Score</th>
                  <th style={TH}>Health</th>
                  <th style={TH}>OAuth</th>
                  <th style={TH}>Last Tested</th>
                  <th style={{ ...TH, paddingRight: 16 }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {connectors.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ padding: "32px 16px", textAlign: "center", color: "var(--t5)", fontSize: 12 }}>
                      No connectors — run certification to populate
                    </td>
                  </tr>
                ) : connectors.map(c => (
                  <ConnectorRow
                    key={c.connectorId}
                    connector={c}
                    onRun={handleRun}
                    running={running}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Legend */}
      <div style={{ display: "flex", gap: 16, marginTop: 12, flexWrap: "wrap" }}>
        {Object.entries(STATUS_CONFIG).map(([k, v]) => (
          <div key={k} style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: v.dot }} />
            <span style={{ fontSize: 10, color: "var(--t5)", fontFamily: "var(--font-data)" }}>{v.label}</span>
          </div>
        ))}
        <span style={{ fontSize: 10, color: "var(--t5)", fontFamily: "var(--font-data)", marginLeft: 4 }}>· Click a row to expand domain details</span>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
