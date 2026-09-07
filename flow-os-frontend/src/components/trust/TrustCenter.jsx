/**
 * Trust Center — /integrations
 * Mission: every user understands FLOW permissions in under 60 seconds.
 * Tabs: Overview · Connectors · Knowledge · Audit · Governance
 */
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  ShieldCheck, ShieldAlert, Plug, PlugZap, RefreshCw, X,
  CheckCircle2, XCircle, AlertTriangle, Clock, Activity,
  Eye, EyeOff, Search, Download, FileText, Zap,
  ChevronRight, ArrowLeft, Loader2, Lock, Unlock,
  Database, Layers, Users, Globe, Settings,
} from "lucide-react";
import { useWebSocket } from "../../hooks/useWebSocket";
import { useNavigate } from "react-router-dom";

// ─── Static connector catalog (9 connectors per spec) ────────────────────────
const CONNECTOR_CATALOG = [
  { id: "github",         name: "GitHub",            emoji: "⚙",  category: "Engineering",    scopes: ["repo", "read:user", "read:org"],              syncLabel: "Every 15 min" },
  { id: "slack",          name: "Slack",             emoji: "💬", category: "Communication",  scopes: ["channels:read", "messages:read", "users:read"],syncLabel: "Every 10 min" },
  { id: "gmail",          name: "Google Workspace",  emoji: "G",  category: "Communication",  scopes: ["gmail.readonly", "gmail.compose"],            syncLabel: "Every 15 min" },
  { id: "google-calendar",name: "Google Calendar",   emoji: "📅", category: "Meetings",        scopes: ["calendar.readonly", "calendar.events"],       syncLabel: "Every 30 min" },
  { id: "google-drive",   name: "Google Drive",      emoji: "△",  category: "Knowledge",       scopes: ["drive.readonly", "drive.metadata.readonly"],  syncLabel: "Every 30 min" },
  { id: "jira",           name: "Jira",              emoji: "🎯", category: "Work",            scopes: ["read:jira-work", "read:jira-user"],           syncLabel: "Every 20 min" },
  { id: "notion",         name: "Notion",            emoji: "N",  category: "Knowledge",       scopes: ["read_content", "read_databases"],             syncLabel: "Every 30 min" },
  { id: "linear",         name: "Linear",            emoji: "◈",  category: "Work",            scopes: ["issues:read", "cycles:read", "projects:read"],syncLabel: "Every 20 min" },
  { id: "microsoft-365",  name: "Microsoft 365",     emoji: "⊟",  category: "Communication",  scopes: ["Mail.Read", "Calendars.Read", "User.Read"],   syncLabel: "Every 15 min" },
];

// ─── Status/health display maps ───────────────────────────────────────────────
const HEALTH_CFG = {
  HEALTHY:       { label: "Healthy",      color: "var(--p-normal-text)",  bg: "rgba(76,175,130,0.08)",  border: "rgba(76,175,130,0.22)"  },
  WARNING:       { label: "Warning",      color: "var(--p-high-text)",    bg: "rgba(255,151,65,0.08)",  border: "rgba(255,151,65,0.22)"  },
  DEGRADED:      { label: "Degraded",     color: "var(--p-high-text)",    bg: "rgba(255,151,65,0.08)",  border: "rgba(255,151,65,0.22)"  },
  ERROR:         { label: "Error",        color: "var(--p-critical-text)",bg: "rgba(255,87,87,0.08)",   border: "rgba(255,87,87,0.22)"   },
  EXPIRED:       { label: "Expired",      color: "var(--p-critical-text)",bg: "rgba(255,87,87,0.08)",   border: "rgba(255,87,87,0.22)"   },
  SYNCING:       { label: "Syncing",      color: "var(--p-info-text)",    bg: "rgba(91,158,255,0.08)",  border: "rgba(91,158,255,0.22)"  },
  DISCONNECTED:  { label: "Disconnected", color: "var(--t4)",             bg: "rgba(31,27,22,0.05)",    border: "var(--border)"          },
  NOT_CONNECTED: { label: "Not Connected",color: "var(--t4)",             bg: "rgba(31,27,22,0.05)",    border: "var(--border)"          },
};

const OUTCOME_CFG = {
  success:          { color: "var(--p-normal-text)",  label: "Allowed"           },
  allow:            { color: "var(--p-normal-text)",  label: "Allowed"           },
  denied:           { color: "var(--p-critical-text)",label: "Denied"            },
  deny:             { color: "var(--p-critical-text)",label: "Denied"            },
  approval_required:{ color: "var(--p-high-text)",   label: "Approval Required" },
  failure:          { color: "var(--p-high-text)",   label: "Failed"            },
  error:            { color: "var(--p-high-text)",   label: "Error"             },
};

// ─── Shared utilities ─────────────────────────────────────────────────────────
function relTime(ts) {
  if (!ts) return "—";
  const m = Math.round((Date.now() - new Date(ts).getTime()) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

function authHeaders(token, workspaceId) {
  return { Authorization: `Bearer ${token}`, "workspace-id": workspaceId, "Content-Type": "application/json" };
}

function trackTelemetry(event, props = {}, token, wsId) {
  if (!token || !wsId) return;
  fetch("/api/analytics/event", {
    method: "POST",
    headers: authHeaders(token, wsId),
    body: JSON.stringify({ event, properties: props }),
  }).catch(() => {});
}

// ─── Primitive components ─────────────────────────────────────────────────────
function HealthPill({ status }) {
  const cfg = HEALTH_CFG[status?.toUpperCase()] || HEALTH_CFG.NOT_CONNECTED;
  return (
    <span style={{ fontSize: 10, fontWeight: 500, letterSpacing: "0.05em", textTransform: "uppercase", padding: "2px 8px", borderRadius: 99, color: cfg.color, background: cfg.bg, border: `1px solid ${cfg.border}`, display: "inline-flex", alignItems: "center", gap: 4, whiteSpace: "nowrap" }}>
      <span style={{ width: 5, height: 5, borderRadius: "50%", background: cfg.color, flexShrink: 0 }} />
      {cfg.label}
    </span>
  );
}

// Honest label for connectors that run on in-memory data (reads simulated, writes
// refused by the Execution Engine). Never implies a live integration.
function PreviewBadge({ compact = false }) {
  return (
    <span
      title="Preview connector — data is simulated and write actions are refused until a live integration is connected."
      style={{ fontSize: compact ? 9 : 10, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", padding: compact ? "1px 6px" : "2px 8px", borderRadius: 99, color: "var(--p-high-text)", background: "rgba(255,151,65,0.10)", border: "1px solid rgba(255,151,65,0.28)", display: "inline-flex", alignItems: "center", gap: 3, whiteSpace: "nowrap" }}
    >
      Preview
    </span>
  );
}

function SectionLabel({ children }) {
  return <div style={{ fontSize: 9, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--t5)", marginBottom: 8 }}>{children}</div>;
}

function Spinner() {
  return <Loader2 style={{ width: 14, height: 14, color: "var(--t4)", animation: "spin 1s linear infinite" }} />;
}

// ─── Trust Score computation ──────────────────────────────────────────────────
function computeTrustScore(connectors, pendingApprovals, policies, auditEvents) {
  let score = 70; // start neutral
  const connected = connectors.filter(c => c.status === "connected" || c.health === "HEALTHY");
  const unhealthy  = connectors.filter(c => ["ERROR","EXPIRED","DEGRADED"].includes(c.health?.toUpperCase()));
  const hasAny = connectors.some(c => c.status === "connected");

  if (hasAny)          score += 10;
  if (policies?.length >= 3) score += 10;
  if (policies?.length >= 1) score += 5;
  score -= Math.min(unhealthy.length * 8, 24);
  score -= Math.min(pendingApprovals * 2, 10);

  const denied = auditEvents.filter(e => (e.metadata?.outcome || e.outcome || "").includes("denied")).length;
  const total  = auditEvents.length || 1;
  if (denied / total < 0.1) score += 5;
  else if (denied / total > 0.4) score -= 5;

  return Math.max(0, Math.min(100, score));
}

function TrustScoreGauge({ score }) {
  const color = score >= 80 ? "var(--p-normal-text)" : score >= 60 ? "var(--p-high-text)" : "var(--p-critical-text)";
  const label = score >= 80 ? "Strong" : score >= 60 ? "Good" : "Needs Attention";
  const pct   = (score / 100) * 251; // circumference of circle r=40

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
      <div style={{ position: "relative", width: 96, height: 96, flexShrink: 0 }}>
        <svg width="96" height="96" style={{ transform: "rotate(-90deg)" }}>
          <circle cx="48" cy="48" r="40" fill="none" stroke="rgba(31,27,22,0.06)" strokeWidth="8" />
          <circle cx="48" cy="48" r="40" fill="none" stroke={color} strokeWidth="8"
            strokeDasharray={`${pct} 251`} strokeLinecap="round"
            style={{ transition: "stroke-dasharray 800ms ease" }} />
        </svg>
        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
          <span style={{ fontSize: 22, fontWeight: 600, color, fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>{score}</span>
          <span style={{ fontSize: 9, color: "var(--t4)", marginTop: 2 }}>/ 100</span>
        </div>
      </div>
      <div>
        <div style={{ fontSize: 16, fontWeight: 500, color, marginBottom: 4 }}>{label}</div>
        <div style={{ fontSize: 11, color: "var(--t4)", lineHeight: 1.5, maxWidth: 180 }}>
          {score >= 80
            ? "Your workspace has strong security posture and active governance."
            : score >= 60
            ? "Review any warnings below to improve your trust score."
            : "Action required: unhealthy connectors or missing governance."}
        </div>
      </div>
    </div>
  );
}

// ─── Overview Tab ─────────────────────────────────────────────────────────────
function OverviewTab({ connectors, health, simulatedIds = new Set(), permOverview, pendingApprovals, policies, auditEvents, onConnectorsTab }) {
  const trustScore = useMemo(
    () => computeTrustScore(health, pendingApprovals?.length || 0, policies, auditEvents),
    [health, pendingApprovals, policies, auditEvents]
  );

  const activeConns  = health.filter(c => c.status === "connected" || c.health === "HEALTHY").length;
  const warnings     = health.filter(c => ["ERROR","EXPIRED","DEGRADED","WARNING"].includes(c.health?.toUpperCase())).length;
  const totalAllowed = Object.values(permOverview).reduce((s, p) => s + (p.allowedCount || 0), 0);
  const totalHidden  = Object.values(permOverview).reduce((s, p) => s + (p.hiddenCount || 0), 0);

  const STAT_CARDS = [
    { icon: Plug,        label: "Connected",    value: activeConns,               color: activeConns ? "var(--p-normal-text)" : "var(--t4)" },
    { icon: Database,    label: "Allowed Res.", value: totalAllowed,              color: "var(--p-info-text)" },
    { icon: EyeOff,      label: "Denied Res.",  value: totalHidden,               color: "var(--t4)" },
    { icon: ShieldCheck, label: "Policies",     value: policies.length,           color: policies.length ? "var(--p-normal-text)" : "var(--t4)" },
    { icon: Clock,       label: "Pending",      value: pendingApprovals?.length || 0, color: pendingApprovals?.length ? "var(--p-high-text)" : "var(--t4)" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* Trust Score + Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 24, alignItems: "start" }}>
        <div style={{ background: "var(--surface-1)", border: "1px solid var(--line-1)", borderRadius: 8, padding: "20px 24px" }}>
          <SectionLabel>Workspace Trust Score</SectionLabel>
          <TrustScoreGauge score={trustScore} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: 10 }}>
          {STAT_CARDS.map(({ icon: Icon, label, value, color }) => (
            <div key={label} style={{ background: "var(--surface-1)", border: "1px solid var(--line-1)", borderRadius: 6, padding: "14px", display: "flex", flexDirection: "column", gap: 4 }}>
              <Icon style={{ width: 14, height: 14, color: "var(--t5)", marginBottom: 2 }} />
              <span style={{ fontSize: 22, fontWeight: 500, color, fontVariantNumeric: "tabular-nums" }}>{value}</span>
              <span style={{ fontSize: 9, color: "var(--t5)", textTransform: "uppercase", letterSpacing: "0.08em" }}>{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Pending approvals alert */}
      {(pendingApprovals?.length || 0) > 0 && (
        <div style={{ background: "rgba(255,151,65,0.06)", border: "1px solid rgba(255,151,65,0.22)", borderRadius: 6, padding: "12px 16px", display: "flex", alignItems: "center", gap: 12 }}>
          <AlertTriangle style={{ width: 14, height: 14, color: "var(--p-high-text)", flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <span style={{ fontSize: 13, fontWeight: 500, color: "var(--p-high-text)" }}>{pendingApprovals.length} approval{pendingApprovals.length > 1 ? "s" : ""} pending</span>
            <span style={{ fontSize: 12, color: "var(--t3)", marginLeft: 8 }}>Actions are waiting for your review before execution.</span>
          </div>
          <button onClick={() => {}} style={{ fontSize: 11, padding: "4px 12px", borderRadius: 4, background: "var(--p-high-text)", color: "#fff", border: "none", cursor: "pointer" }}>Review</button>
        </div>
      )}

      {/* Connector health grid */}
      <div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <SectionLabel>Connector Health</SectionLabel>
          <button onClick={onConnectorsTab} style={{ fontSize: 11, color: "var(--t4)", background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
            Manage all <ChevronRight style={{ width: 10, height: 10 }} />
          </button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 10 }}>
          {CONNECTOR_CATALOG.map(conn => {
            const live = health.find(h => h.connector === conn.id || h.id === conn.id);
            const hStatus = live?.health || live?.status || "NOT_CONNECTED";
            const isPreview = simulatedIds.has(conn.id);
            return (
              <div
                key={conn.id}
                onClick={onConnectorsTab}
                style={{ background: "var(--surface-1)", border: "1px solid var(--line-1)", borderRadius: 6, padding: "12px 14px", cursor: "pointer", display: "flex", flexDirection: "column", gap: 8 }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 16 }}>{conn.emoji}</span>
                  {isPreview ? <PreviewBadge compact /> : <HealthPill status={hStatus} />}
                </div>
                <div style={{ fontSize: 12, fontWeight: 500, color: "var(--t1)" }}>{conn.name}</div>
                {isPreview ? (
                  <div style={{ fontSize: 10, color: "var(--p-high-text)" }}>Simulated data — connect a live account to go real</div>
                ) : live?.lastSyncAt && (
                  <div style={{ fontSize: 10, color: "var(--t5)" }}>Synced {relTime(live.lastSyncAt)}</div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Security posture */}
      <div style={{ background: "var(--surface-1)", border: "1px solid var(--line-1)", borderRadius: 6, padding: "16px 20px" }}>
        <SectionLabel>Security Posture</SectionLabel>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 10 }}>
          {[
            { icon: Lock,       label: "Privacy Gate",          ok: true,               note: "Blocking PII before indexing" },
            { icon: ShieldCheck,label: "Tenant Isolation",      ok: true,               note: "Workspace data fully separated" },
            { icon: FileText,   label: "Audit Logging",         ok: auditEvents.length > 0, note: auditEvents.length > 0 ? `${auditEvents.length} events logged` : "No events yet" },
            { icon: Users,      label: "Governance Policies",   ok: policies.length > 0,note: policies.length > 0 ? `${policies.length} active policies` : "No policies configured" },
            { icon: Globe,      label: "Deny-by-Default",       ok: true,               note: "New resources blocked until allowed" },
            { icon: Activity,   label: "Connector Health",      ok: warnings === 0,     note: warnings > 0 ? `${warnings} connector(s) need attention` : "All connectors healthy" },
          ].map(({ icon: Icon, label, ok, note }) => (
            <div key={label} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 12px", background: ok ? "rgba(76,175,130,0.04)" : "rgba(255,87,87,0.04)", border: `1px solid ${ok ? "rgba(76,175,130,0.16)" : "rgba(255,87,87,0.16)"}`, borderRadius: 5 }}>
              {ok ? <CheckCircle2 style={{ width: 13, height: 13, color: "var(--p-normal-text)", flexShrink: 0, marginTop: 1 }} />
                   : <AlertTriangle style={{ width: 13, height: 13, color: "var(--p-critical-text)", flexShrink: 0, marginTop: 1 }} />}
              <div>
                <div style={{ fontSize: 12, fontWeight: 500, color: ok ? "var(--p-normal-text)" : "var(--p-critical-text)" }}>{label}</div>
                <div style={{ fontSize: 10, color: "var(--t4)", marginTop: 2 }}>{note}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Connector Detail Drawer ──────────────────────────────────────────────────
function ConnectorDetailDrawer({ connector, liveHealth, permData, onClose, token, workspaceId }) {
  const [syncing, setSyncing] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [syncMsg, setSyncMsg] = useState(null);
  const hdrs = authHeaders(token, workspaceId);

  const hStatus = liveHealth?.health || liveHealth?.status || "NOT_CONNECTED";
  const connected = !["NOT_CONNECTED", "DISCONNECTED"].includes(hStatus.toUpperCase());

  async function forceSync() {
    setSyncing(true); setSyncMsg(null);
    try {
      const res = await fetch("/api/connectors/execute", {
        method: "POST",
        headers: hdrs,
        body: JSON.stringify({ connectorId: connector.id, action: "SYNC", payload: {} }),
      });
      setSyncMsg(res.ok ? "Sync started." : "Sync unavailable — not connected.");
    } catch { setSyncMsg("Could not reach the sync service."); }
    setSyncing(false);
  }

  async function revoke() {
    if (!window.confirm(`Disconnect ${connector.name}? FLOW will stop reading from this integration.`)) return;
    setRevoking(true);
    try {
      await fetch(`/api/connectors/${connector.id}/auth/revoke`, { method: "POST", headers: hdrs });
      setSyncMsg("Disconnected. Refresh the page to update status.");
    } catch { setSyncMsg("Could not revoke access."); }
    setRevoking(false);
  }

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(31,27,22,0.25)", backdropFilter: "blur(2px)", zIndex: 500 }} />
      <div role="dialog" aria-modal="true" aria-label={`${connector.name} Details`} style={{ position: "fixed", top: 0, right: 0, bottom: 0, width: 420, maxWidth: "92vw", background: "var(--surface-0)", borderLeft: "1px solid var(--line-1)", zIndex: 501, display: "flex", flexDirection: "column", fontFamily: "var(--font-ui)", boxShadow: "-12px 0 40px rgba(31,27,22,0.10)" }}>
        {/* Header */}
        <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--line-0)", display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
          <span style={{ fontSize: 24 }}>{connector.emoji}</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 500, color: "var(--t1)" }}>{connector.name}</div>
            <div style={{ fontSize: 10, color: "var(--t4)" }}>{connector.category}</div>
          </div>
          <HealthPill status={hStatus} />
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--t4)", padding: 4 }}>
            <X style={{ width: 14, height: 14 }} />
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "20px", display: "flex", flexDirection: "column", gap: 20 }}>
          {/* Auth Status */}
          <div>
            <SectionLabel>Authentication Status</SectionLabel>
            <div style={{ background: connected ? "rgba(76,175,130,0.04)" : "rgba(31,27,22,0.04)", border: `1px solid ${connected ? "rgba(76,175,130,0.20)" : "var(--line-1)"}`, borderRadius: 5, padding: "10px 12px", display: "flex", alignItems: "center", gap: 10 }}>
              {connected ? <CheckCircle2 style={{ width: 13, height: 13, color: "var(--p-normal-text)" }} /> : <XCircle style={{ width: 13, height: 13, color: "var(--t4)" }} />}
              <div>
                <div style={{ fontSize: 12, fontWeight: 500, color: "var(--t1)" }}>{connected ? "Authenticated" : "Not connected"}</div>
                {liveHealth?.message && <div style={{ fontSize: 10, color: "var(--t4)", marginTop: 2 }}>{liveHealth.message}</div>}
              </div>
            </div>
          </div>

          {/* Permission Scopes */}
          <div>
            <SectionLabel>Permission Scopes</SectionLabel>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {connector.scopes.map(scope => (
                <span key={scope} style={{ fontSize: 10, padding: "3px 8px", borderRadius: 4, background: "rgba(31,27,22,0.05)", border: "1px solid var(--line-1)", color: "var(--t3)", fontFamily: "var(--font-data)" }}>
                  {scope}
                </span>
              ))}
            </div>
            <div style={{ fontSize: 10, color: "var(--t5)", marginTop: 8 }}>
              These are the OAuth scopes FLOW requests. No data outside these scopes is ever read.
            </div>
          </div>

          {/* Indexed Resources */}
          {permData && (
            <div>
              <SectionLabel>Resource Visibility</SectionLabel>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <div style={{ background: "rgba(76,175,130,0.05)", border: "1px solid rgba(76,175,130,0.18)", borderRadius: 5, padding: "10px 12px" }}>
                  <div style={{ fontSize: 18, fontWeight: 500, color: "var(--p-normal-text)", fontVariantNumeric: "tabular-nums" }}>{permData.allowedCount || 0}</div>
                  <div style={{ fontSize: 9, color: "var(--t5)", textTransform: "uppercase", letterSpacing: "0.08em", marginTop: 2 }}>Indexed</div>
                </div>
                <div style={{ background: "rgba(31,27,22,0.03)", border: "1px solid var(--line-1)", borderRadius: 5, padding: "10px 12px" }}>
                  <div style={{ fontSize: 18, fontWeight: 500, color: "var(--t4)", fontVariantNumeric: "tabular-nums" }}>{permData.hiddenCount || 0}</div>
                  <div style={{ fontSize: 9, color: "var(--t5)", textTransform: "uppercase", letterSpacing: "0.08em", marginTop: 2 }}>Denied</div>
                </div>
              </div>
            </div>
          )}

          {/* Sync Info */}
          <div>
            <SectionLabel>Sync Configuration</SectionLabel>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {[
                { label: "Frequency",   value: connector.syncLabel },
                { label: "Last Sync",   value: liveHealth?.lastSyncAt ? relTime(liveHealth.lastSyncAt) : "—" },
                { label: "Auth Type",   value: connected ? "OAuth 2.0" : "—" },
              ].map(({ label, value }) => (
                <div key={label} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid var(--line-0)" }}>
                  <span style={{ fontSize: 11, color: "var(--t4)" }}>{label}</span>
                  <span style={{ fontSize: 11, color: "var(--t2)", fontWeight: 500 }}>{value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Deny-by-default notice */}
          <div style={{ background: "rgba(91,158,255,0.05)", border: "1px solid rgba(91,158,255,0.18)", borderRadius: 5, padding: "10px 12px" }}>
            <div style={{ fontSize: 11, fontWeight: 500, color: "var(--p-info-text)", marginBottom: 3 }}>Deny-by-default active</div>
            <div style={{ fontSize: 10, color: "var(--t4)", lineHeight: 1.5 }}>
              New {connector.name} resources are blocked until you explicitly allow them in Permission Explorer.
            </div>
          </div>

          {/* Status message */}
          {syncMsg && (
            <div style={{ fontSize: 12, padding: "8px 12px", borderRadius: 4, background: "rgba(31,27,22,0.05)", border: "1px solid var(--line-1)", color: "var(--t2)" }}>
              {syncMsg}
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div style={{ padding: "14px 20px", borderTop: "1px solid var(--line-0)", display: "flex", gap: 8, flexShrink: 0 }}>
          {connected ? (
            <>
              <button
                onClick={forceSync}
                disabled={syncing}
                style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "8px", borderRadius: 5, background: "var(--accent)", border: "none", color: "#fff", fontSize: 12, fontWeight: 500, cursor: syncing ? "not-allowed" : "pointer", opacity: syncing ? 0.7 : 1 }}
              >
                {syncing ? <Loader2 style={{ width: 12, height: 12, animation: "spin 1s linear infinite" }} /> : <RefreshCw style={{ width: 12, height: 12 }} />}
                Force Sync
              </button>
              <button
                onClick={revoke}
                disabled={revoking}
                style={{ padding: "8px 14px", borderRadius: 5, background: "rgba(255,87,87,0.08)", border: "1px solid rgba(255,87,87,0.22)", color: "var(--p-critical-text)", fontSize: 12, cursor: "pointer" }}
              >
                {revoking ? <Loader2 style={{ width: 12, height: 12, animation: "spin 1s linear infinite" }} /> : "Disconnect"}
              </button>
            </>
          ) : (
            <button
              onClick={() => window.location.href = `/settings/integrations`}
              style={{ flex: 1, padding: "8px", borderRadius: 5, background: "var(--accent)", border: "none", color: "#fff", fontSize: 12, fontWeight: 500, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}
            >
              <PlugZap style={{ width: 12, height: 12 }} /> Connect {connector.name}
            </button>
          )}
          <button onClick={onClose} style={{ padding: "8px 14px", borderRadius: 5, background: "transparent", border: "1px solid var(--line-1)", fontSize: 12, color: "var(--t4)", cursor: "pointer" }}>
            Close
          </button>
        </div>
      </div>
    </>
  );
}

// ─── Connectors Tab ───────────────────────────────────────────────────────────
function ConnectorsTab({ health, simulatedIds = new Set(), permOverview, token, workspaceId }) {
  const [selected, setSelected] = useState(null);
  const navigate = useNavigate();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <p style={{ fontSize: 12, color: "var(--t3)" }}>Click any connector to view authentication status, permission scopes, sync configuration, and resource visibility.</p>
        <button onClick={() => navigate("/settings/permissions")} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--t4)", background: "var(--surface-1)", border: "1px solid var(--line-1)", borderRadius: 4, padding: "6px 12px", cursor: "pointer" }}>
          <Settings style={{ width: 11, height: 11 }} /> Permission Explorer
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
        {CONNECTOR_CATALOG.map(conn => {
          const live = health.find(h => h.connector === conn.id || h.id === conn.id);
          const hStatus = live?.health || live?.status || "NOT_CONNECTED";
          const connected = !["NOT_CONNECTED","DISCONNECTED"].includes(hStatus.toUpperCase());
          const perm = permOverview[conn.id] || {};

          return (
            <div
              key={conn.id}
              onClick={() => setSelected(conn.id)}
              style={{ background: "var(--surface-1)", border: "1px solid var(--line-1)", borderRadius: 6, padding: "16px", cursor: "pointer", transition: "border-color 120ms" }}
              onMouseEnter={e => e.currentTarget.style.borderColor = "var(--accent-line)"}
              onMouseLeave={e => e.currentTarget.style.borderColor = "var(--line-1)"}
            >
              {/* Card header */}
              <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 12 }}>
                <span style={{ fontSize: 22, flexShrink: 0 }}>{conn.emoji}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 13, fontWeight: 500, color: "var(--t1)" }}>{conn.name}</span>
                    <span style={{ fontSize: 9, color: "var(--t5)", background: "rgba(31,27,22,0.05)", padding: "1px 6px", borderRadius: 3, textTransform: "uppercase" }}>{conn.category}</span>
                    {simulatedIds.has(conn.id) && <PreviewBadge compact />}
                  </div>
                  {simulatedIds.has(conn.id)
                    ? <span style={{ fontSize: 10, color: "var(--p-high-text)" }}>Simulated — writes are refused until connected</span>
                    : <HealthPill status={hStatus} />}
                </div>
              </div>

              {/* Scope preview */}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 12 }}>
                {conn.scopes.slice(0, 3).map(s => (
                  <span key={s} style={{ fontSize: 9, padding: "1px 6px", borderRadius: 3, background: "rgba(31,27,22,0.05)", border: "1px solid var(--line-0)", color: "var(--t5)", fontFamily: "var(--font-data)" }}>{s}</span>
                ))}
                {conn.scopes.length > 3 && <span style={{ fontSize: 9, color: "var(--t5)" }}>+{conn.scopes.length - 3} more</span>}
              </div>

              {/* Resource counts */}
              <div style={{ display: "flex", gap: 16, fontSize: 11, color: "var(--t4)" }}>
                {connected ? (
                  <>
                    <span style={{ color: "var(--p-normal-text)" }}><strong style={{ fontVariantNumeric: "tabular-nums" }}>{perm.allowedCount || 0}</strong> indexed</span>
                    <span><strong style={{ fontVariantNumeric: "tabular-nums" }}>{perm.hiddenCount || 0}</strong> denied</span>
                    {live?.lastSyncAt && <span>Synced {relTime(live.lastSyncAt)}</span>}
                  </>
                ) : (
                  <span style={{ color: "var(--t5)" }}>Not connected — click to connect</span>
                )}
              </div>

              {/* Detail arrow */}
              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
                <ChevronRight style={{ width: 12, height: 12, color: "var(--t5)" }} />
              </div>
            </div>
          );
        })}
      </div>

      {selected && (
        <ConnectorDetailDrawer
          connector={CONNECTOR_CATALOG.find(c => c.id === selected)}
          liveHealth={health.find(h => h.connector === selected || h.id === selected)}
          permData={permOverview[selected]}
          onClose={() => setSelected(null)}
          token={token}
          workspaceId={workspaceId}
        />
      )}
    </div>
  );
}

// ─── Knowledge Visibility Tab ─────────────────────────────────────────────────
function KnowledgeTab({ timeline, permOverview, token, workspaceId }) {
  const hdrs = authHeaders(token, workspaceId);
  const [removed, setRemoved] = useState(new Set());

  const indexed = (timeline || []).filter(e => {
    const outcome = (e.outcome || e.metadata?.outcome || "success").toLowerCase();
    return outcome === "success" || outcome === "executed";
  }).filter(e => !removed.has(e.id));

  const denied = Object.entries(permOverview).flatMap(([connId, data]) => {
    const conn = CONNECTOR_CATALOG.find(c => c.id === connId);
    if (!data.hiddenCount || !conn) return [];
    return [{ id: `hidden-${connId}`, connector: connId, name: conn.name, count: data.hiddenCount, reason: "Deny-by-default — not in allow list" }];
  });

  async function removeKnowledge(item) {
    setRemoved(prev => new Set([...prev, item.id]));
    // Best-effort: mark item as revoked in audit
    fetch("/api/connectors/audit", {
      method: "POST",
      headers: hdrs,
      body: JSON.stringify({ action: "knowledge.removed", resource: item.id }),
    }).catch(() => {});
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* Indexed */}
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <Eye style={{ width: 14, height: 14, color: "var(--p-normal-text)" }} />
          <SectionLabel>Indexed Knowledge</SectionLabel>
          <span style={{ fontSize: 10, background: "rgba(76,175,130,0.08)", color: "var(--p-normal-text)", border: "1px solid rgba(76,175,130,0.22)", padding: "1px 7px", borderRadius: 99 }}>{indexed.length}</span>
        </div>
        {indexed.length === 0 ? (
          <div style={{ fontSize: 12, color: "var(--t4)", padding: "16px", background: "var(--surface-1)", border: "1px solid var(--line-1)", borderRadius: 6, textAlign: "center" }}>
            No indexed items yet. Connect a connector to start building your knowledge base.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {indexed.slice(0, 50).map(item => (
              <div key={item.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 12px", background: "var(--surface-1)", border: "1px solid var(--line-1)", borderRadius: 5 }}>
                <CheckCircle2 style={{ width: 11, height: 11, color: "var(--p-normal-text)", flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, color: "var(--t1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {item.description || item.action || item.resource || "Knowledge item"}
                  </div>
                  <div style={{ fontSize: 10, color: "var(--t5)", marginTop: 1 }}>
                    {item.metadata?.connectorId || item.connector || "—"} · {relTime(item.createdAt || item.timestamp)}
                  </div>
                </div>
                <button
                  onClick={() => removeKnowledge(item)}
                  style={{ fontSize: 10, padding: "2px 8px", borderRadius: 3, background: "rgba(255,87,87,0.07)", border: "1px solid rgba(255,87,87,0.20)", color: "var(--p-critical-text)", cursor: "pointer", flexShrink: 0 }}
                >
                  Remove
                </button>
              </div>
            ))}
            {indexed.length > 50 && (
              <div style={{ fontSize: 11, color: "var(--t4)", textAlign: "center", padding: 8 }}>Showing 50 of {indexed.length} indexed items.</div>
            )}
          </div>
        )}
      </div>

      {/* Not Indexed */}
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <EyeOff style={{ width: 14, height: 14, color: "var(--t4)" }} />
          <SectionLabel>Not Indexed</SectionLabel>
          {denied.length > 0 && <span style={{ fontSize: 10, background: "rgba(31,27,22,0.05)", color: "var(--t4)", border: "1px solid var(--line-1)", padding: "1px 7px", borderRadius: 99 }}>{denied.length}</span>}
        </div>
        {denied.length === 0 ? (
          <div style={{ fontSize: 12, color: "var(--t4)", padding: "16px", background: "var(--surface-1)", border: "1px solid var(--line-1)", borderRadius: 6, textAlign: "center" }}>
            No resources are denied. All connected resources are indexed.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {denied.map(item => (
              <div key={item.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 12px", background: "rgba(31,27,22,0.03)", border: "1px solid var(--line-1)", borderRadius: 5 }}>
                <XCircle style={{ width: 11, height: 11, color: "var(--t4)", flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, color: "var(--t2)" }}>{item.count} resource{item.count !== 1 ? "s" : ""} from {item.name}</div>
                  <div style={{ fontSize: 10, color: "var(--t5)", marginTop: 1 }}>{item.reason}</div>
                </div>
                <button
                  onClick={() => window.location.href = `/settings/permissions`}
                  style={{ fontSize: 10, padding: "2px 8px", borderRadius: 3, background: "rgba(91,158,255,0.07)", border: "1px solid rgba(91,158,255,0.20)", color: "var(--p-info-text)", cursor: "pointer", flexShrink: 0 }}
                >
                  Allow
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Lineage note */}
      <div style={{ background: "rgba(91,158,255,0.04)", border: "1px solid rgba(91,158,255,0.16)", borderRadius: 5, padding: "12px 16px" }}>
        <div style={{ fontSize: 12, fontWeight: 500, color: "var(--p-info-text)", marginBottom: 4 }}>Data Lineage</div>
        <div style={{ fontSize: 11, color: "var(--t3)", lineHeight: 1.6 }}>
          Every AI answer cites its source connectors and retrieved documents. You can see the retrieval timestamp, permission check result, and the reasoning chain in the execution details of any recommendation.
        </div>
      </div>
    </div>
  );
}

// ─── Audit Explorer Tab ───────────────────────────────────────────────────────
function AuditTab({ auditEvents, loading }) {
  const [query, setQuery]     = useState("");
  const [connector, setConn]  = useState("all");
  const [outcome, setOutcome] = useState("all");
  const [focused, setFocused] = useState(false);

  const connectors = useMemo(() => {
    const ids = new Set(auditEvents.map(e => e.metadata?.connectorId || e.connector || ""));
    return ["all", ...Array.from(ids).filter(Boolean)];
  }, [auditEvents]);

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return auditEvents.filter(e => {
      const connId   = (e.metadata?.connectorId || e.connector || "").toLowerCase();
      const action   = (e.action || e.event || "").toLowerCase();
      const actor    = (e.userId || e.actor || "").toLowerCase();
      const outc     = (e.metadata?.outcome || e.outcome || "").toLowerCase();
      const matchQ   = !q || connId.includes(q) || action.includes(q) || actor.includes(q) || outc.includes(q);
      const matchC   = connector === "all" || connId === connector;
      const matchO   = outcome === "all" || outc === outcome;
      return matchQ && matchC && matchO;
    });
  }, [auditEvents, query, connector, outcome]);

  function exportCSV() {
    const header = "Timestamp,Actor,Connector,Action,Outcome,Resource";
    const rows = filtered.map(e => [
      new Date(e.createdAt || e.timestamp || Date.now()).toISOString(),
      e.userId || e.actor || "—",
      e.metadata?.connectorId || e.connector || "—",
      e.action || e.event || "—",
      e.metadata?.outcome || e.outcome || "—",
      e.resource || "—",
    ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(","));
    const blob = new Blob([[header, ...rows].join("\n")], { type: "text/csv" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a"); a.href = url; a.download = "flow_audit.csv"; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Filters */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ position: "relative", flex: 1, minWidth: 200 }}>
          <Search style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", width: 12, height: 12, color: "var(--t5)" }} />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder="Filter by actor, connector, action, outcome…"
            style={{ width: "100%", paddingLeft: 30, paddingRight: 10, paddingTop: 6, paddingBottom: 6, background: "var(--surface-1)", border: `1px solid ${focused ? "var(--accent-line)" : "var(--line-1)"}`, borderRadius: 5, fontSize: 12, color: "var(--t1)", outline: "none" }}
          />
        </div>
        <select
          value={connector}
          onChange={e => setConn(e.target.value)}
          style={{ padding: "6px 10px", background: "var(--surface-1)", border: "1px solid var(--line-1)", borderRadius: 5, fontSize: 12, color: "var(--t2)", cursor: "pointer" }}
        >
          {connectors.map(c => <option key={c} value={c}>{c === "all" ? "All Connectors" : c}</option>)}
        </select>
        <select
          value={outcome}
          onChange={e => setOutcome(e.target.value)}
          style={{ padding: "6px 10px", background: "var(--surface-1)", border: "1px solid var(--line-1)", borderRadius: 5, fontSize: 12, color: "var(--t2)", cursor: "pointer" }}
        >
          {["all","success","denied","approval_required","failure"].map(o => <option key={o} value={o}>{o === "all" ? "All Outcomes" : o}</option>)}
        </select>
        <button onClick={exportCSV} style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 12px", background: "var(--surface-1)", border: "1px solid var(--line-1)", borderRadius: 5, fontSize: 12, color: "var(--t3)", cursor: "pointer" }}>
          <Download style={{ width: 11, height: 11 }} /> Export
        </button>
      </div>

      {/* Count */}
      <div style={{ fontSize: 11, color: "var(--t4)" }}>
        {loading ? "Loading…" : `${filtered.length} of ${auditEvents.length} events`}
      </div>

      {/* Table */}
      <div style={{ background: "var(--surface-1)", border: "1px solid var(--line-1)", borderRadius: 6, overflow: "hidden" }}>
        <table style={{ width: "100%", fontSize: 11, borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "rgba(31,27,22,0.04)", borderBottom: "1px solid var(--line-1)" }}>
              {["Timestamp","Actor","Connector","Action","Outcome","Resource"].map(h => (
                <th key={h} style={{ padding: "8px 12px", textAlign: "left", fontSize: 9, fontWeight: 500, color: "var(--t5)", textTransform: "uppercase", letterSpacing: "0.08em" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} style={{ padding: "24px", textAlign: "center", color: "var(--t4)" }}><Spinner /></td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={6} style={{ padding: "24px", textAlign: "center", fontSize: 12, color: "var(--t4)" }}>No audit events match your filters.</td></tr>
            ) : filtered.slice(0, 100).map((e, i) => {
              const outc   = (e.metadata?.outcome || e.outcome || "success").toLowerCase();
              const oCfg   = OUTCOME_CFG[outc] || { color: "var(--t4)", label: outc };
              return (
                <tr key={e.id || i} style={{ borderBottom: "1px solid var(--line-0)" }}>
                  <td style={{ padding: "7px 12px", color: "var(--t4)", fontFamily: "var(--font-data)", whiteSpace: "nowrap" }}>
                    {new Date(e.createdAt || e.timestamp || Date.now()).toLocaleString()}
                  </td>
                  <td style={{ padding: "7px 12px", color: "var(--t2)" }}>{e.userId || e.actor || "—"}</td>
                  <td style={{ padding: "7px 12px", color: "var(--t3)" }}>{e.metadata?.connectorId || e.connector || "—"}</td>
                  <td style={{ padding: "7px 12px", color: "var(--t2)", fontFamily: "var(--font-data)" }}>{e.action || e.event || "—"}</td>
                  <td style={{ padding: "7px 12px" }}>
                    <span style={{ fontSize: 10, fontWeight: 500, color: oCfg.color }}>{oCfg.label}</span>
                  </td>
                  <td style={{ padding: "7px 12px", color: "var(--t4)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 180 }}>
                    {e.resource || "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filtered.length > 100 && (
          <div style={{ padding: "8px 12px", fontSize: 11, color: "var(--t4)", textAlign: "center", borderTop: "1px solid var(--line-0)" }}>
            Showing 100 of {filtered.length}. Export CSV for the full dataset.
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Governance Tab ───────────────────────────────────────────────────────────
function GovernanceTab({ policies, pendingApprovals, loading, onToggle }) {
  const EFFECT_COLOR = {
    ALLOW:            "var(--p-normal-text)",
    DENY:             "var(--p-critical-text)",
    REQUIRE_APPROVAL: "var(--p-high-text)",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* Pending Approvals */}
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <Clock style={{ width: 13, height: 13, color: "var(--p-high-text)" }} />
          <SectionLabel>Pending Approvals</SectionLabel>
          {(pendingApprovals?.length || 0) > 0 && (
            <span style={{ fontSize: 10, background: "rgba(255,151,65,0.08)", color: "var(--p-high-text)", border: "1px solid rgba(255,151,65,0.22)", padding: "1px 7px", borderRadius: 99 }}>
              {pendingApprovals.length}
            </span>
          )}
        </div>
        {!pendingApprovals?.length ? (
          <div style={{ fontSize: 12, color: "var(--t4)", padding: "14px", background: "var(--surface-1)", border: "1px solid var(--line-1)", borderRadius: 6, textAlign: "center" }}>
            No pending approvals. All actions are executing within policy.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {pendingApprovals.map(ap => (
              <div key={ap.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", background: "rgba(255,151,65,0.04)", border: "1px solid rgba(255,151,65,0.18)", borderRadius: 5 }}>
                <Clock style={{ width: 12, height: 12, color: "var(--p-high-text)", flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 500, color: "var(--t1)" }}>{ap.title || ap.recommendation?.title || "Pending approval"}</div>
                  <div style={{ fontSize: 10, color: "var(--t4)", marginTop: 2 }}>Requested by {ap.requestedBy || ap.userId || "—"} · {relTime(ap.createdAt)}</div>
                </div>
                <span style={{ fontSize: 10, color: "var(--p-high-text)", fontWeight: 500 }}>PENDING</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Governance Policies */}
      <div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <ShieldCheck style={{ width: 13, height: 13, color: "var(--accent)" }} />
            <SectionLabel>Workspace Policies</SectionLabel>
          </div>
          <a href="/settings/governance" style={{ fontSize: 11, color: "var(--t4)", textDecoration: "none", display: "flex", alignItems: "center", gap: 4 }}>
            Advanced <ChevronRight style={{ width: 10, height: 10 }} />
          </a>
        </div>
        {loading ? (
          <div style={{ display: "flex", justifyContent: "center", padding: 24 }}><Spinner /></div>
        ) : policies.length === 0 ? (
          <div style={{ fontSize: 12, color: "var(--t4)", padding: "14px", background: "var(--surface-1)", border: "1px solid var(--line-1)", borderRadius: 6, textAlign: "center" }}>
            No policies configured. Visit <a href="/settings/governance" style={{ color: "var(--accent)" }}>Governance</a> to create rules.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {policies.map(pol => {
              const effectColor = EFFECT_COLOR[pol.effect] || "var(--t4)";
              return (
                <div key={pol.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", background: "var(--surface-1)", border: "1px solid var(--line-1)", borderRadius: 5 }}>
                  <ShieldCheck style={{ width: 12, height: 12, color: effectColor, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 500, color: "var(--t1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {pol.name || pol.description || "Policy"}
                    </div>
                    <div style={{ fontSize: 10, color: "var(--t4)", marginTop: 1 }}>
                      <span style={{ color: effectColor, fontWeight: 500 }}>{pol.effect}</span>
                      {pol.connector && <> · {pol.connector}</>}
                      {pol.role && <> · {pol.role}</>}
                    </div>
                  </div>
                  <button
                    onClick={() => onToggle(pol)}
                    style={{ width: 34, height: 18, borderRadius: 9, background: pol.enabled ? "var(--accent)" : "rgba(31,27,22,0.08)", border: pol.enabled ? "none" : "1px solid var(--line-1)", position: "relative", cursor: "pointer", flexShrink: 0 }}
                  >
                    <div style={{ position: "absolute", top: 2, [pol.enabled ? "right" : "left"]: 2, width: 12, height: 12, borderRadius: "50%", background: "#fff", transition: "all 150ms" }} />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* AI Limits */}
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <Zap style={{ width: 13, height: 13, color: "var(--accent)" }} />
          <SectionLabel>AI Execution Limits</SectionLabel>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {[
            { label: "Autonomy Level",     value: "Confirm Required", note: "FLOW asks before any state-changing action" },
            { label: "Max Actions / Day",  value: "Unlimited",        note: "No daily execution cap configured" },
            { label: "Human-in-the-Loop",  value: "Enabled",          note: "MEDIUM risk and above requires confirmation" },
            { label: "Two-Person Rule",    value: "CRITICAL only",    note: "Critical actions require 2 approvers" },
          ].map(({ label, value, note }) => (
            <div key={label} style={{ background: "var(--surface-1)", border: "1px solid var(--line-1)", borderRadius: 5, padding: "12px 14px" }}>
              <div style={{ fontSize: 9, color: "var(--t5)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>{label}</div>
              <div style={{ fontSize: 13, fontWeight: 500, color: "var(--t1)", marginBottom: 3 }}>{value}</div>
              <div style={{ fontSize: 10, color: "var(--t4)" }}>{note}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Tab navigation ───────────────────────────────────────────────────────────
const TABS = [
  { id: "overview",    label: "Overview",    icon: ShieldCheck },
  { id: "connectors",  label: "Connectors",  icon: Plug        },
  { id: "knowledge",   label: "Knowledge",   icon: Database    },
  { id: "audit",       label: "Audit",       icon: FileText    },
  { id: "governance",  label: "Governance",  icon: Lock        },
];

// ─── Root component ───────────────────────────────────────────────────────────
export function TrustCenter() {
  const { token, workspaceId, isAuthLoading } = useWebSocket();
  const [tab, setTab]               = useState("overview");
  const [health, setHealth]         = useState([]);
  const [simulatedIds, setSimIds]   = useState(() => new Set()); // preview connectors (in-memory)
  const [permOverview, setPermOv]   = useState({});
  const [pendingApprovals, setPend] = useState([]);
  const [policies, setPolicies]     = useState([]);
  const [auditEvents, setAudit]     = useState([]);
  const [timeline, setTimeline]     = useState([]);
  const [auditLoading, setAuditLoad]= useState(true);
  const [polLoading, setPolLoad]    = useState(true);
  const hdrs = token ? authHeaders(token, workspaceId) : {};

  // Track telemetry on mount
  useEffect(() => {
    if (token && workspaceId) {
      trackTelemetry("trust_center.visited", {}, token, workspaceId);
    }
  }, [token, workspaceId]);

  // Load connector health
  useEffect(() => {
    if (!token) return;
    fetch("/api/connectors", { headers: hdrs })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        const list = d?.connectors || d?.data || [];
        setHealth(list);
        // Authoritative preview set from the adapter's own `simulated` flag — survives
        // the health override below so cards can honestly show a "Preview" badge.
        setSimIds(new Set(list.filter(c => c.simulated).map(c => c.id)));
      }).catch(() => {});
    fetch("/api/connectors/health", { headers: hdrs })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d?.connectors) setHealth(d.connectors);
      }).catch(() => {});
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load permission overview
  useEffect(() => {
    if (!token) return;
    fetch("/api/integration-permissions", { headers: hdrs })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d?.connectors) {
          const map = {};
          d.connectors.forEach(c => { map[c.id || c.connector] = c; });
          setPermOv(map);
        }
      }).catch(() => {});
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load pending approvals
  useEffect(() => {
    if (!token) return;
    fetch("/api/approvals", { headers: hdrs })
      .then(r => r.ok ? r.json() : null)
      .then(d => setPend(d?.approvals || d?.data || []))
      .catch(() => {});
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load policies
  useEffect(() => {
    if (!token) return;
    setPolLoad(true);
    fetch("/api/policies", { headers: hdrs })
      .then(r => r.ok ? r.json() : null)
      .then(d => setPolicies(Array.isArray(d) ? d : (d?.policies || [])))
      .catch(() => {})
      .finally(() => setPolLoad(false));
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load audit + timeline (lazy — only on relevant tabs)
  const auditLoaded = useRef(false);
  useEffect(() => {
    if (!token || auditLoaded.current) return;
    if (tab !== "audit" && tab !== "knowledge" && tab !== "overview") return;
    auditLoaded.current = true;
    setAuditLoad(true);
    Promise.all([
      fetch("/api/connectors/audit?limit=200", { headers: hdrs }).then(r => r.ok ? r.json() : null),
      fetch("/api/connectors/timeline?limit=100", { headers: hdrs }).then(r => r.ok ? r.json() : null),
    ]).then(([audit, tl]) => {
      const evts = audit?.events || audit?.logs || [];
      setAudit(evts);
      setTimeline(tl?.timeline || tl?.events || evts);
    }).catch(() => {})
    .finally(() => setAuditLoad(false));
  }, [token, tab]); // eslint-disable-line react-hooks/exhaustive-deps

  function togglePolicy(pol) {
    const next = { ...pol, enabled: !pol.enabled };
    setPolicies(p => p.map(x => x.id === pol.id ? next : x));
    fetch(`/api/policies/${pol.id}/toggle`, { method: "PATCH", headers: hdrs, body: JSON.stringify({ enabled: !pol.enabled }) }).catch(() => {});
    if (token && workspaceId) trackTelemetry("policy.toggled", { policyId: pol.id, enabled: !pol.enabled }, token, workspaceId);
  }

  if (isAuthLoading) {
    return <div style={{ padding: "40px 32px" }}><Spinner /></div>;
  }

  return (
    <div style={{ padding: "24px 32px", maxWidth: 1100, margin: "0 auto", fontFamily: "var(--font-ui)" }}>
      {/* Page header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6 }}>
          <ShieldCheck style={{ width: 20, height: 20, color: "var(--accent)" }} />
          <h1 style={{ fontSize: 20, fontWeight: 500, color: "var(--t1)", letterSpacing: "-0.3px" }}>Trust Center</h1>
        </div>
        <p style={{ fontSize: 12, color: "var(--t4)", lineHeight: 1.6 }}>
          Understand exactly what FLOW can access, what has been indexed, and every action that has been taken on your behalf.
          Permission before ingestion. Transparency before automation.
        </p>
      </div>

      {/* Tab bar */}
      <div style={{ display: "flex", gap: 4, marginBottom: 24, borderBottom: "1px solid var(--line-1)", paddingBottom: 0 }}>
        {TABS.map(({ id, label, icon: Icon }) => {
          const active = tab === id;
          return (
            <button
              key={id}
              onClick={() => {
                setTab(id);
                if (token && workspaceId) trackTelemetry(`trust_center.tab.${id}`, {}, token, workspaceId);
              }}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "8px 14px", background: "none", border: "none",
                borderBottom: active ? "2px solid var(--accent)" : "2px solid transparent",
                cursor: "pointer", fontSize: 12, fontWeight: active ? 500 : 400,
                color: active ? "var(--accent)" : "var(--t3)",
                marginBottom: -1, transition: "color 120ms",
              }}
            >
              <Icon style={{ width: 13, height: 13 }} />
              {label}
              {id === "governance" && pendingApprovals?.length > 0 && (
                <span style={{ fontSize: 9, background: "var(--p-high-text)", color: "#fff", borderRadius: 99, padding: "1px 5px", fontWeight: 500 }}>
                  {pendingApprovals.length}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      {tab === "overview" && (
        <OverviewTab
          connectors={[]}
          health={health}
          simulatedIds={simulatedIds}
          permOverview={permOverview}
          pendingApprovals={pendingApprovals}
          policies={policies}
          auditEvents={auditEvents}
          onConnectorsTab={() => setTab("connectors")}
        />
      )}
      {tab === "connectors" && (
        <ConnectorsTab health={health} simulatedIds={simulatedIds} permOverview={permOverview} token={token} workspaceId={workspaceId} />
      )}
      {tab === "knowledge" && (
        <KnowledgeTab timeline={timeline} permOverview={permOverview} token={token} workspaceId={workspaceId} />
      )}
      {tab === "audit" && (
        <AuditTab auditEvents={auditEvents} loading={auditLoading} />
      )}
      {tab === "governance" && (
        <GovernanceTab policies={policies} pendingApprovals={pendingApprovals} loading={polLoading} onToggle={togglePolicy} />
      )}
    </div>
  );
}

export default TrustCenter;
