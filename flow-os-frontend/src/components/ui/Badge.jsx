const VARIANTS = {
  flow:      { background: "rgba(232,103,43,0.10)", color: "rgba(232,103,43,0.90)", border: "1px solid rgba(232,103,43,0.20)" },
  critical:  { background: "rgba(255,87,87,0.08)",   color: "var(--p-critical-text)",  border: "1px solid rgba(255,87,87,0.20)" },
  warning:   { background: "rgba(255,151,65,0.08)",  color: "var(--p-high-text)",      border: "1px solid rgba(255,151,65,0.20)" },
  success:   { background: "rgba(76,175,130,0.08)",  color: "var(--p-normal-text)",    border: "1px solid rgba(76,175,130,0.20)" },
  info:      { background: "rgba(91,158,255,0.08)",  color: "var(--p-info-text)",      border: "1px solid rgba(91,158,255,0.20)" },
  secondary: { background: "rgba(31,27,22,0.06)", color: "var(--t3)",               border: "1px solid var(--border-strong)" },
};

export const Badge = ({ children, variant = "secondary", className = "" }) => {
  const v = VARIANTS[variant] || VARIANTS.secondary;
  return (
    <span
      className={className}
      style={{
        display:       "inline-flex",
        alignItems:    "center",
        padding:        "2px 7px",
        borderRadius:   4,
        fontSize:       10,
        fontWeight:     600,
        letterSpacing:  "0.06em",
        textTransform:  "uppercase",
        whiteSpace:     "nowrap",
        ...v,
      }}
    >
      {children}
    </span>
  );
};

export default Badge;
