/**
 * Platform Console (Program 5 — Admin Experience)
 *
 * Full admin view: org stats, AI usage, connector health, storage,
 * pending approvals, recent activity, health summary.
 * Reads from: /api/org, /api/org/workspaces, /api/connectors/health,
 * /api/approvals, /api/ai/metrics, /api/intelligence/health-score,
 * /api/notifications.
 */

import { useState, useEffect, useCallback } from "react";
import {
  Building, Users, Server, Link2, RefreshCw, Plus, Brain, Shield,
  Activity, AlertTriangle, CheckCircle, Clock, Database, TrendingUp,
  Zap, Bell, ChevronRight, Circle, BarChart3, HardDrive, Cpu, GitBranch,
} from "lucide-react";
import { useWebSocket } from "../../hooks/useWebSocket";

/* ─── small helpers ─────────────────────────────────────────── */

function sh(x) { return x; }

const pill = (color, bg, label) => (
  <span style={{ fontSize: 9, fontWeight: 500, padding: "2px 7px", borderRadius: 3, color, background: bg, border: `1px solid ${color}30`, textTransform: "uppercase", letterSpacing: "0.06em" }}>
    {label}
  </span>
);

const healthPill = (status) => {
  const map = {
    healthy: { c: "var(--p-normal-text)", b: "var(--p-normal)" },
    degraded: { c: "var(--p-high-text)", b: "var(--p-high)" },
    down: { c: "var(--p-critical-text)", b: "var(--p-critical)" },
  };
  const { c, b } = map[status?.toLowerCase()] || { c: "var(--t5)", b: "rgba(31,27,22,0.06)" };
  return pill(c, b, status || "unknown");
};

function SectionHeader({ title, sub, action }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, paddingBottom: 10, borderBottom: "1px solid var(--border)" }}>
      <div>
        <h2 style={{ fontSize: 9, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.10em", color: "var(--t5)", margin: 0 }}>{title}</h2>
        {sub && <p style={{ fontSize: 10, color: "var(--t5)", margin: "2px 0 0" }}>{sub}</p>}
      </div>
      {action}
    </div>
  );
}

function Shimmer({ h = 40, r = 4 }) {
  return (
    <div style={{ height: h, borderRadius: r, background: "rgba(31,27,22,0.04)", border: "1px solid var(--border)", position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(90deg, transparent 0%, rgba(31,27,22,0.05) 50%, transparent 100%)", animation: "shimmer-sweep 1.6s ease-in-out infinite" }} />
    </div>
  );
}

function KpiCard({ icon: Icon, label, value, delta, color, loading }) {
  return (
    <div style={{ background: "var(--bg-card)", border: "1px solid var(--border-strong)", borderRadius: 5, padding: "16px 18px", display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Icon style={{ width: 14, height: 14, color }} />
        {delta && <span style={{ fontSize: 9, fontWeight: 500, color: delta > 0 ? "var(--p-normal-text)" : "var(--p-critical-text)" }}>{delta > 0 ? "+" : ""}{delta}%</span>}
      </div>
      {loading ? <Shimmer h={36} r={3} /> : (
        <>
          <span style={{ fontSize: 28, fontWeight: 500, color: "var(--t1)", lineHeight: 1 }}>{value}</span>
          <span style={{ fontSize: 9, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.10em", color: "var(--t5)" }}>{label}</span>
        </>
      )}
    </div>
  );
}

function UsageBar({ label, used, total, color }) {
  const pct = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0;
  const warn = pct > 80;
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
        <span style={{ fontSize: 11, color: "var(--t3)" }}>{label}</span>
        <span style={{ fontSize: 11, color: warn ? "var(--p-high-text)" : "var(--t4)" }}>{used.toLocaleString()} / {total.toLocaleString()}</span>
      </div>
      <div style={{ height: 4, background: "rgba(31,27,22,0.08)", borderRadius: 2, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: warn ? "var(--p-high)" : color, borderRadius: 2, transition: "width 300ms" }} />
      </div>
      <p style={{ fontSize: 10, color: warn ? "var(--p-high-text)" : "var(--t5)", marginTop: 3 }}>{pct}% used</p>
    </div>
  );
}

/* ─── main component ─────────────────────────────────────────── */

export default function EnterpriseAdmin() {
  const { token, workspaceId } = useWebSocket();
  const [org, setOrg] = useState(null);
  const [workspaces, setWorkspaces] = useState([]);
  const [connectors, setConnectors] = useState([]);
  const [approvals, setApprovals] = useState([]);
  const [aiMetrics, setAiMetrics] = useState(null);
  const [healthScore, setHealthScore] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showNewWs, setShowNewWs] = useState(false);
  const [newWsName, setNewWsName] = useState("");
  const [creating, setCreating] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");

  const hdrs = (extra = {}) => token ? {
    Authorization: `Bearer ${token}`,
    "workspace-id": workspaceId || "temp",
    "Content-Type": "application/json",
    ...extra,
  } : {};

  const fetchAll = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    const safe = async (fn) => { try { return await fn(); } catch { return null; } };
    const [orgR, wsR, cR, aR, nR] = await Promise.all([
      safe(() => fetch("/api/org", { headers: hdrs() }).then(r => r.ok ? r.json() : null)),
      safe(() => fetch("/api/org/workspaces", { headers: hdrs() }).then(r => r.ok ? r.json() : [])),
      safe(() => fetch("/api/connectors/health", { headers: hdrs() }).then(r => r.ok ? r.json() : [])),
      safe(() => fetch("/api/approvals?limit=5", { headers: hdrs() }).then(r => r.ok ? r.json() : [])),
      safe(() => fetch("/api/notifications?limit=6&unread=true", { headers: hdrs() }).then(r => r.ok ? r.json() : [])),
    ]);
    const [aiR, hsR] = await Promise.all([
      safe(() => fetch("/api/ai/metrics", { headers: hdrs() }).then(r => r.ok ? r.json() : null)),
      safe(() => fetch("/api/intelligence/health-score", { headers: hdrs() }).then(r => r.ok ? r.json() : null)),
    ]);
    setOrg(orgR);
    setWorkspaces(wsR || []);
    setConnectors(Array.isArray(cR) ? cR : (cR?.connectors || []));
    setApprovals(Array.isArray(aR) ? aR : (aR?.approvals || []));
    setNotifications(Array.isArray(nR) ? nR : (nR?.notifications || []));
    setAiMetrics(aiR);
    setHealthScore(hsR);
    setLoading(false);
  }, [token, workspaceId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const handleCreateWorkspace = async (e) => {
    e.preventDefault();
    if (!newWsName.trim()) return;
    setCreating(true);
    try {
      const r = await fetch("/api/org/workspaces", { method: "POST", headers: hdrs(), body: JSON.stringify({ name: newWsName.trim() }) });
      if (r.ok) { const ws = await r.json(); setWorkspaces(p => [...p, ws]); setShowNewWs(false); setNewWsName(""); }
    } catch {}
    setCreating(false);
  };

  const score = healthScore?.overallScore ?? healthScore?.score ?? null;
  const plan = org?.plan ?? "FREE";
  const usersCount = org?._count?.users ?? org?.users?.length ?? "—";

  const connHealthy = connectors.filter(c => c.health?.status?.toLowerCase() === "healthy" || c.status?.toLowerCase() === "healthy").length;
  const connTotal = connectors.length;

  const TABS = [
    { id: "overview",     label: "Overview" },
    { id: "usage",        label: "Usage & Limits" },
    { id: "connectors",   label: "Connectors" },
    { id: "approvals",    label: "Approvals" },
    { id: "activity",     label: "Activity" },
  ];

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* ── Page header ─────────────────────────────────────────── */}
      <div style={{ padding: "18px 24px 12px", borderBottom: "1px solid var(--border)", background: "var(--bg-sidebar)", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <Server style={{ width: 16, height: 16, color: "var(--brand)" }} />
              <h1 style={{ fontSize: 16, fontWeight: 600, color: "var(--t1)", letterSpacing: "-0.3px", margin: 0 }}>Platform Console</h1>
              {plan && <span style={{ fontSize: 9, fontWeight: 600, padding: "2px 6px", borderRadius: 3, background: "rgba(232,103,43,0.10)", color: "var(--brand-text)", border: "1px solid var(--brand-line)", textTransform: "uppercase" }}>{plan}</span>}
            </div>
            <p style={{ fontSize: 12, color: "var(--t4)", margin: 0 }}>
              {loading ? "Loading…" : `${org?.name || "Your organization"} · ${workspaces.length} workspace${workspaces.length !== 1 ? "s" : ""} · ${usersCount} user${usersCount !== 1 ? "s" : ""}`}
            </p>
          </div>
          <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
            <button onClick={fetchAll} style={ghostBtn}><RefreshCw style={{ width: 11, height: 11 }} /> Refresh</button>
            <button onClick={() => setShowNewWs(true)} style={primaryBtn}><Plus style={{ width: 12, height: 12 }} /> New Workspace</button>
          </div>
        </div>

        {/* Tab bar */}
        <div style={{ display: "flex", gap: 2, marginTop: 14 }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id)} style={{
              padding: "5px 12px", fontSize: 11, fontWeight: activeTab === t.id ? 600 : 400,
              borderRadius: "4px 4px 0 0", border: "none", cursor: "pointer",
              background: activeTab === t.id ? "var(--bg-base)" : "transparent",
              color: activeTab === t.id ? "var(--t1)" : "var(--t4)",
              borderBottom: activeTab === t.id ? "2px solid var(--brand)" : "2px solid transparent",
            }}>
              {t.label}
              {t.id === "approvals" && approvals.length > 0 && (
                <span style={{ marginLeft: 5, fontSize: 9, fontWeight: 600, padding: "1px 5px", borderRadius: 3, background: "var(--p-critical)", color: "var(--p-critical-text)" }}>{approvals.length}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ── Scrollable content ────────────────────────────────────── */}
      <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px 40px" }}>

        {/* OVERVIEW TAB */}
        {activeTab === "overview" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {/* KPI row */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12 }}>
              <KpiCard icon={Building}   label="Workspaces" value={loading ? "—" : workspaces.length} color="var(--brand-text)" loading={loading} />
              <KpiCard icon={Users}      label="Users"      value={loading ? "—" : usersCount}        color="var(--p-info-text)" loading={loading} />
              <KpiCard icon={Link2}      label={`Connectors (${connHealthy}/${connTotal} healthy)`} value={loading ? "—" : connTotal} color="var(--p-normal-text)" loading={loading} />
              <KpiCard icon={TrendingUp} label="Health Score" value={loading ? "—" : (score !== null ? `${score}` : "—")} color={score >= 70 ? "var(--p-normal-text)" : "var(--p-high-text)"} loading={loading} />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              {/* Workspace directory */}
              <div style={{ background: "var(--bg-card)", border: "1px solid var(--border-strong)", borderRadius: 5, padding: "18px" }}>
                <SectionHeader title="Workspace Directory" sub={`${workspaces.length} active`}
                  action={<span style={{ fontSize: 9, color: "var(--t5)" }}>Click to copy ID</span>}
                />
                {loading ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>{[1,2,3].map(i => <Shimmer key={i} h={44} />)}</div>
                ) : workspaces.length === 0 ? (
                  <EmptyRow icon={Building} message="No workspaces yet" action="Create one using the button above" />
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {workspaces.map(ws => (
                      <WorkspaceRow key={ws.id} ws={ws} />
                    ))}
                  </div>
                )}
              </div>

              {/* Health & AI summary */}
              <div style={{ background: "var(--bg-card)", border: "1px solid var(--border-strong)", borderRadius: 5, padding: "18px" }}>
                <SectionHeader title="Health Summary" />
                {loading ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>{[1,2,3,4].map(i => <Shimmer key={i} h={34} />)}</div>
                ) : (
                  <div>
                    {/* Score meter */}
                    {score !== null && (
                      <div style={{ marginBottom: 16, padding: "14px", background: "rgba(31,27,22,0.04)", borderRadius: 5, border: "1px solid var(--border)" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                          <span style={{ fontSize: 12, fontWeight: 500, color: "var(--t2)" }}>Overall Health</span>
                          <span style={{ fontSize: 22, fontWeight: 600, color: score >= 70 ? "var(--p-normal-text)" : "var(--p-high-text)" }}>{score}<span style={{ fontSize: 12, fontWeight: 400, color: "var(--t4)" }}>/100</span></span>
                        </div>
                        <div style={{ height: 6, background: "rgba(31,27,22,0.08)", borderRadius: 3, overflow: "hidden" }}>
                          <div style={{ height: "100%", width: `${score}%`, background: score >= 70 ? "var(--p-normal-text)" : "var(--p-high-text)", borderRadius: 3, transition: "width 600ms" }} />
                        </div>
                      </div>
                    )}
                    {/* AI summary */}
                    {aiMetrics && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                        {[
                          { label: "AI requests (24h)", value: aiMetrics.requestsToday ?? aiMetrics.total_requests_24h ?? "—" },
                          { label: "Success rate", value: aiMetrics.successRate ? `${Math.round(aiMetrics.successRate * 100)}%` : "—" },
                          { label: "Avg latency", value: aiMetrics.avgLatencyMs ? `${Math.round(aiMetrics.avgLatencyMs)}ms` : "—" },
                          { label: "Tokens used (24h)", value: aiMetrics.tokensToday ? aiMetrics.tokensToday.toLocaleString() : "—" },
                        ].map((row, i, arr) => (
                          <div key={row.label} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: i < arr.length - 1 ? "1px solid var(--border)" : "none" }}>
                            <span style={{ fontSize: 11, color: "var(--t4)" }}>{row.label}</span>
                            <span style={{ fontSize: 11, fontWeight: 500, color: "var(--t1)" }}>{row.value}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {!aiMetrics && score === null && (
                      <EmptyRow icon={Activity} message="No telemetry yet" action="Data appears after first activity" />
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Connector health row */}
            <div style={{ background: "var(--bg-card)", border: "1px solid var(--border-strong)", borderRadius: 5, padding: "18px" }}>
              <SectionHeader title="Connector Status" sub="Live health across all registered integrations" />
              {loading ? (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10 }}>{[1,2,3,4].map(i => <Shimmer key={i} h={70} />)}</div>
              ) : connectors.length === 0 ? (
                <EmptyRow icon={Link2} message="No connectors registered" action="Connect integrations from the Integrations page" />
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 10 }}>
                  {connectors.map(c => (
                    <ConnectorCard key={c.id || c.connectorId || c.name} connector={c} />
                  ))}
                </div>
              )}
            </div>

            {/* Recent notifications */}
            {notifications.length > 0 && (
              <div style={{ background: "var(--bg-card)", border: "1px solid var(--border-strong)", borderRadius: 5, padding: "18px" }}>
                <SectionHeader title="Recent Notifications" sub="Unread items across the workspace" />
                <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                  {notifications.slice(0, 5).map((n, i) => (
                    <div key={n.id || i} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 0", borderBottom: i < notifications.length - 1 ? "1px solid var(--border)" : "none" }}>
                      <Bell style={{ width: 12, height: 12, color: "var(--brand)", marginTop: 2, flexShrink: 0 }} />
                      <div style={{ minWidth: 0 }}>
                        <p style={{ fontSize: 12, fontWeight: 500, color: "var(--t1)", margin: "0 0 1px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{n.title || n.message || "Notification"}</p>
                        <p style={{ fontSize: 10, color: "var(--t5)", margin: 0 }}>{n.body || n.description || ""}</p>
                      </div>
                      <span style={{ fontSize: 10, color: "var(--t5)", flexShrink: 0, marginLeft: "auto" }}>{n.createdAt ? timeAgo(n.createdAt) : ""}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* USAGE TAB */}
        {activeTab === "usage" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div style={{ background: "var(--bg-card)", border: "1px solid var(--border-strong)", borderRadius: 5, padding: "18px" }}>
              <SectionHeader title="AI Usage" icon={Brain} />
              {aiMetrics ? (
                <>
                  <UsageBar label="AI Requests (monthly)" used={aiMetrics.requestsMonth ?? 0} total={aiMetrics.requestLimit ?? 10000} color="var(--brand-text)" />
                  <UsageBar label="Tokens consumed" used={aiMetrics.tokensMonth ?? 0} total={aiMetrics.tokenLimit ?? 5000000} color="var(--p-info-text)" />
                  <UsageBar label="Concurrent slots" used={aiMetrics.activeRequests ?? 0} total={aiMetrics.concurrencyLimit ?? 10} color="var(--p-normal-text)" />
                </>
              ) : (
                <EmptyRow icon={Brain} message="AI metrics unavailable" action="Ensure the AI platform is running" />
              )}
            </div>

            <div style={{ background: "var(--bg-card)", border: "1px solid var(--border-strong)", borderRadius: 5, padding: "18px" }}>
              <SectionHeader title="Platform Usage" icon={HardDrive} />
              <UsageBar label="Workspaces" used={workspaces.length} total={planLimit(plan, "workspaces")} color="var(--brand-text)" />
              <UsageBar label="Users (org-wide)" used={Number(usersCount) || 0} total={planLimit(plan, "users")} color="var(--p-info-text)" />
              <UsageBar label="Connected integrations" used={connectors.length} total={planLimit(plan, "connectors")} color="var(--p-normal-text)" />
            </div>

            <div style={{ background: "var(--bg-card)", border: "1px solid var(--border-strong)", borderRadius: 5, padding: "18px" }}>
              <SectionHeader title="Storage" icon={Database} />
              {aiMetrics?.storageUsedMb != null ? (
                <UsageBar label="Vector store" used={aiMetrics.storageUsedMb} total={aiMetrics.storageLimitMb ?? 10240} color="var(--brand-text)" />
              ) : (
                <EmptyRow icon={Database} message="Storage metrics unavailable" action="Connect database observability" />
              )}
            </div>

            <div style={{ background: "var(--bg-card)", border: "1px solid var(--border-strong)", borderRadius: 5, padding: "18px" }}>
              <SectionHeader title="Plan Details" icon={Zap} />
              <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                {[
                  { label: "Current plan", value: plan },
                  { label: "Workspaces limit", value: planLimit(plan, "workspaces") },
                  { label: "User limit",       value: planLimit(plan, "users") },
                  { label: "Connector limit",  value: planLimit(plan, "connectors") },
                  { label: "AI request limit", value: `${(planLimit(plan, "ai") / 1000).toFixed(0)}k / month` },
                ].map((row, i, arr) => (
                  <div key={row.label} style={{ display: "flex", justifyContent: "space-between", padding: "9px 0", borderBottom: i < arr.length - 1 ? "1px solid var(--border)" : "none" }}>
                    <span style={{ fontSize: 11, color: "var(--t4)" }}>{row.label}</span>
                    <span style={{ fontSize: 11, fontWeight: 500, color: "var(--t1)" }}>{row.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* CONNECTORS TAB */}
        {activeTab === "connectors" && (
          <div style={{ background: "var(--bg-card)", border: "1px solid var(--border-strong)", borderRadius: 5, padding: "18px" }}>
            <SectionHeader title="All Connectors" sub={`${connHealthy} healthy · ${connTotal - connHealthy} need attention`} />
            {loading ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>{[1,2,3,4,5].map(i => <Shimmer key={i} h={54} />)}</div>
            ) : connectors.length === 0 ? (
              <EmptyRow icon={Link2} message="No connectors registered" action="Connect your first tool from the Integrations page" />
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    {["Connector", "Provider", "Status", "Latency", "Last seen"].map(h => (
                      <th key={h} style={{ textAlign: "left", fontSize: 9, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--t5)", padding: "0 0 10px", borderBottom: "1px solid var(--border)" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {connectors.map((c, i) => (
                    <tr key={c.id || i}>
                      <td style={td}><span style={{ fontSize: 12, fontWeight: 500, color: "var(--t1)" }}>{c.name || c.connectorId || c.id}</span></td>
                      <td style={td}><span style={{ fontSize: 11, color: "var(--t4)" }}>{c.provider || "—"}</span></td>
                      <td style={td}>{healthPill(c.health?.status || c.status || "unknown")}</td>
                      <td style={td}><span style={{ fontSize: 11, color: "var(--t3)", fontFamily: "'IBM Plex Mono', monospace" }}>{c.health?.latencyMs ? `${c.health.latencyMs}ms` : "—"}</span></td>
                      <td style={td}><span style={{ fontSize: 11, color: "var(--t5)" }}>{c.health?.checkedAt ? timeAgo(c.health.checkedAt) : "—"}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* APPROVALS TAB */}
        {activeTab === "approvals" && (
          <div style={{ background: "var(--bg-card)", border: "1px solid var(--border-strong)", borderRadius: 5, padding: "18px" }}>
            <SectionHeader title="Pending Approvals" sub="Actions awaiting ADMIN or OWNER approval" />
            {loading ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>{[1,2,3].map(i => <Shimmer key={i} h={64} />)}</div>
            ) : approvals.length === 0 ? (
              <EmptyRow icon={CheckCircle} message="No pending approvals" action="All governed actions have been reviewed" />
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {approvals.map((a, i) => (
                  <div key={a.id || i} style={{ padding: "12px 14px", background: "rgba(31,27,22,0.03)", border: "1px solid var(--border)", borderRadius: 5 }}>
                    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                      <div>
                        <p style={{ fontSize: 12, fontWeight: 500, color: "var(--t1)", margin: "0 0 3px" }}>{a.actionType || a.action || "Connector action"}</p>
                        <p style={{ fontSize: 11, color: "var(--t4)", margin: "0 0 6px" }}>{a.reason || a.description || "Requires approval to proceed"}</p>
                        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                          {a.riskLevel && pill(riskColor(a.riskLevel).c, riskColor(a.riskLevel).b, `${a.riskLevel} risk`)}
                          <span style={{ fontSize: 10, color: "var(--t5)" }}>Requested by {a.requestedBy || a.createdBy || "user"} · {a.createdAt ? timeAgo(a.createdAt) : ""}</span>
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                        <ApproveBtn approvalId={a.id} action="reject" token={token} workspaceId={workspaceId} onDone={fetchAll} />
                        <ApproveBtn approvalId={a.id} action="approve" token={token} workspaceId={workspaceId} onDone={fetchAll} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ACTIVITY TAB */}
        {activeTab === "activity" && (
          <div style={{ background: "var(--bg-card)", border: "1px solid var(--border-strong)", borderRadius: 5, padding: "18px" }}>
            <SectionHeader title="Recent Activity" sub="Platform-wide activity from all connectors and AI engines" />
            {notifications.length === 0 ? (
              <EmptyRow icon={Activity} message="No recent activity" action="Activity appears after your first connector action" />
            ) : (
              <div style={{ display: "flex", flexDirection: "column" }}>
                {notifications.map((n, i) => (
                  <div key={n.id || i} style={{ display: "flex", gap: 12, padding: "11px 0", borderBottom: i < notifications.length - 1 ? "1px solid var(--border)" : "none" }}>
                    <div style={{ width: 28, height: 28, borderRadius: "50%", background: "rgba(232,103,43,0.10)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <Bell style={{ width: 12, height: 12, color: "var(--brand)" }} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 12, fontWeight: 500, color: "var(--t1)", margin: "0 0 2px" }}>{n.title || n.message || "Activity"}</p>
                      <p style={{ fontSize: 11, color: "var(--t4)", margin: 0 }}>{n.body || n.description || ""}</p>
                    </div>
                    <span style={{ fontSize: 10, color: "var(--t5)", flexShrink: 0 }}>{n.createdAt ? timeAgo(n.createdAt) : ""}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* New workspace modal */}
      {showNewWs && (
        <div onClick={() => setShowNewWs(false)} style={{ position: "fixed", inset: 0, background: "rgba(31,27,22,0.35)", backdropFilter: "blur(8px)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <form onSubmit={handleCreateWorkspace} onClick={e => e.stopPropagation()}
            style={{ width: "100%", maxWidth: 380, background: "var(--bg-sidebar)", border: "1px solid var(--border-strong)", borderRadius: 6, padding: 24, display: "flex", flexDirection: "column", gap: 14, boxShadow: "0 16px 48px rgba(31,27,22,0.12)" }}>
            <h3 style={{ fontSize: 14, fontWeight: 600, color: "var(--t1)", margin: 0 }}>Create Workspace</h3>
            <div>
              <label style={{ display: "block", fontSize: 9, fontWeight: 600, color: "var(--t5)", textTransform: "uppercase", letterSpacing: "0.10em", marginBottom: 6 }}>Workspace Name</label>
              <input type="text" value={newWsName} onChange={e => setNewWsName(e.target.value)} placeholder="Engineering · Product · Finance" required
                style={{ width: "100%", background: "var(--bg-input)", border: "1px solid var(--border-strong)", borderRadius: 4, padding: "8px 10px", fontSize: 12, color: "var(--t1)", outline: "none", boxSizing: "border-box" }} />
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button type="button" onClick={() => setShowNewWs(false)} style={ghostBtn}>Cancel</button>
              <button type="submit" disabled={creating} style={{ ...primaryBtn, opacity: creating ? 0.6 : 1 }}>{creating ? "Creating…" : "Create"}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

/* ─── sub-components ─────────────────────────────────────────── */

function WorkspaceRow({ ws }) {
  const [h, setH] = useState(false);
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard?.writeText(ws.externalId || ws.id);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 11px", borderRadius: 4, border: `1px solid ${h ? "var(--border-strong)" : "var(--border)"}`, background: h ? "rgba(31,27,22,0.04)" : "rgba(31,27,22,0.025)", transition: "all 80ms", cursor: "pointer" }}
      onClick={copy}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
        <Building style={{ width: 12, height: 12, color: "var(--t5)", flexShrink: 0 }} />
        <div style={{ minWidth: 0 }}>
          <p style={{ fontSize: 12, fontWeight: 500, color: "var(--t1)", margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{ws.name}</p>
          <p style={{ fontSize: 9, color: "var(--t5)", margin: 0, fontFamily: "'IBM Plex Mono', monospace" }}>{ws.externalId || ws.id?.slice(0,16)}</p>
        </div>
      </div>
      <span style={{ fontSize: 9, color: "var(--t5)", flexShrink: 0, marginLeft: 8 }}>{copied ? "Copied!" : ""}</span>
    </div>
  );
}

function ConnectorCard({ connector: c }) {
  const status = c.health?.status || c.status || "unknown";
  const isHealthy = status.toLowerCase() === "healthy";
  return (
    <div style={{ padding: "10px 12px", background: "rgba(31,27,22,0.03)", border: "1px solid var(--border)", borderRadius: 5 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
        <span style={{ fontSize: 12, fontWeight: 500, color: "var(--t1)" }}>{c.name || c.connectorId || c.id}</span>
        <Circle style={{ width: 7, height: 7, fill: isHealthy ? "var(--p-normal-text)" : "var(--p-critical-text)", color: isHealthy ? "var(--p-normal-text)" : "var(--p-critical-text)" }} />
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        {healthPill(status)}
        {c.health?.latencyMs && <span style={{ fontSize: 9, color: "var(--t5)", fontFamily: "'IBM Plex Mono', monospace" }}>{c.health.latencyMs}ms</span>}
      </div>
    </div>
  );
}

function EmptyRow({ icon: Icon, message, action }) {
  return (
    <div style={{ textAlign: "center", padding: "28px 0", display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
      <Icon style={{ width: 24, height: 24, color: "var(--t5)" }} />
      <p style={{ fontSize: 12, fontWeight: 500, color: "var(--t3)", margin: 0 }}>{message}</p>
      <p style={{ fontSize: 11, color: "var(--t5)", margin: 0 }}>{action}</p>
    </div>
  );
}

function ApproveBtn({ approvalId, action, token, workspaceId, onDone }) {
  const [loading, setLoading] = useState(false);
  const isApprove = action === "approve";
  const handle = async () => {
    setLoading(true);
    try {
      await fetch(`/api/approvals/${approvalId}/${action}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "workspace-id": workspaceId, "Content-Type": "application/json" },
        body: JSON.stringify({ reason: isApprove ? "Approved via admin console" : "Rejected via admin console" }),
      });
      onDone();
    } catch {}
    setLoading(false);
  };
  return (
    <button onClick={handle} disabled={loading} style={{
      padding: "5px 10px", fontSize: 11, fontWeight: 500, borderRadius: 4, cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.6 : 1, border: "1px solid",
      background: isApprove ? "var(--brand)" : "transparent",
      borderColor: isApprove ? "var(--brand)" : "var(--border-strong)",
      color: isApprove ? "#fff" : "var(--t3)",
    }}>
      {loading ? "…" : isApprove ? "Approve" : "Reject"}
    </button>
  );
}

/* ─── helpers ────────────────────────────────────────────────── */

function timeAgo(ts) {
  const s = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function planLimit(plan, resource) {
  const limits = {
    FREE:       { workspaces: 1, users: 5, connectors: 3, ai: 1000 },
    STARTER:    { workspaces: 3, users: 25, connectors: 10, ai: 10000 },
    PRO:        { workspaces: 10, users: 100, connectors: 25, ai: 100000 },
    ENTERPRISE: { workspaces: 999, users: 9999, connectors: 999, ai: 9999999 },
  };
  return (limits[plan?.toUpperCase()] || limits.FREE)[resource] ?? "—";
}

function riskColor(level) {
  const map = {
    low: { c: "var(--p-normal-text)", b: "var(--p-normal)" },
    medium: { c: "var(--p-high-text)", b: "var(--p-high)" },
    high: { c: "var(--p-critical-text)", b: "var(--p-critical)" },
    critical: { c: "var(--p-critical-text)", b: "var(--p-critical)" },
  };
  return map[level?.toLowerCase()] || { c: "var(--t5)", b: "rgba(31,27,22,0.06)" };
}

const td = { padding: "10px 0", borderBottom: "1px solid var(--border)", paddingRight: 16, verticalAlign: "middle" };

const ghostBtn = {
  display: "inline-flex", alignItems: "center", gap: 5, padding: "6px 10px",
  fontSize: 11, fontWeight: 500, borderRadius: 4, cursor: "pointer",
  border: "1px solid var(--border-strong)", background: "transparent", color: "var(--t3)",
};

const primaryBtn = {
  display: "inline-flex", alignItems: "center", gap: 5, padding: "6px 12px",
  fontSize: 11, fontWeight: 600, borderRadius: 4, cursor: "pointer",
  border: "1px solid var(--brand)", background: "var(--brand)", color: "#fff",
};
