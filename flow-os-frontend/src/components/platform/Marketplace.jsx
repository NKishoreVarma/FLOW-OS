import { useState } from "react";
import { Package, Download, CheckCircle2, Search, Settings } from "lucide-react";

const TABS = ["Installed", "Agent Packs", "Workflows", "Internal Blueprints"];

const PLUGINS = [
  {
    badge: "Agent Pack",
    installed: true,
    name: "DevOps Incident Resolver",
    desc: "Autonomously investigates PagerDuty alerts, parses DataDog logs, and suggests rollback commands.",
  },
  {
    badge: "Internal Blueprint",
    installed: true,
    name: "Acme SOC2 Approval Flow",
    desc: "Custom workflow ensuring all DB migrations receive Security Board approval before execution.",
  },
  {
    badge: "Workflow",
    installed: false,
    name: "Jira Auto-Triager",
    desc: "Automatically assigns components and labels to new Jira tickets based on historical patterns.",
  },
];

const Marketplace = () => {
  const [activeTab, setActiveTab] = useState("Installed");
  const [hCard, setHCard]         = useState(null);
  const [hBtn, setHBtn]           = useState(null);

  return (
    <div style={{ padding: "24px", display: "flex", flexDirection: "column", gap: 24 }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 500, color: "var(--t1)", letterSpacing: "-0.4px", display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
            <Package style={{ width: 22, height: 22, color: "var(--brand)" }} />
            Marketplace & Extensions
          </h1>
          <p style={{ fontSize: 12, color: "var(--t4)", maxWidth: 520 }}>
            Extend FLOW OS with custom Agent Packs, Approval Workflows, and Internal Plugins.
          </p>
        </div>
        <div style={{ position: "relative", flexShrink: 0 }}>
          <Search style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", width: 13, height: 13, color: "var(--t5)" }} />
          <input
            type="text"
            placeholder="Search extensions..."
            style={{ width: 220, background: "var(--bg-card)", border: "1px solid var(--border-strong)", borderRadius: 4, paddingLeft: 32, paddingRight: 12, paddingTop: 7, paddingBottom: 7, fontSize: 12, color: "var(--t1)", outline: "none" }}
          />
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 6, borderBottom: "1px solid var(--border)", paddingBottom: 10 }}>
        {TABS.map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{ padding: "4px 14px", borderRadius: 10, fontSize: 11, fontWeight: 500, cursor: "pointer", transition: "all 80ms",
              background: activeTab === tab ? "rgba(232,103,43,0.10)" : "transparent",
              border:     activeTab === tab ? "1px solid rgba(232,103,43,0.30)" : "1px solid transparent",
              color:      activeTab === tab ? "var(--brand-text)" : "var(--t4)",
            }}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Plugin cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
        {PLUGINS.map((p, i) => (
          <div
            key={i}
            onMouseEnter={() => setHCard(i)}
            onMouseLeave={() => setHCard(null)}
            style={{ background: hCard === i ? "var(--bg-hover)" : "var(--bg-card)", border: `1px solid ${p.installed ? "var(--border-strong)" : "var(--border)"}`, borderRadius: 4, padding: "18px", display: "flex", flexDirection: "column", justifyContent: "space-between", gap: 14, transition: "background 80ms", borderStyle: p.installed ? "solid" : "dashed" }}
          >
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <span style={{ fontSize: 9, fontWeight: 500, color: "var(--t5)", background: "rgba(31,27,22,0.045)", border: "1px solid var(--border)", padding: "2px 7px", borderRadius: 3, textTransform: "uppercase", letterSpacing: "0.08em" }}>{p.badge}</span>
                {p.installed && (
                  <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 9, fontWeight: 500, color: "var(--p-normal-text)", textTransform: "uppercase" }}>
                    <CheckCircle2 style={{ width: 11, height: 11 }} /> Installed
                  </span>
                )}
              </div>
              <h3 style={{ fontSize: 14, fontWeight: 500, color: "var(--t1)", marginBottom: 6 }}>{p.name}</h3>
              <p style={{ fontSize: 11, color: "var(--t4)", lineHeight: 1.5 }}>{p.desc}</p>
            </div>
            <div style={{ borderTop: "1px solid var(--border)", paddingTop: 12 }}>
              {p.installed ? (
                <button
                  onMouseEnter={() => setHBtn(`cfg-${i}`)}
                  onMouseLeave={() => setHBtn(null)}
                  style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "6px 10px", background: hBtn === `cfg-${i}` ? "var(--bg-hover)" : "rgba(31,27,22,0.05)", border: "1px solid var(--border)", borderRadius: 4, fontSize: 11, color: "var(--t2)", cursor: "pointer" }}
                >
                  <Settings style={{ width: 12, height: 12 }} /> Configure
                </button>
              ) : (
                <button
                  onMouseEnter={() => setHBtn(`inst-${i}`)}
                  onMouseLeave={() => setHBtn(null)}
                  style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "6px 10px", background: hBtn === `inst-${i}` ? "rgba(232,103,43,0.18)" : "var(--brand)", border: "none", borderRadius: 4, fontSize: 11, fontWeight: 500, color: "#fff", cursor: "pointer" }}
                >
                  <Download style={{ width: 12, height: 12 }} /> Install Extension
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Marketplace;
