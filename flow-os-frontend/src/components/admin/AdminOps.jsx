import { useState, useEffect } from "react";
import { Plug, Users, Heart, ClipboardList, RefreshCw, UserPlus, CheckCircle2, AlertCircle, XCircle } from "lucide-react";

function authHeaders() {
  return {
    Authorization: `Bearer ${localStorage.getItem("flow_os_token") || ""}`,
    "workspace-id": localStorage.getItem("flow_os_workspace_id") || "",
    "Content-Type": "application/json",
  };
}
async function getJSON(path) {
  const r = await fetch(path, { headers: authHeaders() });
  if (!r.ok) throw new Error(r.status);
  return r.json();
}

const SECTION = { background: "var(--bg-secondary)", border: "1px solid var(--border)", borderRadius: 10, padding: "20px 22px", marginBottom: 20 };
const LABEL = { fontSize: 11, fontWeight: 500, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--t4)", marginBottom: 14 };

function StatusDot({ status }) {
  const color = status === "HEALTHY" ? "var(--p-normal-text)" : status === "DEGRADED" ? "var(--p-high-text)" : "var(--p-critical-text)";
  const Icon = status === "HEALTHY" ? CheckCircle2 : status === "DEGRADED" ? AlertCircle : XCircle;
  return <Icon style={{ width: 14, height: 14, color }} />;
}

export default function AdminOps() {
  const [connectors, setConnectors] = useState([]);
  const [users, setUsers]           = useState([]);
  const [health, setHealth]         = useState(null);
  const [audit, setAudit]           = useState([]);
  const [invite, setInvite]         = useState({ email: "", role: "MEMBER", open: false, loading: false, done: false });
  const [reauthing, setReauthing]   = useState({});

  const load = async () => {
    try {
      const [c, u, s, a] = await Promise.all([
        getJSON("/api/connectors"),
        getJSON("/api/users"),
        getJSON("/api/workspace/snapshot").catch(() => null),
        getJSON("/api/connectors/audit?limit=20").catch(() => ({ entries: [] })),
      ]);
      setConnectors(c.connectors || []);
      setUsers(u.users || u || []);
      setHealth(s);
      setAudit(a.entries || []);
    } catch { /* retain state */ }
  };

  useEffect(() => { load(); }, []);

  const handleReauth = async (id) => {
    setReauthing(p => ({ ...p, [id]: true }));
    try {
      const r = await fetch(`/api/connectors/${id}/auth/initiate`, {
        method: "POST", headers: authHeaders(),
        body: JSON.stringify({ callbackUrl: `${window.location.origin}/admin/ops` }),
      });
      const data = await r.json();
      if (data.authUrl) window.location.assign(data.authUrl);
    } catch { /* ignore */ }
    setReauthing(p => ({ ...p, [id]: false }));
  };

  const handleInvite = async () => {
    if (!invite.email) return;
    setInvite(p => ({ ...p, loading: true }));
    try {
      await fetch("/api/users/invite", {
        method: "POST", headers: authHeaders(),
        body: JSON.stringify({ email: invite.email, role: invite.role }),
      });
      setInvite(p => ({ ...p, loading: false, done: true, email: "" }));
      setTimeout(() => setInvite(p => ({ ...p, done: false, open: false })), 2500);
      load();
    } catch { setInvite(p => ({ ...p, loading: false })); }
  };

  const healthSummary = (() => {
    if (!health) return "Checking workspace health…";
    const domains = Object.values(health.domains || {});
    const atRisk = domains.filter(d => d.status === "at_risk").length;
    if (atRisk === 0) return "Everything looks good — all systems healthy.";
    return `${atRisk} area${atRisk > 1 ? "s" : ""} need${atRisk === 1 ? "s" : ""} attention.`;
  })();

  return (
    <div style={{ padding: "28px 24px 48px", maxWidth: 820, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 28 }}>
        <h1 style={{ margin: 0, fontSize: 18, fontWeight: 500, color: "var(--t1)" }}>Workspace Admin</h1>
        <button onClick={load} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "transparent", color: "var(--t3)", fontSize: 12, cursor: "pointer" }}>
          <RefreshCw style={{ width: 13, height: 13 }} /> Refresh
        </button>
      </div>

      {/* Connections */}
      <div style={SECTION}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, ...LABEL }}>
          <Plug style={{ width: 13, height: 13 }} /> Connections
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {connectors.length === 0 && <p style={{ margin: 0, fontSize: 13, color: "var(--t4)" }}>No connectors registered.</p>}
          {connectors.map(c => (
            <div key={c.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <StatusDot status={c.health?.status || "DOWN"} />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: "var(--t1)" }}>{c.name || c.id}</div>
                  <div style={{ fontSize: 11, color: "var(--t4)" }}>{c.health?.status === "HEALTHY" ? "Connected" : c.health?.status === "DEGRADED" ? "Needs attention" : "Disconnected"}</div>
                </div>
              </div>
              {c.health?.status !== "HEALTHY" && (
                <button onClick={() => handleReauth(c.id)} disabled={reauthing[c.id]} style={{ padding: "5px 12px", borderRadius: 7, background: "var(--brand)", color: "var(--t1)", border: "none", fontSize: 12, fontWeight: 500, cursor: reauthing[c.id] ? "default" : "pointer", opacity: reauthing[c.id] ? 0.6 : 1 }}>
                  {reauthing[c.id] ? "Opening…" : "Reconnect"}
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Team */}
      <div style={SECTION}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, ...LABEL, marginBottom: 0 }}>
            <Users style={{ width: 13, height: 13 }} /> Team
          </div>
          <button onClick={() => setInvite(p => ({ ...p, open: !p.open }))} style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 11px", borderRadius: 7, background: "var(--brand)", color: "var(--t1)", border: "none", fontSize: 12, fontWeight: 500, cursor: "pointer" }}>
            <UserPlus style={{ width: 12, height: 12 }} /> Invite
          </button>
        </div>
        {invite.open && (
          <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
            <input value={invite.email} onChange={e => setInvite(p => ({ ...p, email: e.target.value }))} placeholder="colleague@company.com" style={{ flex: 1, minWidth: 180, padding: "6px 10px", borderRadius: 7, border: "1px solid var(--border)", background: "var(--bg-primary)", color: "var(--t1)", fontSize: 13 }} />
            <select value={invite.role} onChange={e => setInvite(p => ({ ...p, role: e.target.value }))} style={{ padding: "6px 10px", borderRadius: 7, border: "1px solid var(--border)", background: "var(--bg-primary)", color: "var(--t1)", fontSize: 13 }}>
              <option value="MEMBER">Member</option>
              <option value="ADMIN">Admin</option>
            </select>
            <button onClick={handleInvite} disabled={invite.loading} style={{ padding: "6px 14px", borderRadius: 7, background: invite.done ? "var(--p-normal-text)" : "var(--brand)", color: "var(--t1)", border: "none", fontSize: 13, fontWeight: 500, cursor: "pointer" }}>
              {invite.done ? "Invited!" : invite.loading ? "Sending…" : "Send invite"}
            </button>
          </div>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {users.map(u => (
            <div key={u.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13 }}>
              <div>
                <span style={{ color: "var(--t1)", fontWeight: 500 }}>{u.fullName || u.email}</span>
                {u.fullName && <span style={{ color: "var(--t4)", marginLeft: 6 }}>{u.email}</span>}
              </div>
              <span style={{ fontSize: 11, color: "var(--t4)", background: "var(--bg-primary)", padding: "2px 8px", borderRadius: 10 }}>{u.role}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Workspace Health */}
      <div style={SECTION}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, ...LABEL }}>
          <Heart style={{ width: 13, height: 13 }} /> Workspace Health
        </div>
        <p style={{ margin: "0 0 14px", fontSize: 14, color: "var(--t2)" }}>{healthSummary}</p>
        {health?.domains && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px,1fr))", gap: 10 }}>
            {Object.entries(health.domains).map(([key, d]) => (
              <div key={key} style={{ background: "var(--bg-primary)", borderRadius: 8, padding: "10px 12px", border: "1px solid var(--border)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <StatusDot status={d.status === "healthy" ? "HEALTHY" : d.status === "watch" ? "DEGRADED" : "DOWN"} />
                  <span style={{ fontSize: 12, fontWeight: 500, color: "var(--t1)", textTransform: "capitalize" }}>{key}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recent Activity */}
      <div style={SECTION}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, ...LABEL }}>
          <ClipboardList style={{ width: 13, height: 13 }} /> Recent Activity
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {audit.length === 0 && <p style={{ margin: 0, fontSize: 12, color: "var(--t4)" }}>No recent activity.</p>}
          {audit.slice(0, 15).map((e, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
              <span style={{ color: "var(--t2)" }}>{e.action || e.actionType || e.event || "Activity"}{e.connector ? ` · ${e.connector}` : ""}</span>
              <span style={{ color: "var(--t5)", flexShrink: 0, marginLeft: 12 }}>{(e.createdAt || e.ts) ? new Date(e.createdAt || e.ts).toLocaleString() : ""}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
