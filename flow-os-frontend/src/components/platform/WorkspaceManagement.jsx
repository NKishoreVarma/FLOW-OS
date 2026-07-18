import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  LayoutGrid, Database, Copy, Globe, Shield, RefreshCw, Trash2, Archive,
  Plus, Sparkles, Sliders, Lock
} from "lucide-react";
import { useWebSocket } from "../../hooks/useWebSocket";

const Toggle = ({ on }) => (
  <div style={{ width: 36, height: 20, borderRadius: 10, background: on ? "var(--p-normal)" : "rgba(31,27,22,0.06)", border: on ? "1px solid rgba(76,175,130,0.40)" : "1px solid var(--border)", position: "relative", flexShrink: 0, cursor: "pointer" }}>
    <div style={{ position: "absolute", top: 2, [on ? "right" : "left"]: 2, width: 14, height: 14, borderRadius: "50%", background: "#fff" }} />
  </div>
);

const SelectField = ({ label, value, onChange, children }) => (
  <div style={{ marginBottom: 12 }}>
    <label style={{ display: "block", fontSize: 8, fontWeight: 500, color: "var(--t5)", textTransform: "uppercase", letterSpacing: "0.10em", marginBottom: 5 }}>{label}</label>
    <select value={value} onChange={e => onChange(e.target.value)} style={{ width: "100%", background: "rgba(31,27,22,0.045)", border: "1px solid var(--border-strong)", color: "var(--t1)", borderRadius: 4, padding: "7px 10px", fontSize: 12, outline: "none" }}>
      {children}
    </select>
  </div>
);

const WorkspaceManagement = () => {
  const navigate  = useNavigate();
  const { token, isAuthLoading } = useWebSocket();

  const [workspaces, setWorkspaces]     = useState([]);
  const [loading, setLoading]           = useState(true);
  const [showCloneModal, setShowCloneModal] = useState(false);
  const [sourceWsId, setSourceWsId]     = useState("");
  const [newWsName, setNewWsName]       = useState("");
  const [cloning, setCloning]           = useState(false);
  const [hBtn, setHBtn]                 = useState(null);

  const [retention, setRetention]           = useState("1 Year");
  const [aiProvider, setAiProvider]         = useState("gemini");
  const [modelName, setModelName]           = useState("gemini-2.5-flash");
  const [briefingCadence, setBriefingCadence] = useState("daily");

  const fetchWorkspaces = async () => {
    if (!token) { setLoading(false); return; }
    try {
      const res = await fetch("/api/org/workspaces", { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) { const body = await res.json(); setWorkspaces(body || []); }
    } catch {}
    finally { setLoading(false); }
  };

  useEffect(() => {
    if (!isAuthLoading) { setTimeout(() => fetchWorkspaces(), 0); }
  }, [isAuthLoading, token]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCloneWorkspace = async () => {
    if (!token || !sourceWsId || !newWsName.trim()) return;
    setCloning(true);
    try {
      const res = await fetch(`/api/org/workspaces/${sourceWsId}/clone`, {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ name: newWsName })
      });
      if (res.ok) { await fetchWorkspaces(); setShowCloneModal(false); setNewWsName(""); setSourceWsId(""); }
    } catch {}
    finally { setCloning(false); }
  };

  const handleArchiveWorkspace = async (extId) => {
    if (!token) return;
    try {
      const res = await fetch(`/api/org/workspaces/${extId}/archive`, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) { alert(`Workspace ${extId} successfully archived!`); await fetchWorkspaces(); }
    } catch {}
  };

  const handleDeleteWorkspace = async (extId) => {
    if (!token || !confirm("Are you absolutely sure you want to delete this workspace and all its data? This action is irreversible.")) return;
    try {
      const res = await fetch(`/api/org/workspaces/${extId}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) { await fetchWorkspaces(); }
    } catch {}
  };

  if (loading) {
    return (
      <div style={{ padding: "32px 24px" }}>
        {[64, 380].map((h, i) => (
          <div key={i} style={{ height: h, borderRadius: 4, background: "var(--bg-card)", border: "1px solid var(--border)", marginBottom: 16, position: "relative", overflow: "hidden" }}>
            <div style={{ position: "absolute", inset: 0, background: "linear-gradient(90deg, transparent 0%, rgba(31,27,22,0.05) 50%, transparent 100%)", animation: "shimmer-sweep 1.6s ease-in-out infinite" }} />
          </div>
        ))}
      </div>
    );
  }

  const CardHead = ({ icon: Icon, title }) => (
    <div style={{ display: "flex", alignItems: "center", gap: 8, borderBottom: "1px solid var(--border)", paddingBottom: 10, marginBottom: 16 }}>
      <Icon style={{ width: 14, height: 14, color: "var(--brand)" }} />
      <h2 style={{ fontSize: 9, fontWeight: 500, color: "var(--t1)", textTransform: "uppercase", letterSpacing: "0.10em" }}>{title}</h2>
    </div>
  );

  return (
    <div style={{ padding: "24px", display: "flex", flexDirection: "column", gap: 24 }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 500, color: "var(--t1)", letterSpacing: "-0.4px", display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
            <LayoutGrid style={{ width: 22, height: 22, color: "var(--brand)" }} />
            Workspace Management
          </h1>
          <p style={{ fontSize: 12, color: "var(--t4)", maxWidth: 520 }}>
            Configure tenant isolation, database replication, metadata schema rules, and permissions settings.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
          <button
            onClick={fetchWorkspaces}
            style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--t3)", background: "rgba(31,27,22,0.05)", border: "1px solid var(--border)", borderRadius: 4, padding: "6px 12px", cursor: "pointer" }}
          >
            <RefreshCw style={{ width: 12, height: 12 }} /> Refresh
          </button>
          <button
            onClick={() => navigate("/platform/onboarding")}
            style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "#fff", background: "var(--brand)", border: "none", borderRadius: 4, padding: "6px 12px", cursor: "pointer", fontWeight: 500 }}
          >
            <Plus style={{ width: 13, height: 13 }} /> Add Workspace
          </button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 14 }}>

        {/* Workspace list */}
        <div style={{ background: "var(--bg-card)", border: "1px solid var(--border-strong)", borderRadius: 4, padding: "20px" }}>
          <h2 style={{ fontSize: 9, fontWeight: 500, color: "var(--t1)", textTransform: "uppercase", letterSpacing: "0.10em", borderBottom: "1px solid var(--border)", paddingBottom: 10, marginBottom: 16 }}>Active Tenant Workspaces</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {workspaces.length === 0 && (
              <p style={{ fontSize: 12, color: "var(--t5)", textAlign: "center", padding: "24px 0" }}>No workspaces found. Create one to get started.</p>
            )}
            {workspaces.map(ws => (
              <div key={ws.id} style={{ background: "rgba(31,27,22,0.04)", border: "1px solid var(--border)", borderRadius: 4, padding: "12px 14px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    <Database style={{ width: 13, height: 13, color: "var(--brand)" }} />
                    <span style={{ fontSize: 13, fontWeight: 500, color: "var(--t1)" }}>{ws.name}</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 9, fontWeight: 500, color: "var(--t5)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                    <span style={{ color: "var(--brand-text)" }}>{ws.externalId}</span>
                    <span>•</span>
                    <span style={{ display: "flex", alignItems: "center", gap: 4 }}><Globe style={{ width: 10, height: 10 }} />us-east-1</span>
                    <span>•</span>
                    <span style={{ display: "flex", alignItems: "center", gap: 4 }}><Shield style={{ width: 10, height: 10, color: "var(--p-normal)" }} />Dedicated DB</span>
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                  <button
                    onClick={() => { setSourceWsId(ws.externalId); setShowCloneModal(true); }}
                    onMouseEnter={() => setHBtn(`clone-${ws.id}`)}
                    onMouseLeave={() => setHBtn(null)}
                    style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 10px", background: hBtn === `clone-${ws.id}` ? "var(--bg-hover)" : "rgba(31,27,22,0.05)", border: "1px solid var(--border)", borderRadius: 4, fontSize: 11, color: "var(--t2)", cursor: "pointer" }}
                  >
                    <Copy style={{ width: 11, height: 11 }} /> Clone
                  </button>
                  <button
                    onClick={() => handleArchiveWorkspace(ws.externalId)}
                    onMouseEnter={() => setHBtn(`arch-${ws.id}`)}
                    onMouseLeave={() => setHBtn(null)}
                    style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 10px", background: hBtn === `arch-${ws.id}` ? "rgba(255,151,65,0.08)" : "rgba(31,27,22,0.05)", border: "1px solid var(--border)", borderRadius: 4, fontSize: 11, color: hBtn === `arch-${ws.id}` ? "var(--p-high-text)" : "var(--t4)", cursor: "pointer" }}
                  >
                    <Archive style={{ width: 11, height: 11 }} /> Archive
                  </button>
                  <button
                    onClick={() => handleDeleteWorkspace(ws.externalId)}
                    onMouseEnter={() => setHBtn(`del-${ws.id}`)}
                    onMouseLeave={() => setHBtn(null)}
                    style={{ padding: "5px 8px", background: hBtn === `del-${ws.id}` ? "rgba(255,87,87,0.08)" : "transparent", border: "1px solid transparent", borderRadius: 4, color: hBtn === `del-${ws.id}` ? "var(--p-critical-text)" : "var(--t5)", cursor: "pointer", display: "flex" }}
                  >
                    <Trash2 style={{ width: 12, height: 12 }} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Settings sidebar */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

          {/* AI Settings */}
          <div style={{ background: "var(--bg-card)", border: "1px solid var(--border-strong)", borderRadius: 4, padding: "20px" }}>
            <CardHead icon={Sparkles} title="AI Configuration Settings" />
            <SelectField label="AI Provider" value={aiProvider} onChange={setAiProvider}>
              <option value="gemini">Google Gemini API</option>
              <option value="openai">OpenAI GPT-4</option>
              <option value="anthropic">Anthropic Claude</option>
            </SelectField>
            <SelectField label="Model Name" value={modelName} onChange={setModelName}>
              <option value="gemini-2.5-flash">gemini-2.5-flash (Default)</option>
              <option value="gemini-2.5-pro">gemini-2.5-pro</option>
              <option value="gpt-4o">gpt-4o</option>
            </SelectField>
            <SelectField label="Briefing Cadence" value={briefingCadence} onChange={setBriefingCadence}>
              <option value="daily">Every Morning (Daily)</option>
              <option value="weekly">Weekly Rollup Summary</option>
              <option value="custom">Real-time Continuous</option>
            </SelectField>
          </div>

          {/* Retention */}
          <div style={{ background: "var(--bg-card)", border: "1px solid var(--border-strong)", borderRadius: 4, padding: "20px" }}>
            <CardHead icon={Sliders} title="Retention Policies" />
            <SelectField label="Data Retention Window" value={retention} onChange={setRetention}>
              <option value="90 Days">90 Days</option>
              <option value="1 Year">1 Year</option>
              <option value="7 Years">7 Years (Compliance Lock)</option>
              <option value="indefinite">Indefinite</option>
            </SelectField>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, borderTop: "1px solid var(--border)", paddingTop: 14 }}>
              <div>
                <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 500, color: "var(--t1)", marginBottom: 2 }}>
                  <Lock style={{ width: 11, height: 11, color: "var(--brand)" }} /> Strict PII Scans
                </span>
                <span style={{ fontSize: 10, color: "var(--t4)" }}>Hard drop salary/identity patterns immediately.</span>
              </div>
              <Toggle on={true} />
            </div>
          </div>
        </div>
      </div>

      {/* Clone modal */}
      {showCloneModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(31,27,22,0.35)", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: 16 }} onClick={() => setShowCloneModal(false)}>
          <div onClick={e => e.stopPropagation()} style={{ width: "100%", maxWidth: 420, background: "var(--bg-sidebar)", border: "1px solid var(--border-strong)", borderRadius: 6, padding: "24px", boxShadow: "0 24px 64px rgba(31,27,22,0.35)" }}>
            <h3 style={{ fontSize: 15, fontWeight: 500, color: "var(--t1)", display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <Copy style={{ width: 16, height: 16, color: "var(--brand)" }} /> Clone Workspace
            </h3>
            <p style={{ fontSize: 12, color: "var(--t4)", lineHeight: 1.5, marginBottom: 16 }}>
              Generate a sandbox replica of workspace <span style={{ color: "var(--brand-text)" }}>{sourceWsId}</span>, cloning all nodes, edges, memories, and integrations.
            </p>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "block", fontSize: 8, fontWeight: 500, color: "var(--t5)", textTransform: "uppercase", letterSpacing: "0.10em", marginBottom: 5 }}>New Workspace Name</label>
              <input
                type="text"
                value={newWsName}
                onChange={e => setNewWsName(e.target.value)}
                placeholder="Sandbox Copy"
                style={{ width: "100%", background: "rgba(31,27,22,0.045)", border: "1px solid var(--border-strong)", borderRadius: 4, padding: "7px 10px", fontSize: 12, color: "var(--t1)", outline: "none", boxSizing: "border-box" }}
              />
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button onClick={() => setShowCloneModal(false)} style={{ padding: "7px 14px", borderRadius: 4, background: "rgba(31,27,22,0.05)", border: "1px solid var(--border)", color: "var(--t3)", fontSize: 12, cursor: "pointer" }}>Cancel</button>
              <button
                onClick={handleCloneWorkspace}
                disabled={cloning || !newWsName.trim()}
                style={{ padding: "7px 14px", borderRadius: 4, background: "var(--brand)", border: "none", color: "#fff", fontSize: 12, fontWeight: 500, cursor: (cloning || !newWsName.trim()) ? "not-allowed" : "pointer", opacity: (cloning || !newWsName.trim()) ? 0.6 : 1 }}
              >
                {cloning ? "Cloning…" : "Clone Workspace"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default WorkspaceManagement;
