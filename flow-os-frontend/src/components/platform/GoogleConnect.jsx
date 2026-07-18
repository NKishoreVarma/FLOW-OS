import { useState, useEffect, useCallback } from "react";
import { CheckCircle2, XCircle, RefreshCw, LogOut, ExternalLink, Loader2 } from "lucide-react";
import { useWebSocket } from "../../hooks/useWebSocket";

const GOOGLE_SERVICES = [
  { id: "gmail",    label: "Gmail",           icon: "📧", description: "Inbox, send, reply" },
  { id: "calendar", label: "Google Calendar", icon: "📅", description: "Events, meeting prep" },
  { id: "drive",    label: "Google Drive",    icon: "📁", description: "File search, sync" },
  { id: "docs",     label: "Google Docs",     icon: "📝", description: "Document intelligence" },
  { id: "sheets",   label: "Google Sheets",   icon: "📊", description: "Spreadsheet data" },
  { id: "people",   label: "Google People",   icon: "👥", description: "Contacts, directory" },
];

export default function GoogleConnect({ className = "" }) {
  const { token, workspaceId } = useWebSocket();

  const [status, setStatus]       = useState(null);   // { connected, email, scopes, connectedAt }
  const [loading, setLoading]     = useState(true);
  const [working, setWorking]     = useState(false);
  const [error, setError]         = useState(null);

  const headers = token
    ? { Authorization: `Bearer ${token}`, "workspace-id": workspaceId || "", "Content-Type": "application/json" }
    : {};

  // ── Check connection status ───────────────────────────────────────────────
  const fetchStatus = useCallback(async () => {
    if (!token || !workspaceId) { setLoading(false); return; }
    try {
      const res  = await fetch("/api/google/status", { headers });
      const data = await res.json();
      setStatus(data);
    } catch (err) {
      setError("Could not fetch Google connection status.");
    } finally {
      setLoading(false);
    }
  }, [token, workspaceId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fetchStatus(); }, [fetchStatus]);

  // ── Handle URL params from OAuth redirect ─────────────────────────────────
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("googleConnected") === "true") {
      fetchStatus();
      // Clean up URL
      window.history.replaceState({}, "", window.location.pathname);
    }
    const err = params.get("error");
    if (err) {
      setError(`OAuth error: ${decodeURIComponent(err)}`);
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Connect ───────────────────────────────────────────────────────────────
  const handleConnect = async () => {
    setWorking(true);
    setError(null);
    try {
      const res  = await fetch("/api/google/auth", { headers });
      const data = await res.json();
      if (!data.authUrl) throw new Error("No auth URL returned");
      window.location.href = data.authUrl;
    } catch (err) {
      setError(err.message || "Failed to start Google OAuth");
      setWorking(false);
    }
  };

  // ── Disconnect ────────────────────────────────────────────────────────────
  const handleDisconnect = async () => {
    if (!window.confirm("Disconnect your Google account? All Google services (Gmail, Calendar, Drive, Docs, Sheets) will stop working.")) return;
    setWorking(true);
    setError(null);
    try {
      const res = await fetch("/api/google/disconnect", { method: "POST", headers });
      if (!res.ok) throw new Error("Disconnect request failed");
      await fetchStatus();
    } catch (err) {
      setError(err.message || "Disconnect failed");
    } finally {
      setWorking(false);
    }
  };

  // ── Reconnect ─────────────────────────────────────────────────────────────
  const handleReconnect = async () => {
    setWorking(true);
    setError(null);
    try {
      const res  = await fetch("/api/google/reconnect", { method: "POST", headers });
      const data = await res.json();
      if (!data.authUrl) throw new Error("No auth URL returned");
      window.location.href = data.authUrl;
    } catch (err) {
      setError(err.message || "Reconnect failed");
      setWorking(false);
    }
  };

  if (loading) {
    return (
      <div className={`google-connect-card ${className}`} style={{ display: "flex", alignItems: "center", gap: 8, padding: "16px 20px" }}>
        <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} />
        <span style={{ color: "var(--text-tertiary)", fontSize: 13 }}>Checking Google connection…</span>
      </div>
    );
  }

  const connected = status?.connected;
  const email     = status?.email;
  const connectedAt = status?.connectedAt ? new Date(status.connectedAt).toLocaleDateString() : null;

  return (
    <div className={`google-connect-card ${className}`} style={{
      background:   "var(--bg-card)",
      border:       `1px solid ${connected ? "var(--color-success-border, #2d4a3e)" : "var(--border-subtle)"}`,
      borderRadius: "var(--radius-lg, 12px)",
      padding:      "20px 24px",
      display:      "flex",
      flexDirection:"column",
      gap:          16,
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 28 }}>🔑</span>
          <div>
            <div style={{ fontWeight: 500, fontSize: 15, color: "var(--text-primary)" }}>
              Google Workspace
            </div>
            <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 2 }}>
              {connected
                ? `Connected as ${email || "unknown"}${connectedAt ? ` · since ${connectedAt}` : ""}`
                : "Connect your Google account to enable all 6 Google services"}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {connected
            ? <CheckCircle2 size={18} style={{ color: "var(--color-success, #4ade80)" }} />
            : <XCircle     size={18} style={{ color: "var(--text-tertiary)" }} />}
          <span style={{
            fontSize: 11, fontWeight: 500, letterSpacing: "0.05em",
            color: connected ? "var(--color-success, #4ade80)" : "var(--text-tertiary)",
          }}>
            {connected ? "CONNECTED" : "NOT CONNECTED"}
          </span>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div style={{
          background: "var(--color-danger-bg, rgba(239,68,68,0.1))",
          border:     "1px solid var(--color-danger-border, rgba(239,68,68,0.2))",
          borderRadius: 8, padding: "8px 12px",
          color: "var(--color-danger, #f87171)", fontSize: 12,
        }}>
          {error}
        </div>
      )}

      {/* Services grid */}
      <div style={{
        display:             "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
        gap:                 8,
      }}>
        {GOOGLE_SERVICES.map(svc => (
          <div key={svc.id} style={{
            background:   connected ? "var(--bg-hover, rgba(31,27,22,0.05))" : "var(--bg-subtle, rgba(31,27,22,0.04))",
            border:       `1px solid ${connected ? "var(--border-default)" : "var(--border-subtle)"}`,
            borderRadius: 8, padding: "10px 12px",
            opacity:      connected ? 1 : 0.45,
          }}>
            <div style={{ fontSize: 18, marginBottom: 4 }}>{svc.icon}</div>
            <div style={{ fontSize: 12, fontWeight: 500, color: "var(--text-primary)" }}>{svc.label}</div>
            <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 2 }}>{svc.description}</div>
          </div>
        ))}
      </div>

      {/* Actions */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {!connected && (
          <button
            onClick={handleConnect}
            disabled={working || !token}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              background: "var(--accent)", color: "#fff",
              border: "none", borderRadius: 8, padding: "8px 16px",
              fontSize: 13, fontWeight: 500, cursor: working ? "not-allowed" : "pointer",
              opacity: working ? 0.7 : 1,
            }}
          >
            {working ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> : <ExternalLink size={14} />}
            Connect Google Account
          </button>
        )}

        {connected && (
          <>
            <button
              onClick={handleReconnect}
              disabled={working}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                background: "transparent", color: "var(--text-secondary)",
                border: "1px solid var(--border-default)", borderRadius: 8, padding: "8px 14px",
                fontSize: 12, fontWeight: 500, cursor: working ? "not-allowed" : "pointer",
              }}
            >
              <RefreshCw size={13} />
              Re-authenticate
            </button>
            <button
              onClick={handleDisconnect}
              disabled={working}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                background: "transparent", color: "var(--color-danger, #f87171)",
                border: "1px solid var(--color-danger-border, rgba(239,68,68,0.3))", borderRadius: 8, padding: "8px 14px",
                fontSize: 12, fontWeight: 500, cursor: working ? "not-allowed" : "pointer",
              }}
            >
              <LogOut size={13} />
              Disconnect
            </button>
          </>
        )}
      </div>

      {!token && (
        <p style={{ fontSize: 11, color: "var(--text-tertiary)", margin: 0 }}>
          Log in to manage Google connections.
        </p>
      )}
    </div>
  );
}
