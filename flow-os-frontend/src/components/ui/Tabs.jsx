import { useState } from "react";

export function Tabs({ tabs, activeTab, onTabChange, className = "" }) {
  return (
    <div
      className={className}
      style={{ display: "flex", borderBottom: "1px solid var(--border)", gap: 0 }}
    >
      {tabs.map(tab => {
        const label = typeof tab === "string" ? tab : tab.label;
        const count = typeof tab === "object" ? tab.count : undefined;
        const isActive = activeTab === label;
        return (
          <button
            key={label}
            onClick={() => onTabChange(label)}
            style={{
              padding:       "8px 14px",
              fontSize:       13,
              fontWeight:     isActive ? 500 : 400,
              color:          isActive ? "var(--t1)" : "var(--t4)",
              borderBottom:   `2px solid ${isActive ? "var(--brand)" : "transparent"}`,
              background:     "none",
              border:         "none",
              borderBottom:   `2px solid ${isActive ? "var(--brand)" : "transparent"}`,
              cursor:         "pointer",
              display:        "flex",
              alignItems:     "center",
              gap:             6,
              transition:     "color 100ms",
              whiteSpace:     "nowrap",
              userSelect:     "none",
            }}
            onMouseEnter={e => { if (!isActive) e.currentTarget.style.color = "var(--t2)"; }}
            onMouseLeave={e => { if (!isActive) e.currentTarget.style.color = "var(--t4)"; }}
          >
            {label}
            {count !== undefined && count > 0 && (
              <span style={{
                fontSize:       10,
                fontWeight:     600,
                background:    "rgba(232,103,43,0.12)",
                color:         "var(--brand-text)",
                padding:        "1px 6px",
                borderRadius:   4,
                fontVariantNumeric: "tabular-nums",
              }}>
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export default Tabs;
