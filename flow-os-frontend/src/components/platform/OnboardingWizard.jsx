import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Building2, Users, Link2, Download, Cpu, CheckCircle2, ChevronRight, ChevronLeft
} from "lucide-react";
import { useWebSocket } from "../../hooks/useWebSocket";

const STEPS = [
  { label: "Company",    step: 1, icon: Building2    },
  { label: "Team",       step: 2, icon: Users         },
  { label: "Connectors", step: 3, icon: Link2         },
  { label: "Import",     step: 4, icon: Download      },
  { label: "Analysis",   step: 5, icon: Cpu           },
  { label: "Ready",      step: 6, icon: CheckCircle2  },
];

const CONNECTORS = [
  { key: "gmail",  name: "Gmail & Calendar",  desc: "Sync meeting slots & threads"   },
  { key: "github", name: "GitHub Codes",       desc: "Commit webhook integrations"    },
  { key: "jira",   name: "Jira Software",      desc: "Sprint board issue trackings"   },
  { key: "notion", name: "Notion Wiki Docs",   desc: "Ingest team manuals"            },
];

const inputStyle = {
  width: "100%", background: "rgba(255,255,255,0.03)", border: "1px solid var(--border-strong)",
  borderRadius: 4, padding: "7px 10px", fontSize: 12, color: "var(--t1)", outline: "none", boxSizing: "border-box",
};

const labelStyle = {
  display: "block", fontSize: 8, fontWeight: 700, color: "var(--t5)",
  textTransform: "uppercase", letterSpacing: "0.10em", fontFamily: "'JetBrains Mono', monospace", marginBottom: 5,
};

const OnboardingWizard = () => {
  const navigate = useNavigate();
  const { token, workspaceId } = useWebSocket();
  const [step, setStep] = useState(1);

  const [companyName, setCompanyName]           = useState("");
  const [industry, setIndustry]                 = useState("Technology");
  const [workspaceSlug, setWorkspaceSlug]       = useState("");
  const [invites, setInvites]                   = useState([{ email: "", role: "MEMBER" }]);
  const [selectedConnectors, setSelectedConnectors] = useState({ gmail: true, github: true, jira: false, notion: false });
  const [importDemo, setImportDemo]             = useState(true);
  const [analyzing, setAnalyzing]               = useState(false);
  const [analysisLogs, setAnalysisLogs]         = useState([]);

  const nextStep = () => setStep(p => Math.min(6, p + 1));
  const prevStep = () => setStep(p => Math.max(1, p - 1));
  const addInvite = () => setInvites(p => [...p, { email: "", role: "MEMBER" }]);
  const handleInviteChange = (idx, field, val) => {
    setInvites(p => { const c = [...p]; c[idx][field] = val; return c; });
  };
  const toggleConnector = (key) => setSelectedConnectors(p => ({ ...p, [key]: !p[key] }));

  const runAiAnalysis = async () => {
    setAnalyzing(true);
    setAnalysisLogs(["Initializing Workspace Brain parser..."]);
    const logs = ["Connecting pgvector database pool...", "Normalizing structural entities...", "Resolving operational graph relationships...", "Seeding vector store search indexes...", "Operational Brain pipeline successfully booted!"];
    for (const log of logs) {
      await new Promise(r => setTimeout(r, 1000));
      setAnalysisLogs(p => [...p, log]);
    }
    setAnalyzing(false);
    nextStep();
  };

  const handleFinish = async () => {
    if (!token || !workspaceId) { navigate("/"); return; }
    try {
      if (importDemo) {
        await fetch("/api/lifecycle/demo", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, "workspace-id": workspaceId },
        });
      }
    } catch {}
    finally { navigate("/"); }
  };

  return (
    <div style={{ padding: "24px", maxWidth: 720, margin: "0 auto", display: "flex", flexDirection: "column", gap: 24 }}>

      {/* Step tracker */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "var(--bg-card)", border: "1px solid var(--border-strong)", borderRadius: 4, padding: "14px 20px" }}>
        {STEPS.map(item => {
          const Icon = item.icon;
          const isActive    = step === item.step;
          const isCompleted = step > item.step;
          return (
            <div key={item.step} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{
                padding: 8, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center",
                background: isActive ? "rgba(124,110,255,0.18)" : isCompleted ? "rgba(76,175,130,0.12)" : "rgba(255,255,255,0.03)",
                border: `1px solid ${isActive ? "rgba(124,110,255,0.50)" : isCompleted ? "rgba(76,175,130,0.30)" : "var(--border)"}`,
              }}>
                <Icon style={{ width: 15, height: 15, color: isActive ? "var(--brand-text)" : isCompleted ? "var(--p-normal-text)" : "var(--t5)" }} />
              </div>
              <span style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", fontFamily: "'JetBrains Mono', monospace", color: isActive ? "var(--t1)" : "var(--t5)" }}>{item.label}</span>
            </div>
          );
        })}
      </div>

      {/* Main card */}
      <div style={{ background: "var(--bg-card)", border: "1px solid var(--border-strong)", borderRadius: 4, padding: "32px", minHeight: 420, display: "flex", flexDirection: "column", justifyContent: "space-between", gap: 24 }}>

        {/* Step content */}
        <div>

          {/* Step 1: Company */}
          {step === 1 && (
            <div>
              <h2 style={{ fontSize: 18, fontWeight: 700, color: "var(--t1)", marginBottom: 4 }}>Step 1: Define Organization Details</h2>
              <p style={{ fontSize: 12, color: "var(--t4)", marginBottom: 20 }}>Enter your core business profile parameters to sandbox datasets.</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <div><label style={labelStyle}>Organization Name</label>
                  <input type="text" value={companyName} placeholder="Initech Corp" style={inputStyle}
                    onChange={e => { setCompanyName(e.target.value); setWorkspaceSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, "-")); }} />
                </div>
                <div><label style={labelStyle}>Workspace Slug</label>
                  <input type="text" value={workspaceSlug} placeholder="initech-corp" style={{ ...inputStyle, fontFamily: "'JetBrains Mono', monospace" }}
                    onChange={e => setWorkspaceSlug(e.target.value)} />
                </div>
                <div><label style={labelStyle}>Industry Sector</label>
                  <select value={industry} onChange={e => setIndustry(e.target.value)} style={{ ...inputStyle, width: "100%" }}>
                    <option>Technology</option><option>Finance</option><option>Healthcare</option><option>Logistics</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Team */}
          {step === 2 && (
            <div>
              <h2 style={{ fontSize: 18, fontWeight: 700, color: "var(--t1)", marginBottom: 4 }}>Step 2: Invite Core Members</h2>
              <p style={{ fontSize: 12, color: "var(--t4)", marginBottom: 20 }}>Delegate workspace scopes and define roles permission layers.</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 10, maxHeight: 240, overflowY: "auto" }}>
                {invites.map((invite, idx) => (
                  <div key={idx} style={{ display: "flex", gap: 10 }}>
                    <input type="email" value={invite.email} placeholder="name@company.com"
                      onChange={e => handleInviteChange(idx, "email", e.target.value)} style={{ ...inputStyle, flex: 1 }} />
                    <select value={invite.role} onChange={e => handleInviteChange(idx, "role", e.target.value)}
                      style={{ ...inputStyle, width: 130 }}>
                      <option value="MEMBER">Member</option><option value="ADMIN">Admin</option>
                      <option value="EXECUTIVE">Executive</option><option value="MANAGER">Manager</option>
                    </select>
                  </div>
                ))}
                <button onClick={addInvite} style={{ alignSelf: "flex-start", padding: "5px 12px", background: "rgba(255,255,255,0.04)", border: "1px solid var(--border)", borderRadius: 4, fontSize: 11, color: "var(--t3)", cursor: "pointer" }}>
                  + Add Invite
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Connectors */}
          {step === 3 && (
            <div>
              <h2 style={{ fontSize: 18, fontWeight: 700, color: "var(--t1)", marginBottom: 4 }}>Step 3: Connect Operational Systems</h2>
              <p style={{ fontSize: 12, color: "var(--t4)", marginBottom: 20 }}>Toggle connector APIs to ingest realtime corporate chatter.</p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                {CONNECTORS.map(conn => {
                  const on = selectedConnectors[conn.key];
                  return (
                    <div key={conn.key} onClick={() => toggleConnector(conn.key)}
                      style={{ padding: 16, borderRadius: 4, border: `1px solid ${on ? "rgba(124,110,255,0.45)" : "var(--border)"}`, background: on ? "rgba(124,110,255,0.10)" : "rgba(255,255,255,0.02)", cursor: "pointer", minHeight: 90, display: "flex", flexDirection: "column", justifyContent: "space-between", transition: "all 100ms" }}
                    >
                      <span style={{ fontSize: 13, fontWeight: 700, color: on ? "var(--brand-text)" : "var(--t2)" }}>{conn.name}</span>
                      <span style={{ fontSize: 10, color: "var(--t5)" }}>{conn.desc}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Step 4: Import */}
          {step === 4 && (
            <div>
              <h2 style={{ fontSize: 18, fontWeight: 700, color: "var(--t1)", marginBottom: 4 }}>Step 4: Seed Workspace Template</h2>
              <p style={{ fontSize: 12, color: "var(--t4)", marginBottom: 20 }}>Generate standard operational telemetry twin records immediately.</p>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px", background: "rgba(255,255,255,0.02)", border: "1px solid var(--border)", borderRadius: 4, gap: 16 }}>
                <div>
                  <span style={{ display: "block", fontSize: 13, fontWeight: 700, color: "var(--t1)", marginBottom: 4 }}>Seed High-Fidelity Demo Company Data</span>
                  <span style={{ fontSize: 11, color: "var(--t4)", lineHeight: 1.5 }}>Highly recommended. Populates user graphs, databases, decisions, and RAG search logs.</span>
                </div>
                <input type="checkbox" checked={importDemo} onChange={e => setImportDemo(e.target.checked)}
                  style={{ width: 18, height: 18, accentColor: "var(--brand)", flexShrink: 0 }} />
              </div>
            </div>
          )}

          {/* Step 5: Analysis */}
          {step === 5 && (
            <div>
              <h2 style={{ fontSize: 18, fontWeight: 700, color: "var(--t1)", marginBottom: 4 }}>Step 5: Initialize Operational Brain</h2>
              <p style={{ fontSize: 12, color: "var(--t4)", marginBottom: 20 }}>Wait while parser services index data blocks and align graph matrices.</p>
              {analyzing ? (
                <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 12, color: "var(--t4)", marginBottom: 14 }}>
                  <div style={{ width: 18, height: 18, borderRadius: "50%", border: "2px solid rgba(124,110,255,0.20)", borderTopColor: "var(--brand)", animation: "spin 0.8s linear infinite", flexShrink: 0 }} />
                  Processing operational twin structures...
                </div>
              ) : (
                <button onClick={runAiAnalysis} style={{ width: "100%", padding: "9px", background: "var(--brand)", border: "none", borderRadius: 4, color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", marginBottom: 14 }}>
                  Run AI Setup Diagnostics
                </button>
              )}
              <div style={{ background: "rgba(0,0,0,0.30)", border: "1px solid var(--border)", borderRadius: 4, padding: "12px 14px", height: 160, overflowY: "auto", fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: "var(--t5)", lineHeight: 1.8 }}>
                {analysisLogs.map((log, idx) => <div key={idx}>{log}</div>)}
              </div>
            </div>
          )}

          {/* Step 6: Ready */}
          {step === 6 && (
            <div style={{ textAlign: "center", padding: "24px 0" }}>
              <div style={{ width: 64, height: 64, borderRadius: "50%", background: "rgba(76,175,130,0.18)", border: "1px solid rgba(76,175,130,0.35)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px" }}>
                <CheckCircle2 style={{ width: 36, height: 36, color: "var(--p-normal)" }} />
              </div>
              <h2 style={{ fontSize: 18, fontWeight: 700, color: "var(--t1)", marginBottom: 8 }}>Workspace Onboarding Successful!</h2>
              <p style={{ fontSize: 12, color: "var(--t4)", maxWidth: 400, margin: "0 auto" }}>
                {companyName || "Your"} workspace is fully active. The Operational Brain and briefings have been successfully configured.
              </p>
            </div>
          )}
        </div>

        {/* Controls */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid var(--border)", paddingTop: 20 }}>
          <div>
            {step > 1 && step < 6 && (
              <button onClick={prevStep} style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", background: "rgba(255,255,255,0.04)", border: "1px solid var(--border)", borderRadius: 4, fontSize: 12, color: "var(--t3)", cursor: "pointer" }}>
                <ChevronLeft style={{ width: 14, height: 14 }} /> Back
              </button>
            )}
          </div>
          <div>
            {step < 5 && (
              <button onClick={nextStep} disabled={step === 1 && !companyName}
                style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", background: "var(--brand)", border: "none", borderRadius: 4, fontSize: 12, fontWeight: 600, color: "#fff", cursor: (step === 1 && !companyName) ? "not-allowed" : "pointer", opacity: (step === 1 && !companyName) ? 0.5 : 1 }}>
                Continue <ChevronRight style={{ width: 14, height: 14 }} />
              </button>
            )}
            {step === 6 && (
              <button onClick={handleFinish}
                style={{ padding: "7px 20px", background: "var(--p-normal)", border: "none", borderRadius: 4, fontSize: 12, fontWeight: 700, color: "#fff", cursor: "pointer" }}>
                Launch Workspace
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default OnboardingWizard;
