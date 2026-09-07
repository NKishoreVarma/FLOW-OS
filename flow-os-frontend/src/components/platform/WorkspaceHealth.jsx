import { useState, useEffect } from "react";
import { Activity, CheckCircle2, RefreshCw, Network, Zap, Database } from "lucide-react";
import { useWebSocket } from "../../hooks/useWebSocket";

const MetricCard = ({ icon: Icon, label, value, spin }) => (
  <div style={{ background: "var(--bg-card)", border: "1px solid var(--border-strong)", borderRadius: 4, padding: "18px" }}>
    <span style={{ display: "block", fontSize: 9, fontWeight: 500, color: "var(--t5)", textTransform: "uppercase", letterSpacing: "0.10em", marginBottom: 8 }}>{label}</span>
    <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 18, fontWeight: 500, color: "var(--t1)" }}>
      <Icon style={{ width: 18, height: 18, color: "var(--brand)", animation: spin ? "spin 1.2s linear infinite" : "none" }} />
      {value}
    </span>
  </div>
);

const DetailCard = ({ icon: Icon, title, rows }) => (
  <div style={{ background: "var(--bg-card)", border: "1px solid var(--border-strong)", borderRadius: 4, padding: "20px" }}>
    <div style={{ display: "flex", alignItems: "center", gap: 8, borderBottom: "1px solid var(--border)", paddingBottom: 10, marginBottom: 16 }}>
      <Icon style={{ width: 14, height: 14, color: "var(--brand)" }} />
      <h2 style={{ fontSize: 9, fontWeight: 500, color: "var(--t1)", textTransform: "uppercase", letterSpacing: "0.10em" }}>{title}</h2>
    </div>
    <div style={{ display: "flex", flexDirection: "column", gap: 12, fontSize: 12, color: "var(--t4)" }}>
      {rows.map(([key, val], i) => (
        <div key={i} style={{ display: "flex", justifyContent: "space-between" }}>
          <span>{key}:</span>
          <span style={{ fontWeight: 500, color: "var(--t1)" }}>{val}</span>
        </div>
      ))}
    </div>
  </div>
);

const WorkspaceHealth = () => {
  const { token, workspaceId, isAuthLoading } = useWebSocket();
  const [health, setHealth]   = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchHealth = async () => {
    if (!token || !workspaceId) { setLoading(false); return; }
    try {
      const res = await fetch(`/api/org/workspaces/${workspaceId}/health`, {
        headers: { Authorization: `Bearer ${token}`, "workspace-id": workspaceId }
      });
      if (res.ok) { setHealth(await res.json()); }
    } catch {}
    finally { setLoading(false); }
  };

  useEffect(() => {
    if (!isAuthLoading) { setTimeout(() => fetchHealth(), 0); }
  }, [isAuthLoading, token, workspaceId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) {
    return (
      <div style={{ padding: "32px 24px" }}>
        {[64, 110, 110, 110, 110].map((h, i) => (
          <div key={i} style={{ height: h, borderRadius: 4, background: "var(--bg-card)", border: "1px solid var(--border)", marginBottom: 14, position: "relative", overflow: "hidden", display: "inline-block", width: i === 0 ? "100%" : "calc(25% - 12px)", marginRight: i === 0 ? 0 : 14 }}>
            <div style={{ position: "absolute", inset: 0, background: "linear-gradient(90deg, transparent 0%, rgba(31,27,22,0.05) 50%, transparent 100%)", animation: "shimmer-sweep 1.6s ease-in-out infinite" }} />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div style={{ padding: "24px", display: "flex", flexDirection: "column", gap: 24 }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 500, color: "var(--t1)", letterSpacing: "-0.4px", display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
            <Activity style={{ width: 22, height: 22, color: "var(--brand)" }} />
            Workspace Health Scorecard
          </h1>
          <p style={{ fontSize: 12, color: "var(--t4)", maxWidth: 520 }}>
            Real-time synchronization latency, database chunk indexing, operational graph completeness, and connector freshness ratios.
          </p>
        </div>
        <button
          onClick={fetchHealth}
          style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--t3)", background: "rgba(31,27,22,0.05)", border: "1px solid var(--border)", borderRadius: 4, padding: "6px 12px", cursor: "pointer", flexShrink: 0 }}
        >
          <RefreshCw style={{ width: 12, height: 12 }} /> Refresh health
        </button>
      </div>

      {health && (
        <>
          {/* Top cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
            <MetricCard icon={CheckCircle2} label="Workspace Status"    value={health.status}                                            />
            <MetricCard icon={Zap}          label="Connector Freshness"  value={`${health.connectorHealth.freshnessScore}%`}             />
            <MetricCard icon={RefreshCw}    label="Sync Latency"         value={`${health.connectorHealth.syncLatencyMs} ms`} spin={true} />
            <MetricCard icon={Network}      label="Graph Completeness"   value={`${health.graphCompleteness.score}%`}                    />
          </div>

          {/* Detail cards */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <DetailCard
              icon={Network}
              title="Durable Operational Graph"
              rows={[
                ["Graph Node elements",    health.graphCompleteness.nodeCount],
                ["Graph Edge relationships", health.graphCompleteness.edgeCount],
                ["Relationship density",   `${(health.graphCompleteness.nodeCount > 0 ? (health.graphCompleteness.edgeCount / health.graphCompleteness.nodeCount).toFixed(2) : 0)} Edges / Node`],
              ]}
            />
            <DetailCard
              icon={Database}
              title="Data Ingestion & Imports"
              rows={[
                ["Integrations configured", health.connectorHealth.total],
                ["Total Memory Records",    health.importHistoryStats.totalImports],
                ["Last import timestamp",   new Date(health.importHistoryStats.lastSuccessfulImport).toLocaleString()],
              ]}
            />
          </div>
        </>
      )}

      {!health && !loading && (
        <div style={{ textAlign: "center", color: "var(--t5)", fontSize: 12, padding: "48px 0" }}>
          Unable to load workspace health data. Ensure the workspace is correctly provisioned.
        </div>
      )}
    </div>
  );
};

export default WorkspaceHealth;
