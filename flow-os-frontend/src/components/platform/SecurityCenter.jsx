import { useState, useEffect, useCallback } from "react";
import { ShieldAlert, AlertTriangle, EyeOff, FileKey, Terminal, CheckCircle2, XCircle, Clock, RefreshCw } from "lucide-react";
import SourceBadge from "../ui/SourceBadge";
import DataSourceBadge from "../ui/DataSourceBadge";
import { EmptyState } from "../ui/EmptyState";
import { useWebSocket } from "../../hooks/useWebSocket";

/**
 * SecurityCenter — was a fully-static mock. Now the "Recent Security Events" feed
 * and the headline counters are driven by the real governance audit log:
 *   GET /api/connectors/audit → { events: [{ action, resource, metadata:{connectorId,
 *       actionType, outcome, reason}, createdAt, userId, ip }] }
 * Outcomes (success / denied / approval_required / failure) are genuinely
 * security-relevant. Active Defenses stay static — they describe real product
 * guarantees (privacy gate, PII redaction, secret scanning), not live metrics.
 */
const OUTCOME_META = {
  denied:            { icon: XCircle,      color: "var(--p-critical)", bg: "rgba(255,87,87,0.05)",  border: "rgba(255,87,87,0.20)",  label: "Denied" },
  approval_required: { icon: Clock,        color: "var(--p-high)",     bg: "rgba(255,151,65,0.05)", border: "rgba(255,151,65,0.20)", label: "Approval required" },
  failure:           { icon: AlertTriangle,color: "var(--p-high)",     bg: "rgba(255,151,65,0.05)", border: "rgba(255,151,65,0.20)", label: "Failed" },
  success:           { icon: CheckCircle2, color: "var(--p-normal)",   bg: "rgba(31,27,22,0.04)",border: "var(--border)",         label: "Allowed" },
};

const DEMO_EVENTS = [
  { id: "s1", metadata: { connectorId: "github", actionType: "merge", outcome: "approval_required", reason: "MEMBER role requires approval to merge to protected branch" }, resource: "connector:github", userId: "david.o", createdAt: new Date(Date.now() - 6e5).toISOString() },
  { id: "s2", metadata: { connectorId: "gmail", actionType: "send", outcome: "denied", reason: "Policy: external email blocked for this workspace tier" }, resource: "connector:gmail", userId: "sarah.chen", createdAt: new Date(Date.now() - 36e5).toISOString() },
  { id: "s3", metadata: { connectorId: "jira", actionType: "create", outcome: "success" }, resource: "connector:jira", userId: "priya.n", createdAt: new Date(Date.now() - 108e5).toISOString() },
];

const EnabledBadge = () => (
  <span style={{ fontSize: 9, fontWeight: 500, color: "var(--p-normal-text)", background: "rgba(76,175,130,0.08)", border: "1px solid rgba(76,175,130,0.22)", padding: "2px 8px", borderRadius: 3, textTransform: "uppercase" }}>Enabled</span>
);

function relTime(ts) {
  const m = Math.round((Date.now() - new Date(ts).getTime()) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

const SecurityCenter = () => {
  const { token, workspaceId, isAuthLoading } = useWebSocket();
  const [state, setState] = useState({ loading: true, events: [], demo: false });

  const load = useCallback(async () => {
    setState(s => ({ ...s, loading: true }));
    if (!token || !workspaceId) { setState({ loading: false, events: DEMO_EVENTS, demo: true }); return; }
    try {
      const res = await fetch("/api/connectors/audit?limit=50", {
        headers: { Authorization: `Bearer ${token}`, "workspace-id": workspaceId },
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      const events = data.events || [];
      if (!events.length) setState({ loading: false, events: DEMO_EVENTS, demo: true });
      else setState({ loading: false, events, demo: false });
    } catch {
      setState({ loading: false, events: DEMO_EVENTS, demo: true });
    }
  }, [token, workspaceId]);

  useEffect(() => { if (!isAuthLoading) load(); }, [isAuthLoading, load]);

  const outcomeOf = (e) => e.metadata?.outcome || "success";
  const deniedCount   = state.events.filter(e => outcomeOf(e) === "denied").length;
  const approvalCount = state.events.filter(e => outcomeOf(e) === "approval_required").length;
  const allowedCount  = state.events.filter(e => outcomeOf(e) === "success").length;

  const STATS = [
    { label: "Actions Denied",      value: deniedCount,   color: "var(--p-critical-text)" },
    { label: "Approvals Required",  value: approvalCount, color: "var(--p-high-text)" },
    { label: "Actions Allowed",     value: allowedCount,  color: "var(--p-normal-text)" },
    { label: "Governed Actions",    value: state.events.length, color: "var(--p-info-text)" },
  ];

  return (
    <div style={{ padding: "24px", display: "flex", flexDirection: "column", gap: 24 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 500, color: "var(--t1)", letterSpacing: "-0.4px", display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
            <ShieldAlert style={{ width: 22, height: 22, color: "var(--p-critical)" }} />
            Security Center
            <DataSourceBadge mode={state.demo ? "demo" : "live"} />
          </h1>
          <p style={{ fontSize: 12, color: "var(--t4)", maxWidth: 520 }}>
            Governance decisions across every connector — allowed, denied, and approval-gated actions from the audit log.
          </p>
        </div>
        <button onClick={load} style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 4, background: "rgba(31,27,22,0.045)", border: "1px solid var(--border)", color: "var(--t3)", fontSize: 11, fontWeight: 500, cursor: "pointer", flexShrink: 0 }}>
          <RefreshCw style={{ width: 11, height: 11 }} /> Refresh
        </button>
      </div>

      {/* Stat cards (derived from real audit outcomes) */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 14 }}>
        {STATS.map(({ label, value, color }) => (
          <div key={label} style={{ background: "var(--bg-card)", border: "1px solid var(--border-strong)", borderRadius: 4, padding: "16px 18px", display: "flex", flexDirection: "column", gap: 6, borderBottom: `2px solid ${color}` }}>
            <span style={{ fontSize: 26, fontWeight: 500, color, lineHeight: 1 }}>{value}</span>
            <span style={{ fontSize: 9, fontWeight: 500, color: "var(--t5)", textTransform: "uppercase", letterSpacing: "0.10em" }}>{label}</span>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 14 }}>
        {/* Events log — real audit data */}
        <div style={{ background: "var(--bg-card)", border: "1px solid var(--border-strong)", borderRadius: 4, padding: "20px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid var(--border)", paddingBottom: 10, marginBottom: 16 }}>
            <h2 style={{ fontSize: 9, fontWeight: 500, color: "var(--t1)", textTransform: "uppercase", letterSpacing: "0.10em" }}>Recent Security Events</h2>
          </div>

          {state.loading ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {[0, 1, 2].map(i => (
                <div key={i} style={{ height: 56, borderRadius: 4, background: "rgba(31,27,22,0.04)", border: "1px solid var(--border)", position: "relative", overflow: "hidden" }}>
                  <div style={{ position: "absolute", inset: 0, background: "linear-gradient(90deg, transparent 0%, rgba(31,27,22,0.05) 50%, transparent 100%)", animation: "shimmer-sweep 1.6s ease-in-out infinite" }} />
                </div>
              ))}
            </div>
          ) : state.events.length === 0 ? (
            <EmptyState variant="activity" message="No governed actions yet" description="Connector actions and their governance decisions will appear here." />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {state.events.map(e => {
                const outcome = outcomeOf(e);
                const m = OUTCOME_META[outcome] || OUTCOME_META.success;
                const Icon = m.icon;
                const connectorId = e.metadata?.connectorId || (e.resource || "").replace("connector:", "");
                const actionType = e.metadata?.actionType || (e.action || "").replace("connector.", "");
                return (
                  <div key={e.id} style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "12px 14px", background: m.bg, border: `1px solid ${m.border}`, borderRadius: 4 }}>
                    <Icon style={{ width: 15, height: 15, color: m.color, flexShrink: 0, marginTop: 2 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 4 }}>
                        <span style={{ fontSize: 12, fontWeight: 500, color: "var(--t1)", textTransform: "capitalize" }}>
                          {actionType} · <span style={{ color: m.color }}>{m.label}</span>
                        </span>
                        <span style={{ fontSize: 9, color: "var(--t5)", flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>{relTime(e.createdAt)}</span>
                      </div>
                      {e.metadata?.reason && (
                        <p style={{ fontSize: 11, color: "var(--t4)", lineHeight: 1.5, marginBottom: 8 }}>{e.metadata.reason}</p>
                      )}
                      <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                        {connectorId && <SourceBadge source={connectorId} />}
                        {e.userId && <span style={{ fontSize: 9, color: "var(--t5)", background: "rgba(31,27,22,0.045)", border: "1px solid var(--border)", padding: "1px 6px", borderRadius: 3 }}>{e.userId}</span>}
                        {e.ip && <span style={{ fontSize: 9, color: "var(--t5)", background: "rgba(31,27,22,0.045)", border: "1px solid var(--border)", padding: "1px 6px", borderRadius: 3 }}>{e.ip}</span>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Active defenses — real product guarantees (static) */}
        <div style={{ background: "var(--bg-card)", border: "1px solid var(--border-strong)", borderRadius: 4, padding: "20px" }}>
          <h2 style={{ fontSize: 9, fontWeight: 500, color: "var(--t1)", textTransform: "uppercase", letterSpacing: "0.10em", borderBottom: "1px solid var(--border)", paddingBottom: 10, marginBottom: 18 }}>Active Defenses</h2>
          <div style={{ display: "flex", flexDirection: "column" }}>
            {[
              { icon: Terminal, label: "Privacy Gate" },
              { icon: EyeOff,   label: "PII Redaction" },
              { icon: FileKey,  label: "Secret Scanning" },
            ].map(({ icon: Icon, label }, i) => (
              <div key={label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: i === 0 ? 0 : 14, marginTop: i === 0 ? 0 : 14, borderTop: i === 0 ? "none" : "1px solid var(--border)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <Icon style={{ width: 14, height: 14, color: "var(--brand)" }} />
                  <span style={{ fontSize: 12, fontWeight: 500, color: "var(--t1)" }}>{label}</span>
                </div>
                <EnabledBadge />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SecurityCenter;
