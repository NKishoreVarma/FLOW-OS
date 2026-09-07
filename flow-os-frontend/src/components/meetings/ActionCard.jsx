import { useState } from "react";
import { CheckSquare, Clock, User, Check, X } from "lucide-react";

export const ActionCard = ({ action, owner, deadline, evidence, time, onApprove, onReject }) => {
  const [hApprove, setHApprove] = useState(false);
  const [hReject, setHReject] = useState(false);

  return (
    <div style={{ border: "1px solid rgba(255,151,65,0.28)", borderRadius: 4, padding: "14px", background: "rgba(255,151,65,0.05)", position: "relative", overflow: "hidden" }}>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--p-high)" }}>
          <CheckSquare style={{ width: 13, height: 13 }} />
          <span style={{ fontSize: 9, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.08em" }}>Action Detected</span>
        </div>
        <span style={{ fontSize: 10, color: "var(--t5)", display: "flex", alignItems: "center", gap: 4 }}>
          <Clock style={{ width: 10, height: 10 }} /> {time}
        </span>
      </div>

      <p style={{ fontSize: 13, fontWeight: 500, color: "var(--t1)", lineHeight: 1.35, marginBottom: 8 }}>{action}</p>

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "var(--t3)", background: "rgba(31,27,22,0.05)", border: "1px solid var(--border)", padding: "3px 8px", borderRadius: 3 }}>
          <User style={{ width: 10, height: 10, color: "var(--t5)" }} />
          Owner: {owner}
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "var(--t3)", background: "rgba(31,27,22,0.05)", border: "1px solid var(--border)", padding: "3px 8px", borderRadius: 3 }}>
          <Clock style={{ width: 10, height: 10, color: "var(--t5)" }} />
          Due: {deadline}
        </span>
      </div>

      <div style={{ background: "rgba(31,27,22,0.04)", border: "1px solid var(--border)", borderRadius: 4, padding: "8px 10px", marginBottom: 12 }}>
        <span style={{ display: "block", fontSize: 8, fontWeight: 500, color: "var(--t5)", textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 4 }}>
          Transcript Evidence
        </span>
        <p style={{ fontSize: 11, color: "var(--t3)", fontStyle: "italic" }}>"{evidence}"</p>
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8, paddingTop: 8, borderTop: "1px solid var(--border)" }}>
        <button
          onClick={onReject}
          onMouseEnter={() => setHReject(true)}
          onMouseLeave={() => setHReject(false)}
          style={{ display: "flex", alignItems: "center", gap: 4, padding: "5px 12px", borderRadius: 3, background: "transparent", border: `1px solid ${hReject ? "rgba(255,87,87,0.30)" : "var(--border)"}`, color: hReject ? "var(--p-critical-text)" : "var(--t4)", fontSize: 11, fontWeight: 500, cursor: "pointer", transition: "all 100ms" }}
        >
          <X style={{ width: 11, height: 11 }} /> Dismiss
        </button>
        <button
          onClick={onApprove}
          onMouseEnter={() => setHApprove(true)}
          onMouseLeave={() => setHApprove(false)}
          style={{ display: "flex", alignItems: "center", gap: 4, padding: "5px 12px", borderRadius: 3, background: hApprove ? "rgba(232,103,43,0.14)" : "rgba(232,103,43,0.08)", border: "1px solid rgba(232,103,43,0.30)", color: "var(--brand-text)", fontSize: 11, fontWeight: 500, cursor: "pointer", transition: "all 100ms" }}
        >
          <Check style={{ width: 11, height: 11 }} /> Sync to Tracker
        </button>
      </div>
    </div>
  );
};

export default ActionCard;
