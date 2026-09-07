const STYLES = {
  CRITICAL: { background: "rgba(255,87,87,0.08)",  color: "var(--p-critical-text)", border: "1px solid rgba(255,87,87,0.20)" },
  HIGH:     { background: "rgba(255,151,65,0.08)", color: "var(--p-high-text)",     border: "1px solid rgba(255,151,65,0.20)" },
  MEDIUM:   { background: "rgba(91,158,255,0.08)", color: "var(--p-info-text)",     border: "1px solid rgba(91,158,255,0.20)" },
  LOW:      { background: "rgba(76,175,130,0.08)", color: "var(--p-normal-text)",   border: "1px solid rgba(76,175,130,0.20)" },
  INFO:     { background: "rgba(76,175,130,0.08)", color: "var(--p-normal-text)",   border: "1px solid rgba(76,175,130,0.20)" },
};

const MAP = { P0: "CRITICAL", P1: "HIGH", P2: "MEDIUM", P3: "LOW" };

export const PriorityPill = ({ priority = "INFO", className = "" }) => {
  const p = MAP[String(priority).toUpperCase()] || String(priority).toUpperCase();
  const s = STYLES[p] || STYLES.LOW;
  return (
    <span
      className={className}
      style={{
        display:       "inline-flex",
        alignItems:    "center",
        padding:        "2px 6px",
        borderRadius:   4,
        fontSize:       10,
        fontWeight:     600,
        letterSpacing:  "0.06em",
        textTransform:  "uppercase",
        whiteSpace:     "nowrap",
        ...s,
      }}
    >
      {p}
    </span>
  );
};

export default PriorityPill;
