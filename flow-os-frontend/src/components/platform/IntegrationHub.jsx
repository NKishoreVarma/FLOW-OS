import { useState, useEffect, useCallback } from "react";
import {
  CheckCircle2, AlertTriangle, RefreshCw, Unplug, ExternalLink,
  History, ChevronDown, ChevronRight, Zap, ShieldCheck, Loader2,
  Webhook, Clock, Activity, XCircle, Link2
} from "lucide-react";
import { useWebSocket } from "../../hooks/useWebSocket";

// ── Connector definitions ─────────────────────────────────────────────────────

const CONNECTORS = [
  {
    id:               "github",
    name:             "GitHub",
    icon:             "⚙️",
    description:      "PR intelligence, commit history, deployment risk scores, CI pipeline status",
    category:         "Engineering",
    authModes:        ["oauth", "pat"],
    patLabel:         "Personal Access Token",
    patPlaceholder:   "ghp_...",
    docUrl:           "https://github.com/settings/tokens",
    webhookSupport:   true,
    syncIntervalLabel: "Every 15 min",
  },
  {
    id:               "slack",
    name:             "Slack",
    icon:             "💬",
    description:      "Channel messages, thread intelligence, AI-powered communication analysis",
    category:         "Communication",
    authModes:        ["oauth"],
    webhookSupport:   true,
    syncIntervalLabel: "Every 10 min",
  },
  {
    id:               "jira",
    name:             "Jira",
    icon:             "🎯",
    description:      "Issue tracking, sprint velocity, workflow automation, backlog intelligence",
    category:         "Work Management",
    authModes:        ["oauth", "apikey"],
    apiKeyFields:     [
      { key: "email",    label: "Jira Email",  placeholder: "you@company.com",           type: "email"    },
      { key: "apiToken", label: "API Token",   placeholder: "ATATT...",                   type: "password" },
      { key: "domain",   label: "Domain",      placeholder: "yourcompany.atlassian.net",  type: "text"     },
    ],
    webhookSupport:   true,
    syncIntervalLabel: "Every 20 min",
  },
  {
    id:               "notion",
    name:             "Notion",
    icon:             "📝",
    description:      "Knowledge base sync, document intelligence, page search and graph enrichment",
    category:         "Knowledge",
    authModes:        ["oauth", "apikey"],
    apiKeyFields:     [
      { key: "token", label: "Integration Token", placeholder: "secret_...", type: "password" },
    ],
    webhookSupport:   false,
    syncIntervalLabel: "Every 30 min",
  },
  {
    id:               "gmail",
    name:             "Gmail",
    icon:             "📧",
    description:      "Inbox sync, thread reading, AI-powered email intelligence, send and reply",
    category:         "Communication",
    authModes:        ["oauth"],
    googleUnified:    true,
    webhookSupport:   false,
    syncIntervalLabel: "Every 15 min",
  },
  {
    id:               "google-calendar",
    name:             "Google Calendar",
    icon:             "📅",
    description:      "Meeting intelligence, AI prep context, action item tracking, event sync",
    category:         "Meetings",
    authModes:        ["oauth"],
    googleUnified:    true,
    webhookSupport:   false,
    syncIntervalLabel: "Every 30 min",
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function pill(text, color, bg, border) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      fontSize: 10, fontWeight: 500, padding: "2px 8px",
      borderRadius: 99, color, background: bg,
      border: `1px solid ${border}`, letterSpacing: "0.03em",
    }}>
      <span style={{ width: 5, height: 5, borderRadius: "50%", background: color, flexShrink: 0 }} />
      {text}
    </span>
  );
}

function StatusPill({ connected, healthStatus }) {
  if (!connected)              return pill("Not connected", "var(--t5, #6b7280)",    "rgba(107,114,128,0.08)", "rgba(107,114,128,0.2)");
  if (healthStatus === "degraded") return pill("Degraded",   "#eab308",               "rgba(234,179,8,0.08)",  "rgba(234,179,8,0.25)");
  if (healthStatus === "error")    return pill("Error",       "#ef4444",               "rgba(239,68,68,0.08)",  "rgba(239,68,68,0.2)");
  return pill("Connected", "#22c55e", "rgba(34,197,94,0.08)", "rgba(34,197,94,0.25)");
}

function SyncStatusPill({ status }) {
  const map = {
    running:   ["Syncing",    "#3b82f6", "rgba(59,130,246,0.08)",  "rgba(59,130,246,0.25)"],
    completed: ["Synced",     "#22c55e", "rgba(34,197,94,0.08)",   "rgba(34,197,94,0.2)"],
    failed:    ["Failed",     "#ef4444", "rgba(239,68,68,0.08)",   "rgba(239,68,68,0.2)"],
    pending:   ["Pending",    "#eab308", "rgba(234,179,8,0.08)",   "rgba(234,179,8,0.2)"],
  };
  const [label, ...args] = map[status] || ["—", "var(--t5)", "transparent", "transparent"];
  return pill(label, ...args);
}

// ── Webhook panel ─────────────────────────────────────────────────────────────

function WebhookPanel({ connectorId, headers }) {
  const [info,    setInfo]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [secret,  setSecret]  = useState(null);
  const [working, setWorking] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    fetch(`/api/integrations-hub/${connectorId}/webhook`, { headers })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(d => setInfo(d.webhook))
      .catch(() => setInfo(null))
      .finally(() => setLoading(false));
  }, [connectorId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); }, [load]);

  const register = async () => {
    setWorking(true);
    const res = await fetch(`/api/integrations-hub/${connectorId}/webhook`, { method: "POST", headers });
    const d   = await res.json().catch(() => ({}));
    if (d.secret) setSecret(d.secret);
    load();
    setWorking(false);
  };

  const deactivate = async () => {
    if (!window.confirm("Deactivate this webhook?")) return;
    setWorking(true);
    await fetch(`/api/integrations-hub/${connectorId}/webhook`, { method: "DELETE", headers }).catch(() => {});
    load();
    setWorking(false);
  };

  return (
    <div style={{ marginTop: 10, padding: 12, background: "rgba(31,27,22,0.025)", borderRadius: 8, border: "1px solid var(--border, rgba(31,27,22,0.07))" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 500, color: "var(--t2, #9ca3af)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
          <Webhook size={12} /> Webhook
        </div>
        {loading
          ? <Loader2 size={12} style={{ animation: "flow-spin 1s linear infinite" }} />
          : info
          ? <button onClick={deactivate} disabled={working} style={{ fontSize: 10, padding: "2px 8px", borderRadius: 5, background: "rgba(239,68,68,0.08)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.2)", cursor: "pointer" }}>Deactivate</button>
          : <button onClick={register}   disabled={working} style={{ fontSize: 10, padding: "2px 8px", borderRadius: 5, background: "var(--brand, rgba(99,102,241,1))", color: "#fff", border: "none", cursor: "pointer" }}>{working ? "Registering…" : "Register"}</button>
        }
      </div>

      {info && (
        <>
          <div style={{ fontSize: 11, color: "var(--t2)", wordBreak: "break-all", marginBottom: 4 }}>{info.endpoint_url}</div>
          <div style={{ fontSize: 10, color: "var(--t3, #6b7280)" }}>
            Events: {(info.event_types || []).join(", ")}
            {info.event_count > 0 && <> · {info.event_count} received</>}
            {info.last_event_at && <> · Last {new Date(info.last_event_at).toLocaleDateString()}</>}
          </div>
          <div style={{ marginTop: 6 }}>
            <SyncStatusPill status={info.status === "active" ? "completed" : "pending"} />
          </div>
        </>
      )}

      {secret && (
        <div style={{ marginTop: 8, padding: 10, background: "rgba(234,179,8,0.07)", borderRadius: 6, border: "1px solid rgba(234,179,8,0.2)" }}>
          <div style={{ fontSize: 10, fontWeight: 500, color: "#eab308", marginBottom: 4 }}>⚠ Webhook secret — shown once, copy now</div>
          <code style={{ fontSize: 10, wordBreak: "break-all", color: "var(--t1, #f9fafb)", userSelect: "all" }}>{secret}</code>
        </div>
      )}
    </div>
  );
}

// ── Sync history panel ────────────────────────────────────────────────────────

function SyncHistoryPanel({ connectorId, headers }) {
  const [history, setHistory] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/integrations-hub/${connectorId}/sync/history?limit=8`, { headers })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(d => setHistory(d.history || []))
      .catch(() => setHistory([]))
      .finally(() => setLoading(false));
  }, [connectorId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return <div style={{ fontSize: 11, color: "var(--t3)", padding: "8px 0" }}>Loading history…</div>;
  if (!history.length) return <div style={{ fontSize: 11, color: "var(--t3)", padding: "8px 0" }}>No sync history yet.</div>;

  const colStyle = { fontSize: 11, color: "var(--t2, #9ca3af)" };
  const hdrStyle = { fontSize: 9, fontWeight: 500, color: "var(--t4, #6b7280)", textTransform: "uppercase", letterSpacing: "0.07em" };

  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 90px 70px 70px", gap: 8, padding: "0 0 6px", borderBottom: "1px solid var(--border, rgba(31,27,22,0.06))" }}>
        {["Started", "Status", "Items", "Duration"].map(h => <span key={h} style={hdrStyle}>{h}</span>)}
      </div>
      {history.map(r => {
        const dur = r.duration_ms ? `${(r.duration_ms / 1000).toFixed(1)}s` : "—";
        const ts  = r.started_at ? new Date(r.started_at).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";
        return (
          <div key={r.id} style={{ display: "grid", gridTemplateColumns: "1fr 90px 70px 70px", gap: 8, padding: "6px 0", borderBottom: "1px solid rgba(31,27,22,0.035)" }}>
            <span style={colStyle}>{ts}</span>
            <span><SyncStatusPill status={r.status} /></span>
            <span style={colStyle}>{r.items_synced ?? "—"}</span>
            <span style={colStyle}>{dur}</span>
          </div>
        );
      })}
    </div>
  );
}

// ── Connector card ────────────────────────────────────────────────────────────

function ConnectorCard({ connector, status, headers, onRefresh }) {
  const [expanded,   setExpanded]   = useState(false);
  const [showHist,   setShowHist]   = useState(false);
  const [formMode,   setFormMode]   = useState(null);  // 'pat' | 'apikey' | null
  const [formVals,   setFormVals]   = useState({});
  const [formErr,    setFormErr]    = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [syncing,    setSyncing]    = useState(false);

  const connected    = status?.connected;
  const healthStatus = status?.healthStatus;
  const stats        = status?.syncStats;

  const handleOAuth = async () => {
    if (connector.googleUnified) {
      const res = await fetch("/api/google/auth", { headers });
      if (res.ok) { const d = await res.json(); if (d.authUrl) window.open(d.authUrl, "_blank", "noopener"); }
      return;
    }
    const res = await fetch(`/api/integrations-hub/${connector.id}/auth`, { headers });
    if (res.ok) { const d = await res.json(); if (d.authUrl) window.open(d.authUrl, "_blank", "noopener"); }
  };

  const handleFormSubmit = async () => {
    setSubmitting(true); setFormErr(null);
    let ep;
    if (formMode === "pat")    ep = `/api/integrations-hub/github/pat`;
    if (formMode === "apikey" && connector.id === "notion") ep = `/api/integrations-hub/notion/token`;
    if (formMode === "apikey" && connector.id === "jira")   ep = `/api/integrations-hub/jira/token`;
    try {
      const res = await fetch(ep, { method: "POST", headers, body: JSON.stringify(formVals) });
      if (res.ok) { setFormMode(null); setFormVals({}); onRefresh(); }
      else { const d = await res.json().catch(() => ({})); setFormErr(d.message || "Connection failed"); }
    } catch { setFormErr("Network error — check your credentials"); }
    finally { setSubmitting(false); }
  };

  const handleSync = async () => {
    setSyncing(true);
    await fetch(`/api/integrations-hub/${connector.id}/sync`, { method: "POST", headers }).catch(() => {});
    setSyncing(false);
  };

  const handleDisconnect = async () => {
    if (!window.confirm(`Disconnect ${connector.name}? Sync history will be preserved.`)) return;
    const ep = connector.googleUnified ? "/api/google/disconnect" : `/api/integrations-hub/${connector.id}/disconnect`;
    await fetch(ep, { method: "POST", headers }).catch(() => {});
    onRefresh();
  };

  const borderColor = connected
    ? "rgba(99,102,241,0.22)"
    : "var(--border-strong, rgba(31,27,22,0.07))";

  return (
    <div style={{ background: "var(--bg-card, rgba(31,27,22,0.045))", border: `1px solid ${borderColor}`, borderRadius: 10, overflow: "hidden" }}>
      {/* Header row */}
      <div style={{ padding: "14px 16px", display: "flex", alignItems: "center", gap: 12, cursor: "pointer" }} onClick={() => setExpanded(e => !e)}>
        <span style={{ fontSize: 22 }}>{connector.icon}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
            <span style={{ fontSize: 13, fontWeight: 500, color: "var(--t1, #f9fafb)" }}>{connector.name}</span>
            <span style={{ fontSize: 9, color: "var(--t4, #6b7280)", padding: "1px 6px", borderRadius: 99, background: "rgba(31,27,22,0.06)", fontWeight: 500, letterSpacing: "0.04em", textTransform: "uppercase" }}>{connector.category}</span>
          </div>
          <p style={{ fontSize: 11, color: "var(--t4, #6b7280)", margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{connector.description}</p>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, flexShrink: 0 }}>
          <StatusPill connected={connected} healthStatus={healthStatus} />
          {connected && stats?.lastSyncAt && (
            <span style={{ fontSize: 9, color: "var(--t4)" }}>
              {new Date(stats.lastSyncAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
        </div>
        <span style={{ color: "var(--t4)", flexShrink: 0 }}>
          {expanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
        </span>
      </div>

      {/* Expanded body */}
      {expanded && (
        <div style={{ padding: "0 16px 16px", borderTop: "1px solid var(--border, rgba(31,27,22,0.06))" }}>

          {/* Stats row */}
          {connected && stats && (
            <div style={{ display: "flex", gap: 12, padding: "12px 0" }}>
              {[
                { label: "Total synced",  value: (stats.totalItems ?? 0).toLocaleString() },
                { label: "Success rate",  value: stats.successRate != null ? `${stats.successRate}%` : "—" },
                { label: "Avg duration",  value: stats.avgDurationMs ? `${(stats.avgDurationMs / 1000).toFixed(1)}s` : "—" },
                { label: "Interval",      value: connector.syncIntervalLabel },
              ].map(s => (
                <div key={s.label} style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 17, fontWeight: 500, color: "var(--t1, #f9fafb)" }}>{s.value}</div>
                  <div style={{ fontSize: 9, color: "var(--t4)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{s.label}</div>
                </div>
              ))}
            </div>
          )}

          {/* Action buttons */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", paddingBottom: 10 }}>
            {!connected ? (
              <>
                {connector.authModes.includes("oauth") && (
                  <button onClick={handleOAuth} style={{ fontSize: 11, padding: "5px 14px", borderRadius: 7, background: "var(--brand, #6366f1)", color: "#fff", border: "none", cursor: "pointer", fontWeight: 500 }}>
                    Connect with OAuth
                  </button>
                )}
                {connector.authModes.includes("pat") && (
                  <button onClick={() => setFormMode(m => m === "pat" ? null : "pat")} style={{ fontSize: 11, padding: "5px 12px", borderRadius: 7, background: "rgba(31,27,22,0.06)", color: "var(--t2)", border: "1px solid var(--border, rgba(31,27,22,0.1))", cursor: "pointer" }}>
                    Use Token
                  </button>
                )}
                {connector.authModes.includes("apikey") && (
                  <button onClick={() => setFormMode(m => m === "apikey" ? null : "apikey")} style={{ fontSize: 11, padding: "5px 12px", borderRadius: 7, background: "rgba(31,27,22,0.06)", color: "var(--t2)", border: "1px solid var(--border, rgba(31,27,22,0.1))", cursor: "pointer" }}>
                    Use API Key
                  </button>
                )}
                {connector.docUrl && (
                  <a href={connector.docUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, padding: "5px 10px", borderRadius: 7, color: "var(--t4)", display: "inline-flex", alignItems: "center", gap: 4, textDecoration: "none" }}>
                    <ExternalLink size={11} /> Docs
                  </a>
                )}
              </>
            ) : (
              <>
                <button onClick={handleSync} disabled={syncing} style={{ fontSize: 11, padding: "5px 12px", borderRadius: 7, background: "rgba(99,102,241,0.09)", color: "#818cf8", border: "1px solid rgba(99,102,241,0.22)", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 5 }}>
                  {syncing ? <Loader2 size={11} style={{ animation: "flow-spin 1s linear infinite" }} /> : <RefreshCw size={11} />}
                  {syncing ? "Syncing…" : "Sync now"}
                </button>
                <button onClick={() => { setShowHist(h => !h); }} style={{ fontSize: 11, padding: "5px 12px", borderRadius: 7, background: "rgba(31,27,22,0.05)", color: "var(--t2)", border: "1px solid var(--border, rgba(31,27,22,0.07))", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 5 }}>
                  <History size={11} /> {showHist ? "Hide" : "History"}
                </button>
                <button onClick={handleDisconnect} style={{ fontSize: 11, padding: "5px 12px", borderRadius: 7, background: "rgba(239,68,68,0.05)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.15)", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 5 }}>
                  <Unplug size={11} /> Disconnect
                </button>
              </>
            )}
          </div>

          {/* Inline credential form */}
          {formMode && (
            <div style={{ padding: 12, background: "rgba(31,27,22,0.025)", borderRadius: 8, border: "1px solid var(--border, rgba(31,27,22,0.08))", marginBottom: 10 }}>
              {formErr && <div style={{ fontSize: 11, color: "#ef4444", marginBottom: 8 }}>{formErr}</div>}
              {formMode === "pat" && (
                <div style={{ marginBottom: 8 }}>
                  <label style={{ fontSize: 10, fontWeight: 500, color: "var(--t4)", display: "block", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.07em" }}>{connector.patLabel}</label>
                  <input
                    type="password" placeholder={connector.patPlaceholder} value={formVals.token || ""}
                    onChange={e => setFormVals({ token: e.target.value })}
                    style={{ width: "100%", padding: "6px 10px", borderRadius: 6, background: "rgba(31,27,22,0.05)", border: "1px solid var(--border-strong, rgba(31,27,22,0.1))", color: "var(--t1)", fontSize: 11, boxSizing: "border-box" }}
                  />
                </div>
              )}
              {formMode === "apikey" && (connector.apiKeyFields || []).map(f => (
                <div key={f.key} style={{ marginBottom: 8 }}>
                  <label style={{ fontSize: 10, fontWeight: 500, color: "var(--t4)", display: "block", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.07em" }}>{f.label}</label>
                  <input
                    type={f.type} placeholder={f.placeholder} value={formVals[f.key] || ""}
                    onChange={e => setFormVals(v => ({ ...v, [f.key]: e.target.value }))}
                    style={{ width: "100%", padding: "6px 10px", borderRadius: 6, background: "rgba(31,27,22,0.05)", border: "1px solid var(--border-strong, rgba(31,27,22,0.1))", color: "var(--t1)", fontSize: 11, boxSizing: "border-box" }}
                  />
                </div>
              ))}
              <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                <button onClick={handleFormSubmit} disabled={submitting} style={{ fontSize: 11, padding: "5px 14px", borderRadius: 6, background: "var(--brand, #6366f1)", color: "#fff", border: "none", cursor: "pointer", fontWeight: 500 }}>
                  {submitting ? "Connecting…" : "Connect"}
                </button>
                <button onClick={() => { setFormMode(null); setFormErr(null); }} style={{ fontSize: 11, padding: "5px 12px", borderRadius: 6, background: "none", color: "var(--t4)", border: "1px solid var(--border, rgba(31,27,22,0.08))", cursor: "pointer" }}>Cancel</button>
              </div>
            </div>
          )}

          {/* Webhook panel (only for connected connectors that support it) */}
          {connector.webhookSupport && connected && (
            <WebhookPanel connectorId={connector.id} headers={headers} />
          )}

          {/* Sync history */}
          {showHist && connected && (
            <SyncHistoryPanel connectorId={connector.id} headers={headers} />
          )}
        </div>
      )}
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function IntegrationHub() {
  const { token, workspaceId, isAuthLoading } = useWebSocket();
  const [statuses,    setStatuses]    = useState({});
  const [loading,     setLoading]     = useState(true);
  const [lastRefresh, setLastRefresh] = useState(null);
  const [refreshing,  setRefreshing]  = useState(false);

  const headers = token
    ? { Authorization: `Bearer ${token}`, "workspace-id": workspaceId || "workspace_corp_alpha", "Content-Type": "application/json" }
    : {};

  const fetchStatuses = useCallback(async (quiet = false) => {
    if (!token || !workspaceId) { setLoading(false); return; }
    if (!quiet) setRefreshing(true);
    try {
      const res = await fetch("/api/integrations-hub/status", { headers });
      if (res.ok) {
        const d = await res.json();
        setStatuses(d.integrations || {});
        setLastRefresh(new Date());
      }
    } catch {}
    finally { setLoading(false); setRefreshing(false); }
  }, [token, workspaceId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!isAuthLoading) fetchStatuses(true);
  }, [isAuthLoading, token, workspaceId]); // eslint-disable-line react-hooks/exhaustive-deps

  const connectedCount = Object.values(statuses).filter(s => s?.connected).length;
  const degradedCount  = Object.values(statuses).filter(s => s?.connected && s?.healthStatus === "degraded").length;

  return (
    <div style={{ maxWidth: 820, margin: "0 auto", padding: "24px 16px" }}>

      {/* Page header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 500, color: "var(--t1, #f9fafb)", display: "flex", alignItems: "center", gap: 8, margin: 0 }}>
              <Link2 size={20} style={{ color: "var(--brand, #6366f1)" }} />
              Integration Hub
            </h1>
            <p style={{ fontSize: 12, color: "var(--t4, #6b7280)", margin: "4px 0 0", maxWidth: 500 }}>
              Connect your tools. FLOW reads only the resources you authorize in Integration Permissions.
            </p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 20, fontWeight: 500, color: "var(--t1)" }}>
                {connectedCount}
                <span style={{ fontSize: 13, color: "var(--t4)", fontWeight: 400 }}>/{CONNECTORS.length}</span>
              </div>
              <div style={{ fontSize: 9, color: "var(--t4)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Connected</div>
            </div>
            <button onClick={() => fetchStatuses()} disabled={refreshing} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, color: "var(--t3)", background: "rgba(31,27,22,0.05)", border: "1px solid var(--border, rgba(31,27,22,0.07))", borderRadius: 7, padding: "6px 12px", cursor: "pointer" }}>
              <RefreshCw size={12} style={refreshing ? { animation: "flow-spin 1s linear infinite" } : {}} />
              {refreshing ? "Refreshing…" : "Refresh"}
            </button>
          </div>
        </div>

        {/* Quick stats */}
        {lastRefresh && (
          <div style={{ display: "flex", gap: 18, flexWrap: "wrap", marginTop: 12 }}>
            {[
              { icon: <Activity size={12} />, color: "#22c55e", label: "Connected",     value: connectedCount },
              { icon: <AlertTriangle size={12} />, color: "#eab308", label: "Degraded",  value: degradedCount },
              { icon: <Clock size={12} />, color: "var(--t4)", label: "Refreshed",       value: lastRefresh.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) },
            ].map(s => (
              <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "var(--t3)" }}>
                <span style={{ color: s.color }}>{s.icon}</span>
                <span style={{ color: "var(--t1)", fontWeight: 500 }}>{s.value}</span>
                <span>{s.label}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Governance cross-link — connecting is not the same as granting access. */}
      <a
        href="/settings/permissions"
        style={{
          display: "flex", alignItems: "center", gap: 11,
          padding: "12px 14px", marginBottom: 16, borderRadius: 10,
          background: "color-mix(in srgb, var(--brand, #6366f1) 6%, transparent)",
          border: "1px solid color-mix(in srgb, var(--brand, #6366f1) 20%, transparent)",
          textDecoration: "none",
        }}
      >
        <ShieldCheck size={15} style={{ color: "var(--brand, #6366f1)", flexShrink: 0 }} />
        <span style={{ flex: 1, fontSize: 12, color: "var(--t2, #9ca3af)", lineHeight: 1.5 }}>
          <strong style={{ color: "var(--t1, #f9fafb)", fontWeight: 500 }}>OAuth only lets FLOW connect.</strong>{" "}
          Choose exactly which channels, repos, labels, and projects it may read.
        </span>
        <span style={{ fontSize: 11.5, fontWeight: 500, color: "var(--brand, #6366f1)", flexShrink: 0 }}>
          Integration Permissions →
        </span>
      </a>

      {/* Connector cards */}
      {loading ? (
        <div style={{ textAlign: "center", padding: 48, color: "var(--t4)", fontSize: 12 }}>
          <Loader2 size={20} style={{ animation: "flow-spin 1s linear infinite", marginBottom: 8 }} />
          <div>Checking integration status…</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {CONNECTORS.map(c => (
            <ConnectorCard
              key={c.id}
              connector={c}
              status={statuses[c.id] || null}
              headers={headers}
              onRefresh={() => fetchStatuses(true)}
            />
          ))}
        </div>
      )}

      {/* Security callout */}
      <div style={{ marginTop: 28, padding: 16, background: "rgba(99,102,241,0.05)", borderRadius: 10, border: "1px solid rgba(99,102,241,0.14)" }}>
        <div style={{ fontSize: 12, fontWeight: 500, color: "var(--t1)", marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
          <ShieldCheck size={13} style={{ color: "#818cf8" }} /> Security &amp; Privacy
        </div>
        <ul style={{ margin: 0, padding: "0 0 0 16px", fontSize: 11, color: "var(--t3)", lineHeight: 1.8 }}>
          <li>All credentials encrypted with AES-256-GCM before storage.</li>
          <li>OAuth tokens auto-refresh — no manual re-authentication needed.</li>
          <li>Webhook signatures verified (HMAC-SHA256) before any data is ingested.</li>
          <li>Credentials are workspace-scoped — other workspaces cannot access them.</li>
          <li>Set <code style={{ fontSize: 10, background: "rgba(31,27,22,0.06)", padding: "0 4px", borderRadius: 3 }}>GITHUB_CLIENT_ID</code>, <code style={{ fontSize: 10, background: "rgba(31,27,22,0.06)", padding: "0 4px", borderRadius: 3 }}>SLACK_CLIENT_ID</code>, etc. in <code style={{ fontSize: 10 }}>.env</code> to enable OAuth flows.</li>
        </ul>
      </div>

      <style>{`@keyframes flow-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
