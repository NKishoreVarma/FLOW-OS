import { FileText, Clock, ShieldCheck } from "lucide-react";

export const DecisionCard = ({ decision, evidence, time, confidence = "High" }) => {
  return (
    <div style={{ border: "1px solid rgba(232,103,43,0.28)", borderRadius: 4, padding: "14px", background: "rgba(232,103,43,0.05)", position: "relative", overflow: "hidden" }}>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--brand-text)" }}>
          <FileText style={{ width: 13, height: 13 }} />
          <span style={{ fontSize: 9, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.08em" }}>Decision Logged</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 10, color: "var(--t5)", display: "flex", alignItems: "center", gap: 4 }}>
            <Clock style={{ width: 10, height: 10 }} /> {time}
          </span>
          <span style={{ fontSize: 9, fontWeight: 500, display: "flex", alignItems: "center", gap: 3, background: "rgba(76,175,130,0.08)", border: "1px solid rgba(76,175,130,0.22)", color: "var(--p-normal)", padding: "2px 6px", borderRadius: 3 }}>
            <ShieldCheck style={{ width: 10, height: 10 }} /> {confidence}
          </span>
        </div>
      </div>

      <p style={{ fontSize: 13, fontWeight: 500, color: "var(--t1)", lineHeight: 1.35, marginBottom: 10 }}>{decision}</p>

      <div style={{ background: "rgba(31,27,22,0.04)", border: "1px solid var(--border)", borderRadius: 4, padding: "8px 10px" }}>
        <span style={{ display: "block", fontSize: 8, fontWeight: 500, color: "var(--t5)", textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 4 }}>
          Transcript Evidence
        </span>
        <p style={{ fontSize: 11, color: "var(--t3)", fontStyle: "italic" }}>"{evidence}"</p>
      </div>
    </div>
  );
};

export default DecisionCard;
