import { useState } from "react";

const VARIANTS = {
  primary: {
    base:  { background: "var(--brand)", color: "#fff", border: "1px solid rgba(232,103,43,0.40)" },
    hover: { background: "#8C7EFF" },
  },
  secondary: {
    base:  { background: "rgba(31,27,22,0.05)", color: "var(--t2)", border: "1px solid var(--border-strong)" },
    hover: { background: "rgba(31,27,22,0.07)", color: "var(--t1)" },
  },
  ghost: {
    base:  { background: "transparent", color: "var(--t3)", border: "1px solid transparent" },
    hover: { background: "rgba(31,27,22,0.05)", color: "var(--t2)" },
  },
  danger: {
    base:  { background: "rgba(255,87,87,0.08)", color: "var(--p-critical)", border: "1px solid rgba(255,87,87,0.20)" },
    hover: { background: "rgba(255,87,87,0.14)" },
  },
};

const SIZES = {
  sm: { padding: "4px 11px",  fontSize: 12, borderRadius: 4, height: 28 },
  md: { padding: "6px 14px",  fontSize: 13, borderRadius: 4, height: 32 },
  lg: { padding: "8px 18px",  fontSize: 14, borderRadius: 5, height: 38 },
};

export const Button = ({
  children, onClick, variant = "primary", size = "md",
  type = "button", disabled = false, loading = false, className = "", ...props
}) => {
  const [h, setH] = useState(false);
  const v = VARIANTS[variant] || VARIANTS.primary;
  const s = SIZES[size] || SIZES.md;

  const style = {
    display:        "inline-flex",
    alignItems:     "center",
    justifyContent: "center",
    gap:             6,
    fontFamily:     "'Instrument Sans', -apple-system, sans-serif",
    fontWeight:      500,
    letterSpacing:  "-0.1px",
    cursor:          disabled || loading ? "not-allowed" : "pointer",
    opacity:         disabled ? 0.45 : 1,
    outline:         "none",
    userSelect:      "none",
    transition:      "background 100ms, color 100ms, border-color 100ms",
    whiteSpace:      "nowrap",
    ...s,
    ...v.base,
    ...(h && !disabled && !loading ? v.hover : {}),
  };

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      style={style}
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      className={className}
      {...props}
    >
      {loading && (
        <span style={{
          width: 12, height: 12,
          borderRadius: "50%",
          border: "1.5px solid currentColor",
          borderTopColor: "transparent",
          animation: "spin 0.7s linear infinite",
          flexShrink: 0,
        }} />
      )}
      {children}
    </button>
  );
};

export default Button;
