const SOURCE = {
  slack:    { color: "var(--p-high)",    label: "Slack" },
  gmail:    { color: "var(--p-critical)", label: "Gmail" },
  github:   { color: "var(--brand)",     label: "GitHub" },
  jira:     { color: "var(--p-info)",    label: "Jira" },
  notion:   { color: "var(--t3)",        label: "Notion" },
  calendar: { color: "var(--p-normal)",  label: "Calendar" },
  vault:    { color: "var(--brand)",     label: "Vault" },
  default:  { color: "var(--t4)",        label: "System" },
};

export default function SourceBadge({ source }) {
  const cfg = SOURCE[String(source || "").toLowerCase()] || SOURCE.default;
  return (
    <span style={{
      display:       "inline-flex",
      alignItems:    "center",
      padding:        "2px 7px",
      borderRadius:   4,
      fontSize:       10,
      fontWeight:     600,
      letterSpacing:  "0.06em",
      textTransform:  "uppercase",
      color:          cfg.color,
      background:    `color-mix(in srgb, ${cfg.color} 10%, transparent)`,
      border:        `1px solid color-mix(in srgb, ${cfg.color} 25%, transparent)`,
    }}>
      {cfg.label}
    </span>
  );
}
