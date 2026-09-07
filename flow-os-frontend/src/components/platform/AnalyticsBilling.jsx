import { DollarSign, Cpu, HardDrive, DownloadCloud } from "lucide-react";

const STATS = [
  { label: "Current Month Total",   value: "$4,250", color: "var(--t1)",           borderColor: "rgba(31,27,22,0.08)" },
  { label: "AI Inference (Tokens)", value: "$1,840", color: "var(--brand-text)",   borderColor: "rgba(232,103,43,0.40)" },
  { label: "Vector DB Storage",     value: "$850",   color: "var(--p-info-text)",  borderColor: "rgba(96,165,250,0.40)"  },
  { label: "Active Seats (1,250)",  value: "$1,560", color: "var(--p-normal-text)", borderColor: "rgba(76,175,130,0.40)" },
];

const UsageBar = ({ label, used, total, pct, color }) => (
  <div style={{ marginBottom: 14 }}>
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, fontWeight: 500, marginBottom: 5 }}>
      <span style={{ color: "var(--t1)" }}>{label}</span>
      <span style={{ color: "var(--t4)", fontSize: 11 }}>{used} / {total}</span>
    </div>
    <div style={{ width: "100%", height: 5, borderRadius: 3, background: "rgba(31,27,22,0.06)", overflow: "hidden" }}>
      <div style={{ height: "100%", borderRadius: 3, background: color, width: `${pct}%` }} />
    </div>
  </div>
);

const Card = ({ children, style }) => (
  <div style={{ background: "var(--bg-card)", border: "1px solid var(--border-strong)", borderRadius: 4, padding: "20px", ...style }}>
    {children}
  </div>
);

const CardHead = ({ icon: Icon, title, badge }) => (
  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid var(--border)", paddingBottom: 10, marginBottom: 16 }}>
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <Icon style={{ width: 14, height: 14, color: "var(--brand)" }} />
      <h2 style={{ fontSize: 9, fontWeight: 500, color: "var(--t1)", textTransform: "uppercase", letterSpacing: "0.10em" }}>{title}</h2>
    </div>
    {badge && <span style={{ fontSize: 9, fontWeight: 500, color: "var(--t5)", background: "rgba(31,27,22,0.045)", border: "1px solid var(--border)", padding: "2px 7px", borderRadius: 3 }}>{badge}</span>}
  </div>
);

const AnalyticsBilling = () => {
  return (
    <div style={{ padding: "24px", display: "flex", flexDirection: "column", gap: 24 }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 500, color: "var(--t1)", letterSpacing: "-0.4px", display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
            <DollarSign style={{ width: 22, height: 22, color: "var(--brand)" }} />
            Billing & Usage
          </h1>
          <p style={{ fontSize: 12, color: "var(--t4)", maxWidth: 520 }}>
            Track API consumption, AI inference tokens, storage costs, and enterprise licensing.
          </p>
        </div>
        <button style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--t3)", background: "rgba(31,27,22,0.05)", border: "1px solid var(--border)", borderRadius: 4, padding: "6px 12px", cursor: "pointer", flexShrink: 0 }}>
          <DownloadCloud style={{ width: 13, height: 13 }} /> Download Invoice
        </button>
      </div>

      {/* Stat cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
        {STATS.map(({ label, value, color, borderColor }) => (
          <div key={label} style={{ background: "var(--bg-card)", border: "1px solid var(--border-strong)", borderBottom: `2px solid ${borderColor}`, borderRadius: 4, padding: "16px 18px", display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 26, fontWeight: 500, color, lineHeight: 1 }}>{value}</span>
            <span style={{ fontSize: 9, fontWeight: 500, color: "var(--t5)", textTransform: "uppercase", letterSpacing: "0.10em" }}>{label}</span>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <Card>
          <CardHead icon={Cpu} title="AI Token Usage (Millions)" badge="This Month" />
          <div style={{ paddingTop: 4 }}>
            <UsageBar label="Gemini 2.5 Flash" used="42.5M" total="100M Quota" pct={42.5} color="var(--brand)" />
            <UsageBar label="Gemini Embedding 2" used="8.2M" total="Unlimited" pct={8.2} color="var(--p-info)" />
          </div>
        </Card>

        <Card>
          <CardHead icon={HardDrive} title="Storage Usage" />
          <div style={{ paddingTop: 4 }}>
            <UsageBar label="pgvector Database" used="400 GB" total="1 TB" pct={40} color="var(--p-normal)" />
            <UsageBar label="File Artifacts (S3)" used="1.2 TB" total="5 TB" pct={24} color="var(--p-normal)" />
          </div>
        </Card>
      </div>
    </div>
  );
};

export default AnalyticsBilling;
