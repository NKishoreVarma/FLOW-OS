import { useState, useEffect } from "react";
import { BrainCircuit, Sliders, ShieldAlert, Cpu, Plus, Trash2, RefreshCw } from "lucide-react";
import { useWebSocket } from "../../hooks/useWebSocket";

const Toggle = ({ on, onClick }) => (
  <div onClick={onClick} style={{ width: 36, height: 20, borderRadius: 10, background: on ? "var(--p-normal)" : "rgba(31,27,22,0.06)", border: on ? "1px solid rgba(76,175,130,0.40)" : "1px solid var(--border)", position: "relative", flexShrink: 0, cursor: "pointer", transition: "background 150ms" }}>
    <div style={{ position: "absolute", top: 2, [on ? "right" : "left"]: 2, width: 14, height: 14, borderRadius: "50%", background: "#fff", transition: "all 150ms" }} />
  </div>
);

const CardHeader = ({ icon: Icon, title, action }) => (
  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, borderBottom: "1px solid var(--border)", paddingBottom: 12, marginBottom: 18 }}>
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <Icon style={{ width: 16, height: 16, color: "var(--brand)" }} />
      <h2 style={{ fontSize: 9, fontWeight: 500, color: "var(--t1)", textTransform: "uppercase", letterSpacing: "0.10em" }}>{title}</h2>
    </div>
    {action}
  </div>
);

const EFFECT_STYLE = {
  ALLOW:            { color: "var(--p-normal-text)",    bg: "rgba(76,175,130,0.08)",   border: "rgba(76,175,130,0.22)"   },
  DENY:             { color: "var(--p-critical-text)",  bg: "rgba(255,87,87,0.08)",    border: "rgba(255,87,87,0.22)"    },
  REQUIRE_APPROVAL: { color: "var(--p-high-text)",      bg: "rgba(255,151,65,0.08)",   border: "rgba(255,151,65,0.22)"   },
};

const AIGovernance = () => {
  const { token, workspaceId } = useWebSocket();
  const [policies, setPolicies] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [hPol, setHPol]         = useState(null);
  const [citationThreshold, setCitationThreshold] = useState(95);
  const [hitl, setHitl]         = useState(true);
  const [zeroData, setZeroData] = useState(true);

  const headers = token ? { Authorization: `Bearer ${token}`, "workspace-id": workspaceId || "temp", "Content-Type": "application/json" } : {};

  const fetchPolicies = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch("/api/policies", { headers });
      if (res.ok) {
        const data = await res.json();
        setPolicies(Array.isArray(data) ? data : (data.policies ?? []));
      }
    } catch {}
    finally { setLoading(false); }
  };

  useEffect(() => { fetchPolicies(); }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  const togglePolicy = async (policy) => {
    try {
      const res = await fetch(`/api/policies/${policy.id}/toggle`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ enabled: !policy.enabled }),
      });
      if (res.ok) {
        setPolicies(p => p.map(pl => pl.id === policy.id ? { ...pl, enabled: !pl.enabled } : pl));
      }
    } catch {}
  };

  const deletePolicy = async (id) => {
    if (!confirm("Delete this governance policy?")) return;
    try {
      await fetch(`/api/policies/${id}`, { method: "DELETE", headers });
      setPolicies(p => p.filter(pl => pl.id !== id));
    } catch {}
  };

  const effectSt = (effect) => EFFECT_STYLE[effect] ?? { color: "var(--t5)", bg: "rgba(31,27,22,0.05)", border: "var(--border)" };

  return (
    <div style={{ padding: "24px", display: "flex", flexDirection: "column", gap: 24 }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 500, color: "var(--t1)", letterSpacing: "-0.4px", display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
            <BrainCircuit style={{ width: 22, height: 22, color: "var(--brand)" }} />
            AI Governance
          </h1>
          <p style={{ fontSize: 12, color: "var(--t4)", maxWidth: 520 }}>
            Control foundation models, prompt policies, citation thresholds, and governance rules.
          </p>
        </div>
        <button onClick={fetchPolicies} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10, color: "var(--t5)", background: "rgba(31,27,22,0.05)", border: "1px solid var(--border)", borderRadius: 4, padding: "6px 10px", cursor: "pointer", flexShrink: 0 }}>
          <RefreshCw style={{ width: 11, height: 11 }} /> Refresh
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>

        {/* Foundation Models — static, reflects actual deployed config */}
        <div style={{ background: "var(--bg-card)", border: "1px solid var(--border-strong)", borderRadius: 4, padding: "20px" }}>
          <CardHeader icon={Cpu} title="Foundation Models" />
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px", background: "rgba(232,103,43,0.05)", border: "1px solid rgba(232,103,43,0.22)", borderRadius: 4 }}>
              <div>
                <span style={{ display: "block", fontSize: 13, fontWeight: 500, color: "var(--t1)", marginBottom: 2 }}>Gemini 2.5 Flash</span>
                <span style={{ fontSize: 11, color: "var(--t4)" }}>Privacy gate, synthesis, briefings, copilot</span>
              </div>
              <span style={{ fontSize: 9, fontWeight: 500, color: "var(--brand-text)", background: "rgba(232,103,43,0.10)", border: "1px solid rgba(232,103,43,0.22)", padding: "2px 8px", borderRadius: 3, flexShrink: 0 }}>Active</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px", background: "rgba(31,27,22,0.04)", border: "1px solid var(--border)", borderRadius: 4 }}>
              <div>
                <span style={{ display: "block", fontSize: 13, fontWeight: 500, color: "var(--t1)", marginBottom: 2 }}>Gemini Embedding 2</span>
                <span style={{ fontSize: 11, color: "var(--t4)" }}>768-dim vectors for pgvector semantic search</span>
              </div>
              <Toggle on={true} onClick={() => {}} />
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px", background: "rgba(31,27,22,0.04)", border: "1px solid var(--border)", borderRadius: 4, opacity: 0.45 }}>
              <div>
                <span style={{ display: "block", fontSize: 13, fontWeight: 500, color: "var(--t1)", marginBottom: 2 }}>Claude Sonnet 4.6</span>
                <span style={{ fontSize: 11, color: "var(--t4)" }}>External model — not configured</span>
              </div>
              <Toggle on={false} onClick={() => {}} />
            </div>
          </div>
        </div>

        {/* System Policies — editable */}
        <div style={{ background: "var(--bg-card)", border: "1px solid var(--border-strong)", borderRadius: 4, padding: "20px" }}>
          <CardHeader icon={Sliders} title="System Policies" />
          <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
            <div style={{ marginBottom: 18 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                <label style={{ fontSize: 13, fontWeight: 500, color: "var(--t1)" }}>Citation Threshold</label>
                <span style={{ fontSize: 11, fontWeight: 500, color: "var(--brand-text)" }}>{citationThreshold}%</span>
              </div>
              <p style={{ fontSize: 11, color: "var(--t4)", marginBottom: 8, lineHeight: 1.5 }}>LLM refuses to answer if RAG evidence confidence is below this level.</p>
              <input type="range" value={citationThreshold} min="50" max="100" onChange={e => setCitationThreshold(Number(e.target.value))} style={{ width: "100%", accentColor: "var(--brand)" }} />
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderTop: "1px solid var(--border)", paddingTop: 16, marginBottom: 16, gap: 16 }}>
              <div>
                <span style={{ display: "block", fontSize: 13, fontWeight: 500, color: "var(--t1)", marginBottom: 2 }}>Human-in-the-Loop (HITL)</span>
                <span style={{ fontSize: 11, color: "var(--t4)", lineHeight: 1.5 }}>Require explicit approval before executing side-effects (e.g. sending emails).</span>
              </div>
              <Toggle on={hitl} onClick={() => setHitl(p => !p)} />
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderTop: "1px solid var(--border)", paddingTop: 16, gap: 16 }}>
              <div>
                <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 500, color: "var(--t1)", marginBottom: 2 }}>
                  <ShieldAlert style={{ width: 13, height: 13, color: "var(--p-high-text)" }} />
                  Zero-Data Retention
                </span>
                <span style={{ fontSize: 11, color: "var(--t4)", lineHeight: 1.5 }}>Prompts are never used to train foundation models.</span>
              </div>
              <Toggle on={zeroData} onClick={() => setZeroData(p => !p)} />
            </div>
          </div>
        </div>
      </div>

      {/* Governance Policies — live from DB */}
      <div style={{ background: "var(--bg-card)", border: "1px solid var(--border-strong)", borderRadius: 4, padding: "20px" }}>
        <CardHeader icon={BrainCircuit} title={`Governance Policies${loading ? "" : ` (${policies.length})`}`}
          action={
            <span style={{ fontSize: 9, color: "var(--t5)" }}>
              {loading ? "Loading…" : policies.filter(p => p.enabled).length + " active"}
            </span>
          }
        />

        {loading ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {[1,2,3].map(i => (
              <div key={i} style={{ height: 52, borderRadius: 4, background: "rgba(31,27,22,0.04)", border: "1px solid var(--border)", position: "relative", overflow: "hidden" }}>
                <div style={{ position: "absolute", inset: 0, background: "linear-gradient(90deg, transparent 0%, rgba(31,27,22,0.05) 50%, transparent 100%)", animation: "shimmer-sweep 1.6s ease-in-out infinite" }} />
              </div>
            ))}
          </div>
        ) : policies.length === 0 ? (
          <div style={{ textAlign: "center", padding: "24px 0", color: "var(--t5)", fontSize: 11 }}>
            No governance policies configured. Use <code style={{ color: "var(--brand-text)", fontSize: 10 }}>POST /api/policies</code> to create one.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {policies.map(policy => {
              const es = effectSt(policy.effect);
              return (
                <div key={policy.id} onMouseEnter={() => setHPol(policy.id)} onMouseLeave={() => setHPol(null)}
                  style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, background: hPol === policy.id ? "rgba(31,27,22,0.045)" : "rgba(31,27,22,0.04)", border: `1px solid ${hPol === policy.id ? "var(--border-strong)" : "var(--border)"}`, borderRadius: 4, padding: "12px 14px", opacity: policy.enabled ? 1 : 0.45, transition: "all 80ms" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
                      <span style={{ fontSize: 12, fontWeight: 500, color: "var(--t1)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{policy.name}</span>
                      <span style={{ fontSize: 8, fontWeight: 500, color: es.color, background: es.bg, border: `1px solid ${es.border}`, padding: "1px 6px", borderRadius: 3, flexShrink: 0 }}>{policy.effect}</span>
                    </div>
                    <span style={{ fontSize: 10, color: "var(--t5)", display: "block" }}>
                      {policy.resource ?? "*"} · {policy.action ?? "*"} · {policy.roles?.join(", ") ?? "all roles"}
                    </span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                    <Toggle on={policy.enabled} onClick={() => togglePolicy(policy)} />
                    {hPol === policy.id && (
                      <button onClick={() => deletePolicy(policy.id)}
                        style={{ background: "none", border: "none", color: "var(--p-critical)", cursor: "pointer", padding: 4, borderRadius: 3, display: "flex", alignItems: "center" }}>
                        <Trash2 style={{ width: 12, height: 12 }} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default AIGovernance;
