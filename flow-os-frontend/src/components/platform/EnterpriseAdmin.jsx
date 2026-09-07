import { useState, useEffect } from "react";
import { Building, Users, Server, Link2, RefreshCw, Plus } from "lucide-react";
import { useWebSocket } from "../../hooks/useWebSocket";

const SectionHeader = ({ title, action }) => (
  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid var(--border)", paddingBottom: 10, marginBottom: 14 }}>
    <h2 style={{ fontSize: 9, fontWeight: 500, color: "var(--t1)", textTransform: "uppercase", letterSpacing: "0.10em" }}>{title}</h2>
    {action}
  </div>
);

const StatCard = ({ label, value, icon: Icon, color, bg, loading }) => (
  <div style={{ background: "var(--bg-card)", border: "1px solid var(--border-strong)", borderRadius: 4, padding: "16px 18px", display: "flex", flexDirection: "column", gap: 10 }}>
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      <Icon style={{ width: 16, height: 16, color }} />
      <span style={{ fontSize: 9, fontWeight: 500, color, textTransform: "uppercase", letterSpacing: "0.08em", background: bg, border: `1px solid ${color}30`, padding: "1px 6px", borderRadius: 3 }}>Live</span>
    </div>
    <div>
      {loading ? (
        <div style={{ height: 32, width: 60, borderRadius: 4, background: "rgba(31,27,22,0.05)", position: "relative", overflow: "hidden", marginBottom: 4 }}>
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(90deg, transparent 0%, rgba(31,27,22,0.06) 50%, transparent 100%)", animation: "shimmer-sweep 1.6s ease-in-out infinite" }} />
        </div>
      ) : (
        <span style={{ fontSize: 26, fontWeight: 500, color: "var(--t1)", display: "block", lineHeight: 1, marginBottom: 4 }}>{value}</span>
      )}
      <span style={{ fontSize: 9, fontWeight: 500, color: "var(--t5)", textTransform: "uppercase", letterSpacing: "0.10em" }}>{label}</span>
    </div>
  </div>
);

const EnterpriseAdmin = () => {
  const { token, workspaceId } = useWebSocket();
  const [org, setOrg]             = useState(null);
  const [workspaces, setWorkspaces] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [hWs, setHWs]             = useState(null);
  const [showNewWs, setShowNewWs] = useState(false);
  const [newWsName, setNewWsName] = useState("");
  const [creating, setCreating]   = useState(false);

  const headers = token ? { Authorization: `Bearer ${token}`, "workspace-id": workspaceId || "temp", "Content-Type": "application/json" } : {};

  const fetchAll = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [orgRes, wsRes] = await Promise.all([
        fetch("/api/org", { headers }),
        fetch("/api/org/workspaces", { headers }),
      ]);
      if (orgRes.ok) setOrg(await orgRes.json());
      if (wsRes.ok) setWorkspaces(await wsRes.json());
    } catch {}
    finally { setLoading(false); }
  };

  useEffect(() => { fetchAll(); }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCreateWorkspace = async (e) => {
    e.preventDefault();
    if (!newWsName.trim()) return;
    setCreating(true);
    try {
      const res = await fetch("/api/org/workspaces", {
        method: "POST",
        headers,
        body: JSON.stringify({ name: newWsName.trim() }),
      });
      if (res.ok) {
        const ws = await res.json();
        setWorkspaces(p => [...p, ws]);
        setShowNewWs(false); setNewWsName("");
      }
    } catch {}
    finally { setCreating(false); }
  };

  const stats = [
    { label: "Plan Tier",       value: loading ? "—" : (org?.plan ?? "FREE"),         icon: Server, color: "var(--brand-text)",      bg: "rgba(232,103,43,0.08)"  },
    { label: "Workspaces",      value: loading ? "—" : String(workspaces.length),      icon: Server, color: "var(--p-info-text)",      bg: "rgba(96,165,250,0.08)"   },
    { label: "Organization",    value: loading ? "—" : (org?.name ? org.name.slice(0,12) : "—"), icon: Building, color: "var(--p-normal-text)", bg: "rgba(76,175,130,0.08)" },
    { label: "Users",           value: loading ? "—" : String(org?._count?.users ?? org?.users?.length ?? "—"), icon: Users, color: "var(--p-high-text)", bg: "rgba(255,151,65,0.08)" },
  ];

  return (
    <div style={{ padding: "24px", display: "flex", flexDirection: "column", gap: 24 }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 500, color: "var(--t1)", letterSpacing: "-0.4px", display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
            <Server style={{ width: 22, height: 22, color: "var(--brand)" }} />
            Platform Console
          </h1>
          <p style={{ fontSize: 12, color: "var(--t4)", maxWidth: 520 }}>
            {org ? `${org.name} · ${org.plan ?? "FREE"} Plan` : "Enterprise administration across all tenants, organizations, and workspaces."}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
          <button onClick={fetchAll} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10, color: "var(--t5)", background: "rgba(31,27,22,0.05)", border: "1px solid var(--border)", borderRadius: 4, padding: "6px 10px", cursor: "pointer" }}>
            <RefreshCw style={{ width: 11, height: 11 }} /> Refresh
          </button>
          <button onClick={() => setShowNewWs(true)} style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 4, background: "var(--brand)", border: "none", color: "#fff", fontSize: 11, fontWeight: 500, cursor: "pointer" }}>
            <Plus style={{ width: 13, height: 13 }} /> New Workspace
          </button>
        </div>
      </div>

      {/* Stat cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
        {stats.map(s => <StatCard key={s.label} {...s} loading={loading} />)}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>

        {/* Workspace directory */}
        <div style={{ background: "var(--bg-card)", border: "1px solid var(--border-strong)", borderRadius: 4, padding: "20px" }}>
          <SectionHeader title="Workspace Directory"
            action={<span style={{ fontSize: 9, fontWeight: 500, color: "var(--t5)" }}>{workspaces.length} total</span>}
          />
          {loading ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {[1,2,3].map(i => (
                <div key={i} style={{ height: 44, borderRadius: 4, background: "rgba(31,27,22,0.04)", border: "1px solid var(--border)", position: "relative", overflow: "hidden" }}>
                  <div style={{ position: "absolute", inset: 0, background: "linear-gradient(90deg, transparent 0%, rgba(31,27,22,0.05) 50%, transparent 100%)", animation: "shimmer-sweep 1.6s ease-in-out infinite" }} />
                </div>
              ))}
            </div>
          ) : workspaces.length === 0 ? (
            <div style={{ textAlign: "center", padding: "24px 0", color: "var(--t5)", fontSize: 11 }}>No workspaces yet.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {workspaces.map(ws => (
                <div key={ws.id} onMouseEnter={() => setHWs(ws.id)} onMouseLeave={() => setHWs(null)}
                  style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: hWs === ws.id ? "rgba(31,27,22,0.045)" : "rgba(31,27,22,0.04)", border: `1px solid ${hWs === ws.id ? "var(--border-strong)" : "var(--border)"}`, borderRadius: 4, padding: "10px 12px", transition: "all 80ms" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                    <Building style={{ width: 13, height: 13, color: "var(--t5)", flexShrink: 0 }} />
                    <div style={{ minWidth: 0 }}>
                      <span style={{ display: "block", fontSize: 12, fontWeight: 500, color: "var(--t1)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{ws.name}</span>
                      <span style={{ fontSize: 9, color: "var(--t5)" }}>{ws.externalId}</span>
                    </div>
                  </div>
                  <span style={{ fontSize: 9, fontWeight: 500, color: "var(--p-normal-text)", background: "rgba(76,175,130,0.08)", border: "1px solid rgba(76,175,130,0.22)", padding: "2px 7px", borderRadius: 3, flexShrink: 0, marginLeft: 8 }}>
                    {ws.status ?? "Active"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Org metadata + health */}
        <div style={{ background: "var(--bg-card)", border: "1px solid var(--border-strong)", borderRadius: 4, padding: "20px" }}>
          <SectionHeader title="Organization Profile" />
          {loading ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {[1,2,3].map(i => (
                <div key={i} style={{ height: 44, borderRadius: 4, background: "rgba(31,27,22,0.04)", border: "1px solid var(--border)", position: "relative", overflow: "hidden" }}>
                  <div style={{ position: "absolute", inset: 0, background: "linear-gradient(90deg, transparent 0%, rgba(31,27,22,0.05) 50%, transparent 100%)", animation: "shimmer-sweep 1.6s ease-in-out infinite" }} />
                </div>
              ))}
            </div>
          ) : org ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
              {[
                { label: "Org Name",    value: org.name },
                { label: "Plan",        value: org.plan ?? "FREE" },
                { label: "External ID", value: org.externalId ?? org.id?.slice(0, 12) },
                { label: "Created",     value: org.createdAt ? new Date(org.createdAt).toLocaleDateString() : "—" },
                { label: "Workspaces",  value: String(workspaces.length) },
              ].map((row, i, arr) => (
                <div key={row.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "11px 0", borderBottom: i < arr.length - 1 ? "1px solid var(--border)" : "none" }}>
                  <span style={{ fontSize: 11, color: "var(--t4)" }}>{row.label}</span>
                  <span style={{ fontSize: 11, fontWeight: 500, color: "var(--t1)", fontFamily: row.label === "External ID" ? "'IBM Plex Mono', monospace" : "inherit", fontSize: row.label === "External ID" ? 9 : 11 }}>{row.value}</span>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ padding: "24px 0", textAlign: "center", color: "var(--t5)", fontSize: 11 }}>
              Could not load organization data.
            </div>
          )}
        </div>
      </div>

      {/* New workspace modal */}
      {showNewWs && (
        <div onClick={() => setShowNewWs(false)} style={{ position: "fixed", inset: 0, background: "rgba(31,27,22,0.35)", backdropFilter: "blur(8px)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <form onSubmit={handleCreateWorkspace} onClick={e => e.stopPropagation()}
            style={{ width: "100%", maxWidth: 380, background: "var(--bg-sidebar)", border: "1px solid var(--border-strong)", borderRadius: 5, padding: 24, display: "flex", flexDirection: "column", gap: 14, boxShadow: "0 16px 48px rgba(31,27,22,0.12)" }}>
            <h3 style={{ fontSize: 14, fontWeight: 500, color: "var(--t1)", margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
              <Plus style={{ width: 15, height: 15, color: "var(--brand)" }} /> Create Workspace
            </h3>
            <div>
              <label style={{ display: "block", fontSize: 8, fontWeight: 500, color: "var(--t5)", textTransform: "uppercase", letterSpacing: "0.10em", marginBottom: 5 }}>Workspace Name</label>
              <input type="text" value={newWsName} onChange={e => setNewWsName(e.target.value)} placeholder="Engineering · Product · Finance" required
                style={{ width: "100%", background: "rgba(31,27,22,0.045)", border: "1px solid var(--border-strong)", borderRadius: 4, padding: "7px 10px", fontSize: 12, color: "var(--t1)", outline: "none", boxSizing: "border-box" }} />
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, paddingTop: 4 }}>
              <button type="button" onClick={() => setShowNewWs(false)} style={{ padding: "6px 14px", background: "rgba(31,27,22,0.06)", border: "1px solid var(--border)", borderRadius: 4, fontSize: 11, color: "var(--t3)", cursor: "pointer" }}>Cancel</button>
              <button type="submit" disabled={creating} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 14px", background: "var(--brand)", border: "none", borderRadius: 4, fontSize: 11, fontWeight: 500, color: "#fff", cursor: creating ? "not-allowed" : "pointer", opacity: creating ? 0.6 : 1 }}>
                {creating ? "Creating…" : "Create"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

export default EnterpriseAdmin;
