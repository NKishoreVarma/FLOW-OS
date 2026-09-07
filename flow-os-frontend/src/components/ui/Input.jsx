import { useState } from "react";

export const Input = ({
  type = "text", value, onChange, placeholder,
  disabled = false, className = "", prefix, suffix, ...props
}) => {
  const [focused, setFocused] = useState(false);
  return (
    <div style={{ position: "relative", display: "flex", alignItems: "center", width: "100%" }}>
      {prefix && (
        <span style={{ position: "absolute", left: 10, color: "var(--t4)", pointerEvents: "none", display: "flex" }}>
          {prefix}
        </span>
      )}
      <input
        type={type}
        value={value}
        onChange={onChange}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder={placeholder}
        disabled={disabled}
        className={className}
        style={{
          width:        "100%",
          background:   focused ? "rgba(232,103,43,0.04)" : "var(--bg-card)",
          border:       `1px solid ${focused ? "rgba(232,103,43,0.40)" : "var(--border-strong)"}`,
          borderRadius:  4,
          padding:       prefix ? "8px 12px 8px 32px" : suffix ? "8px 32px 8px 12px" : "8px 12px",
          fontSize:      13,
          fontWeight:    400,
          color:        "var(--t1)",
          outline:      "none",
          transition:   "border-color 150ms, background 150ms",
          opacity:       disabled ? 0.45 : 1,
          cursor:        disabled ? "not-allowed" : "text",
        }}
        {...props}
      />
      {suffix && (
        <span style={{ position: "absolute", right: 10, color: "var(--t4)", pointerEvents: "none", display: "flex" }}>
          {suffix}
        </span>
      )}
      <style>{`input::placeholder { color: var(--t5); }`}</style>
    </div>
  );
};

export default Input;
