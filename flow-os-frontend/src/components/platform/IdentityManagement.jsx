import { useState, useEffect } from "react";
import { Key, CheckCircle2, ShieldCheck, Smartphone, UserPlus, Trash2, RefreshCw, Users } from "lucide-react";
import { useWebSocket } from "../../hooks/useWebSocket";

const ROLE_COLORS = {
  OWNER:     { color: "var(--p-critical-text)",  bg: "rgba(255,87,87,0.08)",   border: "rgba(255,87,87,0.22)"   },
  ADMIN:     { color: "var(--p-high-text)",       bg: "rgba(255,151,65,0.08)",  border: "rgba(255,151,65,0.22)"  },
  MEMBER:    { color: "var(--t3)",                bg: "rgba(31,27,22,0.05)", border: "var(--border)"          },
  EXECUTIVE: { color: "var(--brand-text)",        bg: "rgba(232,103,43,0.08)", border: "rgba(232,103,43,0.22)" },
  MANAGER:   { color: "var(--p-info-text)",       bg: "rgba(91,158,255,0.08)",  border: "rgba(91,158,255,0.22)"  },
};

const Toggle = ({ on, onClick }) => (
  <div onClick={onClick} style={{ width: 36, height: 20, borderRadius: 10, background: on ? "var(--p-normal)" : "rgba(31,27,22,0.06)", border: on ? "1px solid rgba(76,175,130,0.40)" : "1px solid var(--border)", position: "relative", flexShrink: 0, cursor: "pointer", transition: "background 150ms" }}>
    <div style={{ position: "absolute", top: 2, [on ? "right" : "left"]: 2, width: 14, height: 14, borderRadius: "50%", background: "#fff", transition: "all 150ms" }} />
  </div>
);

const CardHeader = ({ icon: Icon, iconColor, title }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 8, borderBottom: "1px solid var(--border)", paddingBottom: 12, marginBottom: 18 }}>
    <Icon style={{ width: 15, height: 15, color: iconColor }} />
    <h2 style={{ fontSize: 9, fontWeight: 500, color: "var(--t1)", textTransform: "uppercase", letterSpacing: "0.10em" }}>{title}</h2>
  </div>
);

function RoleBadge({ role }) {
  const s = ROLE_COLORS[role] ?? ROLE_COLORS.MEMBER;
  return (
    <span style={{ fontSize: 8, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.08em", padding: "2px 7px", borderRadius: 3, color: s.color, background: s.bg, border: `1px solid ${s.border}` }}>
      {role}
    </span>
  );
}

const IdentityManagement = () => {
  const { token, workspaceId } = useWebSocket();
  const [users, setUsers]           = useState([]);
  const [loading, setLoading]       = useState(true);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail]     = useState("");
  const [inviteRole, setInviteRole]       = useState("MEMBER");
  const [inviteFullName, setInviteFullName] = useState("");
  const [inviting, setInviting]     = useState(false);
  const [mfa, setMfa]               = useState(true);
  const [scim, setScim]             = useState(true);
  const [hRow, setHRow]             = useState(null);

  const fetchUsers = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch("/api/users", {
        headers: { Authorization: `Bearer ${token}`, "workspace-id": workspaceId || "temp" },
      });
      if (res.ok) setUsers(await res.json());
    } catch {}
    finally { setLoading(false); }
  };

  useEffect(() => { fetchUsers(); }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleInvite = async (e) => {
    e.preventDefault();
    if (!inviteEmail || !inviteFullName) return;
    setInviting(true);
    try {
      const res = await fetch("/api/users/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, "workspace-id": workspaceId || "temp" },
        body: JSON.stringify({ email: inviteEmail, fullName: inviteFullName, role: inviteRole }),
      });
      if (res.ok) {
        setShowInvite(false); setInviteEmail(""); setInviteFullName(""); setInviteRole("MEMBER");
        await fetchUsers();
      }
    } catch {}
    finally { setInviting(false); }
  };

  const handleUpdateRole = async (userId, newRole) => {
    try {
      await fetch(`/api/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, "workspace-id": workspaceId || "temp" },
        body: JSON.stringify({ role: newRole }),
      });
      setUsers(p => p.map(u => u.id === userId ? { ...u, role: newRole } : u));
    } catch {}
  };

  const handleRemove = async (userId) => {
    if (!confirm("Remove this user from the organization?")) return;
    try {
      await fetch(`/api/users/${userId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}`, "workspace-id": workspaceId || "temp" },
      });
      setUsers(p => p.filter(u => u.id !== userId));
    } catch {}
  };

  const inputSt = { width: "100%", background: "rgba(31,27,22,0.045)", border: "1px solid var(--border-strong)", borderRadius: 4, padding: "7px 10px", fontSize: 12, color: "var(--t1)", outline: "none", boxSizing: "border-box" };

  return (
    <div style={{ padding: "24px", display: "flex", flexDirection: "column", gap: 24 }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 500, color: "var(--t1)", letterSpacing: "-0.4px", display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
            <Key style={{ width: 22, height: 22, color: "var(--brand)" }} />
            Identity & Access
          </h1>
          <p style={{ fontSize: 12, color: "var(--t4)" }}>
            Manage organization members, roles, and authentication settings.
          </p>
        </div>
        <button onClick={() => setShowInvite(true)} style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 4, background: "var(--brand)", border: "none", color: "#fff", fontSize: 11, fontWeight: 500, cursor: "pointer", flexShrink: 0 }}>
          <UserPlus style={{ width: 13, height: 13 }} /> Invite Member
        </button>
      </div>

      {/* Members list */}
      <div style={{ background: "var(--bg-card)", border: "1px solid var(--border-strong)", borderRadius: 4, padding: "20px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, borderBottom: "1px solid var(--border)", paddingBottom: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Users style={{ width: 14, height: 14, color: "var(--brand)" }} />
            <h2 style={{ fontSize: 9, fontWeight: 500, color: "var(--t1)", textTransform: "uppercase", letterSpacing: "0.10em" }}>
              Organization Members
            </h2>
            <span style={{ fontSize: 9, fontWeight: 500, background: "rgba(232,103,43,0.10)", border: "1px solid rgba(232,103,43,0.22)", color: "var(--brand-text)", padding: "1px 6px", borderRadius: 10 }}>
              {users.length}
            </span>
          </div>
          <button onClick={fetchUsers} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10, color: "var(--t5)", background: "none", border: "none", cursor: "pointer" }}>
            <RefreshCw style={{ width: 11, height: 11 }} /> Refresh
          </button>
        </div>

        {loading ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {[1,2,3].map(i => (
              <div key={i} style={{ height: 48, borderRadius: 4, background: "rgba(31,27,22,0.04)", border: "1px solid var(--border)", position: "relative", overflow: "hidden" }}>
                <div style={{ position: "absolute", inset: 0, background: "linear-gradient(90deg, transparent 0%, rgba(31,27,22,0.05) 50%, transparent 100%)", animation: "shimmer-sweep 1.6s ease-in-out infinite" }} />
              </div>
            ))}
          </div>
        ) : users.length === 0 ? (
          <div style={{ textAlign: "center", padding: "32px 0", color: "var(--t5)", fontSize: 11 }}>
            No members found. Invite your first team member.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {users.map(user => (
              <div key={user.id}
                onMouseEnter={() => setHRow(user.id)} onMouseLeave={() => setHRow(null)}
                style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", background: hRow === user.id ? "rgba(31,27,22,0.04)" : "transparent", border: `1px solid ${hRow === user.id ? "var(--border)" : "transparent"}`, borderRadius: 4, transition: "all 80ms" }}>
                {/* Avatar */}
                <div style={{ width: 30, height: 30, borderRadius: "50%", background: "rgba(232,103,43,0.10)", border: "1px solid rgba(232,103,43,0.22)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <span style={{ fontSize: 10, fontWeight: 500, color: "var(--brand-text)" }}>
                    {(user.fullName || user.email || "?").charAt(0).toUpperCase()}
                  </span>
                </div>
                {/* Name + email */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: 12, fontWeight: 500, color: "var(--t1)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {user.fullName || user.email}
                  </span>
                  <span style={{ fontSize: 10, color: "var(--t5)" }}>{user.email}</span>
                </div>
                {/* Role selector */}
                <select value={user.role} onChange={e => handleUpdateRole(user.id, e.target.value)}
                  style={{ background: "rgba(31,27,22,0.045)", border: "1px solid var(--border)", color: "var(--t2)", borderRadius: 4, padding: "4px 8px", fontSize: 10, outline: "none", cursor: "pointer" }}>
                  {["OWNER","ADMIN","MANAGER","EXECUTIVE","MEMBER"].map(r => <option key={r} value={r}>{r}</option>)}
                </select>
                <RoleBadge role={user.role} />
                {/* Remove */}
                {user.role !== "OWNER" && (
                  <button onClick={() => handleRemove(user.id)}
                    style={{ background: "none", border: "none", color: hRow === user.id ? "var(--p-critical)" : "transparent", cursor: "pointer", padding: 4, borderRadius: 3, display: "flex", alignItems: "center", transition: "color 80ms" }}>
                    <Trash2 style={{ width: 13, height: 13 }} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Auth + Security (kept for enterprise UI completeness) */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <div style={{ background: "var(--bg-card)", border: "1px solid var(--border-strong)", borderRadius: 4, padding: "20px" }}>
          <CardHeader icon={ShieldCheck} iconColor="var(--p-normal)" title="Authentication Methods" />
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {[
              { name: "Okta SAML 2.0", desc: "Primary SSO Provider for internal employees.", active: true },
              { name: "Microsoft Entra ID (OIDC)", desc: "Secondary SSO Provider for contractors.", active: false },
            ].map((m, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "rgba(31,27,22,0.04)", border: "1px solid var(--border)", borderRadius: 4, padding: "12px 14px" }}>
                <div>
                  <span style={{ display: "block", fontSize: 13, fontWeight: 500, color: "var(--t1)", marginBottom: 2 }}>{m.name}</span>
                  <span style={{ fontSize: 11, color: "var(--t4)" }}>{m.desc}</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0, marginLeft: 12 }}>
                  {m.active && (
                    <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 9, fontWeight: 500, color: "var(--p-normal-text)" }}>
                      <CheckCircle2 style={{ width: 10, height: 10 }} /> Active
                    </span>
                  )}
                  <button style={{ fontSize: 11, color: "var(--t3)", background: "rgba(31,27,22,0.05)", border: "1px solid var(--border)", borderRadius: 4, padding: "4px 10px", cursor: "pointer" }}>
                    {m.active ? "Configure" : "Enable"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ background: "var(--bg-card)", border: "1px solid var(--border-strong)", borderRadius: 4, padding: "20px" }}>
          <CardHeader icon={Smartphone} iconColor="var(--brand)" title="Security Policies" />
          <div style={{ display: "flex", flexDirection: "column" }}>
            {[
              { label: "Require MFA", desc: "Enforce MFA for all user logins.", val: mfa, set: setMfa },
              { label: "SCIM Auto-Provisioning", desc: "Sync users and groups from Okta automatically.", val: scim, set: setScim },
            ].map((row, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, padding: "14px 0", borderBottom: i < 1 ? "1px solid var(--border)" : "none" }}>
                <div>
                  <span style={{ display: "block", fontSize: 13, fontWeight: 500, color: "var(--t1)", marginBottom: 2 }}>{row.label}</span>
                  <span style={{ fontSize: 11, color: "var(--t4)" }}>{row.desc}</span>
                </div>
                <Toggle on={row.val} onClick={() => row.set(p => !p)} />
              </div>
            ))}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, paddingTop: 14 }}>
              <div>
                <span style={{ display: "block", fontSize: 13, fontWeight: 500, color: "var(--t1)", marginBottom: 2 }}>Session Timeout</span>
                <span style={{ fontSize: 11, color: "var(--t4)" }}>Require re-auth after inactivity.</span>
              </div>
              <select style={{ background: "rgba(31,27,22,0.045)", border: "1px solid var(--border-strong)", color: "var(--t1)", borderRadius: 4, padding: "4px 8px", fontSize: 11, outline: "none" }}>
                <option>4 Hours</option><option>8 Hours</option><option>24 Hours</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Invite modal */}
      {showInvite && (
        <div onClick={() => setShowInvite(false)} style={{ position: "fixed", inset: 0, background: "rgba(31,27,22,0.35)", backdropFilter: "blur(8px)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <form onSubmit={handleInvite} onClick={e => e.stopPropagation()}
            style={{ width: "100%", maxWidth: 400, background: "var(--bg-sidebar)", border: "1px solid var(--border-strong)", borderRadius: 5, padding: 24, display: "flex", flexDirection: "column", gap: 14, boxShadow: "0 16px 48px rgba(31,27,22,0.12)" }}>
            <h3 style={{ fontSize: 14, fontWeight: 500, color: "var(--t1)", margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
              <UserPlus style={{ width: 15, height: 15, color: "var(--brand)" }} /> Invite Team Member
            </h3>
            <div>
              <label style={{ display: "block", fontSize: 8, fontWeight: 500, color: "var(--t5)", textTransform: "uppercase", letterSpacing: "0.10em", marginBottom: 5 }}>Full Name</label>
              <input type="text" value={inviteFullName} onChange={e => setInviteFullName(e.target.value)} placeholder="Jane Smith" required style={inputSt} />
            </div>
            <div>
              <label style={{ display: "block", fontSize: 8, fontWeight: 500, color: "var(--t5)", textTransform: "uppercase", letterSpacing: "0.10em", marginBottom: 5 }}>Email Address</label>
              <input type="email" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} placeholder="jane@company.com" required style={inputSt} />
            </div>
            <div>
              <label style={{ display: "block", fontSize: 8, fontWeight: 500, color: "var(--t5)", textTransform: "uppercase", letterSpacing: "0.10em", marginBottom: 5 }}>Role</label>
              <select value={inviteRole} onChange={e => setInviteRole(e.target.value)} style={{ ...inputSt }}>
                <option value="MEMBER">Member</option>
                <option value="ADMIN">Admin</option>
                <option value="EXECUTIVE">Executive</option>
                <option value="MANAGER">Manager</option>
              </select>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, paddingTop: 4 }}>
              <button type="button" onClick={() => setShowInvite(false)} style={{ padding: "6px 14px", background: "rgba(31,27,22,0.06)", border: "1px solid var(--border)", borderRadius: 4, fontSize: 11, color: "var(--t3)", cursor: "pointer" }}>Cancel</button>
              <button type="submit" disabled={inviting} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 14px", background: "var(--brand)", border: "none", borderRadius: 4, fontSize: 11, fontWeight: 500, color: "#fff", cursor: inviting ? "not-allowed" : "pointer", opacity: inviting ? 0.6 : 1 }}>
                {inviting ? "Inviting…" : "Send Invite"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

export default IdentityManagement;
